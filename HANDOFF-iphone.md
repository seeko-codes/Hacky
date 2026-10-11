# Handoff: make Hacky look and work right on iPhone

Temporary working note. Don't commit it; delete it when the task is done.

## The task (from Ryan)
On a real iPhone, Hacky must look exactly like it does on the desktop site. Two bugs:
1. **The animated Hacky clips show a box behind the character.** For example, the dragon above "What can I help you with?" shows streaky colors or a white box instead of a transparent background.
2. **Tapping the "Ask Hacky…" text box breaks the layout.** The composer jumps to the top of the screen, and the chat area disappears behind the keyboard.

## Setup
- **Repo:** `/Users/ryanrodriguez/Desktop/Hacky`, with the web app in `react/` (Vite + React 19, JSX). Read `AGENTS.md`.
- **Dev servers** come from `/Users/ryanrodriguez/Desktop/Donna/.claude/launch.json`; start them with the Browser `preview_start` tool by name:
  - `hacky-api`: port 8787.
  - `hacky-web`: port 5173. It's currently `npx vite --host :: --port 5173 --strictPort`, so it listens on IPv6 and IPv4 for phone access.
- **Phone access:**
  - The Mac is on Ryan's iPhone hotspot, which is IPv6-only (T-Mobile style), so the phone reaches it at `http://[2607:fb91:18a6:4726:c3f:aea4:751d:bc5a]:5173/api/demo/portal`. Re-check with `ifconfig en0 | grep "inet6 2607"`.
  - The address changes if the Mac reconnects. Then restart `hacky-api`, because `server/auth.ts` builds its trusted dev origins from the Mac's network addresses at startup.
- **Sign-in:** on the demo portal (`/api/demo/portal`), tap **Find your Hacker** next to a person. That signs in and opens the dashboard; then tap **Use Hacky**, or open `/index.html`.
- **Accounts:**
  - Don't use `demo_you`; Ryan is using it.
  - The test account is `demo_kiran_audio`. A snapshot to restore him from is at `/private/tmp/claude-501/-Users-ryanrodriguez-Desktop-Donna/c4ae0bde-b920-4d87-938b-59d7a8b53e01/scratchpad/chat-test/kiran-before.json` (fields `mp`, `emb`, `eventId`). Restoring means deleting his `agent_messages` and any connections, then restoring his `member_profiles` row and embedding.
- **iOS Simulator:** iPhone 17, UDID `0E0CF91A-60B1-473A-8015-7E215EA5FD89`, is booted. Drive it with the `mcp__Claude_Code_iOS_Simulator__control` tool (tap, swipe, screenshot, open_url). Simulator Safari reaches the Mac at `http://127.0.0.1:5173`.

## Bug 1: no transparency on iPhone (in progress)

**How the clips work now:**
- `react/src/HackyFilm.jsx` plays three clips through `<video>`:
  - `ONBOARDING_CLIP`: `hacky-onboarding-smooth.*`, on the onboarding screen;
  - `CHAT_CLIP`: `hacky-chat.*`, the dragon in the chat intro (`react/src/hacky/Brief.jsx`);
  - `THINKING_CLIP`: `hacky-thinking.*`, the waiting animation in `react/src/hacky/HackyPane.jsx`.
- The files are in `react/public/assets/mascots/video/`: `.webm` (VP9 with alpha), `.mov` (HEVC with alpha, made with ffmpeg `hevc_videotoolbox`) and a `.png` poster.
- The component gives WebKit-only browsers the `.mov` and everyone else the `.webm`.

**Findings:**
- **Detection is working.** A debug page on iOS 26.2 Safari showed it picks the `.mov`, and `canPlayType` for WebM VP9 is empty, so iPhone Safari can't play WebM at all.
- **The iPhone ignores the `.mov`'s alpha.** On Ryan's real iPhone it plays but shows the hidden colors (the streaks), while Mac Safari renders the same file transparent. HEVC alpha isn't reliable for us on iOS.
- **The simulator can't verify this.** Its Safari crashes ("This webpage was reloaded because a problem occurred") when it plays the HEVC-alpha `.mov`, because there's no hardware decoder.

**Fix: switch the clips to animated WebP images.** They support alpha in iOS Safari, Mac Safari, Chrome and Firefox, from one file with no browser detection.
- **All three are made**, in the scratchpad `webp/` folder (`/private/tmp/claude-501/-Users-ryanrodriguez-Desktop-Donna/c4ae0bde-b920-4d87-938b-59d7a8b53e01/scratchpad/webp/`):
  - `hacky-chat.webp`: 600×480, 20 fps, quality 70, 4.1 MB.
  - `hacky-thinking.webp`: 300×240, 0.69 MB.
  - `hacky-onboarding.webp`: 540×432, 20 fps, quality 68, 5.4 MB.
