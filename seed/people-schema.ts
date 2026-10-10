// The shape of seed/people.json, checked with Zod before it is written and
// again whenever it is read. Field shapes come from shared/contract.ts.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  Availability,
  Handle,
  Intake,
  MemberRole,
  ProfileLinks,
  Slug,
  Tag,
  Timestamp,
  Uuid,
} from "../shared/contract.js";

export const PEOPLE_PATH = new URL("./people.json", import.meta.url);

export const KNIGHTHACKS = "knighthacks-ix";
export const DEMO_HACKS = "demo-hacks";

// Option ids from react/src/mascot-data.js (looks, colors, flairs, moves).
export const HACKY_LOOKS = ["knit", "mochi", "cat", "dragon", "star", "pixel"] as const;
export const HACKY_COLORS = ["original", "berry", "mint", "sunset", "rose", "ice"] as const;
export const HACKY_FLAIRS = ["none", "stars", "hearts"] as const;
export const HACKY_MOVES = ["idle", "bounce", "dance", "hype"] as const;

export const SeedHackyStyle = z.object({
  look: z.enum(HACKY_LOOKS),
  color: z.enum(HACKY_COLORS),
  flair: z.enum(HACKY_FLAIRS),
  move: z.enum(HACKY_MOVES),
});
export type SeedHackyStyle = z.infer<typeof SeedHackyStyle>;

export const SeedEvent = z.object({
  slug: Slug,
  name: z.string().trim().min(1).max(80),
  tracks: z.array(z.string().trim().min(1).max(80)).min(1),
  theme: z.record(z.string(), z.unknown()),
  startsAt: Timestamp.nullable(),
  endsAt: Timestamp.nullable(),
});
export type SeedEvent = z.infer<typeof SeedEvent>;

export const SeedMembership = z.object({
  event: Slug,
  role: MemberRole,
  verified: z.boolean(),
  availability: Availability,
  looking: z.boolean(),
  intake: Intake,
});
export type SeedMembership = z.infer<typeof SeedMembership>;

export const SeedPerson = z.object({
  handle: Handle,
  name: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(500).nullable(),
  links: ProfileLinks,
  hackyStyle: SeedHackyStyle,
  memberships: z.array(SeedMembership).min(1),
});
export type SeedPerson = z.infer<typeof SeedPerson>;

// members excludes the owner; the loader adds the owner to team_members too.
export const SeedTeam = z.object({
  id: Uuid,
  key: Handle,
  event: Slug,
  name: z.string().trim().min(1).max(80),
  owner: Handle,
  members: z.array(Handle),
  idea: z.string().trim().max(1000).nullable(),
  track: z.string().trim().max(80).nullable(),
  wantedSkills: z.array(Tag).min(1).max(10),
  maxSize: z.number().int().min(2).max(8),
});
export type SeedTeam = z.infer<typeof SeedTeam>;

export const SeedData = z
  .object({
    version: z.literal(1),
    generatedAt: Timestamp,
    model: z.string(),
    events: z.array(SeedEvent).min(1),
    people: z.array(SeedPerson).min(1),
    teams: z.array(SeedTeam),
  })
  .superRefine((data, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    const events = new Map(data.events.map((e) => [e.slug, e]));
    if (events.size !== data.events.length) issue("Duplicate event slugs");

    const people = new Map<string, SeedPerson>();
    for (const person of data.people) {
      if (people.has(person.handle)) issue(`Duplicate handle ${person.handle}`);
      people.set(person.handle, person);
      const seen = new Set<string>();
      for (const m of person.memberships) {
        const event = events.get(m.event);
        if (!event) issue(`${person.handle}: unknown event ${m.event}`);
        if (seen.has(m.event)) issue(`${person.handle}: two memberships in ${m.event}`);
        seen.add(m.event);
        const track = m.intake.track;
        if (event && track && !event.tracks.includes(track)) {
          issue(`${person.handle}: track ${track} is not a ${m.event} track`);
        }
      }
    }

    const teamIds = new Set<string>();
    const onTeam = new Set<string>();
    for (const team of data.teams) {
      if (teamIds.has(team.id)) issue(`Duplicate team id ${team.id}`);
      teamIds.add(team.id);
      const everyone = [team.owner, ...team.members];
      for (const handle of everyone) {
        const membership = people.get(handle)?.memberships.find((m) => m.event === team.event);
        if (membership?.role !== "hacker") issue(`${team.key}: ${handle} is not a hacker in ${team.event}`);
        const key = `${team.event}:${handle}`;
        if (onTeam.has(key)) issue(`${team.key}: ${handle} is already on a team`);
        onTeam.add(key);
      }
      const openSpots = team.maxSize - everyone.length;
      if (openSpots < 1 || openSpots > 2) issue(`${team.key}: ${openSpots} open spots, want 1-2`);
      const event = events.get(team.event);
      if (!event) issue(`${team.key}: unknown event ${team.event}`);
      if (event && team.track && !event.tracks.includes(team.track)) {
        issue(`${team.key}: track ${team.track} is not a ${team.event} track`);
      }
    }
  });
export type SeedData = z.infer<typeof SeedData>;

export function readPeople(): SeedData {
  return SeedData.parse(JSON.parse(readFileSync(PEOPLE_PATH, "utf8")));
}

/** Better Auth user id for a seeded person. */
export const userIdFor = (handle: string) => `demo_${handle}`;
export const emailFor = (handle: string) => `${handle}@demo.hacky.app`;

/** Stable UUID for a seeded team, so reloading updates the same row. */
export function teamIdFor(event: string, key: string): string {
  const hex = createHash("sha256").update(`hacky-seed-team:${event}:${key}`).digest("hex");
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
