// GET /api/events/:slug (public), GET and PATCH /api/events/:slug/me,
// GET /api/events/:slug/people/:handle.
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  Handle,
  Slug,
  UpdateEventMeBody,
  type EventInfo,
  type EventMe,
  type Intake,
  type Motivation,
} from "../../shared/contract.js";
import { personDetail, teamDetail } from "../agent/data.js";
import { db } from "../db/index.js";
import { eventMembers, events, memberProfiles } from "../db/schema.js";
import { fail, iso, readJson, readParams, requireUser, type AppContext, type AppEnv } from "./http.js";

const SlugParams = z.object({ slug: Slug });
const PersonParams = z.object({ slug: Slug, handle: Handle });
const TeamParams = z.object({ slug: Slug, id: z.uuid() });

type MemberProfileRow = typeof memberProfiles.$inferSelect;

const emptyIntake: Intake = {
  skills: [],
  skillsWanted: [],
  experience: null,
  wantsExperienced: false,
  goal: null,
  track: null,
  interests: [],
  idea: null,
  motivations: [],
  summary: null,
  complete: false,
};

function toIntake(row: MemberProfileRow | undefined): Intake {
  if (!row) return emptyIntake;
  return {
    skills: row.skills,
    skillsWanted: row.skillsWanted,
    experience: row.experience,
    wantsExperienced: row.wantsExperienced,
    goal: row.goal,
    track: row.track,
    interests: row.interests,
    idea: row.idea,
    motivations: row.motivations as Motivation[],
    summary: row.summary,
    complete: row.complete,
  };
}

// Enough to be matched: what they can do and what they're here for.
const isComplete = (row: Pick<MemberProfileRow, "skills" | "goal">) =>
  row.skills.length > 0 && row.goal !== null;

// Case-insensitive dedupe, keeping the first spelling.
function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const emptyToNull = (value: string | null) => (value === "" ? null : value);

// The event and the signed-in user's membership. 404 for an unknown event,
// 403 when the user isn't a member.
async function requireMembership(c: AppContext) {
  const user = requireUser(c);
  const { slug } = readParams(c, SlugParams);
  const [row] = await db
    .select({ eventId: events.id, member: eventMembers })
    .from(events)
    .leftJoin(
      eventMembers,
      and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, user.id)),
    )
    .where(eq(events.slug, slug))
    .limit(1);
  if (!row) throw fail.notFound("No event with that slug.");
  if (!row.member) throw fail.forbidden("You're not a member of this event.");
  return { user, eventId: row.eventId, member: row.member };
}

async function findMemberProfile(eventId: string, userId: string) {
  const [row] = await db
    .select()
    .from(memberProfiles)
    .where(and(eq(memberProfiles.eventId, eventId), eq(memberProfiles.userId, userId)))
    .limit(1);
  return row;
}

function toEventMe(
  member: typeof eventMembers.$inferSelect,
  profile: MemberProfileRow | undefined,
): EventMe {
  return {
    role: member.role,
    verified: member.verified,
    availability: member.availability,
    looking: member.looking,
    intake: toIntake(profile),
  };
}

export const eventRoutes = new Hono<AppEnv>()
  // Public: the web app themes the page before anyone signs in.
  .get("/events/:slug", async (c) => {
    const { slug } = readParams(c, SlugParams);
    const [event] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
    if (!event) throw fail.notFound("No event with that slug.");
    const info: EventInfo = {
      slug: event.slug,
      name: event.name,
      theme: event.theme,
      tracks: event.tracks,
      startsAt: iso(event.startsAt),
      endsAt: iso(event.endsAt),
    };
    return c.json(info);
  })

  .get("/events/:slug/me", async (c) => {
    const { user, eventId, member } = await requireMembership(c);
    return c.json(toEventMe(member, await findMemberProfile(eventId, user.id)));
  })

  // A team and its members. A blocked lead looks like "not found".
  .get("/events/:slug/teams/:id", async (c) => {
    const { user, eventId } = await requireMembership(c);
    const { id } = readParams(c, TeamParams);
    const team = await teamDetail(eventId, user.id, id);
    if (!team) throw fail.notFound("No such team in this event.");
    return c.json(team);
  })

  // A block in either direction looks like "not found".
  .get("/events/:slug/people/:handle", async (c) => {
    const { user, eventId } = await requireMembership(c);
    const { handle } = readParams(c, PersonParams);
    const person = await personDetail(eventId, user.id, handle);
    if (!person) throw fail.notFound("No such person in this event.");
    return c.json(person);
  })

  // Embeddings are not recomputed here yet (server/matching/ owns that).
  .patch("/events/:slug/me", async (c) => {
    const { user, eventId, member } = await requireMembership(c);
    const body = await readJson(c, UpdateEventMeBody);
    const { availability, looking, ...intake } = body;

    let updatedMember = member;
    if (availability !== undefined || looking !== undefined) {
      const [row] = await db
        .update(eventMembers)
        .set({ availability, looking })
        .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, user.id)))
        .returning();
      if (row) updatedMember = row;
    }

    const changes: Partial<typeof memberProfiles.$inferInsert> = {};
    if (intake.skills !== undefined) changes.skills = uniqueTags(intake.skills);
    if (intake.skillsWanted !== undefined) changes.skillsWanted = uniqueTags(intake.skillsWanted);
    if (intake.interests !== undefined) changes.interests = uniqueTags(intake.interests);
    if (intake.experience !== undefined) changes.experience = intake.experience;
    if (intake.wantsExperienced !== undefined) changes.wantsExperienced = intake.wantsExperienced;
    if (intake.goal !== undefined) changes.goal = intake.goal;
    if (intake.track !== undefined) changes.track = emptyToNull(intake.track);
    if (intake.idea !== undefined) changes.idea = emptyToNull(intake.idea);
    if (intake.motivations !== undefined) changes.motivations = [...new Set(intake.motivations)];

    let profile: MemberProfileRow | undefined;
    if (Object.keys(changes).length > 0) {
      [profile] = await db
        .insert(memberProfiles)
        .values({ eventId, userId: user.id, ...changes })
        .onConflictDoUpdate({
          target: [memberProfiles.eventId, memberProfiles.userId],
          set: changes,
        })
        .returning();
      if (profile && profile.complete !== isComplete(profile)) {
        [profile] = await db
          .update(memberProfiles)
          .set({ complete: isComplete(profile) })
          .where(and(eq(memberProfiles.eventId, eventId), eq(memberProfiles.userId, user.id)))
          .returning();
      }
    } else {
      profile = await findMemberProfile(eventId, user.id);
    }

    return c.json(toEventMe(updatedMember, profile));
  });
