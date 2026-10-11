// The agent's tools. Each one is a closure over the signed-in user's id and the
// event id (from the session and the chat route), so the model can never pick
// whose data to read or write. Outputs match shared/contract.ts (toolOutputs).
// No tool sends, accepts, claims, blocks or changes roles: drafts only.
import { tool } from "ai";
import { z } from "zod";
import {
  askWithOptions,
  DraftCard,
  Experience,
  HackGoal,
  Handle,
  HelpRequestCard,
  HelpStatus,
  Intro,
  PersonDetail,
  PersonSummary,
  SearchKind,
  SearchResult,
  StatusCard,
  Tag,
  TeamRef,
  Timestamp,
} from "../../shared/contract.js";
import { matchPeople, upsertMemberEmbedding } from "../matching/index.js";
import {
  findMember,
  isComplete,
  myStatus,
  personDetail,
  relationWith,
  saveIntake,
  teamLedBy,
  toSummary,
  uniqueTags,
  type ChatContext,
  type IntakeChanges,
} from "./data.js";

/**
 * A tool failure the model and the person may see. The model gets
 * `{ error: message }` (a plain Error would reach it as `{}`), and the chat
 * route shows the message instead of the generic one.
 */
export class ToolFail extends Error {
  toJSON() {
    return { error: this.message };
  }
}

/** update_profile output (rendered as nothing in the chat). */
const ProfileSaved = z.object({
  saved: z.array(z.string()),
  complete: z.boolean(),
  stillNeeded: z.array(z.string()),
});

const Tags = z.array(Tag).max(30);
const EMBEDDED_FIELDS = ["skills", "interests", "track", "idea", "summary", "motivations"] as const;
const NOT_SURE = /^(not sure( yet)?|none|undecided|no preference|skip|n\/a)$/i;

/** Runs a tool body; unexpected errors become one safe line for the model. */
async function guarded<T>(name: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ToolFail) throw error;
    console.error(`[agent] ${name} failed`, error);
    throw new ToolFail("That didn't work just now. Try again in a moment.");
  }
}

/** "@Maya_Backend" -> "maya_backend", or a ToolFail. */
function cleanHandle(raw: string): string {
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  if (!Handle.safeParse(handle).success) throw new ToolFail(`"${raw}" isn't a valid handle.`);
  return handle;
}

