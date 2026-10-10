-- Core schema for Hacky: people, events, matching data, requests, chats and
-- mentor help. Security (RLS, privileges, helper functions, realtime) lives
-- in the next migration. Feature tables (teams, "Not now", reports, ticket
-- sign-in) come in their own migrations when those features are built.

create extension if not exists vector with schema extensions;

-- Holds helper and trigger functions. Not exposed through the API.
create schema if not exists private;

create type public.member_role as enum ('hacker', 'mentor', 'sponsor', 'organizer');
create type public.availability as enum ('available', 'busy', 'offline');
create type public.experience_level as enum ('beginner', 'intermediate', 'advanced');
create type public.hack_goal as enum ('win', 'learn', 'ship');
create type public.embedding_owner as enum ('member', 'team');
create type public.connection_status as enum ('pending', 'accepted');
create type public.connection_source as enum ('agent', 'qr', 'profile');
create type public.conversation_kind as enum ('dm', 'mentor');
create type public.message_kind as enum ('text', 'card', 'system');
create type public.help_status as enum ('open', 'claimed', 'resolved');

create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- People and events
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  name text not null check (char_length(name) between 1 and 80),
  -- The person's customized Hacky character, shown as their avatar.
  -- Options are still being designed, so the app validates the shape (Zod).
  hacky_style jsonb not null default '{}'::jsonb check (jsonb_typeof(hacky_style) = 'object'),
  bio text check (char_length(bio) <= 500),
  links jsonb not null default '{}'::jsonb check (jsonb_typeof(links) = 'object'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Every new auth user gets a profile. Name and handle come from user
-- metadata; is_demo comes from app metadata, which users can't edit.
create function private.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handle text := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'handle', ''), '[^a-zA-Z0-9_]', '', 'g'));
begin
  if v_handle !~ '^[a-z0-9_]{3,30}$'
     or exists (select 1 from public.profiles p where p.handle = v_handle) then
    v_handle := 'hacker_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  insert into public.profiles (id, handle, name, is_demo)
  values (
    new.id,
    v_handle,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Hacker'
    ),
    coalesce((new.raw_app_meta_data ->> 'is_demo')::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  theme jsonb not null default '{}'::jsonb check (jsonb_typeof(theme) = 'object'),
  tracks text[] not null default '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'hacker',
  verified boolean not null default false,
  availability public.availability not null default 'available',
  looking boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_members_user_idx on public.event_members (user_id);

-- ---------------------------------------------------------------------------
-- Matching data
-- ---------------------------------------------------------------------------

-- What the agent learns about one person at one event. search_tsv is kept
-- by a trigger and feeds keyword search.
create table public.member_profiles (
  event_id uuid not null,
  user_id uuid not null,
  skills text[] not null default '{}',
  skills_wanted text[] not null default '{}',
  experience public.experience_level,
  wants_experienced boolean not null default false,
  goal public.hack_goal,
  track text,
  interests text[] not null default '{}',
  idea text check (char_length(idea) <= 1000),
  summary text check (char_length(summary) <= 1000),
  complete boolean not null default false,
  search_tsv tsvector,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (event_id, user_id) references public.event_members (event_id, user_id) on delete cascade
);

create index member_profiles_search_idx on public.member_profiles using gin (search_tsv);

create function private.member_profiles_search_tsv() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('english', array_to_string(new.skills, ' ')), 'A') ||
    setweight(to_tsvector('english', concat_ws(' ', array_to_string(new.interests, ' '), new.track)), 'B') ||
    setweight(to_tsvector('english', concat_ws(' ', new.idea, new.summary)), 'C');
  new.updated_at := now();
  return new;
end;
$$;

create trigger member_profiles_search_tsv
  before insert or update on public.member_profiles
  for each row execute function private.member_profiles_search_tsv();

-- Private: no client access. Only RPCs and the server read it.
create table public.embeddings (
  event_id uuid not null references public.events (id) on delete cascade,
  owner_kind public.embedding_owner not null,
  owner_id uuid not null,
  embedding extensions.vector(768) not null,
  updated_at timestamptz not null default now(),
  primary key (event_id, owner_kind, owner_id)
);

create index embeddings_hnsw_idx on public.embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Requests and blocks
-- ---------------------------------------------------------------------------

-- One request per person per event.
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  status public.connection_status not null default 'pending',
  intro text not null check (char_length(intro) between 1 and 500),
  source public.connection_source not null default 'agent',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint connections_one_per_pair unique (event_id, from_user, to_user),
  constraint connections_not_self check (from_user <> to_user)
);

create index connections_to_user_idx on public.connections (to_user, status);
create index connections_from_user_idx on public.connections (from_user);

-- Applies everywhere and in both directions. Doesn't need a request to exist.
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

-- ---------------------------------------------------------------------------
-- Mentor help
-- ---------------------------------------------------------------------------

-- Created only from the "Request help" button, through an RPC.
create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  hacker_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  details text check (char_length(details) <= 2000),
  skills_needed text[] not null default '{}',
  status public.help_status not null default 'open',
  mentor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  resolved_at timestamptz,
  constraint help_requests_claim_shape check (
    (status = 'open' and mentor_id is null)
    or (status <> 'open' and mentor_id is not null)
  )
);

create index help_requests_queue_idx on public.help_requests (event_id, status, created_at);
create index help_requests_hacker_idx on public.help_requests (hacker_id);

-- ---------------------------------------------------------------------------
-- Conversations and messages
-- ---------------------------------------------------------------------------

-- A DM is unique per pair per event, so accepting twice (or a mutual request)
-- returns the same conversation. A mentor chat is unique per help request.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind public.conversation_kind not null,
  dm_user_low uuid references public.profiles (id) on delete cascade,
  dm_user_high uuid references public.profiles (id) on delete cascade,
  help_request_id uuid unique references public.help_requests (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_shape check (
    (kind = 'dm' and dm_user_low is not null and dm_user_high is not null
      and dm_user_low < dm_user_high and help_request_id is null)
    or (kind = 'mentor' and help_request_id is not null
      and dm_user_low is null and dm_user_high is null)
  )
);

create unique index conversations_one_dm_per_pair
  on public.conversations (event_id, dm_user_low, dm_user_high)
  where kind = 'dm';

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);

-- client_id lets the UI match its instant copy of a sent message.
-- sender_id is null for system messages.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid default auth.uid() references public.profiles (id) on delete set null,
  client_id uuid,
  body text not null check (char_length(body) between 1 and 4000),
  kind public.message_kind not null default 'text',
  created_at timestamptz not null default now(),
  constraint messages_one_per_client_id unique (sender_id, client_id)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Agent chat history
-- ---------------------------------------------------------------------------

create table public.agent_messages (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  id text not null,
  event_id uuid not null references public.events (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  parts jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index agent_messages_thread_idx on public.agent_messages (user_id, event_id, created_at);
