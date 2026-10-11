// Demo portal (DEMO_MODE=true only; 404 otherwise):
//   GET  /api/demo/people   seeded demo people and their events
//   POST /api/demo/sign-in  starts a real Better Auth session for one of them
//   GET  /api/demo/portal   a stand-in "KnightHacks portal" page
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { DemoSignInBody, type DemoPerson, type HackyStyle } from "../../shared/contract.js";
import { auth, isDemoMode } from "../auth.js";
import { db } from "../db/index.js";
import { eventMembers, events, profiles } from "../db/schema.js";
import { fail, readJson, type AppEnv } from "./http.js";
import { loadMe } from "./me.js";
import { portalHtml } from "./demo-portal.js";

export const demoRoutes = new Hono<AppEnv>()
  .use("/demo/*", async (_c, next) => {
    if (!isDemoMode()) throw fail.notFound();
    await next();
  })

  .get("/demo/people", async (c) => {
    const rows = await db
      .select({
        userId: profiles.userId,
        handle: profiles.handle,
        name: profiles.name,
        hackyStyle: profiles.hackyStyle,
        photoUrl: profiles.photoUrl,
        slug: events.slug,
        eventName: events.name,
        role: eventMembers.role,
        verified: eventMembers.verified,
      })
      .from(profiles)
      .leftJoin(eventMembers, eq(eventMembers.userId, profiles.userId))
      .leftJoin(events, eq(events.id, eventMembers.eventId))
      .where(eq(profiles.isDemo, true))
      .orderBy(asc(profiles.name), asc(events.name));

    const people = new Map<string, DemoPerson>();
    for (const row of rows) {
      let person = people.get(row.userId);
      if (!person) {
        person = {
          userId: row.userId,
          handle: row.handle,
          name: row.name,
          hackyStyle: row.hackyStyle as HackyStyle,
          photoUrl: row.photoUrl,
          events: [],
        };
        people.set(row.userId, person);
      }
      if (row.slug && row.eventName && row.role && row.verified !== null) {
        person.events.push({ slug: row.slug, name: row.eventName, role: row.role, verified: row.verified });
      }
    }
    return c.json({ people: [...people.values()] });
  })

  .post("/demo/sign-in", async (c) => {
    const { userId } = await readJson(c, DemoSignInBody);
    const { headers } = await auth.api.demoSignIn({
      body: { userId },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    for (const cookie of headers.getSetCookie()) c.header("Set-Cookie", cookie, { append: true });
    c.header("Cache-Control", "no-store");
    const [profile] = await db
      .select({ name: profiles.name })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    return c.json(await loadMe({ id: userId, name: profile?.name ?? "Hacker" }));
  })

  .get("/demo/portal", (c) => {
    c.header("Cache-Control", "no-store");
    return c.html(portalHtml);
  });
