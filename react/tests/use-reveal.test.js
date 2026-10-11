// useReveal run by React itself (react-dom with a stand-in page, mocked clock): history never
// replays, a reply shows typing, its message, then its cards, and anything that hides or swaps
// the pane cancels what's pending, so nothing lands late and nothing stays hidden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useReveal } from '../src/hacky/useReveal.js';
import { CAP_MS, FIRST_MS, GAP_MS, showingOrder } from '../src/hacky/reveal.js';
import { displayMessages } from '../src/hacky/presentation.js';

// Just enough of a page for react-dom to run a component that renders nothing.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { nodeType: 9, activeElement: null, addEventListener: noop, removeEventListener: noop };
globalThis.window ??= { document: doc, HTMLIFrameElement: class {}, event: undefined, addEventListener: noop, removeEventListener: noop };
doc.defaultView = globalThis.window;
const page = () => ({ nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: doc, addEventListener: noop, removeEventListener: noop });

const step = { type: 'step-start' };
const user = (id, text) => ({ id, role: 'user', parts: [{ type: 'text', text }] });
const reply = (id, parts) => ({ id, role: 'assistant', parts });
const text = (value, state = 'done') => ({ type: 'text', text: value, state });
const cards = (state = 'output-available') => ({
  type: 'tool-show_events', toolCallId: 'call-1', state, input: { names: ['Merch Market'] },
  ...(state === 'output-available' ? { output: { names: ['Merch Market'] } } : {}),
});
// The model calls show_events first and explains after; the explanation still shows first.
const picks = (state = 'done') => [step, cards(), step, text('For you, I’d start with **Merch Market**.', state)];
const visible = (part) => part.type !== 'step-start' && (part.type !== 'text' || Boolean(part.text.trim()));

// What HackyPane's ChatRow draws for a message: its parts in showing order, the settled and the revealed.
const onScreen = (out, message) => {
  const { from, shown } = out.view(message);
  return showingOrder(message.parts)
    .filter((i) => (i < from || shown.has(i)) && visible(message.parts[i]))
    .map((i) => (message.parts[i].type === 'text' ? 'text' : 'cards'));
};

function setup(t, props) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const root = createRoot(page());
  const probe = { out: null, renders: 0, props: { slug: 'knighthacks-ix', loaded: true, messages: [], status: 'ready', paused: false, reduced: false, visible, ...props } };
  function Probe({ slug, ...rest }) {
    probe.out = useReveal({ ...rest, key: slug });
    probe.renders += 1;
    return null;
  }
  probe.set = (next) => act(async () => {
    probe.props = { ...probe.props, ...next };
    root.render(createElement(Probe, probe.props));
  });
  // In 10 ms steps, so React renders between timers the way a browser does.
  probe.wait = async (ms) => {
    for (let left = ms; left > 0; left -= 10) await act(async () => { t.mock.timers.tick(Math.min(10, left)); });
  };
  probe.unmount = () => act(async () => root.unmount());
  return probe;
}

const ask = user('u1', 'What event do you recommend for me?');

test('stored history shows at once and never replays, on load or after a refresh', async (t) => {
  const history = [ask, reply('a1', picks())];
  for (let load = 0; load < 2; load++) {
    const probe = setup(t, { messages: history });
    await probe.set({});
    assert.deepEqual(onScreen(probe.out, history[1]), ['text', 'cards'], 'explanation first, then its cards');
    assert.ok(probe.out.history('a1') && probe.out.history('u1'));
    assert.equal(probe.out.view(history[1]).from, history[1].parts.length, 'settled: drawn without .hc-reveal');
    assert.equal(probe.out.waiting, false);
    await probe.unmount();
    t.mock.timers.reset();
  }
});

