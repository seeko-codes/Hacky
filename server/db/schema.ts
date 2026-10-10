// Hacky database schema (Neon Postgres). Drizzle generates migrations into
// ./drizzle from this file. Only the backend owner changes it.
//
// Access control lives in server code: the browser never talks to the
// database, so there is no row-level security here. Constraints below are the
// last line of defense for the rules the server enforces.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Better Auth tables (shape required by Better Auth's Drizzle adapter)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const memberRole = pgEnum("member_role", ["hacker", "mentor", "sponsor", "organizer"]);
export const availability = pgEnum("availability", ["available", "busy", "offline"]);
export const experienceLevel = pgEnum("experience_level", ["beginner", "intermediate", "advanced"]);
export const hackGoal = pgEnum("hack_goal", ["win", "learn", "ship"]);
export const embeddingOwner = pgEnum("embedding_owner", ["member", "team"]);
export const connectionStatus = pgEnum("connection_status", ["pending", "accepted"]);
export const connectionSource = pgEnum("connection_source", ["agent", "qr", "profile"]);
export const conversationKind = pgEnum("conversation_kind", ["dm", "mentor"]);
export const messageKind = pgEnum("message_kind", ["text", "card", "system"]);
export const helpStatus = pgEnum("help_status", ["open", "claimed", "resolved"]);

// ---------------------------------------------------------------------------
// People and events
// ---------------------------------------------------------------------------

export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    handle: text("handle").notNull().unique(),
    name: text("name").notNull(),
    // The person's customized Hacky character, shown as their avatar.
    // Options are still being designed, so the app validates the shape (Zod).
    hackyStyle: jsonb("hacky_style").$type<Record<string, unknown>>().notNull().default({}),
    bio: text("bio"),
    links: jsonb("links").$type<Record<string, string>>().notNull().default({}),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("profiles_handle_format", sql`${t.handle} ~ '^[a-z0-9_]{3,30}$'`),
    check("profiles_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check("profiles_bio_length", sql`char_length(${t.bio}) <= 500`),
    check("profiles_hacky_style_object", sql`jsonb_typeof(${t.hackyStyle}) = 'object'`),
    check("profiles_links_object", sql`jsonb_typeof(${t.links}) = 'object'`),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    theme: jsonb("theme").$type<Record<string, unknown>>().notNull().default({}),
    tracks: text("tracks").array().notNull().default(sql`'{}'::text[]`),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("events_slug_format", sql`${t.slug} ~ '^[a-z0-9-]{2,40}$'`),
    check("events_theme_object", sql`jsonb_typeof(${t.theme}) = 'object'`),
  ],
);

export const eventMembers = pgTable(
  "event_members",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("hacker"),
    verified: boolean("verified").notNull().default(false),
    availability: availability("availability").notNull().default("available"),
    looking: boolean("looking").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index("event_members_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Matching data
// ---------------------------------------------------------------------------

// What the agent learns about one person at one event. search_tsv is kept by
// a trigger (see the custom migration) and feeds keyword search.
export const memberProfiles = pgTable(
  "member_profiles",
  {
    eventId: uuid("event_id").notNull(),
    userId: text("user_id").notNull(),
    skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
    skillsWanted: text("skills_wanted").array().notNull().default(sql`'{}'::text[]`),
    experience: experienceLevel("experience"),
    wantsExperienced: boolean("wants_experienced").notNull().default(false),
    goal: hackGoal("goal"),
    track: text("track"),
    interests: text("interests").array().notNull().default(sql`'{}'::text[]`),
    idea: text("idea"),
    summary: text("summary"),
    complete: boolean("complete").notNull().default(false),
    // Why they came (onboarding step 1). Allowed ids are checked below and
    // mirror Motivation in shared/contract.ts.
    motivations: text("motivations").array().notNull().default(sql`'{}'::text[]`),
    searchTsv: tsvector("search_tsv"),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    foreignKey({
      columns: [t.eventId, t.userId],
      foreignColumns: [eventMembers.eventId, eventMembers.userId],
    }).onDelete("cascade"),
    index("member_profiles_search_idx").using("gin", t.searchTsv),
    check("member_profiles_idea_length", sql`char_length(${t.idea}) <= 1000`),
    check("member_profiles_summary_length", sql`char_length(${t.summary}) <= 1000`),
    check(
      "member_profiles_motivations_allowed",
      sql`${t.motivations} <@ array['build', 'learn', 'meet', 'career', 'compete', 'fun']::text[]`,
    ),
  ],
);

// Open teams appear in search. "Contact team" sends a request to the owner.
// Joining teams is not built. search_tsv is kept by a trigger (see the custom
// migration). Embeddings use owner_kind 'team' with owner_id = id as text.
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    idea: text("idea"),
    track: text("track"),
    wantedSkills: text("wanted_skills").array().notNull().default(sql`'{}'::text[]`),
    maxSize: integer("max_size").notNull().default(4),
    searchTsv: tsvector("search_tsv"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.eventId, t.ownerId],
      foreignColumns: [eventMembers.eventId, eventMembers.userId],
    }).onDelete("cascade"),
    check("teams_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check("teams_idea_length", sql`char_length(${t.idea}) <= 1000`),
    check("teams_max_size_range", sql`${t.maxSize} between 1 and 8`),
    index("teams_event_idx").on(t.eventId),
    index("teams_search_idx").using("gin", t.searchTsv),
    index("teams_owner_idx").on(t.ownerId),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    index("team_members_user_idx").on(t.userId),
  ],
);

