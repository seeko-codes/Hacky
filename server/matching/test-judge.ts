// npm run test:judge            direct search for every question in seed/judge-questions.json
// npm run test:judge -- --chat  drive the real chat for the questions marked "chat"
//   --only id1,id2                any questions by id instead of the "chat" ones
//   --restore-from <file>         restore the viewer from this backup ({ eventId, mp, emb }) at the end
//
// Checks that whatever a judge asks, Hacky answers usefully (never an empty
// dead end). Both modes run as the questions file's viewer (a hacker).
//
// Direct mode calls matchPeople, the function search_people uses, with each
// question's hand-written kind/query/neededSkills (one Gemini embedding each).
// It fails if any non-vague question returns noMatch or zero cards.
//
// Chat mode needs the API (npm run dev:api) and the web app's proxy at
// 127.0.0.1:5173 with DEMO_MODE=true. It signs in as the viewer, clears their
// thread before each question, posts the question to /api/chat, and for vague
// questions answers the first chip once to see where it leads. Gemini 429s
// are retried with backoff and reported as warnings. Pass rules:
// every reply has text or a question; vague asks get ask_with_options and no
// search; a mentor search without a strong match also drafts a help request;
// nothing errors. At the end it deletes the viewer's thread, restores their
// member profile and embedding (from --restore-from <file> if given, else from
// a snapshot taken at the start) and checks no connection or help request was
// created.

import { readFileSync } from "node:fs";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { SearchKind, SearchResult, Tag, type MatchCard } from "../../shared/contract.js";
import { MIN_SCORE, CLOSEST_FLOOR } from "./score.js";
import { matchPeople } from "./index.js";

const QUESTIONS_PATH = new URL("../../seed/judge-questions.json", import.meta.url);
const BASE = process.env.JUDGE_BASE_URL ?? "http://127.0.0.1:5173";

const Question = z.object({
  id: z.string().min(1),
  category: z.enum(["common", "specific", "odd", "team", "vague", "edge"]),
  text: z.string().min(1),
  // What the agent would pass to search_people. Vague questions have none: they should get a question back.
  search: z
    .object({ kind: SearchKind, query: z.string().min(1).max(300), neededSkills: z.array(Tag).max(10).optional() })
    .optional(),
  chat: z.boolean().optional(),
});
type Question = z.infer<typeof Question>;
const QuestionFile = z.object({
  event: z.string(),
  viewer: z.string(),
  questions: z.array(Question).min(1),
});

const file = QuestionFile.parse(JSON.parse(readFileSync(QUESTIONS_PATH, "utf8")));
for (const q of file.questions) {
  if ((q.category === "vague") !== !q.search) throw new Error(`${q.id}: vague questions (and only those) have no search`);
}

const args = process.argv.slice(2);
const eventRows = await db.execute<{ id: string }>(sql`select id from events where slug = ${file.event}`);
const eventId: string = eventRows.rows[0]?.id ?? "";
if (!eventId) throw new Error(`Event ${file.event} is not seeded.`);
const viewerRows = await db.execute<{ user_id: string }>(sql`
  select em.user_id from event_members em join profiles p on p.user_id = em.user_id
  where em.event_id = ${eventId} and (em.user_id = ${file.viewer} or p.handle = ${file.viewer})
`);
const viewerId: string = viewerRows.rows[0]?.user_id ?? "";
if (!viewerId) throw new Error(`${file.viewer} is not a member of ${file.event}.`);


// ---------------------------------------------------------------------------
// Direct search
// ---------------------------------------------------------------------------

