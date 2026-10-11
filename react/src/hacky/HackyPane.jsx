// The main pane: Hacky's brief, the agent chat, local event answers and the
// onboarding plan, in one thread above one composer.
//
// Explicit schedule/reminder controls and the plan stay local. Questions reach the agent.
// Each records how many chat messages existed when it was made, so it stays
// in place as the chat grows.
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Dots, SelfAvatar, WorkingPet } from '../ui.jsx';
import HackyFilm, { THINKING_CLIP } from '../HackyFilm.jsx';
import { useMedia } from '../storage.js';
import { useSession } from '../session.jsx';
import { useHackyChat } from './useHackyChat.js';
import { CardActions, MessagePart, isVisiblePart } from './cards.jsx';
import Brief from './Brief.jsx';
import RestartChat from './RestartChat.jsx';
import { FIRST_MS, GAP_MS, showingOrder } from './reveal.js';
import { useReveal } from './useReveal.js';
import { displayMessages, isLocalCommand } from './presentation.js';
import './hacky-chat.css';

const PLAN_COMMAND = /^(change my plan|plan my hackathon|show my plan)$/i;
// Requests another page hands over in the address. The event dashboard's "Join a team" opens
// /index.html?start=team, and Hacky starts that search as a new message.
const STARTS = { team: 'Show me open teams I can join' };
const startFromUrl = () => STARTS[new URLSearchParams(location.search).get('start')] ?? null;
const atBottom = (el, slack) => el.scrollHeight - el.clientHeight - el.scrollTop < slack;
const textOf = (message) => message.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n').trim();

export function HackyEventName() {
  return useSession().event?.name ?? null;
}

// data-anchor marks where the newest exchange starts; following stops there.
// arrive: animate it in (not for stored history, which shows at once).
function UserBubble({ text, arrive = true }) {
  return (
    <div className={`msg${arrive ? ' message-arrival' : ''} user`} data-anchor="">
      <div className="byline"><SelfAvatar /><span>You</span></div>
      <p className="hc-text">{text}</p>
    </div>
  );
}

// closed: a newer message follows, so a question here can't be answered anymore.
// Parts show in showingOrder (the explanation before its cards). from and shown come from
// useReveal: parts before from were on screen already, shown are the new ones revealed so far
// (each fades in, see .hc-reveal). history: loaded with the page, so nothing animates.
const ChatRow = memo(function ChatRow({ message, onAnswer, closed, from = Infinity, shown, history }) {
  if (message.role === 'user') {
    const text = textOf(message);
    return text ? <UserBubble text={text} arrive={!history} /> : null;
  }
  const on = showingOrder(message.parts).filter((i) => (i < from || shown?.has(i)) && !recovered(message.parts, i));
  if (message.role !== 'assistant' || !on.some((i) => isVisiblePart(message.parts[i]))) return null;
  return (
    <div className="hc-turn">
      {on.map((i) => (
        <div key={i} className={i < from ? 'hc-part' : 'hc-part hc-reveal'}>
          <MessagePart part={message.parts[i]} onAnswer={onAnswer} closed={closed} explanation={textOf(message)} />
        </div>
      ))}
    </div>
  );
});

// A failed tool step that a later call of the same tool in this reply got right isn't shown.
const recovered = (parts, i) => parts[i].state === 'output-error'
  && parts.slice(i + 1).some((p) => p.type === parts[i].type && p.state === 'output-available');

const LocalRow = memo(function LocalRow({ entry, onOpenPanel, reduced, paused, onGrow }) {
  if (entry.kind === 'plan-done') {
    return (
      <div className="msg message-arrival assistant event-answer plan-reply" data-anchor="">
        <div className="byline">Hacky</div>
        <p>Check out your recommended events and essentials in the highlighted event button above.</p>
        <p>
          <a className="event-source" href="#your-events" data-your-events="" onClick={(e) => { e.preventDefault(); onOpenPanel(e); }}>
            View your events
          </a>
        </p>
      </div>
    );
  }
  return <LocalAnswer entry={entry} reduced={reduced} paused={paused} onGrow={onGrow} />;
});

// A guide answer appears like a Hacky reply: typing, then the message, then its cards.
// paused (the pane was hidden): the rest shows at once instead of later.
function LocalAnswer({ entry, reduced, paused, onGrow }) {
  const [stage, setStage] = useState(reduced ? 2 : 0);
  useEffect(() => {
    if (stage >= 2) return undefined;
    if (paused || reduced) {
      setStage(2);
      return undefined;
    }
    const timer = setTimeout(() => setStage((n) => n + 1), stage === 0 ? FIRST_MS : GAP_MS);
    return () => clearTimeout(timer);
  }, [stage, paused, reduced]);
  useEffect(() => {
    if (stage > 0) onGrow?.();
  }, [stage]);
  return (
    <>
      <UserBubble text={entry.question} />
      {stage === 0 ? (
        <div className="msg message-arrival assistant waiting" role="status">
          <Dots />
          <span className="sr-only">Hacky is typing</span>
        </div>
      ) : (
        <div className="msg message-arrival assistant">
          <p>{entry.text}</p>
          {stage === 2 && entry.content && <div className="hc-part hc-reveal">{entry.content}</div>}
        </div>
      )}
    </>
  );
}

