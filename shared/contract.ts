// The API contract shared by the Hono API (server/) and the web app (react/).
// JSON keys are camelCase. Timestamps are ISO strings. Every route needs a
// Better Auth session except /api/health and /api/demo/*; event routes also
// need membership in that event. Better Auth's own routes live under
// /api/auth/* (sign-out included) and are not described here.
//
// Enum values mirror server/db/schema.ts. The browser imports this file, so it
// must not import server code.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives and enums
// ---------------------------------------------------------------------------

export const Uuid = z.guid();
export const UserId = z.string().min(1).max(64);
export const Slug = z.string().regex(/^[a-z0-9-]{2,40}$/);
export const Handle = z.string().regex(/^[a-z0-9_]{3,30}$/);
export const Timestamp = z.iso.datetime({ offset: true });
export const Score = z.number().min(0).max(1);
export const Tag = z.string().trim().min(1).max(40);
const Tags = z.array(Tag).max(30);
const HttpsUrl = z.url({ protocol: /^https$/ }).max(300);

export const MemberRole = z.enum(["hacker", "mentor", "sponsor", "organizer"]);
export const Availability = z.enum(["available", "busy", "offline"]);
export const Experience = z.enum(["beginner", "intermediate", "advanced"]);
export const HackGoal = z.enum(["win", "learn", "ship"]);
export const ConnectionStatus = z.enum(["pending", "accepted"]);
export const ConnectionSource = z.enum(["agent", "qr", "profile"]);
export const ConversationKind = z.enum(["dm", "mentor"]);
export const MessageKind = z.enum(["text", "card", "system"]);
export const HelpStatus = z.enum(["open", "claimed", "resolved"]);
// Onboarding step 1: why they came. member_profiles.motivations (checked in the DB).
export const Motivation = z.enum(["build", "learn", "meet", "career", "compete", "fun"]);

export type MemberRole = z.infer<typeof MemberRole>;
export type Availability = z.infer<typeof Availability>;
export type Experience = z.infer<typeof Experience>;
export type HackGoal = z.infer<typeof HackGoal>;
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;
export type ConnectionSource = z.infer<typeof ConnectionSource>;
export type ConversationKind = z.infer<typeof ConversationKind>;
export type MessageKind = z.infer<typeof MessageKind>;
export type HelpStatus = z.infer<typeof HelpStatus>;
export type Motivation = z.infer<typeof Motivation>;

