// Browser regression: fixture APIs only, including the streamed assistant replies.
const { chromium } = require(process.env.HACKY_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.HACKY_BROWSER_EXECUTABLE ? { executablePath: process.env.HACKY_BROWSER_EXECUTABLE } : {}) });
  try {
    const desktop = process.env.HACKY_TEST_DESKTOP === '1';
    const context = await browser.newContext({ viewport: desktop ? { width: 1440, height: 1000 } : { width: 390, height: 844 }, isMobile: !desktop, hasTouch: true });
    const profile = { userId: 'flow-test', handle: 'alex', name: 'Alex Rivera', bio: 'Frontend developer.', hackyStyle: {}, photoUrl: null, links: {}, isDemo: true };
    const intake = { skills: ['React', 'CSS'], skillsWanted: [], experience: 'intermediate', wantsExperienced: false, goal: 'ship', track: null, interests: [], idea: 'Build an app', motivations: ['build'], summary: 'Frontend developer.', complete: true };
    const membership = { role: 'hacker', verified: false, availability: 'available', looking: true, intake };
    const peer = { userId: 'peer-test', handle: 'sam', name: 'Sam Lee', role: 'hacker', photoUrl: null, hackyStyle: {} };
    const chat = { id: 'chat-test', kind: 'dm', peer, helpRequest: null, lastMessage: null, unreadCount: 2, peerLastReadAt: null, createdAt: '2026-10-11T10:00:00Z' };
    const posts = [], unexpected = [], runtimeErrors = [];
    let reply = 'crew';
    const page = await context.newPage();
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await context.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const respond = (json, status = 200) => route.fulfill({ status, json });
      if (url.pathname === '/api/chat' && request.method() === 'POST') {
        posts.push(request.postDataJSON());
        const chunks = [{ type: 'start', messageId: `reply-${posts.length}` }, { type: 'start-step' }];
        if (reply === 'crew' || reply === 'project') {
          const input = reply === 'crew'
            ? { say: 'Let’s find your crew.', question: 'What are you looking for?', options: ['A teammate', 'A team'] }
            : { say: 'Start by sketching the main screen for your React app.', question: 'Which part of the interface needs the most work?', options: ['Navigation', 'The main screen'] };
          chunks.push({ type: 'tool-input-available', toolCallId: `ask-${posts.length}`, toolName: 'ask_with_options', input });
        } else {
          const text = reply === 'figma' ? 'Figma is a collaborative design tool.\n\nSince you build interfaces with React, sketch your main screen before coding.' : 'For your React app, Figma can help you prototype the interface and OpenAI Codex can help you implement it.\n\nStart with a small demo you can finish today.';
          chunks.push({ type: 'text-start', id: 'text' }, { type: 'text-delta', id: 'text', delta: text }, { type: 'text-end', id: 'text' });
        }
        chunks.push({ type: 'finish-step' }, { type: 'finish' });
        return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' }, body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n' });
      }
      if (url.pathname === '/api/me') return respond({ profile, events: [{ slug: 'knighthacks-ix', name: 'Knight Hacks IX', role: 'hacker', verified: false }] });
      if (url.pathname === '/api/events/knighthacks-ix') return respond({ slug: 'knighthacks-ix', name: 'Knight Hacks IX', theme: {}, tracks: [], startsAt: null, endsAt: null });
      if (url.pathname.endsWith('/me')) return respond(membership);
      if (url.pathname.endsWith('/chat')) return respond({ messages: [] });
      if (url.pathname.endsWith('/requests')) return respond({ requests: [] });
      if (url.pathname.endsWith('/conversations')) return respond({ conversations: [chat] });
      if (url.pathname.endsWith('/help-queue')) return respond({ open: [], mine: [] });
      if (url.pathname.endsWith('/messages')) return respond({ messages: [], hasMore: false });
      if (url.pathname === '/api/realtime/token') return respond({ error: { code: 'internal', message: 'Polling in test.' } }, 503);
      unexpected.push(`${request.method()} ${url.pathname}`);
      return respond({ error: { code: 'internal', message: 'Unexpected fixture request' } }, 500);
    });
    const base = process.env.HACKY_TEST_URL || 'http://127.0.0.1:5173';
    const open = async () => { await page.goto(`${base}/index.html`); await page.waitForFunction(() => document.querySelector('#feed')?.getAttribute('aria-busy') === 'false'); };
    const send = async text => { await page.locator('#finder-input').fill(text); await page.locator('#finder-send').tap(); };
    await open();
    await page.evaluate(() => {
      window.arrivals = {};
      new MutationObserver(() => {
        for (const p of document.querySelectorAll('#thread .msg.assistant p')) {
          window.arrivals[p.textContent] ??= performance.now();
        }
      }).observe(document.querySelector('#thread'), { childList: true, subtree: true });
    });
    await send('find my crew');
    await page.getByRole('group', { name: 'What are you looking for?', exact: true }).waitFor();
    const bubbles = page.locator('#thread .msg.assistant');
    assert.equal(await bubbles.filter({ hasText: 'Let’s find your crew.' }).count(), 1);
    assert.equal(await bubbles.filter({ hasText: 'What are you looking for?' }).count(), 1);
    assert.equal(await bubbles.filter({ hasText: 'Let’s find your crew.' }).filter({ hasText: 'What are you looking for?' }).count(), 0, 'Each sentence has its own bubble');
    const gap = await page.evaluate(() => arrivals['What are you looking for?'] - arrivals['Let’s find your crew.']);
    assert.ok(gap >= 280 && gap < 1000, `Expected a brief sequential gap, saw ${gap}ms`);
    await page.screenshot({ path: path.join(os.tmpdir(), 'hacky-sequential-bubbles.png') });

    reply = 'figma';
    await open();
    await send('what is figma');
    await page.getByText(/^Figma is a collaborative design tool/).waitFor();
    await page.getByText(/^Since you build interfaces with React/).waitFor();
    assert.equal(await page.locator('#thread .hc-turn .msg.assistant').count(), 2, 'Explanation and project suggestion have separate bubbles');
    assert.equal(posts.at(-1).message.parts[0].text, 'what is figma', 'General questions reach the real chat transport');
    assert.equal(posts.at(-1).eventSlug, 'knighthacks-ix');
    assert.equal(await page.getByText(/^From the guide:/).count(), 0, 'No local canned answer');

    reply = 'sponsor';
    await open();
    await send('find a sponsor');
    await page.locator('#thread [data-sponsor-detail]').first().waitFor();
    assert.equal(await page.locator('#thread [data-sponsor-detail]').count(), 2, 'Only sponsors named in the reply are listed');
    const positions = await page.evaluate(() => [
      [...document.querySelectorAll('#thread .msg.assistant p')].find(p => p.textContent.startsWith('For your React app')).getBoundingClientRect().top,
      [...document.querySelectorAll('#thread .msg.assistant p')].find(p => p.textContent.startsWith('Start with a small demo')).getBoundingClientRect().top,
      document.querySelector('#thread [data-sponsor-detail]').getBoundingClientRect().top,
    ]);
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2], 'Explanation, suggestion, relevant cards in order');
    assert.equal(await page.getByText(/^What are you looking for specifically/).count(), 0, 'No generic question is appended by the UI');
    await page.screenshot({ path: path.join(os.tmpdir(), 'hacky-personal-sponsors.png') });
    reply = 'project';
    await send('Help me prototype my React app');
    await page.getByRole('group', { name: 'Which part of the interface needs the most work?' }).waitFor();
    assert.match(posts.at(-1).message.parts[0].text, /prototype my React app/);
    assert.ok(posts.every(body => !body.messages), 'Only the newest message is submitted; presentation parts stay local');

    await page.locator('#toggle').tap();
    await page.getByRole('button', { name: 'Options for Sam Lee', exact: true }).tap();
    await page.getByRole('button', { name: 'Hide chat on this device', exact: true }).tap();
    assert.equal(await page.locator('[data-contact="chat-test"]').count(), 0);
    await page.getByRole('button', { name: 'Undo', exact: true }).tap();
    await page.locator('[data-contact="chat-test"]').waitFor();
    await page.getByRole('button', { name: 'Options for Sam Lee', exact: true }).tap();
    await page.getByRole('button', { name: 'Hide chat on this device', exact: true }).tap();
    await page.screenshot({ path: path.join(os.tmpdir(), 'hacky-hidden-chat.png') });
    await open();
    await page.locator('#toggle').tap();
    assert.equal(await page.locator('[data-contact="chat-test"]').count(), 0, 'Hidden preference survives reload');
    await page.getByText('Hidden chats on this device (1)', { exact: true }).tap();
    await page.getByRole('button', { name: 'Restore chat with Sam Lee', exact: true }).tap();
    await page.locator('[data-contact="chat-test"]').waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('hacky-hidden-chats:flow-test:knighthacks-ix'))), []);
    assert.deepEqual(unexpected, [], 'Hiding/restoring must never call a block/delete API');
    assert.deepEqual(runtimeErrors, []);
    console.log(`PASS (${desktop ? 'desktop' : 'mobile'}): separate bubbles (${Math.round(gap)}ms gap), LLM routing, explanation before suggestion and sponsor cards, model follow-up, hide/undo/persistence/restore; fixture APIs only.`);
    console.log(`Screenshots: ${path.join(os.tmpdir(), 'hacky-sequential-bubbles.png')}, ${path.join(os.tmpdir(), 'hacky-personal-sponsors.png')}, ${path.join(os.tmpdir(), 'hacky-hidden-chat.png')}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
