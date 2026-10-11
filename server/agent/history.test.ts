// npm run test:history
// Checks the history upgrade in history.ts: parts saved under an older contract
// (ask_with_options without `say`, people without `photoUrl`) load in today's shape and
// pass validation against the real tool schemas, next to today's shapes (closest results). history.ts and tools.ts import the
// database client, which needs DATABASE_URL at import time, so the script loads
// .env.local. Nothing here queries the database or calls Gemini.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { safeValidateUIMessages, type UIMessage } from "ai";
import type { AskWithOptionsInput, Intake, PersonCard, PersonSummary, TeamCard } from "../../shared/contract.js";
import type { ChatContext } from "./data.js";
import { upgradePart, withPhotoUrl } from "./history.js";
import { buildTools } from "./tools.js";

type Part = UIMessage["parts"][number];
type ToolPart = { type: string; toolCallId: string; state: string; input?: unknown; output?: unknown };

// Shapes saved before photoUrl and say became required.
type OldPerson = Omit<PersonSummary, "photoUrl">;
type OldPersonCard = Omit<PersonCard, "person"> & { person: OldPerson };
type OldTeamCard = Omit<TeamCard, "team"> & { team: Omit<TeamCard["team"], "owner"> & { owner: OldPerson } };
type OldQuestionInput = Omit<AskWithOptionsInput, "say">;

const asTool = (part: Part) => part as unknown as ToolPart;
/** Round-trips through JSON like the jsonb column, then upgrades like loadThread. */
const load = (parts: Part[]): Part[] => (JSON.parse(JSON.stringify(parts)) as Part[]).map(upgradePart);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const maya: OldPerson = {
  userId: "usr_maya_01",
  handle: "maya_backend",
  name: "Maya Chen",
  hackyStyle: { look: "knit", color: "teal" },
  role: "hacker",
};
const devon: OldPerson = { userId: "usr_devon_02", handle: "devon_ui", name: "Devon Park", hackyStyle: {}, role: "hacker" };
const priya: OldPerson = {
  userId: "usr_priya_03",
  handle: "priya_builds",
  name: "Priya Nair",
  hackyStyle: { look: "knit", flair: "beanie" },
  role: "hacker",
};

function personCard(person: OldPerson, skills: string[], reason: string): OldPersonCard {
  return {
    card: "person",
    person,
    skills,
    score: 0.82,
    scoreParts: { relevance: 0.7, coverage: 1, goalFit: 0.8 },
    evidence: {
      matchedSkills: [skills[0] ?? "Python"],
      sharedInterests: ["health tech"],
      goal: "win",
      sameGoal: true,
      track: "Health",
      sameTrack: true,
      experience: "intermediate",
      experienceFits: null,
      availability: "available",
    },
    reason,
  };
}

const teamCard: OldTeamCard = {
  card: "team",
  team: {
    id: "0d6f9a5e-2c4b-4f7e-9a1d-3b8c5e7f9a12",
    name: "Pulse",
    idea: "A wearable that flags dehydration during long shifts",
    track: "Health",
    wantedSkills: ["React", "Figma"],
    size: 2,
    maxSize: 4,
    owner: priya,
  },
  score: 0.74,
  scoreParts: { relevance: 0.6, coverage: 0.5, goalFit: 1 },
  evidence: { matchedSkills: ["React"], track: "Health", sameTrack: true },
  reason: "They want React, which you know, and they're in the Health track too.",
};

const oldHackerSearch = {
  status: "matches" as const,
  kind: "hacker" as const,
  cards: [
    personCard(maya, ["Python", "FastAPI", "Postgres"], "Maya builds Python APIs, the backend skill you asked for."),
    personCard(devon, ["React", "Figma"], "Devon designs in Figma and ships React, and wants to win too."),
  ],
};
const oldTeamSearch = { status: "matches" as const, kind: "team" as const, cards: [teamCard] };

function searchPart(toolCallId: string, input: { kind: string; query: string }, output: unknown): Part {
  return {
    type: "tool-search_people",
    toolCallId,
    state: "output-available",
    input,
    output,
    callProviderMetadata: { google: { thoughtSignature: `sig-${toolCallId}` } },
  } as Part;
}

const oldQuestionInput: OldQuestionInput = {
  question: "What are you hoping to get out of this weekend?",
  options: ["Win a prize", "Learn something new", "Ship a project"],
};

function questionPart(toolCallId: string, input: OldQuestionInput | AskWithOptionsInput, answer?: string): Part {
  const base = { type: "tool-ask_with_options", toolCallId, input, callProviderMetadata: { google: { thoughtSignature: `sig-${toolCallId}` } } };
  return (answer === undefined
    ? { ...base, state: "input-available" }
    : { ...base, state: "output-available", output: { answer } }) as Part;
}

const withPhoto = (person: OldPerson, photoUrl: string | null = null): PersonSummary => ({ ...person, photoUrl });