export const ErrorCode = z.enum([
  "unauthorized", // 401
  "forbidden", // 403
  "not_found", // 404, also used when a block hides the target
  "invalid", // 400
  "conflict", // 409: already requested, already claimed
  "rate_limited", // 429
  "internal", // 500: unexpected server error
]);
export const ApiError = z.object({
  error: z.object({ code: ErrorCode, message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;

const Ok = z.object({ ok: z.literal(true) });

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

// The Hacky character, the avatar for people without a photo. Every Hacky is
// the knit one. Color, flair and move ids live in react/src/mascot-data.js and
// are still being designed, so they're plain strings and unknown keys pass through.
const hackyStyleOptions = {
  color: z.string().max(40).optional(),
  flair: z.string().max(40).optional(),
  move: z.string().max(40).optional(),
};
const hackyStyleFits = (style: object) => JSON.stringify(style).length <= 2000;

// What a write may store (PATCH /api/me/profile): look is "knit" or left out.
export const HackyStyleInput = z
  .looseObject({ look: z.literal("knit").optional(), ...hackyStyleOptions })
  .refine(hackyStyleFits, "hackyStyle is too large");

// What a read accepts (responses, tool outputs, saved chat threads). Rows and
// threads saved before knit-only may still name another look (mochi, cat,
// dragon, star, pixel), so any look reads fine; the web app draws knit for it.
export const HackyStyle = z
  .looseObject({ look: z.string().max(40).optional(), ...hackyStyleOptions })
  .refine(hackyStyleFits, "hackyStyle is too large");
export type HackyStyle = z.infer<typeof HackyStyle>;

// The profile photo, the avatar when set: a site path (/assets/...) or an https
// URL. Same rule as the profiles_photo_url_format check in the database.
export const PhotoUrl = z.string().regex(/^(\/assets\/|https:\/\/)/, "Must be an /assets/ path or an https URL");

export const ProfileLinks = z.object({
  github: HttpsUrl.optional(),
  linkedin: HttpsUrl.optional(),
  website: HttpsUrl.optional(),
});
export type ProfileLinks = z.infer<typeof ProfileLinks>;

// Never includes email.
export const PublicProfile = z.object({
  userId: UserId,
  handle: Handle,
  name: z.string().trim().min(1).max(80),
  hackyStyle: HackyStyle,
  photoUrl: PhotoUrl.nullable(),
  bio: z.string().max(500).nullable(),
  links: ProfileLinks,
  isDemo: z.boolean(),
});
export type PublicProfile = z.infer<typeof PublicProfile>;

// The compact person used in lists, cards, requests and chats (event-scoped).
export const PersonSummary = PublicProfile.pick({
  userId: true,
  handle: true,
  name: true,
  hackyStyle: true,
  photoUrl: true,
}).extend({ role: MemberRole });
export type PersonSummary = z.infer<typeof PersonSummary>;

const intakeFields = {
  skills: Tags,
  skillsWanted: Tags,
  experience: Experience.nullable(),
  wantsExperienced: z.boolean(),
  goal: HackGoal.nullable(),
  track: z.string().trim().max(80).nullable(),
  interests: Tags,
  idea: z.string().trim().max(2000).nullable(),
  motivations: z.array(Motivation).max(6),
};

// member_profiles for the signed-in user. summary and complete are set by the server.
export const Intake = z.object({
  ...intakeFields,
  summary: z.string().max(1000).nullable(),
  complete: z.boolean(),
});
export type Intake = z.infer<typeof Intake>;

export const Membership = z.object({
  role: MemberRole,
  verified: z.boolean(),
  availability: Availability,
  looking: z.boolean(),
});
export type Membership = z.infer<typeof Membership>;

// Where the viewer stands with another person in this event.
export const Relation = z.object({
  state: z.enum(["none", "outgoing", "incoming", "accepted"]),
  requestId: Uuid.nullable(),
  conversationId: Uuid.nullable(),
});
export type Relation = z.infer<typeof Relation>;

export const PersonDetail = PublicProfile.extend({
  ...Membership.shape,
  skills: Tags,
  skillsWanted: Tags,
  experience: Experience.nullable(),
  goal: HackGoal.nullable(),
  track: z.string().nullable(),
  interests: Tags,
  idea: z.string().nullable(),
  summary: z.string().nullable(),
  motivations: z.array(Motivation),
  relation: Relation,
});
export type PersonDetail = z.infer<typeof PersonDetail>;

// ---------------------------------------------------------------------------
// Me and events
// ---------------------------------------------------------------------------

export const MyEvent = z.object({
  slug: Slug,
  name: z.string(),
  role: MemberRole,
  verified: z.boolean(),
});
export type MyEvent = z.infer<typeof MyEvent>;

export const Me = z.object({ profile: PublicProfile, events: z.array(MyEvent) });
export type Me = z.infer<typeof Me>;

export const UpdateProfileBody = z
  .object({
    name: PublicProfile.shape.name,
    bio: z.string().trim().max(500).nullable(),
    hackyStyle: HackyStyleInput,
    links: ProfileLinks,
  })
  .partial();
export type UpdateProfileBody = z.infer<typeof UpdateProfileBody>;

// Designer-owned theme contract; the web app turns it into CSS variables.
export const EventTheme = z.looseObject({
  brand: z.string().optional(),
  brandContrast: z.string().optional(),
  accent: z.string().optional(),
  surface: z.string().optional(),
  logoUrl: z.string().optional(),
  displayFont: z.string().optional(),
});
export type EventTheme = z.infer<typeof EventTheme>;

export const EventInfo = z.object({
  slug: Slug,
  name: z.string(),
  theme: EventTheme,
  tracks: z.array(z.string()),
  startsAt: Timestamp.nullable(),
  endsAt: Timestamp.nullable(),
});
export type EventInfo = z.infer<typeof EventInfo>;

export const EventMe = Membership.extend({ intake: Intake });
export type EventMe = z.infer<typeof EventMe>;

// Partial update. role and verified are not editable here.
export const UpdateEventMeBody = z
  .object({ ...intakeFields, availability: Availability, looking: z.boolean() })
  .partial();
export type UpdateEventMeBody = z.infer<typeof UpdateEventMeBody>;

// ---------------------------------------------------------------------------
// Requests and blocks
// ---------------------------------------------------------------------------

export const Intro = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((text) => !/https?:\/\/|www\./i.test(text), "Intros can't contain links");

// The team a "Contact team" request is about. null for a person-to-person request.
export const TeamRef = z.object({ id: Uuid, name: z.string() });
export type TeamRef = z.infer<typeof TeamRef>;

// direction and person are relative to the viewer.
const requestFields = {
  id: Uuid,
  status: ConnectionStatus,
  intro: z.string(),
  source: ConnectionSource,
  person: PersonSummary,
  team: TeamRef.nullable(),
  conversationId: Uuid.nullable(),
  createdAt: Timestamp,
  respondedAt: Timestamp.nullable(),
};

// hiddenAt is set when the recipient taps "Not now". It exists only in the
// recipient's (incoming) view: to the sender a hidden request is still pending,
// and hiding never sends the sender a live update.
export const ConnectionRequest = z.discriminatedUnion("direction", [
  z.object({ ...requestFields, direction: z.literal("incoming"), hiddenAt: Timestamp.nullable() }),
  z.object({ ...requestFields, direction: z.literal("outgoing") }),
]);
export type ConnectionRequest = z.infer<typeof ConnectionRequest>;

// teamId: "Contact team". toUserId must be that team's owner (the server checks).
export const SendRequestBody = z.object({
  toUserId: UserId,
  intro: Intro,
  source: ConnectionSource.default("agent"),
  teamId: Uuid.optional(),
});
export type SendRequestBody = z.input<typeof SendRequestBody>;

// A mutual request comes back already accepted, with its conversationId.
export const RequestResult = z.object({ request: ConnectionRequest });
export type RequestResult = z.infer<typeof RequestResult>;

export const BlockBody = z.object({ userId: UserId });
export type BlockBody = z.infer<typeof BlockBody>;

// ---------------------------------------------------------------------------
// Conversations and messages
// ---------------------------------------------------------------------------

export const Message = z.object({
  id: Uuid,
  conversationId: Uuid,
  senderId: UserId.nullable(), // null for system messages
  clientId: Uuid.nullable(),
  body: z.string(),
  kind: MessageKind,
  createdAt: Timestamp,
});
export type Message = z.infer<typeof Message>;

export const ConversationSummary = z.object({
  id: Uuid,
  kind: ConversationKind,
  peer: PersonSummary, // the other member: DM partner, or the hacker/mentor in a mentor chat
  helpRequest: z
    .object({ id: Uuid, title: z.string(), status: HelpStatus })
    .nullable(),
  lastMessage: Message.nullable(),
  unreadCount: z.number().int().min(0),
  peerLastReadAt: Timestamp.nullable(),
  createdAt: Timestamp,
});
export type ConversationSummary = z.infer<typeof ConversationSummary>;

// Cursors are message ids. before: older page on scroll-up. after: catch-up
// after a reconnect or tab focus. Messages come back oldest first.
export const MessagesQuery = z
  .object({
    before: Uuid.optional(),
    after: Uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .refine((q) => !(q.before && q.after), "Use before or after, not both");
export type MessagesQuery = z.input<typeof MessagesQuery>;

export const MessagePage = z.object({ messages: z.array(Message), hasMore: z.boolean() });
export type MessagePage = z.infer<typeof MessagePage>;

// Retrying with the same clientId returns the same message.
export const SendMessageBody = z.object({
  clientId: z.uuid(),
  body: z.string().trim().min(1).max(4000),
});
export type SendMessageBody = z.infer<typeof SendMessageBody>;

// ---------------------------------------------------------------------------
// Mentor help
// ---------------------------------------------------------------------------

export const HelpRequestDraft = z.object({
  title: z.string().trim().min(3).max(120),
  details: z.string().trim().max(2000).nullable(),
  skillsNeeded: z.array(Tag).max(10),
});
export type HelpRequestDraft = z.infer<typeof HelpRequestDraft>;

export const HelpRequest = HelpRequestDraft.extend({
  id: Uuid,
  status: HelpStatus,
  hacker: PersonSummary,
  mentor: PersonSummary.nullable(),
  conversationId: Uuid.nullable(),
  createdAt: Timestamp,
  claimedAt: Timestamp.nullable(),
  resolvedAt: Timestamp.nullable(),
});
export type HelpRequest = z.infer<typeof HelpRequest>;

// Fit for the viewing mentor. highlighted: this mentor is in the top 3.
export const HelpFit = z.object({
  score: Score,
  matchedSkills: z.array(Tag),
  highlighted: z.boolean(),
});
export type HelpFit = z.infer<typeof HelpFit>;

// open: the shared queue, sorted by fit (verified mentors only, else empty).
// mine: requests I created, or claimed as a mentor.
export const HelpQueue = z.object({
  open: z.array(HelpRequest.extend({ fit: HelpFit })),
  mine: z.array(HelpRequest),
});
export type HelpQueue = z.infer<typeof HelpQueue>;

export const HelpRequestResult = z.object({ helpRequest: HelpRequest });
export type HelpRequestResult = z.infer<typeof HelpRequestResult>;

// ---------------------------------------------------------------------------
// Agent tool results (rendered as cards)
// ---------------------------------------------------------------------------

const Reason = z.string().trim().min(1).max(280);
export const SearchKind = z.enum(["hacker", "team", "mentor"]);
export type SearchKind = z.infer<typeof SearchKind>;

// score = 0.40 relevance + 0.40 coverage + 0.20 goalFit (see the plan's Matching).
export const MatchScoreParts = z.object({
  relevance: Score,
  coverage: Score.nullable(), // null when the search needed no skills
  goalFit: Score,
});
export type MatchScoreParts = z.infer<typeof MatchScoreParts>;

export const MatchEvidence = z.object({
  matchedSkills: z.array(Tag), // needed skills the candidate has
  sharedInterests: z.array(Tag),
  goal: HackGoal.nullable(), // the candidate's
  sameGoal: z.boolean(),
  track: z.string().nullable(),
  sameTrack: z.boolean(),
  experience: Experience.nullable(),
  experienceFits: z.boolean().nullable(), // null unless the user asked for experience
  availability: Availability,
});
export type MatchEvidence = z.infer<typeof MatchEvidence>;

export const PersonCard = z.object({
  card: z.literal("person"),
  person: PersonSummary,
  skills: z.array(Tag),
  score: Score,
  scoreParts: MatchScoreParts,
  evidence: MatchEvidence,
  reason: Reason,
});
export type PersonCard = z.infer<typeof PersonCard>;

// An open team (teams table). size counts team_members rows. "Contact team"
// drafts a request to team.owner with teamId set.
export const TeamSummary = z.object({
  id: Uuid,
  name: z.string(),
  idea: z.string().nullable(),
  track: z.string().nullable(),
  wantedSkills: z.array(Tag),
  size: z.number().int().min(1),
  maxSize: z.number().int().min(1),
  owner: PersonSummary,
});
export type TeamSummary = z.infer<typeof TeamSummary>;

// The team details view: everyone on the team, lead first (blocked people left out).
export const TeamDetail = TeamSummary.extend({ members: z.array(PersonSummary) });
export type TeamDetail = z.infer<typeof TeamDetail>;

export const TeamCard = z.object({
  card: z.literal("team"),
  team: TeamSummary,
  score: Score,
  scoreParts: MatchScoreParts, // coverage: share of the team's wanted skills you have
  evidence: z.object({
    matchedSkills: z.array(Tag), // the team's wanted skills you have
    track: z.string().nullable(),
    sameTrack: z.boolean(),
  }),
  reason: Reason,
});
export type TeamCard = z.infer<typeof TeamCard>;

// score = 0.60 skillOverlap + 0.25 relevance + 0.15 if available now.
export const MentorCard = z.object({
  card: z.literal("mentor"),
  person: PersonSummary,
  verified: z.boolean(),
  skills: z.array(Tag),
  score: Score,
  scoreParts: z.object({ skillOverlap: Score, relevance: Score, availableNow: z.boolean() }),
  evidence: z.object({ matchedSkills: z.array(Tag), availability: Availability }),
  reason: Reason,
});
export type MentorCard = z.infer<typeof MentorCard>;

export const MatchCard = z.discriminatedUnion("card", [PersonCard, TeamCard, MentorCard]);
export type MatchCard = z.infer<typeof MatchCard>;

// "Nothing fits" is a result, not an error. reason comes from the search, not the model.
export const NoMatch = z.object({
  status: z.literal("noMatch"),
  kind: SearchKind,
  reason: Reason,
});
export type NoMatch = z.infer<typeof NoMatch>;

// Nothing reached the strong-match threshold, but a few candidates came close.
// note says what's missing ("No mentor lists Solidity; these are the closest.");
// each card's reason says what that person does bring. Both come from the search.
export const ClosestMatches = z.object({
  status: z.literal("closest"),
  kind: SearchKind,
  cards: z.array(MatchCard).min(1).max(3),
  note: Reason,
});
export type ClosestMatches = z.infer<typeof ClosestMatches>;

export const SearchResult = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("matches"),
    kind: SearchKind,
    cards: z.array(MatchCard).min(1).max(10),
  }),
  ClosestMatches,
  NoMatch,
]);
export type SearchResult = z.infer<typeof SearchResult>;

// The user edits it, then Send posts SendRequestBody
// { toUserId: to.userId, intro, source, teamId: team?.id }.
export const DraftCard = z.object({
  card: z.literal("draft"),
  to: PersonSummary, // a team's owner for "Contact team"
  team: TeamRef.nullable(),
  intro: Intro,
  source: ConnectionSource,
});
export type DraftCard = z.infer<typeof DraftCard>;

// The user edits it, then "Request help" posts the draft fields.
export const HelpRequestCard = HelpRequestDraft.extend({ card: z.literal("helpRequest") });
export type HelpRequestCard = z.infer<typeof HelpRequestCard>;

// Output schema per tool name (tool names from the plan's Agent section).
// Tools not listed here answer in text.
// my_status: the user's pending requests, team and help requests at a glance.
const StatusRequest = z.object({
  id: Uuid,
  person: PersonSummary,
  intro: z.string(),
  team: TeamRef.nullable(),
  createdAt: Timestamp,
});
export const StatusCard = z.object({
  card: z.literal("status"),
  incoming: z.array(StatusRequest),
  outgoing: z.array(StatusRequest),
  connectedCount: z.number().int().min(0),
  team: z
    .object({
      id: Uuid,
      name: z.string(),
      isOwner: z.boolean(),
      size: z.number().int().min(1),
      maxSize: z.number().int().min(1),
      wantedSkills: z.array(z.string()),
    })
    .nullable(),
  helpRequests: z.array(
    z.object({ id: Uuid, title: z.string(), status: HelpStatus, mentor: PersonSummary.nullable(), createdAt: Timestamp }),
  ),
});
export type StatusCard = z.infer<typeof StatusCard>;

export const toolOutputs = {
  search_people: SearchResult,
  get_profile: PersonDetail,
  draft_intro: DraftCard,
  draft_help_request: HelpRequestCard,
  my_status: StatusCard,
} as const;

// Client-side tool: the UI shows chips and returns the tapped (or typed) answer.
export const askWithOptions = {
  input: z.object({
    // The short line before the question that answers what they just said. Required so the
    // model always writes it; questions saved before it existed load with "" (history.ts).
    say: z.string().max(200)
      .describe("One short line that responds to what they just said, e.g. a greeting by first name or a quick thanks."),
    question: z.string().min(1).max(200),
    options: z.array(z.string().min(1).max(60)).min(2).max(6),
  }),
  // skipped: set by the server when a new message arrived instead of an answer.
  output: z.object({ answer: z.string().trim().min(1).max(500), skipped: z.boolean().optional() }),
} as const;
export type AskWithOptionsInput = z.infer<typeof askWithOptions.input>;
export type AskWithOptionsOutput = z.infer<typeof askWithOptions.output>;

// The client sends only the newest UIMessage (a new user message, or the
// assistant message carrying an ask_with_options answer). The server loads
// history itself and never trusts history from the client. UIMessages are
// validated by the AI SDK, so the message stays unknown here. Extra keys the
// transport adds (id, trigger, messageId) pass through.
export const ChatBody = z.looseObject({
  eventSlug: Slug,
  message: z.unknown(),
});
export type ChatBody = z.infer<typeof ChatBody>;

export const ChatHistory = z.object({ messages: z.array(z.unknown()) });
export type ChatHistory = z.infer<typeof ChatHistory>;

// ---------------------------------------------------------------------------
// Live updates (WebSocket from the Neon Function). They only notify: add the
// row, skip ids already on screen, refetch after a reconnect.
// ---------------------------------------------------------------------------

export const RealtimeTokenBody = z.object({ eventSlug: Slug });
export const RealtimeToken = z.object({
  token: z.string(),
  url: z.url({ protocol: /^wss?$/ }),
  expiresAt: Timestamp,
});
export type RealtimeToken = z.infer<typeof RealtimeToken>;

// A message for an unknown conversationId means a new conversation: refetch the list.
export const LiveEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message-new"), message: Message }),
  z.object({ type: z.literal("request-new"), request: ConnectionRequest }),
  z.object({ type: z.literal("request-updated"), request: ConnectionRequest }),
  z.object({ type: z.literal("help-new"), helpRequest: HelpRequest, fit: HelpFit.optional() }),
  z.object({ type: z.literal("help-claimed"), helpRequest: HelpRequest }),
]);
export type LiveEvent = z.infer<typeof LiveEvent>;