// Server-only. owner_id is a user id for members and a team id (as text) for teams.
export const embeddings = pgTable(
  "embeddings",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    ownerKind: embeddingOwner("owner_kind").notNull(),
    ownerId: text("owner_id").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.ownerKind, t.ownerId] }),
    index("embeddings_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

// ---------------------------------------------------------------------------
// Requests and blocks
// ---------------------------------------------------------------------------

// One request per person per event. hidden_at: the recipient tapped "Not now"
// (never shown to the sender). team_id: sent with "Contact team"; to_user is
// that team's owner.
export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    fromUser: text("from_user")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    toUser: text("to_user")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    status: connectionStatus("status").notNull().default("pending"),
    intro: text("intro").notNull(),
    source: connectionSource("source").notNull().default("agent"),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  },
  (t) => [
    unique("connections_one_per_pair").on(t.eventId, t.fromUser, t.toUser),
    check("connections_not_self", sql`${t.fromUser} <> ${t.toUser}`),
    check("connections_intro_length", sql`char_length(${t.intro}) between 1 and 500`),
    index("connections_to_user_idx").on(t.toUser, t.status),
    index("connections_from_user_idx").on(t.fromUser),
  ],
);

// Applies everywhere and in both directions. Doesn't need a request to exist.
export const blocks = pgTable(
  "blocks",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    check("blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
    index("blocks_blocked_idx").on(t.blockedId),
  ],
);

// ---------------------------------------------------------------------------
// Mentor help
// ---------------------------------------------------------------------------

// Created only from the "Request help" button.
export const helpRequests = pgTable(
  "help_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    hackerId: text("hacker_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    details: text("details"),
    skillsNeeded: text("skills_needed").array().notNull().default(sql`'{}'::text[]`),
    status: helpStatus("status").notNull().default("open"),
    mentorId: text("mentor_id").references(() => profiles.userId, { onDelete: "set null" }),
    createdAt: createdAt(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    check("help_requests_title_length", sql`char_length(${t.title}) between 3 and 120`),
    check("help_requests_details_length", sql`char_length(${t.details}) <= 2000`),
    check(
      "help_requests_claim_shape",
      sql`(${t.status} = 'open' and ${t.mentorId} is null) or (${t.status} <> 'open' and ${t.mentorId} is not null)`,
    ),
    index("help_requests_queue_idx").on(t.eventId, t.status, t.createdAt),
    index("help_requests_hacker_idx").on(t.hackerId),
    index("help_requests_mentor_idx").on(t.mentorId),
  ],
);

// ---------------------------------------------------------------------------
// Conversations and messages
// ---------------------------------------------------------------------------

// A DM is unique per pair per event, so accepting twice (or a mutual request)
// returns the same conversation. A mentor chat is unique per help request.
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: conversationKind("kind").notNull(),
    dmUserLow: text("dm_user_low").references(() => profiles.userId, { onDelete: "cascade" }),
    dmUserHigh: text("dm_user_high").references(() => profiles.userId, { onDelete: "cascade" }),
    helpRequestId: uuid("help_request_id")
      .unique()
      .references(() => helpRequests.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "conversations_shape",
      sql`(${t.kind} = 'dm' and ${t.dmUserLow} is not null and ${t.dmUserHigh} is not null and ${t.dmUserLow} < ${t.dmUserHigh} and ${t.helpRequestId} is null)
        or (${t.kind} = 'mentor' and ${t.helpRequestId} is not null and ${t.dmUserLow} is null and ${t.dmUserHigh} is null)`,
    ),
    uniqueIndex("conversations_one_dm_per_pair")
      .on(t.eventId, t.dmUserLow, t.dmUserHigh)
      .where(sql`${t.kind} = 'dm'`),
    index("conversations_dm_user_low_idx").on(t.dmUserLow),
    index("conversations_dm_user_high_idx").on(t.dmUserHigh),
  ],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("conversation_members_user_idx").on(t.userId),
  ],
);

// client_id lets the UI match its instant copy of a sent message.
// sender_id is null for system messages.
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id").references(() => profiles.userId, { onDelete: "set null" }),
    clientId: uuid("client_id"),
    body: text("body").notNull(),
    kind: messageKind("kind").notNull().default("text"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("messages_one_per_client_id").on(t.senderId, t.clientId),
    check("messages_body_length", sql`char_length(${t.body}) between 1 and 4000`),
    index("messages_conversation_idx").on(t.conversationId, t.createdAt.desc()),
  ],
);

// ---------------------------------------------------------------------------
// Agent chat history
// ---------------------------------------------------------------------------

export const agentMessages = pgTable(
  "agent_messages",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    id: text("id").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    parts: jsonb("parts").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    check("agent_messages_role", sql`${t.role} in ('user', 'assistant', 'system')`),
    index("agent_messages_thread_idx").on(t.userId, t.eventId, t.createdAt),
    index("agent_messages_event_idx").on(t.eventId),
  ],
);
