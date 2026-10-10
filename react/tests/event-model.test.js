import test from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../src/event-data.js';
import { schedule, recommendEvents, matchQuestion } from '../src/event-model.js';

const beforeWeekend = Date.parse('2026-10-09T00:00:00-04:00');
const broadGoal = 'Explore everything, learn skills, meet people, career opportunities, compete for prizes, relax, design, AI, cloud and build a project';

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

test('recommendations cap at four future sessions regardless of requested pace', () => {
  for (const pace of ['1', '4', '10']) {
    const picks = recommendEvents(broadGoal, pace, ['Career opportunities', 'Learn skills'], beforeWeekend);
    assert.equal(picks.length, 4);
    assert.equal(new Set(picks.map(pick => pick.event.id)).size, 4);
    for (const pick of picks) {
      assert.ok(Date.parse(pick.event.startDateTime) > beforeWeekend);
      assert.ok(!['Deadline', 'Check-in', 'Judging', 'Ceremony', 'Milestone'].includes(pick.event.tag));
      assert.ok(pick.reason);
    }
  }
  const cutoff = Date.parse('2026-10-10T17:15:00-04:00');
  const remaining = recommendEvents(broadGoal, '4', [], cutoff);
  assert.ok(remaining.length > 0);
  assert.ok(remaining.every(pick => Date.parse(pick.event.startDateTime) > cutoff));
  assert.ok(!remaining.some(pick => pick.event.id === 'khix-figma'), 'Already-started session is excluded');
  assert.deepEqual(recommendEvents(broadGoal, '4', [], Date.parse('2026-10-12T00:00:00-04:00')), []);
});

test('recommendations avoid overlapping sessions and stay chronological', () => {
  for (const goals of [[], ['Career opportunities', 'Have fun'], ['Learn skills', 'Design interfaces']]) {
    const picks = recommendEvents(broadGoal, '4', goals, beforeWeekend);
    assert.equal(picks.length, 4);
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        const a = picks[i].event, b = picks[j].event;
        assert.ok(Date.parse(a.startDateTime) <= Date.parse(b.startDateTime), 'Events are chronological');
        assert.ok(Date.parse(a.endDateTime || a.startDateTime) <= Date.parse(b.startDateTime), `${a.id} overlaps ${b.id}`);
      }
    }
  }
  const picks = recommendEvents('career opportunities and fun relax', '4', [], Date.parse('2026-10-10T10:30:00-04:00'));
  const ids = picks.map(pick => pick.event.id);
  assert.ok(ids.includes('khix-flower-crowns') || ids.includes('khix-oneethos'));
  assert.ok(!(ids.includes('khix-flower-crowns') && ids.includes('khix-oneethos')), 'Flower crowns and OneEthos overlap');
});

test('adjacent AI workshops can both be recommended', () => {
  const picks = recommendEvents('AI and data', '4', [], Date.parse('2026-10-10T08:00:00-04:00'));
  assert.deepEqual(picks.map(pick => pick.event.id), ['khix-codex', 'khix-databricks']);
  assert.equal(picks[0].event.endDateTime, picks[1].event.startDateTime);
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

test('upcoming guide search uses the supplied clock, caps results and preserves source references', () => {
  const cutoff = Date.parse('2026-10-10T17:15:00-04:00');
  const result = matchQuestion('Show upcoming events', cutoff);
  assert.equal(result.events.length, 4);
  assert.ok(result.events.every(event => Date.parse(event.startDateTime) > cutoff));
  assert.equal(result.events[0].id, 'khix-aws');
  assert.deepEqual(matchQuestion('Show upcoming events', Date.parse('2026-10-12T00:00:00-04:00')).events, []);
  assert.deepEqual(matchQuestion('organizer').help, data.help.filter(item => item.title === 'Ask an organizer'));
});
