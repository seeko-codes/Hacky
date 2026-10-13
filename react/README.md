# Hacky web app

The Vite + React front end for [Hacky](../README.md). It is a client of the Hono API in `server/`: sign-in, profiles, matching, the agent chat, requests, DMs and the mentor queue all come from `/api`. The browser never talks to the database.

Two guides cover the wiring, so this file doesn't repeat them:

- [docs/frontend.md](../docs/frontend.md): every route the app calls, in order, with the live-update rules
- [docs/chat.md](../docs/chat.md): how the agent chat streams and how `useChat` is set up

## Run

The app needs the API running. From the repo root, `npm install` and `npm run dev:api` (see the [root README](../README.md#run-it-locally) for `.env.local`). Then, from this directory:

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`, not `localhost`: the session cookie is tied to `127.0.0.1`. Vite proxies `/api` to `http://localhost:8787`.

`/` redirects to the demo user picker at `/api/demo/portal` (`DEMO_MODE=true` only). Picking a person signs in and opens Hacky at `/index.html?onboarding=1&event=<slug>`. `/index.html` opens Hacky directly for whoever is signed in. One browser holds one signed-in person; use two browser profiles to test two people.

```sh
npm run build
npm run preview
```

The build output is `dist/`, which Vercel serves as static files. The preview runs at `http://127.0.0.1:5174/` and proxies `/api` the same way.

## Code map

- `src/main.jsx`: entry point. Redirects `/` to the demo picker, otherwise mounts the app inside `SessionProvider`.
- `src/session.jsx`: who is signed in and which event they're in, loaded once from `/api`. `src/api.js`: the one way the app calls the backend.
- `src/App.jsx`: onboarding, customizer, theme and event state around the conversation.
- `src/Onboarding.jsx`, `src/welcome.js`, `src/entry.js`: the welcome flow, when it shows, and the links into it.
- `src/Customizer.jsx`, `src/mascot-data.js`: the knit Hacky avatar's colors, flair and moves, saved to the profile.
- `src/Conversation.jsx`, `src/People.jsx`, `src/ProfileEditor.jsx`: the main layout, profile dialogs and profile editing.
- `src/hacky/`: the agent chat.
  - `useHackyChat.js`: stored history plus `useChat`.
  - `HackyPane.jsx`, `Brief.jsx`: the thread, the composer and Hacky's opening card.
  - `cards.jsx`: text bubbles, answer chips and one card per tool result, chosen by tool name.
  - `presentation.js`, `reveal.js`, `useReveal.js`: display-only bubble splitting and the pacing of a new reply.
  - `rich.js`: the small markup replies may use (bold and bullet lists), parsed without injecting HTML.
- `src/social/`: requests, DMs and mentor help.
  - `useSocial.js`: the Chats sidebar's data and the one live-updates socket.
  - `live.js`: the WebSocket client (token refresh, reconnect, polling fallback).
  - `messages.js`: pure thread helpers. `Lists.jsx`, `Thread.jsx`, `parts.jsx`: the UI.
- `src/Events.jsx`, `src/event-model.js`, `src/event-data.js`, `src/sponsor-model.js`: the event schedule, reminders and sponsor answers. This data is a static snapshot in the app, by design.
- `src/HackyFilm.jsx`: Hacky's clips (onboarding, chat intro, thinking) as animated WebP with alpha, the one format that stays transparent in iOS Safari as well as Chrome and Firefox. Reduced motion shows the PNG poster. The clips, their VP9 WebM sources and the posters live in `public/assets/mascots/video/`.
- `src/ui.jsx`: shared icons, mascot, avatars and dialogs. `src/storage.js`: browser storage and media queries. `src/labels.js`: how skill tags and chips read on screen.
- `src/Dashboard.jsx`, `src/dashboard-model.js`: the Knight Hacks dashboard clone. Preserved but inactive; nothing mounts or links to it.

## What is real and what is static

People, teams, mentors, matching, match reasons, requests and messages come from the API and the database. The profiles themselves are seeded demo data (`seed/` at the repo root), and with `DEMO_MODE=true` requests are auto-accepted after about two seconds so a demo works on one device.

The event schedule, sponsor info and reminders are a curated Knight Hacks IX snapshot in `src/event-data.js`, not a live feed. Reminders work while the page is open; there are no background notifications.

Onboarding answers, the avatar and the chat thread are saved on the server. A few display preferences (hidden chats, whether the welcome was seen) stay in the browser.

## Validation

```sh
npm test         # node --test over tests/*.test.js; no API or database needed
npm run build
```

`npm run test:asset-parity` compares `public/` against the original HTML prototype's assets. Those sources aren't in this repo, so it is outside the default suite and fails here.

Browser flows live in `verification/`. Run them from the repo root with Playwright and the dev server running; most use fixture API responses, so they don't write to the database. They exercise browser emulation, not physical devices.