async function directMode(): Promise<number> {
  console.log(`direct search as ${file.viewer} (MIN_SCORE=${MIN_SCORE}, CLOSEST_FLOOR=${CLOSEST_FLOOR})\n`);
  const counts = { matches: 0, closest: 0, noMatch: 0, vague: 0, error: 0 };
  const failed: string[] = [];
  for (const q of file.questions) {
    if (!q.search) {
      counts.vague++;
      console.log(`SKIP  ${"vague".padEnd(8)} -   ${q.id.padEnd(20)} (chat-only: should get a question, not a search)`);
      continue;
    }
    let result: SearchResult;
    try {
      result = SearchResult.parse(
        await matchPeople({
          viewerId,
          eventId,
          kind: q.search.kind,
          queryText: q.search.query,
          neededSkills: q.search.neededSkills,
          limit: 5, // search_people's default
        }),
      );
    } catch (error) {
      counts.error++;
      failed.push(q.id);
      console.log(`FAIL  ${"error".padEnd(8)} -   ${q.id.padEnd(20)} ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    counts[result.status]++;
    const cards = result.status === "noMatch" ? [] : result.cards;
    const ok = cards.length > 0;
    if (!ok) failed.push(q.id);
    const top = cards.slice(0, 3).map((c) => `${cardName(c)} ${c.score.toFixed(2)}`).join(", ");
    const extra = result.status === "closest" ? `  | ${result.note}` : result.status === "noMatch" ? `  | ${result.reason}` : "";
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${result.status.padEnd(8)} ${String(cards.length).padEnd(3)} ${q.id.padEnd(20)} [${q.search.kind}] ${top || "-"}${extra}`,
    );
  }
  const searched = file.questions.length - counts.vague;
  console.log(
    `\n${searched - failed.length}/${searched} searched questions returned cards ` +
      `(matches ${counts.matches}, closest ${counts.closest}, noMatch ${counts.noMatch}, errors ${counts.error}; ${counts.vague} vague skipped)`,
  );
  if (failed.length > 0) console.log(`FAILED: ${failed.join(", ")}`);
  return failed.length > 0 ? 1 : 0;
}

function cardName(card: MatchCard): string {
  return card.card === "team" ? `team:${card.team.name}` : card.person.handle;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

type Turn = {
  text: string;
  tools: string[];
  asks: { say: string; question: string; options: string[] }[];
  // evidenced: cards whose evidence lists a skill the search asked for (people and mentors only).
  searches: { kind: string; status: string; cards: number; evidenced: number }[];
  drafted: boolean;
  errors: string[];
  /** Gemini 429s (HTTP 429 from /api/chat) the request recovered from after backing off. */
  rateLimited: number;
};

// Gemini's per-minute quota is shared with anyone else using the chat; back off on 429.
const BACKOFF_SECONDS = [15, 30, 60];
const PAUSE_BETWEEN_QUESTIONS_MS = 3000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function chatMode(): Promise<number> {
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? new Set((args[onlyIdx + 1] ?? "").split(",")) : null;
  const questions = file.questions.filter((q) => (only ? only.has(q.id) : q.chat));
  const restoreIdx = args.indexOf("--restore-from");
  const backup = restoreIdx >= 0 ? loadBackup(args[restoreIdx + 1]) : await snapshot();
  const before = await sideEffects();
  console.log(`chat as ${file.viewer} via ${BASE}: ${questions.length} questions`);
  console.log(`restore source: ${restoreIdx >= 0 ? args[restoreIdx + 1] : "snapshot taken now"}\n`);

  const cookie = await signIn();
  const rows: { id: string; verdict: "PASS" | "WARN" | "FAIL" }[] = [];
  try {
    for (const [n, q] of questions.entries()) {
      if (n > 0) await sleep(PAUSE_BETWEEN_QUESTIONS_MS);
      await resetViewer(backup);
      let turn = await say(cookie, q.text);
      let retried = false;
      if (turn.errors.length > 0) {
        // One retry after a reset, for transient model errors; the first error is still reported.
        retried = true;
        await resetViewer(backup);
        const second = await say(cookie, q.text);
        second.errors = [...turn.errors.map((e) => `first try: ${e}`), ...second.errors];
        turn = second;
      }

      // Vague asks: answer the first chip once, to see that it leads somewhere useful.
      let follow: Turn | null = null;
      if (q.category === "vague" && turn.asks.length > 0) {
        const chip = turn.asks.at(-1)!.options[0];
        if (chip) follow = await answer(cookie, chip);
      }

      const fails: string[] = [];
      const warns: string[] = [];
      for (const [label, t] of [["", turn], ["after chip: ", follow]] as const) {
        if (!t) continue;
        if (!t.text.trim() && t.asks.length === 0) fails.push(`${label}reply has no text and no question`);
        for (const e of t.errors) fails.push(`${label}error: ${e}`);
        const weakMentor = t.searches.some((s) => s.kind === "mentor" && s.status !== "matches");
        if (weakMentor && !t.drafted) fails.push(`${label}mentor search without a strong match, but no draft_help_request`);
      }
      if (q.category === "vague") {
        if (turn.asks.length === 0) fails.push("vague ask got no ask_with_options");
        if (turn.searches.length > 0) fails.push("vague ask searched instead of asking");
        if (follow && follow.searches.length === 0 && follow.asks.length === 0) warns.push("chip answer led to neither a search nor a question");
        if (follow && follow.searches.some((s) => s.cards === 0)) warns.push("chip answer led to an empty search");
      } else {
        if (turn.searches.length === 0) warns.push("specific ask did not search");
        if (turn.searches.some((s) => s.cards === 0)) warns.push("search returned no cards");
      }
      for (const s of [...turn.searches, ...(follow?.searches ?? [])]) {
        // "matches" built on text relevance alone, e.g. a skill the agent left out of neededSkills.
        if (s.kind !== "team" && s.status === "matches" && s.evidenced === 0) {
          warns.push(`${s.kind} search says "matches" but no card lists an asked skill (relevance only)`);
        }
      }
      if (retried) warns.push("needed a retry");
      const limited = turn.rateLimited + (follow?.rateLimited ?? 0);
      if (limited > 0) warns.push(`Gemini rate-limited ${limited}x; recovered after backing off`);

      const verdict = fails.length > 0 ? "FAIL" : warns.length > 0 ? "WARN" : "PASS";
      rows.push({ id: q.id, verdict });
      console.log(`${verdict}  ${q.id}  > ${oneLine(q.text, 80)}`);
      printTurn(turn);
      if (follow) {
        console.log(`      chip "${turn.asks.at(-1)!.options[0]}" ->`);
        printTurn(follow);
      }
      for (const f of fails) console.log(`      ! ${f}`);
      for (const w of warns) console.log(`      ~ ${w}`);
    }
  } finally {
    await resetViewer(backup);
    const verified = await verifyRestore(backup, before);
    console.log(`\nrestore: ${verified.ok ? "OK" : "PROBLEM"}  ${verified.lines.join("; ")}`);
    if (!verified.ok) process.exitCode = 1;
  }

  const n = (v: string) => rows.filter((r) => r.verdict === v).length;
  console.log(`\nchat: ${n("PASS")} pass, ${n("WARN")} warn, ${n("FAIL")} fail of ${rows.length}`);
  return n("FAIL") > 0 || process.exitCode === 1 ? 1 : 0;
}

function printTurn(t: Turn): void {
  if (t.text.trim()) console.log(`      text: ${oneLine(t.text, 220)}`);
  for (const a of t.asks) console.log(`      ask: say="${oneLine(a.say, 100)}" q="${oneLine(a.question, 100)}" [${a.options.join(" | ")}]`);
  console.log(`      tools: ${t.tools.join(", ") || "(none)"}`);
  for (const s of t.searches) {
    const evidence = s.kind === "team" ? "" : `, ${s.evidenced} with a matched skill`;
    console.log(`      search: ${s.kind} -> ${s.status} (${s.cards} cards${evidence})`);
  }
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

async function signIn(): Promise<string> {
  const res = await fetch(`${BASE}/api/demo/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: viewerId }),
  });
  if (!res.ok) throw new Error(`demo sign-in failed: HTTP ${res.status} (is DEMO_MODE=true and the API running?)`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("demo sign-in set no cookie");
  return cookie;
}

async function say(cookie: string, text: string): Promise<Turn> {
  const message = { id: `judge-${Date.now()}`, role: "user", parts: [{ type: "text", text }] };
  return post(cookie, message);
}

/** Answers the open ask_with_options like a tapped chip (same as the web app's addToolOutput). */
async function answer(cookie: string, text: string): Promise<Turn> {
  const res = await fetch(`${BASE}/api/events/${file.event}/chat`, { headers: { cookie } });
  if (!res.ok) return emptyTurn([`history HTTP ${res.status}`]);
  const { messages } = (await res.json()) as { messages: { parts: Record<string, unknown>[] }[] };
  const last = messages.at(-1);
  const part = last?.parts.find((p) => p.type === "tool-ask_with_options" && p.state === "input-available");
  if (!last || !part) return emptyTurn(["no open question to answer"]);
  part.state = "output-available";
  part.output = { answer: text };
  return post(cookie, last);
}

function emptyTurn(errors: string[]): Turn {
  return { text: "", tools: [], asks: [], searches: [], drafted: false, errors, rateLimited: 0 };
}

async function post(cookie: string, message: unknown): Promise<Turn> {
  const turn = emptyTurn([]);
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ eventSlug: file.event, message }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      turn.errors.push(`fetch: ${error instanceof Error ? error.message : String(error)}`);
      return turn;
    }
    // A 429 comes before any output; the route saved the message, and re-posting the same id upserts it.
    if (res.status !== 429 || attempt >= BACKOFF_SECONDS.length) break;
    await res.text();
    turn.rateLimited++;
    await sleep(BACKOFF_SECONDS[attempt]! * 1000);
  }
  if (!res.ok) {
    turn.errors.push(`HTTP ${res.status} ${oneLine(await res.text(), 120)}`);
    return turn;
  }
  const names = new Map<string, string>();
  const inputs = new Map<string, Record<string, unknown>>();
  for (const line of (await res.text()).split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const c = JSON.parse(line.slice(6)) as Record<string, any>;
    switch (c.type) {
      case "text-delta":
        turn.text += c.delta;
        break;
      case "tool-input-available": {
        names.set(c.toolCallId, c.toolName);
        inputs.set(c.toolCallId, c.input ?? {});
        const input = c.input ?? {};
        if (c.toolName === "search_people") {
          turn.tools.push(`search_people(${input.kind}: "${oneLine(String(input.query ?? ""), 60)}"${input.neededSkills?.length ? ` [${input.neededSkills.join(", ")}]` : ""})`);
        } else if (c.toolName === "draft_help_request") {
          turn.tools.push(`draft_help_request("${oneLine(String(input.title ?? ""), 60)}")`);
          turn.drafted = true;
        } else {
          turn.tools.push(c.toolName);
        }
        if (c.toolName === "ask_with_options") {
          turn.asks.push({ say: String(input.say ?? ""), question: String(input.question ?? ""), options: input.options ?? [] });
        }
        break;
      }
      case "tool-output-available": {
        if (names.get(c.toolCallId) !== "search_people") break;
        const parsed = SearchResult.safeParse(c.output);
        if (!parsed.success) {
          turn.errors.push("search_people output failed the SearchResult schema");
          break;
        }
        const r = parsed.data;
        const cards = r.status === "noMatch" ? [] : r.cards;
        const evidenced = cards.filter((card) => card.card !== "team" && card.evidence.matchedSkills.length > 0).length;
        turn.searches.push({ kind: r.kind, status: r.status, cards: cards.length, evidenced });
        break;
      }
      case "tool-output-error":
        turn.errors.push(`${names.get(c.toolCallId) ?? "tool"}: ${c.errorText}`);
        break;
      case "tool-input-error":
        turn.errors.push(`${c.toolName ?? "tool"} input: ${c.errorText}`);
        break;
      case "error":
        turn.errors.push(String(c.errorText));
        break;
    }
  }
  return turn;
}

// ---------------------------------------------------------------------------
// Viewer state: snapshot, reset, verify
// ---------------------------------------------------------------------------

const PROFILE_FIELDS = [
  "skills", "skills_wanted", "experience", "wants_experienced", "goal", "track",
  "interests", "idea", "summary", "complete", "motivations", "updated_at",
] as const;

type Backup = {
  mp: Record<string, unknown>;
  emb: { embedding: string; updated_at: string } | null;
};

function loadBackup(path: string | undefined): Backup {
  if (!path) throw new Error("--restore-from needs a file path");
  const raw = z
    .object({
      eventId: z.string(),
      mp: z.record(z.string(), z.unknown()),
      emb: z.array(z.object({ embedding: z.string(), updated_at: z.string() }).loose()),
    })
    .parse(JSON.parse(readFileSync(path, "utf8")));
  if (raw.eventId !== eventId || raw.mp.user_id !== viewerId) throw new Error(`${path} is not a backup of ${file.viewer} in ${file.event}`);
  return { mp: raw.mp, emb: raw.emb[0] ?? null };
}

async function snapshot(): Promise<Backup> {
  const mp = await db.execute<Record<string, unknown>>(sql`
    select * from member_profiles where event_id = ${eventId} and user_id = ${viewerId}
  `);
  const emb = await db.execute<{ embedding: string; updated_at: string }>(sql`
    select embedding::text as embedding, updated_at from embeddings
    where event_id = ${eventId} and owner_kind = 'member' and owner_id = ${viewerId}
  `);
  if (!mp.rows[0]) throw new Error(`${file.viewer} has no member profile`);
  return { mp: mp.rows[0], emb: emb.rows[0] ?? null };
}

/** Clears the viewer's thread and puts their profile and embedding back. */
async function resetViewer(backup: Backup): Promise<void> {
  await db.execute(sql`delete from agent_messages where user_id = ${viewerId}`);
  const mp = JSON.stringify(Object.fromEntries(PROFILE_FIELDS.map((f) => [f, backup.mp[f]])));
  await db.execute(sql`
    update member_profiles m set
      skills = r.skills, skills_wanted = r.skills_wanted, experience = r.experience,
      wants_experienced = r.wants_experienced, goal = r.goal, track = r.track,
      interests = r.interests, idea = r.idea, summary = r.summary, complete = r.complete,
      motivations = r.motivations, updated_at = r.updated_at
    from jsonb_populate_record(null::member_profiles, ${mp}::jsonb) r
    where m.event_id = ${eventId} and m.user_id = ${viewerId}
  `);
  if (backup.emb) {
    await db.execute(sql`
      insert into embeddings (event_id, owner_kind, owner_id, embedding, updated_at)
      values (${eventId}, 'member', ${viewerId}, ${backup.emb.embedding}::vector, ${backup.emb.updated_at}::timestamptz)
      on conflict (event_id, owner_kind, owner_id)
      do update set embedding = excluded.embedding, updated_at = excluded.updated_at
    `);
  } else {
    await db.execute(sql`delete from embeddings where event_id = ${eventId} and owner_kind = 'member' and owner_id = ${viewerId}`);
  }
}

async function sideEffects(): Promise<{ connections: number; helpRequests: number; messages: number }> {
  const { rows } = await db.execute<{ connections: number; help_requests: number; messages: number }>(sql`
    select
      (select count(*)::int from connections where from_user = ${viewerId} or to_user = ${viewerId}) as connections,
      (select count(*)::int from help_requests where hacker_id = ${viewerId}) as help_requests,
      (select count(*)::int from agent_messages where user_id = ${viewerId}) as messages
  `);
  const r = rows[0]!;
  return { connections: r.connections, helpRequests: r.help_requests, messages: r.messages };
}

async function verifyRestore(
  backup: Backup,
  before: { connections: number; helpRequests: number },
): Promise<{ ok: boolean; lines: string[] }> {
  const now = await sideEffects();
  const lines: string[] = [];
  let ok = true;
  const check = (good: boolean, line: string) => {
    if (!good) ok = false;
    lines.push(`${good ? "" : "MISMATCH "}${line}`);
  };
  check(now.messages === 0, `${now.messages} agent_messages`);
  check(now.connections === before.connections, `${now.connections - before.connections} connections created`);
  check(now.helpRequests === before.helpRequests, `${now.helpRequests - before.helpRequests} help_requests created`);

  const mp = JSON.stringify(Object.fromEntries(PROFILE_FIELDS.map((f) => [f, backup.mp[f]])));
  const { rows } = await db.execute<{ same: boolean; tsv_same: boolean | null }>(sql`
    select
      (select row(m.skills, m.skills_wanted, m.experience, m.wants_experienced, m.goal, m.track, m.interests,
                  m.idea, m.summary, m.complete, m.motivations, m.updated_at)
         is not distinct from row(r.skills, r.skills_wanted, r.experience, r.wants_experienced, r.goal, r.track,
                  r.interests, r.idea, r.summary, r.complete, r.motivations, r.updated_at)) as same,
      ${typeof backup.mp.search_tsv === "string" ? sql`m.search_tsv = ${backup.mp.search_tsv}::tsvector` : sql`null::boolean`} as tsv_same
    from member_profiles m, jsonb_populate_record(null::member_profiles, ${mp}::jsonb) r
    where m.event_id = ${eventId} and m.user_id = ${viewerId}
  `);
  check(rows[0]?.same === true, "member_profiles row matches backup");
  if (rows[0]?.tsv_same !== null && rows[0]?.tsv_same !== undefined) check(rows[0].tsv_same, "search_tsv matches backup");

  const emb = await db.execute<{ same: boolean }>(sql`
    select ${backup.emb ? sql`embedding::text = ${backup.emb.embedding} and updated_at = ${backup.emb.updated_at}::timestamptz` : sql`false`} as same
    from embeddings where event_id = ${eventId} and owner_kind = 'member' and owner_id = ${viewerId}
  `);
  check(backup.emb ? emb.rows[0]?.same === true : emb.rows.length === 0, "embedding matches backup");
  return { ok, lines };
}

// Last, so every const above is initialized before the top-level await runs.
process.exitCode = args.includes("--chat") ? await chatMode() : await directMode();
