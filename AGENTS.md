# Find Your Hacker

An AI chat that finds the exact person a hacker needs at a hackathon: a teammate, someone to network with, or a mentor. It learns what they need, searches real profile data, and explains why each match fits. Built at KnightHacks in 36 hours by a team of 3.

The plan (for humans) is at https://claude.ai/artifact/LTzFht4nHYw78N5U2h2G9t. It is the source of truth for scope and decisions. If this file and the plan disagree, ask Ryan.

## Stack

Infrastructure is frozen. Don't propose other databases, auth or realtime services.

- Next.js (App Router, TypeScript) on Vercel
- Supabase: Postgres with pgvector and full-text search, Auth, Realtime. Project ref `rqolxjwqtastnnkkpqum` (ca-central-1)
- AI SDK with `@ai-sdk/google` (Gemini). Model IDs live only in `lib/agent/model.ts`
- Zod for tool inputs and outputs, server actions, launch tickets and seed data
- Tailwind, shadcn/ui and Motion. The Designer owns the look
- `jose` for launch tickets, `qrcode.react` for QR codes

## Folder ownership

```
app/
  e/[slug]/              Builder    event pages: chat/, inbox/, mentors/, teams/
  e/[slug]/u/[handle]/   Builder    profile page (the QR code opens this)
  api/chat/route.ts      Ryan       agent loop
  api/launch/route.ts    Ryan       check hackathon ticket, start session
  auth/confirm/route.ts  Ryan       landing page for email sign-in links
  demo/portal/           Ryan       fake hackathon portal (DEMO_MODE only)
components/
  ui/                    Designer   tokens, primitives, Hacker Card
  features/              Builder    chat cards, inbox, mentor queue
lib/
  agent/                 Ryan       model.ts, prompts, tools (Zod)
  db/                    Ryan       queries, server actions, generated types
  supabase/              Ryan       server and browser clients, realtime hooks
supabase/migrations/     Ryan       the only place the schema changes
seed/                    Ryan       generator, people.json, match-cases.json, reset
styles/                  Designer   global styles and theme variables
public/brand/            Designer   logos and event brand assets
pitch/                   Designer   slides, script, video
```

Only edit folders your person owns. If you need a change in someone else's folder or in a shared contract, tell the owner instead of editing it.

## How to work in this repo

1. Each folder has one job, and its name says what that job is. Don't create folders or abstractions just to look organized.
2. Before reading code, decide what you're looking for. Use search or symbol lookup instead of reading whole folders.
3. Code depends on contracts (generated types, Zod schemas, server action and RPC signatures), never on another module's internals.
4. Each fact lives in one place: the plan, the schema, or this file. Link to it instead of copying it.
5. Add a README only when it explains something the code doesn't make obvious.
6. Stay inside your folders. Report shared changes (schema, contracts, ticket format) to the owner.
7. The plan says what should happen. Existing code only shows what does happen. When they disagree, ask.

## Contracts

Change these only with the owner's agreement.

- **Database schema:** `supabase/migrations/`. Only Ryan writes migrations. Never change the schema in the Supabase dashboard. Types are generated with `supabase gen types` into `lib/db/`.
- **RPCs:** signatures, who may call each one, and what it guarantees. Every RPC is safe to call twice.
- **Tool results and cards:** Zod schemas in `lib/agent/`, including the evidence fields. The chat renders each tool result as a component chosen by tool name (`PersonCard`, `TeamCard`, `MentorCard`, `DraftCard`, `HelpRequestCard`).
- **Server actions:** signatures in `lib/db/`.
- **Launch ticket:** the fields a hackathon signs, defined in `app/api/launch/`.
- **Matching:** the definitions in the plan's Matching section, checked by `seed/match-cases.json` (`pnpm test:match`).
- **Event theme:** `events.theme` holds `brand`, `brandContrast`, `accent`, `surface`, `logoUrl`, `displayFont`. The event layout turns them into CSS variables.

## Security rules

- The service role key is used only in `app/api/launch/` and `seed/`. Never in agent tools or browser code.
- Agent tools use the signed-in user's Supabase session, so row-level security applies to them.
- Every table has RLS. Test each table with two real users as soon as it exists.
- RLS helper functions (`is_event_member`, `is_conversation_member`, `event_role`) live in a private schema the API doesn't expose. They are `security definer` with `search_path = ''`, and execute is revoked from `anon` and `public`.
- Tables that change through RPCs (`connections`, `conversations`, `help_requests`, `blocks`) have no insert, update or delete policies. Messages may be inserted directly by conversation members, with `sender_id = auth.uid()`.
- `embeddings`, `portal_identities`, `event_launch_keys` and `used_tickets` have no client access at all. `request_hides` is readable only by the recipient.
- Tools return only public fields. Embeddings and emails never reach the model or the browser.
- Supabase grants `anon` and `authenticated` access to new tables by default. Every migration that creates a table must revoke `anon` and grant `authenticated` only the reads and column-level writes it needs (see `supabase/migrations/20261010100100_security.sql`).

## Sign-in rules

- Identities link by (event, portal user ID). Never merge accounts by email.
- A ticket only creates or changes membership in its own event, and its signing key must belong to that event.
- Verify tickets with `jose`: ES256 only, expected issuer and audience, not expired. Use up the ticket ID atomically (insert into `used_tickets`; if no row was inserted, reject).
- An admin client generates the sign-in token. A per-request SSR client verifies it and writes the session cookies.
- Every launch step is an upsert, so retrying fixes partial failures. Don't log the launch request body.
- The app always opens in its own tab. Never assume it runs inside an iframe.
- One browser holds one signed-in person. To test multiple users, use separate browser profiles or devices.

## Product rules

- A person's avatar is their customized Hacky character, stored in `profiles.hacky_style` (JSON validated with Zod while the options are still being designed). There are no photo avatars.
- The agent drafts and the user sends. This includes help requests: they reach mentors only when the user taps "Request help". No agent tool may send, accept, block, claim or change roles.
- Match reasons are written only from the evidence fields the search returned. If nothing fits, say so.
- One request per person per event. If two people request each other, both are accepted and one DM opens. Accepting twice returns the same conversation. Only the recipient can accept.
- "Not now" hides a request for the recipient only. Blocking uses the `blocks` table and applies everywhere, in both directions.
- "Contact team" sends a request to the team's owner. Joining teams and team chats are not built.
- Mentor queue: shared, sorted by fit for each mentor. A claim succeeds only while the request is still open.

## Realtime and chat rules

- Realtime only notifies. The database is the source of truth.
- One subscription per open conversation, plus one inbox subscription per user.
- Add rows from the event payload instead of refetching. Skip rows already on screen.
- Sent messages show instantly with a `client_id`. Replace the instant copy when the real row arrives with the same `client_id`.
- Realtime doesn't replay missed events. After a reconnect or when the tab regains focus, fetch what's newer than the last item shown.
- Load the last 30 messages and fetch older ones on scroll. Memoize message rows.

## Other rules

- Components use the theme CSS variables, never hard-coded colors.
- Demo-only code (`/demo/portal`, seed reset) runs only when `DEMO_MODE=true`.
- The seed reset keeps Supabase users, profiles and portal identities, and clears only app data.
- Never commit secrets or `.env*` files.

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
