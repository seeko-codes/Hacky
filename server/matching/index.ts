// Matching: hard filters, hybrid search (Postgres full-text + pgvector, fused
// with Reciprocal Rank Fusion in one SQL query), then scoring and evidence.
// The math lives in score.ts. Results contain only public fields: no emails,
// no embeddings. See the plan's Matching section and seed/match-cases.json.

import { sql, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { embedTexts } from "../agent/model.js";
import type {
  Availability,
  Experience,
  HackGoal,
  MatchCard,
  MemberRole,
  MentorCard,
  NoMatch,
  PersonCard,
  SearchKind,
  SearchResult,
  TeamCard,
} from "../../shared/contract.js";
import * as S from "./score.js";
// The seed and live re-embeds share one text builder, so vectors stay comparable.
import { memberProfileText } from "../../seed/profile-text.js";

const MAX_CARDS = 10;
const DEFAULT_LIMIT = 5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type MatchPeopleInput = {
  viewerId: string;
  eventId: string;
  kind: SearchKind;
  /** The user's words, e.g. "backend dev into health tech". */
  queryText: string;
  /** Skills the search asks for. Skills named in queryText are added too. */
  neededSkills?: readonly string[];
  /** Cards to return (1–10, default 5). */
  limit?: number;
  /** A precomputed query embedding (tests). Otherwise one Gemini call. */
  queryEmbedding?: number[] | null;
};

/** The search_people tool and the API call this. Mentors go to matchMentors. */
export async function matchPeople(input: MatchPeopleInput): Promise<SearchResult> {
  if (input.kind === "mentor") {
    return matchMentors({
      eventId: input.eventId,
      viewerId: input.viewerId,
      skillsNeeded: input.neededSkills,
      queryText: input.queryText,
      limit: input.limit,
      queryEmbedding: input.queryEmbedding,
    });
  }
  const ranked =
    input.kind === "team" ? await rankTeams(input) : await rankHackers(input);
  return toResult(input.kind, ranked, input.limit);
}

export type MatchMentorsInput = {
  eventId: string;
  /** The hacker asking. Required unless helpRequestId is given. */
  viewerId?: string | null;
  /** Rank mentors for a stored help request (its skills, title and details). */
  helpRequestId?: string;
  skillsNeeded?: readonly string[];
  queryText?: string;
  limit?: number;
  queryEmbedding?: number[] | null;
};

/** Verified, not-offline mentors ranked for a request or a chat search. */
export async function matchMentors(input: MatchMentorsInput): Promise<SearchResult> {
  const ranked = await rankMentors(input);
  return toResult("mentor", ranked, input.limit);
}

/**
 * Re-embeds one member's event profile (the update_profile tool calls this
 * when the intake completes and after later edits). Returns false if there is
 * no profile text to embed yet.
 */
export async function upsertMemberEmbedding(eventId: string, userId: string): Promise<boolean> {
  const { rows } = await db.execute<MemberTextRow>(sql`
    select mp.user_id, mp.skills, mp.track, mp.interests, mp.motivations, mp.idea, mp.summary
    from member_profiles mp
    where mp.event_id = ${eventId} and mp.user_id = ${userId}
  `);
  const row = rows[0];
  const text = row ? memberProfileText(row) : "";
  if (!text) return false;
  const [vector] = await embedTexts([text], "document");
  if (!vector) return false;
  await db.execute(sql`
    insert into embeddings (event_id, owner_kind, owner_id, embedding, updated_at)
    values (${eventId}, 'member', ${userId}, ${vectorLiteral(vector)}::vector, now())
    on conflict (event_id, owner_kind, owner_id)
    do update set embedding = excluded.embedding, updated_at = now()
  `);
  return true;
}

/** The exact text matchPeople embeds for a query, so tests can embed it in one batch. */
export function queryEmbeddingText(queryText: string, neededSkills: readonly string[] = []): string {
  const text = queryText.trim();
  const extra = S.uniqueSkills(neededSkills).filter(
    (skill) => !text.toLowerCase().includes(skill.toLowerCase()),
  );
  return extra.length > 0 ? `${text}${text ? "\n" : ""}Skills: ${extra.join(", ")}.` : text;
}

// ---------------------------------------------------------------------------
// Ranking (exported for the test runner's diagnostics)
// ---------------------------------------------------------------------------

export type Ranked = {
  card: MatchCard;
  score: number;
  /** Hybrid-search diagnostics; never sent to the browser. */
  debug: { keywordRank: number | null; vectorRank: number | null; similarity: number | null };
};

export async function rankHackers(input: MatchPeopleInput): Promise<Ranked[]> {
  const viewer = await loadViewer(input.eventId, input.viewerId);
  const searchSkills = S.searchSkills(input.queryText, input.neededSkills);
  const { asked, background } = S.splitNeeded(searchSkills, viewer.skills_wanted, viewer.skills);
  const needed = [...asked, ...background];
  const vector = await queryVector(input.queryText, searchSkills, input.queryEmbedding);

  const { rows } = await db.execute<MemberRow>(
    memberSearchSql({
      eventId: input.eventId,
      viewerId: input.viewerId,
      role: "hacker",
      keywords: S.keywordQuery(input.queryText, searchSkills),
      vector,
      excludeRequested: true,
    }),
  );

  const viewerGoal = { ...goalSide(viewer), wantsExperienced: viewer.wants_experienced };
  return rows.map((row) => {
    const rel = S.relevance(S.rrf([row.kw_rank, row.vec_rank]));
    const cov = S.blendedCoverage(asked, background, row.skills);
    const fit = S.goalFit(viewerGoal, goalSide(row));
    const base = S.personScore({ relevance: rel, coverage: cov, goalFit: fit.goalFit });
    // Asked for skills and they have none of them: relevance alone can't make them a match.
    const missesAsked = asked.length > 0 && S.coverage(asked, row.skills) === 0;
    const score = missesAsked ? S.round(base * S.MISSING_ASKED_FACTOR) : base;
    const evidence: PersonCard["evidence"] = {
      matchedSkills: tags(S.matchSkills(needed, row.skills)),
      sharedInterests: tags(S.sharedTags(viewer.interests, row.interests)),
      goal: row.goal,
      sameGoal: fit.sameGoal,
      track: row.track,
      sameTrack: fit.sameTrack,
      experience: row.experience,
      experienceFits: fit.experienceFits,
      availability: row.availability,
    };
    const card: PersonCard = {
      card: "person",
      person: personSummary(row),
      skills: tags(row.skills),
      score,
      scoreParts: { relevance: S.round(rel), coverage: cov === null ? null : S.round(cov), goalFit: S.round(fit.goalFit) },
      evidence,
      reason: personReason(evidence),
    };
    return { card, score, debug: debugOf(row) };
  }).sort(byScore);
}

export async function rankTeams(input: MatchPeopleInput): Promise<Ranked[]> {
  const viewer = await loadViewer(input.eventId, input.viewerId);
  const searchSkills = S.searchSkills(input.queryText, input.neededSkills);
  const vector = await queryVector(input.queryText, searchSkills, input.queryEmbedding);
  const keywords = S.keywordQuery(input.queryText, searchSkills);
  const viewerId = input.viewerId;
  const eventId = input.eventId;

  const { rows } = await db.execute<TeamRow>(sql`
    with q as (select websearch_to_tsquery('english', ${keywords}) as tsq),
    cands as (
      select t.id, t.owner_id
      from teams t
      where t.event_id = ${eventId}
        and t.owner_id <> ${viewerId}
        and not exists (select 1 from team_members tm where tm.team_id = t.id and tm.user_id = ${viewerId})
        and (select count(*) from team_members tm where tm.team_id = t.id and tm.user_id <> t.owner_id) + 1 < t.max_size
        and ${notBlocked(sql`t.owner_id`, viewerId)}
        and ${notRequested(sql`t.owner_id`, viewerId, eventId)}
    ),
    kw as (
      select t.id, (row_number() over (order by ts_rank(t.search_tsv, q.tsq) desc, t.id))::int as rnk
      from teams t join cands c on c.id = t.id cross join q
      where t.search_tsv @@ q.tsq
      order by rnk limit ${S.SEARCH_POOL}
    ),
    vec as (${vectorArm(sql`c.id::text`, "team", eventId, vector)}),
    fused as (${fusedSql(sql`kw.id::text`)})
    select t.id, t.name, t.idea, t.track, t.wanted_skills, t.max_size,
      (select count(*) from team_members tm where tm.team_id = t.id and tm.user_id <> t.owner_id)::int + 1 as size,
      p.user_id, p.handle, p.name as owner_name, p.hacky_style, em.role,
      omp.goal as owner_goal, coalesce(omp.motivations, '{}') as owner_motivations,
      f.kw_rank, f.vec_rank, f.sim
    from fused f
    join teams t on t.id::text = f.owner_id
    join profiles p on p.user_id = t.owner_id
    join event_members em on em.event_id = t.event_id and em.user_id = t.owner_id
    left join member_profiles omp on omp.event_id = t.event_id and omp.user_id = t.owner_id
    order by f.rrf desc
    limit ${S.SEARCH_POOL}
  `);

  // Teams have no goal of their own: goal fit compares the track and the owner's goal.
  const viewerGoal = { ...goalSide(viewer), wantsExperienced: false };
  return rows.map((row) => {
    const rel = S.relevance(S.rrf([row.kw_rank, row.vec_rank]));
    const cov = S.coverage(row.wanted_skills, viewer.skills);
    const fit = S.goalFit(viewerGoal, {
      goal: row.owner_goal,
      track: row.track,
      motivations: row.owner_motivations,
      experience: null,
    });
    const score = S.personScore({ relevance: rel, coverage: cov, goalFit: fit.goalFit });
    const matched = tags(S.matchSkills(row.wanted_skills, viewer.skills));
    const card: TeamCard = {
      card: "team",
      team: {
        id: row.id,
        name: row.name,
        idea: row.idea,
        track: row.track,
        wantedSkills: tags(row.wanted_skills),
        size: row.size,
        maxSize: row.max_size,
        owner: {
          userId: row.user_id,
          handle: row.handle,
          name: row.owner_name,
          hackyStyle: row.hacky_style ?? {},
          role: row.role,
        },
      },
      score,
      scoreParts: { relevance: S.round(rel), coverage: cov === null ? null : S.round(cov), goalFit: S.round(fit.goalFit) },
      evidence: { matchedSkills: matched, track: row.track, sameTrack: fit.sameTrack },
      reason: teamReason(matched, row, fit.sameTrack),
    };
    return { card, score, debug: debugOf(row) };
  }).sort(byScore);
}

export async function rankMentors(input: MatchMentorsInput): Promise<Ranked[]> {
  let viewerId = input.viewerId ?? null;
  let skills = [...(input.skillsNeeded ?? [])];
  let queryText = input.queryText ?? "";

  if (input.helpRequestId) {
    const { rows } = await db.execute<{
      hacker_id: string;
      title: string;
      details: string | null;
      skills_needed: string[];
    }>(sql`
      select hacker_id, title, details, skills_needed
      from help_requests
      where id = ${input.helpRequestId} and event_id = ${input.eventId}
    `);
    const request = rows[0];
    if (!request) throw new Error("Help request not found in this event");
    viewerId = request.hacker_id;
    skills = [...request.skills_needed, ...skills];
    queryText = [request.title, request.details, queryText].filter(Boolean).join("\n");
  }

  const requested = S.searchSkills(queryText, skills);
  const vector = await queryVector(queryText, requested, input.queryEmbedding);
  const { rows } = await db.execute<MemberRow>(
    memberSearchSql({
      eventId: input.eventId,
      viewerId,
      role: "mentor",
      keywords: S.keywordQuery(queryText, requested),
      vector,
      excludeRequested: false,
    }),
  );

  return rows.map((row) => {
    const rel = S.relevance(S.rrf([row.kw_rank, row.vec_rank]));
    const overlap = S.coverage(requested, row.skills);
    const availableNow = row.availability === "available";
    const score = S.mentorScore({ skillOverlap: overlap, relevance: rel, availableNow });
    const matched = tags(S.matchSkills(requested, row.skills));
    const card: MentorCard = {
      card: "mentor",
      person: personSummary(row),
      verified: row.verified,
      skills: tags(row.skills),
      score,
      scoreParts: { skillOverlap: S.round(overlap ?? 0), relevance: S.round(rel), availableNow },
      evidence: { matchedSkills: matched, availability: row.availability },
      reason: mentorReason(matched, row.availability),
    };
    return { card, score, debug: debugOf(row) };
  }).sort(byScore);
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

type MemberRow = {
  user_id: string;
  handle: string;
  name: string;
  hacky_style: Record<string, unknown> | null;
  role: MemberRole;
  verified: boolean;
  availability: Availability;
  skills: string[];
  experience: Experience | null;
  goal: HackGoal | null;
  track: string | null;
  interests: string[];
  motivations: string[];
  kw_rank: number | null;
  vec_rank: number | null;
  sim: number | null;
};

type TeamRow = {
  id: string;
  name: string;
  idea: string | null;
  track: string | null;
  wanted_skills: string[];
  max_size: number;
  size: number;
  user_id: string;
  handle: string;
  owner_name: string;
  hacky_style: Record<string, unknown> | null;
  role: MemberRole;
  owner_goal: HackGoal | null;
  owner_motivations: string[];
  kw_rank: number | null;
  vec_rank: number | null;
  sim: number | null;
};

type MemberTextRow = {
  user_id: string;
  skills: string[];
  track: string | null;
  interests: string[];
  motivations: string[];
  idea: string | null;
  summary: string | null;
};

type ViewerRow = {
  skills: string[];
  skills_wanted: string[];
  experience: Experience | null;
  wants_experienced: boolean;
  goal: HackGoal | null;
  track: string | null;
  interests: string[];
  motivations: string[];
};

async function loadViewer(eventId: string, viewerId: string): Promise<ViewerRow> {
  const { rows } = await db.execute<ViewerRow>(sql`
    select coalesce(mp.skills, '{}') as skills, coalesce(mp.skills_wanted, '{}') as skills_wanted,
      mp.experience, coalesce(mp.wants_experienced, false) as wants_experienced,
      mp.goal, mp.track, coalesce(mp.interests, '{}') as interests,
      coalesce(mp.motivations, '{}') as motivations
    from event_members em
    left join member_profiles mp on mp.event_id = em.event_id and mp.user_id = em.user_id
    where em.event_id = ${eventId} and em.user_id = ${viewerId}
  `);
  const viewer = rows[0];
  if (!viewer) throw new Error("Viewer is not a member of this event");
  return viewer;
}

/** Hard filters + hybrid search over event members of one role, in one query. */
function memberSearchSql(o: {
  eventId: string;
  viewerId: string | null;
  role: "hacker" | "mentor";
  keywords: string;
  vector: string | null;
  excludeRequested: boolean;
}): SQL {
  const roleFilter =
    o.role === "hacker"
      ? sql`em.role = 'hacker' and em.looking`
      : sql`em.role = 'mentor' and em.verified and em.availability <> 'offline'`;
  const viewerFilters = o.viewerId
    ? sql`and em.user_id <> ${o.viewerId}
        and ${notBlocked(sql`em.user_id`, o.viewerId)}
        ${o.excludeRequested ? sql`and ${notRequested(sql`em.user_id`, o.viewerId, o.eventId)}` : sql``}`
    : sql``;

  return sql`
    with q as (select websearch_to_tsquery('english', ${o.keywords}) as tsq),
    cands as (
      select em.user_id as id
      from event_members em
      where em.event_id = ${o.eventId} and ${roleFilter}
        ${viewerFilters}
    ),
    kw as (
      select mp.user_id as id,
        (row_number() over (order by ts_rank(mp.search_tsv, q.tsq) desc, mp.user_id))::int as rnk
      from member_profiles mp join cands c on c.id = mp.user_id cross join q
      where mp.event_id = ${o.eventId} and mp.search_tsv @@ q.tsq
      order by rnk limit ${S.SEARCH_POOL}
    ),
    vec as (${vectorArm(sql`c.id`, "member", o.eventId, o.vector)}),
    fused as (${fusedSql(sql`kw.id`)})
    select p.user_id, p.handle, p.name, p.hacky_style,
      em.role, em.verified, em.availability,
      coalesce(mp.skills, '{}') as skills, mp.experience, mp.goal, mp.track,
      coalesce(mp.interests, '{}') as interests, coalesce(mp.motivations, '{}') as motivations,
      f.kw_rank, f.vec_rank, f.sim
    from fused f
    join profiles p on p.user_id = f.owner_id
    join event_members em on em.event_id = ${o.eventId} and em.user_id = f.owner_id
    left join member_profiles mp on mp.event_id = ${o.eventId} and mp.user_id = f.owner_id
    order by f.rrf desc
    limit ${S.SEARCH_POOL}
  `;
}

/** Cosine-similarity ranking over the candidates' stored embeddings. */
function vectorArm(candId: SQL, ownerKind: "member" | "team", eventId: string, vector: string | null): SQL {
  if (!vector) return sql`select null::text as id, null::int as rnk, null::float8 as sim where false`;
  return sql`
    select id, rnk, sim from (
      select s.id, s.sim, (row_number() over (order by s.sim desc, s.id))::int as rnk
      from (
        select e.owner_id as id, (1 - (e.embedding <=> ${vector}::vector))::float8 as sim
        from embeddings e join cands c on ${candId} = e.owner_id
        where e.event_id = ${eventId} and e.owner_kind = ${ownerKind}
      ) s
      where s.sim >= ${S.MIN_SIMILARITY}
    ) r
    order by rnk limit ${S.SEARCH_POOL}
  `;
}

/** Reciprocal Rank Fusion (k = 60) of the keyword and vector lists, top 30. */
function fusedSql(kwId: SQL): SQL {
  return sql`
    select coalesce(${kwId}, vec.id) as owner_id, kw.rnk as kw_rank, vec.rnk as vec_rank, vec.sim,
      coalesce(1.0::float8 / (${S.RRF_K} + kw.rnk), 0) + coalesce(1.0::float8 / (${S.RRF_K} + vec.rnk), 0) as rrf
    from kw full join vec on vec.id = ${kwId}
    order by rrf desc
    limit ${S.SEARCH_POOL}
  `;
}

/** No block in either direction between the viewer and this user. */
function notBlocked(userId: SQL, viewerId: string): SQL {
  return sql`not exists (
    select 1 from blocks b
    where (b.blocker_id = ${viewerId} and b.blocked_id = ${userId})
       or (b.blocker_id = ${userId} and b.blocked_id = ${viewerId})
  )`;
}

/** No request in either direction between the viewer and this user in this event. */
function notRequested(userId: SQL, viewerId: string, eventId: string): SQL {
  return sql`not exists (
    select 1 from connections cn
    where cn.event_id = ${eventId}
      and ((cn.from_user = ${viewerId} and cn.to_user = ${userId})
        or (cn.from_user = ${userId} and cn.to_user = ${viewerId}))
  )`;
}

async function queryVector(
  queryText: string,
  skills: readonly string[],
  precomputed: number[] | null | undefined,
): Promise<string | null> {
  if (precomputed) return vectorLiteral(precomputed);
  const text = queryEmbeddingText(queryText, skills);
  if (!text) return null;
  const [vector] = await embedTexts([text], "query");
  return vector ? vectorLiteral(vector) : null;
}

function vectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

// ---------------------------------------------------------------------------
// Cards, reasons and the result
// ---------------------------------------------------------------------------

/** Keeps cards at or above MIN_SCORE (up to limit), or returns noMatch. */
export function toResult(kind: SearchKind, ranked: Ranked[], limit = DEFAULT_LIMIT): SearchResult {
  const max = Math.min(MAX_CARDS, Math.max(1, Math.floor(limit)));
  const cards = ranked.filter((r) => r.score >= S.MIN_SCORE).slice(0, max).map((r) => r.card);
  if (cards.length === 0) return noMatch(kind);
  return { status: "matches", kind, cards };
}

function noMatch(kind: SearchKind): NoMatch {
  const reason = {
    hacker: "No one who is still looking fits this search well enough. Try fewer must-have skills or describe it another way.",
    team: "No open team fits this search well enough right now.",
    mentor: "No verified mentor who is online fits this request right now.",
  }[kind];
  return { status: "noMatch", kind, reason };
}

function personSummary(row: MemberRow): PersonCard["person"] {
  return {
    userId: row.user_id,
    handle: row.handle,
    name: row.name,
    hackyStyle: row.hacky_style ?? {},
    role: row.role,
  };
}

function goalSide(row: {
  goal: HackGoal | null;
  track: string | null;
  motivations: string[];
  experience: Experience | null;
}): S.GoalSide {
  return { goal: row.goal, track: row.track, motivations: row.motivations, experience: row.experience };
}

function personReason(e: PersonCard["evidence"]): string {
  const bits: string[] = [];
  if (e.matchedSkills.length > 0) bits.push(`has ${listText(e.matchedSkills)}, which you need`);
  if (e.sharedInterests.length > 0) bits.push(`also into ${listText(e.sharedInterests)}`);
  if (e.experienceFits && e.experience) bits.push(`${e.experience} experience`);
  if (e.sameGoal && e.goal) bits.push(`also wants to ${e.goal}`);
  if (e.sameTrack && e.track) bits.push(`same track (${e.track})`);
  return sentence(bits, "Closest match to your search at this event.");
}

function teamReason(matched: string[], row: TeamRow, sameTrack: boolean): string {
  const bits: string[] = [];
  if (matched.length > 0) bits.push(`needs ${listText(matched)}, which you have`);
  if (sameTrack && row.track) bits.push(`same track (${row.track})`);
  const open = row.max_size - row.size;
  bits.push(`${open} open ${open === 1 ? "spot" : "spots"}`);
  return sentence(bits, "Open team close to your search.");
}

function mentorReason(matched: string[], availability: Availability): string {
  const bits: string[] = [];
  if (matched.length > 0) bits.push(`knows ${listText(matched)}`);
  bits.push(availability === "available" ? "available now" : "busy right now");
  return sentence(bits, "Verified mentor close to your request.");
}

function sentence(bits: string[], fallback: string): string {
  if (bits.length === 0) return fallback;
  const text = bits.join("; ");
  const full = `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
  return full.length <= 280 ? full : `${full.slice(0, 277).trimEnd()}...`;
}

function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Tags as the contract allows them: trimmed, 1–40 chars, at most 30. */
function tags(items: readonly string[]): string[] {
  return items
    .map((x) => x.trim())
    .filter((x) => x.length >= 1 && x.length <= 40)
    .slice(0, 30);
}

function debugOf(row: { kw_rank: number | null; vec_rank: number | null; sim: number | null }): Ranked["debug"] {
  return { keywordRank: row.kw_rank, vectorRank: row.vec_rank, similarity: row.sim };
}

function byScore(a: Ranked, b: Ranked): number {
  return b.score - a.score;
}