// While Hacky works on a reply: the thinking clip, or the still pet if the clip can't load.
function ThinkingHacky({ style }) {
  const [noClip, setNoClip] = useState(false);
  if (noClip) return <WorkingPet style={style} />;
  return (
    <span className="working-hacky working hacky-thinking-film">
      <HackyFilm clip={THINKING_CLIP} onUnavailable={() => setNoClip(true)} />
    </span>
  );
}

// paused: the pane is hidden (onboarding is open), so a handed-over request waits.
export default function HackyPane({ plan, planRevision, style, events, paused = false, onPreferences, onProfile, onOpenConversation, renderComposer }) {
  const { slug } = useSession();
  const chat = useHackyChat(slug);
  const [input, setInput] = useState(''),
    [locals, setLocals] = useState([]),
    [planReady, setPlanReady] = useState(Boolean(plan)),
    [newReply, setNewReply] = useState(false),
    [start, setStart] = useState(startFromUrl);
  const feed = useRef(null),
    scroll = useRef(null),
    pinned = useRef(true),
    seen = useRef(''),
    nextId = useRef(0),
    lastRevision = useRef(0),
    hashShown = useRef(false),
    lastSent = useRef(''),
    latest = useRef({});
  const chatBusy = chat.status === 'submitted' || chat.status === 'streaming';
  const busy = !chat.ready;
  // New replies appear in a short sequence (typing, message, cards); history shows at once.
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const loadedAll = chat.loaded && chat.messages.length >= (chat.historyCount ?? 0);
  const displayed = useMemo(() => displayMessages(chat.messages, { active: chatBusy, eventSlug: slug }), [chat.messages, chatBusy, slug]);
  const reveal = useReveal({ key: slug, loaded: loadedAll, messages: displayed, status: chat.status, paused, reduced, visible: isVisiblePart });
  const [grown, grow] = useReducer((n) => n + 1, 0);

  const addLocal = (entry) => {
    const { chat } = latest.current;
    const item = { id: ++nextId.current, at: chat.loaded ? chat.messages.length : null, ...entry };
    setLocals((list) => [...list, item]);
  };
  // Only explicit schedule/reminder commands are local; questions go to the agent.
  const askLocal = (text) => {
    if (!isLocalCommand(text)) return false;
    const { events, chat } = latest.current;
    const answer = events.answer(text);
    if (!answer) return false;
    if (chat.status === 'submitted' || chat.status === 'streaming') return true;
    pinned.current = true;
    setPlanReady(false);
    addLocal({ kind: 'answer', question: text, text: answer.text, content: answer.content });
    return true;
  };
  const askHacky = (text) => {
    const { chat } = latest.current;
    if (!chat.answer(text)) return false;
    lastSent.current = text;
    pinned.current = true;
    setPlanReady(false);
    return true;
  };
  // A new request, never an answer to the open question (see useHackyChat start()).
  const startHacky = (text) => {
    const { chat } = latest.current;
    if (!chat.start(text)) return false;
    lastSent.current = text;
    pinned.current = true;
    setPlanReady(false);
    return true;
  };
  // Recommendations are already derived locally from the saved answers.
  const buildPlan = () => {
    const { plan, chat, events } = latest.current;
    if (!plan || chat.status === 'submitted' || chat.status === 'streaming') return;
    scroll.current = 'top';
    addLocal({ kind: 'plan-done' });
    setPlanReady(true);
    events.setAttention(true);
  };
  latest.current = { chat, plan, events, onPreferences, onProfile, onOpenConversation, askLocal, askHacky, startHacky };

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    if (PLAN_COMMAND.test(text)) {
      setInput('');
      if (/^show/i.test(text) && plan) buildPlan();
      else onPreferences();
      return;
    }
    // While Hacky waits on a question, typed text answers it.
    if ((!chat.pending && askLocal(text)) || askHacky(text)) setInput('');
  };

  const stable = useMemo(() => ({
    hacky: (text) => latest.current.askHacky(text),
    start: (text) => latest.current.startHacky(text),
    local: (text) => latest.current.askLocal(text),
    viewProfile: (profile) => latest.current.onProfile(profile),
    contactTeam: (team) => latest.current.startHacky(`Help me contact the team ${team.name} (led by @${team.owner.handle}).`),
    openConversation: (id) => latest.current.onOpenConversation(id),
    openDetail: (type, id, origin) => latest.current.events.openDetail(type, id, origin),
  }), []);
  const actions = useMemo(() => ({ ...stable, slug, busy }), [stable, slug, busy]);

  useEffect(() => {
    if (planRevision > 0 && planRevision !== lastRevision.current) {
      lastRevision.current = planRevision;
      buildPlan();
    }
  }, [planRevision]);
  useEffect(() => {
    const show = () => { if (location.hash === '#events') latest.current.askLocal('Show me the event schedule'); };
    if (!hashShown.current) {
      hashShown.current = true;
      show();
    }
    window.addEventListener('hashchange', show);
    return () => window.removeEventListener('hashchange', show);
  }, []);
  // A handed-over request (?start=) is sent once: it leaves the address right away, so a
  // reload or Back never sends it again, and it goes out once the stored chat has loaded.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('start')) return;
    params.delete('start');
    history.replaceState(history.state, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
  }, []);
  useEffect(() => {
    if (!start || paused || !chat.ready) return;
    setStart(null);
    latest.current.startHacky(start);
  }, [start, paused, chat.ready]);
  // Keep the failed text so the person can retry it.
  useEffect(() => {
    if (chat.error && lastSent.current) setInput((text) => text || lastSent.current);
  }, [chat.error]);

  useLayoutEffect(() => {
    if (!chat.historyCount || !feed.current) return;
    feed.current.scrollTop = feed.current.scrollHeight;
    pinned.current = true;
  }, [chat.historyCount]);
  // Follow new content while the person is at the bottom, but never scroll
  // their newest message out of view. Otherwise offer "New reply".
  useLayoutEffect(() => {
    const el = feed.current;
    if (!el) return;
    const action = scroll.current;
    scroll.current = null;
    const lastMessage = chat.messages.at(-1), lastLocal = locals.at(-1);
    const marker = `${lastMessage?.role === 'assistant' ? lastMessage.id : ''}:${lastLocal ? lastLocal.id : ''}`;
    const arrived = marker !== seen.current;
    seen.current = marker;
    if (action === 'top') {
      el.scrollTop = 0;
      pinned.current = false;
    } else if (pinned.current) {
      const anchors = el.querySelectorAll('[data-anchor]');
      const anchor = anchors[anchors.length - 1];
      const end = el.scrollHeight - el.clientHeight;
      if (anchor) {
        const top = el.scrollTop + anchor.getBoundingClientRect().top - el.getBoundingClientRect().top - 12;
        el.scrollTop = Math.max(el.scrollTop, Math.min(end, top));
      }
    } else if (arrived) setNewReply(true);
  }, [chat.messages, chat.status, chat.error, locals, reveal.tick, grown]);

  // Local exchanges sit after the chat messages that existed when they were made.
  const place = (entry) => entry.at ?? chat.historyCount ?? Infinity;
  const rows = [];
  let nextLocal = 0;
  const addLocalsUpTo = (index) => {
    while (nextLocal < locals.length && place(locals[nextLocal]) <= index) {
      const entry = locals[nextLocal++];
      rows.push(<LocalRow key={`local-${entry.id}`} entry={entry} onOpenPanel={events.openPanel} reduced={reduced} paused={paused} onGrow={grow} />);
    }
  };
  displayed.forEach((message, i) => {
    addLocalsUpTo(i);
    const last = i === chat.messages.length - 1;
    const { from, shown } = reveal.view(message);
    rows.push(<ChatRow key={message.id} message={message} closed={!last} from={from} shown={shown} history={reveal.history(message.id)} onAnswer={last && chat.ready ? stable.hacky : null} />);
  });
  addLocalsUpTo(Infinity);
  const working = reveal.waiting;

  return (
    <CardActions.Provider value={actions}>
      <div className="hc-toolbar"><RestartChat /></div>
      <div
        ref={feed}
        className={`feed has-conversation${planReady ? ' plan-ready' : ''}`}
        id="feed"
        aria-busy={busy}
        onScroll={() => {
          const el = feed.current;
          pinned.current = atBottom(el, 80);
          if (atBottom(el, 64)) setNewReply(false);
        }}
      >
        <div
          id="thread"
          className="thread"
          onClick={(event) => {
            const button = event.target.closest('[data-ask]');
            if (button && event.currentTarget.contains(button)) askLocal(button.dataset.ask) || askHacky(button.dataset.ask);
          }}
          role="log"
          aria-live="polite"
          aria-label="Conversation with Hacky"
        >
          <Brief style={style} onStart={stable.start} />
          {rows}
          {chat.failed && (
            <div className="msg message-arrival assistant" role="alert">
              <p>Couldn’t load your chat with Hacky.</p>
              <div className="chat-followups"><button type="button" className="toggle" onClick={chat.retry}>Try again</button></div>
            </div>
          )}
          {working && (
            <div className="msg message-arrival assistant waiting hacky-task">
              <ThinkingHacky style={style} />
              <p>Let me check…</p>
            </div>
          )}
          {chat.error && !chatBusy && (
            <div className="msg message-arrival assistant" role="alert">
              <p>Hacky is busy. Try again in a few seconds.</p>
            </div>
          )}
        </div>
      </div>
      <div className="compose-wrap">
        <button
          id="hacky-new-reply"
          className="toggle"
          hidden={!newReply}
          onClick={() => {
            feed.current.scrollTop = feed.current.scrollHeight;
            pinned.current = true;
            setNewReply(false);
            document.getElementById('finder-input')?.focus({ preventScroll: true });
          }}
        >
          New reply
        </button>
        {renderComposer({ value: input, onChange: setInput, onSubmit: submit, busy })}
        <p className="demo-note">Hacky drafts. You decide what gets sent.</p>
      </div>
    </CardActions.Provider>
  );
}
