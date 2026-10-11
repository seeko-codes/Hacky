// Live updates for the web app: a WebSocket served by a Neon Function.
//
// The browser gets a short-lived token from POST /api/realtime/token and opens
// `wss://<function url>/?token=<jwt>` (browsers can't send auth headers on a
// WebSocket). The token is checked before the upgrade; a bad one gets a plain
// 401 and the socket never opens.
//
// Each connection polls Postgres every ~1.5 s for rows newer than the last one
// it sent (starting from connect time) and pushes them as LiveEvent JSON from
// shared/contract.ts, one object per text frame. Live updates only notify: the
// database stays the source of truth, so after `open` (and after every
// reconnect) the client fetches what it missed from /api.
//
// Other frames: the server sends {"type":"ping"} every 25 s as a keepalive
// (clients ignore it) and ignores everything the client sends. Close codes:
// 4001 token expired (mint a new token and reconnect), 4011 database
// unavailable (reconnect with backoff, or poll /api).

import { upgradeWebSocket } from "@neon/functions";
import { neon } from "@neondatabase/serverless";
import { jwtVerify } from "jose";
import { LiveEvent, type ConnectionRequest, type HelpRequest, type PersonSummary } from "../shared/contract.js";

const ISSUER = "hacky-api";
const AUDIENCE = "hacky-realtime";
const MAX_TOKEN_LIFETIME_MS = 15 * 60_000;
const CLOCK_SKEW_MS = 30_000;
const MAX_EVENTS_PER_TOKEN = 20;

const POLL_MS = 1_500;
const HEARTBEAT_MS = 25_000;
// Rows get created_at from their transaction's start, so a row can commit a
// little after a newer one. Each poll looks back this far past the newest row
// sent and skips ids it already sent.
const OVERLAP_MS = 10_000;
const OVERLAP = `${OVERLAP_MS / 1000} seconds`;
const PAGE_SIZE = 100;
const MAX_POLL_FAILURES = 20;

const CLOSE_TOKEN_EXPIRED = 4001;
const CLOSE_DB_UNAVAILABLE = 4011;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const secret = process.env.REALTIME_TOKEN_SECRET
  ? new TextEncoder().encode(process.env.REALTIME_TOKEN_SECRET)
  : null;
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
type Sql = NonNullable<typeof sql>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface Identity {
  userId: string;
  eventIds: string[];
  expiresAtMs: number;
}

// HS256 only, issuer hacky-api, audience hacky-realtime, sub = user id,
// eventIds = event uuids, expiring within 15 minutes.
async function verifyToken(key: Uint8Array, token: string | null): Promise<Identity | null> {
  if (!token || token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      requiredClaims: ["sub", "exp"],
    });
    const { sub, exp, iat, eventIds } = payload;
    if (typeof sub !== "string" || sub.length < 1 || sub.length > 64) return null;
    if (typeof exp !== "number") return null;
    const expiresAtMs = exp * 1000;
    if (expiresAtMs - Date.now() > MAX_TOKEN_LIFETIME_MS + CLOCK_SKEW_MS) return null;
    if (typeof iat === "number" && (exp - iat) * 1000 > MAX_TOKEN_LIFETIME_MS) return null;
    if (
      !Array.isArray(eventIds) ||
      eventIds.length < 1 ||
      eventIds.length > MAX_EVENTS_PER_TOKEN ||
      !eventIds.every((id) => typeof id === "string" && UUID_RE.test(id))
    ) {
      return null;
    }
    const ids = [...new Set((eventIds as string[]).map((id) => id.toLowerCase()))];
    return { userId: sub, eventIds: ids, expiresAtMs };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

// since: the newest row sent, as fixed-width UTC ISO text with microseconds
// (sorts as text, round-trips through ::timestamptz exactly).
// seen: ids sent within the overlap window, with their time in ms.
interface Feed {
  since: string;
  sinceMs: number;
  seen: Map<string, number>;
}

interface Feeds {
  connectedAt: string;
  requestsIn: Feed;
  requestsOut: Feed;
  helpOpen: Feed;
  helpClaimed: Feed;
  messages: Feed;
}

function newFeeds(connectedAt: string): Feeds {
  const feed = (): Feed => ({ since: connectedAt, sinceMs: Date.parse(connectedAt), seen: new Map() });
  return {
    connectedAt,
    requestsIn: feed(),
    requestsOut: feed(),
    helpOpen: feed(),
    helpClaimed: feed(),
    messages: feed(),
  };
}

