import test from 'node:test';
import assert from 'node:assert/strict';
import { activity, chatsLine, requestsLine, roleLine, skillsLine, teamStatus } from '../src/dashboard-model.js';
import { hackyUrl } from '../src/entry.js';

const hacker = { role: 'hacker', verified: false, looking: true };
const teamRequest = (status, name = 'Pulse') => ({ direction: 'outgoing', status, team: { id: 't1', name } });

test('the dashboard links into Hacky through the welcome entry and the team start', () => {
  assert.equal(hackyUrl({ onboarding: true }), '/index.html?onboarding=1');
  assert.equal(hackyUrl({ start: 'team' }), '/index.html?start=team');
  assert.equal(hackyUrl(), '/index.html');
  assert.equal(hackyUrl({ onboarding: true, event: 'demo-hacks' }), '/index.html?event=demo-hacks&onboarding=1');
});

test('the role line says who they are at which event', () => {
  assert.equal(roleLine(hacker, 'Knight Hacks IX'), 'Hacker · Knight Hacks IX');
  assert.equal(roleLine({ role: 'mentor', verified: true }, 'Knight Hacks IX'), 'Verified mentor · Knight Hacks IX');
  assert.equal(roleLine({ role: 'mentor', verified: false }, 'Knight Hacks IX'), 'Mentor · Knight Hacks IX');
  assert.equal(roleLine(undefined, 'Knight Hacks IX'), 'Knight Hacks IX');
});

test('skills: a short line, or nothing when none are saved', () => {
  assert.equal(skillsLine(['React', 'TypeScript', 'CSS', 'frontend']), 'React, TypeScript + 2 more');
  assert.equal(skillsLine(['computer vision']), 'Computer Vision');
  for (const empty of [[], null, undefined, ['', '  ']]) assert.equal(skillsLine(empty), null);
});

test('team: the team they lead or are on comes first', () => {
  const leads = teamStatus(hacker, [teamRequest('pending', 'Other')], { id: 't1', name: 'Pulse', isOwner: true, size: 2, maxSize: 3 });
  assert.deepEqual(leads, { kind: 'leads', team: 'Pulse', label: 'Pulse (you lead it) · 2 of 3' });
  const member = teamStatus({ ...hacker, looking: false }, [], { id: 't1', name: 'Pulse', isOwner: false, size: 2, maxSize: 3 });
  assert.deepEqual(member, { kind: 'member', team: 'Pulse', label: 'Pulse · 2 of 3' });
});

test('team: without a team, their own team requests, then the looking flag', () => {
  assert.equal(teamStatus(hacker, [teamRequest('accepted')]).label, 'In touch with Pulse');
  assert.equal(teamStatus(hacker, [teamRequest('pending')]).label, 'Request sent to Pulse');
  // Incoming requests and person-to-person requests aren't team status.
  const others = [{ ...teamRequest('pending'), direction: 'incoming' }, { direction: 'outgoing', status: 'pending', team: null }];
  assert.equal(teamStatus(hacker, others).kind, 'looking');
  assert.equal(teamStatus({ ...hacker, looking: false }, [], null).kind, 'not-looking');
  assert.equal(teamStatus(hacker, null, undefined).kind, 'looking');
});

test('team: only hackers have a team line', () => {
  for (const role of ['mentor', 'sponsor', 'organizer']) assert.equal(teamStatus({ role, looking: true }, [], { name: 'Pulse', isOwner: true }), null);
  assert.equal(teamStatus(undefined), null);
});

test('activity counts only what waits for them, what they sent, and their chats', () => {
  const requests = [
    { direction: 'incoming', status: 'pending', hiddenAt: null },
    { direction: 'incoming', status: 'pending', hiddenAt: '2026-10-10T12:00:00Z' }, // "Not now"
    { direction: 'incoming', status: 'accepted', hiddenAt: null },
    { direction: 'outgoing', status: 'pending' },
  ];
  const chats = [{ unreadCount: 2 }, { unreadCount: 0 }];
  const a = activity(requests, chats);
  assert.deepEqual(a, { waiting: 1, sent: 1, chats: 2, unread: 1 });
  assert.equal(requestsLine(a), '1 waiting for you · 1 sent');
  assert.equal(chatsLine(a), '2 chats · 1 unread');
  const none = activity([], []);
  assert.equal(requestsLine(none), 'No requests yet');
  assert.equal(chatsLine(none), 'No chats yet');
  assert.equal(chatsLine(activity([], [{ unreadCount: 0 }])), '1 chat');
});
