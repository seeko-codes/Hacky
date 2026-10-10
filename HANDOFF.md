# Hacky development handoff

Start here after a context reset. CORE.md defines the full vision: a phone-first AI companion for relevant person matching and event knowledge. The current prototype demonstrates fictional networking and chats. The core design philosophy is very few details, each exceptionally well executed, with the feel of an installed phone app.

## Read first

1. This project's `AGENTS.md` and any applicable parent instructions for working rules.
2. `CORE.md` for the full vision and `PHILOSOPHY.md` for experience and design principles.
3. `PRODUCT.md` for the confirmed brief and `DESIGN.md` for the incumbent visual system.
4. `CHAT-DECISIONS.md` for the latest conversation decisions, then `PRODUCT-TRANSCRIPT.md` for selected original user statements.
5. This file's implementation and next-step sections, then the actual source.

Preserve the user's philosophy over incidental choices in the current prototype. Intent-based person matching and conversational event information are both core scope; the latter is not implemented yet.

## Repository preparation

GitHub CLI access was verified for `seeko-codes` on 2026-10-10 after the user enabled full access. Earlier DNS, Git metadata, and local-server errors below describe the previous restricted session. Included skills and their host requirements are listed in `.agents/skills/README.md`. Credentials, runtime sessions, and private email receipts are excluded from Git.

## Latest approved detail pass

The user approved the detail board by default and asked for autonomous research, implementation, visual review and refinement. Category visibility is essential: Hacker, Mentor and Sponsor are initial categories, not a final taxonomy. The app now renders explicit category badges across cards, profiles, contacts and chat identities; supports optional `categories` arrays with neutral fallback styles; and offers mixed fictional categories through Meet people.

Changes: consolidated the main stylesheet into phone-first component rules; unified dark plum surfaces and 400/700 font weights; reduced composer size; removed competing chat exits; added in-session drafts and incremental messages with preserved reading position and New reply; restored profile access from chat identity; simplified profile hierarchy and disclosed unavailable links before interaction; added selected checks, disabled unchanged Save, clearer discard copy, sparse stars, and short-phone welcome sizing. Original character art remains intact.

Review-board disposition: NAV-1/NAV-2, MSG-1/MSG-2/MSG-3/MSG-4/MSG-5, CMP-1, CLR-1, ICO-1/TYP-1, PET-1, WEL-1/WEL-2, PPL-1/PPL-2, PRO-1/PRO-2, CUS-1/CUS-2/CUS-3 and ENG-1 implemented. PET-2 retained original artwork as the board recommended pending a separate art decision. CMP-2 physical keyboard/safe-area checks and the remaining A11Y-1 real-device, runtime reduced-motion and 200% text checks are not certified in this environment.

Verification: reproduced draft loss before fixing it. Visible Chrome checks confirmed restored draft, sending and demo reply, reading an older long message without forced scrolling, New reply, mentor/sponsor profiles, mixed categories, saved customization and unchanged Save. Visual review covered light/dark at 393 x 852, 320 x 640, 1280 x 900, and final 390 x 844. Fixed cramped short-phone welcome and wrapping Save label during review. Syntax passed. Ten real foreground/background pairs (body secondary, action and three categories in both themes) exceed 4.5:1. Detector warnings remain intentional Lato and actual pending-operation dots. Saved Playwright checks were updated but could not run: sandbox denied writing its browser daemon cache. Do not claim automated E2E passed.

Lavish poll could not connect/start its server; persisted session had no queued/delivered prompts. The user’s category message and blanket approval were the implementation authority. The separate review HTML is a historical comparison board, not a current app screenshot. Native Chrome preview uses index.html directly because local server binding is denied.

## Implemented frontend

Static HTML, CSS and browser JavaScript. No framework build is needed. `index.html` contains the app shell and demo matching/messaging. `app/hacky.css` owns the shared visual system. `app/hacky-customizer.js` and `app/hacky-customizer.css` own companion selection and motion.

