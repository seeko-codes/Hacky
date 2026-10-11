// POST /api/realtime/token: a short-lived token for the live-updates Neon
// Function (browsers can't send auth headers on a WebSocket, so the web app
// hands this token to the function, which verifies it before sending anything).
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { SignJWT } from "jose";
import { RealtimeTokenBody, type RealtimeToken } from "../../shared/contract.js";
import { db } from "../db/index.js";
import { eventMembers, events } from "../db/schema.js";
import { ApiFail, fail, readJson, requireUser, type AppEnv } from "./http.js";

const ISSUER = "hacky-api";
const AUDIENCE = "hacky-realtime";
const TTL_SECONDS = 10 * 60;

const unavailable = (detail: string) =>
  new ApiFail(503, "internal", `Live updates aren't available right now (${detail}). Poll /api instead.`);

// The function's https:// base URL as a WebSocket URL (http:// becomes ws:// for local runs).
function websocketUrl(base: string | undefined): string | null {
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol !== "wss:" && url.protocol !== "ws:") return null;
  return url.toString();
}

export const realtimeRoutes = new Hono<AppEnv>().post("/realtime/token", async (c) => {
  const user = requireUser(c);
  const { eventSlug } = await readJson(c, RealtimeTokenBody);

  const memberships = await db
    .select({ id: events.id, slug: events.slug })
    .from(eventMembers)
    .innerJoin(events, eq(events.id, eventMembers.eventId))
    .where(eq(eventMembers.userId, user.id));
  if (!memberships.some((event) => event.slug === eventSlug)) {
    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.slug, eventSlug))
      .limit(1);
    if (!event) throw fail.notFound("No event with that slug.");
    throw fail.forbidden("You're not a member of this event.");
  }

  const url = websocketUrl(process.env.NEON_FUNCTION_REALTIME_BASE_URL);
  if (!url) throw unavailable("the realtime function URL isn't configured");
  const secret = process.env.REALTIME_TOKEN_SECRET;
  if (!secret) throw unavailable("the token secret isn't configured");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + TTL_SECONDS;
  const token = await new SignJWT({ eventIds: memberships.map((event) => event.id) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));

  const body: RealtimeToken = { token, url, expiresAt: new Date(exp * 1000).toISOString() };
  return c.json(body);
});