/** Every object in `value` that looks like a person (has userId and handle). */
function peopleIn(value: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) value.forEach((v) => peopleIn(v, found));
  else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("userId" in obj && "handle" in obj) found.push(obj);
    Object.values(obj).forEach((v) => peopleIn(v, found));
  }
  return found;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("upgradePart: ask_with_options say", () => {
  test("adds say: \"\" to a question saved without one and keeps the rest of its input", () => {
    for (const old of [questionPart("call_q1", oldQuestionInput, "Learn something new"), questionPart("call_q2", oldQuestionInput)]) {
      const { input, ...rest } = asTool(upgradePart(old));
      const { input: oldInput, ...oldRest } = asTool(old);
      assert.deepEqual(input, { ...oldQuestionInput, say: "" });
      assert.deepEqual(rest, oldRest);
      assert.equal("say" in (oldInput as object), false, "the stored part is not mutated");
    }
  });

  test("leaves a question that already has say unchanged", () => {
    for (const say of ["Nice to meet you, Maya!", ""]) {
      const part = questionPart("call_q3", { say, ...oldQuestionInput }, "Ship a project");
      const snapshot = structuredClone(part);
      assert.deepEqual(upgradePart(part), snapshot);
    }
  });
});

describe("upgradePart: photoUrl on people", () => {
  test("adds photoUrl: null to person cards and team owners at every level of a search_people output", () => {
    const hackers = asTool(upgradePart(searchPart("call_s1", { kind: "hacker", query: "backend dev" }, oldHackerSearch)));
    assert.deepEqual(hackers.output, {
      ...oldHackerSearch,
      cards: oldHackerSearch.cards.map((card) => ({ ...card, person: withPhoto(card.person) })),
    });

    const teams = asTool(upgradePart(searchPart("call_s2", { kind: "team", query: "health team" }, oldTeamSearch)));
    assert.deepEqual(teams.output, {
      ...oldTeamSearch,
      cards: [{ ...teamCard, team: { ...teamCard.team, owner: withPhoto(priya) } }],
    });

    const people = [...peopleIn(hackers.output), ...peopleIn(teams.output)];
    assert.equal(people.length, 3);
    for (const person of people) assert.equal(person.photoUrl, null, `${String(person.handle)} has photoUrl: null`);
  });

  test("keeps existing photoUrl values, a string or null", () => {
    const output = {
      status: "matches",
      kind: "hacker",
      cards: [
        { ...personCard(maya, ["Python"], "Python backend."), person: withPhoto(maya, "/assets/people/maya.jpg") },
        { ...personCard(devon, ["React"], "React frontend."), person: withPhoto(devon, null) },
        { ...teamCard, team: { ...teamCard.team, owner: withPhoto(priya, "https://avatars.example.com/priya.png") } },
      ],
    };
    const upgraded = asTool(upgradePart(searchPart("call_s3", { kind: "hacker", query: "anyone" }, output)));
    assert.deepEqual(upgraded.output, output);
    assert.deepEqual(
      peopleIn(upgraded.output).map((p) => p.photoUrl),
      ["/assets/people/maya.jpg", null, "https://avatars.example.com/priya.png"],
    );
  });

  test("doesn't add photoUrl to objects that aren't people", () => {
    const noMatch = { status: "noMatch", kind: "mentor", reason: "No verified mentor knows Rust here yet." };
    assert.deepEqual(asTool(upgradePart(searchPart("call_s4", { kind: "mentor", query: "rust" }, noMatch))).output, noMatch);

    const answered = asTool(upgradePart(questionPart("call_q4", { say: "Got it.", ...oldQuestionInput }, "Win a prize")));
    assert.deepEqual(answered.output, { answer: "Win a prize" });

    const upgraded = asTool(upgradePart(searchPart("call_s5", { kind: "team", query: "health team" }, oldTeamSearch)));
    const card = (upgraded.output as { cards: Record<string, Record<string, unknown>>[] }).cards[0]!;
    for (const key of ["team", "evidence", "scoreParts"] as const) {
      assert.equal("photoUrl" in card[key]!, false, `${key} has no photoUrl`);
    }
    assert.equal("photoUrl" in card, false, "the card itself has no photoUrl");

    // Half a person is not a person.
    assert.deepEqual(withPhotoUrl({ userId: "usr_maya_01", name: "Maya" }), { userId: "usr_maya_01", name: "Maya" });
    assert.deepEqual(withPhotoUrl({ handle: "maya_backend" }), { handle: "maya_backend" });
    assert.deepEqual(withPhotoUrl([1, "two", null, { id: "x" }]), [1, "two", null, { id: "x" }]);
  });
});

describe("upgradePart: other parts", () => {
  test("passes text and step-start parts through unchanged", () => {
    const parts: Part[] = [
      { type: "step-start" },
      { type: "text", text: "Here are two people who fit.", state: "done" },
      { type: "text", text: "Here are two people who fit." },
    ];
    for (const part of parts) {
      const snapshot = structuredClone(part);
      const upgraded = upgradePart(part);
      assert.equal(upgraded, part, "same object back");
      assert.deepEqual(upgraded, snapshot);
    }
  });
});