Desktop: collapsible chats on the left, primary finder on the right. Phone: finder with full-screen chats. Team conversation is above the discovered individual contacts. Profiles include role, description, relevance explanation and GitHub/LinkedIn controls. Selecting a person opens a direct conversation. The event entry demo in `event-demo/knight-hacks-demo.html` has a link below the QR code to Hacky.

Six companions: Classic Bot, Mochi, Cyber Cat, Pocket Dragon, Star Sprite and Pixel Pal. Customization offers whole-character tint, flair and motion. Save/cancel and preferences work locally via `hacky-style-v1` in localStorage. Dancing and reduced-motion behavior are implemented.

The current palette uses warm off-white, plum, lavender, and blush, with a warm plum dark mode. DESIGN.md is authoritative for the visual system. The official MLH logo appears in the event area. The user asked for cute, functional branding and playful convention personality while keeping the interface minimal.

## Demo limitations

Profiles are fictional. Matching is a keyword-based simulation with fictional attendees, including five mentors, three hackers, and a sponsor, not a real matching service. Messages and replies are local simulations and are not sent. GitHub/LinkedIn buttons disclose that no accounts are connected. Companion and theme preferences persist across reloads; conversations and discovered contacts are in memory.

Mascots are raster PNG/WebP assets, not editable SVG masters. Tints use CSS filters across the whole character. Animation uses four sprite poses and CSS movement, not a fully authored continuous dance. These are prototype shortcuts, not final production capabilities.

No backend, identity system, live attendee directory, event integration, real messaging, deployment or production ranking is implemented. No production architecture or provider has been chosen.

## Latest completed iteration

The philosophy review broadened the product to finding anyone relevant to an attendee's intent, including teammates, networking, mentors, and sponsors. The intended integration uses existing Knight Hacks application and resume data without a separate Hacky login or onboarding. This remains product direction; no integration or backend has been built.

The app now opens with a clean “Who do you want to meet?” welcome and four optional request shortcuts. The fabricated initial user conversation was removed. After a request the welcome contracts, results lead, and each profile has a “Why this person” explanation plus social access and the accepted personalized cobalt chat action in one footer. A fictional sponsor, Sasha Rivera, illustrates the new sponsor route. Event context and demo disclosure remain visible. A subsequent chat refinement used Linear’s official Agent chat reference: aligned message rows replace DM bubbles, composer borders and radii are quieter, and active chat headers are compact. Each person now has a stable companion PFP across results, contacts, and conversations, including Kai and Lena in team chat. Own-message portraits follow the saved companion and tint without modifying other people’s portraits. Before-files are in `iterations/chat-before-linear/`.

The main companion is now larger and plays one automatic 2.4-second dance on page load after its artwork decodes, then returns to its saved motion. Reduced motion suppresses the greeting. Customization, manual dance, team chat and individual chats remain.

The user wants philosophy interviews focused on central design decisions and routine choices resolved through visual iteration. They explicitly asked to skip headless work during this pass. Do not restart headless troubleshooting without a new request. The user-facing preview was opened in visible Chrome directly from `index.html` because this session could not bind a local server. Originals for this pass are in `iterations/philosophy-pass-before/`.

## Verification

This pass: JavaScript syntax passed. The Impeccable detector identified small caption text, which was raised to 12px. The updated welcome and sponsor result were reviewed in visible Chrome. The later team-chat refinement and sending a demo message were also reviewed in visible Chrome. Headless checks were skipped at the user's request. The saved browser check was updated for the new entry flow and sponsor route, but was not rerun. Existing screenshots and the earlier 20-assertion WebKit result predate this pass. Do not present them as verification of the current UI.

## Preview and test

Probe `http://127.0.0.1:4173/index.html` before starting another server. No running preview server was confirmed in the latest pass; check process state before starting one.

```sh
cd /Users/aatutor/projects/hacky
npm run preview
```

Open the user-facing preview automatically:

```sh
open -a "Google Chrome" http://127.0.0.1:4173/index.html
```

Browser testing and research should stay headless. Working local setup is Playwright CLI with matching WebKit. See `BROWSER-SETUP.md`; avoid installing an unrelated Playwright browser build.

