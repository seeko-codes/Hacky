// Message requests and blocks: the server functions behind
// server/routes/requests.ts. Each one takes the signed-in user's id; the ones
// that read, decide and write run in one transaction (server/db/tx.ts) and the
// database constraints back them up.
//
// Concurrency: a send takes an advisory lock on the sender (for the daily
// limit) and then one on the pair; an accept takes only the pair lock. So a
// mutual send and an accept of the same pair can't interleave, and two people
// requesting each other at the same moment still end up accepted with one DM.
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { z } from "zod";
import type { ConnectionRequest, SendRequestBody } from "../../shared/contract.js";
import { db } from "../db/index.js";
import type * as schema from "../db/schema.js";
import {
  blocks,
  connections,
  conversationMembers,
  conversations,
  eventMembers,
  messages,
  profiles,
  teams,
} from "../db/schema.js";
import { withTransaction, type Tx } from "../db/tx.js";
import { ApiFail, fail, iso } from "../routes/http.js";

// New requests per sender per event in any 24 hours. A mutual request (one
// that answers a pending request) doesn't count against it.
export const DAILY_REQUEST_LIMIT = 10;

// The HTTP client (db) or an open transaction (tx).
type Executor = PgDatabase<any, typeof schema>;

const conflict = (message: string) => new ApiFail(409, "conflict", message);
const rateLimited = (message: string) => new ApiFail(429, "rate_limited", message);
// Also what a block looks like from outside, so a block is never revealed.
const personNotFound = () => fail.notFound("No one with that id in this event.");
const requestNotFound = () => fail.notFound("Request not found.");

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

// The request as the viewer sees it: the other person's public summary, the
// team ref, and the DM once accepted. hiddenAt only in the incoming view.
async function loadViews(ex: Executor, viewerId: string, where: SQL | undefined) {
  const otherId = sql<string>`case when ${connections.fromUser} = ${viewerId} then ${connections.toUser} else ${connections.fromUser} end`;
  const rows = await ex
    .select({
      id: connections.id,
      fromUser: connections.fromUser,
      status: connections.status,
      intro: connections.intro,
      source: connections.source,
      createdAt: connections.createdAt,
      respondedAt: connections.respondedAt,
      hiddenAt: connections.hiddenAt,
      teamId: teams.id,
      teamName: teams.name,
      conversationId: conversations.id,
      userId: profiles.userId,
      handle: profiles.handle,
      name: profiles.name,
      hackyStyle: profiles.hackyStyle,
      photoUrl: profiles.photoUrl,
      role: eventMembers.role,
    })
    .from(connections)
    .innerJoin(profiles, eq(profiles.userId, otherId))
    .innerJoin(
      eventMembers,
      and(eq(eventMembers.eventId, connections.eventId), eq(eventMembers.userId, otherId)),
    )
    .leftJoin(teams, eq(teams.id, connections.teamId))
    .leftJoin(
      conversations,
      and(
        eq(connections.status, "accepted"),
        eq(conversations.eventId, connections.eventId),
        eq(conversations.kind, "dm"),
        eq(conversations.dmUserLow, sql`least(${connections.fromUser}, ${connections.toUser})`),
        eq(conversations.dmUserHigh, sql`greatest(${connections.fromUser}, ${connections.toUser})`),
      ),
    )
    .where(
      and(
        or(eq(connections.fromUser, viewerId), eq(connections.toUser, viewerId)),
        where,
      ),
    )
    .orderBy(sql`(${connections.status} = 'pending') desc`, desc(connections.createdAt));

  return rows.map((row): ConnectionRequest => {
    const fields = {
      id: row.id,
      status: row.status,
      intro: row.intro,
      source: row.source,
      person: {
        userId: row.userId,
        handle: row.handle,
        name: row.name,
        hackyStyle: row.hackyStyle,
        photoUrl: row.photoUrl,
        role: row.role,
      },
      team: row.teamId && row.teamName ? { id: row.teamId, name: row.teamName } : null,
      conversationId: row.conversationId,
      createdAt: row.createdAt.toISOString(),
      respondedAt: iso(row.respondedAt),
    };
    return row.fromUser === viewerId
      ? { ...fields, direction: "outgoing" }
      : { ...fields, direction: "incoming", hiddenAt: iso(row.hiddenAt) };
  });
}

