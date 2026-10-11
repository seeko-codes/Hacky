import test from 'node:test';
import assert from 'node:assert/strict';
import { CAP_MS, FIRST_MS, GAP_MS, isReady, nextPart, revealAt, showingOrder } from '../src/hacky/reveal.js';

const text = (t, state = 'done') => ({ type: 'text', text: t, state });
const search = (state = 'output-available') => ({ type: 'tool-search_people', state, output: { status: 'matches', cards: [] } });
const ask = (state = 'input-available') => ({ type: 'tool-ask_with_options', state, input: { question: 'What for?', options: ['A', 'B'] } });
const step = { type: 'step-start' };
const visible = (part) => part.type !== 'step-start' && part.type !== 'tool-update_profile' && (part.type !== 'text' || Boolean(part.text.trim()));
const reply = (parts, shown = [], opts = {}) => nextPart(parts, { from: 0, shown: new Set(shown), visible, finished: false, ...opts });

test('the explanation shows before the cards it explains', () => {
  // The model searches first and writes after, as it streams.
  const parts = [step, search(), step, text('Two teams fit your track.')];
  assert.deepEqual(showingOrder(parts), [3, 0, 1, 2]);
  assert.equal(reply(parts), 3, 'text first');
  assert.equal(reply(parts, [3]), 1, 'then the card');
  assert.equal(reply(parts, [3, 1]), null, 'nothing left');
});

test('a question closes its run: text, cards, then the question; later runs follow', () => {
  const parts = [search(), text('Here are some mentors.'), ask(), step, text('Thanks!'), search()];
  assert.deepEqual(showingOrder(parts), [1, 0, 2, 4, 3, 5]);
});

test('cards wait for their explanation while the reply is still streaming', () => {
  const parts = [step, search()];
  assert.equal(reply(parts), null, 'held: the text may still come');
  assert.equal(reply(parts, [], { finished: true }), 1, 'a reply with no text shows its card when it ends');
  assert.equal(reply([search(), ask()]), 0, 'a question already closed the run, so its card can show');
  // The text part arrives empty and fills in as it streams: its cards still wait.
  assert.equal(reply([step, search(), step, text('', 'streaming')]), null);
  assert.equal(reply([step, search(), step, text('Two teams fit.', 'done')]), 3);
});

test('only whole parts show: no half-written text, no card without its output', () => {
  assert.equal(reply([text('For you, I', 'streaming')]), null);
  assert.equal(reply([text('Hi', 'done'), search('input-available')], [0]), null);
  assert.equal(isReady(text('cut off', 'streaming'), true), true, 'a finished stream shows what it has');
  assert.equal(isReady(ask('input-streaming'), false), false);
});

test('parts already on screen (history, or before an answered question) are skipped', () => {
  const parts = [text('Old'), ask('output-available'), step, text('New reply')];
  assert.equal(nextPart(parts, { from: 2, shown: new Set(), visible, finished: false }), 3);
  assert.equal(nextPart(parts, { from: parts.length, shown: new Set(), visible, finished: true }), null);
});

test('timing: two seconds of thinking, network time counts, then short gaps with a cap', () => {
  const t0 = 1_000_000;
  assert.equal(revealAt({ now: t0 + 50, startedAt: t0, firstAt: null, lastAt: null }), t0 + FIRST_MS, 'fast reply waits a moment');
  assert.equal(revealAt({ now: t0 + FIRST_MS + 100, startedAt: t0, firstAt: null, lastAt: null }), t0 + FIRST_MS + 100, 'a slow reply shows at once');
  assert.equal(revealAt({ now: t0 + FIRST_MS + 10, startedAt: t0, firstAt: t0 + FIRST_MS, lastAt: t0 + FIRST_MS }), t0 + FIRST_MS + GAP_MS, 'cards follow 120 ms apart');
  assert.equal(revealAt({ now: t0 + FIRST_MS + 580, startedAt: t0, firstAt: t0 + FIRST_MS, lastAt: t0 + FIRST_MS + 560 }), t0 + FIRST_MS + CAP_MS, 'gaps stop at the cap');
  assert.equal(revealAt({ now: t0 + FIRST_MS + 650, startedAt: t0, firstAt: t0 + FIRST_MS, lastAt: t0 + FIRST_MS + 640 }), t0 + FIRST_MS + 650, 'past the cap: right away');
  assert.ok(GAP_MS >= 100 && GAP_MS <= 150 && FIRST_MS === 2000 && CAP_MS <= 800);
  assert.equal(revealAt({ now: t0 + 10, startedAt: t0, firstAt: null, lastAt: null, reduced: true }), t0 + 10, 'reduced motion: right away');
});