describe("upgraded history validates against the real tool schemas", () => {
  const intake: Intake = {
    skills: [],
    skillsWanted: [],
    experience: null,
    wantsExperienced: false,
    goal: null,
    track: null,
    interests: [],
    idea: null,
    motivations: [],
    summary: null,
    complete: false,
  };
  const ctx: ChatContext = {
    userId: "usr_viewer_00",
    eventId: "7a3c2e1f-4b5d-4c6e-8f9a-0b1c2d3e4f50",
    event: { slug: "knighthacks", name: "KnightHacks", tracks: ["Health", "Fintech"] },
    me: { name: "Sam Rivera", handle: "sam_rivera", role: "hacker" },
    intake,
  };
  const tools = buildTools(ctx);

  // A thread saved under the old contract: an answered question, a team search, a
  // hacker search, and a question still waiting for an answer.
  const stored: UIMessage[] = [
    { id: "msg_u1", role: "user", parts: [{ type: "text", text: "hey! I want to join a team" }] },
    {
      id: "msg_a1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        questionPart("call_q1", oldQuestionInput, "Win a prize"),
        { type: "step-start" },
        searchPart("call_s1", { kind: "team", query: "health team that wants to win" }, oldTeamSearch),
        { type: "step-start" },
        { type: "text", text: "Pulse is building in the Health track and wants React.", state: "done" },
      ],
    },
    { id: "msg_u2", role: "user", parts: [{ type: "text", text: "any backend people instead?" }] },
    {
      id: "msg_a2",
      role: "assistant",
      parts: [
        { type: "step-start" },
        searchPart("call_s2", { kind: "hacker", query: "backend developer" }, oldHackerSearch),
        { type: "step-start" },
        questionPart("call_q2", { question: "Want me to draft an intro?", options: ["Maya", "Devon", "Not yet"] }),
      ],
    },
  ];

  test("old question and search_people parts fail validation before the upgrade", async () => {
    // Each assistant message alone, so one bad part can't hide that the other passes.
    for (const message of stored.filter((m) => m.role === "assistant")) {
      const result = await safeValidateUIMessages({ messages: [message], tools });
      assert.equal(result.success, false, `${message.id} should fail before the upgrade`);
    }
    const searchOnly = { ...stored[1]!, parts: stored[1]!.parts.filter((p) => p.type !== "tool-ask_with_options") };
    const questionOnly = { ...stored[1]!, parts: stored[1]!.parts.filter((p) => p.type !== "tool-search_people") };
    assert.equal((await safeValidateUIMessages({ messages: [searchOnly], tools })).success, false, "old search output");
    assert.equal((await safeValidateUIMessages({ messages: [questionOnly], tools })).success, false, "old question input");
  });

  test("after the upgrade, old search_people outputs and old questions pass safeValidateUIMessages", async () => {
    const upgraded = stored.map((m) => ({ ...m, parts: load(m.parts) }));
    const result = await safeValidateUIMessages({ messages: upgraded, tools });
    assert.ok(result.success, result.success ? "" : result.error.message);
    assert.deepEqual(
      result.data.map((m) => m.id),
      stored.map((m) => m.id),
      "every message is kept",
    );
    const types = result.data.flatMap((m) => m.parts.map((p) => p.type));
    assert.equal(types.filter((t) => t === "tool-search_people").length, 2, "search parts stay typed, not dynamic");
    assert.equal(types.filter((t) => t === "tool-ask_with_options").length, 2, "question parts stay typed, not dynamic");
  });

  test("a closest search_people result (no strong match) loads and validates; old noMatch still does", async () => {
    const closest = {
      status: "closest",
      kind: "hacker",
      note: "No one still looking lists Rust; these are the closest.",
      cards: [personCard(maya, ["Python", "Go"], "Has Go; no Rust listed.")],
    };
    const noMatch = { status: "noMatch", kind: "mentor", reason: "No verified mentor who is online fits this request right now." };
    const message: UIMessage = {
      id: "msg_a3",
      role: "assistant",
      parts: [
        { type: "step-start" },
        searchPart("call_s5", { kind: "hacker", query: "rust dev" }, closest),
        { type: "step-start" },
        searchPart("call_s6", { kind: "mentor", query: "solidity" }, noMatch),
      ],
    };
    const result = await safeValidateUIMessages({ messages: [{ ...message, parts: load(message.parts) }], tools });
    assert.ok(result.success, result.success ? "" : result.error.message);
    const outputs = result.data[0]!.parts.map((p) => asTool(p).output).filter(Boolean) as { status: string }[];
    assert.deepEqual(outputs.map((o) => o.status), ["closest", "noMatch"]);
  });
});