- **To regenerate one,** for example the onboarding clip:
  ```bash
  cd /Users/ryanrodriguez/Desktop/Hacky/react/public/assets/mascots/video && ffmpeg -y -c:v libvpx-vp9 -i hacky-onboarding-smooth.webm -vf "scale=540:432:flags=lanczos,fps=20" -c:v libwebp_anim -quality 68 -compression_level 6 -loop 0 -pix_fmt yuva420p <scratchpad>/webp/hacky-onboarding.webp
  ```
  - The `-c:v libvpx-vp9` before `-i` is required: it's the decoder that keeps the alpha.
  - ffmpeg can't read animated WebP back, so its "image data not found" messages are harmless. Check the result in a browser instead.
- **To finish:**
  1. Copy the three `.webp` files into `react/public/assets/mascots/video/`.
  2. Change `HackyFilm.jsx` to render `<img src={clip.webp}>` instead of `<video>`:
     - keep the same CSS geometry as the video (`.hacky-film video` in `react/src/Onboarding.css`: 125% wide, −12.5% left margin, 100% tall). Apply it to the img too, or switch the selector to `.hacky-film > *`;
     - for `prefers-reduced-motion`, show the poster PNG instead;
     - make `onError` call `onUnavailable` (the callers fall back to the still pet);
     - remove the `.mov` / `.webm` source logic, the `webkitOnly` check, and the play/pause IntersectionObserver code, which images don't need.
  3. Keep the `alt` and `aria-label` text from each clip's `label`.
- **Verify:**
  - the built-in browser (Chrome-based);
  - the iOS simulator: WebP shouldn't crash it. Check the onboarding (`/index.html?onboarding=1`), the dragon, and the thinking clip. To see the thinking clip, delay `/api/chat` in the browser with a fetch monkeypatch.
  - Ryan's real iPhone, over the hotspot URL.
- After it works on iPhone, the `.mov` files and possibly the `.webm` files can be deleted. Check that nothing else references them.

## Bug 2: the text box jumps when the keyboard opens (not started)

**What happens:** in Ryan's screenshot, the composer sits at the top under the status bar, the chat is gone, and there's empty space above the keyboard.

**Where the layout comes from:**
- `react/src/Conversation.jsx` has an effect that sets the `#app` height from `window.visualViewport.height` on `visualViewport` resize. Search for `visualViewport` and `setHeight`.
- On iOS, opening the keyboard shrinks the visual viewport and also scrolls it (`visualViewport.offsetTop` > 0), so the shortened app ends up offset.
- The base layout CSS is in `react/public/app/hacky.css` (`.app`, `.main`, `.feed`, `.compose-wrap`), with phone tweaks in `react/public/app/hacky-plan.css`.

**Likely fix:**
- Keep the app pinned to the visual viewport: also listen to `visualViewport` `scroll`, and apply `transform: translateY(offsetTop px)` (or `top`) on a `position: fixed` app container, with height = `visualViewport.height`.
- Stop the document itself from scrolling (`html, body { height: 100%; overflow: hidden }`), so only `.feed` scrolls.
- Keep the composer at the bottom above the keyboard, and keep the latest messages visible.

**Verify in the iOS simulator:**
- tap the "Ask Hacky…" box (the keyboard opens) and take a screenshot. The composer should sit right above the keyboard, with the chat visible above it;
- check that closing the keyboard restores the layout;
- check the DM composer in the Chats sidebar too.

## Cleanup when done
- Delete `react/public/__video-debug.html` (a temporary debug page).
- **`hacky-web` launch config:** once Ryan no longer needs phone access, set it back to `--host 127.0.0.1` (or `npm run dev`). While it listens on the network, anyone who can reach the Mac can open the demo portal.
- **`server/auth.ts` `lanOrigins`:** this dev-only trust of the Mac's network addresses is skipped on Vercel. It's fine to keep.
- Restore `demo_kiran_audio` from the snapshot, then confirm there are no leftover connections or help requests from him. `demo_you` has a pending request to the Pulse team that is Ryan's; leave it.
- Run `npm run typecheck`, then build `react/` (`npx vite build --outDir <scratch>`) and run `npm test` in `react/`.

## Rules
- **No commits.** Ryan commits himself.
- **No new branches.**
- **Never print `.env.local` values.**
- **Gemini has billing.** Keep real chat turns few and use the test account.

## Waiting on Ryan
Whether to fix the 5 search weak spots the judge test found:
- unrelated people labelled strong matches for unfamiliar skills;
- a track named in the request being ignored;
- domains treated as skills;
- one more chat retry on rate limits;
- chips for "hi".
