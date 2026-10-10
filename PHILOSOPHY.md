# Hacky product philosophy

Hacky is an AI-first companion that helps people find the right people and understand the event around them. [CORE.md](CORE.md) defines the full product vision: intentional matching from attendee context, alongside conversational help with schedules, locations, and event logistics. This document records the experience and design principles behind that vision.

## Seamless event context

The intended product uses the resume and application information already provided to Knight Hacks through its event platform. Attendees arrive with their event context available, without a separate Hacky login or onboarding workflow. Their current request guides routing; existing context personalizes it. This integration is the product direction, not a capability implemented in the static demo.

## The founding design rule

The original request said: “the details that it has have to be little, but they have to be very, very, very well done.” It also asked for a website someone could mistake for an app downloaded on their phone. Every design decision should serve those two commitments.

Keep the experience minimal, immediate and carefully finished. Give attention to typography, spacing, readable profiles, touch targets, interaction feedback, keyboard behavior and stable conversations. Additional decoration must earn its place through the product or the companion.

## The main interaction

Talk to Hacky in natural language about what you need. People requests include a full-stack builder, a security specialist, a complementary teammate, a mentor, a relevant sponsor, or someone to get coffee with. Event questions include when a session starts, which ballroom it uses, and how to find a space within the venue. These are parts of one conversational experience; event knowledge is intended scope, not implemented in the current demo.

Use the attendee’s existing profile and a short, focused clarification of their intent to find multiple relevant people, often the top five. This personalized clarification and ranking is intended behavior, not implemented matching.

Show compact recommendation cards with character, name, category, and one specialty. Tapping expands a person into a focused, nearly full-screen profile with biography, stack, strengths, relevance explanation, GitHub/LinkedIn access, and messaging. Only show details relevant to the current decision. Let users start a direct conversation and keep discovered people accessible in their chats.

The finder is primary. Desktop places a collapsible conversation area on the left and Hacky on the right. Team chat comes first in the conversation list, followed by individual chats. On phones, chats occupy the full screen with a clear return to the finder. Phone design and screenshot review take priority; desktop is secondary.

## Personality and visual identity

Hacky is a cute personified companion, not an anonymous chatbot. It should be customizable, animated and able to dance. The audience includes developers, anime fans and convention enthusiasts. The desired feeling combines the clean app interface the user liked with cute, friendly personality with clear, functional controls.

References named by the user: MLH and Knight Hacks for event context, Codex pets, Meta Muse, Reddit companions and Discord pets for companion inspiration. These are inspirations, not instructions to reproduce a character or claim official endorsement.

Every attendee should have a distinct personalized Hacky portrait, with no generic default icons or repeated placeholder portraits. Cards and expanded profiles can show the actual character silhouette without a circular container; small chat portraits may use face crops for readability. The main companion dances automatically on initial load and remains customizable.

The interface supports light and dark mode. The current direction is cute and functional. Avoid neon, lightning motifs, dramatic effects, and decorative motion outside the companion.

The interface needs one coherent brand. Companion choices can vary without turning the whole app into unrelated color schemes. DESIGN.md records the current implementation palette; it is a design choice, not a requirement that overrides future user direction.

## What success looks like

A person at the event can describe who they want to meet, understand why a suggested person is relevant, and begin a conversation. They can also ask about the event and understand when and where to go. A phone user should feel they are using a polished app. Hacky should be memorable and lovable while making the event easier to navigate.

## Decision rules for future changes

- Prioritize useful person matching, connections, and event answers; these are the core experience.
- Keep intent-based networking visible, with teammates, mentors, peers, and sponsors as optional starting points.
- Start directly in the finder. Avoid separate onboarding or unnecessary workflow choices.
- Resolve routine design decisions through visual iterations; keep philosophy interviews focused on the few decisions that shape the interface.
- Preserve the finder plus team and individual conversation structure.
- Prefer specific, useful profile content to repeated tags, generic hype or speculative match claims.
- Let the main companion carry personality. Avoid scattering tiny mascot copies and unrelated decorations.
- Test the phone flow first and inspect desktop as well.
- Keep fictional demo behavior clear until real profiles, matching and messaging exist.
- Apply authorized visual refinements directly and let the user steer subsequent iterations.

See PRODUCT-TRANSCRIPT.md for the original wording and HANDOFF.md for current implementation and restart instructions.
