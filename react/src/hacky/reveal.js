// How a new Hacky reply appears: a short typing indicator, then its message, then its cards.
// Pure, so node can test it; useReveal.js runs it with timers. Stored history never goes
// through here: it shows at once.

const ASK = 'tool-ask_with_options';
const TOOL = /^tool-/;

// At least two seconds of thinking before a new reply (network time counts toward it),
// then 350 ms between bubbles/cards, with at most 1.05 seconds of added gaps per reply.
export const FIRST_MS = 2000;
export const GAP_MS = 350;
export const CAP_MS = 1050;

// Part indexes in showing order. In each run of parts up to a question (ask_with_options), the
// text comes first and the cards after it, so the explanation always leads its results, even
// though the model writes it after its tool calls. The question closes the run.
export function showingOrder(parts) {
  const order = [];
  let texts = [], rest = [];
  const close = () => {
    order.push(...texts, ...rest);
    texts = [];
    rest = [];
  };
  parts.forEach((part, i) => {
    if (part.type === ASK) {
      close();
      order.push(i);
    } else if (part.type === 'text') texts.push(i);
    else rest.push(i);
  });
  close();
  return order;
}

// Whether a part has finished arriving: whole messages only, never half a sentence.
export function isReady(part, finished) {
  if (finished) return true;
  if (part.type === 'text') return part.state !== 'streaming';
  if (part.type === ASK) return part.state !== 'input-streaming' && Boolean(part.input);
  if (TOOL.test(part.type)) return part.state === 'output-available' || part.state === 'output-error';
  return true;
}

// The next part of a live reply to show, or null when it has to wait. from: parts before this
// index were already on screen. shown: live part indexes already revealed. visible(part): whether
// the part draws anything (others are skipped). finished: the reply stream is over.
// A card waits for its explanation: while the reply is still streaming, cards in a run with no
// text yet are held, unless a question already closed that run.
export function nextPart(parts, { from = 0, shown, visible, finished }) {
  const order = showingOrder(parts);
  const runOf = new Map();
  let run = 0;
  for (const i of order) {
    runOf.set(i, run);
    if (parts[i].type === ASK) run++;
  }
  const hasText = new Set(), closed = new Set();
  parts.forEach((part, i) => {
    if (part.type === 'text') hasText.add(runOf.get(i));
    if (part.type === ASK) closed.add(runOf.get(i));
  });
  for (const i of order) {
    if (i < from || shown.has(i)) continue;
    // Not ready blocks what follows even while it draws nothing yet (a text part starts empty).
    if (!isReady(parts[i], finished)) return null;
    if (!visible(parts[i])) continue;
    const card = parts[i].type !== 'text' && parts[i].type !== ASK;
    if (card && !finished && !hasText.has(runOf.get(i)) && !closed.has(runOf.get(i))) return null;
    return i;
  }
  return null;
}

// When the next part may show. startedAt: when the request went out. firstAt and lastAt: when this
// reply's first and latest parts showed (null before the first). Reduced motion: right away.
export function revealAt({ now, startedAt, firstAt, lastAt, reduced }) {
  if (reduced) return now;
  if (lastAt == null) return Math.max(now, (startedAt ?? now) + FIRST_MS);
  return Math.max(now, Math.min(lastAt + GAP_MS, (firstAt ?? lastAt) + CAP_MS));
}
