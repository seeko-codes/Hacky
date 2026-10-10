// Generates fictional hackathon people with Gemini structured output and
// writes seed/people.json (committed, so every demo run uses the same data).
// Skips if the file exists unless run with --force.
//
//   npm run seed:generate [-- --force]
//
// Slots below fix each person's event, role, track, experience, goal and team
// so the mix is controlled; Gemini fills in names, skills, ideas and bios.

import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { generateText, Output } from "ai";
import { z } from "zod";
import { CHAT_MODEL_ID, chatModel } from "../server/agent/model.js";
import { Motivation, type Availability, type Experience, type HackGoal, type Intake } from "../shared/contract.js";
import { heroPeople, heroTeams } from "./heroes.js";
import {
  DEMO_HACKS,
  HACKY_COLORS,
  HACKY_FLAIRS,
  HACKY_LOOKS,
  HACKY_MOVES,
  KNIGHTHACKS,
  PEOPLE_PATH,
  SeedData,
  teamIdFor,
  type SeedEvent,
  type SeedPerson,
  type SeedTeam,
} from "./people-schema.js";
import { geminiCalls, withRetry } from "./retry.js";

const events: SeedEvent[] = [
  {
    slug: KNIGHTHACKS,
    name: "Knight Hacks IX",
    tracks: ["AI", "Health", "Sustainability", "Fintech", "Games"],
    theme: {},
    startsAt: null,
    endsAt: null,
  },
  {
    slug: DEMO_HACKS,
    name: "Demo Hacks",
    tracks: ["Education", "Climate", "Developer Tools", "Social Impact"],
    theme: {},
    startsAt: null,
    endsAt: null,
  },
];

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

type HackerSlot = {
  id: string;
  role: "hacker";
  track: string;
  experience: Experience;
  goal: HackGoal;
  looking: boolean;
  wantsExperienced?: boolean;
  focus: string;
};
type StaffSlot = {
  id: string;
  role: "mentor" | "sponsor";
  availability: Availability;
  focus: string;
};
type Slot = HackerSlot | StaffSlot;
type TeamSlot = {
  key: string;
  track: string;
  owner: string; // slot id
  members: string[]; // slot ids, owner excluded
  maxSize: number;
  wantedSkills: string[];
  hint: string;
};
type Batch = { event: SeedEvent; slots: Slot[]; teams: TeamSlot[]; extraRules: string[] };

const h = (
  id: string,
  track: string,
  experience: Experience,
  goal: HackGoal,
  focus: string,
  opts: { looking?: boolean; wantsExperienced?: boolean } = {},
): HackerSlot => ({ id, role: "hacker", track, experience, goal, focus, looking: opts.looking ?? true, wantsExperienced: opts.wantsExperienced });