// Records a row and says whether it is new. Advances the cursor.
function admit(feed: Feed, id: string, cursor: string, at: Date): boolean {
  if (feed.seen.has(id)) return false;
  feed.seen.set(id, at.getTime());
  if (cursor > feed.since) {
    feed.since = cursor;
    feed.sinceMs = Math.max(feed.sinceMs, at.getTime());
  }
  return true;
}

function prune(feed: Feed) {
  const keepAfter = feed.sinceMs - OVERLAP_MS - 2_000;
  for (const [id, ms] of feed.seen) if (ms < keepAfter) feed.seen.delete(id);
}

const iso = (value: unknown): string => (value instanceof Date ? value : new Date(String(value))).toISOString();
const isoOrNull = (value: unknown): string | null => (value == null ? null : iso(value));

interface PersonCols {
  person_id: string;
  handle: string;
  name: string;
  hacky_style: Record<string, unknown>;
  photo_url: string | null;
  role: string;
}

function person(row: PersonCols): PersonSummary {
  return {
    userId: row.person_id,
    handle: row.handle,
    name: row.name,
    hackyStyle: row.hacky_style ?? {},
    photoUrl: row.photo_url ?? null,
    role: row.role as PersonSummary["role"],
  };
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  client_id: string | null;
  body: string;
  kind: string;
  created_at: Date;
  cursor: string;
}

interface ConnectionRow extends PersonCols {
  id: string;
  status: string;
  intro: string;
  source: string;
  created_at: Date;
  responded_at: Date | null;
  hidden_at?: Date | null;
  team_id: string | null;
  team_name: string | null;
  conversation_id: string | null;
  cursor_at: Date;
  cursor: string;
}

interface HelpRow {
  id: string;
  title: string;
  details: string | null;
  skills_needed: string[];
  status: string;
  created_at: Date;
  claimed_at: Date | null;
  resolved_at: Date | null;
  conversation_id: string | null;
  hacker_id: string;
  hacker_handle: string;
  hacker_name: string;
  hacker_style: Record<string, unknown>;
  hacker_photo_url: string | null;
  hacker_role: string;
  mentor_id: string | null;
  mentor_handle: string | null;
  mentor_name: string | null;
  mentor_style: Record<string, unknown> | null;
  mentor_photo_url: string | null;
  mentor_role: string | null;
  cursor_at: Date;
  cursor: string;
}

function requestFields(row: ConnectionRow) {
  return {
    id: row.id,
    status: row.status as ConnectionRequest["status"],
    intro: row.intro,
    source: row.source as ConnectionRequest["source"],
    person: person(row),
    team: row.team_id && row.team_name ? { id: row.team_id, name: row.team_name } : null,
    conversationId: row.conversation_id,
    createdAt: iso(row.created_at),
    respondedAt: isoOrNull(row.responded_at),
  };
}

function helpRequest(row: HelpRow): HelpRequest {
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    skillsNeeded: row.skills_needed ?? [],
    status: row.status as HelpRequest["status"],
    hacker: {
      userId: row.hacker_id,
      handle: row.hacker_handle,
      name: row.hacker_name,
      hackyStyle: row.hacker_style ?? {},
      photoUrl: row.hacker_photo_url ?? null,
      role: row.hacker_role as PersonSummary["role"],
    },
    mentor:
      row.mentor_id && row.mentor_handle && row.mentor_name && row.mentor_role
        ? {
            userId: row.mentor_id,
            handle: row.mentor_handle,
            name: row.mentor_name,
            hackyStyle: row.mentor_style ?? {},
            photoUrl: row.mentor_photo_url ?? null,
            role: row.mentor_role as PersonSummary["role"],
          }
        : null,
    conversationId: row.conversation_id,
    createdAt: iso(row.created_at),
    claimedAt: isoOrNull(row.claimed_at),
    resolvedAt: isoOrNull(row.resolved_at),
  };
}

const seenIds = (feed: Feed) => [...feed.seen.keys()];

