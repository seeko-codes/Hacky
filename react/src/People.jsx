import React, { useEffect, useState } from "react";
import { Icon, Modal, PersonAvatar } from "./ui.jsx";
import { api, notifyChanged } from "./api.js";
import { useSession } from "./session.jsx";
import { friendly } from "./social/useSocial.js";
import { introProblem } from "./social/messages.js";
import { RoleChip, firstName } from "./social/parts.jsx";

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

// Starts as one button so the profile fits on screen; the intro form opens when tapped.
function RequestForm({ person, onSent }) {
  const { slug } = useSession();
  const [writing, setWriting] = useState(false);
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
  if (!writing)
    return (
      <button className="profile-message" onClick={() => setWriting(true)}>
        Connect with {firstName(person.name)}
      </button>
    );
  return (
    <form className="social-request-form" onSubmit={send}>
      <label htmlFor="request-intro">Say why you’d like to connect</label>
      <textarea
        id="request-intro"
        autoFocus
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

// Your own profile shows what others see, with buttons to change your answers and Hacky.
export default function People({ profile, onClose, onMessage, onEditAnswers, onCustomize, onBlocked }) {
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
      initialFocus=".person-sheet"
    >
      {handle && (
        <div className="person-sheet" tabIndex={-1}>
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
                    {p.role === "mentor" && AVAILABILITY[p.availability] && (
                      <span className="social-tag">{AVAILABILITY[p.availability]}</span>
                    )}
                    {p.role === "hacker" && p.looking && <span className="social-tag">Looking for a team</span>}
                  </div>
                </div>
                {profile.reason && (
                  <section className="profile-section profile-reason">
                    <h3>Why connect</h3>
                    <p>{profile.reason}</p>
                  </section>
                )}
                {/* Just the essentials. The summary restates the skills, so it stands in only when there's no bio. */}
                <Text title="About">{p.bio || p.summary}</Text>
                <Chips title="Skills" items={p.skills} />
              </>
            )}
          </div>
          {p && self && (
            <footer className="person-footer">
              <div className="social-footer-actions">
                <button
                  className="hk-button"
                  onClick={() => {
                    onClose();
                    onEditAnswers();
                  }}
                >
                  Edit my answers
                </button>
                <button
                  className="hk-button secondary"
                  onClick={(event) => {
                    onClose();
                    onCustomize(event);
                  }}
                >
                  Customize Hacky
                </button>
              </div>
              <p>This is how other people see you.</p>
            </footer>
          )}
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