test('a new reply: typing, the message at two seconds after the request, then its cards', async (t) => {
  const probe = setup(t, { messages: [] });
  await probe.set({});
  await probe.set({ messages: [ask], status: 'submitted' });
  assert.equal(probe.out.waiting, true, 'typing while the request is out');

  await probe.wait(100);
  const early = reply('a1', [step, cards()]);
  await probe.set({ messages: [ask, early], status: 'streaming' });
  assert.deepEqual(onScreen(probe.out, early), [], 'the cards wait for their explanation');
  assert.equal(probe.out.waiting, true);

  await probe.wait(50);
  const writing = reply('a1', picks('streaming'));
  await probe.set({ messages: [ask, writing] });
  assert.deepEqual(onScreen(probe.out, writing), [], 'no half-written message');

  await probe.wait(50);
  const done = reply('a1', picks());
  await probe.set({ messages: [ask, done], status: 'ready' });
  await probe.wait(FIRST_MS - 200 - 1);
  assert.deepEqual(onScreen(probe.out, done), [], 'still typing just before two seconds');
  await probe.wait(1);
  assert.deepEqual(onScreen(probe.out, done), ['text'], 'the message at two seconds');
  assert.equal(probe.out.waiting, false);
  await probe.wait(GAP_MS);
  assert.deepEqual(onScreen(probe.out, done), ['text', 'cards'], 'its cards follow after the brief gap');
  await probe.unmount();
});

test('a streamed explanation shows before the suggestion, and continuing the stream never replays it', async (t) => {
  const probe = setup(t, { messages: [] });
  await probe.set({});
  await probe.set({ messages: [ask], status: 'submitted' });
  await probe.wait(FIRST_MS + 100); // model latency already exceeds the initial visual delay
  const shown = (value, state) => displayMessages([ask, reply('a1', [text(value, state)])]);
  const early = shown('Figma is a design tool.\n\nFor your project,', 'streaming');
  await probe.set({ messages: early, status: 'streaming' });
  assert.deepEqual(onScreen(probe.out, early[1]), ['text'], 'the finished explanation shows immediately');
  await probe.wait(100);
  const done = shown('Figma is a design tool.\n\nFor your project, sketch one screen.', 'done');
  await probe.set({ messages: done, status: 'ready' });
  await probe.wait(GAP_MS - 101);
  assert.deepEqual(onScreen(probe.out, done[1]), ['text']);
  await probe.wait(1);
  assert.deepEqual(onScreen(probe.out, done[1]), ['text', 'text']);
  assert.equal(probe.out.view(done[1]).version, 2, 'each bubble appeared exactly once');
  await probe.unmount();
});

test('reduced motion: the whole reply shows as soon as it is ready', async (t) => {
  const probe = setup(t, { messages: [], reduced: true });
  await probe.set({});
  await probe.set({ messages: [ask], status: 'submitted' });
  const done = reply('a1', picks());
  await probe.set({ messages: [ask, done], status: 'ready' });
  assert.deepEqual(onScreen(probe.out, done), ['text', 'cards'], 'no wait at all');
  await probe.unmount();
});

// Pending: the reply is in, but its first part is due only at two seconds.
async function pending(t, props) {
  const probe = setup(t, { messages: [], ...props });
  await probe.set({});
  await probe.set({ messages: [ask], status: 'submitted' });
  const done = reply('a1', picks());
  await probe.wait(50);
  await probe.set({ messages: [ask, done], status: 'ready' });
  assert.deepEqual(onScreen(probe.out, done), [], 'pending');
  return { probe, done };
}

test('hiding the pane mid-reveal shows the reply at once; nothing lands later', async (t) => {
  const { probe, done } = await pending(t);
  await probe.set({ paused: true });
  assert.deepEqual(onScreen(probe.out, done), ['text', 'cards']);
  assert.equal(probe.out.waiting, false);
  const renders = probe.renders;
  await probe.wait(FIRST_MS + CAP_MS);
  assert.equal(probe.renders, renders, 'no timer left behind');
  await probe.set({ paused: false });
  assert.deepEqual(onScreen(probe.out, done), ['text', 'cards'], 'back on the pane: all there, nothing replays');
  assert.equal(probe.out.view(done).from, done.parts.length);
  await probe.unmount();
});

test('a reply that finishes while the pane is hidden is whole when it comes back', async (t) => {
  const probe = setup(t, { messages: [] });
  await probe.set({});
  await probe.set({ messages: [ask], status: 'submitted' });
  await probe.set({ paused: true });
  assert.equal(probe.out.waiting, false, 'no typing indicator on a hidden pane');
  const done = reply('a1', picks());
  await probe.set({ messages: [ask, done], status: 'streaming' });
  await probe.set({ status: 'ready' });
  await probe.set({ paused: false });
  assert.deepEqual(onScreen(probe.out, done), ['text', 'cards']);
  await probe.unmount();
});

