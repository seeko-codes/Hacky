CREATE TYPE "public"."availability" AS ENUM('available', 'busy', 'offline');--> statement-breakpoint
CREATE TYPE "public"."connection_source" AS ENUM('agent', 'qr', 'profile');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."conversation_kind" AS ENUM('dm', 'mentor');--> statement-breakpoint
CREATE TYPE "public"."embedding_owner" AS ENUM('member', 'team');--> statement-breakpoint
CREATE TYPE "public"."experience_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."hack_goal" AS ENUM('win', 'learn', 'ship');--> statement-breakpoint
CREATE TYPE "public"."help_status" AS ENUM('open', 'claimed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('hacker', 'mentor', 'sponsor', 'organizer');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'card', 'system');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_messages_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "agent_messages_role" CHECK ("agent_messages"."role" in ('user', 'assistant', 'system'))
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "blocks_not_self" CHECK ("blocks"."blocker_id" <> "blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"from_user" text NOT NULL,
	"to_user" text NOT NULL,
	"status" "connection_status" DEFAULT 'pending' NOT NULL,
	"intro" text NOT NULL,
	"source" "connection_source" DEFAULT 'agent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "connections_one_per_pair" UNIQUE("event_id","from_user","to_user"),
	CONSTRAINT "connections_not_self" CHECK ("connections"."from_user" <> "connections"."to_user"),
	CONSTRAINT "connections_intro_length" CHECK (char_length("connections"."intro") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_members_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"dm_user_low" text,
	"dm_user_high" text,
	"help_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_help_request_id_unique" UNIQUE("help_request_id"),
	CONSTRAINT "conversations_shape" CHECK (("conversations"."kind" = 'dm' and "conversations"."dm_user_low" is not null and "conversations"."dm_user_high" is not null and "conversations"."dm_user_low" < "conversations"."dm_user_high" and "conversations"."help_request_id" is null)
        or ("conversations"."kind" = 'mentor' and "conversations"."help_request_id" is not null and "conversations"."dm_user_low" is null and "conversations"."dm_user_high" is null))
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"event_id" uuid NOT NULL,
	"owner_kind" "embedding_owner" NOT NULL,
	"owner_id" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "embeddings_event_id_owner_kind_owner_id_pk" PRIMARY KEY("event_id","owner_kind","owner_id")
);
--> statement-breakpoint
CREATE TABLE "event_members" (
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'hacker' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"availability" "availability" DEFAULT 'available' NOT NULL,
	"looking" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_members_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tracks" text[] DEFAULT '{}'::text[] NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug"),
	CONSTRAINT "events_slug_format" CHECK ("events"."slug" ~ '^[a-z0-9-]{2,40}$'),
	CONSTRAINT "events_theme_object" CHECK (jsonb_typeof("events"."theme") = 'object')
);
--> statement-breakpoint
CREATE TABLE "help_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"hacker_id" text NOT NULL,
	"title" text NOT NULL,
	"details" text,
	"skills_needed" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "help_status" DEFAULT 'open' NOT NULL,
	"mentor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "help_requests_title_length" CHECK (char_length("help_requests"."title") between 3 and 120),
	CONSTRAINT "help_requests_details_length" CHECK (char_length("help_requests"."details") <= 2000),
	CONSTRAINT "help_requests_claim_shape" CHECK (("help_requests"."status" = 'open' and "help_requests"."mentor_id" is null) or ("help_requests"."status" <> 'open' and "help_requests"."mentor_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "member_profiles" (
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"skills_wanted" text[] DEFAULT '{}'::text[] NOT NULL,
	"experience" "experience_level",
	"wants_experienced" boolean DEFAULT false NOT NULL,
	"goal" "hack_goal",
	"track" text,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"idea" text,
	"summary" text,
	"complete" boolean DEFAULT false NOT NULL,
	"search_tsv" "tsvector",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_profiles_event_id_user_id_pk" PRIMARY KEY("event_id","user_id"),
	CONSTRAINT "member_profiles_idea_length" CHECK (char_length("member_profiles"."idea") <= 1000),
	CONSTRAINT "member_profiles_summary_length" CHECK (char_length("member_profiles"."summary") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" text,
	"client_id" uuid,
	"body" text NOT NULL,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_one_per_client_id" UNIQUE("sender_id","client_id"),
	CONSTRAINT "messages_body_length" CHECK (char_length("messages"."body") between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"hacky_style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bio" text,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_handle_unique" UNIQUE("handle"),
	CONSTRAINT "profiles_handle_format" CHECK ("profiles"."handle" ~ '^[a-z0-9_]{3,30}$'),
	CONSTRAINT "profiles_name_length" CHECK (char_length("profiles"."name") between 1 and 80),
	CONSTRAINT "profiles_bio_length" CHECK (char_length("profiles"."bio") <= 500),
	CONSTRAINT "profiles_hacky_style_object" CHECK (jsonb_typeof("profiles"."hacky_style") = 'object'),
	CONSTRAINT "profiles_links_object" CHECK (jsonb_typeof("profiles"."links") = 'object')
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_profiles_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_profiles_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_from_user_profiles_user_id_fk" FOREIGN KEY ("from_user") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_to_user_profiles_user_id_fk" FOREIGN KEY ("to_user") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_dm_user_low_profiles_user_id_fk" FOREIGN KEY ("dm_user_low") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_dm_user_high_profiles_user_id_fk" FOREIGN KEY ("dm_user_high") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_help_request_id_help_requests_id_fk" FOREIGN KEY ("help_request_id") REFERENCES "public"."help_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_members" ADD CONSTRAINT "event_members_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_hacker_id_profiles_user_id_fk" FOREIGN KEY ("hacker_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_mentor_id_profiles_user_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_event_id_user_id_event_members_event_id_user_id_fk" FOREIGN KEY ("event_id","user_id") REFERENCES "public"."event_members"("event_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_profiles_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_messages_thread_idx" ON "agent_messages" USING btree ("user_id","event_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_messages_event_idx" ON "agent_messages" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "connections_to_user_idx" ON "connections" USING btree ("to_user","status");--> statement-breakpoint
CREATE INDEX "connections_from_user_idx" ON "connections" USING btree ("from_user");--> statement-breakpoint
CREATE INDEX "conversation_members_user_idx" ON "conversation_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_dm_per_pair" ON "conversations" USING btree ("event_id","dm_user_low","dm_user_high") WHERE "conversations"."kind" = 'dm';--> statement-breakpoint
CREATE INDEX "conversations_dm_user_low_idx" ON "conversations" USING btree ("dm_user_low");--> statement-breakpoint
CREATE INDEX "conversations_dm_user_high_idx" ON "conversations" USING btree ("dm_user_high");--> statement-breakpoint
CREATE INDEX "embeddings_hnsw_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "event_members_user_idx" ON "event_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "help_requests_queue_idx" ON "help_requests" USING btree ("event_id","status","created_at");--> statement-breakpoint
CREATE INDEX "help_requests_hacker_idx" ON "help_requests" USING btree ("hacker_id");--> statement-breakpoint
CREATE INDEX "help_requests_mentor_idx" ON "help_requests" USING btree ("mentor_id");--> statement-breakpoint
CREATE INDEX "member_profiles_search_idx" ON "member_profiles" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");