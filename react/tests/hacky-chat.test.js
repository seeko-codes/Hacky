import test from 'node:test';
import assert from 'node:assert/strict';
import { answeredAsk, dropUnansweredTurn, isPendingAsk } from '../src/hacky/useHackyChat.js';

const user = (id, text) => ({ id, role: 'user', parts: [{ type: 'text', text }] });
const ask = {
  type: 'tool-ask_with_options',
  toolCallId: 'call-1',
  state: 'input-available',
  input: { say: 'Sure.', question: 'What do you need a mentor for?', options: ['AI & ML', 'Something else'] },
};
const mentorQuestion = { id: 'a1', role: 'assistant', parts: [{ type: 'step-start' }, ask] };

test('an open mentor question is pending, and nothing is sent for it on its own', () => {
  assert.ok(isPendingAsk(ask));
  assert.equal(answeredAsk({ messages: [user('u1', 'Find a mentor'), mentorQuestion] }), false);
});

test('a team request after an open mentor question is a new turn, not a retry of an old one', () => {
  const thread = [user('u1', 'Find a mentor'), mentorQuestion];
  assert.equal(dropUnansweredTurn(thread, 'Show me open teams I can join'), thread);
});

test('sending the same team request again after it got no reply replaces that turn', () => {
  const thread = [user('u1', 'Find a mentor'), mentorQuestion, user('u2', 'Show me open teams I can join')];
  assert.deepEqual(dropUnansweredTurn(thread, 'Show me open teams I can join'), thread.slice(0, 2));
});
