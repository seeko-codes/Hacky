# Hacky: the core idea

## What Hacky is

Hacky is an AI-first companion for hackathons and events. You tell it what you need, and it helps you find the right person, the right information, and your next step.

Its purpose is simple: make the people and knowledge inside an event accessible through one conversation. Someone should be able to ask for a complementary teammate, help with a problem, a coffee companion, or the time and location of a session with the same ease.

Hackathons are the starting point. The broader vision is an AI-first experience for event management and support, grounded in the people, activities, spaces, and context of each event.

## The problem we are solving

An event can contain exactly the person or answer you need, yet leave you struggling to find it. Useful information is scattered across attendee profiles, resumes, application forms, descriptions, schedules, venue information, and conversations. Meeting the right person often depends on chance, an introduction, or being in the right channel at the right moment.

Hacky makes that context useful at the moment someone asks for help. The attendee should not have to understand the event's entire directory or know whom to ask before getting started.

## Two core modes, one conversation

These modes describe what Hacky helps with. They do not require separate screens or a mode selector.

### 1. Find the person I need

Hacky understands a request and finds relevant people within the event. Its intended matching considers attendees' resumes, profiles, descriptions, skills, experience, interests, and other available event context alongside the user's immediate need.

Matching should understand what someone brings and what the situation requires. A complementary teammate may have strengths you lack. A useful mentor may have solved the exact problem you are facing. A good coffee companion may share an interest or simply be interested in meeting someone new.

Examples:

- "I'm building the frontend. Who could help me build the backend?"
- "We need someone with design experience to round out our team."
- "Who can help us debug our deployment?"
- "Is there a mentor who knows computer vision?"
- "Which sponsor should I talk to about this API?"
- "I'd like to meet someone interested in accessibility."
- "Who wants to grab a coffee?"

Hacker, mentor, and sponsor are important categories and should be visible wherever they help someone understand a person. The set remains open to other roles and multiple roles per person. Categories support matching; the user's actual request defines what a useful match means.

Hacky should explain why a person fits, using meaningful evidence from their profile and the request. The user can inspect the recommendation and start a conversation. If the request needs clarification, Hacky asks a short, useful question.

The ambition is to find the perfect help for the situation. The product earns that trust through relevant recommendations and honest explanations. It cannot assume someone's availability, interest, or willingness to help from a resume alone.

### 2. Help me understand the event

Hacky also understands the event itself: what is happening, when it happens, where it happens, and how the venue is laid out.

Examples:

- "When is the opening ceremony?"
- "Which ballroom is the workshop in?"
- "What is happening after lunch?"
- "Where is the mentor area, and how do I get there?"
- "When are submissions due?"

Answers should use the event's actual schedule, room information, venue layout, and organizer-provided guidance. Give the useful answer directly, with the time, location, or next step the attendee needs. When information is missing or uncertain, make that clear and help the attendee find an authoritative answer.

The two modes work together. Someone asking for help might need both a relevant mentor and the location of the next mentoring session. Hacky should follow the need across people and logistics within the same conversation.

## How the experience should feel

**Start with the need.** People talk naturally to Hacky. They should not have to learn search filters, role taxonomies, or event terminology to ask for help.

**Use the context already available.** The intended experience reuses information attendees have already provided through the event's application and profile systems. For the initial Knight Hacks direction, that includes existing application and resume context. Avoid making attendees repeat an onboarding process just to receive useful help.

**Make relevance understandable.** A recommendation should answer "Why this person for me, right now?" An event answer should make it easy to act on the information.

**Keep the next step close.** Help someone move from a request to a profile, a conversation, or a place they need to be. A useful answer reduces the work between asking and acting.

**Design for a phone first.** Attendees use Hacky while moving around an event. Every design, preview, and interaction should work on a phone first, with readable content, comfortable touch targets, reliable scrolling, and clear navigation.

**Be cute, functional, and finished.** Hacky is a friendly, customizable character with a clean interface. Small details deserve care: portraits, role labels, buttons, messages, spacing, feedback, and transitions. Personality should make the experience welcoming while preserving clarity and functionality.

## What success looks like

An attendee can describe what they need without knowing who has the answer. Hacky understands the request, uses the event's context, and helps them take a useful next step.

They find a teammate whose strengths complement theirs. They reach someone who can unblock their project. They meet a person they would enjoy talking to. They know which room to walk to and when to be there.

The event becomes easier to navigate, socially and physically.

## Vision and current implementation

This document records the product vision confirmed by the founder. It does not claim that every capability is implemented.

The current static prototype demonstrates the phone-first companion, fictional attendee recommendations, visible role categories, profiles, and simulated team and direct chats. Its matching uses demo keyword behavior. It does not yet ingest real resumes or profiles, perform live personalized ranking, send real messages, or answer from an integrated event schedule or venue map.

The complete vision includes both person matching and event knowledge. The current frontend is a starting point for that experience.

## Where this fits in the project

- **CORE.md** defines why Hacky exists and its full product vision.
- **PHILOSOPHY.md** records experience and design principles.
- **PRODUCT.md** records product scope and current capability boundaries.
- **DESIGN.md** records the current visual system.
- **HANDOFF.md** records implementation status and how to continue the work.
