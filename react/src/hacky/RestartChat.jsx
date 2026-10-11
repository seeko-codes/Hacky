import { useState } from 'react';
import { Modal, focusQuietly } from '../ui.jsx';

export default function RestartChat({ disabled, onClear }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" id="new-hacky-chat" className="toggle" disabled={disabled} aria-haspopup="dialog" onClick={event => {
      focusQuietly(event.currentTarget);
      setOpen(true);
    }}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" /></svg>
      New chat
    </button>
    <Modal open={open} onClose={() => setOpen(false)} id="restart-chat-dialog" className="hc-reset-dialog" labelledBy="restart-chat-title" initialFocus="#keep-hacky-chat">
      <h2 id="restart-chat-title">Start a new chat?</h2>
      <p>This clears the messages shown on this browser. Hacky will still remember your conversation, profile, and preferences.</p>
      <p className="hc-reset-notice">Your saved history and chats with people stay unchanged.</p>
      <div className="hc-reset-actions">
        <button type="button" className="hk-button secondary" id="keep-hacky-chat" onClick={() => setOpen(false)}>Keep chatting</button>
        <button type="button" className="hk-button" disabled={disabled} onClick={() => {
          onClear();
          setOpen(false);
        }}>Start new chat</button>
      </div>
    </Modal>
  </>;
}
