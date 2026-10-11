import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, PersonAvatar, SelfAvatar } from "./ui.jsx";
import { useSession } from "./session.jsx";
import { useMedia } from "./storage.js";
import People from "./People.jsx";
import HackyPane, { HackyEventName } from "./hacky/HackyPane.jsx";
import { useSocial } from "./social/useSocial.js";
import { ChatLists, EventBadge } from "./social/Lists.jsx";
import {
  HelpBar,
  ThreadFeed,
  ThreadIdentity,
} from "./social/Thread.jsx";

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
  paused,
  style,
  onPreferences,
  onCustomize,
  events,
  theme,
  onThemeChange,
}) {
  const mobile = useMedia("(max-width:700px)");
  const { me } = useSession();
  const [opened, setOpened] = useState(!mobile),
    [current, setCurrent] = useState(null),
    [drafts, setDrafts] = useState({}),
    [profile, setProfile] = useState(null),
    [newDm, setNewDm] = useState(false);
  const social = useSocial({ activeId: opened ? current : null }),
    dmThread = current ? social.threads[current] : null,
    dmChat = social.conversations.data?.find((c) => c.id === current),
    dmMissing =
      Boolean(current) &&
      !dmChat &&
      social.conversations.loaded &&
      !social.conversations.refreshing &&
      !social.conversations.error,
    feedState = useRef({}),
    [dmNotice, setDmNotice] = useState("");
  const dmFeed = useRef(null),
    app = useRef(null),
    sidebar = useRef(null),
    main = useRef(null),
    positions = useRef({}),
    dmAction = useRef(null);
  useEffect(() => setOpened(!mobile), [mobile]);
  // Pin the app to the visible area. On iOS the keyboard shrinks the visual
  // viewport and scrolls the page down, so the fixed app moves down with it.
  // The page scroll comes first and the viewport offset catches up about
  // 0.4 s later, so follow whichever is further. Only while typing: a swipe
  // that bounces the page moves both too, and the app must stay put then.
  // Feeds that were at their latest message stay there.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const fit = () => {
      const el = app.current;
      if (viewport.scale > 1.01) {
        el.style.height = el.style.transform = "";
        return;
      }
      const latest = [...el.querySelectorAll(".feed,.dm-feed")].filter(
        (feed) => feed.scrollHeight - feed.clientHeight - feed.scrollTop < 80,
      );
      const typing = document.activeElement?.matches("input, textarea, [contenteditable]");
      const top = typing ? Math.max(viewport.offsetTop, window.scrollY) : 0;
      el.style.height = viewport.height + "px";
      el.style.transform = top ? `translateY(${top}px)` : "";
      for (const feed of latest) feed.scrollTop = feed.scrollHeight;
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    window.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      window.removeEventListener("scroll", fit);
    };
  }, []);
  useEffect(() => {
    sidebar.current.inert = !opened;
    main.current.inert = opened && mobile;
  }, [opened, mobile]);
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
  // Opens a DM or mentor chat by conversation id, even one the list hasn't loaded yet.
  const openConversation = (id) => {
    if (!id) return;
    remember();
    setCurrent(id);
    setOpened(true);
    setNewDm(false);
    setDmNotice("");
    dmAction.current = { type: "restore", id };
    social.open(id);
    requestAnimationFrame(() =>
      document
        .getElementById("dm-identity")
        ?.focus({ preventScroll: true }),
    );
  };
  const backList = () => {
    const id = current;
    remember();
    setCurrent(null);
    setDmNotice("");
    requestAnimationFrame(() =>
      (
        document.querySelector(`[data-contact="${id}"]`) ||
        document.getElementById("close-sidebar")
      )?.focus({ preventScroll: true }),
    );
  };
  const dmAtLatest = () =>
    !dmFeed.current ||
    dmFeed.current.scrollHeight -
      dmFeed.current.clientHeight -
      dmFeed.current.scrollTop <
      48;
  // Restore on open, follow my sends and new replies at the bottom, offer
  // "New reply" otherwise (not when the last one was deleted), and keep the
  // view still when older messages load.
  useLayoutEffect(() => {
    const el = dmFeed.current,
      prev = feedState.current,
      list = dmThread?.messages || [];
    if (!el || !current) {
      feedState.current = {};
      return;
    }
    const first = list[0]?.id,
      last = list.at(-1)?.id,
      lastAt = Date.parse(list.at(-1)?.createdAt) || 0,
      action = dmAction.current?.id === current ? dmAction.current : null;
    if (action?.type === "restore") {
      if (dmThread?.loaded || dmThread?.error) {
        el.scrollTop = positions.current[current] ?? el.scrollHeight;
        dmAction.current = null;
      }
    } else if (prev.id === current && last !== prev.last) {
      if (action?.type === "follow" || prev.atLatest) {
        el.scrollTop = el.scrollHeight;
        if (action) dmAction.current = null;
      } else if (list.at(-1)?.senderId !== social.selfId && lastAt > prev.lastAt)
        setNewDm(true);
    } else if (prev.id === current && first !== prev.first)
      el.scrollTop += el.scrollHeight - prev.height;
    feedState.current = {
      id: current,
      first,
      last,
      lastAt,
      height: el.scrollHeight,
      atLatest: dmAtLatest(),
    };
  }, [dmThread, current]);
  const sendDm = () => {
    if (!current) return;
    const text = (drafts[current] || "").trim();
    if (!text) return;
    if (text.length > 4000)
      return setDmNotice("Messages can be up to 4,000 characters.");
    dmAction.current = { type: "follow", id: current };
    setDrafts((d) => ({ ...d, [current]: "" }));
    setNewDm(false);
    setDmNotice("");
    social.send(current, text);
  };
  const waiting =
      !opened && (social.unreadTotal > 0 || social.incomingCount > 0);
  const profileMessage = (conversationId) => {
    setProfile(null);
    openConversation(conversationId);
  };
  return (
    <>
      <div
        ref={app}
        id="app"
        className={`app${opened ? " open" : ""}`}
      >
        <aside
          ref={sidebar}
          id="sidebar"
          className={`sidebar${current ? " in-thread" : ""}`}
          aria-label="Chats"
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
              <EventBadge social={social} />
              <ChatLists
                social={social}
                drafts={drafts}
                activeId={opened ? current : null}
                onOpen={openConversation}
                onProfile={(handle) => setProfile({ handle })}
                onHide={(id) => { if (current === id) setCurrent(null); }}
              />
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
                <div id="dm-avatar">
                  {dmChat && <PersonAvatar person={dmChat.peer} />}
                </div>
                <button
                  id="dm-identity"
                  className="dm-identity"
                  aria-haspopup="dialog"
                  aria-disabled={!dmChat}
                  aria-label={
                    dmChat
                      ? "View " + dmChat.peer.name + " profile"
                      : "Selected conversation"
                  }
                  onClick={(event) => {
                    if (!dmChat) return;
                    event.currentTarget.focus({ preventScroll: true });
                    setProfile({ handle: dmChat.peer.handle });
                  }}
                >
                  <ThreadIdentity conversation={dmChat} missing={dmMissing} />
                </button>
              </header>
              <HelpBar key={current} conversation={dmChat} social={social} />
              <div
                ref={dmFeed}
                id="dm-feed"
                className="dm-feed"
                role="log"
                aria-live="polite"
                aria-label="Messages"
                onScroll={() => {
                  const el = dmFeed.current;
                  if (!current) return;
                  positions.current[current] = el.scrollTop;
                  feedState.current.atLatest = dmAtLatest();
                  if (feedState.current.atLatest) setNewDm(false);
                  if (el.scrollTop < 120) social.loadOlder(current);
                }}
              >
                {current && (
                  <ThreadFeed
                    id={current}
                    thread={dmThread}
                    conversation={dmChat}
                    missing={dmMissing}
                    selfId={social.selfId}
                    onRetry={social.retry}
                    onReload={social.reload}
                    onOlder={social.loadOlder}
                    onDelete={social.deleteMessage}
                  />
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
                    .getElementById("dm-identity")
                    ?.focus({ preventScroll: true });
                }}
              >
                New reply <Icon name="arrow" />
              </button>
              {dmNotice && (
                <p className="dm-notice" role="alert">
                  {dmNotice}
                </p>
              )}
              <Composer
                id="dm"
                value={drafts[current] || ""}
                onChange={(text) => {
                  if (!current) return;
                  setDrafts((d) => ({ ...d, [current]: text }));
                  if (dmNotice) setDmNotice("");
                }}
                onSubmit={sendDm}
                busy={dmMissing}
                label="Message selected conversation"
                placeholder="Write a message…"
                sendLabel="Send message"
              />
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
              <span className="header-event">
                <HackyEventName />
              </span>
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
                id="my-profile"
                className="icon my-profile"
                aria-label="Your profile"
                aria-haspopup="dialog"
                title="Your profile"
                onClick={(event) => {
                  event.currentTarget.focus({ preventScroll: true });
                  setProfile({ handle: me.profile.handle });
                }}
              >
                <SelfAvatar />
              </button>
            </div>
          </header>
          <HackyPane
            plan={plan}
            planRevision={planRevision}
            paused={paused}
            style={style}
            events={events}
            onPreferences={onPreferences}
            onProfile={setProfile}
            onOpenConversation={openConversation}
            renderComposer={(props) => (
              <Composer
                id="finder"
                label="Talk to Hacky"
                placeholder="Ask Hacky…"
                sendLabel="Send to Hacky"
                {...props}
              />
            )}
          />
        </main>
      </div>
      <People
        profile={profile}
        onClose={() => setProfile(null)}
        onMessage={profileMessage}
        onCustomize={onCustomize}
        onBlocked={(userId) => {
          if (dmChat?.peer.userId === userId) setCurrent(null);
        }}
      />
    </>
  );
}
