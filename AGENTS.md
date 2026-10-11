# Hacky

An AI chat that finds the exact person a hacker needs at a hackathon: a teammate, someone to network with, or a mentor. It learns what they need, searches real profile data, and explains why each match fits. Built at KnightHacks in 36 hours by a team of 3.

The plan (for humans) is at https://claude.ai/artifact/LTzFht4nHYw78N5U2h2G9t. It is the source of truth for scope and decisions. If this file and the plan disagree, ask Ryan.

## Stack

Infrastructure is decided. Don't propose other databases, hosting, auth or realtime services.

- **Web app:** Vite + React in `react/`, deployed on Vercel as static files
- **API:** Hono in `server/`, deployed on Vercel as one function under `/api` (same domain as the web app, so cookies just work)
- **Database:** Neon Postgres with pgvector and full-text search. Project `Hacky` (`weathered-salad-48805475`, aws-us-east-1), branch `production`
- **Database access:** Drizzle ORM over Neon's serverless driver (HTTPS/WebSocket, so it works on networks that block Postgres ports)
- **Auth:** Better Auth, self-hosted in `server/`, tables in Neon
- **Live updates:** a Neon Function (WebSockets) in `functions/`. Fallback: the web app polls `/api`
- **AI:** AI SDK with `@ai-sdk/google` (Gemini). Model IDs live only in `server/agent/model.ts`
- **Contracts:** Zod for tool inputs and outputs, API request and response bodies, launch tickets and seed data
- `jose` for launch tickets and live-update tokens, `qrcode.react` for QR codes

## Folder ownership

```
react/                   Builder + Designer   the web app (Vite + React)
api/index.ts             Ryan       Vercel entry; hands every /api request to the Hono app
server/
  app.ts                 Ryan       Hono app: session middleware, error mapping, mounts routes/
  routes/                Ryan       one file per area (me, events, chat, requests, conversations, help, realtime, demo)
  social/                Ryan       requests, blocks, conversations and help: the rule-enforcing server functions
  matching/              Ryan       hybrid search + scoring (`npm run test:match` checks match-cases.json)
  db/schema.ts           Ryan       Drizzle schema: the only place the schema changes
  db/index.ts            Ryan       database client (HTTP driver, one query at a time)
  db/tx.ts               Ryan       withTransaction (WebSocket driver) for read-decide-write work
  agent/                 Ryan       model.ts (the only place with model IDs), prompts, tools, data, history
  auth.ts                Ryan       Better Auth config
shared/contract.ts       Ryan       Zod schemas for every API route, agent card and live-update message
docs/chat.md             Ryan       how the chat streams end to end (server + useChat in react/)
docs/frontend.md         Ryan       how react/ calls every route: order, buttons, live-update client rules
functions/realtime.ts    Ryan       Neon Function: the live-update WebSocket
drizzle/                 Ryan       generated SQL migrations and their journal
seed/                    Ryan       generator, people.json, match-cases.json, reset
pitch/                   Designer   slides, script, video
neon.ts                  Ryan       Neon services and branch policy
vercel.json              Ryan       build settings and /api routing
```

Only edit folders your person owns. If you need a change in someone else's folder or in a shared contract, tell the owner instead of editing it.

## How to work in this repo

1. Each folder has one job, and its name says what that job is. Don't create folders or abstractions just to look organized.
2. Before reading code, decide what you're looking for. Use search or symbol lookup instead of reading whole folders.
3. Code depends on contracts (Zod schemas, API routes, Drizzle types), never on another module's internals.
4. Each fact lives in one place: the plan, the schema, or this file. Link to it instead of copying it.
5. Add a README only when it explains something the code doesn't make obvious.
6. Stay inside your folders. Report shared changes (schema, API contracts, ticket format) to the owner.
7. The plan says what should happen. Existing code only shows what does happen. When they disagree, ask.

## Running locally

