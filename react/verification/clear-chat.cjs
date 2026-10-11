// Browser-only reset: fixture history stays intact; no live API or database writes.
const { chromium } = require(process.env.HACKY_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.HACKY_BROWSER_EXECUTABLE ? { executablePath: process.env.HACKY_BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], mutations = [], posts = [];
    page.on('pageerror', error => errors.push(error.message));
    let userId = 'clear-test';
    const oldMessages = [
      { id: 'old-user', role: 'user', parts: [{ type: 'text', text: 'Find a React mentor' }] },
      { id: 'old-assistant', role: 'assistant', parts: [{ type: 'tool-ask_with_options', toolCallId: 'old-question', state: 'input-available', input: { say: 'Let’s find someone to help.', question: 'What do you need help with?', options: ['React', 'Python'] } }] },
    ];
    const stored = structuredClone(oldMessages);
    await context.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const respond = json => route.fulfill({ json });
      if (request.method() !== 'GET' && url.pathname !== '/api/realtime/token') mutations.push(`${request.method()} ${url.pathname}`);
      if (url.pathname === '/api/chat' && request.method() === 'POST') {
        const body = request.postDataJSON();
        posts.push(body);
        const answer = { id: `new-assistant-${posts.length}`, role: 'assistant', parts: [{ type: 'text', text: 'I still have your React project context.' }] };
        stored.push(body.message, answer);
        const chunks = [
          { type: 'start', messageId: answer.id }, { type: 'start-step' },
          { type: 'text-start', id: 'text' }, { type: 'text-delta', id: 'text', delta: answer.parts[0].text }, { type: 'text-end', id: 'text' },
          { type: 'finish-step' }, { type: 'finish' },
        ];
        return route.fulfill({ headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' }, body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n' });
      }
      if (url.pathname === '/api/me') return respond({ profile: { userId, handle: 'alex', name: 'Alex Rivera', bio: 'React developer.', hackyStyle: {}, photoUrl: null, links: {} }, events: ['knighthacks-ix', 'another-event'].map(slug => ({ slug, name: slug, role: 'hacker', verified: false })) });
      if (url.pathname.endsWith('/chat')) return respond({ messages: stored });
      if (url.pathname.endsWith('/me')) return respond({ role: 'hacker', availability: 'available', looking: true, intake: { skills: ['React'], skillsWanted: [], motivations: ['build'], idea: 'Build an app', complete: true } });
      if (url.pathname.endsWith('/requests')) return respond({ requests: [] });
      if (url.pathname.endsWith('/conversations')) return respond({ conversations: [] });
      if (url.pathname.endsWith('/help-queue')) return respond({ open: [], mine: [] });
      if (url.pathname === '/api/realtime/token') return route.fulfill({ status: 503, json: { error: { code: 'internal', message: 'Use polling in this test.' } } });
      if (/^\/api\/events\/[^/]+$/.test(url.pathname)) return respond({ slug: url.pathname.split('/').at(-1), name: 'Test hackathon', theme: {}, tracks: [], startsAt: null, endsAt: null });
      throw new Error(`Unexpected request: ${request.method()} ${url.pathname}`);
    });
    const open = async (slug = 'knighthacks-ix') => {
      await page.goto(`${process.env.HACKY_TEST_URL || 'http://127.0.0.1:5173'}/index.html?event=${slug}`);
      await page.waitForFunction(() => document.querySelector('#feed')?.getAttribute('aria-busy') === 'false');
    };
    const clear = async () => {
      await page.getByRole('button', { name: 'New chat', exact: true }).tap();
      await page.getByRole('button', { name: 'Start new chat', exact: true }).tap();
      await page.waitForFunction(() => !document.querySelector('#restart-chat-dialog').open);
    };
    const oldQuestion = page.getByRole('group', { name: 'What do you need help with?', exact: true });
    await open();
    await oldQuestion.waitFor();
    await page.getByRole('button', { name: 'New chat', exact: true }).tap();
    await page.getByRole('button', { name: 'Keep chatting', exact: true }).tap();
    assert.equal(await oldQuestion.count(), 1, 'Cancel preserves the visible conversation');
    await clear();
    assert.equal(await page.locator('#thread .hc-turn, #thread .msg.user').count(), 0);
    assert.equal(await page.locator('#hacky-brief').isVisible(), true, 'Starting points remain available');
    assert.deepEqual(mutations, [], 'Clearing the view never writes to any API');
    assert.deepEqual(stored, oldMessages, 'History and the pending question are unchanged');
    await open();
    assert.equal(await oldQuestion.count(), 0, 'The cleared view persists after a reload');
    await page.locator('#finder-input').fill('Let’s work on my demo instead');
    await page.locator('#finder-send').tap();
    await page.getByText('I still have your React project context.', { exact: true }).waitFor();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].message.role, 'user', 'A hidden pending question does not consume the new request');
    assert.equal(posts[0].messages, undefined, 'Only the newest message is sent, preserving server memory');
    assert.equal(await oldQuestion.count(), 0);
    assert.deepEqual(stored.slice(0, 2), oldMessages);
    await open();
    await page.getByText('I still have your React project context.', { exact: true }).waitFor();
    assert.equal(await oldQuestion.count(), 0, 'New messages survive reload without bringing old ones back');
    await clear();
    await open();
    assert.equal(await page.locator('#thread .hc-turn, #thread .msg.user').count(), 0, 'Repeated clears hide new messages too');
    await open('another-event');
    await page.getByText('What do you need help with?', { exact: true }).waitFor();
    userId = 'another-person';
    await open();
    await page.getByText('What do you need help with?', { exact: true }).waitFor();
    assert.deepEqual(mutations, ['POST /api/chat'], 'Only the explicit new message mutates the API');
    assert.deepEqual(errors, []);
    console.log('PASS: clear/cancel, reload persistence, new replies, pending-question handling, person/event isolation, original history preserved; fixture APIs only.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
