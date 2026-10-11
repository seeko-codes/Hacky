import test from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../src/event-data.js';
import { schedule, recommendEvents, matchQuestion, describeEvent, stillOn } from '../src/event-model.js';

const beforeWeekend = Date.parse('2026-10-09T00:00:00-04:00');
const broadProfile = { track: 'AI / Machine Learning', motivations: ['build', 'learn', 'meet', 'career', 'compete', 'fun'], skills: ['Python', 'React'], skillsWanted: ['design'], interests: ['cloud', 'data'], experience: 'intermediate', idea: 'An AI study helper' };

test('schedule preserves every organizer fact and source URL while formatting EDT times', () => {
  assert.equal(schedule.length, data.events.length);
  assert.equal(new Set(schedule.map(event => event.id)).size, data.events.length);
  for (const source of data.events) {
    const event = schedule.find(item => item.id === source.id);
    for (const [field, value] of Object.entries(source)) {
      assert.deepEqual(event[field], value, `${source.id}: ${field} changed`);
    }
    assert.equal(data.days[event.day].date, source.startDateTime.slice(0, 10));
    assert.equal(event.type, source.tag);
    assert.equal(event.sourceUrl, data.sources.agenda);
  }
  assert.equal(schedule.find(event => event.id === 'khix-codex').time, '8:15 AM');
  assert.equal(schedule.find(event => event.id === 'khix-career-fair').end, '12:00 AM (Oct 10)');
  assert.equal(schedule.find(event => event.id === 'khix-judging').place, 'Room assigned in Hacker Dashboard');
  assert.equal(schedule.find(event => event.id === 'khix-hacking-begins').place, 'See permitted hacking spaces');
});

const excluded = ['Deadline', 'Check-in', 'Judging', 'Ceremony', 'Milestone', 'Meal'];
const overlap = (a, b) => Date.parse(a.startDateTime) < Date.parse(b.endDateTime || b.startDateTime) && Date.parse(b.startDateTime) < Date.parse(a.endDateTime || a.startDateTime);

test('recommendations cap at four future sessions, each with a reason', () => {
  const picks = recommendEvents(broadProfile, beforeWeekend);
  assert.equal(picks.length, 4);
  assert.equal(new Set(picks.map(pick => pick.event.id)).size, 4);
  for (const pick of picks) {
    assert.ok(Date.parse(pick.event.startDateTime) > beforeWeekend);
    assert.ok(!excluded.includes(pick.event.tag));
    assert.ok(pick.reason);
  }
  const cutoff = Date.parse('2026-10-10T17:15:00-04:00');
  const remaining = recommendEvents(broadProfile, cutoff);
  assert.ok(remaining.length > 0);
  assert.ok(remaining.every(pick => Date.parse(pick.event.startDateTime) > cutoff));
  assert.ok(!remaining.some(pick => pick.event.id === 'khix-figma'), 'Already-started session is excluded');
  assert.deepEqual(recommendEvents(broadProfile, Date.parse('2026-10-12T00:00:00-04:00')), []);
});

test('recommendations avoid overlapping sessions and stay chronological', () => {
  for (const intake of [{}, { motivations: ['career', 'fun'] }, { motivations: ['learn'], skillsWanted: ['design'] }, broadProfile]) {
    const picks = recommendEvents(intake, beforeWeekend);
    assert.ok(picks.length > 0);
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        const a = picks[i].event, b = picks[j].event;
        assert.ok(Date.parse(a.startDateTime) <= Date.parse(b.startDateTime), 'Events are chronological');
        assert.ok(!overlap(a, b), `${a.id} overlaps ${b.id}`);
      }
    }
  }
});

test('adjacent AI workshops can both be recommended', () => {
  const picks = recommendEvents({ interests: ['AI', 'data'] }, Date.parse('2026-10-10T08:00:00-04:00'));
  const ids = picks.map(pick => pick.event.id);
  assert.ok(ids.includes('khix-codex') && ids.includes('khix-databricks'), ids.join(', '));
  assert.equal(schedule.find(event => event.id === 'khix-codex').endDateTime, schedule.find(event => event.id === 'khix-databricks').startDateTime);
});

