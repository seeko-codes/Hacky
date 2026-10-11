// npm run test:social
// The delete rule in conversations.ts: only the sender deletes, and never a
// system message. conversations.ts imports the database client, which needs
// DATABASE_URL at import time, so the script loads .env.local. Nothing here
// queries the database.

import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteRefusal } from "./conversations.js";

test("the sender may delete their own text or card message", () => {
  assert.equal(deleteRefusal({ senderId: "demo_kiran", kind: "text" }, "demo_kiran"), null);
  assert.equal(deleteRefusal({ senderId: "demo_kiran", kind: "card" }, "demo_kiran"), null);
});

test("someone else's message is refused with 403", () => {
  const refusal = deleteRefusal({ senderId: "demo_kiran", kind: "text" }, "demo_bjorn");
  assert.equal(refusal?.status, 403);
  assert.equal(refusal?.message, "You can only delete your own messages.");
});

test("system messages are refused with 403, whoever asks", () => {
  for (const userId of ["demo_kiran", "demo_bjorn"]) {
    assert.equal(deleteRefusal({ senderId: null, kind: "system" }, userId)?.status, 403);
  }
  // Never written today, but a system kind wins even with a sender.
  const refusal = deleteRefusal({ senderId: "demo_kiran", kind: "system" }, "demo_kiran");
  assert.equal(refusal?.message, "System messages can't be deleted.");
});

test("a message that's already gone is 404", () => {
  assert.equal(deleteRefusal(undefined, "demo_kiran")?.status, 404);
});
