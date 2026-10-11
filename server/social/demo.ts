// Demo behavior stays on the server. Delays are awaited by the request, never
// detached timers that a serverless runtime could drop after returning.
import { setTimeout as sleep } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import type { ConnectionRequest, SendRequestBody } from "../../shared/contract.js";
import { isDemoMode } from "../auth.js";
import { db } from "../db/index.js";
import { connections, conversationMembers, conversations, messages, profiles, teamMembers, teams } from "../db/schema.js";
import { withTransaction, type Tx } from "../db/tx.js";
import { ApiFail, fail } from "../routes/http.js";
import { acceptRequest, loadRequestView, sendRequest } from "./requests.js";
import { claimHelpRequest } from "./help.js";
import type { HelpRequest } from "../../shared/contract.js";

export const DEMO_ACCEPT_MS = 2000;
export const acceptanceDelay = (createdAt: string, now = Date.now()) =>
  Math.max(0, Math.min(DEMO_ACCEPT_MS, Date.parse(createdAt) + DEMO_ACCEPT_MS - now));

export async function sendDemoAwareRequest(eventId: string, senderId: string, body: SendRequestBody): Promise<ConnectionRequest> {
  const automatic = isDemoMode();
  let request: ConnectionRequest;
  try {
    request = await sendRequest(eventId, senderId, { ...body, source: body.source ?? "agent" });
  } catch (error) {
    // A lost response or interrupted demo run can be retried without a second intro.
    if (!automatic || !(error instanceof ApiFail) || error.status !== 409) throw error;
    const [existing] = await db.select({ id: connections.id }).from(connections).where(and(
      eq(connections.eventId, eventId), eq(connections.fromUser, senderId), eq(connections.toUser, body.toUserId),
    )).limit(1);
    if (!existing) throw error;
    request = await loadRequestView(senderId, existing.id);
  }
  if (!automatic || request.status !== "pending") return request;
  await sleep(acceptanceDelay(request.createdAt));
  // Rechecks membership and blocks in the normal acceptance transaction.
  // The demo simulates the recipient; outside demo mode they accept themselves.
  if (!isDemoMode()) return request;
  await acceptRequest(body.toUserId, request.id);
  return loadRequestView(senderId, request.id);
}

export async function autoClaimDemoHelp(request: HelpRequest): Promise<HelpRequest> {
  if (!isDemoMode() || request.status !== 'open') return request;
  const { rows } = await db.execute<{ user_id: string }>(sql`
    select p.user_id from help_requests h
    join event_members e on e.event_id = h.event_id and e.role = 'mentor' and e.verified and e.availability <> 'offline'
    join profiles p on p.user_id = e.user_id and p.is_demo
    left join member_profiles mp on mp.user_id = p.user_id and mp.event_id = h.event_id
    where h.id = ${request.id} and p.user_id <> h.hacker_id and not exists (
      select 1 from blocks b where (b.blocker_id = p.user_id and b.blocked_id = h.hacker_id)
        or (b.blocker_id = h.hacker_id and b.blocked_id = p.user_id)
    ) order by (coalesce(mp.skills, '{}'::text[]) && h.skills_needed) desc,
      (e.availability = 'available') desc, p.handle limit 1
  `);
  if (!rows[0]) return request;
  await sleep(acceptanceDelay(request.createdAt));
  if (!isDemoMode()) return request;
  return claimHelpRequest(request.id, rows[0].user_id);
}

const conflict = (message: string) => new ApiFail(409, "conflict", message);
function requireDemo() {
  if (!isDemoMode()) throw fail.notFound();
}

async function hacker(tx: Tx, eventId: string, userId: string) {
  const { rows } = await tx.execute<{ role: string }>(sql`
    select role::text from event_members where event_id = ${eventId} and user_id = ${userId}
  `);
  if (rows[0]?.role !== "hacker") throw fail.forbidden("Only hackers can join a team chat.");
}

