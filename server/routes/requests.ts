// Message requests and blocks: /api/events/:slug/requests, /api/requests/:id/*, /api/blocks.
// The rules live in server/social/requests.ts; these handlers parse and check membership.
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { BlockBody, SendRequestBody, Slug, Uuid, type RequestResult } from "../../shared/contract.js";
import { db } from "../db/index.js";
import { eventMembers, events } from "../db/schema.js";
import {
  acceptRequest,
  blockUser,
  hideRequest,
  listRequests,
  sendRequest,
} from "../social/requests.js";
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

export const requestsRoutes = new Hono<AppEnv>()
  .get("/events/:slug/requests", async (c) => {
    const { user, eventId } = await requireEventMember(c);
    return c.json({ requests: await listRequests(eventId, user.id) });
  })

  .post("/events/:slug/requests", async (c) => {
    const { user, eventId } = await requireEventMember(c);
    const body = await readJson(c, SendRequestBody);
    return c.json<RequestResult>({ request: await sendRequest(eventId, user.id, body) });
  })

  .post("/requests/:id/accept", async (c) => {
    const user = requireUser(c);
    const { id } = readParams(c, IdParams);
    return c.json<RequestResult>({ request: await acceptRequest(user.id, id) });
  })

  .post("/requests/:id/hide", async (c) => {
    const user = requireUser(c);
    const { id } = readParams(c, IdParams);
    await hideRequest(user.id, id);
    return c.json({ ok: true as const });
  })

  .post("/blocks", async (c) => {
    const user = requireUser(c);
    const { userId } = await readJson(c, BlockBody);
    await blockUser(user.id, userId);
    return c.json({ ok: true as const });
  });