// Knight Hacks: 22 generated hackers + 8 hand-written = 30 (9 beginners).
// Team members other than the owner are not looking.
const knightHacks: Batch = {
  event: events[0]!,
  slots: [
    h("kh01", "AI", "advanced", "win", "ML engineer building LLM agents with retrieval (Python, vector databases)"),
    h("kh02", "AI", "advanced", "ship", "data scientist (pandas, scikit-learn, SQL, notebooks)", { looking: false }),
    h("kh03", "AI", "intermediate", "win", "full-stack web dev who builds AI-powered apps (Next.js, TypeScript, OpenAI-style APIs)"),
    h("kh04", "AI", "intermediate", "learn", "iOS developer (Swift, SwiftUI) curious about on-device ML"),
    h("kh05", "AI", "intermediate", "ship", "frontend dev (Vue, Tailwind) who wants to ship an AI product"),
    h("kh06", "AI", "beginner", "learn", "CS freshman who knows basic Python and wants to try AI APIs", { wantsExperienced: true }),
    h("kh07", "AI", "beginner", "learn", "math major learning Python and Jupyter notebooks"),
    h("kh08", "Health", "intermediate", "win", "mobile dev (React Native, Expo) who likes fitness and habit apps"),
    h("kh09", "Health", "beginner", "learn", "nursing student who learned Figma and some HTML and wants to build tools for patients", { wantsExperienced: true }),
    h("kh10", "Sustainability", "advanced", "win", "embedded and IoT engineer (C, Arduino, Raspberry Pi, sensors)"),
    h("kh11", "Sustainability", "intermediate", "ship", "data visualization dev (D3.js, Python, maps and GIS)", { looking: false }),
    h("kh12", "Sustainability", "intermediate", "learn", "backend dev (Go, Postgres) who cares about climate data"),
    h("kh13", "Sustainability", "beginner", "learn", "environmental science student who knows R and spreadsheets", { wantsExperienced: true }),
    h("kh14", "Sustainability", "beginner", "ship", "first-timer who knows HTML, CSS and a bit of JavaScript"),
    h("kh15", "Fintech", "advanced", "win", "backend engineer from a payments internship (Java, Spring Boot, Kafka)"),
    h("kh16", "Fintech", "intermediate", "win", "full-stack dev (Django, React) into personal finance", { looking: false }),
    h("kh17", "Fintech", "intermediate", "ship", "quant-curious data person (Python, statistics, SQL)"),
    h("kh18", "Fintech", "beginner", "learn", "business and finance student who pitches well and uses no-code tools", { wantsExperienced: true }),
    h("kh19", "Games", "advanced", "win", "game developer (Unity, C#, shaders)"),
    h("kh20", "Games", "intermediate", "ship", "pixel artist and Godot developer", { looking: false }),
    h("kh21", "Games", "beginner", "learn", "beginner who knows Scratch and some JavaScript and loves games"),
    h("kh22", "Games", "beginner", "learn", "music producer learning web audio and JavaScript", { wantsExperienced: true }),
    { id: "khm1", role: "mentor", availability: "available", focus: "ML and AI research engineer (PyTorch, LLMs, computer vision)" },
    { id: "khm2", role: "mentor", availability: "available", focus: "frontend and design systems engineer (React, CSS, accessibility)" },
    { id: "khm3", role: "mentor", availability: "available", focus: "mobile engineer (iOS, Android, Flutter)" },
    { id: "khm4", role: "mentor", availability: "busy", focus: "cloud and DevOps engineer (AWS, Docker, CI/CD)" },
    { id: "khm5", role: "mentor", availability: "offline", focus: "data engineer (SQL, Spark, data pipelines)" },
    { id: "khs1", role: "sponsor", availability: "available", focus: "developer advocate at a fictional cloud database startup" },
    { id: "khs2", role: "sponsor", availability: "available", focus: "university recruiter at a fictional fintech company" },
  ],
  teams: [
    { key: "copilot_team", track: "AI", owner: "kh01", members: ["kh02"], maxSize: 4, wantedSkills: ["backend", "APIs", "Docker"], hint: "an AI assistant that needs a backend to serve its model" },
    { key: "greengrid_team", track: "Sustainability", owner: "kh10", members: ["kh11"], maxSize: 3, wantedSkills: ["mobile", "Flutter", "app development"], hint: "sensor hardware plus a map, needs a phone app" },
    { key: "ledger_team", track: "Fintech", owner: "kh15", members: ["kh16"], maxSize: 4, wantedSkills: ["UI design", "Figma", "mobile"], hint: "a student budgeting product that needs a designer" },
    { key: "pixel_team", track: "Games", owner: "kh19", members: ["kh20"], maxSize: 3, wantedSkills: ["sound design", "music", "JavaScript"], hint: "a small game that needs music and sound" },
  ],
  extraRules: [
    "Only people in the Health track may list health, medical or wellness interests.",
    "Only kh12 and kh15 may be backend-focused; nobody else lists the tag \"backend\".",
  ],
};

