// Pure turn merging: no database or model calls. Imports need DATABASE_URL only.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { UIMessage } from "ai";
import { mergeNewest } from "./chat.js";

const question: UIMessage = {
  id: "pending-mentor", role: "assistant", parts: [{
    type: "tool-ask_with_options", toolCallId: "ask-mentor", state: "input-available",
    input: { say: "Let's get you unstuck.", question: "What do you need a mentor for?", options: ["React", "Python"] },
  }],
};

for (const text of ["Help me find hackers", "Find a mentor", "Show me open teams I can join"]) {
  test(`a new starting point closes the old question: ${text}`, () => {
    const result = mergeNewest([question], { role: "user", parts: [{ type: "text", text }] });
    assert.equal(result.continuation, false);
    assert.equal(result.incoming.role, "user");
    assert.deepEqual(result.incoming.parts, [{ type: "text", text }]);
    assert.equal(result.messages.length, 2);
    const closed = result.closed!.parts[0] as { state: string; output: { skipped: boolean } };
    assert.equal(closed.state, "output-available");
    assert.equal(closed.output.skipped, true);
    assert.equal((question.parts[0] as { state: string }).state, "input-available", "doesn't mutate history");
  });
}

test("an answer chip continues its question, rather than starting a new request", () => {
  const result = mergeNewest([question], {
    ...question, parts: [{ ...question.parts[0], state: "output-available", output: { answer: "React" } }],
  });
  assert.equal(result.continuation, true);
  assert.equal(result.closed, undefined);
  assert.equal(result.incoming.id, question.id);
  assert.equal(result.messages.length, 1);
});

test("a stale answer cannot overwrite a newer request", () => {
  const newer = mergeNewest([question], { role: "user", parts: [{ type: "text", text: "Help me find hackers" }] });
  assert.throws(() => mergeNewest(newer.messages, {
    ...question, parts: [{ ...question.parts[0], state: "output-available", output: { answer: "React" } }],
  }), /question isn't open anymore/);
});
