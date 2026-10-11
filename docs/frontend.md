# Wiring the web app to the API

How `react/` talks to the backend. Every route and shape is in `shared/contract.ts` (the `endpoints` object). This file covers the order to wire things in and the rules that aren't obvious from the shapes. The chat has its own guide: `docs/chat.md`.

## Setup

1. At the repo root: `npm install`, get `.env.local` from Ryan (never commit it), then `npm run dev:api`. `http://localhost:8787/api/health` should say `ok`.
2. In `react/`: `npm install`, then `npm install ai@7.0.137`. It must match the root's `ai` version, because `@ai-sdk/react` only pulls it in indirectly. Then `npm run dev`.
3. Open **`http://127.0.0.1:5173`**, not `localhost`: the session cookie is tied to `127.0.0.1`.
4. Sign in at `http://127.0.0.1:5173/api/demo/portal` and pick anyone. To test two people at once, use two browser profiles. One browser holds one person.

## Calling the API

- Use relative paths like `fetch('/api/me')`. Never hardcode `localhost:8787`. Vite proxies `/api` in dev, and on Vercel it's the same domain, so the cookie goes along with the default fetch settings.
- Send JSON with `Content-Type: application/json`.
- Every error is `{ error: { code, message } }`. Show `message`: it's written for users. The codes:

  | Code | Status | When |
  |---|---|---|
  | `unauthorized` | 401 | Not signed in. Send them to the portal. |
  | `forbidden` | 403 | Not in the event, or blocked. |
  | `not_found` | 404 | Also used when a block hides someone. |
  | `invalid` | 400 | The body failed validation. |
  | `conflict` | 409 | Already requested, or already claimed. |
  | `rate_limited` | 429 | Limit reached. |
  | `internal` | 500/503 | Server error. |

- You don't have to import `shared/contract.ts`; reading it is enough. If you do import it, add `server: { fs: { allow: ['..'] } }` to `vite.config.js`. The file sits outside `react/`.

## 1. Boot

1. `GET /api/me` returns `{ profile, events }`. On 401, show a "Sign in" link to `/api/demo/portal`.
2. Pick the event: `events[0].slug` (`knighthacks-ix`). `demo-hacks` is the second event for the theme switch.
3. `GET /api/events/:slug` returns the name, `theme` (turn it into CSS variables) and `tracks`. It's public.
4. `GET /api/events/:slug/me` returns your membership plus `intake` (skills, goal, motivations, idea, `complete`, ...).

## 2. Onboarding and avatar (replace the localStorage versions)

- **When to show onboarding:** when `intake.motivations` is empty and `intake.idea` is null, meaning they've never answered.
- **On complete:** `PATCH /api/events/:slug/me` with `{ motivations, idea }`.

  | Onboarding choice | `motivations` id |
  |---|---|
  | Build a project | `build` |
  | Learn new skills | `learn` |
  | Meet people | `meet` |
  | Career opportunities | `career` |
  | Compete for prizes | `compete` |
  | Have fun | `fun` |

  The free text goes in `idea` (at most 2000 characters, or `null` if empty). Don't send the combined `goal` string: `goal` is one of `win | learn | ship`, and Hacky asks for it in chat.
- **On skip:** send nothing.
- **Customizer:** load from `me.profile.hackyStyle`, filling missing keys with the defaults in `mascot-data.js`. On save, `PATCH /api/me/profile` with `{ hackyStyle: { look, color, flair, move } }`. Every person's avatar is `person.photoUrl` when it's set, otherwise their Hacky from `person.hackyStyle` (see Product rules in `AGENTS.md`).

## 3. Chat

`GET /api/events/:slug/chat` returns `{ messages }`. After it loads, mount `HackyChat` from `docs/chat.md`. Chips answer with `addToolOutput({ ..., output: { answer } })`.

Cards are chosen by tool name. The shapes are in `contract.ts` under `toolOutputs`.

- **`search_people`:** `{ status: 'matches', cards }` (strong fits), `{ status: 'closest', cards, note }` (no strong fit: 1–3 nearest, shown with `note` above them and a "Closest fit" tag on each), or `{ status: 'noMatch', reason }` (no one at all).
  - Each card is `card: 'person' | 'team' | 'mentor'`, with evidence (why it fits). A closest card's `reason` says what they bring and what they don't list.
  - "View" calls `GET /api/events/:slug/people/:handle`. Its `relation.state` (`none | outgoing | incoming | accepted`) decides the button: Request, Pending, Accept or Message.
- **`draft_intro`:** an editable `DraftCard`.
  - **Send** calls `POST /api/events/:slug/requests` with `{ toUserId: to.userId, intro, source, teamId: team?.id }`.
  - If the returned `request.status` is `accepted` (they had already requested you), open `request.conversationId`.
  - Intros are 1–500 characters with no links.
