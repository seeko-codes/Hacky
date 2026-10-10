import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar, Icon, WorkingPet, Dots } from "./ui.jsx";
import { useMedia, replyDelay } from "./storage.js";
import { people } from "./people.js";
import People, { Categories, Matches } from "./People.jsx";
import { initialHistories, recommendPeople } from "./conversation-model.js";

function ShortcutArt({ kind }) {
  return (
    <svg
      className="shortcut-art"
      aria-hidden="true"
      viewBox="0 0 32 32"
      style={{ stroke: "none" }}
    >
      {kind === "event" ? (
        <g transform="rotate(-12 16 16)">
          <rect x="4" y="3" width="22" height="23" rx="4" fill="#77b8dd" />
          <path
            d="M5 9h23v6a3 3 0 0 0 0 6v6H5v-6a3 3 0 0 0 0-6Z"
            fill="#ffcf65"
          />
          <path d="M21 11v3m0 3v3m0 3v2" stroke="#8a591d" strokeWidth="1.5" />
          <path
            d="m12 13 1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4Z"
            fill="#bf502c"
          />
        </g>
      ) : (
        <>
          <rect x="5" y="13" width="22" height="15" rx="3" fill="#78c7bd" />
          <path d="M7 5h18l4 8H3Z" fill="#ffad7a" />
          <path d="M10 5h4l-1 8H7Zm8 0h4l3 8h-6Z" fill="#fff0d4" />
          <path
            d="M3 13h6v2a3 3 0 0 1-6 0Zm12 0h6v2a3 3 0 0 1-6 0Zm12 0h2v2a3 3 0 0 1-2 2.8Z"
            fill="#d97443"
          />
          <rect x="9" y="20" width="14" height="4" rx="1" fill="#225467" />
          <path d="M9 28v-4m14 4v4" stroke="#225467" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}
function Receipt({ read }) {
  return (
    <span
      className="message-receipt"
      role="status"
      aria-label="Simulated message status"
      title="Simulated in this local demo"
    >
      {read ? "Read" : "Delivered"}
    </span>
  );
}
function Composer({
  id,
  value,
  onChange,
  onSubmit,
  busy = false,
  placeholder,
  label,
  sendLabel,
}) {
  const input = useRef(null);
  useLayoutEffect(() => {
    const el = input.current;
    el.style.height = "40px";
    el.style.height = Math.max(40, Math.min(116, el.scrollHeight)) + "px";
  }, [value]);
  useEffect(() => {
    const el = input.current;
    let width = 0;
    let frame = 0;
    // Onboarding and inactive DM panels mount hidden. Only width/visibility
    // changes need a fit; defer writes beyond the ResizeObserver delivery.
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;
      if (nextWidth === width) return;
      width = nextWidth;
      cancelAnimationFrame(frame);
      if (nextWidth <= 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!el.getClientRects().length) return;
        el.style.height = "40px";
        el.style.height = Math.max(40, Math.min(116, el.scrollHeight)) + "px";
      });
    });
    observer.observe(el.parentElement);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  const fields = (
    <>
      <textarea
        ref={input}
        id={`${id}-input`}
        aria-label={label}
        placeholder={placeholder}
        rows="1"
        enterKeyHint="send"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (value.trim() && !busy) onSubmit();
          }
        }}
      />
      <button
        id={`${id}-send`}
        className="send"
        aria-label={sendLabel}
        disabled={!value.trim() || busy}
      >
        <Icon name="arrow" />
      </button>
    </>
  );
  return (
    <form
      id={`${id}-form`}
      className={id === "dm" ? "dm-compose" : "composer"}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {id === "dm" ? <div className="composer">{fields}</div> : fields}
    </form>
  );
}
export default function Conversation({
  plan,
  planRevision,
  style,
  onPreferences,
  onCustomize,
  events,
  theme,
  onThemeChange,
}) {
  const mobile = useMedia("(max-width:700px)");
  const [opened, setOpened] = useState(!mobile),
    [current, setCurrent] = useState(null),
    [selected, setSelected] = useState([]),
    [histories, setHistories] = useState(() =>
      structuredClone(initialHistories),
    ),
    [drafts, setDrafts] = useState({}),
    [typing, setTyping] = useState({}),
    [unread, setUnread] = useState([]),
    [profile, setProfile] = useState(null),
    [messages, setMessages] = useState([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [planReady, setPlanReady] = useState(Boolean(plan)),
    [newHacky, setNewHacky] = useState(false),
    [newDm, setNewDm] = useState(false),
    [height, setHeight] = useState(null);
  const feed = useRef(null),
    dmFeed = useRef(null),
    sidebar = useRef(null),
    main = useRef(null),
    positions = useRef({}),
    dmAction = useRef(null),
    hackyAction = useRef(null),
    timers = useRef(new Set()),
    counter = useRef(0),
    lastRevision = useRef(0),
    latest = useRef({}),
    mounted = useRef(false);
  latest.current = { current, opened, events, plan, busy };
  const later = (fn, delay) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, delay);
    timers.current.add(timer);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // StrictMode replays effects synchronously; cancel only a real unmount.
      queueMicrotask(() => {
        if (!mounted.current) {
          timers.current.forEach(clearTimeout);
          timers.current.clear();
        }
      });
    };
  }, []);
  useEffect(() => setOpened(!mobile), [mobile]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const fit = () => setHeight(viewport.height);
    fit();
    viewport.addEventListener("resize", fit);
    return () => viewport.removeEventListener("resize", fit);
  }, []);
  useEffect(() => {
    sidebar.current.inert = !opened;
    main.current.inert = opened && mobile;
    if (opened && current)
      setUnread((list) => list.filter((id) => id !== current));
  }, [opened, current, mobile]);
  const remember = () => {
    if (current && dmFeed.current)
      positions.current[current] = dmFeed.current.scrollTop;
  };
  const changeOpen = (value, focus = true) => {
    remember();
    setOpened(value);
    if (focus)
      requestAnimationFrame(() =>
        document
          .getElementById(
            value ? (current ? "back-list" : "close-sidebar") : "toggle",
          )
          ?.focus({ preventScroll: true }),
      );
  };
  useEffect(() => {
    const key = (e) => {
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape" && opened) {
        e.preventDefault();
        changeOpen(false);
      }
      if (e.key === "Tab" && opened && mobile) {
        const controls = [
          ...sidebar.current.querySelectorAll("button,a,textarea"),
        ].filter((el) => !el.disabled && el.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [opened, mobile, current]);
  const openConversation = (id) => {
    remember();
    if (id !== "team")
      setSelected((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setCurrent(id);
    setHistories((h) => (h[id] ? h : { ...h, [id]: [] }));
    setUnread((ids) => ids.filter((x) => x !== id));
    setOpened(true);
    dmAction.current = { type: "restore", id };
    setNewDm(false);
    requestAnimationFrame(() =>
      document
        .getElementById(id === "team" ? "back-list" : "dm-identity")
        ?.focus({ preventScroll: true }),
    );
  };
  const backList = () => {
    const id = current;
    remember();
    setCurrent(null);
    requestAnimationFrame(() =>
      document
        .querySelector(id === "team" ? "#team" : `[data-contact="${id}"]`)
        ?.focus({ preventScroll: true }),
    );
  };
  const dmAtLatest = () =>
    !dmFeed.current ||
    dmFeed.current.scrollHeight -
      dmFeed.current.clientHeight -
      dmFeed.current.scrollTop <
      48;
  useLayoutEffect(() => {
    const action = dmAction.current;
    if (!action || !dmFeed.current || action.id !== current) return;
    dmAction.current = null;
    const el = dmFeed.current;
    if (action.type === "restore")
      el.scrollTop = positions.current[current] ?? el.scrollHeight;
    else if (action.follow) el.scrollTop = el.scrollHeight;
    else setNewDm(true);
  }, [histories, current]);
  useLayoutEffect(() => {
    const action = hackyAction.current;
    if (!action || !feed.current) return;
    hackyAction.current = null;
    if (action === "bottom") feed.current.scrollTop = feed.current.scrollHeight;
    else if (action === "top") feed.current.scrollTop = 0;
    else if (action === "reply")
      feed.current
        .querySelector("#thread > :last-child")
        ?.scrollIntoView({ block: "start" });
    else setNewHacky(true);
  }, [messages]);
  const sendDm = () => {
    if (!current) return;
    const text = (drafts[current] || "").trim();
    if (!text) return;
    const id = current,
      messageId = ++counter.current;
    dmAction.current = { id, follow: true };
    setHistories((h) => ({
      ...h,
      [id]: [
        ...(h[id] || []),
        { id: messageId, mine: true, text, read: false },
      ],
    }));
    setDrafts((d) => ({ ...d, [id]: "" }));
    setNewDm(false);
    const response =
      id === "team"
        ? "Sounds good! Send the matches here and we can meet them."
        : people[id].reply;
    later(() => {
      setHistories((h) => ({
        ...h,
        [id]: h[id].map((m) =>
          m.id === messageId ? { ...m, read: id !== "team" } : m,
        ),
      }));
      setTyping((t) => ({ ...t, [id]: (t[id] || 0) + 1 }));
    }, 850);
    later(() => {
      setTyping((t) => ({ ...t, [id]: Math.max(0, (t[id] || 0) - 1) }));
      if (latest.current.current === id)
        dmAction.current = { id, follow: dmAtLatest() };
      setHistories((h) => ({
        ...h,
        [id]: [
          ...h[id],
          {
            id: ++counter.current,
            sender: id === "team" ? "Kai" : people[id].name.split(" ")[0],
            text: response,
          },
        ],
      }));
      if (!latest.current.opened || latest.current.current !== id)
        setUnread((ids) => (ids.includes(id) ? ids : [...ids, id]));
    }, replyDelay(response));
  };
  const completePlan = () => {
    const follow =
      feed.current.scrollHeight -
        feed.current.clientHeight -
        feed.current.scrollTop <
      80;
    hackyAction.current = follow ? "reply" : "new";
    setMessages((list) => [
      ...list.filter((m) => !m.planPending),
      {
        id: ++counter.current,
        text: "Check out your recommended events and essentials in the highlighted event button above.",
        planDone: true,
      },
    ]);
    latest.current.busy = false;
    setBusy(false);
    setPlanReady(true);
    latest.current.events.setAttention(true);
  };
  const buildPlan = () => {
    if (!latest.current.plan || latest.current.busy) return;
    latest.current.busy = true;
    setBusy(true);
    setPlanReady(true);
    hackyAction.current = "top";
    setMessages((list) => [
      ...list,
      {
        id: ++counter.current,
        text: "Hacky is putting your recommendations together…",
        planPending: true,
      },
    ]);
    later(completePlan, replyDelay(latest.current.plan.goal));
  };
  useEffect(() => {
    if (planRevision > 0 && planRevision !== lastRevision.current) {
      lastRevision.current = planRevision;
      buildPlan();
    }
  }, [planRevision]);
  const find = (text) => {
    if (latest.current.busy) return;
    if (/^(change my plan|plan my hackathon|show my plan)$/i.test(text)) {
      setInput("");
      if (/^show/i.test(text) && latest.current.plan) buildPlan();
      else onPreferences();
      return;
    }
    latest.current.busy = true;
    setBusy(true);
    setPlanReady(false);
    setInput("");
    const id = ++counter.current;
    hackyAction.current = "bottom";
    setMessages((list) => [
      ...list,
      { id, user: true, text, read: false },
      { id: ++counter.current, pending: true, text: "Let me check…" },
    ]);
    later(
      () =>
        setMessages((list) =>
          list.map((m) => (m.id === id ? { ...m, read: true } : m)),
        ),
      850,
    );
    later(() => {
      const follow =
        feed.current.scrollHeight -
          feed.current.clientHeight -
          feed.current.scrollTop <
        80;
      const response =
        latest.current.events.answer(text) ||
        recommendPeople(text, latest.current.plan);
      hackyAction.current = follow ? "reply" : "new";
      setMessages((list) => [
        ...list.filter((m) => !m.pending),
        { id: ++counter.current, ...response, query: text },
      ]);
      latest.current.busy = false;
      setBusy(false);
    }, replyDelay(text));
  };
  useEffect(() => {
    if (location.hash === "#events") find("Show me the event schedule");
    const hash = () => {
      if (location.hash === "#events") find("Show me the event schedule");
    };
    window.addEventListener("hashchange", hash);
    return () => window.removeEventListener("hashchange", hash);
  }, []);
  const history = histories[current] || [],
    lastMine = history.findLastIndex((m) => m.mine),
    lastHacky = messages.findLastIndex((m) => m.user),
    waiting = !opened && unread.length > 0;
  const profileMessage = (id) => {
    setProfile(null);
    openConversation(id);
  };
  const teamLast = histories.team.filter((m) => m.mine).at(-1);
  return (
    <>
      <div
        id="app"
        className={`app${opened ? " open" : ""}`}
        style={height ? { height } : undefined}
      >
        <aside
          ref={sidebar}
          id="sidebar"
          className={`sidebar${current ? " in-thread" : ""}`}
          aria-label="Team and direct messages"
        >
          <div className="side-inner">
            <header className="side-header">
              <div className="brand">Chats</div>
              <button
                id="close-sidebar"
                className="icon"
                aria-label="Return to Hacky"
                onClick={() => changeOpen(false)}
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="list">
              <div className="event">
                <img
                  className="mlh-logo"
                  src="/assets/brand/mlh-logo-color.svg"
                  alt="Major League Hacking"
                />
                <span className="event-divider" />
                <span>
                  Knight Hacks
                  <br />
                  <small>Hackathon demo</small>
                </span>
              </div>
              <div className="contacts">
                <h2 className="label">Your team</h2>
                <button
                  id="team"
                  className="contact team"
                  onClick={() => openConversation("team")}
                >
                  <Avatar id="team" />
                  <span className="info">
                    <span className="name">Midnight builders</span>
                    <span className="preview" id="team-preview">
                      {teamLast
                        ? "You: " + teamLast.text
                        : "Kai: Who's finding our fourth?"}
                    </span>
                  </span>
                </button>
                <h2 className="label people" hidden={!selected.length}>
                  People
                </h2>
                <div id="contacts">
                  {selected.map((id) => (
                    <button
                      key={id}
                      className="contact"
                      data-contact={id}
                      onClick={() => openConversation(id)}
                    >
                      <Avatar id={id} />
                      <span className="info">
                        <span className="name">{people[id].name}</span>
                        <span className="contact-categories">
                          <Categories person={people[id]} />
                        </span>
                        <span className="preview">
                          {drafts[id]
                            ? "Draft: " + drafts[id]
                            : histories[id]?.length
                              ? "Conversation started"
                              : people[id].specialty || people[id].role}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="foot">Fictional people · demo conversations</div>
            </div>
            <section className="dm" aria-label="Selected conversation">
              <header className="dm-header">
                <button
                  id="back-list"
                  className="icon"
                  aria-label="Back to chats"
                  onClick={backList}
                >
                  <Icon name="back" />
                </button>
                <div id="dm-avatar">{current && <Avatar id={current} />}</div>
                <button
                  id="dm-identity"
                  className="dm-identity"
                  disabled={current === "team"}
                  aria-haspopup="dialog"
                  aria-label={
                    current === "team"
                      ? "Midnight builders"
                      : current
                        ? "View " + people[current].name + " profile"
                        : "Selected conversation"
                  }
                  onClick={(event) => {
                    if (!current || current === "team") return;
                    event.currentTarget.focus({ preventScroll: true });
                    setProfile({ id: current });
                  }}
                >
                  <span
                    className="name"
                    id="dm-title"
                    title={
                      current === "team"
                        ? "Midnight builders"
                        : people[current]?.name
                    }
                  >
                    {current === "team"
                      ? "Midnight builders"
                      : people[current]?.name}
                  </span>
                  <span className="role" id="dm-role">
                    {current === "team"
                      ? "Your team · 3 members"
                      : current && <Categories person={people[current]} />}
                  </span>
                </button>
              </header>
              <div id="dm-profile" className="dm-profile" hidden />
              <div
                ref={dmFeed}
                id="dm-feed"
                className="dm-feed"
                role="log"
                aria-live="polite"
                aria-label="Messages"
                onScroll={() => {
                  if (current)
                    positions.current[current] = dmFeed.current.scrollTop;
                  if (dmAtLatest()) setNewDm(false);
                }}
              >
                {history.length ? (
                  history.map((m, i) => {
                    const prev = history[i - 1],
                      grouped =
                        prev &&
                        Boolean(prev.mine) === Boolean(m.mine) &&
                        prev.sender === m.sender;
                    return (
                      <div
                        key={m.id || i}
                        className={`bubble${m.mine ? " mine" : ""}${grouped ? " consecutive" : ""} message-arrival`}
                      >
                        <Avatar
                          id={
                            m.mine
                              ? "self"
                              : current === "team"
                                ? m.sender.toLowerCase()
                                : current
                          }
                        />
                        <div className="message-body">
                          <div className={`sender${grouped ? " sr-only" : ""}`}>
                            {m.mine ? "You" : m.sender}
                          </div>
                          <p>{m.text}</p>
                          {i === lastMine && (
                            <Receipt read={m.read && current !== "team"} />
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty">
                    <p>Introduce your project and the help you need.</p>
                  </div>
                )}
              </div>
              <button
                id="new-reply"
                className="new-reply"
                hidden={!newDm}
                onClick={() => {
                  dmFeed.current.scrollTop = dmFeed.current.scrollHeight;
                  setNewDm(false);
                  document
                    .getElementById(
                      current === "team" ? "back-list" : "dm-identity",
                    )
                    ?.focus({ preventScroll: true });
                }}
              >
                New reply <Icon name="arrow" />
              </button>
              <div
                id="dm-typing"
                className="dm-typing"
                role="status"
                hidden={!current || !typing[current]}
              >
                <Dots />
                <span id="dm-typing-name">
                  {current &&
                    (current === "team"
                      ? "Kai"
                      : people[current].name.split(" ")[0])}{" "}
                  is typing…
                </span>
              </div>
              <Composer
                id="dm"
                value={drafts[current] || ""}
                onChange={(text) =>
                  current && setDrafts((d) => ({ ...d, [current]: text }))
                }
                onSubmit={sendDm}
                label="Message selected conversation"
                placeholder="Write a message…"
                sendLabel="Send demo message"
              />
              <div className="foot">Sample replies · no messages are sent</div>
            </section>
          </div>
        </aside>
        <button
          id="backdrop"
          className="backdrop"
          aria-label="Return to Hacky"
          tabIndex="-1"
          onClick={() => changeOpen(false)}
        />
        <main ref={main} id="main" className="main">
          <header className="header">
            <div className="header-leading">
              <button
                id="toggle"
                className={`toggle${waiting ? " needs-attention" : ""}`}
                aria-label={waiting ? "Chats, new replies" : "Chats"}
                title="Chats"
                aria-expanded={opened}
                aria-controls="sidebar"
                onClick={() => changeOpen(!opened)}
              >
                <Icon name="chat" />
                <span className="chats-label">Chats</span>
              </button>
              <button
                id="theme-toggle"
                className="icon theme-toggle"
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                onClick={() =>
                  onThemeChange(theme === "dark" ? "light" : "dark")
                }
              >
                <Icon name={theme === "dark" ? "sun" : "moon"} />
              </button>
            </div>
            <button
              className="title"
              id="customize-hacky"
              aria-label="Customize Hacky"
              onClick={onCustomize}
            >
              <span className="title-name">Hacky</span>
              <span className="header-event">Knight Hacks IX</span>
            </button>
            <div className="header-actions">
              <button
                id="essentials-button"
                className={`icon essentials-button${events.attention ? " needs-attention" : ""}`}
                aria-label="Events and essentials"
                aria-haspopup="dialog"
                title="Events and essentials"
                onClick={events.openPanel}
              >
                <svg
                  className="essentials-fallback"
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                >
                  <rect x="4" y="5" width="16" height="16" rx="3" />
                  <path d="M8 3v4m8-4v4M4 10h16m-11 5 2 2 4-4" />
                </svg>
              </button>
              <button
                id="preferences"
                className="icon"
                aria-label="Preferences"
                title="Preferences"
                onClick={onPreferences}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m10 3-.6 2.2-2 .9-2-.6-2 3.4 1.5 1.6v2.3L3.4 14l2 3.4 2-.6 2 .9L10 20h4l.6-2.3 2-.9 2 .6 2-3.4-1.5-1.6v-2.3l1.5-1.6-2-3.4-2 .6-2-.9L14 3Z" />
                  <circle cx="12" cy="11.5" r="3" />
                </svg>
              </button>
            </div>
          </header>
          <div
            ref={feed}
            className={`feed has-conversation${planReady ? " plan-ready" : ""}`}
            id="feed"
            aria-busy={busy}
            onScroll={() => {
              const el = feed.current;
              if (el.scrollHeight - el.clientHeight - el.scrollTop < 64)
                setNewHacky(false);
            }}
          >
            <div
              id="thread"
              className="thread"
              onClick={(event) => {
                const button = event.target.closest("[data-ask]");
                if (button && event.currentTarget.contains(button))
                  find(button.dataset.ask);
              }}
              role="log"
              aria-live="polite"
              aria-label="Conversation with Hacky"
            >
              <div
                id="hacky-brief"
                className="msg assistant hacky-brief hacky-task"
              >
                <WorkingPet
                  style={style}
                  state={
                    busy && messages.some((m) => m.planPending)
                      ? "working"
                      : "listening"
                  }
                />
                <p>What can I help you with?</p>
                <p className="brief-guidance">
                  Pick a starting point, or tell me what you’re trying to do.
                </p>
                <div className="suggestions" aria-label="Try a request">
                  <button
                    className="suggestion"
                    data-prompt="Help me find people"
                    onClick={() => find("Help me find people")}
                  >
                    <Avatar id="mika" />
                    Find people
                  </button>
                  <button
                    className="suggestion"
                    data-prompt="What can you tell me about the events?"
                    onClick={() =>
                      find("What can you tell me about the events?")
                    }
                  >
                    <ShortcutArt kind="event" />
                    Event questions
                  </button>
                  <button
                    className="suggestion"
                    data-prompt="Find a mentor"
                    onClick={() => find("Find a mentor")}
                  >
                    <Avatar id="aya" />
                    <span>
                      Find mento
                      <span className="mentor-final">
                        r
                        <svg
                          className="mentor-crown"
                          aria-hidden="true"
                          viewBox="0 0 16 12"
                        >
                          <path d="M2 9 1 3l4 3 3-5 3 5 4-3-1 6Z" />
                          <path d="M3 11h10" />
                        </svg>
                      </span>
                    </span>
                  </button>
                  <button
                    className="suggestion"
                    data-prompt="Which sponsors are here?"
                    onClick={() => find("Which sponsors are here?")}
                  >
                    <ShortcutArt kind="sponsor" />
                    Sponsor questions
                  </button>
                </div>
              </div>
              {messages.map((m, i) => (
                <div
                  key={m.id}
                  className={`msg message-arrival ${m.user ? "user" : "assistant"}${m.user && i === lastHacky ? " has-receipt" : ""}${m.pending ? " waiting hacky-task" : ""}${m.planPending ? " plan-reply plan-pending" : ""}${m.planDone ? " event-answer plan-reply" : ""}`}
                >
                  {m.user && (
                    <div className="byline">
                      <Avatar id="self" />
                      <span>You</span>
                    </div>
                  )}
                  {m.pending && <WorkingPet style={style} />}
                  {m.planPending && <Dots />}
                  {m.planDone && <div className="byline">Hacky</div>}
                  <p>{m.text}</p>
                  {m.user && i === lastHacky && <Receipt read={m.read} />}
                  {m.content}
                  {m.ids?.length > 0 && (
                    <Matches
                      ids={m.ids}
                      query={m.query}
                      onProfile={(id, reason) => setProfile({ id, reason })}
                    />
                  )}
                  {m.planDone && (
                    <p>
                      <a
                        className="event-source"
                        href="#your-events"
                        data-your-events=""
                        onClick={(e) => {
                          e.preventDefault();
                          events.openPanel(e);
                        }}
                      >
                        View your events
                      </a>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="compose-wrap">
            <button
              id="hacky-new-reply"
              className="toggle"
              hidden={!newHacky}
              onClick={() => {
                feed.current.scrollTop = feed.current.scrollHeight;
                setNewHacky(false);
                document
                  .getElementById("finder-input")
                  ?.focus({ preventScroll: true });
              }}
            >
              New reply
            </button>
            <Composer
              id="finder"
              value={input}
              onChange={setInput}
              onSubmit={() => input.trim() && find(input.trim())}
              busy={busy}
              label="Talk to Hacky"
              placeholder="Ask Hacky…"
              sendLabel="Send to Hacky"
            />
            <p className="demo-note">
              Demo people · Event guide snapshot · Local only
            </p>
          </div>
        </main>
      </div>
      <People
        profile={profile}
        onClose={() => setProfile(null)}
        onMessage={profileMessage}
      />
    </>
  );
}
