// npm run test:match
// Unit-tests the pure scoring (score.ts), then runs every case in
// seed/match-cases.json against the real database and prints pass/fail per
// case and the pass rate. All case queries are embedded in one Gemini call.
// Rows a case sets up (blocks, requests) are removed again afterwards.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { embedTexts } from "../agent/model.js";
import { Experience, HackGoal, SearchKind, SearchResult, type MatchCard } from "../../shared/contract.js";
import { teamIdFor } from "../../seed/people-schema.js";
import * as S from "./score.js";
import { queryEmbeddingText, rankHackers, rankMentors, rankTeams, toResult, type Ranked } from "./index.js";

const CASES_PATH = new URL("../../seed/match-cases.json", import.meta.url);

const Pair = z.tuple([z.string(), z.string()]);
const MatchCase = z.object({
  name: z.string().min(1),
  viewer: z.string(),
  query: z.string(),
  neededSkills: z.array(z.string()).optional(),
  kind: SearchKind,
  // Rows created before the search and deleted after it.
  setup: z
    .object({
      blocks: z.array(Pair).optional(), // [blocker, blocked]
      requests: z.array(Pair).optional(), // [from, to]
    })
    .optional(),
  expect: z.object({
    top: z.string().optional(),
    notIn: z.array(z.string()).optional(),
    topBelow: Pair.optional(), // [a, b]: a appears and ranks above b
    topExperience: z.array(Experience).optional(),
    noMatch: z.literal(true).optional(),
  }),
});
type MatchCase = z.infer<typeof MatchCase>;
// Intake answers set before the cases run (as if those people finished the
// intake chat) and restored afterwards. demo_you is seeded mid-intake.
const IntakePatch = z.object({
  skillsWanted: z.array(z.string()).optional(),
  goal: HackGoal.nullable().optional(),
  track: z.string().nullable().optional(),
  wantsExperienced: z.boolean().optional(),
});
type IntakePatch = z.infer<typeof IntakePatch>;
const CaseFile = z.object({
  event: z.string(),
  intake: z.record(z.string(), IntakePatch).default({}),
  cases: z.array(MatchCase).min(1),
});

// ---------------------------------------------------------------------------
// Unit tests for the pure scoring
// ---------------------------------------------------------------------------