- `npx neon@latest env pull` writes `DATABASE_URL` and the other Neon variables into `.env.local` (git-ignored). The Neon CLI runs through `npx`; there's no global install.
- `npm install`, then `npm run dev:api` starts the API at `http://localhost:8787/api`. Check it with `/api/health`.
- `cd react && npm install && npm run dev` starts the web app. Open it at `http://127.0.0.1:5173` (not `localhost`: `BETTER_AUTH_URL` uses `127.0.0.1`, and the cookie is tied to that host). Vite proxies `/api` to `http://localhost:8787`.
- With `DEMO_MODE=true`, `http://127.0.0.1:5173/api/demo/portal` signs you in as any seeded person.
- `npm run typecheck` checks the backend TypeScript.

## Database changes

- Edit `server/db/schema.ts`, run `npm run db:generate`, read the generated SQL in `drizzle/`, then `npm run db:migrate`. Only Ryan does this.
- SQL Drizzle can't express (extensions, triggers) goes in a custom migration: `npx drizzle-kit generate --custom --name=<what>`.
- Never change the schema in the Neon console. Never edit a migration that has already been applied.

## Contracts

Change these only with the owner's agreement.

- **Database schema:** `server/db/schema.ts` and the migrations in `drizzle/`.
- **API:** every route, with its Zod request and response schemas, is listed in `shared/contract.ts`. `server/app.ts` implements them; the web app calls only these.
- **Chat:** `POST /api/chat` takes `{ eventSlug, message }` (only the newest message; the server loads history itself) and streams an AI SDK UI message stream. `docs/chat.md` explains the server side and `useChat` in the web app.
- **Tool results and cards:** Zod schemas in `shared/contract.ts` (`toolOutputs`), including the evidence fields. The chat picks a component by tool name: `search_people` (person, team or mentor cards, or no match), `get_profile`, `draft_intro` (`DraftCard`), `draft_help_request` (`HelpRequestCard`), `my_status` (`StatusCard`). `ask_with_options` is answered in the UI with `{ answer }`.
- **Live-update messages:** the payload schemas in `shared/contract.ts`.
- **Launch ticket:** the fields a hackathon signs, defined with the launch route.
- **Matching:** the definitions in the plan's Matching section, checked by `seed/match-cases.json`.
- **Event theme:** `events.theme` (JSON). The web app turns it into CSS variables.

After changing tool or card schemas in `shared/contract.ts`, run `npm run check:threads`. It validates every saved chat thread the way `POST /api/chat` does; a stored message that fails is dropped from the model's memory.

## Security rules

- The browser never talks to the database. Every read and write goes through `/api`.
- Every API route that touches user data requires a Better Auth session and checks that the user belongs to the event.
- Agent tools run as the signed-in user: they receive the user's id from the session and reuse the same server functions as the API. The model can never choose whose data to read or write.
- Requests, conversations, help requests and blocks change only through server functions that run in one transaction and enforce the rules (limits, who may accept or claim). The database constraints back them up.
- API responses and tool results contain only public fields. Embeddings and emails never reach the model or the browser.
- Secrets live only in environment variables (`.env.local` locally, Vercel and Neon settings in the cloud). Never commit them.

## Sign-in rules

- Better Auth sessions are cookies on our domain. The web app and the API share that domain, so no CORS or third-party cookies are needed.
- Launch: the hackathon's server signs a ticket, the browser posts it to the launch route, we verify it and start a Better Auth session. No login screen.
- Identities link by (event, portal user ID). Never merge accounts by email.
- A ticket only creates or changes membership in its own event, and its signing key must belong to that event.
- Verify tickets with `jose`: ES256 only, expected issuer and audience, not expired. Use up the ticket ID atomically; if it was already used, reject.
- Every launch step is an upsert, so retrying fixes partial failures. Don't log the launch request body.
- Coming back on a new device: the hackathon's button again, or an email sign-in link (Better Auth magic link) for people who already launched once.
- The app always opens in its own tab. Never assume it runs inside an iframe.
- One browser holds one signed-in person. To test multiple users, use separate browser profiles or devices.

## Product rules

