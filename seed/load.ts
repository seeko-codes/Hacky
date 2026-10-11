// Loads seed/people.json into Neon. Idempotent: every row is an upsert, and
// embeddings are only recomputed for profiles or teams whose text changed (or
// that have none yet), so a rerun after a rate limit picks up where it stopped.
//
//   npm run seed:load
//
// A database that is already in use (the demo is live, demo_you is mid-chat)
// takes a partial load instead. It leaves events and every person outside the
// selection untouched:
//
//   npm run seed:load -- --new                 people not in the database yet
//   npm run seed:load -- --only=maya_backend,…  just these people
//   npm run seed:load -- --sync-availability   also set seeded mentors' availability
//
// A partial load includes the seed teams its people own.

import { setTimeout as sleep } from "node:timers/promises";
import { and, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { embedTexts } from "../server/agent/model.js";
import { db } from "../server/db/index.js";
import {
  embeddings,
  eventMembers,
  events,
  memberProfiles,
  profiles,
  teamMembers,
  teams,
  user,
} from "../server/db/schema.js";
import { emailFor, readPeople, userIdFor, type SeedData, type SeedPerson, type SeedTeam } from "./people-schema.js";
import { memberProfileText, teamProfileText } from "./profile-text.js";
import { geminiCalls, withRetry } from "./retry.js";

const EMBED_BATCH = 40;
const WRITE_CHUNK = 25;

const excluded = (column: string): SQL => sql.raw(`excluded."${column}"`);

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Options = { only: Set<string> | null; addNew: boolean; syncAvailability: boolean };

function parseArgs(argv: string[]): Options {
  const only = argv.find((a) => a.startsWith("--only="));
  return {
    only: only ? new Set(only.slice("--only=".length).split(",").map((h) => h.trim()).filter(Boolean)) : null,
    addNew: argv.includes("--new"),
    syncAvailability: argv.includes("--sync-availability"),
  };
}

async function main() {
  const data = readPeople();
  const opts = parseArgs(process.argv.slice(2));
  const partial = opts.addNew || opts.only !== null;

  // Who to load: everyone, or the selection a partial load asks for.
  let people = data.people;
  if (opts.only) {
    const unknown = [...opts.only].filter((h) => !data.people.some((p) => p.handle === h));
    if (unknown.length) throw new Error(`Not in seed/people.json: ${unknown.join(", ")}`);
    people = people.filter((p) => opts.only!.has(p.handle));
  }
  if (opts.addNew) {
    const ids = people.map((p) => userIdFor(p.handle));
    const loaded = new Set((await db.select({ id: user.id }).from(user).where(inArray(user.id, ids))).map((u) => u.id));
    people = people.filter((p) => !loaded.has(userIdFor(p.handle)));
  }
  const selected = new Set(people.map((p) => p.handle));
  const seedTeams = partial ? data.teams.filter((t) => selected.has(t.owner)) : data.teams;

  const eventId = partial ? await loadedEvents(data.events.map((e) => e.slug)) : await upsertEvents(data);
  const eventIds = [...eventId.values()];

  if (opts.syncAvailability) await syncMentorAvailability(data.people, eventId);
  if (people.length === 0) {
    console.log("No people to load.");
    return;
  }
  if (partial) console.log(`Partial load: ${people.length} people (${[...selected].join(", ")}) and ${seedTeams.length} teams.`);

  await loadPeople({ people, seedTeams, eventId, eventIds, eventCount: data.events.length });
}

/** Event ids by slug for a partial load, which never changes events. */
async function loadedEvents(slugs: string[]): Promise<Map<string, string>> {
  const rows = await db.select({ id: events.id, slug: events.slug }).from(events).where(inArray(events.slug, slugs));
  const missing = slugs.filter((slug) => !rows.some((r) => r.slug === slug));
  if (missing.length) throw new Error(`Events ${missing.join(", ")} are not loaded; run a full npm run seed:load first`);
  return new Map(rows.map((e) => [e.slug, e.id]));
}

/** Sets each seeded mentor's availability to the seed value where it differs. */
async function syncMentorAvailability(people: SeedPerson[], eventId: Map<string, string>): Promise<void> {
  const updates = people.flatMap((p) =>
    p.memberships
      .filter((m) => m.role === "mentor" && eventId.has(m.event))
      .map((m) =>
        db
          .update(eventMembers)
          .set({ availability: m.availability })
          .where(and(
            eq(eventMembers.eventId, eventId.get(m.event)!),
            eq(eventMembers.userId, userIdFor(p.handle)),
            ne(eventMembers.availability, m.availability),
          ))
          .returning({ userId: eventMembers.userId, availability: eventMembers.availability }),
      ),
  );
  if (updates.length === 0) return;
  const results = await db.batch(updates as [(typeof updates)[number], ...(typeof updates)[number][]]);
  const changed = results.flat().map((r) => `${r.userId} → ${r.availability}`);
  console.log(changed.length ? `Mentor availability: ${changed.join(", ")}` : "Mentor availability already matches the seed.");
}

/** Upserts the events. A non-empty theme already in the database wins over an empty seed theme. */
async function upsertEvents(data: SeedData): Promise<Map<string, string>> {
  const eventRows = await db
    .insert(events)
    .values(data.events.map((e) => ({
      slug: e.slug,
      name: e.name,
      tracks: e.tracks,
      theme: e.theme,
      startsAt: e.startsAt ? new Date(e.startsAt) : null,
      endsAt: e.endsAt ? new Date(e.endsAt) : null,
    })))
    .onConflictDoUpdate({
      target: events.slug,
      set: {
        name: excluded("name"),
        tracks: excluded("tracks"),
        startsAt: excluded("starts_at"),
        endsAt: excluded("ends_at"),
        theme: sql.raw(`case when excluded.theme = '{}'::jsonb then "events"."theme" else excluded.theme end`),
      },
    })
    .returning({ id: events.id, slug: events.slug });
  return new Map(eventRows.map((e) => [e.slug, e.id]));
}

async function loadPeople({
  people,
  seedTeams,
  eventId,
  eventIds,
  eventCount,
}: {
  people: SeedPerson[];
  seedTeams: SeedTeam[];
  eventId: Map<string, string>;
  eventIds: string[];
  eventCount: number;
}) {
  // Better Auth users and profiles.
  await db
    .insert(user)
    .values(people.map((p) => ({ id: userIdFor(p.handle), name: p.name, email: emailFor(p.handle), emailVerified: true })))
    .onConflictDoUpdate({
      target: user.id,
      set: { name: excluded("name"), email: excluded("email"), emailVerified: true, updatedAt: sql`now()` },
    });

  await db
    .insert(profiles)
    .values(people.map((p) => ({
      userId: userIdFor(p.handle),
      handle: p.handle,
      name: p.name,
      hackyStyle: p.hackyStyle,
      photoUrl: p.photoUrl ?? null,
      bio: p.bio,
      links: p.links,
      isDemo: true,
    })))
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        handle: excluded("handle"),
        name: excluded("name"),
        hackyStyle: excluded("hacky_style"),
        photoUrl: excluded("photo_url"),
        bio: excluded("bio"),
        links: excluded("links"),
        isDemo: true,
        updatedAt: sql`now()`,
      },
    });

  // Memberships.
  const memberships = people.flatMap((p) =>
    p.memberships.map((m) => ({ ...m, userId: userIdFor(p.handle), eventId: eventId.get(m.event)! })),
  );
  await db
    .insert(eventMembers)
    .values(memberships.map((m) => ({
      eventId: m.eventId,
      userId: m.userId,
      role: m.role,
      verified: m.verified,
      availability: m.availability,
      looking: m.looking,
    })))
    .onConflictDoUpdate({
      target: [eventMembers.eventId, eventMembers.userId],
      set: {
        role: excluded("role"),
        verified: excluded("verified"),
        availability: excluded("availability"),
        looking: excluded("looking"),
      },
    });

  // Work out which embeddings are missing or stale, before touching profiles,
  // so an interrupted run notices the same changes next time.
  const userIds = memberships.map((m) => m.userId);
  const [existingProfiles, existingTeams, existingEmbeddings] = await Promise.all([
    db.select().from(memberProfiles).where(and(inArray(memberProfiles.eventId, eventIds), inArray(memberProfiles.userId, userIds))),
    seedTeams.length ? db.select().from(teams).where(inArray(teams.id, seedTeams.map((t) => t.id))) : Promise.resolve([]),
    db
      .select({ eventId: embeddings.eventId, ownerKind: embeddings.ownerKind, ownerId: embeddings.ownerId })
      .from(embeddings)
      .where(inArray(embeddings.eventId, eventIds)),
  ]);
  const key = (event: string, kind: string, owner: string) => `${event}|${kind}|${owner}`;
  const hasEmbedding = new Set(existingEmbeddings.map((e) => key(e.eventId, e.ownerKind, e.ownerId)));
  const oldMemberText = new Map(existingProfiles.map((p) => [key(p.eventId, "member", p.userId), memberProfileText(p)]));
  const oldTeamText = new Map(existingTeams.map((t) => [key(t.eventId, "team", t.id), teamProfileText(t)]));

  type Job = { eventId: string; ownerKind: "member" | "team"; ownerId: string; text: string };
  const jobs: Job[] = [];
  const dropEmbeddings: { eventId: string; userId: string }[] = [];

  for (const m of memberships) {
    if (!m.intake.complete) {
      // Incomplete profiles get embedded by the intake once they're done.
      dropEmbeddings.push({ eventId: m.eventId, userId: m.userId });
      continue;
    }
    const k = key(m.eventId, "member", m.userId);
    const text = memberProfileText(m.intake);
    if (!hasEmbedding.has(k) || oldMemberText.get(k) !== text) {
      jobs.push({ eventId: m.eventId, ownerKind: "member", ownerId: m.userId, text });
    }
  }
  const teamRows = seedTeams.map((t) => ({
    id: t.id,
    eventId: eventId.get(t.event)!,
    ownerId: userIdFor(t.owner),
    name: t.name,
    idea: t.idea,
    track: t.track,
    wantedSkills: t.wantedSkills,
    maxSize: t.maxSize,
  }));
  for (const t of teamRows) {
    const k = key(t.eventId, "team", t.id);
    const text = teamProfileText(t);
    if (!hasEmbedding.has(k) || oldTeamText.get(k) !== text) {
      jobs.push({ eventId: t.eventId, ownerKind: "team", ownerId: t.id, text });
    }
  }

  // Embed in batches, pausing between them for the free tier.
  console.log(`Embedding ${jobs.length} of ${memberships.length - dropEmbeddings.length + teamRows.length} profiles and teams…`);
  const vectors: number[][] = [];
  for (const [i, batch] of chunks(jobs, EMBED_BATCH).entries()) {
    if (i > 0) await sleep(2_000);
    vectors.push(...(await withRetry("embed", "embed", () => embedTexts(batch.map((j) => j.text), "document"))));
  }

  // Write profiles, teams, team members and embeddings in one transaction.
  const writes: BatchItem<"pg">[] = [];
  writes.push(
    db
      .insert(memberProfiles)
      .values(memberships.map((m) => ({ eventId: m.eventId, userId: m.userId, ...m.intake })))
      .onConflictDoUpdate({
        target: [memberProfiles.eventId, memberProfiles.userId],
        set: {
          skills: excluded("skills"),
          skillsWanted: excluded("skills_wanted"),
          experience: excluded("experience"),
          wantsExperienced: excluded("wants_experienced"),
          goal: excluded("goal"),
          track: excluded("track"),
          interests: excluded("interests"),
          idea: excluded("idea"),
          summary: excluded("summary"),
          complete: excluded("complete"),
          motivations: excluded("motivations"),
          updatedAt: sql`now()`,
        },
      }),
  );
  if (teamRows.length) {
    writes.push(
      db
        .insert(teams)
        .values(teamRows)
        .onConflictDoUpdate({
          target: teams.id,
          set: {
            eventId: excluded("event_id"),
            ownerId: excluded("owner_id"),
            name: excluded("name"),
            idea: excluded("idea"),
            track: excluded("track"),
            wantedSkills: excluded("wanted_skills"),
            maxSize: excluded("max_size"),
          },
        }),
      db.delete(teamMembers).where(inArray(teamMembers.teamId, teamRows.map((t) => t.id))),
      // The owner counts toward the team's size, so they get a row too.
      db.insert(teamMembers).values(
        seedTeams.flatMap((t) => [t.owner, ...t.members].map((handle) => ({ teamId: t.id, userId: userIdFor(handle) }))),
      ),
    );
  }
  for (const part of chunks(jobs.map((j, i) => ({ ...j, embedding: vectors[i]! })), WRITE_CHUNK)) {
    writes.push(
      db
        .insert(embeddings)
        .values(part.map(({ text: _text, ...row }) => row))
        .onConflictDoUpdate({
          target: [embeddings.eventId, embeddings.ownerKind, embeddings.ownerId],
          set: { embedding: excluded("embedding"), updatedAt: sql`now()` },
        }),
    );
  }
  for (const d of dropEmbeddings) {
    writes.push(
      db
        .delete(embeddings)
        .where(and(eq(embeddings.eventId, d.eventId), eq(embeddings.ownerKind, "member"), eq(embeddings.ownerId, d.userId))),
    );
  }
  await db.batch(writes as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  console.log(
    `Loaded ${eventCount} events, ${people.length} people, ${memberships.length} memberships, ${seedTeams.length} teams; embedded ${jobs.length}.`,
  );
  console.log(`Gemini embed calls: ${geminiCalls.embed}`);
}

await main();
