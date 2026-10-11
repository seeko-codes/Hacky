// Conversations and messages: the server functions behind
// server/routes/conversations.ts (agent tools can reuse them). Each one takes
// the signed-in user's id and checks membership itself. A user who isn't a
// member of the conversation (and of its event) gets 404, so ids don't leak.
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  ConversationKind,
  ConversationSummary,
  HelpStatus,
  MemberRole,
  Message,
  MessageKind,
  MessagePage,
} from "../../shared/contract.js";
import { db } from "../db/index.js";
import { conversationMembers, messages } from "../db/schema.js";
import { withTransaction } from "../db/tx.js";
import { ApiFail, fail } from "../routes/http.js";

type MessageRow = typeof messages.$inferSelect;

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    clientId: row.clientId,
    body: row.body,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
  };
}

// Raw SQL rows bypass Drizzle's date mapping, so timestamps are formatted in
// SQL exactly like Date.toISOString().
const iso = (column: string) =>
  sql.raw(`to_char((${column}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

const notFound = () => fail.notFound("Conversation not found.");

// The user is in the conversation and still a member of its event.
const isMember = (conversationId: string, userId: string) => sql`exists (
  select 1
  from conversation_members cm
  join conversations c on c.id = cm.conversation_id
  join event_members em on em.event_id = c.event_id and em.user_id = cm.user_id
  where cm.conversation_id = ${conversationId} and cm.user_id = ${userId}
)`;

// A block in either direction between the user and any other member.
const isBlocked = (conversationId: string, userId: string) => sql`exists (
  select 1
  from conversation_members o
  join blocks b
    on (b.blocker_id = ${userId} and b.blocked_id = o.user_id)
    or (b.blocker_id = o.user_id and b.blocked_id = ${userId})
  where o.conversation_id = ${conversationId} and o.user_id <> ${userId}
)`;

// ---------------------------------------------------------------------------
// GET /api/events/:slug/conversations
// ---------------------------------------------------------------------------

type SummaryRow = {
  id: string;
  kind: ConversationKind;
  created_at: string;
  help_id: string | null;
  help_title: string | null;
  help_status: HelpStatus | null;
  peer_id: string;
  peer_handle: string;
  peer_name: string;
  peer_hacky_style: Record<string, unknown>;
  peer_photo_url: string | null;
  peer_role: MemberRole;
  peer_last_read_at: string | null;
  lm_id: string | null;
  lm_sender_id: string | null;
  lm_client_id: string | null;
  lm_body: string | null;
  lm_kind: MessageKind | null;
  lm_created_at: string | null;
  unread_count: number;
};

// The user's DM and mentor conversations in one event, newest activity first.
// Conversations with someone blocked (either direction) are left out.
// The caller has already checked event membership.
export async function listConversations(
  eventId: string,
  userId: string,
): Promise<ConversationSummary[]> {
  const { rows } = await db.execute<SummaryRow>(sql`
    select
      c.id,
      c.kind::text as kind,
      ${iso("c.created_at")} as created_at,
      hr.id as help_id,
      hr.title as help_title,
      hr.status::text as help_status,
      peer.user_id as peer_id,
      p.handle as peer_handle,
      p.name as peer_name,
      p.hacky_style as peer_hacky_style,
      p.photo_url as peer_photo_url,
      coalesce(em.role::text, 'hacker') as peer_role,
      ${iso("peer.last_read_at")} as peer_last_read_at,
      lm.id as lm_id,
      lm.sender_id as lm_sender_id,
      lm.client_id as lm_client_id,
      lm.body as lm_body,
      lm.kind::text as lm_kind,
      ${iso("lm.created_at")} as lm_created_at,
      (
        select count(*)::int
        from messages u
        where u.conversation_id = c.id
          and u.sender_id is distinct from me.user_id
          and (me.last_read_at is null or u.created_at > me.last_read_at)
      ) as unread_count
    from conversation_members me
    join conversations c on c.id = me.conversation_id
    join lateral (
      select o.user_id, o.last_read_at
      from conversation_members o
      where o.conversation_id = c.id and o.user_id <> me.user_id
      order by o.joined_at
      limit 1
    ) peer on true
    join profiles p on p.user_id = peer.user_id
    left join event_members em on em.event_id = c.event_id and em.user_id = peer.user_id
    left join help_requests hr on hr.id = c.help_request_id
    left join lateral (
      select m.id, m.sender_id, m.client_id, m.body, m.kind, m.created_at
      from messages m
      where m.conversation_id = c.id
      order by m.created_at desc, m.id desc
      limit 1
    ) lm on true
    where me.user_id = ${userId}
      and c.event_id = ${eventId}
      and not exists (
        select 1 from blocks b
        where (b.blocker_id = me.user_id and b.blocked_id = peer.user_id)
           or (b.blocker_id = peer.user_id and b.blocked_id = me.user_id)
      )
    order by coalesce(lm.created_at, c.created_at) desc, c.id desc
  `);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    peer: {
      userId: row.peer_id,
      handle: row.peer_handle,
      name: row.peer_name,
      hackyStyle: row.peer_hacky_style,
      photoUrl: row.peer_photo_url,
      role: row.peer_role,
    },
    helpRequest:
      row.help_id && row.help_title && row.help_status
        ? { id: row.help_id, title: row.help_title, status: row.help_status }
        : null,
    lastMessage:
      row.lm_id && row.lm_body !== null && row.lm_kind && row.lm_created_at
        ? {
            id: row.lm_id,
            conversationId: row.id,
            senderId: row.lm_sender_id,
            clientId: row.lm_client_id,
            body: row.lm_body,
            kind: row.lm_kind,
            createdAt: row.lm_created_at,
          }
        : null,
    unreadCount: row.unread_count,
    peerLastReadAt: row.peer_last_read_at,
    createdAt: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// GET /api/conversations/:id/messages
// ---------------------------------------------------------------------------

export type MessagePageQuery = { before?: string; after?: string; limit: number };

// Cursors are message ids in this conversation, compared by (created_at, id).
// No cursor: the newest page. before: the page just older than the cursor.
// after: the page just newer (hasMore means keep fetching after the last one).
// Messages always come back oldest first.
export async function getMessagePage(
  userId: string,
  conversationId: string,
  query: MessagePageQuery,
): Promise<MessagePage> {
  const cursorId = query.before ?? query.after;
  const { rows } = await db.execute<{ member: boolean; cursor_ok: boolean }>(sql`
    select
      ${isMember(conversationId, userId)} as member,
      ${
        cursorId
          ? sql`exists (select 1 from messages where id = ${cursorId} and conversation_id = ${conversationId})`
          : sql`true`
      } as cursor_ok
  `);
  const access = rows[0];
  if (!access?.member) throw notFound();
  if (!access.cursor_ok) throw fail.invalid("That cursor isn't a message in this conversation.");

  const cursor = sql`(select cur.created_at, cur.id from messages cur where cur.id = ${cursorId ?? null})`;
  const position = query.before
    ? sql`(${messages.createdAt}, ${messages.id}) < ${cursor}`
    : query.after
      ? sql`(${messages.createdAt}, ${messages.id}) > ${cursor}`
      : undefined;
  const order = query.after
    ? [asc(messages.createdAt), asc(messages.id)]
    : [desc(messages.createdAt), desc(messages.id)];

  const found = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), position))
    .orderBy(...order)
    .limit(query.limit + 1);

  const hasMore = found.length > query.limit;
  const page = found.slice(0, query.limit);
  if (!query.after) page.reverse();
  return { messages: page.map(toMessage), hasMore };
}

// ---------------------------------------------------------------------------
// POST /api/conversations/:id/messages
// ---------------------------------------------------------------------------

type RawMessage = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  client_id: string | null;
  body: string;
  kind: MessageKind;
  created_at: string;
};

const fromRaw = (row: RawMessage): Message => ({
  id: row.id,
  conversationId: row.conversation_id,
  senderId: row.sender_id,
  clientId: row.client_id,
  body: row.body,
  kind: row.kind,
  createdAt: row.created_at,
});

async function findByClientId(userId: string, clientId: string) {
  const [row] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.senderId, userId), eq(messages.clientId, clientId)))
    .limit(1);
  return row;
}

const blockedError = () => fail.forbidden("You can't message this person.");

// Idempotent on (sender, clientId): a retry returns the message that was
// already saved (created: false) instead of failing or duplicating it.
export async function sendMessage(
  userId: string,
  conversationId: string,
  input: { clientId: string; body: string },
): Promise<{ message: Message; created: boolean }> {
  const [access, existing] = await Promise.all([
    db
      .execute<{ member: boolean; blocked: boolean }>(sql`
        select
          ${isMember(conversationId, userId)} as member,
          ${isBlocked(conversationId, userId)} as blocked
      `)
      .then((result) => result.rows[0]),
    findByClientId(userId, input.clientId),
  ]);
  if (!access?.member) throw notFound();

  const replay = (row: MessageRow) => {
    if (row.conversationId !== conversationId) {
      throw new ApiFail(409, "conflict", "That clientId was already used in another conversation.");
    }
    return { message: toMessage(row), created: false };
  };
  if (existing) return replay(existing);
  if (access.blocked) throw blockedError();

  // The block check is repeated in the insert so a block made a moment ago still wins.
  const { rows } = await db.execute<RawMessage>(sql`
    insert into messages (conversation_id, sender_id, client_id, body, kind)
    select ${conversationId}::uuid, ${userId}, ${input.clientId}::uuid, ${input.body}, 'text'::message_kind
    where not ${isBlocked(conversationId, userId)}
    on conflict (sender_id, client_id) do nothing
    returning id, conversation_id, sender_id, client_id, body, kind::text as kind,
      ${iso("created_at")} as created_at
  `);
  const inserted = rows[0];
  if (inserted) return { message: fromRaw(inserted), created: true };

  // Nothing inserted: a concurrent retry won the race, or a block just appeared.
  const raced = await findByClientId(userId, input.clientId);
  if (raced) return replay(raced);
  throw blockedError();
}

// ---------------------------------------------------------------------------
// DELETE /api/conversations/:id/messages/:messageId
// ---------------------------------------------------------------------------

// Unsend: the sender deletes their own message for everyone in the chat. Only
// the row goes: no table references messages (no foreign keys or triggers), so
// requests, connections, teams and help requests are untouched. System
// messages can't be deleted. Not a member: 404, like the other routes. A
// message that's already gone is 404 too, which the web app treats as deleted.
export function deleteRefusal(
  row: { senderId: string | null; kind: MessageKind } | undefined,
  userId: string,
): ApiFail | null {
  if (!row) return fail.notFound("That message isn't here anymore.");
  if (row.kind === "system" || row.senderId === null) {
    return fail.forbidden("System messages can't be deleted.");
  }
  if (row.senderId !== userId) return fail.forbidden("You can only delete your own messages.");
  return null;
}

// Checked and deleted in one transaction, with the row locked in between. The
// delete repeats the sender check, so a system message (no sender) can never match.
export async function deleteMessage(
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  await withTransaction(async (tx) => {
    const { rows } = await tx.execute<{ member: boolean }>(sql`
      select ${isMember(conversationId, userId)} as member
    `);
    if (!rows[0]?.member) throw notFound();
    const [row] = await tx
      .select({ senderId: messages.senderId, kind: messages.kind })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
      .for("update");
    const refusal = deleteRefusal(row, userId);
    if (refusal) throw refusal;
    await tx
      .delete(messages)
      .where(and(eq(messages.id, messageId), eq(messages.senderId, userId)));
  });
}

// ---------------------------------------------------------------------------
// POST /api/conversations/:id/read
// ---------------------------------------------------------------------------

// Unread counts are messages from others created after last_read_at.
export async function markRead(userId: string, conversationId: string): Promise<Date> {
  const [row] = await db
    .update(conversationMembers)
    .set({ lastReadAt: sql`now()` })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
        isMember(conversationId, userId),
      ),
    )
    .returning({ lastReadAt: conversationMembers.lastReadAt });
  if (!row?.lastReadAt) throw notFound();
  return row.lastReadAt;
}
