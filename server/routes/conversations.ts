// Conversations and messages: GET /api/events/:slug/conversations,
// GET and POST /api/conversations/:id/messages,
// DELETE /api/conversations/:id/messages/:messageId, POST /api/conversations/:id/read.
// The rules live in server/social/conversations.ts.
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { AddTeamChatMemberBody, MessagesQuery, SendMessageBody, Slug, Uuid } from "../../shared/contract.js";
import { ensureDemoTeamChat, addDemoTeamMember } from "../social/demo.js";
import { db } from "../db/index.js";
import { eventMembers, events } from "../db/schema.js";
import {
  deleteMessage,
  getMessagePage,
  listConversations,
  markRead,
  sendMessage,
} from "../social/conversations.js";
import { fail, readJson, readParams, requireUser, type AppContext, type AppEnv } from "./http.js";

const SlugParams = z.object({ slug: Slug });
const IdParams = z.object({ id: Uuid });
const MessageParams = z.object({ id: Uuid, messageId: Uuid });

// 404 for an unknown event, 403 when the user isn't a member.
async function requireEventMember(c: AppContext) {
  const user = requireUser(c);
  const { slug } = readParams(c, SlugParams);
  const [row] = await db
    .select({ eventId: events.id, memberId: eventMembers.userId })
    .from(events)
    .leftJoin(
      eventMembers,
      and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, user.id)),
    )
    .where(eq(events.slug, slug))
    .limit(1);
  if (!row) throw fail.notFound("No event with that slug.");
  if (!row.memberId) throw fail.forbidden("You're not a member of this event.");
  return { user, eventId: row.eventId };
}

function readQuery<T extends z.ZodType>(c: AppContext, schema: T): z.infer<T> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) throw fail.invalid(z.prettifyError(result.error));
  return result.data;
}

export const conversationsRoutes = new Hono<AppEnv>()
  .post("/events/:slug/demo/team-chat", async c => {
    const { user, eventId } = await requireEventMember(c);
    return c.json({ conversationId: await ensureDemoTeamChat(eventId, user.id) });
  })
  .post("/conversations/:id/team-members", async c => {
    const user = requireUser(c);
    const { id } = readParams(c, IdParams);
    const { userId } = await readJson(c, AddTeamChatMemberBody);
    return c.json({ conversationId: await addDemoTeamMember(id, user.id, userId) });
  })
  .get("/events/:slug/conversations", async (c) => {
    const { user, eventId } = await requireEventMember(c);
    return c.json({ conversations: await listConversations(eventId, user.id) });
  })

  .get("/conversations/:id/messages", async (c) => {
    const user = requireUser(c);
    const { id } = readParams(c, IdParams);
    const query = readQuery(c, MessagesQuery);
    return c.json(await getMessagePage(user.id, id, query));
  })

  // 201 for a new message, 200 when a retry returns the one already saved.
  .post("/conversations/:id/messages", async (c) => {
    const user = requireUser(c);
    const { id } = readParams(c, IdParams);
    const body = await readJson(c, SendMessageBody);
    const { message, created } = await sendMessage(user.id, id, body);
    return c.json({ message }, created ? 201 : 200);
  })

  // Unsend: only the sender, never a system message. Removed for everyone.
  .delete("/conversations/:id/messages/:messageId", async (c) => {
    const user = requireUser(c);
    const { id, messageId } = readParams(c, MessageParams);
    await deleteMessage(user.id, id, messageId);
    return c.json({ ok: true as const });
  })

  .post("/conversations/:id/read", async (c) => {
    const user = requireUser(c);
    const { id } = readParams(c, IdParams);
    const lastReadAt = await markRead(user.id, id);
    return c.json({ lastReadAt: lastReadAt.toISOString() });
  });
