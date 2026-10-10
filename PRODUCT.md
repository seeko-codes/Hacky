# Hacky

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hackathon and event attendees seeking relevant people, help, or event information. Hackers, mentors, peers, teammates, and sponsors are important initial roles, with other categories and multiple roles possible. The initial audience includes developers and anime/convention enthusiasts. Phone use is primary.

## Product Purpose

Help attendees find the right person for their situation and understand the event through one AI conversation. Matching uses attendee context; event support covers schedules, locations, venue layout, and practical questions. CORE.md defines the full confirmed vision.

## Positioning

Users describe what they need to Hacky, a customizable animated companion. The intended experience recommends relevant people with an explanation of the fit and answers questions about the event. Together these form an AI-first experience for event management and support.

## Operating Context

The initial prototype is themed for MLH hackathons, with Knight Hacks as the event demo. An event-page link below a QR code directs attendees to the app. The intended integration reuses existing Knight Hacks application and resume context, without a separate Hacky login or onboarding flow. This integration is not implemented in the static prototype.

## Capabilities and Constraints

The finder is the primary conversation. Team chat and individual chats occupy the collapsible left area on desktop and full-screen chats on phones. Recommendations show compact cards; tapping opens a focused profile with description, stack, strengths, match reason, GitHub/LinkedIn controls, and messaging.

Companions offer six looks, tint, flair and motion preferences, with an automatic greeting dance. Each demo attendee has a distinct stable personalized Hacky portrait. Light/dark appearance follows the system until manually chosen. Companion and theme preferences persist locally.

The current frontend uses fictional profiles, matching and replies. It does not send real messages or connect real social accounts. The intended matching flow uses existing attendee context plus a focused clarification of intent, then returns multiple people, commonly five. Clarification, profile ingestion, and ranking are not implemented. Backend matching, identity, messaging and deployment remain open decisions.

Conversational event knowledge is confirmed product scope. Integration with real schedules, room information, venue maps, and organizer guidance is not implemented in the current prototype. No organizer administration workflow is specified yet.

## Brand Commitments

Hacky is the product name and personified companion. Preserve the clean app-like experience, cohesive identity, playful hackathon personality and cute customizable mascot. MLH association is a thematic brief, not a claim of endorsement.

## Evidence on Hand

The runnable static frontend, six original mascot sheets, official MLH logo asset, Knight Hacks reference screenshot and event-entry mockup are in this project. DESIGN.md records the incumbent visual system. UI-AUDIT.md and verification/ record browser evidence and limitations.

## Product Principles

- Keep very few interface details and execute each exceptionally well, so the phone-first website feels like an installed app. PHILOSOPHY.md preserves the user's founding direction; PRODUCT-TRANSCRIPT.md contains the source excerpts.
- Help users find relevant people, start conversations, and get useful event answers with minimal friction.
- Keep the finder primary and team/individual messaging distinct.
- Favor a simple, cohesive experience whose small details are carefully finished.
- Let companion customization add personality without complicating networking.
- Identify simulated data and behavior honestly.