async function loadView(ex: Executor, viewerId: string, requestId: string) {
  const [view] = await loadViews(ex, viewerId, eq(connections.id, requestId));
  if (!view) throw requestNotFound();
  return view;
}

// One request from the viewer's side (for live updates or a refetch).
export const loadRequestView = (viewerId: string, requestId: string) =>
  loadView(db, viewerId, requestId);

// GET /api/events/:slug/requests. Pending first, then newest first.
// Left out: anything with someone the viewer blocked, and pending requests
// from someone who blocked the viewer (they can't be accepted). The blocked
// person's own outgoing requests stay as they were, so the block isn't told.
export async function listRequests(eventId: string, viewerId: string) {
  const otherId = sql`case when ${connections.fromUser} = ${viewerId} then ${connections.toUser} else ${connections.fromUser} end`;
  return loadViews(
    db,
    viewerId,
    and(
      eq(connections.eventId, eventId),
      sql`not exists (select 1 from ${blocks} where ${blocks.blockerId} = ${viewerId} and ${blocks.blockedId} = ${otherId})`,
      sql`not (${connections.toUser} = ${viewerId} and ${connections.status} = 'pending' and exists (select 1 from ${blocks} where ${blocks.blockerId} = ${connections.fromUser} and ${blocks.blockedId} = ${viewerId}))`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Shared steps (inside a transaction)
// ---------------------------------------------------------------------------

async function lock(tx: Tx, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

const pairKey = (eventId: string, a: string, b: string) =>
  `hacky:pair:${eventId}:${[a, b].sort().join(":")}`;

async function bothMembers(tx: Tx, eventId: string, a: string, b: string) {
  const rows = await tx
    .select({ userId: eventMembers.userId })
    .from(eventMembers)
    .where(
      and(
        eq(eventMembers.eventId, eventId),
        or(eq(eventMembers.userId, a), eq(eventMembers.userId, b)),
      ),
    );
  return rows.length === 2;
}

async function blockedBetween(tx: Tx, a: string, b: string) {
  const rows = await tx
    .select({ blockerId: blocks.blockerId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
        and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// The one DM for the pair in this event, created if missing, with both members.
// least/greatest in SQL so the order matches the dm_user_low < dm_user_high check.
async function ensureDm(tx: Tx, eventId: string, a: string, b: string) {
  const low = sql`least(${a}::text, ${b}::text)`;
  const high = sql`greatest(${a}::text, ${b}::text)`;
  const [created] = await tx
    .insert(conversations)
    .values({ eventId, kind: "dm", dmUserLow: low, dmUserHigh: high })
    .onConflictDoNothing({
      target: [conversations.eventId, conversations.dmUserLow, conversations.dmUserHigh],
      where: sql`kind = 'dm'`,
    })
    .returning({ id: conversations.id });
  let conversationId = created?.id;
  if (!conversationId) {
    const [existing] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.eventId, eventId),
          eq(conversations.kind, "dm"),
          eq(conversations.dmUserLow, low),
          eq(conversations.dmUserHigh, high),
        ),
      )
      .limit(1);
    conversationId = existing?.id;
  }
  if (!conversationId) throw new Error("DM conversation missing after insert.");
  await tx
    .insert(conversationMembers)
    .values([
      { conversationId, userId: a },
      { conversationId, userId: b },
    ])
    .onConflictDoNothing();
  return conversationId;
}

// Timestamps written here use clock_timestamp(), not now() (the transaction's
// start), so intros in one transaction keep their order and every changed
// column lands close to commit time for the live-updates poller.
const clockNow = () => sql`clock_timestamp()`;

async function postIntro(tx: Tx, conversationId: string, senderId: string, body: string) {
  await tx.insert(messages).values({
    conversationId,
    senderId,
    body,
    kind: "text",
    createdAt: clockNow(),
  });
}

// Whoever accepts has read the intro(s) already, so they don't count as unread.
async function markReadNow(tx: Tx, conversationId: string, userId: string) {
  await tx
    .update(conversationMembers)
    .set({ lastReadAt: clockNow() })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    );
}

function isUniqueViolation(err: unknown): boolean {
  for (let e = err, depth = 0; e && depth < 4; depth++) {
    if (typeof e === "object" && "code" in e && (e as { code: unknown }).code === "23505") return true;
    e = typeof e === "object" && "cause" in e ? (e as { cause: unknown }).cause : undefined;
  }
  return false;
}

async function inTransaction<T>(work: (tx: Tx) => Promise<T>, onDuplicate: string): Promise<T> {
  try {
    return await withTransaction(work);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(onDuplicate);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// POST /api/events/:slug/requests
// ---------------------------------------------------------------------------

// The caller has checked that fromId is a member of eventId. If the recipient
// already has a pending request to the sender, both are accepted and the
// result carries the one DM's conversationId.
export async function sendRequest(
  eventId: string,
  fromId: string,
  body: z.output<typeof SendRequestBody>,
): Promise<ConnectionRequest> {
  const toId = body.toUserId;
  if (toId === fromId) throw fail.invalid("You can't send a request to yourself.");

  return inTransaction(async (tx) => {
    await lock(tx, `hacky:sender:${eventId}:${fromId}`);
    await lock(tx, pairKey(eventId, fromId, toId));

    if (!(await bothMembers(tx, eventId, fromId, toId))) throw personNotFound();
    if (await blockedBetween(tx, fromId, toId)) throw personNotFound();

    if (body.teamId) {
      const [team] = await tx
        .select({ ownerId: teams.ownerId })
        .from(teams)
        .where(and(eq(teams.id, body.teamId), eq(teams.eventId, eventId)))
        .limit(1);
      if (!team) throw fail.notFound("No such team in this event.");
      if (team.ownerId !== toId) throw fail.invalid("Team requests go to the team's owner.");
    }

    const existing = await tx
      .select({ id: connections.id, fromUser: connections.fromUser, status: connections.status, intro: connections.intro })
      .from(connections)
      .where(
        and(
          eq(connections.eventId, eventId),
          or(
            and(eq(connections.fromUser, fromId), eq(connections.toUser, toId)),
            and(eq(connections.fromUser, toId), eq(connections.toUser, fromId)),
          ),
        ),
      )
      .for("update");
    const mine = existing.find((row) => row.fromUser === fromId);
    const theirs = existing.find((row) => row.fromUser === toId);
    if (mine?.status === "accepted" || theirs?.status === "accepted") {
      throw conflict("You're already connected with this person.");
    }
    if (mine) throw conflict("You already sent this person a request.");

    const mutual = theirs?.status === "pending";
    if (!mutual) {
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(connections)
        .where(
          and(
            eq(connections.eventId, eventId),
            eq(connections.fromUser, fromId),
            sql`${connections.createdAt} > now() - interval '1 day'`,
          ),
        );
      if ((count?.n ?? 0) >= DAILY_REQUEST_LIMIT) {
        throw rateLimited(`You can send ${DAILY_REQUEST_LIMIT} requests a day. Try again later.`);
      }
    }

    const [created] = await tx
      .insert(connections)
      .values({
        eventId,
        fromUser: fromId,
        toUser: toId,
        intro: body.intro,
        source: body.source,
        teamId: body.teamId ?? null,
        status: mutual ? "accepted" : "pending",
        createdAt: clockNow(),
        respondedAt: mutual ? clockNow() : null,
      })
      .returning({ id: connections.id });
    if (!created) throw new Error("Request insert returned nothing.");

    if (mutual && theirs) {
      await tx
        .update(connections)
        .set({ status: "accepted", respondedAt: clockNow() })
        .where(eq(connections.id, theirs.id));
      const conversationId = await ensureDm(tx, eventId, fromId, toId);
      await postIntro(tx, conversationId, toId, theirs.intro);
      await postIntro(tx, conversationId, fromId, body.intro);
      await markReadNow(tx, conversationId, fromId);
    }

    return loadView(tx, fromId, created.id);
  }, "You already sent this person a request.");
}

// ---------------------------------------------------------------------------
// POST /api/requests/:id/accept
// ---------------------------------------------------------------------------

// Only the recipient. Idempotent: accepting again returns the same request and
// conversation. Opens (or reuses) the pair's DM and posts the intro as the
// sender's first message.
export async function acceptRequest(viewerId: string, requestId: string): Promise<ConnectionRequest> {
  return inTransaction(async (tx) => {
    const [peek] = await tx
      .select({ eventId: connections.eventId, fromUser: connections.fromUser, toUser: connections.toUser })
      .from(connections)
      .where(eq(connections.id, requestId))
      .limit(1);
    if (!peek || (peek.toUser !== viewerId && peek.fromUser !== viewerId)) throw requestNotFound();
    if (peek.toUser !== viewerId) throw fail.forbidden("Only the person who received this request can accept it.");

    await lock(tx, pairKey(peek.eventId, peek.fromUser, peek.toUser));
    const [row] = await tx.select().from(connections).where(eq(connections.id, requestId)).for("update");
    if (!row) throw requestNotFound();
    if (!(await bothMembers(tx, row.eventId, row.fromUser, row.toUser))) throw requestNotFound();
    if (await blockedBetween(tx, row.fromUser, row.toUser)) throw requestNotFound();

    const conversationId = await ensureDm(tx, row.eventId, row.fromUser, row.toUser);
    if (row.status === "pending") {
      await postIntro(tx, conversationId, row.fromUser, row.intro);
      await markReadNow(tx, conversationId, viewerId);
      await tx
        .update(connections)
        .set({ status: "accepted", respondedAt: clockNow() })
        .where(eq(connections.id, row.id));
    }
    return loadView(tx, viewerId, row.id);
  }, "This request was just accepted. Try again.");
}

// ---------------------------------------------------------------------------
// POST /api/requests/:id/hide ("Not now")
// ---------------------------------------------------------------------------

// Only the recipient. Sets hidden_at once (idempotent); the sender's view
// doesn't change. An accepted request is left alone.
export async function hideRequest(viewerId: string, requestId: string): Promise<void> {
  await withTransaction(async (tx) => {
    const [row] = await tx
      .select({
        eventId: connections.eventId,
        fromUser: connections.fromUser,
        toUser: connections.toUser,
        status: connections.status,
        hiddenAt: connections.hiddenAt,
      })
      .from(connections)
      .where(eq(connections.id, requestId))
      .for("update");
    if (!row || (row.toUser !== viewerId && row.fromUser !== viewerId)) throw requestNotFound();
    if (row.toUser !== viewerId) throw fail.forbidden("Only the person who received this request can hide it.");
    const [member] = await tx
      .select({ userId: eventMembers.userId })
      .from(eventMembers)
      .where(and(eq(eventMembers.eventId, row.eventId), eq(eventMembers.userId, viewerId)))
      .limit(1);
    if (!member) throw requestNotFound();
    if (row.status !== "pending" || row.hiddenAt) return;
    await tx
      .update(connections)
      .set({ hiddenAt: clockNow() })
      .where(eq(connections.id, requestId));
  });
}

// ---------------------------------------------------------------------------
// POST /api/blocks
// ---------------------------------------------------------------------------

// Idempotent, and the blocked person isn't told. You can block anyone you
// share an event with; anyone else is "not found".
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) throw fail.invalid("You can't block yourself.");
  await withTransaction(async (tx) => {
    const { rows } = await tx.execute<{ shared: boolean }>(sql`
      select exists (
        select 1 from ${eventMembers} a
        join ${eventMembers} b on b.event_id = a.event_id
        where a.user_id = ${blockerId} and b.user_id = ${blockedId}
      ) as shared
    `);
    if (!rows[0]?.shared) throw fail.notFound("No such person.");
    await tx.insert(blocks).values({ blockerId, blockedId }).onConflictDoNothing();
  });
}
