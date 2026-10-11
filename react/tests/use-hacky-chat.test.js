// React and the real chat transport, with in-memory history and a synthetic reply. No API calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useHackyChat } from '../src/hacky/useHackyChat.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { nodeType: 9, activeElement: null, addEventListener: noop, removeEventListener: noop };
globalThis.window = { document: doc, HTMLIFrameElement: class {}, event: undefined, addEventListener: noop, removeEventListener: noop };
doc.defaultView = globalThis.window;
const page = () => ({ nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', ownerDocument: doc, addEventListener: noop, removeEventListener: noop });
const question = { id: 'pending-mentor', role: 'assistant', parts: [
  { type: 'step-start' },
  { type: 'tool-ask_with_options', toolCallId: 'old-question', state: 'input-available', input: { say: 'Let’s get you unstuck.', question: 'What do you need a mentor for?', options: ['React', 'Python'] } },
] };

for (const action of ['start', 'answer']) {
  test(`${action}: a starting point is a new message; an answer continues the question`, async t => {
    const sent = [];
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      if (url.endsWith('/chat') && init?.method !== 'POST') return Response.json({ messages: [question] });
      assert.equal(url, '/api/chat');
      sent.push(JSON.parse(init.body));
      const events = [{ type: 'start', messageId: 'reply' }, { type: 'start-step' }, { type: 'text-start', id: 'reply-text' }, { type: 'text-delta', id: 'reply-text', delta: 'Here is the next reply.' }, { type: 'text-end', id: 'reply-text' }, { type: 'finish-step' }, { type: 'finish', finishReason: 'stop' }];
      return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
      });
    });
    let chat;
    function Probe() { chat = useHackyChat('test-hacks'); return null; }
    const root = createRoot(page());
    try {
      await act(async () => root.render(createElement(Probe)));
      assert.equal(chat.ready, true);
      assert.equal(chat.pending.toolCallId, 'old-question');
      await act(async () => assert.equal(chat[action](action === 'start' ? 'Help me find hackers' : 'React'), true));
      for (let n = 0; !sent.length && n < 20; n++) await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
      assert.equal(sent.length, 1);
      const message = sent[0].message;
      if (action === 'start') {
        assert.equal(message.role, 'user');
        assert.deepEqual(message.parts, [{ type: 'text', text: 'Help me find hackers' }]);
      } else {
        assert.equal(message.role, 'assistant');
        assert.equal(message.id, question.id);
        assert.deepEqual(message.parts.find(p => p.toolCallId === 'old-question').output, { answer: 'React' });
      }
    } finally { await act(async () => root.unmount()); }
  });
}
