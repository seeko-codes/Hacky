import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { data } from '../src/event-data.js';
import { sponsorDirectory, sponsorMatch } from '../src/sponsor-model.js';

const find = id => data.sponsors.find(sponsor => sponsor.id === id);
const matched = (profile, intake) => sponsorDirectory(data.sponsors, profile, intake).filter(entry => entry.highlighted).map(entry => entry.sponsor.id);

test('the whole guide sponsor list has cards, including Neon; logos are local and optional', () => {
  const guide = readFileSync(new URL('../../server/agent/event-guides/knighthacks-ix.md', import.meta.url), 'utf8');
  const line = guide.match(/^- Sponsors: (.+)$/m)[1];
  const names = line.split('. Neon')[0].split(', ').map(name => ({ 'Codex (OpenAI)': 'OpenAI Codex', NextEra: 'NextEra Energy' })[name] || name);
  assert.deepEqual(new Set(data.sponsors.map(sponsor => sponsor.name)), new Set([...names, 'Neon']));
  assert.equal(new Set(data.sponsors.map(sponsor => sponsor.id)).size, data.sponsors.length);
  for (const sponsor of data.sponsors) {
    assert.ok(sponsor.sourceUrl.startsWith(data.sources.guide));
    if (sponsor.logo) assert.ok(existsSync(new URL(`../public/assets/brand/${sponsor.logo}`, import.meta.url)), sponsor.name);
  }
});

test('the screenshot profile highlights relevant sponsors while keeping every sponsor', () => {
  const profile = { bio: 'Me llamo nicolas cadena' };
  const intake = { skills: ['Solidity', 'Python', 'Blockchain', 'Web3', 'Backend', 'GPU'], idea: 'I want to build a decentralized verification protocol for corporate carbon offsets.' };
  const directory = sponsorDirectory(data.sponsors, profile, intake);
  assert.equal(directory.length, data.sponsors.length);
  for (const id of ['neon', 'aws', 'amd', 'nvidia', 'oneethos']) assert.ok(matched(profile, intake).includes(id), id);
  for (const id of ['figma', 'hugging-face', 'crest']) assert.ok(!matched(profile, intake).includes(id), id);
  assert.match(sponsorMatch(find('neon'), profile, intake).reason, /Backend/);
  assert.equal(sponsorMatch(find('oneethos'), profile, intake).evidence[0].text, intake.idea);
  assert.equal(directory.at(-1).highlighted, false, 'matches appear first');
});

test('editing or clearing profile fields recalculates matches without trusting an old summary', () => {
  const previous = { skills: ['Figma'], idea: 'Design a user interface', summary: 'Designer using Figma' };
  const updated = { ...previous, skills: ['Postgres'], idea: 'Store project data' };
  assert.ok(matched({}, previous).includes('figma'));
  assert.ok(!matched({}, updated).includes('figma'));
  assert.ok(matched({}, updated).includes('neon'));
  assert.deepEqual(matched({}, { skills: [], idea: null, summary: previous.summary }), []);
  assert.deepEqual(matched(null, null), []);
  assert.deepEqual(matched({ name: 'Figma', links: { github: 'ai' } }, { skills: ['Chair repair'] }), []);
});

test('About, track, interests, wanted skills, ideas and saved goals supply their own evidence', () => {
  for (const [profile, intake, id, field] of [
    [{ bio: 'I love UI design' }, {}, 'figma', 'About'],
    [{}, { track: 'AI / Machine Learning' }, 'hugging-face', 'Track'],
    [{}, { interests: ['SQL'] }, 'neon', 'Interests'],
    [{}, { skillsWanted: ['Cloud'] }, 'aws', 'Skills wanted'],
    [{}, { idea: 'Una herramienta de sostenibilidad' }, 'oneethos', 'Interests & ideas'],
    [{}, { motivations: ['compete'] }, 'databricks', 'Hackathon goals'],
    [{}, { goal: 'win' }, 'neon', 'Hackathon goals'],
    [{}, { skills: ['C++'] }, 'codex', 'Skills'],
    [{}, { skills: ['C#'] }, 'github', 'Skills'],
    [{}, { motivations: ['career'] }, 'aws', 'Hackathon goals'],
    [{}, { motivations: ['learn'] }, 'github', 'Hackathon goals'],
    [{}, { motivations: ['meet'] }, 'figma', 'Hackathon goals'],
    [{}, { motivations: ['fun'] }, 'shinies', 'Hackathon goals'],
  ]) {
    const match = sponsorMatch(find(id), profile, intake);
    assert.equal(match.highlighted, true, `${id}: ${field}`);
    assert.equal(match.evidence[0].field, field);
    assert.ok(match.reason);
  }
  assert.equal(sponsorMatch(find('crest'), {}, { motivations: ['career', 'compete', 'learn'] }).highlighted, false, 'unpublished capabilities are not guessed');
  assert.equal(sponsorMatch(find('codex'), {}, { motivations: ['career'] }).highlighted, false, 'known absence from career fair is respected');
});
