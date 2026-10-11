// Conversations and messages: GET /api/events/:slug/conversations,
// GET and POST /api/conversations/:id/messages, POST /api/conversations/:id/read.
// The rules live in server/social/conversations.ts.
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { MessagesQuery, SendMessageBody, Slug, Uuid } from "../../shared/contract.js";
import { db } from "../db/index.js";
import { eventMembers, events } from "../db/schema.js";
import {
  getMessagePage,
  listConversations,
  markRead,
  sendMessage,
} from "../social/conversations.js";
import { fail, readJson, readParams, requireUser, type AppContext, type AppEnv } from "./http.js";

const SlugParams = z.object({ slug: Slug });
const IdParams = z.object({ id: Uuid });

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

  .post("/conversations/:id/read", async (c) => {
    const user = requireUser(c);
    const { id } = readParams(c, IdParams);
    const lastReadAt = await markRead(user.id, id);
    return c.json({ lastReadAt: lastReadAt.toISOString() });
  });
