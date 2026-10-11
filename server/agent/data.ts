// Database reads and writes for the agent. Every function takes the signed-in
// user's id and the event id from the chat route (never from the model), and
// returns only public fields: no emails, no embeddings.
import { and, eq, sql, type SQL } from "drizzle-orm";
import type {
  Availability,
  ConnectionStatus,
  HackGoal,
  HelpStatus,
  Intake,
  MemberRole,
  Motivation,
  PersonDetail,
  PersonSummary,
  Relation,
  TeamDetail,
  TeamRef,
  UpdateEventMeBody,
} from "../../shared/contract.js";
import { db } from "../db/index.js";
import { eventMembers, events, memberProfiles, profiles } from "../db/schema.js";
import { toPublicProfile } from "../routes/me.js";
import type { SkillArea } from "../matching/index.js";

type MemberProfileRow = typeof memberProfiles.$inferSelect;

// ---------------------------------------------------------------------------
// Chat context: the event, the member and their intake
// ---------------------------------------------------------------------------

export type ChatContext = {
  userId: string;
  eventId: string;
  event: { slug: string; name: string; tracks: string[] };
  me: { name: string; handle: string; role: MemberRole };
  intake: Intake;
  /**
   * Areas the online verified mentors cover (POST /api/chat loads it once per
   * request for hackers). The prompt offers them as chips when someone asks
   * for a mentor without saying what for. Absent: not loaded.
   */
  mentorAreas?: { areas: SkillArea[]; other: string[] };
};

/** The event by slug, and the user's membership, profile and intake in it. */
export async function loadChatContext(
  slug: string,
  userId: string,
): Promise<{ found: false } | { found: true; member: false } | { found: true; member: true; ctx: ChatContext }> {
  const [row] = await db
    .select({ event: events, member: eventMembers, profile: profiles, intake: memberProfiles })
    .from(events)
    .leftJoin(eventMembers, and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)))
    .leftJoin(profiles, eq(profiles.userId, eventMembers.userId))
    .leftJoin(
      memberProfiles,
      and(eq(memberProfiles.eventId, events.id), eq(memberProfiles.userId, eventMembers.userId)),
    )
    .where(eq(events.slug, slug))
    .limit(1);
  if (!row) return { found: false };
  if (!row.member || !row.profile) return { found: true, member: false };
  return {
    found: true,
    member: true,
    ctx: {
      userId,
      eventId: row.event.id,
      event: { slug: row.event.slug, name: row.event.name, tracks: row.event.tracks },
      me: { name: row.profile.name, handle: row.profile.handle, role: row.member.role },
      intake: toIntake(row.intake ?? undefined),
    },
  };
}

// ---------------------------------------------------------------------------
// Intake (same rules as PATCH /api/events/:slug/me in server/routes/events.ts)
// ---------------------------------------------------------------------------

const emptyIntake: Intake = {
  skills: [],
  skillsWanted: [],
  experience: null,
  wantsExperienced: false,
  goal: null,
  track: null,
  interests: [],
  idea: null,
  motivations: [],
  summary: null,
  complete: false,
};

export function toIntake(row: MemberProfileRow | undefined): Intake {
  if (!row) return emptyIntake;
  return {
    skills: row.skills,
    skillsWanted: row.skillsWanted,
    experience: row.experience,
    wantsExperienced: row.wantsExperienced,
    goal: row.goal,
    track: row.track,
    interests: row.interests,
    idea: row.idea,
    motivations: row.motivations as Motivation[],
    summary: row.summary,
    complete: row.complete,
  };
}

/** Enough to be matched: what they can do and what they're here for. */
export const isComplete = (row: Pick<Intake, "skills" | "goal">) =>
  row.skills.length > 0 && row.goal !== null;

/** Case-insensitive dedupe, keeping the first spelling. */
export function uniqueTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const emptyToNull = (value: string | null) => (value === "" ? null : value);

export type IntakeChanges = Omit<UpdateEventMeBody, "availability" | "looking"> & {
  summary?: string | null;
};