- A person's avatar is their profile photo (`profiles.photo_url`, an `/assets/...` path or an https URL, sent as `photoUrl`) when they have one. Otherwise it's a knit Hacky picture chosen from `profiles.hacky_style` (JSON validated with Zod while the options are still being designed). There's no photo upload yet.
- The agent drafts and the user sends. This includes help requests: they reach mentors only when the user taps "Request help". No agent tool may send, accept, block, claim or change roles.
- Match reasons are written only from the evidence fields the search returned. If nothing fits, say so.
- One request per person per event. If two people request each other, both are accepted and one DM opens. Accepting twice returns the same conversation. Only the recipient can accept.
- "Not now" sets `connections.hidden_at`. The API shows it only to the recipient; the sender keeps seeing "pending". Blocking uses the `blocks` table and applies everywhere, in both directions.
- Open teams appear in search as team cards. "Contact team" sends a request (with `team_id`) to the team's owner. Joining teams and team chats are not built.
- Onboarding: the form's answers (including the six motivations) fill the member profile, its last step customizes the Hacky avatar, and the agent only asks for what's still missing.
- Event schedule, sponsor info and reminders stay static in the web app, and the chat agent answers event questions from `server/agent/event-guides/<slug>.md`. There are no read receipts; unread badges come from `last_read_at`. Resolving a help request posts a system message in the mentor chat.
- Mentor queue: shared, sorted by fit for each mentor (`fit.highlighted` marks the strong fits). A claim succeeds only while the request is still open. A hacker can have at most 3 requests waiting for a mentor. There is no cancel yet.
- A block hides the conversation from both people's lists, and sending into it returns 403.

## Live updates and chat rules

- Live updates only notify. The database is the source of truth.
- The web app gets a short-lived signed token from `/api` and opens a WebSocket to the Neon Function with it (browsers can't send auth headers on WebSockets). The function checks the token before sending anything.
- The function finds new rows by polling Postgres. If the WebSocket fails, the web app polls `/api` instead.
- Each text frame is one `LiveEvent` (`message-new`, `request-new`, `request-updated`, `help-new`, `help-claimed`) or `{"type":"ping"}` every 25 s, which the client ignores. Close code 4001 means the token expired: get a new token and reconnect. 4011 means the database is unavailable: reconnect with backoff or poll.
- Tokens last 10 minutes. Reconnect with a fresh token about 60 s before `expiresAt`, and after 40 s with no frame at all (the socket is dead even if `close` never fired). Treat `error` as closed.
- Add rows from the event payload instead of refetching. Skip rows already on screen.
- Sent messages show instantly with a `client_id`. Replace the instant copy when the real row arrives with the same `client_id`.
- Connections drop (idle timeouts, restarts). On every `open` and when the tab regains focus, fetch messages `after` the last one shown, and refetch requests and the help queue.
- Load the last 30 messages and fetch older ones on scroll. Memoize message rows.

## Other rules

- Components use the theme CSS variables, never hard-coded colors.
- Demo-only code (the demo portal, seed reset) runs only when `DEMO_MODE=true`.
- The seed reset keeps users, profiles and portal identities, and clears only app data, so demo devices stay signed in.

## Priorities

Build in this order. Each item should work end to end before the next gets serious time.

1. **Required:** demo portal launch and saved session
2. **Required:** short intake, then matching with evidence-backed cards
3. **Required:** draft, send request, accept, DM between two devices
4. **Next:** mentor help request, claim and chat
5. **Optional:** QR connect and the second-event theme switch. Cut these first if behind at H24.

Not built this weekend: joining teams, team chats, sponsor search, push/email/SMS alerts, voice and video, announcements, Sign in with MLH, account linking across hackathons, an organizer dashboard, a native app.

Feature freeze is at H28. After that, fixes only.

## Embeddings

Gemini `gemini-embedding-001` at 768 dimensions, so vector columns are `vector(768)`. Normalize vectors before storing them. Switching models later means a migration and re-embedding everything.

## Git

Keep pull requests small and merge into `main` several times a day. Every PR gets a Vercel preview.