// Demo Hacks: 10 generated hackers + demo_you, 2 mentors, one open team.
const demoHacks: Batch = {
  event: events[1]!,
  slots: [
    h("dh01", "Developer Tools", "advanced", "win", "developer tools engineer (Rust, TypeScript, CLIs)"),
    h("dh02", "Education", "intermediate", "ship", "full-stack dev (SvelteKit, Firebase)"),
    h("dh03", "Climate", "intermediate", "learn", "data analyst (Python, SQL, Tableau)"),
    h("dh04", "Social Impact", "beginner", "learn", "first-year student who knows HTML and CSS", { wantsExperienced: true }),
    h("dh05", "Education", "intermediate", "win", "Android developer (Kotlin, Jetpack Compose)"),
    h("dh06", "Climate", "advanced", "ship", "backend developer (Python, Django, Postgres)"),
    h("dh07", "Developer Tools", "beginner", "learn", "beginner who knows Java from class"),
    h("dh08", "Social Impact", "intermediate", "ship", "UX designer (Figma, user research)"),
    h("dh09", "Education", "beginner", "learn", "teacher's aide learning JavaScript", { wantsExperienced: true }),
    h("dh10", "Developer Tools", "intermediate", "win", "ML engineer (Python, Hugging Face-style transformers)"),
    { id: "dhm1", role: "mentor", availability: "available", focus: "full-stack web engineer (React, Node.js, databases)" },
    { id: "dhm2", role: "mentor", availability: "available", focus: "product and pitching coach, former startup founder" },
  ],
  teams: [
    { key: "patchwork_team", track: "Developer Tools", owner: "dh01", members: [], maxSize: 3, wantedSkills: ["frontend", "React", "docs"], hint: "a developer tool that needs a web UI and docs" },
  ],
  extraRules: [],
};

// ---------------------------------------------------------------------------
// Gemini output (kept simple: Gemini supports a subset of JSON Schema)
// ---------------------------------------------------------------------------

const GenPerson = z.object({
  slot: z.string().describe("The slot id this person fills, copied exactly"),
  name: z.string().describe("Fictional full name"),
  handle: z.string().describe("Lowercase letters, digits and underscores, 3-20 characters"),
  bio: z.string().describe("First person, 1-2 casual sentences, under 200 characters"),
  skills: z.array(z.string()).describe("Short skill tags"),
  skillsWanted: z.array(z.string()).describe("Skills they want from teammates; empty for mentors and sponsors"),
  interests: z.array(z.string()).describe("2-4 short lowercase topics"),
  idea: z.string().describe("One-sentence project idea, or an empty string if open to ideas"),
  summary: z.string().describe("Third person, 1-2 sentences, under 300 characters"),
  motivations: z.array(Motivation).describe("1-3 reasons they came"),
});
type GenPerson = z.infer<typeof GenPerson>;

const GenTeam = z.object({
  key: z.string().describe("The team key, copied exactly"),
  name: z.string().describe("Catchy team name, 1-2 words"),
  idea: z.string().describe("One sentence describing what the team is building"),
});

const GenBatch = z.object({ people: z.array(GenPerson), teams: z.array(GenTeam) });
type GenBatch = z.infer<typeof GenBatch>;

const BANNED = /blockchain|web3|crypto(?!graph)|\bnfts?\b|quantum|haskell|cobol/i;

