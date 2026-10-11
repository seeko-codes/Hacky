// What the event dashboard (Dashboard.jsx) says about the signed-in person, from the API alone:
// /api/me, /api/events/:slug/me, and their own requests and conversations in that event.
// Nothing here falls back to anyone else's data; a missing field is left out.
import { skillLabel } from './labels.js';

const ROLES = { hacker: 'Hacker', mentor: 'Mentor', sponsor: 'Sponsor', organizer: 'Organizer' };

// "Hacker · Knight Hacks IX", "Verified mentor · Knight Hacks IX".
export function roleLine(eventMe, eventName) {
  const role = ROLES[eventMe?.role];
  const who = role && eventMe.verified && eventMe.role === 'mentor' ? 'Verified mentor' : role;
  return [who, eventName].filter(Boolean).join(' · ');
}

// "React, Python + 2 more": the first few skills as labels.
export function skillsLine(skills, shown = 2) {
  const list = Array.isArray(skills) ? skills.filter((s) => typeof s === 'string' && s.trim()) : [];
  if (!list.length) return null;
  const head = list.slice(0, shown).map(skillLabel).join(', ');
  return list.length > shown ? `${head} + ${list.length - shown} more` : head;
}

// Hackers only. First the team they lead or are on (GET /api/events/:slug/me/team), then the
// "Contact team" requests they sent (joining teams isn't built), then the membership's looking flag.
//   { kind: 'leads' | 'member' | 'in-touch' | 'requested' | 'looking' | 'not-looking', team?: name, label }
export function teamStatus(eventMe, requests = [], team = null) {
  if (eventMe?.role !== 'hacker') return null;
  if (team?.name) {
    const size = team.size && team.maxSize ? ` · ${team.size} of ${team.maxSize}` : '';
    return team.isOwner
      ? { kind: 'leads', team: team.name, label: `${team.name} (you lead it)${size}` }
      : { kind: 'member', team: team.name, label: `${team.name}${size}` };
  }
  const mine = (Array.isArray(requests) ? requests : []).filter((r) => r?.direction === 'outgoing' && r.team?.name);
  const accepted = mine.find((r) => r.status === 'accepted');
  if (accepted) return { kind: 'in-touch', team: accepted.team.name, label: `In touch with ${accepted.team.name}` };
  const pending = mine.find((r) => r.status === 'pending');
  if (pending) return { kind: 'requested', team: pending.team.name, label: `Request sent to ${pending.team.name}` };
  return eventMe.looking
    ? { kind: 'looking', label: 'Looking' }
    : { kind: 'not-looking', label: 'Not looking' };
}

// Requests waiting for them (not hidden with "Not now"), requests they sent that are still pending,
// and chats (DMs and mentor chats) with how many have unread messages.
export function activity(requests = [], conversations = []) {
  const list = Array.isArray(requests) ? requests : [];
  const chats = Array.isArray(conversations) ? conversations : [];
  return {
    waiting: list.filter((r) => r.direction === 'incoming' && r.status === 'pending' && !r.hiddenAt).length,
    sent: list.filter((r) => r.direction === 'outgoing' && r.status === 'pending').length,
    chats: chats.length,
    unread: chats.filter((c) => c.unreadCount > 0).length,
  };
}

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const requestsLine = (a) => (a.waiting || a.sent
  ? [a.waiting && `${a.waiting} waiting for you`, a.sent && `${a.sent} sent`].filter(Boolean).join(' · ')
  : 'No requests yet');
export const chatsLine = (a) => (a.chats
  ? [count(a.chats, 'chat'), a.unread && `${a.unread} unread`].filter(Boolean).join(' · ')
  : 'No chats yet');
