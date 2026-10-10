// Pure matching math: skill normalization, needed skills, coverage, goal fit,
// RRF relevance and the final scores. No database or network here, so
// test-match.ts can unit-test it. The definitions follow the plan's Matching
// section; the weights and the threshold are calibrated against
// seed/match-cases.json.

export const RRF_K = 60;
/** Best possible RRF: rank 1 in both the keyword and the vector list. */
export const RRF_MAX = 2 / (RRF_K + 1);
/** Candidates kept after the hybrid search. */
export const SEARCH_POOL = 30;

export const WEIGHTS = {
  person: { relevance: 0.4, coverage: 0.4, goalFit: 0.2 },
  // When the search needs no skills (and the viewer wants none).
  personNoNeeds: { relevance: 0.65, goalFit: 0.35 },
  mentor: { skillOverlap: 0.6, relevance: 0.25, availableNow: 0.15 },
} as const;

/**
 * Inside goal_fit, how much "experienced" counts when the viewer asked for it,
 * relative to goal, track and motivations (1 each).
 */
export const EXPERIENCE_WEIGHT = 2;

/** Best score below this returns noMatch; weaker cards are dropped too. */
export const MIN_SCORE = 0.45;

/**
 * The vector list only keeps candidates at least this similar (cosine) to the
 * query, so a nonsense query doesn't get a "best" neighbor for free.
 */
export const MIN_SIMILARITY = 0;

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

// Spelling variants that mean the same skill. Keys and values are already
// lowercased with single spaces.
const ALIASES: Record<string, string> = {
  node: "node.js",
  nodejs: "node.js",
  "node js": "node.js",
  reactjs: "react",
  "react.js": "react",
  "react js": "react",
  nextjs: "next.js",
  next: "next.js",
  vuejs: "vue",
  "vue.js": "vue",
  ts: "typescript",
  js: "javascript",
  postgresql: "postgres",
  psql: "postgres",
  ml: "machine learning",
  "machine-learning": "machine learning",
  "deep-learning": "deep learning",
  "front end": "frontend",
  "front-end": "frontend",
  "back end": "backend",
  "back-end": "backend",
  "full stack": "fullstack",
  "full-stack": "fullstack",
  golang: "go",
  py: "python",
  tf: "tensorflow",
  sklearn: "scikit-learn",
  "scikit learn": "scikit-learn",
  k8s: "kubernetes",
  oauth2: "oauth",
  "oauth 2.0": "oauth",
  "oauth2.0": "oauth",
  authentication: "auth",
  "user auth": "auth",
  css3: "css",
  html5: "html",
  "ui/ux": "ui design",
  "ux/ui": "ui design",
  "user interface": "ui",
  "rest api": "apis",
  "rest apis": "apis",
  api: "apis",
  "api design": "apis",
  llm: "llms",
};

// Having the key skill also counts as having these broader skills
// (React ⇒ frontend). One direction only: "frontend" does not imply React.
const IMPLIES: Record<string, string[]> = {
  react: ["frontend"],
  vue: ["frontend"],
  svelte: ["frontend"],
  angular: ["frontend"],
  "next.js": ["react", "frontend"],
  css: ["frontend"],
  html: ["frontend"],
  tailwind: ["css", "frontend"],
  "node.js": ["backend"],
  express: ["node.js", "backend"],
  postgres: ["sql", "backend"],
  mysql: ["sql", "backend"],
  sql: ["backend"],
  django: ["python", "backend"],
  flask: ["python", "backend"],
  fastapi: ["python", "backend"],
  go: ["backend"],
  "spring boot": ["java", "backend"],
  rails: ["ruby", "backend"],
  apis: ["backend"],
  graphql: ["apis", "backend"],
  mongodb: ["backend"],
  fullstack: ["frontend", "backend"],
  pytorch: ["machine learning"],
  tensorflow: ["machine learning"],
  "scikit-learn": ["machine learning"],
  "deep learning": ["machine learning"],
  "computer vision": ["machine learning"],
  nlp: ["machine learning"],
  oauth: ["auth"],
  jwt: ["auth"],
  "react native": ["mobile"],
  flutter: ["mobile"],
  swift: ["ios", "mobile"],
  swiftui: ["swift", "ios", "mobile"],
  kotlin: ["android", "mobile"],
  // A frontend dev's "UI" is building interfaces, so plain "ui" implies no design.
  figma: ["design"],
  ux: ["design"],
  "ui design": ["ui", "design"],
  "ux design": ["ux", "design"],
  "product design": ["design"],
};

/** Lowercase, single spaces, aliases resolved. "Node" and "node.js" → "node.js". */
export function normalizeSkill(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[key] ?? key;
}