test('picks follow the saved profile: track first, then interests, wanted skills and own skills', () => {
  const saturday = Date.parse('2026-10-10T07:30:00-04:00');
  const ai = recommendEvents({ track: 'AI / Machine Learning' }, saturday);
  assert.ok(ai.length && ai.every(pick => pick.event.topics.includes('ai')), ai.map(pick => pick.event.id).join(', '));
  assert.equal(ai[0].reason, 'Fits your AI / Machine Learning track.');
  const embedded = recommendEvents({ track: 'Embedded Software', skills: ['Arduino'] }, beforeWeekend).map(pick => pick.event.id);
  assert.ok(embedded.includes('khix-embedded-1'), embedded.join(', '));
  const game = recommendEvents({ interests: ['game dev'] }, beforeWeekend);
  assert.ok(game.some(pick => pick.event.id === 'khix-unity' && pick.reason === 'Matches your interest in game dev.'));
  const design = recommendEvents({ motivations: ['learn'], skillsWanted: ['design'] }, saturday);
  assert.ok(design.some(pick => pick.event.id === 'khix-figma' && pick.reason === 'Related to design, which you want on your team.'), 'a specific reason beats a general goal');
  const skills = recommendEvents({ skills: ['AWS'] }, saturday);
  assert.ok(skills.some(pick => pick.event.id === 'khix-aws' && pick.reason === 'Uses your AWS skills.'));
});

test('without a profile, picks are a general mix of workshops and socials', () => {
  const picks = recommendEvents(undefined, beforeWeekend);
  assert.equal(picks.length, 4);
  assert.ok(picks.every(pick => pick.reason === 'A way to try something beyond your project.'));
});

test('deadline questions retain the guide versus Devpost source conflict', () => {
  const result = matchQuestion('When is the Devpost submission deadline?', beforeWeekend);
  const submission = result.events.find(event => event.id === 'khix-submission');
  assert.ok(submission, 'Submission is among the returned results');
  assert.equal(submission.startDateTime, '2026-10-11T10:00:00-04:00');
  assert.match(submission.description, /hard 10 AM deadline with no late submissions/);
  assert.match(submission.description, /Devpost page header lists 11 AM/);
  assert.match(submission.description, /follow the guide and confirm any updates with organizers/);
  assert.equal(submission.sourceUrl, data.sources.agenda);
  assert.equal(data.sources.devpost, 'https://knight-hacks-ix.devpost.com/');
});

test('a deadline question gets the time, zone and source conflict, not just cards', () => {
  const result = matchQuestion('What time is the Devpost submission deadline today?', beforeWeekend);
  assert.equal(result.best?.id, 'khix-submission');
  const text = describeEvent(result.best);
  assert.match(text, /Sunday, Oct 11 at 10:00 AM EDT/);
  assert.match(text, /hard 10 AM deadline/);
  assert.match(text, /Devpost page header lists 11 AM/);
});

test('a question with one clear match names it; a tie or an upcoming list does not', () => {
  const workshop = matchQuestion('When is the DevPost workshop?', beforeWeekend).best;
  assert.equal(workshop?.id, 'khix-devpost-workshop');
  assert.match(describeEvent(workshop), /Sunday, Oct 11 at 8:00 AM–9:00 AM EDT · ENG2 102/);
  assert.equal(matchQuestion('Show upcoming events', beforeWeekend).best, null);
});

test('upcoming guide search uses the supplied clock, caps results and preserves source references', () => {
  const cutoff = Date.parse('2026-10-10T17:15:00-04:00');
  const result = matchQuestion('Show upcoming events', cutoff);
  assert.equal(result.events.length, 4);
  assert.ok(result.events.every(event => Date.parse(event.startDateTime) > cutoff));
  assert.equal(result.events[0].id, 'khix-cup-stacking');
  assert.deepEqual(matchQuestion('Show upcoming events', Date.parse('2026-10-12T00:00:00-04:00')).events, []);
  assert.deepEqual(matchQuestion('organizer').help, data.help.filter(item => item.title === 'Ask an organizer'));
});

test('the full agenda keeps Sunday afternoon on the schedule until the closing ceremony', () => {
  assert.equal(data.events.length, 63);
  const atTwo = stillOn(Date.parse('2026-10-11T14:00:00-04:00')).map(event => event.id);
  assert.deepEqual(atTwo, ['khix-judging', 'khix-lunch-sun', 'khix-merch-2', 'khix-closing']);
  assert.deepEqual(stillOn(Date.parse('2026-10-11T19:30:00-04:00')), []);
});
