import React, { useEffect, useState } from "react";
import { Icon, Modal, PersonAvatar } from "./ui.jsx";
import { api, notifyChanged } from "./api.js";
import { useSession } from "./session.jsx";
import { friendly } from "./social/useSocial.js";
import { introProblem } from "./social/messages.js";
import { RoleChip, firstName } from "./social/parts.jsx";

function SocialIcon({ platform }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {platform === "github" ? (
        <path d="M9 19c-4 1-4-2-6-2m12 5v-4c0-1-.3-2-1-2 4-.5 7-2 7-6 0-1.5-.5-3-1.5-4 .2-1 0-2-.5-3-2 0-3 1-4 1a15 15 0 0 0-6 0c-1 0-2-1-4-1-.5 1-.7 2-.5 3C3.5 7 3 8.5 3 10c0 4 3 5.5 7 6-.7.5-1 1.5-1 2v4" />
      ) : platform === "linkedin" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M7 10v7m0-10v.1m5 9.9v-7m0 3c0-4 5-4 5 0v4" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
        </>
      )}
    </svg>
  );
}
const LINKS = [
  ["github", "GitHub"],
  ["linkedin", "LinkedIn"],
  ["website", "Website"],
];
const GOALS = { win: "Wants to win", learn: "Here to learn", ship: "Wants to ship something" };
const LEVELS = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const AVAILABILITY = { available: "Available now", busy: "Busy", offline: "Offline" };