// One HTTP round trip per poll: five read-only queries in one transaction.
// Each query is driven by an index (to_user/status, from_user, the help queue,
// hacker_id, conversation_members.user_id + messages(conversation_id, created_at)).
// Blocks hide rows in both directions.
async function poll(db: Sql, me: Identity, f: Feeds): Promise<{ events: LiveEvent[]; full: boolean }> {
  const { userId, eventIds } = me;
  const start = f.connectedAt;

  const results = await db.transaction(
    [
      // request-new: pending requests to me.
      db`
        select c.id, c.status, c.intro, c.source, c.created_at, c.responded_at, c.hidden_at,
               p.user_id as person_id, p.handle, p.name, p.hacky_style, p.photo_url, em.role,
               t.id as team_id, t.name as team_name, null::uuid as conversation_id,
               c.created_at as cursor_at,
               to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor
        from connections c
        join profiles p on p.user_id = c.from_user
        join event_members em on em.event_id = c.event_id and em.user_id = c.from_user
        left join teams t on t.id = c.team_id
        where c.to_user = ${userId}
          and c.status = 'pending'
          and c.event_id = any(${eventIds}::uuid[])
          and c.created_at > greatest(${f.requestsIn.since}::timestamptz - ${OVERLAP}::interval, ${start}::timestamptz)
          and c.id <> all(${seenIds(f.requestsIn)}::uuid[])
          and not exists (
            select 1 from blocks b
            where (b.blocker_id = ${userId} and b.blocked_id = c.from_user)
               or (b.blocker_id = c.from_user and b.blocked_id = ${userId}))
        order by c.created_at, c.id
        limit ${PAGE_SIZE}`,
      // request-updated: my requests that were accepted. hidden_at is never read.
      db`
        select c.id, c.status, c.intro, c.source, c.created_at, c.responded_at,
               p.user_id as person_id, p.handle, p.name, p.hacky_style, p.photo_url, em.role,
               t.id as team_id, t.name as team_name, conv.id as conversation_id,
               c.responded_at as cursor_at,
               to_char(c.responded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor
        from connections c
        join profiles p on p.user_id = c.to_user
        join event_members em on em.event_id = c.event_id and em.user_id = c.to_user
        left join teams t on t.id = c.team_id
        left join conversations conv
          on conv.kind = 'dm' and conv.event_id = c.event_id
         and conv.dm_user_low = least(c.from_user, c.to_user)
         and conv.dm_user_high = greatest(c.from_user, c.to_user)
        where c.from_user = ${userId}
          and c.status = 'accepted'
          and c.responded_at is not null
          and c.event_id = any(${eventIds}::uuid[])
          and c.responded_at > greatest(${f.requestsOut.since}::timestamptz - ${OVERLAP}::interval, ${start}::timestamptz)
          and c.id <> all(${seenIds(f.requestsOut)}::uuid[])
          and not exists (
            select 1 from blocks b
            where (b.blocker_id = ${userId} and b.blocked_id = c.to_user)
               or (b.blocker_id = c.to_user and b.blocked_id = ${userId}))
        order by c.responded_at, c.id
        limit ${PAGE_SIZE}`,
      // help-new: open help requests, only where I'm a verified mentor.
      db`
        select h.id, h.title, h.details, h.skills_needed, h.status, h.created_at, h.claimed_at, h.resolved_at,
               conv.id as conversation_id,
               hp.user_id as hacker_id, hp.handle as hacker_handle, hp.name as hacker_name,
               hp.hacky_style as hacker_style, hp.photo_url as hacker_photo_url, hem.role as hacker_role,
               null::text as mentor_id, null::text as mentor_handle, null::text as mentor_name,
               null::jsonb as mentor_style, null::text as mentor_photo_url, null::text as mentor_role,
               h.created_at as cursor_at,
               to_char(h.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor
        from help_requests h
        join event_members me
          on me.event_id = h.event_id and me.user_id = ${userId} and me.role = 'mentor' and me.verified
        join profiles hp on hp.user_id = h.hacker_id
        join event_members hem on hem.event_id = h.event_id and hem.user_id = h.hacker_id
        left join conversations conv on conv.help_request_id = h.id
        where h.event_id = any(${eventIds}::uuid[])
          and h.status = 'open'
          and h.hacker_id <> ${userId}
          and h.created_at > greatest(${f.helpOpen.since}::timestamptz - ${OVERLAP}::interval, ${start}::timestamptz)
          and h.id <> all(${seenIds(f.helpOpen)}::uuid[])
          and not exists (
            select 1 from blocks b
            where (b.blocker_id = ${userId} and b.blocked_id = h.hacker_id)
               or (b.blocker_id = h.hacker_id and b.blocked_id = ${userId}))
        order by h.created_at, h.id
        limit ${PAGE_SIZE}`,
      // help-claimed: my help requests that a mentor claimed.
      db`
        select h.id, h.title, h.details, h.skills_needed, h.status, h.created_at, h.claimed_at, h.resolved_at,
               conv.id as conversation_id,
               hp.user_id as hacker_id, hp.handle as hacker_handle, hp.name as hacker_name,
               hp.hacky_style as hacker_style, hp.photo_url as hacker_photo_url, hem.role as hacker_role,
               mp.user_id as mentor_id, mp.handle as mentor_handle, mp.name as mentor_name,
               mp.hacky_style as mentor_style, mp.photo_url as mentor_photo_url, mem.role::text as mentor_role,
               h.claimed_at as cursor_at,
               to_char(h.claimed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor
        from help_requests h
        join profiles hp on hp.user_id = h.hacker_id
        join event_members hem on hem.event_id = h.event_id and hem.user_id = h.hacker_id
        left join profiles mp on mp.user_id = h.mentor_id
        left join event_members mem on mem.event_id = h.event_id and mem.user_id = h.mentor_id
        left join conversations conv on conv.help_request_id = h.id
        where h.hacker_id = ${userId}
          and h.event_id = any(${eventIds}::uuid[])
          and h.status <> 'open'
          and h.claimed_at is not null
          and h.claimed_at > greatest(${f.helpClaimed.since}::timestamptz - ${OVERLAP}::interval, ${start}::timestamptz)
          and h.id <> all(${seenIds(f.helpClaimed)}::uuid[])
        order by h.claimed_at, h.id
        limit ${PAGE_SIZE}`,
      // message-new: messages in conversations I'm a member of (my own too, so
      // other tabs and the sender's instant copy get the real row).
      db`
        select m.id, m.conversation_id, m.sender_id, m.client_id, m.body, m.kind, m.created_at,
               to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor
        from conversation_members cm
        join conversations c on c.id = cm.conversation_id
        join messages m on m.conversation_id = cm.conversation_id
        where cm.user_id = ${userId}
          and c.event_id = any(${eventIds}::uuid[])
          and m.created_at > greatest(${f.messages.since}::timestamptz - ${OVERLAP}::interval, ${start}::timestamptz)
          and m.id <> all(${seenIds(f.messages)}::uuid[])
          and not exists (
            select 1 from blocks b join conversation_members o on o.conversation_id = c.id
            where (b.blocker_id = ${userId} and b.blocked_id = o.user_id)
               or (b.blocker_id = o.user_id and b.blocked_id = ${userId}))
        order by m.created_at, m.id
        limit ${PAGE_SIZE}`,
    ],
    { readOnly: true },
  );

  const [requestsIn, requestsOut, helpOpen, helpClaimed, messages] = results as unknown as [
    ConnectionRow[],
    ConnectionRow[],
    HelpRow[],
    HelpRow[],
    MessageRow[],
  ];

  const events: LiveEvent[] = [];
  for (const row of requestsIn) {
    if (!admit(f.requestsIn, row.id, row.cursor, row.cursor_at)) continue;
    events.push({
      type: "request-new",
      request: { ...requestFields(row), direction: "incoming", hiddenAt: isoOrNull(row.hidden_at) },
    });
  }
  for (const row of requestsOut) {
    if (!admit(f.requestsOut, row.id, row.cursor, row.cursor_at)) continue;
    events.push({ type: "request-updated", request: { ...requestFields(row), direction: "outgoing" } });
  }
  for (const row of helpOpen) {
    if (!admit(f.helpOpen, row.id, row.cursor, row.cursor_at)) continue;
    events.push({ type: "help-new", helpRequest: helpRequest(row) });
  }
  for (const row of helpClaimed) {
    if (!admit(f.helpClaimed, row.id, row.cursor, row.cursor_at)) continue;
    events.push({ type: "help-claimed", helpRequest: helpRequest(row) });
  }
  for (const row of messages) {
    if (!admit(f.messages, row.id, row.cursor, row.created_at)) continue;
    events.push({
      type: "message-new",
      message: {
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        clientId: row.client_id,
        body: row.body,
        kind: row.kind as "text" | "card" | "system",
        createdAt: iso(row.created_at),
      },
    });
  }

  for (const feed of [f.requestsIn, f.requestsOut, f.helpOpen, f.helpClaimed, f.messages]) prune(feed);
  const full = [requestsIn, requestsOut, helpOpen, helpClaimed, messages].some((rows) => rows.length >= PAGE_SIZE);
  return { events, full };
}

