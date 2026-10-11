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

// Words in a profile (track, skills, interests, idea) and the event topics they point to.
const TOPIC_WORDS = [
  ['ai', /\b(ai|ml|machine learning|deep learning|llms?|gpt|nlp|computer vision|neural|pytorch|tensorflow|agents?|chatbots?|prompts?)\b/],
  ['data', /\b(data|sql|postgres(ql)?|databases?|analytics|pandas|spark|databricks)\b/],
  ['gpu', /\b(gpus?|cuda|hip|kernels?)\b/],
  ['embedded', /\b(embedded|arduino|raspberry pi|iot|firmware|microcontrollers?|sensors?|robots?|robotics|hardware|electronics|jetson)\b/],
  ['hardware', /\b(3d printing|cad|manufacturing|fabrication|chips?|hardware)\b/],
  ['game', /\b(games?|game dev|gaming|unity|unreal|godot)\b/],
  ['design', /\b(design|designer|figma|ui|ux|prototyping|graphics)\b/],
  ['web', /\b(web|frontend|front-end|backend|back-end|full[ -]?stack|react|node(\.js)?|javascript|typescript|apis?|apps?|mobile|git)\b/],
  ['cloud', /\b(cloud|aws|devops|docker|kubernetes|serverless)\b/],
  ['finance', /\b(finance|fintech|banking|payments?|trading)\b/],
  ['security', /\b(security|cybersecurity|privacy)\b/],
  ['beginner', /\b(beginners?|first hackathon|new to coding)\b/],
];
const TRACK_TOPICS = { 'Hello World': ['beginner'], 'AI / Machine Learning': ['ai'], 'App Development': ['web'], 'Game Development': ['game'], 'Embedded Software': ['embedded'] };
// Saved goals (intake motivations) → topics, with the reason a pick shows.
const GOAL_TOPICS = {
  build: [['submission'], 'A checkpoint for getting your project submitted.'],
  learn: [['workshop'], 'Time to learn something you can try in your project.'],
  meet: [['social', 'networking'], 'A chance to connect with other people.'],
  career: [['career'], 'A chance to meet industry teams and explore opportunities.'],
  compete: [['prizes'], 'Connected to a prize you can compete for.'],
  fun: [['social'], 'A chance to take a break and enjoy the weekend.'],
};
const topicsIn = text => TOPIC_WORDS.filter(([, words]) => words.test(String(text).toLowerCase())).map(([topic]) => topic);
// An event's topics: its own plus what its tag says.
const eventTopics = event => [...event.topics, ...(/workshop/i.test(event.tag) ? ['workshop'] : []), ...(event.tag === 'Social' ? ['social'] : []), ...(event.tag === 'Career fair' ? ['career', 'networking'] : [])];

// What the saved profile asks for, strongest first: the track, then goals, interests and wanted skills, then own
// skills and the idea. Each signal carries the reason a matching pick shows. No profile at all: workshops and socials.
function profileSignals(intake) {
  const signals = [];
  const add = (key, topics, weight, reason) => topics.length && signals.push({ key, topics, weight, reason });
  if (intake?.track) add('track', [...(TRACK_TOPICS[intake.track] || []), ...topicsIn(intake.track)], 3, `Fits your ${intake.track} track.`);
  for (const goal of intake?.motivations || []) if (GOAL_TOPICS[goal]) add(`goal:${goal}`, ...GOAL_TOPICS[goal].slice(0, 1), 2, GOAL_TOPICS[goal][1]);
  if (intake?.experience === 'beginner') add('beginner', ['beginner'], 2, 'Good for a first hackathon.');
  for (const term of intake?.interests || []) add(`interest:${term}`, topicsIn(term), 2, `Matches your interest in ${term}.`);
  for (const term of intake?.skillsWanted || []) add(`wanted:${term}`, topicsIn(term), 2, `Related to ${term}, which you want on your team.`);
  for (const term of intake?.skills || []) add(`skill:${term}`, topicsIn(term), 1, `Uses your ${term} skills.`);
  if (intake?.idea) add('idea', topicsIn(intake.idea), 1, 'Related to your idea.');
  if (!signals.length) add('explore', ['workshop', 'social'], 1, 'A way to try something beyond your project.');
  return signals;
}