export function buildTools(ctx: ChatContext) {
  const { userId, eventId } = ctx;

  return {
    // Client-side: no execute. The UI shows chips and returns { answer }.
    ask_with_options: tool({
      description:
        "Ask the person ONE short question with 2-6 tappable answer chips (they can also type their own answer). Use for intake questions and other clear choices. Always fill `say` with one short line answering what they just said; it shows above the question. Don't use this when they just asked you to find, search or draft something: do that first. Their answer arrives as the tool result { answer }.",
      inputSchema: askWithOptions.input,
      outputSchema: askWithOptions.output,
    }),

    update_profile: tool({
      description:
        "Save what the person told you about themselves to their profile for this event. Pass only fields you learned. List fields are added to what is saved unless replaceLists is true.",
      inputSchema: z.object({
        skills: Tags.optional().describe("Skills they have, as short tags, e.g. React, Python, UI design"),
        skillsWanted: Tags.optional().describe("Skills they want from teammates, as short tags"),
        experience: Experience.optional(),
        wantsExperienced: z.boolean().optional().describe("They want a teammate with more experience"),
        goal: HackGoal.optional().describe("win, learn or ship"),
        track: z.string().trim().max(80).optional().describe("Exact event track name; empty string if not sure"),
        interests: Tags.optional().describe("Topics they care about, as short tags, e.g. health tech"),
        idea: z.string().trim().max(2000).optional().describe("Their project idea, if they shared one"),
        summary: z.string().trim().max(300).optional().describe("One sentence about them, only from what they said"),
        replaceLists: z.boolean().optional().describe("true to replace the saved lists instead of adding to them"),
      }),
      outputSchema: ProfileSaved,
      execute: (input) =>
        guarded("update_profile", async () => {
          const { replaceLists, ...fields } = input;
          const current = ctx.intake;
          const changes: IntakeChanges = {};
          const merge = (saved: string[], given: string[] | undefined) =>
            given === undefined ? undefined : uniqueTags(replaceLists ? given : [...saved, ...given]);

          changes.skills = merge(current.skills, fields.skills);
          changes.skillsWanted = merge(current.skillsWanted, fields.skillsWanted);
          changes.interests = merge(current.interests, fields.interests);
          if (fields.experience !== undefined) changes.experience = fields.experience;
          if (fields.wantsExperienced !== undefined) changes.wantsExperienced = fields.wantsExperienced;
          if (fields.goal !== undefined) changes.goal = fields.goal;
          if (fields.idea !== undefined) changes.idea = fields.idea;
          if (fields.summary !== undefined) changes.summary = fields.summary;
          if (fields.track !== undefined) changes.track = normalizeTrack(fields.track, ctx.event.tracks);
          for (const key of Object.keys(changes) as (keyof IntakeChanges)[]) {
            if (changes[key] === undefined) delete changes[key];
          }

          const wasComplete = current.complete;
          const saved = await saveIntake(eventId, userId, changes);
          ctx.intake = saved;

          // Re-embed when the profile becomes complete, or when embedded text changes after that.
          const textChanged = EMBEDDED_FIELDS.some((f) => f in changes);
          if (saved.complete && (!wasComplete || textChanged)) {
            try {
              await upsertMemberEmbedding(eventId, userId);
            } catch (error) {
              console.error("[agent] upsertMemberEmbedding failed", error);
            }
          }

          const stillNeeded = [
            ...(saved.skills.length === 0 ? ["skills"] : []),
            ...(saved.goal === null ? ["goal"] : []),
          ];
          return { saved: Object.keys(changes), complete: isComplete(saved), stillNeeded };
        }),
    }),

    search_people: tool({
      description:
        'Search this event for people. kind "hacker": teammates who are still looking. kind "team": open teams to join. kind "mentor": verified mentors for a problem. Only search once you know what they need: if they ask for a mentor, teammate or team without saying what for, ask with ask_with_options first. Returns status "matches" (strong fits), "closest" (no strong fit; the nearest few, with a note on what nobody has), or "noMatch" (no one at all).',
      inputSchema: z.object({
        kind: SearchKind,
        query: z.string().trim().min(1).max(300).describe("What they're looking for, in their words"),
        neededSkills: z.array(Tag).max(10).optional().describe("Skills the search asks for, as short tags"),
        limit: z.number().int().min(1).max(10).optional().describe("Cards to return, default 5"),
      }),
      outputSchema: SearchResult,
      execute: ({ kind, query, neededSkills, limit }) =>
        guarded("search_people", async () => {
          const result = await matchPeople({
            viewerId: userId,
            eventId,
            kind,
            queryText: query,
            neededSkills,
            limit: limit ?? 5,
          });
          return SearchResult.parse(result);
        }),
      // The model sees evidence and reasons, not avatars, ids or scores.
      toModelOutput: ({ output }) => ({ type: "json", value: searchForModel(output) }),
    }),

    get_profile: tool({
      description: "Get the public profile of one person at this event by handle.",
      inputSchema: z.object({ handle: z.string().min(1).max(40).describe("Their handle, e.g. maya_backend") }),
      outputSchema: PersonDetail,
      execute: ({ handle }) =>
        guarded("get_profile", async () => {
          const detail = await personDetail(eventId, userId, cleanHandle(handle));
          if (!detail) throw new ToolFail(`No one with the handle ${handle} at this event.`);
          return PersonDetail.parse(detail);
        }),
      toModelOutput: ({ output }) => {
        const { userId: _id, hackyStyle: _style, photoUrl: _photo, isDemo: _demo, links: _links, relation, ...rest } =
          output;
        return { type: "json", value: { ...rest, relation: relation.state } };
      },
    }),

    draft_intro: tool({
      description:
        "Draft a connection request intro for the person to review and send. You write the intro (first person, as them, 1-3 sentences, no links). To contact a team, toHandle is the team's owner and team is the team's name; no lookup is needed first. Does not send anything.",
      inputSchema: z.object({
        toHandle: z.string().min(1).max(40).describe("Recipient's handle (the team owner for a team)"),
        intro: z.string().min(1).max(600).describe("The intro text, under 500 characters, no links"),
        team: z.string().min(1).max(80).optional().describe("Only when contacting a team: the team's name (an id also works)"),
      }),
      outputSchema: DraftCard,
      execute: ({ toHandle, intro, team: teamName }) =>
        guarded("draft_intro", async () => {
          const handle = cleanHandle(toHandle);
          const text = Intro.safeParse(intro);
          if (!text.success) {
            throw new ToolFail(text.error.issues[0]?.message ?? "Intros must be 1-500 characters with no links.");
          }
          const person = await findMember(eventId, userId, handle);
          if (!person) throw new ToolFail(`No one with the handle ${handle} at this event.`);
          if (person.user_id === userId) throw new ToolFail("You can't send a request to yourself.");

          let team: TeamRef | null = null;
          if (teamName !== undefined) {
            team = await teamLedBy(eventId, person.user_id, teamName);
            if (!team) throw new ToolFail(`${handle} doesn't lead a team called "${teamName}" at this event.`);
          }

          const relation = await relationWith(eventId, userId, person.user_id);
          if (relation.state === "outgoing") throw new ToolFail(`You already sent ${handle} a request; it's still pending.`);
          if (relation.state === "accepted") throw new ToolFail(`You're already connected with ${handle}; message them in your DMs.`);

          return DraftCard.parse({ card: "draft", to: toSummary(person), team, intro: text.data, source: "agent" });
        }),
      toModelOutput: ({ output }) => ({
        type: "json",
        value: { draftReadyFor: output.to.handle, team: output.team?.name ?? null, intro: output.intro },
      }),
    }),

    draft_help_request: tool({
      description:
        "Draft a mentor help request for the person to review. They tap \"Request help\" to post it. Does not post anything. Use it when they're stuck and want a mentor, and always right after a mentor search returns closest or noMatch (title, details and skillsNeeded from what they asked), so any mentor who comes online can claim it.",
      inputSchema: z.object({
        title: z.string().trim().min(3).max(120).describe("Short title of the problem"),
        details: z.string().trim().max(2000).optional().describe("What they tried and where they're stuck"),
        skillsNeeded: z.array(Tag).max(10).describe("Skills a mentor needs to help, as short tags"),
      }),
      outputSchema: HelpRequestCard,
      execute: ({ title, details, skillsNeeded }) =>
        guarded("draft_help_request", async () =>
          HelpRequestCard.parse({
            card: "helpRequest",
            title,
            details: details ? details : null,
            skillsNeeded: uniqueTags(skillsNeeded),
          }),
        ),
    }),

    my_status: tool({
      description:
        "Read-only: the person's pending requests (incoming and outgoing), their team, and their open help requests at this event.",
      inputSchema: z.object({}),
      outputSchema: StatusCard,
      execute: () =>
        guarded("my_status", async () => StatusCard.parse({ card: "status", ...(await myStatus(eventId, userId)) })),
      toModelOutput: ({ output }) => ({
        type: "json",
        value: {
          incoming: output.incoming.map((r) => ({ from: r.person.handle, name: r.person.name, team: r.team?.name ?? null, intro: r.intro })),
          outgoing: output.outgoing.map((r) => ({ to: r.person.handle, name: r.person.name, team: r.team?.name ?? null })),
          connectedCount: output.connectedCount,
          team: output.team ? { name: output.team.name, isOwner: output.team.isOwner, size: output.team.size, maxSize: output.team.maxSize } : null,
          helpRequests: output.helpRequests.map((h) => ({ title: h.title, status: h.status, mentor: h.mentor?.handle ?? null })),
        },
      }),
    }),
  };
}