/** Upserts the member profile and recomputes `complete`. Returns the saved intake. */
export async function saveIntake(eventId: string, userId: string, body: IntakeChanges): Promise<Intake> {
  const changes: Partial<typeof memberProfiles.$inferInsert> = {};
  if (body.skills !== undefined) changes.skills = uniqueTags(body.skills);
  if (body.skillsWanted !== undefined) changes.skillsWanted = uniqueTags(body.skillsWanted);
  if (body.interests !== undefined) changes.interests = uniqueTags(body.interests);
  if (body.experience !== undefined) changes.experience = body.experience;
  if (body.wantsExperienced !== undefined) changes.wantsExperienced = body.wantsExperienced;
  if (body.goal !== undefined) changes.goal = body.goal;
  if (body.track !== undefined) changes.track = emptyToNull(body.track);
  if (body.idea !== undefined) changes.idea = emptyToNull(body.idea);
  if (body.motivations !== undefined) changes.motivations = [...new Set(body.motivations)];
  if (body.summary !== undefined) changes.summary = emptyToNull(body.summary);

  const where = and(eq(memberProfiles.eventId, eventId), eq(memberProfiles.userId, userId));
  if (Object.keys(changes).length === 0) {
    const [row] = await db.select().from(memberProfiles).where(where).limit(1);
    return toIntake(row);
  }

  let [row] = await db
    .insert(memberProfiles)
    .values({ eventId, userId, ...changes })
    .onConflictDoUpdate({ target: [memberProfiles.eventId, memberProfiles.userId], set: changes })
    .returning();
  if (row && row.complete !== isComplete(row)) {
    [row] = await db
      .update(memberProfiles)
      .set({ complete: isComplete(row) })
      .where(where)
      .returning();
  }
  return toIntake(row);
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** No block in either direction between two users. */
const notBlocked = (a: SQL | string, b: string) => sql`not exists (
  select 1 from blocks b
  where (b.blocker_id = ${a} and b.blocked_id = ${b}) or (b.blocker_id = ${b} and b.blocked_id = ${a})
)`;

type PersonRow = {
  user_id: string;
  handle: string;
  name: string;
  hacky_style: Record<string, unknown> | null;
  photo_url: string | null;
  bio: string | null;
  links: Record<string, string> | null;
  is_demo: boolean;
  role: MemberRole;
  verified: boolean;
  availability: Availability;
  looking: boolean;
  skills: string[];
  skills_wanted: string[];
  experience: PersonDetail["experience"];
  goal: HackGoal | null;
  track: string | null;
  interests: string[];
  idea: string | null;
  summary: string | null;
  motivations: string[];
};

/**
 * A member of this event by handle, as the viewer may see them. null when the
 * handle isn't in this event or a block hides them (both look like "not found").
 */
export async function findMember(eventId: string, viewerId: string, handle: string) {
  const { rows } = await db.execute<PersonRow>(sql`
    select p.user_id, p.handle, p.name, p.hacky_style, p.photo_url, p.bio, p.links, p.is_demo,
      em.role, em.verified, em.availability, em.looking,
      coalesce(mp.skills, '{}') as skills, coalesce(mp.skills_wanted, '{}') as skills_wanted,
      mp.experience, mp.goal, mp.track, coalesce(mp.interests, '{}') as interests,
      mp.idea, mp.summary, coalesce(mp.motivations, '{}') as motivations
    from profiles p
    join event_members em on em.user_id = p.user_id and em.event_id = ${eventId}
    left join member_profiles mp on mp.event_id = em.event_id and mp.user_id = em.user_id
    where p.handle = ${handle} and ${notBlocked(sql`p.user_id`, viewerId)}
    limit 1
  `);
  return rows[0] ?? null;
}

export function toSummary(
  row: Pick<PersonRow, "user_id" | "handle" | "name" | "hacky_style" | "photo_url" | "role">,
): PersonSummary {
  return {
    userId: row.user_id,
    handle: row.handle,
    name: row.name,
    hackyStyle: row.hacky_style ?? {},
    photoUrl: row.photo_url,
    role: row.role,
  };
}

/** Where the viewer stands with another member of this event. */
export async function relationWith(eventId: string, viewerId: string, otherId: string): Promise<Relation> {
  if (viewerId === otherId) return { state: "none", requestId: null, conversationId: null };
  const { rows } = await db.execute<{ id: string; from_user: string; status: ConnectionStatus }>(sql`
    select id, from_user, status from connections
    where event_id = ${eventId}
      and ((from_user = ${viewerId} and to_user = ${otherId}) or (from_user = ${otherId} and to_user = ${viewerId}))
    order by created_at
  `);
  const accepted = rows.find((r) => r.status === "accepted");
  if (accepted) {
    const [low, high] = viewerId < otherId ? [viewerId, otherId] : [otherId, viewerId];
    const conv = await db.execute<{ id: string }>(sql`
      select id from conversations
      where kind = 'dm' and event_id = ${eventId} and dm_user_low = ${low} and dm_user_high = ${high}
      limit 1
    `);
    return { state: "accepted", requestId: accepted.id, conversationId: conv.rows[0]?.id ?? null };
  }
  const outgoing = rows.find((r) => r.from_user === viewerId);
  if (outgoing) return { state: "outgoing", requestId: outgoing.id, conversationId: null };
  const incoming = rows.find((r) => r.from_user === otherId);
  if (incoming) return { state: "incoming", requestId: incoming.id, conversationId: null };
  return { state: "none", requestId: null, conversationId: null };
}

/** The public profile of a member of this event (get_profile). */
export async function personDetail(eventId: string, viewerId: string, handle: string): Promise<PersonDetail | null> {
  const row = await findMember(eventId, viewerId, handle);
  if (!row) return null;
  const pub = toPublicProfile({
    userId: row.user_id,
    handle: row.handle,
    name: row.name,
    hackyStyle: row.hacky_style ?? {},
    photoUrl: row.photo_url,
    bio: row.bio,
    links: row.links ?? {},
    isDemo: row.is_demo,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });
  return {
    ...pub,
    role: row.role,
    verified: row.verified,
    availability: row.availability,
    looking: row.looking,
    skills: row.skills,
    skillsWanted: row.skills_wanted,
    experience: row.experience,
    goal: row.goal,
    track: row.track,
    interests: row.interests,
    idea: row.idea,
    summary: row.summary,
    motivations: row.motivations as Motivation[],
    relation: await relationWith(eventId, viewerId, row.user_id),
  };
}

/** A team and its members, lead first. Null if it isn't in this event or its lead is blocked. */
export async function teamDetail(eventId: string, viewerId: string, teamId: string): Promise<TeamDetail | null> {
  const { rows: teams } = await db.execute<{
    id: string; name: string; idea: string | null; track: string | null; wanted_skills: string[]; max_size: number;
    owner_id: string; size: number;
  }>(sql`
    select t.id, t.name, t.idea, t.track, t.wanted_skills, t.max_size, t.owner_id,
           (select count(*) from team_members tm where tm.team_id = t.id and tm.user_id <> t.owner_id)::int + 1 as size
    from teams t
    where t.id = ${teamId} and t.event_id = ${eventId} and ${notBlocked(sql`t.owner_id`, viewerId)}
    limit 1
  `);
  const team = teams[0];
  if (!team) return null;
  const { rows: people } = await db.execute<Pick<PersonRow, "user_id" | "handle" | "name" | "hacky_style" | "photo_url" | "role">>(sql`
    select p.user_id, p.handle, p.name, p.hacky_style, p.photo_url, em.role
    from profiles p
    join event_members em on em.user_id = p.user_id and em.event_id = ${eventId}
    where (p.user_id = ${team.owner_id}
           or p.user_id in (select tm.user_id from team_members tm where tm.team_id = ${teamId}))
      and ${notBlocked(sql`p.user_id`, viewerId)}
    order by (p.user_id = ${team.owner_id}) desc, p.name
  `);
  const owner = people.find((p) => p.user_id === team.owner_id);
  if (!owner) return null;
  return {
    id: team.id,
    name: team.name,
    idea: team.idea,
    track: team.track,
    wantedSkills: team.wanted_skills,
    size: team.size,
    maxSize: team.max_size,
    owner: toSummary(owner),
    members: people.map(toSummary),
  };
}

/**
 * A team ownerId leads in this event, matched by id or name (case-insensitive); their
 * only team when nothing matches. For "Contact team" drafts, so the model never needs ids.
 */
export async function teamLedBy(eventId: string, ownerId: string, nameOrId: string): Promise<TeamRef | null> {
  const { rows } = await db.execute<{ id: string; name: string }>(sql`
    select id, name from teams where event_id = ${eventId} and owner_id = ${ownerId} order by created_at
  `);
  const key = nameOrId.trim().toLowerCase();
  return rows.find((t) => t.id === key || t.name.toLowerCase() === key) ?? (rows.length === 1 ? rows[0]! : null);
}

// ---------------------------------------------------------------------------
// my_status
// ---------------------------------------------------------------------------

type RequestRow = {
  id: string;
  from_user: string;
  intro: string;
  created_at: string | Date;
  team_id: string | null;
  team_name: string | null;
  user_id: string;
  handle: string;
  name: string;
  hacky_style: Record<string, unknown> | null;
  photo_url: string | null;
  role: MemberRole;
};

const isoOf = (value: string | Date) => new Date(value).toISOString();

export type StatusData = {
  incoming: StatusRequest[];
  outgoing: StatusRequest[];
  connectedCount: number;
  team: { id: string; name: string; isOwner: boolean; size: number; maxSize: number; wantedSkills: string[] } | null;
  helpRequests: { id: string; title: string; status: HelpStatus; mentor: PersonSummary | null; createdAt: string }[];
};
type StatusRequest = { id: string; person: PersonSummary; intro: string; team: TeamRef | null; createdAt: string };

/**
 * The team they lead or are on in this event (the one they lead first), or null. size counts the
 * owner. my_status and GET /api/events/:slug/me/team (the event dashboard) both read it.
 */
export async function myTeam(eventId: string, userId: string): Promise<StatusData["team"]> {
  const { rows } = await db.execute<{ id: string; name: string; owner_id: string; max_size: number; wanted_skills: string[]; size: number }>(sql`
    select t.id, t.name, t.owner_id, t.max_size, t.wanted_skills,
      (select count(*) from team_members tm where tm.team_id = t.id and tm.user_id <> t.owner_id)::int + 1 as size
    from teams t
    where t.event_id = ${eventId}
      and (t.owner_id = ${userId} or exists (select 1 from team_members tm where tm.team_id = t.id and tm.user_id = ${userId}))
    order by (t.owner_id = ${userId}) desc, t.created_at
    limit 1
  `);
  const t = rows[0];
  return t
    ? { id: t.id, name: t.name, isOwner: t.owner_id === userId, size: t.size, maxSize: t.max_size, wantedSkills: t.wanted_skills }
    : null;
}

/** Read-only: pending requests both ways, my team, my open help requests. */
export async function myStatus(eventId: string, userId: string): Promise<StatusData> {
  const [requests, connected, team, help] = await Promise.all([
    db.execute<RequestRow>(sql`
      select c.id, c.from_user, c.intro, c.created_at, t.id as team_id, t.name as team_name,
        p.user_id, p.handle, p.name, p.hacky_style, p.photo_url, em.role
      from connections c
      join profiles p on p.user_id = case when c.from_user = ${userId} then c.to_user else c.from_user end
      join event_members em on em.event_id = c.event_id and em.user_id = p.user_id
      left join teams t on t.id = c.team_id
      where c.event_id = ${eventId} and c.status = 'pending'
        and ((c.from_user = ${userId}) or (c.to_user = ${userId} and c.hidden_at is null))
        and ${notBlocked(sql`p.user_id`, userId)}
      order by c.created_at desc
      limit 40
    `),
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from connections c
      where c.event_id = ${eventId} and c.status = 'accepted'
        and (c.from_user = ${userId} or c.to_user = ${userId})
    `),
    myTeam(eventId, userId),
    db.execute<{
      id: string;
      title: string;
      status: HelpStatus;
      created_at: string | Date;
      user_id: string | null;
      handle: string | null;
      name: string | null;
      hacky_style: Record<string, unknown> | null;
      photo_url: string | null;
      role: MemberRole | null;
    }>(sql`
      select h.id, h.title, h.status, h.created_at, p.user_id, p.handle, p.name, p.hacky_style, p.photo_url, em.role
      from help_requests h
      left join profiles p on p.user_id = h.mentor_id
      left join event_members em on em.event_id = h.event_id and em.user_id = h.mentor_id
      where h.event_id = ${eventId} and h.hacker_id = ${userId} and h.status in ('open', 'claimed')
      order by h.created_at desc
      limit 10
    `),
  ]);

  const toRequest = (r: RequestRow): StatusRequest => ({
    id: r.id,
    person: toSummary(r),
    intro: r.intro,
    team: r.team_id && r.team_name ? { id: r.team_id, name: r.team_name } : null,
    createdAt: isoOf(r.created_at),
  });
  return {
    incoming: requests.rows.filter((r) => r.from_user !== userId).map(toRequest),
    outgoing: requests.rows.filter((r) => r.from_user === userId).map(toRequest),
    connectedCount: connected.rows[0]?.n ?? 0,
    team,
    helpRequests: help.rows.map((h) => ({
      id: h.id,
      title: h.title,
      status: h.status,
      mentor:
        h.user_id && h.handle && h.name && h.role
          ? toSummary({
              user_id: h.user_id,
              handle: h.handle,
              name: h.name,
              hacky_style: h.hacky_style,
              photo_url: h.photo_url,
              role: h.role,
            })
          : null,
      createdAt: isoOf(h.created_at),
    })),
  };
}
