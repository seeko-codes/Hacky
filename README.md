# Hacky

Phone-first AI companion for finding the right people and understanding an event. The current static prototype demonstrates fictional attendee matching, profiles, chats, and customizable companions. Live matching and event knowledge integrations are future work.

Start with [CORE.md](CORE.md) for the product vision, then [HANDOFF.md](HANDOFF.md) and [PHILOSOPHY.md](PHILOSOPHY.md) before making changes. Earlier product direction is preserved in [PRODUCT-TRANSCRIPT.md](PRODUCT-TRANSCRIPT.md).

Open `index.html` in Chrome. Open `event-demo/knight-hacks-demo.html` to preview the event-page link below the QR code.

The prototype includes a people finder, team and individual demo chats, GitHub and LinkedIn profile controls, and six customizable animated companions. People, matching, and replies are fictional. Social accounts are not connected. Companion preferences save locally in the browser.

## Files

- `index.html`: app markup and demo interactions
- `app/hacky.css`: shared app design tokens and styles
- `app/hacky-customizer.js` and `app/hacky-customizer.css`: companion studio and animation
- `assets/mascots/webp/hacky-*.webp`: lossless mascot assets served by the app
- `assets/mascots/png/hacky-*.png`: preserved original mascot artwork
- `assets/brand/` and `assets/fonts/`: the event logo and licensed app fonts
- `iterations/`: preserved earlier prototypes
- `event-demo/`: screenshot-based event entry mockup and its reference image
- `verification/`: browser check and captured screenshots
- `deliverables/`: completed website and mascot handoff packages; private email receipts are excluded from Git
- `.lavish/hacky-detail-review.html`: standalone historical design review board
- `.agents/skills/`: included architecture, design, review, browser, image generation, and GitHub skills; see the [skill guide](.agents/skills/README.md)

No server or build is required.

## Browser testing

A headless WebKit configuration is prepared for Microsoft Playwright CLI. See [BROWSER-SETUP.md](BROWSER-SETUP.md) for installation, preview, and inspection commands. Install development dependencies with `npm ci`; browser binaries must be installed separately on each machine. Screenshots and the repeatable check are in `verification/`. HANDOFF.md records which checks ran and their limitations.