// ---------------------------------------------------------------------------
// Demo portal (DEMO_MODE=true only)
// ---------------------------------------------------------------------------

export const DemoPerson = PublicProfile.pick({
  userId: true,
  handle: true,
  name: true,
  hackyStyle: true,
  photoUrl: true,
}).extend({ events: z.array(MyEvent) });
export type DemoPerson = z.infer<typeof DemoPerson>;

export const DemoSignInBody = z.object({ userId: UserId });

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const SlugParams = z.object({ slug: Slug });
const IdParams = z.object({ id: Uuid });

type Endpoint = {
  method: "GET" | "POST" | "PATCH";
  path: `/api/${string}`;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType | null; // null: not JSON
};

export const endpoints = {
  health: {
    method: "GET",
    path: "/api/health",
    response: z.object({ ok: z.boolean(), databaseTime: z.string().nullable() }),
  },

  me: { method: "GET", path: "/api/me", response: Me },
  updateProfile: {
    method: "PATCH",
    path: "/api/me/profile",
    body: UpdateProfileBody,
    response: PublicProfile,
  },

  event: { method: "GET", path: "/api/events/:slug", params: SlugParams, response: EventInfo },
  eventMe: { method: "GET", path: "/api/events/:slug/me", params: SlugParams, response: EventMe },
  updateEventMe: {
    method: "PATCH",
    path: "/api/events/:slug/me",
    params: SlugParams,
    body: UpdateEventMeBody,
    response: EventMe,
  },
  person: {
    method: "GET",
    path: "/api/events/:slug/people/:handle",
    params: z.object({ slug: Slug, handle: Handle }),
    response: PersonDetail,
  },

  team: {
    method: "GET",
    path: "/api/events/:slug/teams/:id",
    params: z.object({ slug: Slug, id: Uuid }),
    response: TeamDetail,
  },

  // Response is an AI SDK UI message stream.
  chat: { method: "POST", path: "/api/chat", body: ChatBody, response: null },
  chatHistory: {
    method: "GET",
    path: "/api/events/:slug/chat",
    params: SlugParams,
    response: ChatHistory,
  },

  requests: {
    method: "GET",
    path: "/api/events/:slug/requests",
    params: SlugParams,
    response: z.object({ requests: z.array(ConnectionRequest) }),
  },
  sendRequest: {
    method: "POST",
    path: "/api/events/:slug/requests",
    params: SlugParams,
    body: SendRequestBody,
    response: RequestResult,
  },
  acceptRequest: {
    method: "POST",
    path: "/api/requests/:id/accept",
    params: IdParams,
    response: RequestResult,
  },
  hideRequest: { method: "POST", path: "/api/requests/:id/hide", params: IdParams, response: Ok },
  block: { method: "POST", path: "/api/blocks", body: BlockBody, response: Ok },

  conversations: {
    method: "GET",
    path: "/api/events/:slug/conversations",
    params: SlugParams,
    response: z.object({ conversations: z.array(ConversationSummary) }),
  },
  messages: {
    method: "GET",
    path: "/api/conversations/:id/messages",
    params: IdParams,
    query: MessagesQuery,
    response: MessagePage,
  },
  sendMessage: {
    method: "POST",
    path: "/api/conversations/:id/messages",
    params: IdParams,
    body: SendMessageBody,
    response: z.object({ message: Message }),
  },
  markRead: {
    method: "POST",
    path: "/api/conversations/:id/read",
    params: IdParams,
    response: z.object({ lastReadAt: Timestamp }),
  },

  createHelpRequest: {
    method: "POST",
    path: "/api/events/:slug/help-requests",
    params: SlugParams,
    body: HelpRequestDraft,
    response: HelpRequestResult,
  },
  helpQueue: {
    method: "GET",
    path: "/api/events/:slug/help-queue",
    params: SlugParams,
    response: HelpQueue,
  },
  claimHelpRequest: {
    method: "POST",
    path: "/api/help-requests/:id/claim",
    params: IdParams,
    response: HelpRequestResult, // includes the new mentor conversationId
  },
  resolveHelpRequest: {
    method: "POST",
    path: "/api/help-requests/:id/resolve",
    params: IdParams,
    response: HelpRequestResult,
  },

  realtimeToken: {
    method: "POST",
    path: "/api/realtime/token",
    body: RealtimeTokenBody,
    response: RealtimeToken,
  },

  demoPeople: {
    method: "GET",
    path: "/api/demo/people",
    response: z.object({ people: z.array(DemoPerson) }),
  },
  // Starts a Better Auth session cookie for that seeded user.
  demoSignIn: { method: "POST", path: "/api/demo/sign-in", body: DemoSignInBody, response: Me },
} as const satisfies Record<string, Endpoint>;

export type Endpoints = typeof endpoints;