```sh
npx playwright-cli -s=hacky open http://127.0.0.1:4173/index.html
npx playwright-cli -s=hacky run-code --filename verification/browser-check.js
npx playwright-cli -s=hacky close
```

## Impeccable state

The user said “kill the impeccable skill.” Impeccable Live was stopped, its helper on port 8400 shut down, and its injected script removed from `index.html`. No poll remains running. Accepted design changes remain. The skill is installed but inactive; do not restart Live automatically after a context reset.

Installed global skill: `/Users/aatutor/.codex/skills/impeccable/SKILL.md`. Project-local copy: `.agents/skills/impeccable/SKILL.md`. Skill version 4.5.2; pinned helper engine 0.1.14 reports CLI version 4.0.0. The user's confirmed workflow setting is `.impeccable/config.json` with `buildPath: code`. The Live configuration and session journal remain under `.impeccable/live/`.

If the user later requests Live again, read its skill and Live reference, start from this project targeting `index.html`, open the actual app URL in visible Chrome and service the foreground poll throughout the session. Use `live-status` or `live-resume` for recovery. Never leave a poll running unattended. Runtime-rendered profile buttons may need the documented source fallback; the permanent chat-action template is now in HTML.

## How to implement the next changes

1. Reopen the app and assess it against PHILOSOPHY.md, especially the broader networking purpose and phone task flow.
2. Iterate on the welcome and result states with the user. Keep networking, teammates, mentors, and sponsors within the same intent-based finder.
3. Continue refining the existing UI directly when the user requests design changes. Preserve the clean identity and functional structure; avoid drifting into a landing page, dashboard, mascot showcase or decorative convention theme.
4. Before connecting real data, agree on the event/attendee/profile and messaging model. A future matching flow needs actual event membership, skills, interests, attendee intent and mentor availability to support useful explanations. These are proposed implementation concerns, not already decided fields or a chosen backend.
5. Keep fake matches/replies clearly labeled until real services replace them. Do not invent availability, endorsement or social accounts.
6. Validate changed user flows in headless browser testing and open the resulting preview for the user.

## Workflow preferences

- Apply authorized UI refinements without repeated permission questions. User iterates by viewing and steering changes.
- Open every user-facing web preview in visible Google Chrome automatically. Chrome is not confirmed as the OS default.
- Reveal delivered files in Finder automatically.
- Launch any delegated agents through Herdr, not harness subagents. Read `herdr --skill` and CLI help first. Official source: `https://github.com/herdrdev/herdr`. Do not spoof environment flags or claim delegated work happened when it did not.
- Keep all Hacky project data here. Preserve original artwork and previous iterations.
- Never use the em dash. Do not add agent coauthors to commits or edit autogenerated files/CHANGELOG manually.

## Existing companion handoff

`deliverables/hacky-mascot-handoff-2026-10-09.zip` contains originals, lossless WebPs, a reference board and production guidance for Higgsfield. `deliverables/mascot-handoff-2026-10-09/` is the unpacked version. The requested email was sent; its receipt is in `deliverables/mascot-email-receipt-2026-10-09.json`. Do not resend without a new request.

Earlier storage/RAM cleanup is a separate completed task. Do not restart deletion or terminate dictation processes as part of Hacky development. Handy was explicitly kept running. Any cleanup history or backup paths should be inspected separately only if the user resumes that task.

## Prompt after resetting context

“Continue Hacky in /Users/aatutor/projects/hacky. Read HANDOFF.md, PHILOSOPHY.md, PRODUCT.md, DESIGN.md and AGENTS.md before editing. Preserve the minimal phone-app philosophy and general hackathon networking purpose. Impeccable Live is stopped; do not restart it unless I ask. Open previews in Chrome and apply authorized design refinements directly.”

Latest portrait refinement: face-focused circular crops replace tiny full-body sprites. Attendee look/tint/background are in `companionPortraits` in index.html; per-look crop variables are in `app/hacky.css`. Group icon now uses Kai and Lena portraits. Saved self customization updates its data-look as well as tint. Desktop screenshot exposed a group portrait/header overlap, fixed by reserving a 44px group footprint.

