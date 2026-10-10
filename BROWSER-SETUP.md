# Hacky browser testing

Use Microsoft's Playwright CLI with headless WebKit for the phone layout. The committed `.playwright/cli.config.json` selects an isolated WebKit session with a 390 x 844 touch viewport. This is browser emulation, not a physical iPhone test.

Official source: https://github.com/microsoft/playwright-cli
Browser documentation: https://playwright.dev/docs/browsers

## Install once

Run in a terminal session with network access:

```sh
cd /Users/aatutor/projects/hacky
npm ci
npx playwright-cli install-browser webkit
```

Install only WebKit initially to limit browser storage use. Package versions will be captured by npm's lockfile during installation.

## Preview and inspect

Keep the preview server running in one terminal:

```sh
cd /Users/aatutor/projects/hacky
python3 -m http.server 4173 --bind 127.0.0.1
```

From another terminal in Hacky:

```sh
npx playwright-cli -s=hacky open http://127.0.0.1:4173
npx playwright-cli -s=hacky snapshot
npx playwright-cli -s=hacky screenshot
```

Use returned snapshot references to interact with controls. Inspect matching, team and individual chats, social demo notices, customization save/cancel, reload persistence, and reduced motion. Close only the Hacky session afterward:

```sh
npx playwright-cli -s=hacky close
```

Use a headed browser only for a requested user review. Keep the existing Chrome skill available for Chrome-specific checks.

## Verified status

Playwright CLI 0.1.22 is installed locally and locked in package-lock.json. Its matching WebKit 26.6 build (2368) is installed. Use the CLI's install-browser command to avoid the version mismatch caused by installing an unrelated standalone Playwright browser build.

The localhost preview server and headless WebKit browser now work after the session permissions changed. The saved browser check passed all 20 assertions at phone and desktop sizes. It covers matching, chats, social demo notices, customization save/cancel and persistence, reduced motion, keyboard tabs and focus return, and the event-entry link. No JavaScript page errors were observed.

To repeat the check with the preview server running:

```sh
npx playwright-cli -s=hacky open http://127.0.0.1:4173
npx playwright-cli -s=hacky run-code --filename verification/browser-check.js
npx playwright-cli -s=hacky close
```

Screenshots are saved in verification/. This does not certify physical-device behavior or browser coverage beyond WebKit.
