import test from 'node:test';
import assert from 'node:assert/strict';
import { displayMessages, isLocalCommand, textBubbles } from '../src/hacky/presentation.js';
import { nextPart } from '../src/hacky/reveal.js';

test('open questions reach the model, while explicit schedule/reminder controls stay local', () => {
  for (const text of ['what is figma', 'find a sponsor', 'What can you tell me about the events?', 'Which event should I attend?', 'When is the deadline?', 'How do I use AWS?', '¿Qué es Figma?', 'Ayúdame con mi proyecto', '¿Qué evento me sirve?']) assert.equal(isLocalCommand(text), false, text);
  for (const text of ['Show me the event schedule', 'Show my reminders', 'Browse the schedule']) assert.equal(isLocalCommand(text), true, text);
});

test('a question lead-in becomes its own timed bubble without changing the API message', () => {
  const ask = { type: 'tool-ask_with_options', toolCallId: 'q1', state: 'input-available', input: { say: 'Let’s find your crew.', question: 'What are you looking for?', options: ['A teammate', 'A team'] } };
  const source = { id: 'a1', role: 'assistant', parts: [ask] };
  const [shown] = displayMessages([source]);
  assert.equal(shown.parts.length, 2);
  assert.equal(shown.parts[0].text, ask.input.say);
  assert.equal(shown.parts[1].input.say, '');
  assert.equal(shown.parts[1].toolCallId, 'q1');
  assert.equal(source.parts.length, 1);
  assert.equal(source.parts[0].input.say, 'Let’s find your crew.');
  assert.equal(nextPart(shown.parts, { shown: new Set(), visible: () => true, finished: true }), 0);
  assert.equal(nextPart(shown.parts, { shown: new Set([0]), visible: () => true, finished: true }), 1);
  assert.equal(displayMessages([{ ...source, parts: [{ ...ask, state: 'input-streaming' }] }])[0].parts.length, 1);
});

test('sponsor cards follow the model explanation without inventing a canned question', () => {
  const source = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'find a sponsor' }] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'For your UI project, Figma could help you explore your design.' }] },
  ];
  const last = options => displayMessages(source, { eventSlug: 'knighthacks-ix', ...options }).at(-1).parts;
  assert.deepEqual(last().map(p => p.type), ['text', 'sponsor-directory']);
  assert.deepEqual(last()[1].sponsors.map(s => s.id), ['figma']);
  assert.equal(last({ active: true }).length, 1, 'wait for the complete model reply');
  assert.equal(last({ eventSlug: 'another-event' }).length, 1, 'do not offer the wrong event’s sponsors');
  assert.equal(source[1].parts.length, 1, 'presentation parts never enter model history');
  const conversation = [...source,
    { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Help me choose a sponsor’s tools for my project.' }] },
    { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'Start with a Figma prototype for your app.' }] },
  ];
  const continued = displayMessages(conversation, { eventSlug: 'knighthacks-ix' });
  assert.equal(continued.at(-1).parts.filter(p => p.type === 'sponsor-followup').length, 0, 'do not repeat the broad question after they narrowed their request');
  source[1].parts[0].text += ' What are you designing?';
  assert.equal(last().filter(p => p.type === 'sponsor-followup').length, 0, 'do not ask a second question');
});

test('an explanation arrives before its suggestion finishes streaming, with stable indexes', () => {
  const first = { type: 'text', text: 'Figma helps you prototype an interface.\n\nFor your React app,', state: 'streaming' };
  const early = textBubbles(first);
  assert.equal(early[0].text, 'Figma helps you prototype an interface.');
  assert.equal(nextPart(early, { shown: new Set(), visible: () => true, finished: false }), 0);
  assert.equal(nextPart(early, { shown: new Set([0]), visible: () => true, finished: false }), null);
  const done = textBubbles({ ...first, text: first.text + ' sketch the main screen first.', state: 'done' });
  assert.deepEqual(done[0], early[0]);
  assert.equal(nextPart(done, { shown: new Set([0]), visible: () => true, finished: true }), 1);
  assert.equal(first.state, 'streaming', 'the server message is unchanged');
});

test('splitting preserves lists, code, CRLF and a maximum of two bubbles per text part', () => {
  for (const text of ['A short answer.', '- First\n\n- Second', '1. First\n\n2. Second', 'Try this:\n```js\nconst a = 1;\n\nconsole.log(a);\n```']) {
    assert.deepEqual(textBubbles({ type: 'text', text }), [{ type: 'text', text }]);
  }
  const bubbles = textBubbles({ type: 'text', text: 'Explanation.\r\n\r\nSuggestion.\r\n\r\nMore detail.', state: 'done' });
  assert.deepEqual(bubbles.map(p => p.text), ['Explanation.', 'Suggestion.\r\n\r\nMore detail.']);
});