function unitTests(): number {
  const tests: [string, () => void][] = [
    ["normalizes skill variants", () => {
      assert.equal(S.normalizeSkill("Node"), "node.js");
      assert.equal(S.normalizeSkill(" NodeJS "), "node.js");
      assert.equal(S.normalizeSkill("PostgreSQL"), "postgres");
      assert.equal(S.normalizeSkill("ML"), "machine learning");
    }],
    ["expands implied skills one way", () => {
      const skills = S.expandSkills(["Next.js", "Postgres"]);
      assert.ok(skills.has("react") && skills.has("frontend") && skills.has("backend"));
      assert.ok(!S.expandSkills(["frontend"]).has("react"));
    }],
    ["needed = search + wanted - has", () => {
      assert.deepEqual(S.computeNeeded(["backend"], ["Backend", "ML"], ["React", "TypeScript"]), ["backend", "ML"]);
      assert.deepEqual(S.computeNeeded(["frontend"], [], ["React"]), []);
    }],
    ["coverage counts needed skills the candidate has", () => {
      assert.equal(S.coverage(["backend", "ML"], ["Node.js", "Postgres"]), 0.5);
      assert.deepEqual(S.matchSkills(["backend", "ML"], ["PyTorch"]), ["ML"]);
      assert.equal(S.coverage([], ["React"]), null);
    }],
    ["asked skills outweigh background wants", () => {
      const { asked, background } = S.splitNeeded(["backend"], ["Backend", "ML"], ["React"]);
      assert.deepEqual(asked, ["backend"]);
      assert.deepEqual(background, ["ML"]);
      // Backend specialist vs. someone with both: asked skills dominate.
      assert.equal(S.blendedCoverage(asked, background, ["Node.js"]), 0.8);
      assert.equal(S.blendedCoverage(asked, background, ["Node.js", "PyTorch"]), 1);
      assert.equal(S.blendedCoverage(asked, background, ["PyTorch"]), 0.2);
      assert.equal(S.blendedCoverage([], ["ML"], ["PyTorch"]), 1);
      assert.equal(S.blendedCoverage([], [], ["PyTorch"]), null);
    }],
    ["finds skills named in text", () => {
      assert.deepEqual(S.skillsInText("backend dev into health tech"), ["backend"]);
      assert.deepEqual(S.skillsInText("someone who knows Node.js and ML"), ["node.js", "ml"]);
      assert.deepEqual(S.skillsInText("let's go, next week"), []);
    }],
    ["keyword query is an OR of content words", () => {
      const q = S.keywordQuery("find me a backend dev into health tech");
      assert.ok(q.includes("backend") && q.includes("health") && !q.includes("find"));
      assert.equal(S.keywordQuery("  "), "");
    }],
    ["relevance is RRF over its maximum", () => {
      assert.equal(S.relevance(S.rrf([1, 1])), 1);
      assert.equal(S.relevance(S.rrf([1, null])), 0.5);
      assert.equal(S.relevance(0), 0);
    }],
    ["goal fit averages the parts the viewer filled in", () => {
      const viewer = { goal: "win", track: "Health", motivations: ["build", "compete"], experience: null, wantsExperienced: false };
      const fit = S.goalFit(viewer, { goal: "win", track: "health", motivations: ["build"], experience: "beginner" });
      assert.equal(fit.goalFit, (1 + 1 + 0.5) / 3);
      assert.equal(fit.experienceFits, null);
      assert.equal(S.goalFit({ ...viewer, goal: null, track: null, motivations: [] }, viewer).goalFit, 0);
    }],
    ["experience counts only when asked for", () => {
      const viewer = { goal: null, track: null, motivations: [], experience: "beginner" as const, wantsExperienced: true };
      assert.equal(S.goalFit(viewer, { goal: null, track: null, motivations: [], experience: "advanced" }).goalFit, 1);
      const beginner = S.goalFit(viewer, { goal: null, track: null, motivations: [], experience: "beginner" });
      assert.equal(beginner.experienceFits, false);
      assert.equal(beginner.goalFit, 0);
    }],
    ["person and mentor scores use the plan's weights", () => {
      assert.equal(S.personScore({ relevance: 1, coverage: 1, goalFit: 1 }), 1);
      assert.equal(S.personScore({ relevance: 1, coverage: 0, goalFit: 0 }), 0.4);
      assert.equal(S.personScore({ relevance: 1, coverage: null, goalFit: 0 }), 0.65);
      assert.equal(S.mentorScore({ skillOverlap: 1, relevance: 0, availableNow: true }), 0.75);
      assert.equal(S.mentorScore({ skillOverlap: 0, relevance: 1, availableNow: false }), 0.25);
    }],
    ["shared tags ignore case", () => {
      assert.deepEqual(S.sharedTags(["Health", "AI"], ["health", "games"]), ["health"]);
    }],
  ];
  for (const [name, run] of tests) {
    try {
      run();
    } catch (error) {
      console.error(`unit FAIL  ${name}\n${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  }
  console.log(`unit: ${tests.length}/${tests.length} scoring tests passed\n`);
  return tests.length;
}

// ---------------------------------------------------------------------------
// Match cases against the database
// ---------------------------------------------------------------------------

async function main() {
  unitTests();

  const file = CaseFile.parse(JSON.parse(readFileSync(CASES_PATH, "utf8")));
  const eventRows = await db.execute<{ id: string }>(sql`select id from events where slug = ${file.event}`);
  const eventId = eventRows.rows[0]?.id;
  if (!eventId) throw new Error(`Event ${file.event} is not seeded. Load the seed first.`);

  // Handles → user ids, and team keys → team ids (the seed derives team ids from keys).
  const handles = new Set<string>(Object.keys(file.intake));
  for (const c of file.cases) {
    handles.add(c.viewer);
    for (const pair of [...(c.setup?.blocks ?? []), ...(c.setup?.requests ?? [])]) pair.forEach((h) => handles.add(h));
    if (c.kind !== "team") {
      [c.expect.top, ...(c.expect.notIn ?? []), ...(c.expect.topBelow ?? [])].forEach((h) => h && handles.add(h));
    }
  }
  const profileRows = await db.execute<{ user_id: string; handle: string }>(sql`
    select user_id, handle from profiles
    where handle in (${sql.join([...handles].map((h) => sql`${h}`), sql`, `)})
  `);
  const userIds = new Map(profileRows.rows.map((r) => [r.handle, r.user_id]));
  const missing = [...handles].filter((h) => !userIds.has(h));
  if (missing.length > 0) throw new Error(`Seed is missing these handles: ${missing.join(", ")}`);
  const userId = (handle: string) => userIds.get(handle)!;

  // One Gemini call for every query.
  const texts = file.cases.map((c) =>
    queryEmbeddingText(c.query, S.searchSkills(c.query, c.neededSkills)),
  );
  const vectors = await embedTexts(texts, "query");

  const restore = await applyIntake(eventId, file.intake, userId);
  let passed = 0;
  try {
    for (const [i, c] of file.cases.entries()) {
      const created = await setUp(eventId, c, userId);
      let failures: string[] = [];
      let ranked: Ranked[] = [];
      let result: SearchResult | null = null;
      try {
        const input = {
          eventId,
          viewerId: userId(c.viewer),
          kind: c.kind,
          queryText: c.query,
          neededSkills: c.neededSkills,
          queryEmbedding: vectors[i]!,
          limit: 10,
        };
        ranked =
          c.kind === "team"
            ? await rankTeams(input)
            : c.kind === "mentor"
              ? await rankMentors({ ...input, skillsNeeded: c.neededSkills })
              : await rankHackers(input);
        result = SearchResult.parse(toResult(c.kind, ranked, 10));
        failures = check(c, ranked, result, (key) => keyFor(key, c, file.event));
      } catch (error) {
        failures = [`error: ${error instanceof Error ? error.message : String(error)}`];
      } finally {
        await tearDown(created);
      }

      const ok = failures.length === 0;
      if (ok) passed++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}`);
      for (const f of failures) console.log(`      - ${f}`);
      const shown = ranked.slice(0, 4).map((r) => describe(r, c, file.event)).join("\n");
      if (shown) console.log(shown);
      if (result?.status === "noMatch") console.log("      → noMatch");
    }
  } finally {
    await restore();
  }

  const total = file.cases.length;
  console.log(`\nmatch cases: ${passed}/${total} passed (${Math.round((100 * passed) / total)}%)`);
  console.log(`threshold MIN_SCORE=${S.MIN_SCORE}, MIN_SIMILARITY=${S.MIN_SIMILARITY}`);
  process.exitCode = passed === total ? 0 : 1;
}

