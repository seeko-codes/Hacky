import test from 'node:test';
import assert from 'node:assert/strict';
import { boldRuns, textBlocks, orderedEventNames } from '../src/hacky/rich.js';

test('a reply without bullets stays one text block', () => {
  assert.deepEqual(textBlocks('Hi Kiran!\nCheck-in is in ENG2 102.'), [{ type: 'text', text: 'Hi Kiran!\nCheck-in is in ENG2 102.' }]);
});

test('a recommendation splits into intro, list and the time line', () => {
  const reply = "For you, I'd start with:\n- **Databricks: Intro to Databricks** — since you work with data.\n* **MLH: Intro to GitHub Copilot** — handy for your Python.\n\nBoth are Saturday: 9:15 AM in ENG2 102, 10:15 AM in ENG2 203.";
  assert.deepEqual(textBlocks(reply), [
    { type: 'text', text: "For you, I'd start with:" },
    { type: 'list', items: ['**Databricks: Intro to Databricks** — since you work with data.', '**MLH: Intro to GitHub Copilot** — handy for your Python.'] },
    { type: 'text', text: 'Both are Saturday: 9:15 AM in ENG2 102, 10:15 AM in ENG2 203.' },
  ]);
});

test('bold at the start of a line is not a bullet', () => {
  assert.deepEqual(textBlocks('**Figma Make Workshop** is at 5:15 PM.'), [{ type: 'text', text: '**Figma Make Workshop** is at 5:15 PM.' }]);
});

test('bold runs; everything else stays plain text (React escapes it)', () => {
  assert.deepEqual(boldRuns('Try **Adobe Workshop** <b>now</b>'), [
    { text: 'Try ' },
    { text: 'Adobe Workshop', bold: true },
    { text: ' <b>now</b>' },
  ]);
  assert.deepEqual(boldRuns('no ** pair'), [{ text: 'no ** pair' }]);
});


test('event cards follow the explanation even when the model rearranges its picks', () => {
  const names = ['Databricks: Intro to Databricks', 'KH: Intro to Vibe Coding x OpenAI Codex'];
  const text = '- **KH: Intro to Vibe Coding x OpenAI Codex** — for your AI project.\n- **Databricks: Intro to Databricks** — to learn data tools.';
  assert.deepEqual(orderedEventNames(names, text), [names[1], names[0]]);
  assert.deepEqual(names, ['Databricks: Intro to Databricks', 'KH: Intro to Vibe Coding x OpenAI Codex'], 'stored tool output is unchanged');
});

test('event ordering cannot add prose-only picks and preserves unnamed picks', () => {
  assert.deepEqual(orderedEventNames(['A workshop', 'B workshop', 'C workshop'], '**Invented workshop**, **c WORKSHOP**'), ['C workshop', 'A workshop', 'B workshop']);
});

test('event cards without explanation keep their tool order', () => {
  assert.deepEqual(orderedEventNames(['B workshop', 'A workshop']), ['B workshop', 'A workshop']);
});
