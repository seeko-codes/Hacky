import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skillLabel, choiceLabel } from '../src/labels.js';

test('lowercase skill tags read as labels', () => {
  for (const [tag, label] of [
    ['mobile', 'Mobile'],
    ['hardware', 'Hardware'],
    ['frontend', 'Frontend'],
    ['backend', 'Backend'],
    ['computer vision', 'Computer Vision'],
    ['game dev', 'Game Dev'],
    ['full-stack', 'Full-stack'],
    ['c++', 'C++'],
    ['node.js', 'Node.js'],
    ['human ai interaction', 'Human AI Interaction'],
    ['on-device ai', 'On-device AI'],
    ['ios', 'iOS'],
    ['iot networks', 'IoT Networks'],
    ['3d art', '3D Art'],
    ['apis', 'APIs'],
    ['speech to text', 'Speech to Text'],
  ]) {
    assert.equal(skillLabel(tag), label, tag);
  }
});

test('technical names keep the spelling they were written with', () => {
  for (const tag of ['ML', 'Python', 'ESP32', 'C++', 'LoRa', 'MQTT', 'iOS', 'Web Audio API', 'spaCy', 'gRPC', 'LoRA']) {
    assert.equal(skillLabel(tag), tag);
  }
  // Lowercase spellings of those names still read the usual way.
  assert.equal(skillLabel('ml'), 'ML');
  assert.equal(skillLabel('esp32'), 'ESP32');
  assert.equal(skillLabel('lora'), 'LoRa');
  assert.equal(skillLabel('mqtt'), 'MQTT');
  // Names that are lowercase on purpose stay that way.
  assert.equal(skillLabel('scikit-learn'), 'scikit-learn');
  assert.equal(skillLabel('dbt'), 'dbt');
});

test('mixed tags only change their lowercase words', () => {
  assert.equal(skillLabel('embedded C'), 'Embedded C');
  assert.equal(skillLabel('advanced ML'), 'Advanced ML');
  assert.equal(skillLabel('llm APIs'), 'LLM APIs');
  assert.equal(skillLabel('UI design'), 'UI Design');
});

test('display only: the tag passed in is never changed, and odd values pass through', () => {
  const tags = ['computer vision', 'ML'];
  const copy = [...tags];
  tags.map(skillLabel);
  assert.deepEqual(tags, copy);
  assert.equal(skillLabel(''), '');
  assert.equal(skillLabel(undefined), undefined);
  assert.equal(skillLabel(null), null);
});

test('answer chips: only all-lowercase chips are formatted', () => {
  assert.equal(choiceLabel('computer vision'), 'Computer Vision');
  assert.equal(choiceLabel('frontend'), 'Frontend');
  assert.equal(choiceLabel('ML'), 'ML');
  assert.equal(choiceLabel('Something else'), 'Something else');
  assert.equal(choiceLabel('Frontend & UI'), 'Frontend & UI');
  assert.equal(choiceLabel('Not sure yet'), 'Not sure yet');
});

test('every seeded tag reads as a label, and only its case changes', () => {
  const seed = JSON.parse(readFileSync(new URL('../../seed/people.json', import.meta.url), 'utf8'));
  const tags = new Set();
  for (const person of seed.people) {
    for (const membership of person.memberships) {
      for (const key of ['skills', 'skillsWanted', 'interests']) for (const tag of membership.intake?.[key] || []) tags.add(tag);
    }
  }
  for (const team of seed.teams || []) for (const tag of team.wantedSkills || []) tags.add(tag);
  assert.ok(tags.size > 100);
  for (const tag of tags) {
    const label = skillLabel(tag);
    assert.equal(label.toLowerCase(), tag.trim().toLowerCase(), `${tag}: same letters`);
    assert.equal(skillLabel(label), label, `${tag}: formatting a label again changes nothing`);
    // Starts lowercase only as a name's own spelling: iOS, gRPC, or lowercase on purpose (dbt, scikit-learn).
    assert.ok(!/^\p{Ll}/u.test(label) || /\p{Lu}/u.test(label) || label === tag, `${tag} reads as ${label}`);
  }
});
