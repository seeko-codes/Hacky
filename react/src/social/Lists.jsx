import { useState } from 'react';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { PersonAvatar } from '../ui.jsx';
import { friendly } from './useSocial.js';
import { HelpStatus, RoleChip, roleLabel } from './parts.jsx';

// A button's pending state and one friendly error line.
function useAction() {
  const [state, setState] = useState({ busy: false, error: '' });
  const run = async (fn) => {
    if (state.busy) return;
    setState({ busy: true, error: '' });
    try {
      await fn();
      setState({ busy: false, error: '' });
    } catch (error) {
      setState({ busy: false, error: friendly(error) });
    }
  };
  return [state, run];
}

function Who({ person, onProfile }) {
  return (
    <button
      type="button"
      className="social-who"
      aria-label={`View ${person.name} profile`}
      aria-haspopup="dialog"
      onClick={(e) => {
        e.currentTarget.focus({ preventScroll: true });
        onProfile(person.handle);
      }}
    >
      <PersonAvatar person={person} />
    </button>
  );
}

function RequestRow({ request: r, social, onOpen, onProfile }) {
  const [state, run] = useAction();
  const incoming = r.direction === 'incoming';
  return (
    <div className="contact social-card" data-request={r.id}>
      <Who person={r.person} onProfile={onProfile} />
      <span className="info">
        <span className="name">{r.person.name}</span>
        <span className="contact-categories">
          <RoleChip role={r.person.role} />
          {r.team && <span className="social-tag">Team {r.team.name}</span>}
          {!incoming && <span className="social-tag social-pending">Pending</span>}
        </span>
        {r.intro && <span className="social-intro">{r.intro}</span>}
        {incoming && (
          <span className="social-actions">
            <button
              type="button"
              className="hk-button"
              disabled={state.busy}
              onClick={() => run(async () => onOpen(await social.accept(r.id)))}
            >
              Accept
            </button>
            {!r.hiddenAt && (
              <button
                type="button"
                className="hk-button secondary"
                disabled={state.busy}
                onClick={() => run(() => social.hide(r.id))}
              >
                Not now
              </button>
            )}
          </span>
        )}
        {state.error && <span className="social-error" role="alert">{state.error}</span>}
      </span>
    </div>
  );
}

function QueueRow({ item, social, onOpen, onProfile }) {
  const [state, run] = useAction();
  return (
    <div className="contact social-card" data-help={item.id}>
      <Who person={item.hacker} onProfile={onProfile} />
      <span className="info">
        <span className="name">{item.title}</span>
        <span className="preview">{item.hacker.name}</span>
        {(item.fit?.highlighted || item.fit?.matchedSkills?.length > 0) && (
          <span className="contact-categories">
            {item.fit.highlighted && <span className="social-tag social-fit">Top fit</span>}
            {item.fit.matchedSkills.map((skill) => (
              <span key={skill} className="social-tag">{skill}</span>
            ))}
          </span>
        )}
        {item.details && <span className="social-intro">{item.details}</span>}
        <span className="social-actions">
          <button
            type="button"
            className="hk-button"
            disabled={state.busy}
            onClick={() => run(async () => onOpen(await social.claim(item.id)))}
          >
            {state.busy ? 'Claiming…' : 'Claim'}
          </button>
        </span>
        {state.error && <span className="social-error" role="alert">{state.error}</span>}
      </span>
    </div>
  );
}

function preview(c, selfId, draft) {
  if (draft) return 'Draft: ' + draft;
  const m = c.lastMessage;
  if (!m) return c.kind === 'mentor' ? 'Mentor chat started' : 'Say hi';
  if (m.kind === 'system') return m.body;
  return (m.senderId === selfId ? 'You: ' : '') + m.body;
}

function ChatRow({ c, selfId, draft, unread, onOpen }) {
  return (
    <button type="button" className="contact" data-contact={c.id} onClick={() => onOpen(c.id)}>
      <PersonAvatar person={c.peer} />
      <span className="info">
        <span className="name">{c.peer.name}</span>
        <span className="contact-categories">
          <RoleChip role={c.peer.role} />
          {c.helpRequest && (
            <span className="social-tag social-help-title">
              {c.helpRequest.title} · <HelpStatus status={c.helpRequest.status} />
            </span>
          )}
        </span>
        <span className="preview">{preview(c, selfId, draft)}</span>
      </span>
      {unread > 0 && (
        <span className="social-unread">
          {unread > 99 ? '99+' : unread}
          <span className="sr-only"> unread</span>
        </span>
      )}
    </button>
  );
}