export type HackyTools = ReturnType<typeof buildTools>;

/** Maps a spoken track to the event's spelling; "not sure" clears it. */
function normalizeTrack(raw: string, tracks: string[]): string | null {
  const value = raw.trim();
  if (value === "" || NOT_SURE.test(value)) return null;
  if (tracks.length === 0) return value;
  const exact = tracks.find((t) => t.toLowerCase() === value.toLowerCase());
  if (exact) return exact;
  const loose = tracks.find((t) => value.toLowerCase().includes(t.toLowerCase()));
  if (loose) return loose;
  throw new ToolFail(`Unknown track "${value}". Tracks at this event: ${tracks.join(", ")}.`);
}

// What to do after a search with no strong fit (the model reads it with the result).
const MENTOR_FALLBACK =
  "No strong mentor match. Present any cards honestly as the closest, using the note to say what's missing. In this same turn also call draft_help_request (title, details and skillsNeeded from what they asked), and say in one line that you drafted a help request they can post so any mentor who comes online can claim it.";
const WIDEN =
  "None of these is a strong match. Present them as the nearest options, using the note to say what's missing, and suggest one way to widen the search.";

/** Compact search result for the model: who, evidence and reason. */
function searchForModel(result: SearchResult) {
  if (result.status === "noMatch") {
    return result.kind === "mentor" ? { ...result, next: MENTOR_FALLBACK } : result;
  }
  return {
    status: result.status,
    kind: result.kind,
    ...(result.status === "closest"
      ? { note: result.note, next: result.kind === "mentor" ? MENTOR_FALLBACK : WIDEN }
      : {}),
    cards: result.cards.map((card) => {
      if (card.card === "team") {
        return {
          team: card.team.name,
          teamId: card.team.id,
          ownerHandle: card.team.owner.handle,
          idea: card.team.idea,
          track: card.team.track,
          wantedSkills: card.team.wantedSkills,
          openSpots: card.team.maxSize - card.team.size,
          evidence: card.evidence,
          reason: card.reason,
        };
      }
      return {
        handle: card.person.handle,
        name: card.person.name,
        role: card.person.role,
        skills: card.skills,
        evidence: card.evidence,
        reason: card.reason,
        ...(card.card === "mentor" ? { verified: card.verified } : {}),
      };
    }),
  };
}