async function dbNow(db: Sql): Promise<string> {
  const rows = (await db`
    select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`) as { now: string }[];
  const now = rows[0]?.now;
  if (!now) throw new Error("no time from database");
  return now;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

// Polling stops as soon as either side starts closing. Don't wait for the
// socket's `close` event: on Neon the TCP connection can linger after the close
// handshake, so `close` may never fire on either end. The token expiry caps a
// connection at 15 minutes regardless.
function serve(socket: WebSocket, db: Sql, me: Identity, connectedAt: string) {
  const feeds = newFeeds(connectedAt);
  const openedAt = Date.now();
  let closed = false;
  let failures = 0;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;

  const stop = (why: string) => {
    if (closed) return;
    closed = true;
    clearTimeout(pollTimer);
    clearInterval(heartbeat);
    clearTimeout(expiry);
    console.log(`[realtime] stopped after ${Math.round((Date.now() - openedAt) / 1000)}s: ${why}`);
  };
  const close = (code: number, reason: string) => {
    stop(reason);
    try {
      socket.close(code, reason);
    } catch {
      // already closing
    }
  };
  // CLOSING or CLOSED: the client said goodbye (or the runtime dropped it).
  const gone = () => socket.readyState === socket.CLOSING || socket.readyState === socket.CLOSED;
  const send = (text: string) => {
    if (closed) return;
    if (gone()) return stop("client closed");
    if (socket.readyState === socket.OPEN) socket.send(text);
  };

  expiry = setTimeout(
    () => close(CLOSE_TOKEN_EXPIRED, "token expired"),
    Math.max(0, me.expiresAtMs - Date.now()),
  );

  const tick = async () => {
    if (closed) return;
    if (gone()) return stop("client closed");
    let full = false;
    try {
      const result = await poll(db, me, feeds);
      failures = 0;
      full = result.full;
      for (const event of result.events) {
        const checked = LiveEvent.safeParse(event);
        if (!checked.success) {
          console.error(
            "[realtime] dropped an event that doesn't match the contract",
            event.type,
            checked.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
          );
          continue;
        }
        send(JSON.stringify(event));
      }
    } catch (err) {
      failures += 1;
      console.error(`[realtime] poll failed (${failures} in a row)`, err);
      if (failures >= MAX_POLL_FAILURES) return close(CLOSE_DB_UNAVAILABLE, "database unavailable");
    }
    if (closed) return;
    const delay = failures > 0 ? Math.min(POLL_MS * 2 ** failures, 10_000) : full ? 50 : POLL_MS;
    pollTimer = setTimeout(tick, delay);
  };

  socket.addEventListener("open", () => {
    heartbeat = setInterval(() => send('{"type":"ping"}'), HEARTBEAT_MS);
    void tick();
  });
  socket.addEventListener("close", () => stop("socket closed"));
  socket.addEventListener("error", () => close(1000, "socket error"));
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Hacky live updates. Open a WebSocket with ?token=<jwt>.\n", {
        status: 426,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (!secret || !sql) {
      console.error("[realtime] REALTIME_TOKEN_SECRET or DATABASE_URL is not set");
      return new Response("not configured", { status: 500 });
    }

    const me = await verifyToken(secret, new URL(request.url).searchParams.get("token"));
    if (!me) return new Response("unauthorized", { status: 401 });

    // The cursor starts at database time before the socket opens, so every row
    // committed after the client's `open` is delivered.
    let connectedAt: string;
    try {
      connectedAt = await dbNow(sql);
    } catch (err) {
      console.error("[realtime] database unavailable", err);
      return new Response("unavailable", { status: 503 });
    }

    const { socket, response } = upgradeWebSocket(request);
    serve(socket, sql, me, connectedAt);
    return response;
  },
};