// A team lock serializes initialization and additions, including from two tabs.
async function lockTeam(tx: Tx, teamId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`demo-team:${teamId}`}, 0))`);
}

export async function ensureDemoTeamChat(eventId: string, userId: string): Promise<string> {
  requireDemo();
  return withTransaction(async tx => {
    await hacker(tx, eventId, userId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`demo-team-event:${eventId}`}, 0))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`demo-team-owner:${eventId}:${userId}`}, 0))`);
    const { rows } = await tx.execute<{ id: string; name: string; max_size: number }>(sql`
      select t.id, t.name, t.max_size from teams t
      where t.event_id = ${eventId} and (t.owner_id = ${userId} or exists (
        select 1 from team_members m where m.team_id = t.id and m.user_id = ${userId}
      )) order by (t.owner_id = ${userId}) desc, t.created_at, t.id limit 1
    `);
    let team = rows[0];
    if (!team) {
      const [created] = await tx.insert(teams).values({ eventId, ownerId: userId, name: "Your team", maxSize: 4 })
        .returning({ id: teams.id, name: teams.name, max_size: teams.maxSize });
      if (!created) throw new Error("Team was not created.");
      team = created;
    }
    await lockTeam(tx, team.id);
    const [existing] = await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.teamId, team.id));
    if (existing) return existing.id;
    // Normalize seeded teams that predate owner membership rows.
    await tx.execute(sql`insert into team_members (team_id, user_id)
      select id, owner_id from teams where id = ${team.id} on conflict do nothing`);
    const { rows: members } = await tx.execute<{ user_id: string }>(sql`
      select m.user_id from team_members m join event_members e on e.user_id = m.user_id and e.event_id = ${eventId}
      where m.team_id = ${team.id} and e.role = 'hacker' order by m.created_at, m.user_id
    `);
    if (members.length < 2) {
      const { rows: candidates } = await tx.execute<{ user_id: string }>(sql`
        select p.user_id from profiles p join event_members e on e.user_id = p.user_id and e.event_id = ${eventId}
        where p.is_demo and e.role = 'hacker' and p.user_id <> ${userId}
          and not exists (select 1 from blocks b where
            (b.blocker_id = ${userId} and b.blocked_id = p.user_id) or (b.blocker_id = p.user_id and b.blocked_id = ${userId}))
          and not exists (select 1 from team_members m join teams t on t.id = m.team_id
            where m.user_id = p.user_id and t.event_id = ${eventId})
          and not exists (select 1 from teams t where t.owner_id = p.user_id and t.event_id = ${eventId})
        order by p.handle limit 1
      `);
      const teammate = candidates[0];
      if (!teammate || team.max_size < 2) throw conflict("No demo teammate is available. Seed a hacker with an open team slot first.");
      await tx.insert(teamMembers).values({ teamId: team.id, userId: teammate.user_id }).onConflictDoNothing();
      members.push(teammate);
    }
    // Never expose a group containing a blocked person.
    const { rows: blocked } = await tx.execute(sql`select 1 from blocks b
      join team_members a on a.user_id = b.blocker_id and a.team_id = ${team.id}
      join team_members z on z.user_id = b.blocked_id and z.team_id = ${team.id} limit 1`);
    if (blocked.length) throw fail.forbidden("A blocked person is on this team.");
    const [chat] = await tx.insert(conversations).values({ eventId, kind: "team", teamId: team.id }).returning({ id: conversations.id });
    if (!chat) throw new Error("Team chat was not created.");
    await tx.insert(conversationMembers).values(members.map(m => ({ conversationId: chat.id, userId: m.user_id }))).onConflictDoNothing();
    await tx.insert(messages).values({ conversationId: chat.id, kind: "system", body: "Your team chat is ready. Find a teammate with Hacky, connect, then add them here." });
    const { rows: demoPeers } = await tx.execute<{ user_id: string }>(sql`
      select m.user_id from conversation_members m join profiles p on p.user_id = m.user_id
      where m.conversation_id = ${chat.id} and m.user_id <> ${userId} and p.is_demo
      order by m.joined_at, p.handle limit 1
    `);
    if (demoPeers[0]) await tx.insert(messages).values({
      conversationId: chat.id, senderId: demoPeers[0].user_id, kind: "text",
      body: "Hey! I’m ready to build. Let’s find another teammate to join us.",
    });
    return chat.id;
  });
}

export async function addDemoTeamMember(conversationId: string, userId: string, targetId: string): Promise<string> {
  requireDemo();
  await sleep(DEMO_ACCEPT_MS);
  requireDemo();
  return withTransaction(async tx => {
    const { rows } = await tx.execute<{ team_id: string; event_id: string; max_size: number }>(sql`
      select c.team_id, c.event_id, t.max_size from conversations c join teams t on t.id = c.team_id
      join conversation_members m on m.conversation_id = c.id and m.user_id = ${userId}
      where c.id = ${conversationId} and c.kind = 'team'
    `);
    const chat = rows[0];
    if (!chat) throw fail.notFound("Team chat not found.");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`demo-team-event:${chat.event_id}`}, 0))`);
    await lockTeam(tx, chat.team_id);
    await hacker(tx, chat.event_id, userId);
    await hacker(tx, chat.event_id, targetId); // also refuses mentors and cross-event IDs
    const { rows: blocked } = await tx.execute(sql`select 1 from blocks b
      join conversation_members m on m.conversation_id = ${conversationId}
      where (b.blocker_id = m.user_id and b.blocked_id = ${targetId})
         or (b.blocker_id = ${targetId} and b.blocked_id = m.user_id)
         or (b.blocker_id = ${userId} and b.blocked_id = m.user_id)
         or (b.blocker_id = m.user_id and b.blocked_id = ${userId}) limit 1`);
    if (blocked.length) throw fail.forbidden("You can't add this person to the team chat.");
    const [present] = await tx.select().from(conversationMembers).where(and(
      eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, targetId),
    ));
    if (present) return conversationId;
    const { rows: connected } = await tx.execute(sql`select 1 from connections
      where event_id = ${chat.event_id} and status = 'accepted' and
      ((from_user = ${userId} and to_user = ${targetId}) or (from_user = ${targetId} and to_user = ${userId})) limit 1`);
    if (!connected.length) throw fail.forbidden("Connect with this hacker before adding them to your team.");
    const { rows: count } = await tx.execute<{ n: number }>(sql`select count(*)::int as n from team_members where team_id = ${chat.team_id}`);
    if ((count[0]?.n ?? 0) >= chat.max_size) throw conflict("Your team is full.");
    // A demo invitation can join this group even if the person also has another
    // team chat. Their existing conversations and memberships stay intact.
    await tx.insert(teamMembers).values({ teamId: chat.team_id, userId: targetId }).onConflictDoNothing();
    await tx.insert(conversationMembers).values({ conversationId, userId: targetId });
    const [person] = await tx.select({ name: profiles.name }).from(profiles).where(eq(profiles.userId, targetId));
    await tx.insert(messages).values({ conversationId, kind: "system", body: `${person?.name ?? "A teammate"} accepted the invitation and joined the team.` });
    return conversationId;
  });
}