Mobile is now explicitly primary. Verified in visible Chrome at 390x844: full-screen team chat, sender portraits including saved self look, local message submission, finder matches, and opening Mika’s conversation. Mobile sidebar is full width; direct-message header is one row instead of two stacked bars. Real device keyboard behavior is not yet tested.

Recommendation redesign: `.match` buttons show only identity/category/specialty. `openProfile` fills `#person-dialog` with details and expands from the selected card; Back/Escape restores focus and scroll; Message opens that person’s chat. Five fictional mentors and three teammates demonstrate multiple cards. Reviewed mobile cards and expanded profile at 390x844, checked Back and a second person’s profile-to-chat route. Updated saved browser-check selectors for this flow but did not run headless checks. Suggested future cleanup, not applied: move companion controls out of active finder results; reveal chat biography/socials only by tapping chat identity.

Latest visual exploration: locally hosted Lato regular/bold (`assets/fonts/` with OFL license) replaces the platform sans. Recommendation and expanded-profile avatars show full first-pose character silhouettes, no circular crop/background; chat face crops remain for small-size readability. Reviewed 390x844 screenshots of five mentor cards and Noah’s expanded profile. The detector flags Lato as a common font; this is an intentional trial chosen for the user’s request for a warmer font direction.

Theme iteration: early theme bootstrap in index.html avoids a wrong-theme flash, follows system appearance until a manual selection, and saves hacky-theme locally. Header sun/moon toggles without resetting chats or results. CSS tokens cover both modes, including customizer, dialogs, badges, disabled controls, and composer. Reviewed 390x844 screenshots of both welcome themes, light recommendations, dark expanded profile, and dark chat. Syntax and text/action contrast checked. Following user clarification, visually researched Gumroad, Poolside, and Teenage Engineering; lime actions and split ink/accent welcome heading reflect those references. Headless testing remains skipped.

Chat preservation completed October 10, 2026: CHAT-DECISIONS.md consolidates the latest user direction, current changes, limitations, verification, and pending suggestions. PHILOSOPHY.md and PRODUCT.md now reflect progressive disclosure, distinct character portraits, phone-first full-screen chats, light/dark mode, and the intended focused clarification plus multiple-match flow.

October 10 expressive pass: phone-first review at 390 x 844 is now explicit in AGENTS.md. Fixed broken attendee portraits by resolving URLs against document.baseURI (Chrome showed app/assets/... ERR_FILE_NOT_FOUND). Welcome shortcuts now use character silhouettes. Native CSS/JS effects inspired by React Bits add split-line heading entrance, a lime companion stage, staggered recommendation entrances, and desktop pointer spotlights. Reviewed both welcome themes at 390 x 844; images rendered and console was clear after reload. Script syntax passed; detector only reports the existing Lato choice. Further profile-to-chat verification was interrupted by native browser control reporting elementHasNoFrame/noWindowsAvailable. Do not claim a full E2E pass.

Current direction supersedes the electric exploration: cute and functional, warm white/plum/lavender palette, pale blush companion backdrop, character-led shortcuts. Removed lightning branding, neon, orbit lines, spotlight effects, and heading/card entrance animations. Saved sparks flair becomes stars. DESIGN.md is the current visual authority.

Latest detail pass: reviewed React Bits Click Spark and Animated Content as inspiration for native CSS/JS interactions. Consistent small-control icons and press states, customization selection dots, brief dance-star twinkles, pending finder dots, and new-message arrival feedback are implemented. Existing chat history does not animate on reopening. Reviewed in visible Chrome at iPhone 16 dimensions (393 x 852): sent a local message, observed its demo reply, inspected customization, saved Hacky, and triggered Dance. JavaScript syntax passed. Reduced-motion overrides cover the new effects in code; runtime reduced-motion testing was not performed. Headless browser startup was blocked in this environment. Detector warnings are the intentional Lato font and the actual pending-operation loading dots.
