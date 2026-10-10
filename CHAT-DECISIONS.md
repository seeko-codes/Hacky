# Hacky conversation decisions

Saved October 10, 2026 from the current chat. This is a decision record, not a verbatim transcript. Read with PHILOSOPHY.md (durable intent), PRODUCT.md (confirmed scope), DESIGN.md (current visual choices), and HANDOFF.md (restart instructions).

## Product purpose

Find anyone relevant to an attendee’s intent at the same event. Common routes are teammates, networking, mentors, and sponsors who can help with the attendee’s activity. Do not narrow the product to team finding or a mascot studio.

Intended integration reuses the resume and application information already uploaded through the Knight Hacks/MLH event platform. The user dictated “Nighthax” and “Nighthacks”; the project uses Knight Hacks. There should be no separate Hacky onboarding or elaborate login flow. Seamless distribution and existing event context are central. None of this integration is implemented.

Intended matching: describe the need, use existing profile context, ask only useful focused questions about the actual need, then recommend multiple people, often the top five. The current work focuses on UI, not implementing ingestion, interviews, or ranking.

## Design requirements

- Phone is the primary experience and review surface. It should feel like a polished installed app apart from browser chrome. Desktop is secondary.
- Show only the information relevant to the current decision. Keep few details, exceptionally well finished.
- Recommendations are compact cards: character, name, prominent category, and one minimal specialty. Do not show full biographies before a person is selected.
- Tapping a card expands it to take most of the screen. The profile reveals biography, GitHub, LinkedIn, stack, strengths, relevance, and the message action. Preserve the results when returning.
- Make Hacker/Mentor/Sponsor category labels stand out with meaningful color. Keep the actual description quieter and concise.
- Chat should feel clean and professionally composed. The user named Linear’s chat as a reference and repeatedly rejected a generic “vibe-codey” appearance.
- Every person gets a distinct personalized Hacky portrait. No generic default profile icons or repeated placeholder characters. Carefully frame and align imagery.
- Cards and expanded profiles should show the actual character without requiring a circular bubble. Small chat face crops currently remain for legibility.
- Make the main Hacky bigger and play a dance automatically on initial load. Respect reduced motion.
- Typography remains an exploration. The user asked to iterate beyond the Linear-like font; current trial is locally hosted Lato, not a permanently approved font.
- Support light and dark mode.
- Make the app more electric and less corporate. The user explicitly clarified that this requires looking at actual electric websites and drawing inspiration, not interpreting the word solely as a color change. Preserve the minimal task flow.

## Collaboration preferences

Apply authorized frontend refinements directly and let the user steer the next iteration. Do not keep asking permission for routine visual choices. Philosophy interviews should use the Pareto principle: focus only on central decisions necessary for design and resolve the rest by iteration. The user initially requested the Grill Me skill, then curtailed prolonged questioning. No such skill was available in this session’s catalog.

Take screenshots and iterate with special attention to mobile. The user explicitly asked to skip headless troubleshooting during this pass. Do not restart it without a new request. Open user-facing previews automatically in visible Google Chrome. Current native Chrome device preview works at 390×844; local server binding and the headless bridge were unavailable.

Never use an em dash. Reveal delivered files in Finder. Keep fictional-demo disclosures. Do not introduce fake live accounts, endorsements, availability, or sent messages.

## Implemented in this conversation

- Larger companion and one automatic 2.4-second greeting dance, then saved motion resumes.
- Stable personalized character portraits across results, contacts, and messages. Own portrait follows saved customization independently of other attendees.
- Full character silhouettes on recommendation cards and expanded profiles; circular face crops in compact chats.
- Cleaner aligned direct-message rows, restrained sender labels, quiet composer, and compact phone chat header.
- Phone chats occupy the full screen.
- Category colors: cobalt Hacker, violet Mentor, amber Sponsor.
- Multiple compact recommendation cards: five fictional mentors or three fictional teammates. A fictional sponsor route also exists.
- Focused native profile dialog expands from the tapped card. Back/Escape restores focus and results; Message opens the person’s demo chat.
- Locally hosted Lato regular/bold with OFL license.
- Saved sun/moon theme toggle. Defaults to OS appearance, tracks system changes until a manual choice, saves hacky-theme locally, applies before rendering, and updates browser theme color.
- Theme tokens cover cards, badges, chats, composer, customizer, dialogs, disabled controls, hover, selection, and focus.
- Current electric refinement: cool white light surfaces, deep ink dark surfaces, cobalt/periwinkle links, lime primary actions with ink text, an ink/accent welcome headline, colored shortcut icons, and a small header bolt. Existing mascot artwork remains intact.

## Reference research

Visually inspected these live sites during the latest iteration:

- Gumroad: https://gumroad.com/ - isolated playful artwork, decisive high-contrast primary actions, sparse hierarchy.
- Poolside: https://cellular.poolside.fm/ - confident welcome typography, playful visual personality and motion.
- Teenage Engineering: https://teenage.engineering/ - precise icon geometry, spare controls, visual confidence.

These references were selected by the assistant after the user asked for electric website research. The user has not explicitly approved each reference or the final palette. Linear was named by the user for chat quality; mascot references from prior context include Codex pets, Muse, Reddit companions, and Discord pets.

## Verification and limits

Reviewed visible Chrome phone screenshots at 390×844: both welcome themes, light recommendation cards, dark expanded profile, dark direct chat, and dark customization. Toggling preserved active results; a fresh page restored the saved dark choice. Final light appearance was also reviewed after the reference-driven refinement. Inline JavaScript syntax passed. Text and action contrast were checked; earlier cobalt action checks preceded the final lime change. No headless suite was rerun. Real phone keyboard behavior is unverified.

The Impeccable detector flags Lato as a common font; it remains an intentional typography trial. Impeccable Live stays stopped. Do not claim historical browser checks verify today’s UI.

This is a static fictional demo. Matching uses keywords. Conversations and discovered contacts are in memory; only theme and companion preferences persist. Social accounts are unconnected and messages are not sent. No production backend, authentication, directory integration, ranking, real messaging, deployment, or provider architecture is implemented.

## Suggestions raised but not implemented

Move Style Hacky/Dance controls out of active finder results. Reveal chat biography and social links by tapping chat identity instead of showing them above messages. These are suggestions awaiting further user direction, not completed changes.

## Main implementation locations

`index.html` owns markup, fictional data, finder routing, profile dialogs, messaging, and theme selection. `app/hacky.css` owns shared layout/theme tokens and portrait framing. `app/hacky-customizer.js` and `app/hacky-customizer.css` own companion customization and animation. `assets/fonts/` contains the current Lato trial. `verification/browser-check.js` was updated for the current card flow but not rerun.
