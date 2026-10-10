# Hacky React

A native React port of the existing Hacky demo. The original HTML, CSS and JavaScript outside this directory remain preserved as reference files. This app renders React components directly; it does not embed or execute the original app.

## Run

From this directory:

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` for the hacker dashboard. Its **Use Hacky** link opens `/index.html?onboarding=1`, which starts the two-step onboarding and then enters the conversation. `/index.html` opens Hacky directly, showing onboarding when no preferences or session skip have been saved. `/event-demo/knight-hacks-demo.html` also renders the dashboard.

```sh
npm run build
npm run preview
```

The production preview runs at `http://127.0.0.1:5174/`. The build output is `dist/`. Serve it with an HTML fallback for the dashboard alias; asset URLs assume hosting at the site root.

## Code map

- `src/main.jsx`: route selection, route-specific styles and React entry point.
- `src/App.jsx`: shared preferences, mascot customization, theme, onboarding and event state.
- `src/Dashboard.jsx`: hacker dashboard, badge and résumé preview dialogs.
- `src/Onboarding.jsx` and `src/Onboarding.css`, `src/Customizer.jsx`: local form and customization drafts, committed through App callbacks.
- `src/Conversation.jsx`, `src/People.jsx`: Hacky conversation, profiles, team/direct chats and contact selection. `src/conversation-model.js` contains demo matching and reply rules.
- `src/Events.jsx`, `src/event-model.js`: event answers, panels, details, recommendations and reminders.
- `src/HackyFilm.jsx`: silent onboarding performance from the supplied `whatAreYouLookingFor.mp4`, with pause and reduced-motion support. The transparent VP9 WebM and PNG poster live in `public/assets/mascots/video/`. Background segmentation uses the original full-width source to preserve the cape; check actual alpha in Chrome with `verification/hacky-transparency-check.js`.
- `src/ui.jsx`: shared icons, mascot, avatars and native dialogs. `src/storage.js`: browser storage, media queries and reply timing.
- `src/event-data.js`, `src/people.js`, `src/mascot-data.js`: event snapshot and demo fixtures. `public/` contains all artwork, fonts and styles needed by this standalone React app. In the full local workspace, those files mirror root `assets/`, `app/*.css`, `event-demo/assets/`, and `event-demo/dashboard.css`; `tests/public-assets.parity.js` checks that copy boundary.

## Demo boundaries

Event information is a curated Knight Hacks IX snapshot with source links, not a live schedule. Source conflicts remain visible in the event details. The repository's `EVENT-DATA.md` records provenance and known conflicts.

People, their synthetic portraits, keyword matching and chat replies are fictional demo fixtures. Messaging and social controls do not establish real connections. No attendee ingestion, personalized ranking, backend or attendee uploads are implemented.

Preferences, mascot style and guidance settings persist in this browser when storage is available. Reminders operate while the page is open; they do not deliver background notifications. The app preserves the original visible preview disclosures.

## Validation

Run `npm test` for event-model invariants, then `npm run build` for the production build. Both commands work from the React-only GitHub checkout or a standalone copy of this directory.

Run `npm run test:asset-parity` separately when the complete, current HTML prototype is present alongside `react/`. This optional check compares asset lists, bytes and styles against the root sources. Those sources are not all included in the React-only branch, so this check is intentionally outside the default test suite. It fails on missing or mismatched sources rather than silently skipping them.

Repeatable browser flows are in `verification/`; run them from the repository root with its configured Playwright CLI and the dev server running. These exercise WebKit emulation, not physical devices.

The conversational onboarding check is `verification/conversational-onboarding-check.js`. It covers the persistent character, tappable motivations and the optional intent free response, Back, saved preferences, completion, and viewport fit.

`verification/onboarding-speech-check.js` checks progressive text, delayed answer reveal, reaction sequencing, preserved choices, skip, and reduced-motion behavior.

`verification/hacky-film-check.js` checks muted playback, pause/resume, free response, and reduced motion. `verification/hacky-transparency-check.js` checks decoded alpha throughout the refined clip in Chrome, including both app themes.
