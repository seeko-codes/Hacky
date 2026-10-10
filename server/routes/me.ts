// GET /api/me and PATCH /api/me/profile.
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  UpdateProfileBody,
  type Me,
  type ProfileLinks,
  type PublicProfile,
} from "../../shared/contract.js";
import { ensureProfile } from "../auth.js";
import { db } from "../db/index.js";
import { eventMembers, events, profiles } from "../db/schema.js";
import { fail, readJson, requireUser, type AppEnv } from "./http.js";

type ProfileRow = typeof profiles.$inferSelect;

const LINK_KEYS = ["github", "linkedin", "website"] as const;

function publicLinks(links: Record<string, string>): ProfileLinks {
  const out: ProfileLinks = {};
  for (const key of LINK_KEYS) if (typeof links[key] === "string") out[key] = links[key];
  return out;
}

// Only public fields: never the email.
export function toPublicProfile(row: ProfileRow): PublicProfile {
  return {
    userId: row.userId,
    handle: row.handle,
    name: row.name,
    hackyStyle: row.hackyStyle,
    bio: row.bio,
    links: publicLinks(row.links),
    isDemo: row.isDemo,
  };
}

async function findProfile(userId: string) {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return row;
}

export async function loadMe(user: { id: string; name: string }): Promise<Me> {
  let profile = await findProfile(user.id);
  if (!profile) {
    // Normally created by the user.create hook; this covers users made elsewhere.
    await ensureProfile(user);
    profile = await findProfile(user.id);
  }
  if (!profile) throw fail.notFound("Profile not found.");

  const memberships = await db
    .select({
      slug: events.slug,
      name: events.name,
      role: eventMembers.role,
      verified: eventMembers.verified,
    })
    .from(eventMembers)
    .innerJoin(events, eq(events.id, eventMembers.eventId))
    .where(eq(eventMembers.userId, user.id))
    .orderBy(asc(events.startsAt), asc(events.name));

  return { profile: toPublicProfile(profile), events: memberships };
}

export const meRoutes = new Hono<AppEnv>()
  .get("/me", async (c) => c.json(await loadMe(requireUser(c))))
  .patch("/me/profile", async (c) => {
    const user = requireUser(c);
    const body = await readJson(c, UpdateProfileBody);

    const changes: Partial<typeof profiles.$inferInsert> = {};
    if (body.name !== undefined) changes.name = body.name;
    if (body.bio !== undefined) changes.bio = body.bio === "" ? null : body.bio;
    if (body.hackyStyle !== undefined) changes.hackyStyle = body.hackyStyle;
    if (body.links !== undefined) changes.links = publicLinks(body.links as Record<string, string>);

    if (Object.keys(changes).length === 0) {
      const { profile } = await loadMe(user);
      return c.json(profile);
    }
    await ensureProfile(user);
    const [updated] = await db
      .update(profiles)
      .set(changes)
      .where(eq(profiles.userId, user.id))
      .returning();
    if (!updated) throw fail.notFound("Profile not found.");
    return c.json(toPublicProfile(updated));
  });
