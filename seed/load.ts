// Loads seed/people.json into Neon. Idempotent: every row is an upsert, and
// embeddings are only recomputed for profiles or teams whose text changed (or
// that have none yet), so a rerun after a rate limit picks up where it stopped.
//
//   npm run seed:load

import { setTimeout as sleep } from "node:timers/promises";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
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
import { emailFor, readPeople, userIdFor } from "./people-schema.js";
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

async function main() {
  const data = readPeople();

  // Events. A non-empty theme already in the database wins over an empty seed theme.
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
  const eventId = new Map(eventRows.map((e) => [e.slug, e.id]));
  const eventIds = [...eventId.values()];

  // Better Auth users and profiles.
  await db
    .insert(user)
    .values(data.people.map((p) => ({ id: userIdFor(p.handle), name: p.name, email: emailFor(p.handle), emailVerified: true })))
    .onConflictDoUpdate({
      target: user.id,
      set: { name: excluded("name"), email: excluded("email"), emailVerified: true, updatedAt: sql`now()` },
    });

  await db
    .insert(profiles)
    .values(data.people.map((p) => ({
      userId: userIdFor(p.handle),
      handle: p.handle,
      name: p.name,
      hackyStyle: p.hackyStyle,
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
        bio: excluded("bio"),
        links: excluded("links"),
        isDemo: true,
        updatedAt: sql`now()`,
      },
    });

  // Memberships.
  const memberships = data.people.flatMap((p) =>
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
    db.select().from(teams).where(inArray(teams.id, data.teams.map((t) => t.id))),
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
  const teamRows = data.teams.map((t) => ({
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
        data.teams.flatMap((t) => [t.owner, ...t.members].map((handle) => ({ teamId: t.id, userId: userIdFor(handle) }))),
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
    `Loaded ${data.events.length} events, ${data.people.length} people, ${memberships.length} memberships, ${data.teams.length} teams; embedded ${jobs.length}.`,
  );
  console.log(`Gemini embed calls: ${geminiCalls.embed}`);
}

await main();
