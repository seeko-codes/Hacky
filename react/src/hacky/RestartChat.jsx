import { useState } from 'react';
import { Modal, focusQuietly } from '../ui.jsx';

// Interface only: keep the destructive action disabled until the API supports it.
export default function RestartChat() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" id="new-hacky-chat" className="toggle" aria-haspopup="dialog" onClick={event => {
      focusQuietly(event.currentTarget);
      setOpen(true);
    }}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" /></svg>
      New chat
    </button>
    <Modal open={open} onClose={() => setOpen(false)} id="restart-chat-dialog" className="hc-reset-dialog" labelledBy="restart-chat-title" initialFocus="#keep-hacky-chat">
      <h2 id="restart-chat-title">Start a new chat?</h2>
      <p>This will clear your conversation with Hacky for this event. Your profile, preferences, and chats with people will stay saved.</p>
      <p className="hc-reset-notice" id="restart-chat-unavailable">Coming soon. Starting a new chat isn’t available yet.</p>
      <div className="hc-reset-actions">
        <button type="button" className="hk-button secondary" id="keep-hacky-chat" onClick={() => setOpen(false)}>Keep chatting</button>
        <button type="button" className="hk-button" disabled aria-describedby="restart-chat-unavailable">Start new chat</button>
      </div>
    </Modal>
  </>;
}
