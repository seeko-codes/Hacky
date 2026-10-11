// The main pane: Hacky's brief, the agent chat, local event answers and the
// onboarding plan, in one thread above one composer.
//
// Local exchanges (event/sponsor questions, the plan) never reach the agent.
// Each records how many chat messages existed when it was made, so it stays
// in place as the chat grows.
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dots, SelfAvatar, WorkingPet } from '../ui.jsx';
import HackyFilm, { THINKING_CLIP } from '../HackyFilm.jsx';
import { replyDelay } from '../storage.js';
import { useSession } from '../session.jsx';
import { useHackyChat } from './useHackyChat.js';
import { CardActions, MessagePart, isVisiblePart } from './cards.jsx';
import Brief from './Brief.jsx';
import './hacky-chat.css';

const PLAN_COMMAND = /^(change my plan|plan my hackathon|show my plan)$/i;
const atBottom = (el, slack) => el.scrollHeight - el.clientHeight - el.scrollTop < slack;
const textOf = (message) => message.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n').trim();
// Whether the newest step of a reply shows anything yet.
const stepVisible = (message) => message?.role === 'assistant'
  && message.parts.slice(message.parts.findLastIndex((p) => p.type === 'step-start') + 1).some(isVisiblePart);

export function HackyEventName() {
  return useSession().event?.name ?? null;
}

// data-anchor marks where the newest exchange starts; following stops there.
function UserBubble({ text }) {
  return (
    <div className="msg message-arrival user" data-anchor="">
      <div className="byline"><SelfAvatar /><span>You</span></div>
      <p className="hc-text">{text}</p>
    </div>
  );
}

const ChatRow = memo(function ChatRow({ message, onAnswer }) {
  if (message.role === 'user') {
    const text = textOf(message);
    return text ? <UserBubble text={text} /> : null;
  }
  if (message.role !== 'assistant' || !message.parts.some(isVisiblePart)) return null;
  return (
    <div className="hc-turn message-arrival">
      {message.parts.map((part, i) => (recovered(message.parts, i) ? null : <MessagePart key={i} part={part} onAnswer={onAnswer} />))}
    </div>
  );
});

// A failed tool step that a later call of the same tool in this reply got right isn't shown.
const recovered = (parts, i) => parts[i].state === 'output-error'
  && parts.slice(i + 1).some((p) => p.type === parts[i].type && p.state === 'output-available');

const LocalRow = memo(function LocalRow({ entry, onOpenPanel }) {
  if (entry.kind === 'plan-pending') {
    return (
      <div className="msg message-arrival assistant plan-reply plan-pending">
        <Dots />
        <p>Hacky is putting your recommendations together…</p>
      </div>
    );
  }
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
  return (
    <>
      <UserBubble text={entry.question} />
      <div className="msg message-arrival assistant">
        <p>{entry.text}</p>
        {entry.content}
      </div>
    </>
  );
});

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

export default function HackyPane({ plan, planRevision, style, events, onPreferences, onProfile, onOpenConversation, renderComposer }) {
  const { slug } = useSession();
  const chat = useHackyChat(slug);
  const [input, setInput] = useState(''),
    [locals, setLocals] = useState([]),
    [planBusy, setPlanBusy] = useState(false),
    [planReady, setPlanReady] = useState(Boolean(plan)),
    [newReply, setNewReply] = useState(false);
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
  const busy = planBusy || !chat.ready;

  const addLocal = (entry) => {
    const { chat } = latest.current;
    const item = { id: ++nextId.current, at: chat.loaded ? chat.messages.length : null, ...entry };
    setLocals((list) => [...list, item]);
  };
  // Event, sponsor and reminder questions come from the static guide.
  const askLocal = (text) => {
    const { events, chat, planBusy } = latest.current;
    const answer = events.answer(text);
    if (!answer) return false;
    if (planBusy || chat.status === 'submitted' || chat.status === 'streaming') return true;
    pinned.current = true;
    setPlanReady(false);
    addLocal({ kind: 'answer', question: text, text: answer.text, content: answer.content });
    return true;
  };
  const askHacky = (text) => {
    const { chat, planBusy } = latest.current;
    if (planBusy || !chat.answer(text)) return false;
    lastSent.current = text;
    pinned.current = true;
    setPlanReady(false);
    return true;
  };
  const completePlan = () => {
    const el = feed.current;
    pinned.current = !el || atBottom(el, 80);
    const { chat } = latest.current;
    const item = { id: ++nextId.current, at: chat.loaded ? chat.messages.length : null, kind: 'plan-done' };
    setLocals((list) => [...list.filter((l) => l.kind !== 'plan-pending'), item]);
    latest.current.planBusy = false;
    setPlanBusy(false);
    setPlanReady(true);
    latest.current.events.setAttention(true);
  };
  const buildPlan = () => {
    const { plan, planBusy, chat } = latest.current;
    if (!plan || planBusy || chat.status === 'submitted' || chat.status === 'streaming') return;
    latest.current.planBusy = true;
    setPlanBusy(true);
    setPlanReady(true);
    scroll.current = 'top';
    addLocal({ kind: 'plan-pending' });
    setTimeout(completePlan, replyDelay(plan.goal));
  };
  latest.current = { chat, plan, planBusy, events, onPreferences, onProfile, onOpenConversation, askLocal, askHacky };

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
    local: (text) => latest.current.askLocal(text),
    viewProfile: (profile) => latest.current.onProfile(profile),
    contactTeam: (team) => latest.current.askHacky(`Help me contact the team ${team.name} (led by @${team.owner.handle}).`),
    openConversation: (id) => latest.current.onOpenConversation(id),
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
    const marker = `${lastMessage?.role === 'assistant' ? lastMessage.id : ''}:${lastLocal && lastLocal.kind !== 'plan-pending' ? lastLocal.id : ''}`;
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
  }, [chat.messages, chat.status, chat.error, locals]);

  // Local exchanges sit after the chat messages that existed when they were made.
  const place = (entry) => entry.at ?? chat.historyCount ?? Infinity;
  const rows = [];
  let nextLocal = 0;
  const addLocalsUpTo = (index) => {
    while (nextLocal < locals.length && place(locals[nextLocal]) <= index) {
      const entry = locals[nextLocal++];
      rows.push(<LocalRow key={`local-${entry.id}`} entry={entry} onOpenPanel={events.openPanel} />);
    }
  };
  chat.messages.forEach((message, i) => {
    addLocalsUpTo(i);
    const last = i === chat.messages.length - 1;
    rows.push(<ChatRow key={message.id} message={message} onAnswer={last && chat.ready && !planBusy ? stable.hacky : null} />);
  });
  addLocalsUpTo(Infinity);
  const working = chat.status === 'submitted' || (chat.status === 'streaming' && !stepVisible(chat.messages.at(-1)));

  return (
    <CardActions.Provider value={actions}>
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
          <Brief style={style} working={planBusy} onHacky={stable.hacky} onLocal={stable.local} />
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