function prompt(batch: Batch, taken: SeedPerson[]): string {
  const slotLines = batch.slots.map((slot) => {
    const team = batch.teams.find((t) => t.owner === slot.id || t.members.includes(slot.id));
    const teamNote = team ? (team.owner === slot.id ? `owns team ${team.key}` : `member of team ${team.key}`) : undefined;
    return JSON.stringify(
      slot.role === "hacker"
        ? { slot: slot.id, role: "hacker", track: slot.track, experience: slot.experience, goal: slot.goal, focus: slot.focus, ...(slot.wantsExperienced ? { wantsExperiencedTeammate: true } : {}), ...(teamNote ? { team: teamNote } : {}) }
        : { slot: slot.id, role: slot.role, focus: slot.focus },
    );
  });
  const teamLines = batch.teams.map((t) =>
    JSON.stringify({ key: t.key, track: t.track, owner: t.owner, members: t.members, wantedSkills: t.wantedSkills, hint: t.hint }),
  );

  return `You write realistic, varied, fictional attendees for Hacky, a demo app that matches hackathon attendees with teammates and mentors.

Event: ${batch.event.name}, a 36-hour student hackathon. Tracks: ${batch.event.tracks.join(", ")}.

Write exactly one person per slot below and copy each slot id into "slot". Follow each slot's role, track, experience, goal and focus closely.

Rules for everyone:
- Everyone is fictional. Never use real people, real companies, real startups or real school names. Invented company and product names must not resemble real ones, and handles never contain company or product names.
- Names: realistic first and last names from many different backgrounds, with no titles like "Dr.". No two people share a first name or a last name.
- handle: lowercase, 3-20 characters, letters, digits and underscores only, based on the person's name plus a short hint (like "priya_builds"). All handles unique.
- bio: first person, 1-2 casual sentences, under 200 characters. No links, no emoji, no hashtags.
- skills: hackers 3-7 tags (beginners 2-4). Use common spellings like "React", "TypeScript", "Node.js", "Python", "Postgres", "Figma", "Unity", "C#". Include one broad role tag that fits, from: frontend, backend, full-stack, ML, data, design, mobile, hardware, game dev, DevOps, product.
- skillsWanted: hackers 1-3 tags for what they need from teammates, preferring the broad role tags. Mentors and sponsors: empty.
- interests: 2-4 short lowercase topics that fit their track (like "climate tech", "personal finance", "indie games").
- idea: hackers write one specific sentence that fits their track, or "" if they are open to ideas (most beginners are). Team owners and members use their team's idea. Mentors and sponsors: "".
- summary: third person, 1-2 sentences, under 300 characters: experience level, main skills, track and what they are looking for. It is used for search.
- motivations: 1-3 of build, learn, meet, career, compete, fun, consistent with their goal. Mentors usually meet or fun; sponsors career or meet.
- Never mention blockchain, web3, crypto, NFTs, quantum computing, Haskell or COBOL.
- Mentors are industry engineers volunteering for the weekend: their bio says what they can help with, skills are 4-7 tags of their expertise, and none of them lists authentication, OAuth, login or security skills.
- Sponsors represent an invented company: skills are the technologies their company uses, and the summary says what they are recruiting for.
- These people already exist. Do not reuse any of their first names, last names or handles: ${taken.map((p) => `${p.name} (${p.handle})`).join(", ")}.
${batch.extraRules.map((r) => `- ${r}`).join("\n")}

Slots:
${slotLines.join("\n")}

Teams: for each team below, write a catchy 1-2 word name and a one-sentence idea that fits its hint and track. Its owner and members are slots above; their skills should not already cover the team's wanted skills.
${teamLines.join("\n")}`;
}

async function generateBatch(batch: Batch, taken: SeedPerson[]): Promise<GenBatch> {
  return withRetry(`generate ${batch.event.slug}`, "generate", async () => {
    const { output } = await generateText({
      model: chatModel,
      output: Output.object({ schema: GenBatch, name: "hackathon_people" }),
      prompt: prompt(batch, taken),
      maxRetries: 0, // withRetry paces retries for the free tier
    });
    const slotIds = new Set(output.people.map((p) => p.slot));
    const missing = batch.slots.filter((s) => !slotIds.has(s.id)).map((s) => s.id);
    const missingTeams = batch.teams.filter((t) => !output.teams.some((g) => g.key === t.key)).map((t) => t.key);
    if (missing.length || missingTeams.length || output.people.length !== batch.slots.length) {
      throw new Error(`Incomplete output: missing slots [${missing}] teams [${missingTeams}], got ${output.people.length} people`);
    }
    return output;
  });
}

// ---------------------------------------------------------------------------
// Turning Gemini output into seed rows
// ---------------------------------------------------------------------------

const warnings: string[] = [];

function hash(text: string): number {
  return createHash("sha256").update(text).digest().readUInt32BE(0);
}

function pick<T>(options: readonly T[], seed: number): T {
  return options[seed % options.length]!;
}

