// Real PostgreSQL transactions in memory. No Neon credentials or model calls.
// Only the unrelated pgvector table/extension is omitted from the base migrations.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { after, before, beforeEach, mock, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema.js";
import { ConversationSummary } from "../../shared/contract.js";

const pg = new PGlite();
const database = drizzle(pg, { schema });
mock.module(new URL("../db/index.ts", import.meta.url).href, { namedExports: { db: database } });
mock.module(new URL("../db/tx.ts", import.meta.url).href, {
  namedExports: { withTransaction: (work: (tx: unknown) => Promise<unknown>) => database.transaction(work) },
});
mock.module(new URL("../auth.ts", import.meta.url).href, { namedExports: { isDemoMode: () => process.env.DEMO_MODE === 'true' } });
const { ensureDemoTeamChat, addDemoTeamMember, sendDemoAwareRequest, autoClaimDemoHelp } = await import('./demo.js');
const { acceptRequest, blockUser } = await import('./requests.js');
const { listConversations, sendMessage, getMessagePage } = await import('./conversations.js');
const { createHelpRequest } = await import('./help.js');
const eventId = '00000000-0000-4000-8000-000000000001';
const otherEvent = '00000000-0000-4000-8000-000000000002';
const originalMode = process.env.DEMO_MODE;

before(async () => {
  const dir = new URL('../../drizzle/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql') && !f.startsWith('0000')).sort()) {
    const statements = readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint')
      .filter(s => !/\bembeddings\b/.test(s));
    // The generated migration must also work with enum additions in a transaction.
    await pg.transaction(async tx => { for (const statement of statements) await tx.exec(statement); });
  }
});

