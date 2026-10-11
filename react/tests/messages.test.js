import test from 'node:test';
import assert from 'node:assert/strict';
import { canDelete, localMessage, pageConnects, reconcileMessages, removeMessage, savedIds } from '../src/social/messages.js';

const CONV = '00000000-0000-4000-8000-000000000000';
const at = (minute) => `2026-10-11T10:${String(minute).padStart(2, '0')}:00.000Z`;
const saved = (n, senderId = 'me', kind = 'text') => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  conversationId: CONV,
  senderId: kind === 'system' ? null : senderId,
  clientId: null,
  body: `message ${n}`,
  kind,
  createdAt: at(n),
});
const ids = (list) => list.map((m) => (m.local ? m.clientId : m.body));

test('canDelete: only my own saved, non-system messages', () => {
  assert.equal(canDelete(saved(1, 'me'), 'me'), true);
  assert.equal(canDelete(saved(1, 'kiran'), 'me'), false);
  assert.equal(canDelete(saved(1, 'me', 'system'), 'me'), false);
  assert.equal(canDelete({ ...saved(1, 'me'), kind: 'system' }, 'me'), false);
  assert.equal(canDelete(localMessage({ conversationId: CONV, senderId: 'me', clientId: 'c1', body: 'hi' }), 'me'), false);
  assert.equal(canDelete(saved(1, 'me'), undefined), false);
});

test('removeMessage drops one saved message and keeps local copies', () => {
  const local = localMessage({ conversationId: CONV, senderId: 'me', clientId: 'c1', body: 'hi' });
  const list = [saved(1), saved(2), local];
  assert.deepEqual(ids(removeMessage(list, saved(2).id)), ['message 1', 'c1']);
  assert.equal(removeMessage(list, 'not-there'), list);
});

test('reconcile: a whole-conversation page drops what the server no longer has', () => {
  const list = [saved(1), saved(2), saved(3)];
  const next = reconcileMessages(list, { messages: [saved(1), saved(3), saved(4)], hasMore: false }, savedIds(list));
  assert.deepEqual(ids(next), ['message 1', 'message 3', 'message 4']);
});

test('reconcile drops the newest message when its sender deleted it', () => {
  const list = [saved(1), saved(2), saved(3)];
  const next = reconcileMessages(list, { messages: [saved(1), saved(2)], hasMore: false }, savedIds(list));
  assert.deepEqual(ids(next), ['message 1', 'message 2']);
});

test('reconcile: only the page span is checked when there is more', () => {
  // Messages 1-2 are older than the page, so they can't be judged and stay.
  const list = [saved(1), saved(2), saved(3), saved(4), saved(5)];
  const next = reconcileMessages(list, { messages: [saved(3), saved(5)], hasMore: true }, savedIds(list));
  assert.deepEqual(ids(next), ['message 1', 'message 2', 'message 3', 'message 5']);
});

test('reconcile keeps local copies and messages that arrived while the page loaded', () => {
  const local = localMessage({ conversationId: CONV, senderId: 'me', clientId: 'c9', body: 'sending' });
  const before = [saved(1), saved(2), saved(3), local];
  const asked = savedIds(before);
  // A live message-new added 6 while the page was loading.
  const list = [saved(1), saved(2), saved(3), saved(6), local];
  const next = reconcileMessages(list, { messages: [saved(1), saved(3)], hasMore: false }, asked);
  assert.deepEqual(ids(next), ['message 1', 'message 3', 'message 6', 'c9']);
});

test('reconcile returns the same list when nothing changed', () => {
  const list = [saved(1), saved(2)];
  assert.equal(reconcileMessages(list, { messages: [saved(1), saved(2)], hasMore: false }, savedIds(list)), list);
});

test('reconcile with an empty conversation clears saved messages', () => {
  const list = [saved(1)];
  assert.deepEqual(reconcileMessages(list, { messages: [], hasMore: false }, savedIds(list)), []);
});

test('savedIds skips local copies', () => {
  const local = localMessage({ conversationId: CONV, senderId: 'me', clientId: 'c1', body: 'hi' });
  assert.deepEqual([...savedIds([saved(1), local])], [saved(1).id]);
});

test('pageConnects: whole conversation, shared message, or nothing saved on screen', () => {
  assert.equal(pageConnects([saved(1)], { messages: [saved(40)], hasMore: false }), true);
  assert.equal(pageConnects([saved(1), saved(2)], { messages: [saved(2), saved(3)], hasMore: true }), true);
  assert.equal(pageConnects([], { messages: [saved(2)], hasMore: true }), true);
  assert.equal(pageConnects([saved(1)], { messages: [saved(40), saved(41)], hasMore: true }), false);
});