function cleanTags(tags: string[], max: number, drop?: RegExp): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key) || BANNED.test(tag) || drop?.test(tag)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, max);
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max / 2))}…`;
}

function uniqueHandle(raw: string, name: string, taken: Set<string>): string {
  let base = raw.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 26);
  if (base.length < 3) base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 26);
  if (base.length < 3) base = `hacker_${base}`;
  let handle = base;
  for (let n = 2; taken.has(handle); n++) handle = `${base}_${n}`;
  taken.add(handle);
  return handle;
}

function toSeed(batch: Batch, gen: GenBatch, taken: Set<string>): { people: SeedPerson[]; teams: SeedTeam[] } {
  const bySlot = new Map<string, SeedPerson>();

  for (const slot of batch.slots) {
    const g = gen.people.find((p) => p.slot === slot.id)!;
    const handle = uniqueHandle(g.handle, g.name, taken);
    const seed = hash(handle);
    const staff = slot.role !== "hacker";
    const skills = cleanTags(g.skills, staff ? 7 : slot.experience === "beginner" ? 5 : 8, staff ? /auth|oauth|security|login|jwt|sso/i : undefined);
    const intake: Intake = {
      skills,
      skillsWanted: staff ? [] : cleanTags(g.skillsWanted, 4),
      experience: staff ? "advanced" : slot.experience,
      wantsExperienced: staff ? false : (slot.wantsExperienced ?? false),
      goal: staff ? null : slot.goal,
      track: staff ? null : slot.track,
      interests: cleanTags(g.interests, 5),
      idea: staff || !g.idea.trim() ? null : clip(g.idea, 300),
      motivations: [...new Set(g.motivations)].slice(0, 3),
      summary: clip(g.summary, 400),
      complete: true,
    };
    for (const [field, value] of Object.entries({ bio: g.bio, idea: g.idea, summary: g.summary })) {
      if (BANNED.test(value)) warnings.push(`${handle}.${field} mentions a banned topic: ${value}`);
    }
    if (batch.event.slug === KNIGHTHACKS && !staff && slot.track !== "Health" && intake.interests.some((i) => /health|medical|wellness/i.test(i))) {
      warnings.push(`${handle} (${slot.track}) lists health interests: ${intake.interests.join(", ")}`);
    }

    bySlot.set(slot.id, {
      handle,
      name: clip(g.name, 80),
      bio: clip(g.bio, 280),
      links: seed % 3 === 0 ? { website: `https://example.com/${handle}` } : {},
      hackyStyle: {
        look: pick(HACKY_LOOKS, seed),
        color: pick(HACKY_COLORS, seed >>> 4),
        flair: pick(HACKY_FLAIRS, seed >>> 8),
        move: pick(HACKY_MOVES, seed >>> 12),
      },
      memberships: [
        {
          event: batch.event.slug,
          role: slot.role,
          verified: staff,
          availability: staff ? slot.availability : "available",
          looking: staff ? false : slot.looking,
          intake,
        },
      ],
    });
  }

  const teams: SeedTeam[] = batch.teams.map((t) => {
    const g = gen.teams.find((x) => x.key === t.key)!;
    return {
      id: teamIdFor(batch.event.slug, t.key),
      key: t.key,
      event: batch.event.slug,
      name: clip(g.name, 80),
      owner: bySlot.get(t.owner)!.handle,
      members: t.members.map((m) => bySlot.get(m)!.handle),
      idea: clip(g.idea, 300),
      track: t.track,
      wantedSkills: t.wantedSkills,
      maxSize: t.maxSize,
    };
  });

  return { people: [...bySlot.values()], teams };
}

// ---------------------------------------------------------------------------

async function main() {
  const force = process.argv.includes("--force");
  if (existsSync(PEOPLE_PATH) && !force) {
    console.log("seed/people.json already exists; rerun with --force to regenerate.");
    return;
  }

  const taken = new Set(heroPeople.map((p) => p.handle));
  const people: SeedPerson[] = [...heroPeople];
  const teams: SeedTeam[] = [...heroTeams];

  for (const batch of [knightHacks, demoHacks]) {
    console.log(`Generating ${batch.slots.length} people for ${batch.event.slug}…`);
    const seeded = toSeed(batch, await generateBatch(batch, people), taken);
    people.push(...seeded.people);
    teams.push(...seeded.teams);
  }

  const data = SeedData.parse({
    version: 1,
    generatedAt: new Date().toISOString(),
    model: CHAT_MODEL_ID,
    events,
    people,
    teams,
  });

  for (const [label, part] of [["first", 0], ["last", -1]] as const) {
    const names = data.people.map((p) => p.name.split(" ").at(part)!);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) warnings.push(`Repeated ${label} names: ${[...new Set(dupes)].join(", ")}`);
  }

  writeFileSync(PEOPLE_PATH, `${JSON.stringify(data, null, 2)}\n`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  console.log(`Wrote ${data.people.length} people and ${data.teams.length} teams to seed/people.json`);
  console.log(`Gemini generate calls: ${geminiCalls.generate}`);
}

await main();