// What's still on: events not over yet (in progress or later), soonest first, skipping deadlines and
// milestones. The panel falls back to it when nothing upcoming matches the person's goals.
export function stillOn(now = Date.now(), limit = 4) {
  return schedule.filter(event => Date.parse(event.endDateTime || event.startDateTime) > now && !['Deadline', 'Milestone'].includes(event.tag)).slice(0, limit);
}

// Up to four upcoming events for this person's saved profile (the intake), chronological and never overlapping.
// Each pick has the reason of its strongest match; picks spread across different signals when they can.
export function recommendEvents(intake, now = Date.now()) {
  const signals = profileSignals(intake);
  const ranked = schedule.filter(event => Date.parse(event.startDateTime) > now && !['Deadline', 'Check-in', 'Judging', 'Ceremony', 'Milestone', 'Meal'].includes(event.tag)).map(event => {
    const topics = eventTopics(event), hits = signals.filter(signal => signal.topics.some(topic => topics.includes(topic)));
    // The strongest match gives the reason; on a tie, a specific one (track, skill, interest) beats a general goal.
    const best = hits.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && a.key.startsWith('goal:') && !b.key.startsWith('goal:')) ? b : a), hits[0]);
    return { event, score: hits.reduce((n, hit) => n + hit.weight, 0), reason: best?.reason, covers: hits.map(hit => hit.key) };
  }).filter(item => item.score).sort((a, b) => b.score - a.score || Date.parse(a.event.startDateTime) - Date.parse(b.event.startDateTime));
  const picks = [], covered = new Set();
  const overlaps = (a, b) => Date.parse(a.startDateTime) < Date.parse(b.endDateTime || b.startDateTime) && Date.parse(b.startDateTime) < Date.parse(a.endDateTime || a.startDateTime);
  while (picks.length < 4) {
    const fresh = item => item.covers.filter(key => !covered.has(key)).length;
    const candidates = ranked.filter(item => !picks.includes(item) && picks.every(p => !overlaps(item.event, p.event)));
    if (!candidates.length) break;
    const next = candidates.reduce((a, b) => (fresh(b) * 10 + b.score > fresh(a) * 10 + a.score ? b : a));
    picks.push(next);
    next.covers.forEach(key => covered.add(key));
  }
  return picks.sort((a, b) => Date.parse(a.event.startDateTime) - Date.parse(b.event.startDateTime));
}

// A direct answer to "when/where is X": day, time and zone, then the place. A deadline keeps its
// source note instead, since the guide and Devpost disagree and the reader should see both.
export function describeEvent(event) {
  const day = data.days[event.day], when = `${day.label}, ${day.short} at ${event.time}${event.end ? `–${event.end}` : ''} EDT`;
  return event.tag === 'Deadline' ? `${event.name}: ${when}. ${event.description}` : `From the guide: ${event.name}, ${when} · ${event.place}.`;
}
export function matchQuestion(question, now = Date.now()) {
  const q = question.toLowerCase();
  const words = q.match(/[a-z0-9]+/g)?.filter(w => !['the','is','a','an','at','in','to','for','of','where','when','what','which','i','can','do','me','about','with','are','event','events','please','tell','show'].includes(w)) || [];
  const score = text => words.reduce((n, w) => n + (text.toLowerCase().includes(w) ? 1 : 0), 0);
  const upcoming = /next|coming|upcoming/.test(q);
  const ranked = upcoming ? [] : schedule.map(event => ({ event, score: score([event.name,event.description,event.tag,event.place].join(' ')) })).filter(item => item.score > 0).sort((a,b) => b.score - a.score);
  const events = upcoming ? schedule.filter(event => Date.parse(event.startDateTime) > now).slice(0, 4) : ranked.slice(0, 4).map(item => item.event);
  // The one event the question is about: the deadline when it asks for one, else a top match that beats the rest.
  const deadline = /deadline|\bdue\b/.test(q) || (/\bwhen\b|what time/.test(q) && /submi/.test(q));
  const best = upcoming ? null : deadline ? schedule.find(event => event.tag === 'Deadline') : ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score) ? ranked[0].event : null;
  return { found: words.length > 0, events, best, sponsors: data.sponsors.filter(item => /sponsors?/.test(q) || score(`${item.name} ${item.focus}`) > 0), help: data.help.filter(item => score(`${item.title} ${item.text}`) > 0) };
}
