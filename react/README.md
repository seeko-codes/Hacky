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
- `src/Onboarding.jsx`, `src/Customizer.jsx`: local form and customization drafts, committed through App callbacks.
- `src/Conversation.jsx`, `src/People.jsx`: Hacky conversation, profiles, team/direct chats and contact selection. `src/conversation-model.js` contains demo matching and reply rules.
- `src/Events.jsx`, `src/event-model.js`: event answers, panels, details, recommendations and reminders.
- `src/ui.jsx`: shared icons, mascot, avatars and native dialogs. `src/storage.js`: browser storage, media queries and reply timing.
- `src/event-data.js`, `src/people.js`, `src/mascot-data.js`: event snapshot and demo fixtures. `public/`: existing artwork, fonts and styles.

## Demo boundaries

Event information is a curated Knight Hacks IX snapshot with source links, not a live schedule. Source conflicts remain visible in the event details. The repository's `EVENT-DATA.md` records provenance and known conflicts.

People, their synthetic portraits, keyword matching and chat replies are fictional demo fixtures. Messaging and social controls do not establish real connections. No attendee ingestion, personalized ranking, backend or attendee uploads are implemented.

Preferences, mascot style and guidance settings persist in this browser when storage is available. Reminders operate while the page is open; they do not deliver background notifications. The app preserves the original visible preview disclosures.

## Validation

Run `npm test` for event-model invariants and `npm run build` for the production build. Repeatable browser flows are in `verification/`; run them from the repository root with its configured Playwright CLI and the dev server running. These exercise WebKit emulation, not physical devices.