/** What a card is called in match-cases.json: a handle, or a team key. */
function cardKey(card: MatchCard, c: MatchCase, event: string): string {
  if (card.card === "team") {
    for (const key of teamKeys(c)) if (teamIdFor(event, key) === card.team.id) return key;
    return `team:${card.team.name}`;
  }
  return card.person.handle;
}

function keyFor(key: string, c: MatchCase, event: string): (card: MatchCard) => boolean {
  return (card) => cardKey(card, c, event) === key;
}

function teamKeys(c: MatchCase): string[] {
  if (c.kind !== "team") return [];
  return [c.expect.top, ...(c.expect.notIn ?? []), ...(c.expect.topBelow ?? [])].filter(
    (k): k is string => !!k,
  );
}

function check(
  c: MatchCase,
  ranked: Ranked[],
  result: SearchResult,
  is: (key: string) => (card: MatchCard) => boolean,
): string[] {
  const failures: string[] = [];
  const cards = result.status === "matches" ? result.cards : [];
  const e = c.expect;

  if (e.noMatch && result.status !== "noMatch") {
    failures.push(`expected noMatch, got ${cards.length} card(s), best score ${ranked[0]?.score}`);
  }
  // A case that only checks who must stay hidden is fine with "nothing fits".
  if (!e.noMatch && (e.top || e.topBelow) && result.status === "noMatch") {
    failures.push(`unexpected noMatch (best score ${ranked[0]?.score ?? "none"})`);
  }
  if (e.top && !(cards[0] && is(e.top)(cards[0]))) {
    const at = ranked.findIndex((r) => is(e.top!)(r.card));
    failures.push(`expected top ${e.top}, it ranked ${at < 0 ? "nowhere" : `#${at + 1}`}`);
  }
  for (const key of e.notIn ?? []) {
    // Checked against everything the search ranked, not just the cards shown.
    if (ranked.some((r) => is(key)(r.card))) failures.push(`${key} must not appear`);
  }
  if (e.topBelow) {
    const [a, b] = e.topBelow;
    const ia = ranked.findIndex((r) => is(a)(r.card));
    const ib = ranked.findIndex((r) => is(b)(r.card));
    if (ia < 0) failures.push(`${a} missing, expected above ${b}`);
    else if (ib >= 0 && ib < ia) failures.push(`${b} (#${ib + 1}) ranked above ${a} (#${ia + 1})`);
  }
  if (e.topExperience) {
    const top = cards[0];
    const experience = top?.card === "person" ? top.evidence.experience : null;
    if (!experience || !e.topExperience.includes(experience)) {
      failures.push(`expected top experience ${e.topExperience.join("/")}, got ${experience ?? "none"}`);
    }
  }
  return failures;
}

function describe(r: Ranked, c: MatchCase, event: string): string {
  const card = r.card;
  const parts =
    card.card === "mentor"
      ? `overlap ${card.scoreParts.skillOverlap} rel ${card.scoreParts.relevance} avail ${card.scoreParts.availableNow}`
      : `rel ${card.scoreParts.relevance} cov ${card.scoreParts.coverage ?? "-"} goal ${card.scoreParts.goalFit}`;
  const d = r.debug;
  const search = `kw #${d.keywordRank ?? "-"} vec #${d.vectorRank ?? "-"} sim ${d.similarity?.toFixed(3) ?? "-"}`;
  const below = r.score < S.MIN_SCORE ? " (below threshold)" : "";
  return `      ${r.score.toFixed(3)}  ${cardKey(card, c, event).padEnd(16)} ${parts} | ${search}${below}`;
}

type IntakeRow = {
  skills_wanted: string[];
  goal: string | null;
  track: string | null;
  wants_experienced: boolean;
};

/** Applies the intake patches and returns a function that puts the old values back. */
async function applyIntake(
  eventId: string,
  patches: Record<string, IntakePatch>,
  userId: (h: string) => string,
): Promise<() => Promise<void>> {
  const saved: [string, IntakeRow][] = [];
  const write = (id: string, row: IntakeRow) =>
    db.execute(sql`
      update member_profiles set
        skills_wanted = array[${sql.join(row.skills_wanted.map((x) => sql`${x}`), sql`, `)}]::text[],
        goal = ${row.goal}::hack_goal,
        track = ${row.track},
        wants_experienced = ${row.wants_experienced}
      where event_id = ${eventId} and user_id = ${id}
    `);
  for (const [handle, patch] of Object.entries(patches)) {
    const id = userId(handle);
    const { rows } = await db.execute<IntakeRow>(sql`
      select skills_wanted, goal, track, wants_experienced
      from member_profiles where event_id = ${eventId} and user_id = ${id}
    `);
    const old = rows[0];
    if (!old) throw new Error(`${handle} has no profile in this event`);
    saved.push([id, old]);
    await write(id, {
      skills_wanted: patch.skillsWanted ?? old.skills_wanted,
      goal: patch.goal !== undefined ? patch.goal : old.goal,
      track: patch.track !== undefined ? patch.track : old.track,
      wants_experienced: patch.wantsExperienced ?? old.wants_experienced,
    });
  }
  return async () => {
    for (const [id, old] of saved) await write(id, old);
  };
}

type Created = { blocks: [string, string][]; requests: string[] };

async function setUp(eventId: string, c: MatchCase, userId: (h: string) => string): Promise<Created> {
  const created: Created = { blocks: [], requests: [] };
  for (const [blocker, blocked] of c.setup?.blocks ?? []) {
    const { rows } = await db.execute<{ blocker_id: string }>(sql`
      insert into blocks (blocker_id, blocked_id) values (${userId(blocker)}, ${userId(blocked)})
      on conflict do nothing returning blocker_id
    `);
    if (rows.length > 0) created.blocks.push([userId(blocker), userId(blocked)]);
  }
  for (const [from, to] of c.setup?.requests ?? []) {
    const { rows } = await db.execute<{ id: string }>(sql`
      insert into connections (event_id, from_user, to_user, intro, source)
      values (${eventId}, ${userId(from)}, ${userId(to)}, 'match test', 'agent')
      on conflict do nothing returning id
    `);
    if (rows[0]) created.requests.push(rows[0].id);
  }
  return created;
}

async function tearDown(created: Created): Promise<void> {
  for (const [blocker, blocked] of created.blocks) {
    await db.execute(sql`delete from blocks where blocker_id = ${blocker} and blocked_id = ${blocked}`);
  }
  for (const id of created.requests) {
    await db.execute(sql`delete from connections where id = ${id}`);
  }
}

await main();
