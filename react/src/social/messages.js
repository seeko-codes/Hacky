// Pure helpers for DM threads and the chat list. No React, so node can test them.
// A thread is server messages oldest first, then local copies (sending or
// failed) in the order they were written. Local copies have local: true.

const time = (m) => Date.parse(m.createdAt) || 0;

export function compareMessages(a, b) {
  return time(a) - time(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Adds server messages: skips ids already there and replaces a local copy
// with the same clientId.
export function mergeMessages(list, incoming) {
  const known = new Set();
  for (const m of list) if (!m.local) known.add(m.id);
  const fresh = new Map();
  for (const m of incoming) if (!known.has(m.id)) fresh.set(m.id, m);
  if (!fresh.size) return list;
  const sent = new Set();
  for (const m of fresh.values()) if (m.clientId) sent.add(m.clientId);
  const server = list.filter((m) => !m.local).concat([...fresh.values()]).sort(compareMessages);
  return server.concat(list.filter((m) => m.local && !sent.has(m.clientId)));
}

// Ids of the saved (not local) messages in a thread.
export function savedIds(list) {
  return new Set(list.filter((m) => !m.local).map((m) => m.id));
}

// The newest page from the server (oldest first) against what's on screen:
// adds what's new and drops saved messages the server no longer has (their
// sender deleted them). asked: savedIds of the screen when the page was
// requested. Only those can be judged, and only from the page's first message
// on (without hasMore the page is the whole conversation). Local copies, and
// messages that arrived while the page loaded, stay.
export function reconcileMessages(list, page, asked) {
  const got = page.messages;
  const ids = new Set(got.map((m) => m.id));
  const first = page.hasMore ? got[0] : null;
  const gone = (m) =>
    !m.local && asked.has(m.id) && !ids.has(m.id) && (!first || compareMessages(m, first) >= 0);
  const kept = list.some(gone) ? list.filter((m) => !gone(m)) : list;
  return mergeMessages(kept, got);
}

// The page joins what's on screen without a gap: it's the whole conversation,
// or it shares a saved message with the screen (or the screen has none).
export function pageConnects(list, page) {
  if (!page.hasMore) return true;
  const saved = savedIds(list);
  return !saved.size || page.messages.some((m) => saved.has(m.id));
}

// After a delete (or a 404 saying it's already gone).
export function removeMessage(list, id) {
  const next = list.filter((m) => m.local || m.id !== id);
  return next.length === list.length ? list : next;
}

// Only the sender can delete a saved message, and never a system one.
export const canDelete = (m, selfId) =>
  Boolean(selfId) && !m.local && m.kind !== 'system' && m.senderId === selfId;

export function localMessage({ conversationId, senderId, clientId, body }) {
  return {
    id: `local-${clientId}`,
    local: true,
    status: 'sending',
    error: '',
    conversationId,
    senderId,
    clientId,
    body,
    kind: 'text',
    createdAt: new Date().toISOString(),
  };
}

export function updateLocal(list, clientId, patch) {
  return list.map((m) => (m.local && m.clientId === clientId ? { ...m, ...patch } : m));
}

export const oldestId = (list) => list.find((m) => !m.local)?.id ?? null;
export const newestId = (list) => list.findLast((m) => !m.local)?.id ?? null;

// Consecutive bubbles from the same sender share one avatar.
export function grouped(prev, m) {
  return Boolean(prev) && prev.kind !== 'system' && m.kind !== 'system' && prev.senderId === m.senderId;
}

// A live message-new for the chat list: new last message, one more unread when
// it's from someone else and not on screen. Returns null for an unknown
// conversation (refetch the list), or the same list when it's already counted.
export function bumpConversation(list, message, { selfId, seen }) {
  const i = list.findIndex((c) => c.id === message.conversationId);
  if (i < 0) return null;
  const c = list[i];
  const last = c.lastMessage;
  if (last && (last.id === message.id || compareMessages(last, message) > 0)) return list;
  const counts = !seen && message.senderId !== selfId;
  const next = { ...c, lastMessage: message, unreadCount: c.unreadCount + (counts ? 1 : 0) };
  return [next, ...list.slice(0, i), ...list.slice(i + 1)];
}

export function splitRequests(requests = []) {
  const incoming = [], hidden = [], outgoing = [];
  for (const r of requests) {
    if (r.status !== 'pending') continue;
    if (r.direction === 'outgoing') outgoing.push(r);
    else (r.hiddenAt ? hidden : incoming).push(r);
  }
  return { incoming, hidden, outgoing };
}

export function newClientId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Intros: 1–500 characters, no links (shared/contract.ts Intro).
export function introProblem(text) {
  const t = text.trim();
  if (!t) return 'Write a short intro first.';
  if (t.length > 500) return 'Keep it under 500 characters.';
  if (/https?:\/\/|www\./i.test(t)) return 'Intros can’t contain links.';
  return '';
}
