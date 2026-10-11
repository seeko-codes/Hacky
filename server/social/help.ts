// Mentor help: create a request, the mentor queue, claim and resolve. The API
// routes in server/routes/help.ts call these. Writes that touch more than one
// row run in one transaction, and the database constraints back up the rules:
// a claim only succeeds while the request is still open.
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  HackyStyle,
  HelpFit,
  HelpQueue,
  HelpRequest,
  HelpRequestDraft,
  MatchCard,
  PersonSummary,
} from "../../shared/contract.js";
import { embedTexts } from "../agent/model.js";
import { db } from "../db/index.js";
import {
  blocks,
  conversationMembers,
  conversations,
  eventMembers,
  events,
  helpRequests,
  memberProfiles,
  messages,
  profiles,
} from "../db/schema.js";
import { withTransaction } from "../db/tx.js";
import { queryEmbeddingText, rankMentors, toResult } from "../matching/index.js";
import * as S from "../matching/score.js";
import { ApiFail, fail, iso } from "../routes/http.js";

/** Requests one hacker can have waiting for a mentor at once. */
const MAX_WAITING = 3;
/** Open requests ranked per queue load (oldest first before sorting by fit). */
const QUEUE_LIMIT = 30;
/** Requests in "mine". */
const MINE_LIMIT = 50;
/** highlighted: the viewing mentor is in this many top mentors for the request. */
const TOP_MENTORS = 3;

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/** The "Request help" button. Only hackers who are members of the event. */
export async function createHelpRequest(
  slug: string,
  userId: string,
  draft: HelpRequestDraft,
): Promise<HelpRequest> {
  const { eventId, member } = await requireMembership(slug, userId);
  if (member.role !== "hacker") throw fail.forbidden("Only hackers can ask for mentor help.");

  const skills = uniqueTags(draft.skillsNeeded);
  const details = draft.details ? draft.details : null;
  // One statement, so the waiting-request limit and the insert can't drift apart.
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into help_requests (event_id, hacker_id, title, details, skills_needed)
    select ${eventId}, ${userId}, ${draft.title}, ${details},
      array[${sql.join(skills.map((skill) => sql`${skill}`), sql`, `)}]::text[]
    where (
      select count(*) from help_requests
      where event_id = ${eventId} and hacker_id = ${userId} and status = 'open'
    ) < ${MAX_WAITING}
    returning id
  `);
  const id = rows[0]?.id;
  if (!id) {
    throw new ApiFail(
      429,
      "rate_limited",
      `You already have ${MAX_WAITING} requests waiting for a mentor.`,
    );
  }
  return loadHelpRequest(id);
}

/**
 * open: for verified mentors, the event's open requests sorted by fit for this
 * mentor (empty for everyone else). mine: requests the viewer created or claimed.
 */
export async function loadHelpQueue(slug: string, userId: string): Promise<HelpQueue> {
  const { eventId, member } = await requireMembership(slug, userId);
  const isMentor = member.role === "mentor" && member.verified;

  const [mineRows, openRows] = await Promise.all([
    selectHelpRequests()
      .where(
        and(
          eq(helpRequests.eventId, eventId),
          or(eq(helpRequests.hackerId, userId), eq(helpRequests.mentorId, userId)),
        ),
      )
      .orderBy(desc(helpRequests.createdAt))
      .limit(MINE_LIMIT),
    isMentor
      ? selectHelpRequests()
          .where(
            and(
              eq(helpRequests.eventId, eventId),
              eq(helpRequests.status, "open"),
              ne(helpRequests.hackerId, userId),
              notBlocked(userId),
            ),
          )
          .orderBy(asc(helpRequests.createdAt))
          .limit(QUEUE_LIMIT)
      : Promise.resolve([]),
  ]);

  const mine = mineRows.map(toHelpRequest);
  if (openRows.length === 0) return { open: [], mine };

  const fits = await mentorFits(eventId, userId, member.availability, openRows);
  const open = openRows
    .map((row) => ({ ...toHelpRequest(row), fit: fits.get(row.id) ?? noFit }))
    .sort((a, b) => b.fit.score - a.fit.score || a.createdAt.localeCompare(b.createdAt));
  return { open, mine };
}

/**
 * A verified mentor who isn't offline claims an open request. The update only
 * matches while status = 'open', so of two racing claims exactly one wins; the
 * other gets 409. The winner's transaction also opens the mentor chat (hacker +
 * mentor) with a system message. Retrying your own claim returns it again.
 */
export async function claimHelpRequest(id: string, userId: string): Promise<HelpRequest> {
  const target = await loadTarget(id, userId);
  const { member } = target;
  if (member.role !== "mentor" || !member.verified) {
    throw fail.forbidden("Only verified mentors can claim help requests.");
  }
  if (member.availability === "offline") {
    throw fail.forbidden("You're offline. Set yourself available to claim requests.");
  }
  if (target.hackerId === userId) throw fail.forbidden("You can't claim your own request.");
  if (target.blocked) throw fail.notFound("No such help request.");

  if (target.status === "open") {
    await withTransaction(async (tx) => {
      const [claimed] = await tx
        .update(helpRequests)
        .set({ status: "claimed", mentorId: userId, claimedAt: sql`now()` })
        .where(and(eq(helpRequests.id, id), eq(helpRequests.status, "open")))
        .returning({ eventId: helpRequests.eventId, hackerId: helpRequests.hackerId });
      if (!claimed) return; // another mentor got there first
      const [conversation] = await tx
        .insert(conversations)
        .values({ eventId: claimed.eventId, kind: "mentor", helpRequestId: id })
        .returning({ id: conversations.id });
      if (!conversation) throw new Error("Mentor conversation was not created");
      await tx.insert(conversationMembers).values([
        { conversationId: conversation.id, userId: claimed.hackerId },
        { conversationId: conversation.id, userId },
      ]);
      await tx.insert(messages).values({
        conversationId: conversation.id,
        senderId: null,
        kind: "system",
        body: `${target.viewerName} claimed this request.`,
      });
    });
  }

  const request = await loadHelpRequest(id);
  if (request.mentor?.userId === userId) return request;
  throw new ApiFail(
    409,
    "conflict",
    request.status === "resolved"
      ? "This request is already resolved."
      : "Another mentor already claimed this request.",
  );
}

/**
 * The hacker or the claiming mentor marks it resolved and a system message
 * goes into the mentor chat. Resolving again returns it unchanged.
 */
export async function resolveHelpRequest(id: string, userId: string): Promise<HelpRequest> {
  const target = await loadTarget(id, userId);
  if (target.hackerId !== userId && target.mentorId !== userId) {
    throw fail.forbidden("Only the hacker or the mentor who claimed it can resolve this.");
  }
  if (target.status === "open") {
    // The schema ties every non-open status to a mentor, so there's no cancel yet.
    throw new ApiFail(409, "conflict", "A mentor has to claim this request before it can be resolved.");
  }

  if (target.status === "claimed") {
    await withTransaction(async (tx) => {
      const [resolved] = await tx
        .update(helpRequests)
        .set({ status: "resolved", resolvedAt: sql`now()` })
        .where(and(eq(helpRequests.id, id), eq(helpRequests.status, "claimed")))
        .returning({ id: helpRequests.id });
      if (!resolved) return; // the other side resolved it at the same moment
      const [conversation] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.helpRequestId, id))
        .limit(1);
      if (!conversation) return;
      await tx.insert(messages).values({
        conversationId: conversation.id,
        senderId: null,
        kind: "system",
        body: `${target.viewerName} marked this request as resolved.`,
      });
    });
  }

  return loadHelpRequest(id);
}

// ---------------------------------------------------------------------------
// Fit for the viewing mentor
// ---------------------------------------------------------------------------

const noFit: HelpFit = { score: 0, matchedSkills: [], highlighted: false };

/**
 * Ranks the event's mentors for each request with the matching module (the
 * same ranking the hacker's mentor search uses) and reads off this mentor's
 * score. highlighted: this mentor is among the top 3 cards matchMentors would
 * return for the request. All request texts are embedded in one Gemini call,
 * and each text only once per server instance.
 */
async function mentorFits(
  eventId: string,
  mentorId: string,
  availability: "available" | "busy" | "offline",
  rows: HelpRequestRow[],
): Promise<Map<string, HelpFit>> {
  const inputs = rows.map((row) => {
    // The query rankMentors builds for a stored help request.
    const queryText = [row.title, row.details].filter(Boolean).join("\n");
    const requested = S.searchSkills(queryText, row.skillsNeeded);
    return { row, queryText, requested, text: queryEmbeddingText(queryText, requested) };
  });
  const vectors = await queryVectors(inputs.map((input) => input.text));

  let mentorSkills: Promise<string[]> | undefined;
  const skillsOfMentor = () => (mentorSkills ??= loadSkills(eventId, mentorId));
  // Without a vector (Gemini down or rate limited) fit falls back to skill overlap.
  const overlapFit = async (requested: string[]): Promise<HelpFit> => {
    const skills = await skillsOfMentor();
    return {
      score: S.mentorScore({
        skillOverlap: S.coverage(requested, skills),
        relevance: 0,
        availableNow: availability === "available",
      }),
      matchedSkills: S.matchSkills(requested, skills),
      highlighted: false,
    };
  };

  const fits = await Promise.all(
    inputs.map(async ({ row, queryText, requested, text }): Promise<[string, HelpFit]> => {
      const vector = vectors.get(text);
      if (!vector) return [row.id, await overlapFit(requested)];
      const ranked = await rankMentors({
        eventId,
        viewerId: row.hackerId,
        skillsNeeded: row.skillsNeeded,
        queryText,
        queryEmbedding: vector,
      });
      const top = toResult("mentor", ranked, TOP_MENTORS);
      const highlighted =
        top.status === "matches" && top.cards.some((card) => isMentorCard(card, mentorId));
      const mine = ranked.find((r) => isMentorCard(r.card, mentorId));
      if (!mine || mine.card.card !== "mentor") return [row.id, await overlapFit(requested)];
      return [
        row.id,
        { score: mine.score, matchedSkills: mine.card.evidence.matchedSkills, highlighted },
      ];
    }),
  );
  return new Map(fits);
}

function isMentorCard(card: MatchCard, userId: string): boolean {
  return card.card === "mentor" && card.person.userId === userId;
}

async function loadSkills(eventId: string, userId: string): Promise<string[]> {
  const [row] = await db
    .select({ skills: memberProfiles.skills })
    .from(memberProfiles)
    .where(and(eq(memberProfiles.eventId, eventId), eq(memberProfiles.userId, userId)))
    .limit(1);
  return row?.skills ?? [];
}

// Request texts never change, so their query vectors are cached by text.
const VECTOR_CACHE_MAX = 500;
const vectorCache = new Map<string, number[]>();
let embedPausedUntil = 0;

async function queryVectors(texts: string[]): Promise<Map<string, number[]>> {
  const missing = [...new Set(texts)].filter((text) => !vectorCache.has(text));
  if (missing.length > 0 && Date.now() >= embedPausedUntil) {
    try {
      const vectors = await embedTexts(missing, "query");
      missing.forEach((text, i) => {
        const vector = vectors[i];
        if (!vector) return;
        if (vectorCache.size >= VECTOR_CACHE_MAX) {
          const oldest = vectorCache.keys().next().value;
          if (oldest !== undefined) vectorCache.delete(oldest);
        }
        vectorCache.set(text, vector);
      });
    } catch (err) {
      // Free-tier key: don't hammer Gemini on every queue poll while it fails.
      embedPausedUntil = Date.now() + 60_000;
      console.warn("help queue: embedding failed, using skill overlap", (err as Error).message);
    }
  }
  const out = new Map<string, number[]>();
  for (const text of texts) {
    const vector = vectorCache.get(text);
    if (vector) out.set(text, vector);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** The event and the user's membership: 404 unknown event, 403 not a member. */
async function requireMembership(slug: string, userId: string) {
  const [row] = await db
    .select({ eventId: events.id, member: eventMembers })
    .from(events)
    .leftJoin(eventMembers, and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)))
    .where(eq(events.slug, slug))
    .limit(1);
  if (!row) throw fail.notFound("No event with that slug.");
  if (!row.member) throw fail.forbidden("You're not a member of this event.");
  return { eventId: row.eventId, member: row.member };
}

/**
 * A request plus the viewer's membership in its event. 404 when it doesn't
 * exist or the viewer isn't in that event (no leaking other events' requests).
 */
async function loadTarget(id: string, userId: string) {
  const [row] = await db
    .select({
      hackerId: helpRequests.hackerId,
      mentorId: helpRequests.mentorId,
      status: helpRequests.status,
      member: eventMembers,
      viewerName: profiles.name,
      blocked: sql<boolean>`exists (
        select 1 from ${blocks} b
        where (b.blocker_id = ${userId} and b.blocked_id = ${helpRequests.hackerId})
           or (b.blocker_id = ${helpRequests.hackerId} and b.blocked_id = ${userId})
      )`,
    })
    .from(helpRequests)
    .leftJoin(
      eventMembers,
      and(eq(eventMembers.eventId, helpRequests.eventId), eq(eventMembers.userId, userId)),
    )
    .leftJoin(profiles, eq(profiles.userId, userId))
    .where(eq(helpRequests.id, id))
    .limit(1);
  if (!row || !row.member) throw fail.notFound("No such help request.");
  return { ...row, member: row.member, viewerName: row.viewerName ?? "Someone" };
}

/** No block in either direction between the viewer and the request's hacker. */
function notBlocked(userId: string) {
  return sql`not exists (
    select 1 from ${blocks} b
    where (b.blocker_id = ${userId} and b.blocked_id = ${helpRequests.hackerId})
       or (b.blocker_id = ${helpRequests.hackerId} and b.blocked_id = ${userId})
  )`;
}

const hackerProfile = alias(profiles, "hacker_profile");
const hackerMember = alias(eventMembers, "hacker_member");
const mentorProfile = alias(profiles, "mentor_profile");
const mentorMember = alias(eventMembers, "mentor_member");

function selectHelpRequests() {
  return db
    .select({
      id: helpRequests.id,
      title: helpRequests.title,
      details: helpRequests.details,
      skillsNeeded: helpRequests.skillsNeeded,
      status: helpRequests.status,
      createdAt: helpRequests.createdAt,
      claimedAt: helpRequests.claimedAt,
      resolvedAt: helpRequests.resolvedAt,
      hackerId: helpRequests.hackerId,
      hackerHandle: hackerProfile.handle,
      hackerName: hackerProfile.name,
      hackerStyle: hackerProfile.hackyStyle,
      hackerPhotoUrl: hackerProfile.photoUrl,
      hackerRole: hackerMember.role,
      mentorId: helpRequests.mentorId,
      mentorHandle: mentorProfile.handle,
      mentorName: mentorProfile.name,
      mentorStyle: mentorProfile.hackyStyle,
      mentorPhotoUrl: mentorProfile.photoUrl,
      mentorRole: mentorMember.role,
      conversationId: conversations.id,
    })
    .from(helpRequests)
    .innerJoin(hackerProfile, eq(hackerProfile.userId, helpRequests.hackerId))
    .leftJoin(
      hackerMember,
      and(eq(hackerMember.eventId, helpRequests.eventId), eq(hackerMember.userId, helpRequests.hackerId)),
    )
    .leftJoin(mentorProfile, eq(mentorProfile.userId, helpRequests.mentorId))
    .leftJoin(
      mentorMember,
      and(eq(mentorMember.eventId, helpRequests.eventId), eq(mentorMember.userId, helpRequests.mentorId)),
    )
    .leftJoin(conversations, eq(conversations.helpRequestId, helpRequests.id))
    .$dynamic();
}

type HelpRequestRow = Awaited<ReturnType<typeof selectHelpRequests>>[number];

async function loadHelpRequest(id: string): Promise<HelpRequest> {
  const [row] = await selectHelpRequests().where(eq(helpRequests.id, id)).limit(1);
  if (!row) throw fail.notFound("No such help request.");
  return toHelpRequest(row);
}

function toHelpRequest(row: HelpRequestRow): HelpRequest {
  const hacker: PersonSummary = {
    userId: row.hackerId,
    handle: row.hackerHandle,
    name: row.hackerName,
    hackyStyle: row.hackerStyle as HackyStyle,
    photoUrl: row.hackerPhotoUrl,
    role: row.hackerRole ?? "hacker",
  };
  const mentor: PersonSummary | null =
    row.mentorId && row.mentorHandle && row.mentorName
      ? {
          userId: row.mentorId,
          handle: row.mentorHandle,
          name: row.mentorName,
          hackyStyle: (row.mentorStyle ?? {}) as HackyStyle,
          photoUrl: row.mentorPhotoUrl ?? null,
          role: row.mentorRole ?? "mentor",
        }
      : null;
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    skillsNeeded: row.skillsNeeded,
    status: row.status,
    hacker,
    mentor,
    conversationId: row.conversationId,
    createdAt: row.createdAt.toISOString(),
    claimedAt: iso(row.claimedAt),
    resolvedAt: iso(row.resolvedAt),
  };
}

// Case-insensitive dedupe, keeping the first spelling.
function uniqueTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