/** A person's skills plus everything they imply, normalized. */
export function expandSkills(skills: readonly string[]): Set<string> {
  const out = new Set<string>();
  const visit = (skill: string) => {
    if (!skill || out.has(skill)) return;
    out.add(skill);
    for (const implied of IMPLIES[skill] ?? []) visit(implied);
  };
  for (const raw of skills) visit(normalizeSkill(raw));
  return out;
}

// Skill words found in free text count as skills the search asks for.
// Left out: words that are also everyday English ("go", "express", "next").
const AMBIGUOUS = new Set(["go", "next", "ts", "js", "py", "tf", "express", "swift"]);
const VOCABULARY = [
  ...new Set([
    ...Object.keys(ALIASES),
    ...Object.values(ALIASES),
    ...Object.keys(IMPLIES),
    ...Object.values(IMPLIES).flat(),
  ]),
]
  .filter((term) => !AMBIGUOUS.has(term))
  .sort((a, b) => b.length - a.length);
const VOCABULARY_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${VOCABULARY.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

/** Known skills named in the text, e.g. "a backend dev into ML" → backend, ml. */
export function skillsInText(text: string): string[] {
  const found = text.toLowerCase().replace(/\s+/g, " ").match(VOCABULARY_RE) ?? [];
  return uniqueSkills(found);
}

/** Skills the search asks for: the explicit list plus skills named in the text. */
export function searchSkills(queryText: string, explicit: readonly string[] = []): string[] {
  return uniqueSkills([...explicit, ...skillsInText(queryText)]);
}

/** Deduplicate tag labels by normalized form, keeping the first spelling. */
export function uniqueSkills(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    const key = normalizeSkill(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * needed = skills the search asks for + the viewer's skills_wanted
 *          − skills the viewer already has.
 */
export function computeNeeded(
  searchSkills: readonly string[],
  viewerWanted: readonly string[],
  viewerHas: readonly string[],
): string[] {
  const has = expandSkills(viewerHas);
  return uniqueSkills([...searchSkills, ...viewerWanted]).filter(
    (label) => !has.has(normalizeSkill(label)),
  );
}

/** The needed labels this candidate covers. */
export function matchSkills(needed: readonly string[], candidateSkills: readonly string[]): string[] {
  const has = expandSkills(candidateSkills);
  return uniqueSkills(needed).filter((label) => has.has(normalizeSkill(label)));
}

/** Share of the needed skills the candidate has; null when nothing is needed. */
export function coverage(needed: readonly string[], candidateSkills: readonly string[]): number | null {
  const unique = uniqueSkills(needed);
  if (unique.length === 0) return null;
  return matchSkills(unique, candidateSkills).length / unique.length;
}

/** Skills the search asks for count this much of coverage; the viewer's other wants the rest. */
export const ASKED_SKILL_SHARE = 0.8;
/** A candidate with none of the skills the search asks for keeps this share of their score. */
export const MISSING_ASKED_FACTOR = 0.5;

/**
 * Splits needed skills into the ones this search asks for and the viewer's
 * other wanted skills, both minus what the viewer already has.
 */
export function splitNeeded(
  searchSkills: readonly string[],
  viewerWanted: readonly string[],
  viewerHas: readonly string[],
): { asked: string[]; background: string[] } {
  const has = expandSkills(viewerHas);
  const asked = uniqueSkills(searchSkills).filter((label) => !has.has(normalizeSkill(label)));
  const askedKeys = new Set(asked.map(normalizeSkill));
  const background = uniqueSkills(viewerWanted).filter(
    (label) => !has.has(normalizeSkill(label)) && !askedKeys.has(normalizeSkill(label)),
  );
  return { asked, background };
}

/** 80% coverage of the asked skills + 20% of the background ones; plain coverage if only one side exists. */
export function blendedCoverage(
  asked: readonly string[],
  background: readonly string[],
  candidateSkills: readonly string[],
): number | null {
  const a = coverage(asked, candidateSkills);
  const b = coverage(background, candidateSkills);
  if (a === null) return b;
  if (b === null) return a;
  return round(ASKED_SKILL_SHARE * a + (1 - ASKED_SKILL_SHARE) * b);
}

// ---------------------------------------------------------------------------
// Tags (interests, motivations, tracks)
// ---------------------------------------------------------------------------

function tagKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

/** b's labels that also appear in a (case-insensitive). */
export function sharedTags(a: readonly string[], b: readonly string[]): string[] {
  const keys = new Set(a.map(tagKey));
  const seen = new Set<string>();
  return b.filter((label) => {
    const key = tagKey(label);
    if (!key || !keys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && tagKey(a) === tagKey(b);
}

// ---------------------------------------------------------------------------
// Goal fit
// ---------------------------------------------------------------------------

export type Experience = "beginner" | "intermediate" | "advanced";

export type GoalSide = {
  goal: string | null;
  track: string | null;
  motivations: readonly string[];
  experience: Experience | null;
};

export type GoalFit = {
  goalFit: number;
  sameGoal: boolean;
  sameTrack: boolean;
  sharedMotivations: string[];
  /** null unless the viewer asked for someone experienced. */
  experienceFits: boolean | null;
};

/**
 * goal_fit = same goal + same track + motivation overlap
 *            (+ experience match, only if the viewer asked for experienced),
 * as a weighted average over the parts the viewer has filled in, so 0–1.
 */
export function goalFit(
  viewer: GoalSide & { wantsExperienced: boolean },
  candidate: GoalSide,
): GoalFit {
  const sameGoal = !!viewer.goal && viewer.goal === candidate.goal;
  const sameTrack = sameText(viewer.track, candidate.track);
  const sharedMotivations = sharedTags(viewer.motivations, candidate.motivations);
  const experienceFits = viewer.wantsExperienced
    ? candidate.experience === "intermediate" || candidate.experience === "advanced"
    : null;

  let total = 0;
  let weight = 0;
  if (viewer.goal) {
    weight += 1;
    total += sameGoal ? 1 : 0;
  }
  if (viewer.track) {
    weight += 1;
    total += sameTrack ? 1 : 0;
  }
  const viewerMotivations = sharedTags(viewer.motivations, viewer.motivations);
  if (viewerMotivations.length > 0) {
    weight += 1;
    total += sharedMotivations.length / viewerMotivations.length;
  }
  if (experienceFits !== null) {
    weight += EXPERIENCE_WEIGHT;
    total += experienceFits ? EXPERIENCE_WEIGHT : 0;
  }

  return {
    goalFit: weight === 0 ? 0 : total / weight,
    sameGoal,
    sameTrack,
    sharedMotivations,
    experienceFits,
  };
}

// ---------------------------------------------------------------------------
// Relevance and scores
// ---------------------------------------------------------------------------

/** Reciprocal Rank Fusion over 1-based ranks; null means "not in that list". */
export function rrf(ranks: readonly (number | null | undefined)[]): number {
  let sum = 0;
  for (const rank of ranks) if (rank != null && rank > 0) sum += 1 / (RRF_K + rank);
  return sum;
}

/** RRF ÷ its maximum (2/61), clamped to 0–1. */
export function relevance(rrfScore: number): number {
  return clamp01(rrfScore / RRF_MAX);
}

/** score = 0.40·relevance + 0.40·coverage + 0.20·goal_fit, or 0.65/0.35 with no needs. */
export function personScore(parts: {
  relevance: number;
  coverage: number | null;
  goalFit: number;
}): number {
  if (parts.coverage === null) {
    const w = WEIGHTS.personNoNeeds;
    return round(w.relevance * parts.relevance + w.goalFit * parts.goalFit);
  }
  const w = WEIGHTS.person;
  return round(w.relevance * parts.relevance + w.coverage * parts.coverage + w.goalFit * parts.goalFit);
}

/**
 * score = 0.60·skill overlap + 0.25·relevance + 0.15 if available now.
 * With no skills in the request, the overlap weight moves to relevance.
 */
export function mentorScore(parts: {
  skillOverlap: number | null;
  relevance: number;
  availableNow: boolean;
}): number {
  const w = WEIGHTS.mentor;
  const available = parts.availableNow ? w.availableNow : 0;
  if (parts.skillOverlap === null) {
    return round((w.skillOverlap + w.relevance) * parts.relevance + available);
  }
  return round(w.skillOverlap * parts.skillOverlap + w.relevance * parts.relevance + available);
}

export function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

export function round(x: number): number {
  return Math.round(clamp01(x) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Keyword query
// ---------------------------------------------------------------------------

// Words that describe the search itself, not the person.
const FILLER = new Set([
  "find", "me", "someone", "somebody", "anyone", "person", "people", "teammate",
  "teammates", "team", "teams", "partner", "partners", "looking", "need", "needs",
  "want", "wants", "who", "knows", "know", "good", "great", "help", "hacker",
  "hackers", "mentor", "mentors", "please", "really", "also", "get", "like",
  "dev", "devs", "developer", "developers", "or", "and", "not", "an", "a", "the",
]);

/**
 * Turns free text plus skills into an OR query for websearch_to_tsquery, so a
 * profile matching some of the words still ranks (ts_rank rewards more hits).
 */
export function keywordQuery(text: string, skills: readonly string[] = []): string {
  const words = `${text} ${skills.join(" ")}`
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}.+#]*/gu) ?? [];
  const unique = [...new Set(words.map((w) => w.replace(/[.]+$/, "")))].filter(
    (w) => w.length > 0 && !FILLER.has(w),
  );
  return unique.slice(0, 32).join(" or ");
}
