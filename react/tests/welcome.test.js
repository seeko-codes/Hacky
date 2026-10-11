import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewIntake, isWelcomeEntry, opensWelcome, welcomedKey } from '../src/welcome.js';

const blank = { skills: [], skillsWanted: [], experience: null, wantsExperienced: false, goal: null, track: null, interests: [], idea: null, motivations: [], summary: null, complete: false };
const saved = { ...blank, motivations: ['learn', 'meet'] };

test('the entry link always opens the welcome, for new and returning people', () => {
  for (const search of ['?onboarding=1', '?event=knighthacks-ix&onboarding=1', '?onboarding=1&start=team']) {
    assert.equal(isWelcomeEntry(search), true, search);
    assert.equal(opensWelcome({ search, intake: saved, welcomed: true }), true, search);
  }
  assert.equal(isWelcomeEntry('?onboarding=0'), false);
});

test('a plain visit opens it only once, and only for someone with nothing saved', () => {
  assert.equal(opensWelcome({ search: '', intake: blank, welcomed: false }), true, 'genuinely new');
  assert.equal(opensWelcome({ search: '', intake: blank, welcomed: true }), false, 'saw it (skipped or refreshed)');
  assert.equal(opensWelcome({ search: '', intake: saved, welcomed: false }), false, 'saved goals');
  for (const partial of [{ skills: ['React'] }, { interests: ['games'] }, { track: 'Games' }, { goal: 'learn' }, { idea: 'A rhythm game' }]) {
    assert.equal(isNewIntake({ ...blank, ...partial }), false, JSON.stringify(partial));
    assert.equal(opensWelcome({ search: '', intake: { ...blank, ...partial }, welcomed: false }), false, JSON.stringify(partial));
  }
});

test('someone who came for something specific goes straight there', () => {
  assert.equal(opensWelcome({ search: '?start=team', intake: blank, welcomed: false }), false);
  assert.equal(opensWelcome({ search: '', hash: '#events', intake: blank, welcomed: false }), false);
});

test('the remembered welcome is per person and event', () => {
  assert.equal(welcomedKey('demo_kiran_audio', 'knighthacks-ix'), 'hacky-welcomed:demo_kiran_audio:knighthacks-ix');
  assert.notEqual(welcomedKey('a', 'knighthacks-ix'), welcomedKey('b', 'knighthacks-ix'));
  assert.notEqual(welcomedKey('a', 'knighthacks-ix'), welcomedKey('a', 'demo-hacks'));
});