function Chips({ title, items }) {
  if (!items?.length) return null;
  return (
    <section className="profile-section">
      <h3>{title}</h3>
      <div className="social-chips">
        {items.map((item) => (
          <span key={item} className="social-tag">
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
function Text({ title, children }) {
  if (!children) return null;
  return (
    <section className="profile-section">
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
}

function RequestForm({ person, onSent }) {
  const { slug } = useSession();
  const [intro, setIntro] = useState("");
  const [state, setState] = useState({ busy: false, error: "", tried: false });
  const problem = introProblem(intro);
  const send = async (e) => {
    e.preventDefault();
    if (problem) return setState((s) => ({ ...s, tried: true }));
    setState({ busy: true, error: "", tried: true });
    try {
      const { request } = await api(`/api/events/${slug}/requests`, {
        method: "POST",
        body: { toUserId: person.userId, intro: intro.trim(), source: "profile" },
      });
      onSent(request);
    } catch (error) {
      setState({ busy: false, error: friendly(error), tried: true });
    }
  };
  const shown = state.error || (state.tried || /https?:\/\/|www\./i.test(intro) ? problem : "");
  return (
    <form className="social-request-form" onSubmit={send}>
      <label htmlFor="request-intro">Say why you’d like to connect</label>
      <textarea
        id="request-intro"
        rows="3"
        maxLength={500}
        value={intro}
        placeholder={`Hi ${firstName(person.name)}! I’m building…`}
        onChange={(e) => setIntro(e.target.value)}
      />
      <div className="social-form-meta">
        <span className="social-error" role={shown ? "alert" : undefined}>
          {shown}
        </span>
        <span>{intro.trim().length}/500</span>
      </div>
      <button className="profile-message" disabled={state.busy || !intro.trim()}>
        {state.busy ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}

function Actions({ person, relation, setRelation, onMessage }) {
  const [state, setState] = useState({ busy: false, error: "", hidden: false });
  const run = async (fn) => {
    setState((s) => ({ ...s, busy: true, error: "" }));
    try {
      await fn();
      setState((s) => ({ ...s, busy: false }));
    } catch (error) {
      setState((s) => ({ ...s, busy: false, error: friendly(error) }));
    }
  };
  const first = firstName(person.name);
  let body;
  if (relation.state === "accepted") {
    body = (
      <button
        id="person-message"
        className="profile-message"
        disabled={!relation.conversationId}
        onClick={() => onMessage(relation.conversationId)}
      >
        Message {first}
      </button>
    );
  } else if (relation.state === "outgoing") {
    body = (
      <button className="profile-message" disabled>
        Request sent
      </button>
    );
  } else if (relation.state === "incoming") {
    body = (
      <div className="social-footer-actions">
        <button
          className="hk-button"
          disabled={state.busy}
          onClick={() =>
            run(async () => {
              const { request } = await api(`/api/requests/${relation.requestId}/accept`, { method: "POST" });
              setRelation({ state: "accepted", requestId: request.id, conversationId: request.conversationId });
              notifyChanged("requests");
              notifyChanged("conversations");
            })
          }
        >
          Accept
        </button>
        {!state.hidden && (
          <button
            className="hk-button secondary"
            disabled={state.busy}
            onClick={() =>
              run(async () => {
                await api(`/api/requests/${relation.requestId}/hide`, { method: "POST" });
                setState((s) => ({ ...s, hidden: true }));
                notifyChanged("requests");
              })
            }
          >
            Not now
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <RequestForm
        person={person}
        onSent={(request) => {
          setRelation({
            state: request.status === "accepted" ? "accepted" : "outgoing",
            requestId: request.id,
            conversationId: request.conversationId,
          });
          notifyChanged("requests");
          if (request.status === "accepted") notifyChanged("conversations");
        }}
      />
    );
  }
  return (
    <>
      {body}
      {state.hidden && <p className="social-done">Hidden. You can still accept it from Chats.</p>}
      {state.error && (
        <p className="social-error" role="alert">
          {state.error}
        </p>
      )}
    </>
  );
}

export default function People({ profile, onClose, onMessage, onBlocked }) {
  const { slug, me } = useSession();
  const handle = profile?.handle;
  const [load, setLoad] = useState({ person: null, error: "" });
  const [relation, setRelation] = useState(null);
  const [blocking, setBlocking] = useState({ confirm: false, busy: false, error: "" });

  useEffect(() => {
    setLoad({ person: null, error: "" });
    setRelation(null);
    setBlocking({ confirm: false, busy: false, error: "" });
    if (!handle) return;
    const controller = new AbortController();
    api(`/api/events/${slug}/people/${encodeURIComponent(handle)}`, { signal: controller.signal })
      .then((person) => {
        setLoad({ person, error: "" });
        setRelation(person.relation);
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setLoad({
          person: null,
          error: error.status === 404 ? "This profile isn’t available." : friendly(error, "Couldn’t load this profile."),
        });
      });
    return () => controller.abort();
  }, [slug, handle]);

  const p = load.person;
  const self = p && p.userId === me?.profile?.userId;
  const links = p ? LINKS.filter(([key]) => p.links?.[key]) : [];
  const block = async () => {
    setBlocking((b) => ({ ...b, busy: true, error: "" }));
    try {
      await api("/api/blocks", { method: "POST", body: { userId: p.userId } });
      ["requests", "conversations", "help"].forEach(notifyChanged);
      onBlocked?.(p.userId);
      onClose();
    } catch (error) {
      setBlocking((b) => ({ ...b, busy: false, error: friendly(error) }));
    }
  };

  return (
    <Modal
      open={Boolean(handle)}
      onClose={onClose}
      id="person-dialog"
      className="person-dialog"
      labelledBy="person-title"
      initialFocus="#close-person"
    >
      {handle && (
        <div className="person-sheet">
          <header className="person-toolbar">
            <button id="close-person" className="toggle" onClick={onClose}>
              <Icon name="back" />
              Back
            </button>
            {p && !self && !blocking.confirm && (
              <button
                className="toggle social-block"
                onClick={() => setBlocking({ confirm: true, busy: false, error: "" })}
              >
                Block
              </button>
            )}
          </header>
          <div id="person-content" className="person-content" key={handle}>
            {!p ? (
              <div className="profile-identity">
                <h2 id="person-title" className="sr-only">
                  Profile
                </h2>
                <p className="hk-empty" role={load.error ? "alert" : "status"}>
                  {load.error || "Loading profile…"}
                </p>
              </div>
            ) : (
              <>
                <div className="profile-identity">
                  <PersonAvatar person={p} />
                  <h2 id="person-title">{p.name}</h2>
                  <div className="profile-categories">
                    <RoleChip role={p.role} verified={p.verified} />
                  </div>
                  <div className="social-facts">
                    {p.role === "mentor" && AVAILABILITY[p.availability] && (
                      <span className="social-tag">{AVAILABILITY[p.availability]}</span>
                    )}
                    {p.role === "hacker" && p.looking && <span className="social-tag">Looking for a team</span>}
                    {LEVELS[p.experience] && <span className="social-tag">{LEVELS[p.experience]}</span>}
                  </div>
                </div>
                {profile.reason && (
                  <section className="profile-section profile-reason">
                    <h3>Why connect</h3>
                    <p>{profile.reason}</p>
                  </section>
                )}
                <Text title="About">{p.bio}</Text>
                <Text title="Summary">{p.summary}</Text>
                <Chips title="Skills" items={p.skills} />
                <Chips title="Wants to work with" items={p.skillsWanted} />
                <Text title="Goal">
                  {[GOALS[p.goal], p.track && `Track: ${p.track}`].filter(Boolean).join(" · ")}
                </Text>
                <Chips title="Interests" items={p.interests} />
                <Text title="Idea">{p.idea}</Text>
                {links.length > 0 && (
                  <div className="profile-links">
                    <div className="socials">
                      {links.map(([key, label]) => (
                        <a
                          key={key}
                          className="social-link"
                          href={p.links[key]}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${label} for ${p.name} (opens in a new tab)`}
                        >
                          <SocialIcon platform={key} />
                          {label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {p && !self && (
            <footer className="person-footer">
              {blocking.confirm ? (
                <>
                  <p className="social-confirm">
                    Block {firstName(p.name)}? They won’t be told, and your chat disappears for both of you.
                  </p>
                  <div className="social-footer-actions">
                    <button className="hk-button" disabled={blocking.busy} onClick={block}>
                      {blocking.busy ? "Blocking…" : "Block"}
                    </button>
                    <button
                      className="hk-button secondary"
                      disabled={blocking.busy}
                      onClick={() => setBlocking({ confirm: false, busy: false, error: "" })}
                    >
                      Cancel
                    </button>
                  </div>
                  {blocking.error && (
                    <p className="social-error" role="alert">
                      {blocking.error}
                    </p>
                  )}
                </>
              ) : (
                relation && <Actions person={p} relation={relation} setRelation={setRelation} onMessage={onMessage} />
              )}
            </footer>
          )}
        </div>
      )}
    </Modal>
  );
}