export function EventBadge({ social }) {
  const role = roleLabel(social.role);
  return (
    <div className="event">
      <img className="mlh-logo" src="/assets/brand/mlh-logo-color.svg" alt="Major League Hacking" />
      <span className="event-divider" />
      <span>
        {social.eventName || 'Your hackathon'}
        <br />
        <small>
          {role ? `You’re here as a ${role.toLowerCase()}` : 'Requests and chats'}
          {social.verified && social.role !== 'hacker' ? ' · Verified' : ''}
        </small>
        {social.role === 'mentor' && <Availability />}
      </span>
    </div>
  );
}

// Mentors claim only while available or busy, so they need a way to come online.
function Availability() {
  const { slug, eventMe, setEventMe } = useSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = async (availability) => {
    setSaving(true);
    setError('');
    try {
      setEventMe(await api(`/api/events/${slug}/me`, { method: 'PATCH', body: { availability } }));
    } catch (e) {
      setError(friendly(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <span className="social-availability">
      <label>
        Status{' '}
        <select value={eventMe.availability} disabled={saving} onChange={(e) => change(e.target.value)}>
          <option value="available">Available</option>
          <option value="busy">Busy</option>
          <option value="offline">Offline</option>
        </select>
      </label>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}

// Requests, the mentor queue or your help requests, then chats.
export function ChatLists({ social, drafts, activeId, onOpen, onProfile }) {
  const { requests, help, conversations } = social;
  const mentor = social.role === 'mentor';
  const mine = social.role === 'hacker' ? help.data?.mine || [] : [];
  const chats = conversations.data || [];
  const anyRequests = requests.incoming.length + requests.hidden.length + requests.outgoing.length > 0;
  return (
    <div className="contacts social-lists">
      {anyRequests && (
        <section aria-labelledby="social-requests">
          <h2 className="label" id="social-requests">Requests</h2>
          {requests.incoming.map((r) => (
            <RequestRow key={r.id} request={r} social={social} onOpen={onOpen} onProfile={onProfile} />
          ))}
          {requests.hidden.length > 0 && (
            <details className="social-hidden">
              <summary>Hidden ({requests.hidden.length})</summary>
              {requests.hidden.map((r) => (
                <RequestRow key={r.id} request={r} social={social} onOpen={onOpen} onProfile={onProfile} />
              ))}
            </details>
          )}
          {requests.outgoing.map((r) => (
            <RequestRow key={r.id} request={r} social={social} onOpen={onOpen} onProfile={onProfile} />
          ))}
          {requests.error && <p className="social-note" role="status">{requests.error}</p>}
        </section>
      )}
      {mentor && (
        <section aria-labelledby="social-queue">
          <h2 className="label" id="social-queue">Help queue</h2>
          {help.data?.open?.length ? (
            help.data.open.map((item) => (
              <QueueRow key={item.id} item={item} social={social} onOpen={onOpen} onProfile={onProfile} />
            ))
          ) : (
            <p className="social-note">
              {!help.loaded
                ? 'Loading the queue…'
                : social.verified
                  ? 'No one needs help right now. New requests show up here.'
                  : 'Help requests show up here once you’re verified.'}
            </p>
          )}
          {help.error && <p className="social-note" role="status">{help.error}</p>}
        </section>
      )}
      {mine.length > 0 && (
        <section aria-labelledby="social-mine">
          <h2 className="label" id="social-mine">Your help requests</h2>
          {mine.map((h) => {
            const body = (
              <span className="info">
                <span className="name">{h.title}</span>
                <span className="preview">
                  <HelpStatus status={h.status} />
                  {h.mentor ? ' · ' + h.mentor.name : ''}
                </span>
              </span>
            );
            return h.conversationId ? (
              <button key={h.id} type="button" className="contact social-mine" onClick={() => onOpen(h.conversationId)}>
                {body}
              </button>
            ) : (
              <div key={h.id} className="contact social-mine">{body}</div>
            );
          })}
        </section>
      )}
      <section aria-labelledby="social-chats">
        <h2 className="label" id="social-chats">Chats</h2>
        {chats.map((c) => (
          <ChatRow
            key={c.id}
            c={c}
            selfId={social.selfId}
            draft={drafts[c.id]}
            unread={c.id === activeId ? 0 : c.unreadCount}
            onOpen={onOpen}
          />
        ))}
        {!chats.length && (
          <p className="social-note">
            {conversations.loaded ? 'No chats yet. Ask Hacky to find someone.' : 'Loading chats…'}
          </p>
        )}
        {conversations.error && <p className="social-note" role="status">{conversations.error}</p>}
      </section>
    </div>
  );
}