- **`draft_help_request`:** a `HelpRequestCard`. **Request help** calls `POST /api/events/:slug/help-requests` with `{ title, details, skillsNeeded }`. It returns 429 when they already have 3 waiting.
- **`my_status`:** a `StatusCard` showing incoming and outgoing requests, connection count, team, and help requests.
- **`get_profile`:** a `PersonDetail`, the same shape as the people route.

The agent never sends anything. Only these buttons do.

## 4. Requests

- `GET /api/events/:slug/requests` returns `{ requests }`. Each has `direction: incoming | outgoing`, `person`, `intro`, `team`, `status` and `conversationId`.
- **Accept:** `POST /api/requests/:id/accept` returns the request with its `conversationId`. Only the recipient sees this button.
- **Not now:** `POST /api/requests/:id/hide`. The request gets `hiddenAt`, which only the recipient sees. Fold those away. The sender still sees "pending".
- **Block:** `POST /api/blocks` with `{ userId }`. It's silent: the other person isn't told, and the DM disappears for both.

## 5. DMs

- **List:** `GET /api/events/:slug/conversations` returns `peer`, `kind` (`dm | mentor`), `lastMessage`, `unreadCount`, and `helpRequest` for mentor chats. There are no read receipts.
- **Load messages:**
  - Open a chat with `GET /api/conversations/:id/messages?limit=30`. Messages come oldest first, with `hasMore`.
  - On scroll up: `?before=<oldest id>`.
  - To catch up: `?after=<newest id>`.
- **Send:** `POST /api/conversations/:id/messages` with `{ clientId: crypto.randomUUID(), body }`.
  - Show it right away. Replace it when the response, or a live `message-new` with the same `clientId`, arrives.
  - Retrying with the same `clientId` is safe; it won't duplicate.
  - 403 means you can't message this person.
- **Mark read:** `POST /api/conversations/:id/read` while the chat is open and the tab is visible.
- **System messages:** `kind: 'system'` (with `senderId: null`), such as "resolved". Render them centered, not as a bubble.
- Memoize message rows.

## 6. Mentor help

- `GET /api/events/:slug/help-queue` returns `{ open, mine }`.
  - `open` is the shared queue, sorted by fit. It's only filled for verified mentors.
  - `fit.highlighted` marks this mentor as a top fit; give it a badge.
  - `mine` is what I asked for, or what I claimed.
- **Claim:** `POST /api/help-requests/:id/claim` returns `helpRequest.conversationId`, so open the mentor chat. A 409 means someone else got it first: refetch the queue.
- **Resolve:** `POST /api/help-requests/:id/resolve` (the hacker or the mentor who claimed it). It posts a system message in that chat.
- Only hackers can ask for help.
- A mentor with `availability: 'offline'` can't claim. They toggle it with `PATCH /api/events/:slug/me` and `{ availability: 'available' | 'busy' | 'offline' }`.
- There's no cancel yet.

## 7. Live updates

1. `POST /api/realtime/token` with `{ eventSlug }` returns `{ token, url, expiresAt }`.
   - On 503, live updates aren't set up. Poll the lists every ~10 s instead.
2. Open `new WebSocket(url + '?token=' + encodeURIComponent(token))`. Use `new URL(url)` plus `searchParams.set` if `url` already has a query.
3. Each frame is JSON:
   - `{"type":"ping"}` every 25 s: ignore it.
   - Or a live event:
     - `message-new` (`message`): add it to an open chat if not already there (match `id`, or `clientId` for your own), and bump that conversation's unread and last message.
     - `request-new` / `request-updated` (`request`): update the requests list. An accepted one has a `conversationId`.
     - `help-new` (`helpRequest`, `fit`): add it to the mentor queue.
     - `help-claimed` (`helpRequest`): remove it from the queue, and update `mine`.
4. Reconnect rules:
   - **Close code 4001:** the token expired. Get a new one and reconnect.
   - **Close code 4011:** the database is down. Reconnect with backoff (2 s, 4 s, 8 s, ... up to 30 s) and poll meanwhile.
   - **Any other close or `error`:** treat it as closed and reconnect with backoff.
   - **Token expiry:** tokens last 10 minutes. Swap in a fresh token and socket about 60 s before `expiresAt`.
   - **Silence:** with no frame at all for 40 s, the socket is dead even if `close` never fired. Close it and reconnect.
5. On every `open`, and when the tab regains focus:
   - fetch `?after=<newest id>` for the open chat;
   - refetch requests, conversations and the help queue.

   Live updates only notify. The API is the truth.
