import { memo, useMemo, useState } from 'react';
import { PersonAvatar, SelfAvatar } from '../ui.jsx';
import { friendly } from './useSocial.js';
import { grouped } from './messages.js';
import { HelpStatus, RoleChip, firstName } from './parts.jsx';

export function ThreadIdentity({ conversation, missing }) {
  const peer = conversation?.peer;
  return (
    <>
      <span className="name" id="dm-title" title={peer?.name}>
        {peer?.name || (missing ? 'Chat unavailable' : 'Loading…')}
      </span>
      <span className="role" id="dm-role">
        {peer && <RoleChip role={peer.role} />}
        {conversation?.kind === 'mentor' && peer?.role !== 'mentor' && <span className="social-tag">Help chat</span>}
      </span>
    </>
  );
}

// Mentor chats: the help request, and "Mark resolved" while it's claimed.
export function HelpBar({ conversation, social }) {
  const [state, setState] = useState({ busy: false, error: '' });
  const h = conversation?.helpRequest;
  if (!h) return null;
  const resolve = async () => {
    setState({ busy: true, error: '' });
    try {
      await social.resolve(h.id, conversation.id);
      setState({ busy: false, error: '' });
    } catch (error) {
      setState({ busy: false, error: friendly(error) });
    }
  };
  return (
    <div className="social-helpbar">
      <span className="info">
        <span className="social-helpbar-title">{h.title}</span>
        <HelpStatus status={h.status} />
      </span>
      {h.status === 'claimed' && (
        <button type="button" className="hk-button secondary" disabled={state.busy} onClick={resolve}>
          {state.busy ? 'Resolving…' : 'Mark resolved'}
        </button>
      )}
      {state.error && <p className="social-error" role="alert">{state.error}</p>}
    </div>
  );
}

const looksLikeJson = (text) => /^\s*[[{]/.test(text);

const MessageRow = memo(function MessageRow({ m, mine, joined, peer, onRetry }) {
  if (m.kind === 'system') {
    return (
      <div className="social-system message-arrival" role="note">
        <p>{m.body}</p>
      </div>
    );
  }
  const status = m.local ? ' social-' + m.status : '';
  return (
    <div
      className={`bubble${mine ? ' mine' : ''}${joined ? ' consecutive' : ''}${status} message-arrival`}
      title={m.local ? undefined : new Date(m.createdAt).toLocaleString()}
    >
      {mine ? <SelfAvatar /> : <PersonAvatar person={peer} />}
      <div className="message-body">
        <div className={`sender${joined ? ' sr-only' : ''}`}>{mine ? 'You' : firstName(peer?.name)}</div>
        <p>{m.kind === 'card' && looksLikeJson(m.body) ? 'Shared a card' : m.body}</p>
        {m.local && m.status === 'sending' && <span className="sr-only">Sending</span>}
        {m.local && m.status === 'failed' && (
          <span className="social-failed-note" role="alert">
            {m.error || 'Not sent.'}{' '}
            <button type="button" onClick={() => onRetry(m.conversationId, m.clientId)}>
              Retry
            </button>
          </span>
        )}
      </div>
    </div>
  );
});

// The messages inside #dm-feed. Rows are memoized; the server copy of my own
// message keeps the key of its instant copy (clientId) so it doesn't remount.
export function ThreadFeed({ id, thread, conversation, missing, selfId, onRetry, onReload, onOlder }) {
  const peer = conversation?.peer;
  const style = JSON.stringify(peer?.hackyStyle || null);
  const person = useMemo(() => peer, [peer?.userId, peer?.name, peer?.role, peer?.photoUrl, style]);
  const messages = thread?.messages || [];
  if (missing) {
    return (
      <div className="empty">
        <p>This chat isn’t available anymore.</p>
      </div>
    );
  }
  if (!thread || (!thread.loaded && !thread.error)) {
    return (
      <div className="empty">
        <p>Loading messages…</p>
      </div>
    );
  }
  if (thread.error && !messages.length) {
    return (
      <div className="empty" role="alert">
        <p>{thread.error}</p>
        <button type="button" className="hk-button secondary social-retry" onClick={() => onReload(id)}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <>
      {thread.hasMore && (
        <button type="button" className="social-older" disabled={thread.older} onClick={() => onOlder(id)}>
          {thread.older ? 'Loading earlier messages…' : 'Load earlier messages'}
        </button>
      )}
      {messages.map((m, i) => (
        <MessageRow
          key={m.clientId || m.id}
          m={m}
          mine={m.senderId === selfId}
          joined={grouped(messages[i - 1], m)}
          peer={person}
          onRetry={onRetry}
        />
      ))}
      {!messages.length && (
        <div className="empty">
          <p>
            {conversation?.kind === 'mentor'
              ? 'Say where you’re stuck and what you’ve tried.'
              : 'Say hi and share what you’re building.'}
          </p>
        </div>
      )}
    </>
  );
}
