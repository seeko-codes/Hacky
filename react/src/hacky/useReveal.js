// Runs reveal.js for the Hacky chat: which parts of each message are on screen yet.
//
//   const reveal = useReveal({ key: slug, loaded, messages, status, paused, reduced, visible });
//   reveal.view(message) -> { from, shown, version }; reveal.history(id); reveal.waiting -> typing indicator
//
// Everything on screen when the history loads is settled and never replays (a refresh loads the
// history again, so it stays settled). A new key (another event or person), pausing (the pane is
// hidden) or unmounting cancels pending reveals: what's there shows at once, nothing lands later.
import { useEffect, useReducer, useRef } from 'react';
import { nextPart, revealAt } from './reveal.js';

const EMPTY = new Set();

// from: message id -> parts already on screen before the current reply. shown: id -> live part
// indexes revealed so far. version: id -> reveal count, so memoized rows know to re-render.
const fresh = (key) => ({ key, ready: false, asking: false, history: new Set(), from: new Map(), shown: new Map(), version: new Map(), startedAt: null, firstAt: null, lastAt: null, timer: null });

export function useReveal({ key, loaded, messages, status, paused, reduced, visible }) {
  const ref = useRef(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  if (!ref.current || ref.current.key !== key) {
    if (ref.current) clearTimeout(ref.current.timer);
    ref.current = fresh(key);
  }
  const s = ref.current;
  const active = status === 'submitted' || status === 'streaming';
  // Everything there now counts as shown; parts added later belong to a new reply.
  const settle = () => {
    for (const m of messages) s.from.set(m.id, Math.max(m.parts.length, s.from.get(m.id) ?? 0));
    s.startedAt = s.firstAt = s.lastAt = null;
  };
  // These run during render (idempotently) so history and earlier replies never flash hidden.
  if (!s.ready && loaded) {
    settle();
    for (const m of messages) s.history.add(m.id);
    s.ready = true;
  }
  if (s.ready && active && !s.asking) {
    settle(); // a new request: whatever the last reply still had queued shows now
    s.startedAt = Date.now();
  }
  s.asking = active;

  const live = s.ready ? messages.findLast((m) => m.role === 'assistant') : null;
  const fromOf = (m) => (m.role === 'assistant' ? s.from.get(m.id) ?? 0 : m.parts.length);
  const shownOf = (m) => s.shown.get(m.id) ?? EMPTY;
  const queued = Boolean(live) && nextPart(live.parts, { from: fromOf(live), shown: shownOf(live), visible, finished: true }) !== null;

  useEffect(() => {
    clearTimeout(s.timer);
    if (!s.ready) return undefined;
    if (paused) {
      if (queued) {
        settle();
        bump();
      }
      return undefined;
    }
    const finished = !active;
    const step = () => {
      const target = live ? nextPart(live.parts, { from: fromOf(live), shown: shownOf(live), visible, finished }) : null;
      if (target == null) return;
      const now = Date.now();
      const at = revealAt({ now, startedAt: s.startedAt, firstAt: s.firstAt, lastAt: s.lastAt, reduced });
      if (at > now) {
        s.timer = setTimeout(step, at - now);
        return;
      }
      s.shown.set(live.id, new Set(shownOf(live)).add(target));
      s.version.set(live.id, (s.version.get(live.id) ?? 0) + 1);
      s.firstAt ??= now;
      s.lastAt = now;
      bump();
    };
    step();
    return () => clearTimeout(s.timer);
  }, [messages, status, paused, reduced, tick, key, loaded]);

  // The typing indicator: a reply is on its way (or queued) and nothing of its newest step shows yet.
  const newest = live && messages.at(-1) === live;
  const lastStep = newest ? live.parts.findLastIndex((p) => p.type === 'step-start') : -1;
  const stepShown = Boolean(newest) && live.parts.some((p, i) => i > lastStep && visible(p) && (i < fromOf(live) || shownOf(live).has(i)));
  const waiting = !paused && (status === 'submitted' || ((active || queued) && !stepShown));

  return {
    tick,
    waiting,
    view: (m) => ({ from: fromOf(m), shown: shownOf(m), version: s.version.get(m.id) ?? 0 }),
    // Loaded with the page: shows without any arrival animation.
    history: (id) => s.history.has(id),
  };
}