beforeEach(async () => {
  process.env.DEMO_MODE = 'true';
  await pg.exec('TRUNCATE TABLE "user", events CASCADE');
  await database.insert(schema.events).values([
    { id: eventId, slug: 'test-demo', name: 'Test demo' },
    { id: otherEvent, slug: 'other-demo', name: 'Other demo' },
  ]);
  for (const id of ['alex', 'bee', 'charlie', 'dana', 'ed', 'mentor', 'real', 'outsider']) {
    await database.insert(schema.user).values({ id, name: id, email: `${id}@example.invalid` });
    await database.insert(schema.profiles).values({ userId: id, handle: `${id}_test`, name: id, isDemo: id !== 'real' });
    await database.insert(schema.eventMembers).values({
      eventId: id === 'outsider' ? otherEvent : eventId, userId: id,
      role: id === 'mentor' ? 'mentor' : 'hacker', verified: id === 'mentor', availability: 'available',
    });
  }
});
after(async () => {
  if (originalMode === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = originalMode;
  await pg.close();
  mock.restoreAll();
});

const invite = (toUserId: string) => sendDemoAwareRequest(eventId, 'alex', { toUserId, intro: 'Let’s build a project together.', source: 'profile' });
const rejectsStatus = (status: number) => (e: unknown) => Boolean(e && typeof e === 'object' && 'status' in e && e.status === status);

test('ordinary mode requires recipient acceptance; demo mode accepts every invitation', async () => {
  process.env.DEMO_MODE = 'false';
  const request = await invite('charlie');
  assert.equal(request.status, 'pending');
  await assert.rejects(acceptRequest('alex', request.id), rejectsStatus(403));
  await assert.rejects(ensureDemoTeamChat(eventId, 'alex'), rejectsStatus(404));
  process.env.DEMO_MODE = 'true';
  assert.equal((await invite('real')).status, 'accepted');
});

test('hacker and mentor invitations accept after two seconds and open reusable DMs', async () => {
  const start = performance.now();
  const [hacker, mentor] = await Promise.all([invite('charlie'), invite('mentor')]);
  assert.ok(performance.now() - start >= 1900, 'acceptance cannot happen instantly');
  for (const request of [hacker, mentor]) {
    assert.equal(request.status, 'accepted');
    assert.equal(request.direction, 'outgoing');
    assert.ok(request.conversationId);
  }
  const retry = await invite('charlie');
  assert.equal(retry.conversationId, hacker.conversationId);
  const thread = await getMessagePage('alex', retry.conversationId!, { limit: 30 });
  assert.equal(thread.messages.length, 1, 'a retry never posts the intro twice');
  await sendMessage('alex', retry.conversationId!, { clientId: randomUUID(), body: 'Hello!' });
  assert.equal((await getMessagePage('charlie', retry.conversationId!, { limit: 30 })).messages.at(-1)?.body, 'Hello!');
});

test('a block placed during the acceptance delay wins', async () => {
  const pending = invite('charlie');
  const rejected = assert.rejects(pending, rejectsStatus(404));
  await sleep(200);
  await blockUser('charlie', 'alex');
  await rejected;
  assert.equal((await database.select().from(schema.conversations)).length, 0);
});

test('team setup is idempotent; invitation preserves history and shows every member', async () => {
  const [id, second] = await Promise.all([ensureDemoTeamChat(eventId, 'alex'), ensureDemoTeamChat(eventId, 'alex')]);
  assert.equal(id, second);
  const group = (await listConversations(eventId, 'alex')).find(c => c.id === id)!;
  assert.equal(group.kind, 'team');
  assert.deepEqual(group.members?.map(p => p.userId).sort(), ['alex', 'bee']);
  assert.ok(ConversationSummary.safeParse(group).success);
  assert.ok((await getMessagePage('alex', id, { limit: 30 })).messages.some(m => m.senderId === 'bee'), 'a seeded teammate has already started the conversation');
  await sendMessage('bee', id, { clientId: randomUUID(), body: 'Our original team conversation.' });
  const dm = await invite('charlie');
  const [otherTeam] = await database.insert(schema.teams).values({ eventId, ownerId: 'charlie', name: 'Existing team', maxSize: 4 }).returning();
  assert.ok(otherTeam);
  const start = performance.now();
  assert.equal(await addDemoTeamMember(id, 'alex', 'charlie'), id);
  assert.ok(performance.now() - start >= 1900);
  assert.equal(await addDemoTeamMember(id, 'alex', 'charlie'), id);
  const updated = (await listConversations(eventId, 'charlie')).find(c => c.id === id)!;
  assert.equal(updated.members?.length, 3);
  assert.ok((await database.select().from(schema.teams)).some(t => t.id === otherTeam.id), 'a demo group invitation preserves other teams');
  assert.ok((await listConversations(eventId, 'charlie')).some(c => c.id === dm.conversationId), 'DM remains separate');
  const history = await getMessagePage('charlie', id, { limit: 30 });
  assert.ok(history.messages.some(m => m.body === 'Our original team conversation.'));
  assert.equal(history.messages.filter(m => m.body.includes('accepted the invitation')).length, 1);
  await sendMessage('charlie', id, { clientId: randomUUID(), body: 'Happy to join!' });
  assert.equal((await getMessagePage('bee', id, { limit: 30 })).messages.at(-1)?.senderId, 'charlie');
  await assert.rejects(sendMessage('outsider', id, { clientId: randomUUID(), body: 'No access' }), rejectsStatus(404));
});

test('team invitations refuse mentors, strangers, outsiders, blocks and full teams', async () => {
  const id = await ensureDemoTeamChat(eventId, 'alex');
  await assert.rejects(addDemoTeamMember(id, 'alex', 'mentor'), rejectsStatus(403));
  await assert.rejects(addDemoTeamMember(id, 'alex', 'outsider'), rejectsStatus(403));
  await assert.rejects(addDemoTeamMember(id, 'alex', 'charlie'), rejectsStatus(403));
  await assert.rejects(addDemoTeamMember(id, 'ed', 'charlie'), rejectsStatus(404));
  await Promise.all([invite('charlie'), invite('dana'), invite('ed')]);
  await addDemoTeamMember(id, 'alex', 'charlie');
  await addDemoTeamMember(id, 'alex', 'dana');
  await assert.rejects(addDemoTeamMember(id, 'alex', 'ed'), rejectsStatus(409));
  await blockUser('bee', 'charlie');
  assert.equal((await listConversations(eventId, 'bee')).length, 0, 'a block against any group member hides the group');
  await assert.rejects(sendMessage('bee', id, { clientId: randomUUID(), body: 'Blocked' }), rejectsStatus(403));
  await assert.rejects(addDemoTeamMember(id, 'bee', 'ed'), rejectsStatus(403));
});

test('mentor help automatically opens a one-to-one mentor chat', async () => {
  const help = await createHelpRequest('test-demo', 'alex', { title: 'React help', details: 'My component needs help.', skillsNeeded: ['React'] });
  const start = performance.now();
  const claimed = await autoClaimDemoHelp(help);
  assert.ok(performance.now() - start >= 1900);
  assert.equal(claimed.status, 'claimed');
  assert.equal(claimed.mentor?.userId, 'mentor');
  const chats = await listConversations(eventId, 'alex');
  assert.equal(chats[0]?.kind, 'mentor');
  assert.equal(chats[0]?.team, undefined);
});
