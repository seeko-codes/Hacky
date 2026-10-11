import { memo, useState } from 'react';
import HackyFilm, { CHAT_CLIP } from '../HackyFilm.jsx';
import { Avatar, WorkingPet } from '../ui.jsx';

function ShortcutArt({ kind }) {
  return (
    <svg className="shortcut-art" aria-hidden="true" viewBox="0 0 32 32" style={{ stroke: 'none' }}>
      {kind === 'event' ? (
        <g transform="rotate(-12 16 16)">
          <rect x="4" y="3" width="22" height="23" rx="4" fill="#77b8dd" />
          <path d="M5 9h23v6a3 3 0 0 0 0 6v6H5v-6a3 3 0 0 0 0-6Z" fill="#ffcf65" />
          <path d="M21 11v3m0 3v3m0 3v2" stroke="#8a591d" strokeWidth="1.5" />
          <path d="m12 13 1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4Z" fill="#bf502c" />
        </g>
      ) : (
        <>
          <rect x="5" y="13" width="22" height="15" rx="3" fill="#78c7bd" />
          <path d="M7 5h18l4 8H3Z" fill="#ffad7a" />
          <path d="M10 5h4l-1 8H7Zm8 0h4l3 8h-6Z" fill="#fff0d4" />
          <path d="M3 13h6v2a3 3 0 0 1-6 0Zm12 0h6v2a3 3 0 0 1-6 0Zm12 0h2v2a3 3 0 0 1-2 2.8Z" fill="#d97443" />
          <rect x="9" y="20" width="14" height="4" rx="1" fill="#225467" />
          <path d="M9 28v-4m14 4v4" stroke="#225467" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

// What the Find hackers chip sends. The agent offers teammate or open-team discovery,
// never the mentor flow: findingRules in server/agent/prompts.ts quotes this exact text.
export const FIND_HACKERS = 'Help me find hackers';

// The opening card. Hackers and mentors go to the Hacky agent; event and
// sponsor questions are answered from the static guide.
function Brief({ style, working, onStart, onLocal }) {
  // Hacky's chat clip; the still pet while working or if the clip can't load.
  const [noClip, setNoClip] = useState(false);
  const film = !working && !noClip;
  return (
    <div id="hacky-brief" className="msg assistant hacky-brief hacky-task">
      {film ? (
        <span className="working-hacky listening hacky-brief-film">
          <HackyFilm clip={CHAT_CLIP} onUnavailable={() => setNoClip(true)} />
        </span>
      ) : (
        <WorkingPet style={style} state={working ? 'working' : 'listening'} />
      )}
      <p>What can I help you with?</p>
      <p className="brief-guidance">Pick a starting point, or tell me what you’re trying to do.</p>
      <div className="suggestions" aria-label="Try a request">
        <button className="suggestion" data-prompt={FIND_HACKERS} onClick={() => onStart(FIND_HACKERS)}>
          <Avatar id="mika" />
          Find hackers
        </button>
        <button className="suggestion" data-prompt="What can you tell me about the events?" onClick={() => onLocal('What can you tell me about the events?')}>
          <ShortcutArt kind="event" />
          Event questions
        </button>
        <button className="suggestion" data-prompt="Find a mentor" onClick={() => onStart('Find a mentor')}>
          <Avatar id="aya" />
          <span>
            Find mento
            <span className="mentor-final">
              r
              <svg className="mentor-crown" aria-hidden="true" viewBox="0 0 16 12">
                <path d="M2 9 1 3l4 3 3-5 3 5 4-3-1 6Z" />
                <path d="M3 11h10" />
              </svg>
            </span>
          </span>
        </button>
        <button className="suggestion" data-prompt="Which sponsors are here?" onClick={() => onLocal('Which sponsors are here?')}>
          <ShortcutArt kind="sponsor" />
          Sponsor questions
        </button>
      </div>
    </div>
  );
}

export default memo(Brief);