test('leaving the pane (signing out, another person signing in) cancels the pending reveal', async (t) => {
  // The session gate replaces the whole app, so the pane unmounts.
  const { probe } = await pending(t);
  const renders = probe.renders;
  await probe.unmount();
  await probe.wait(FIRST_MS + CAP_MS);
  assert.equal(probe.renders, renders, 'nothing revealed after the pane is gone');
});

test('switching events mid-reveal cancels it; the new event loads settled', async (t) => {
  const { probe, done } = await pending(t);
  // A new event: its history is loading, and the old event's reply must not land.
  await probe.set({ slug: 'demo-hacks', loaded: false, messages: [ask, done] });
  const renders = probe.renders;
  await probe.wait(FIRST_MS + CAP_MS);
  assert.equal(probe.renders, renders, 'the old timer is gone');
  assert.equal(probe.out.waiting, false);
  const theirs = [user('u9', 'Hi'), reply('b1', [step, text('Hey! Welcome to Demo Hacks.')])];
  await probe.set({ loaded: true, messages: theirs });
  assert.ok(probe.out.history('b1'));
  assert.deepEqual(onScreen(probe.out, theirs[1]), ['text'], 'shown at once, no replay');
  await probe.wait(FIRST_MS + CAP_MS);
  assert.equal(probe.out.view(theirs[1]).shown.size, 0, 'nothing animates in');
  await probe.unmount();
});

test('a new request shows what the last reply still had queued', async (t) => {
  const { probe, done } = await pending(t);
  const next = user('u2', 'Anything more social?');
  await probe.set({ messages: [ask, done, next], status: 'submitted' });
  assert.deepEqual(onScreen(probe.out, done), ['text', 'cards']);
  assert.equal(probe.out.waiting, true, 'typing for the new request');
  await probe.unmount();
});

test('a finished reply never stays hidden: a cut-off or failed stream still shows what it has', async (t) => {
  for (const status of ['ready', 'error']) {
    const probe = setup(t, { messages: [] });
    await probe.set({});
    await probe.set({ messages: [ask], status: 'submitted' });
    const cut = reply('a1', picks('streaming'));
    await probe.set({ messages: [ask, cut], status: 'streaming' });
    await probe.set({ status });
    await probe.wait(FIRST_MS + CAP_MS);
    assert.deepEqual(onScreen(probe.out, cut), ['text', 'cards'], status);
    assert.equal(probe.out.waiting, false, status);
    await probe.unmount();
    t.mock.timers.reset();
  }
});

// Seeded search results and clarifying chips can arrive almost immediately.
for (const request of ['Find a mentor', 'Find a teammate', 'Find an open team']) {
  test(`fast ${request} reply keeps Hacky thinking for two seconds`, async (t) => {
    const probe = setup(t, { messages: [] });
    await probe.set({});
    const question = user('fast-user', request);
    await probe.set({ messages: [question], status: 'submitted' });
    const done = reply('fast-reply', [step, {
      type: 'tool-ask_with_options', state: 'input-available',
      input: { question: 'What are you building?', options: ['Web', 'Mobile'] },
    }]);
    await probe.wait(10);
    await probe.set({ messages: [question, done], status: 'ready' });
    await probe.wait(1989);
    assert.equal(probe.out.waiting, true);
    assert.deepEqual(onScreen(probe.out, done), []);
    await probe.wait(1);
    assert.equal(probe.out.waiting, false);
    assert.deepEqual(onScreen(probe.out, done), ['cards']);
    await probe.unmount();
  });
}

test('network time already over two seconds needs no additional thinking delay', async (t) => {
  const probe = setup(t, { messages: [] });
  await probe.set({});
  await probe.set({ messages: [ask], status: 'submitted' });
  await probe.wait(2500);
  const done = reply('slow-reply', [step, text('Here are your mentors.')]);
  await probe.set({ messages: [ask, done], status: 'ready' });
  assert.deepEqual(onScreen(probe.out, done), ['text']);
  assert.equal(probe.out.waiting, false);
  await probe.unmount();
});
