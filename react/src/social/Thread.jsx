import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, PersonAvatar, SelfAvatar, focusQuietly } from '../ui.jsx';
import { friendly } from './useSocial.js';
import { canDelete, grouped } from './messages.js';
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
const bodyText = (m) => (m.kind === 'card' && looksLikeJson(m.body) ? 'Shared a card' : m.body);
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Your own saved messages: tap one for its time and Delete. Keyboard and
// screen reader users reach the same Delete button, shown when it has focus.
const MessageRow = memo(function MessageRow({ m, mine, joined, peer, onRetry, deletable, picked, onPick, onAskDelete }) {
  if (m.kind === 'system') {
    return (
      <div className="social-system message-arrival" role="note">
        <p>{m.body}</p>
      </div>
    );
  }
  const status = m.local ? ' social-' + m.status : '';
  const own = deletable ? ` social-own${picked ? ' social-picked' : ''}` : '';
  return (
    <div
      className={`bubble${mine ? ' mine' : ''}${joined ? ' consecutive' : ''}${status}${own} message-arrival`}
      title={m.local ? undefined : new Date(m.createdAt).toLocaleString()}
    >
      {mine ? <SelfAvatar /> : <PersonAvatar person={peer} />}
      <div className="message-body" onClick={deletable ? (event) => onPick(m.id, event.currentTarget) : undefined}>
        <div className={`sender${joined ? ' sr-only' : ''}`}>{mine ? 'You' : firstName(peer?.name)}</div>
        <p>{bodyText(m)}</p>
        {m.local && m.status === 'sending' && <span className="sr-only">Sending</span>}
        {m.local && m.status === 'failed' && (
          <span className="social-failed-note" role="alert">
            {m.error || 'Not sent.'}{' '}
            <button type="button" onClick={() => onRetry(m.conversationId, m.clientId)}>
              Retry
            </button>
          </span>
        )}
        {deletable && (
          <span className={`social-message-actions${picked ? '' : ' sr-only'}`}>
            <time dateTime={m.createdAt}>{timeOf(m.createdAt)}</time>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAskDelete(m);
              }}
            >
              Delete<span className="sr-only"> message</span>
            </button>
          </span>
        )}
      </div>
    </div>
  );
});

// Unsend for everyone. There's no live event for deletes: a chat the other
// person has open drops the message when it next catches up (focus, reconnect
// or reopening it), so the copy says so.
function DeleteMessageDialog({ message, peerName, onClose, onDelete }) {
  const [state, setState] = useState({ busy: false, error: '' });
  useEffect(() => setState({ busy: false, error: '' }), [message?.id]);
  const cancel = () => {
    if (!state.busy) onClose(false);
  };
  const confirm = async () => {
    setState({ busy: true, error: '' });
    try {
      await onDelete(message.conversationId, message.id);
      setState({ busy: false, error: '' });
      onClose(true);
    } catch (error) {
      setState({ busy: false, error: friendly(error, 'Couldn’t delete it. Try again.') });
    }
  };
  return (
    <Modal
      open={Boolean(message)}
      onClose={cancel}
      id="delete-message-dialog"
      className="social-confirm-dialog"
      labelledBy="delete-message-title"
      initialFocus=".social-confirm-cancel"
    >
      <h2 id="delete-message-title">Delete this message?</h2>
      {message && <p className="social-confirm-quote">{bodyText(message)}</p>}
      <p>
        It’s removed for everyone in this chat and can’t be undone. If {peerName || 'they'} has the chat open
        right now, it leaves their screen when their chat refreshes.
      </p>
      <div className="social-footer-actions">
        <button type="button" className="hk-button" disabled={state.busy} onClick={confirm}>
          {state.busy ? 'Deleting…' : 'Delete'}
        </button>
        <button type="button" className="hk-button secondary social-confirm-cancel" disabled={state.busy} onClick={cancel}>
          Cancel
        </button>
      </div>
      {state.error && (
        <p className="social-error" role="alert">
          {state.error}
        </p>
      )}
    </Modal>
  );
}

// The messages inside #dm-feed. Rows are memoized; the server copy of my own
// message keeps the key of its instant copy (clientId) so it doesn't remount.
export function ThreadFeed({ id, thread, conversation, missing, selfId, onRetry, onReload, onOlder, onDelete }) {
  const peer = conversation?.peer;
  const style = JSON.stringify(peer?.hackyStyle || null);
  const person = useMemo(() => peer, [peer?.userId, peer?.name, peer?.role, peer?.photoUrl, style]);
  const messages = thread?.messages || [];
  // picked: the message showing its actions. doomed: the one waiting for confirmation.
  const [picked, setPicked] = useState(null);
  const [doomed, setDoomed] = useState(null);
  useEffect(() => {
    setPicked(null);
    setDoomed(null);
  }, [id]);
  const pick = useCallback((messageId, body) => {
    if (window.getSelection?.()?.toString()) return; // selecting text, not tapping
    setPicked((p) => (p === messageId ? null : messageId));
    // The actions open below the bubble, so on the newest message they'd sit under
    // the composer: scroll the feed just enough to show them.
    requestAnimationFrame(() =>
      body?.querySelector('.social-message-actions:not(.sr-only)')?.scrollIntoView({ block: 'nearest' }));
  }, []);
  const closeDelete = useCallback((deleted) => {
    setDoomed(null);
    // The Delete button left with the message, so focus goes back to the chat header.
    if (deleted) requestAnimationFrame(() => focusQuietly(document.getElementById('dm-identity')));
  }, []);
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
      {messages.map((m, i) => {
        const deletable = Boolean(onDelete) && canDelete(m, selfId);
        return (
          <MessageRow
            key={m.clientId || m.id}
            m={m}
            mine={m.senderId === selfId}
            joined={grouped(messages[i - 1], m)}
            peer={person}
            onRetry={onRetry}
            deletable={deletable}
            picked={deletable && picked === m.id}
            onPick={pick}
            onAskDelete={setDoomed}
          />
        );
      })}
      {!messages.length && (
        <div className="empty">
          <p>
            {conversation?.kind === 'mentor'
              ? 'Say where you’re stuck and what you’ve tried.'
              : 'Say hi and share what you’re building.'}
          </p>
        </div>
      )}
      {onDelete && (
        <DeleteMessageDialog
          message={doomed}
          peerName={firstName(peer?.name)}
          onClose={closeDelete}
          onDelete={onDelete}
        />
      )}
    </>
  );
}
