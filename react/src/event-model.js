import { data } from './event-data.js';

const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: data.timeZone, hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: data.timeZone, month: 'short', day: 'numeric' });
export const schedule = data.events.map(event => ({
  ...event,
  day: data.days.findIndex(day => event.startDateTime.startsWith(day.date)),
  time: timeFormat.format(new Date(event.startDateTime)),
  end: event.endDateTime ? timeFormat.format(new Date(event.endDateTime)) + (event.endDateTime.slice(0, 10) !== event.startDateTime.slice(0, 10) ? ` (${dateFormat.format(new Date(event.endDateTime))})` : '') : null,
  place: event.location || (event.tag === 'Judging' ? 'Room assigned in Hacker Dashboard' : 'See permitted hacking spaces'),
  type: event.tag,
}));

const rules = [
  [/meet|people|friend|network|team/, /Social|Career fair|AWS/, 'A chance to connect with other people.'],
  [/career|opportunit|recruit|intern|job/, /Career fair|AWS|OneEthos/, 'A chance to meet industry teams and explore opportunities.'],
  [/compet|prize|award|challenge/, /OneEthos|DevPost|Figma/, 'A session connected to a sponsor challenge or preparing your submission.'],
  [/fun|relax|enjoy|hang.out/, /Social/, 'A chance to take a break and enjoy the weekend.'],
  [/learn|skill|first|beginner/, /Workshop|workshop/, 'Time to learn something you can try in your project.'],
  [/build|ship|project|finish/, /DevPost|submission|code push/, 'A useful checkpoint for getting your project submitted.'],
  [/design|figma|frontend/, /Figma|Full Stack/, 'A session connected to your interest in design and building interfaces.'],
  [/ai|data|coding/, /Codex|Databricks/, 'A session connected to your interest in AI and data.'],
  [/cloud|aws|backend/, /AWS|Full Stack/, 'A session connected to your interest in building applications.'],
  [/explore|everything/, /Workshop|workshop|Social/, 'A way to try something beyond your project.'],
];

export function recommendEvents(goal = 'Explore everything', pace = '4', goals = [], now = Date.now()) {
  const q = goal.toLowerCase();
  const ranked = schedule.filter(event => Date.parse(event.startDateTime) > now && !['Deadline', 'Check-in', 'Judging', 'Ceremony', 'Milestone'].includes(event.tag)).map(event => {
    const matches = rules.filter(([intent, match]) => intent.test(q) && match.test(`${event.name} ${event.tag}`));
    return { event, score: matches.length, reason: matches.at(-1)?.[2], covers: goals.filter(g => rules.some(([intent, match]) => intent.test(g.toLowerCase()) && match.test(`${event.name} ${event.tag}`))) };
  }).filter(item => item.score).sort((a, b) => b.score - a.score || Date.parse(a.event.startDateTime) - Date.parse(b.event.startDateTime));
  const picks = [], covered = new Set();
  while (picks.length < 4) {
    const candidates = ranked.filter(item => !picks.includes(item) && picks.every(p => Date.parse(item.event.startDateTime) >= Date.parse(p.event.endDateTime || p.event.startDateTime) || Date.parse(p.event.startDateTime) >= Date.parse(item.event.endDateTime || item.event.startDateTime)));
    candidates.sort((a, b) => (b.covers.filter(g => !covered.has(g)).length * 10 + b.score) - (a.covers.filter(g => !covered.has(g)).length * 10 + a.score));
    if (!candidates.length) break;
    const next = candidates[0];
    picks.push(next);
    next.covers.forEach(g => covered.add(g));
  }
  return picks.sort((a, b) => Date.parse(a.event.startDateTime) - Date.parse(b.event.startDateTime));
}

export function matchQuestion(question, now = Date.now()) {
  const q = question.toLowerCase();
  const words = q.match(/[a-z0-9]+/g)?.filter(w => !['the','is','a','an','at','in','to','for','of','where','when','what','which','i','can','do','me','about','with','are','event','events','please','tell','show'].includes(w)) || [];
  const score = text => words.reduce((n, w) => n + (text.toLowerCase().includes(w) ? 1 : 0), 0);
  const events = /next|coming|upcoming/.test(q) ? schedule.filter(event => Date.parse(event.startDateTime) > now).slice(0, 4) : schedule.map(event => ({ event, score: score([event.name,event.description,event.tag,event.place].join(' ')) })).filter(item => item.score > 0).sort((a,b) => b.score - a.score).slice(0, 4).map(item => item.event);
  return { found: words.length > 0, events, sponsors: data.sponsors.filter(item => /sponsors?/.test(q) || score(`${item.name} ${item.focus}`) > 0), help: data.help.filter(item => score(`${item.title} ${item.text}`) > 0) };
}
