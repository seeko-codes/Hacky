-- Security for Hacky: helper functions, table privileges, RLS policies and
-- realtime.
--
-- Rules:
--   * anon gets nothing.
--   * Signed-in users read what their events and conversations allow.
--   * Requests, conversations, help requests and blocks change only through
--     RPCs (added in a later migration), so users can't write them directly.
--   * embeddings is server-only (service role and security-definer RPCs).
--   * New tables in later migrations must repeat the anon/authenticated
--     revokes below, because Supabase grants them access by default.

-- ---------------------------------------------------------------------------
-- Helper functions (private schema, not exposed through the API)
-- ---------------------------------------------------------------------------

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create function private.is_event_member(p_event uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_members m
    where m.event_id = p_event
      and m.user_id = (select auth.uid())
  );
$$;

create function private.event_role(p_event uuid) returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.event_members m
  where m.event_id = p_event
    and m.user_id = (select auth.uid());
$$;

create function private.is_verified_mentor(p_event uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_members m
    where m.event_id = p_event
      and m.user_id = (select auth.uid())
      and m.role = 'mentor'
      and m.verified
  );
$$;

create function private.shares_event_with(p_user uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_members mine
    join public.event_members theirs on theirs.event_id = mine.event_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user
  );
$$;

create function private.is_conversation_member(p_conversation uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.user_id = (select auth.uid())
  );
$$;

-- Member of the conversation, and no block in either direction with anyone in it.
create function private.can_post_message(p_conversation uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_conversation_member(p_conversation)
    and not exists (
      select 1
      from public.conversation_members other
      join public.blocks b
        on (b.blocker_id = other.user_id and b.blocked_id = (select auth.uid()))
        or (b.blocked_id = other.user_id and b.blocker_id = (select auth.uid()))
      where other.conversation_id = p_conversation
        and other.user_id <> (select auth.uid())
    );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.is_event_member(uuid),
  private.event_role(uuid),
  private.is_verified_mentor(uuid),
  private.shares_event_with(uuid),
  private.is_conversation_member(uuid),
  private.can_post_message(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;

-- Signed-in users write only these columns directly.
revoke insert, update, delete, truncate on all tables in schema public from authenticated;

grant update (name, hacky_style, bio, links) on public.profiles to authenticated;

grant update (availability, looking) on public.event_members to authenticated;

grant insert (event_id, user_id, skills, skills_wanted, experience, wants_experienced,
              goal, track, interests, idea, summary, complete),
      update (skills, skills_wanted, experience, wants_experienced,
              goal, track, interests, idea, summary, complete)
  on public.member_profiles to authenticated;

grant insert (conversation_id, body, client_id) on public.messages to authenticated;

grant insert (id, event_id, role, parts) on public.agent_messages to authenticated;

revoke all on public.embeddings from authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.member_profiles enable row level security;
alter table public.embeddings enable row level security;
alter table public.connections enable row level security;
alter table public.blocks enable row level security;
alter table public.help_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.agent_messages enable row level security;

-- embeddings: RLS on and no policies, so only the service role and
-- security-definer RPCs reach it.

create policy "profiles: read yourself and people in your events"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_event_with(id));

create policy "profiles: update your own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "events: read events you belong to"
  on public.events for select to authenticated
  using (private.is_event_member(id));

create policy "event_members: read members of your events"
  on public.event_members for select to authenticated
  using (private.is_event_member(event_id));

create policy "event_members: update your own availability"
  on public.event_members for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "member_profiles: read profiles in your events"
  on public.member_profiles for select to authenticated
  using (private.is_event_member(event_id));

create policy "member_profiles: create your own"
  on public.member_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_event_member(event_id));

create policy "member_profiles: update your own"
  on public.member_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "connections: read requests you sent or received"
  on public.connections for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

create policy "blocks: read people you blocked"
  on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "help_requests: read your own, your claims, or your event's queue as a verified mentor"
  on public.help_requests for select to authenticated
  using (
    hacker_id = (select auth.uid())
    or mentor_id = (select auth.uid())
    or private.is_verified_mentor(event_id)
  );

create policy "conversations: read conversations you are in"
  on public.conversations for select to authenticated
  using (private.is_conversation_member(id));

create policy "conversation_members: read members of your conversations"
  on public.conversation_members for select to authenticated
  using (private.is_conversation_member(conversation_id));

create policy "messages: read messages in your conversations"
  on public.messages for select to authenticated
  using (private.is_conversation_member(conversation_id));

create policy "messages: send in your conversations unless blocked"
  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.can_post_message(conversation_id));

create policy "agent_messages: read your own chat"
  on public.agent_messages for select to authenticated
  using (user_id = (select auth.uid()));

create policy "agent_messages: save to your own chat"
  on public.agent_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_event_member(event_id));

-- ---------------------------------------------------------------------------
-- Realtime (delivers only rows the subscriber's RLS lets them select)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.messages, public.connections, public.help_requests, public.conversation_members;
