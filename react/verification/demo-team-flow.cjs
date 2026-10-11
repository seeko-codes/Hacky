// Browser fixture regression; SQL rules and real delays are tested by npm run test:demo.
const { chromium } = require(process.env.HACKY_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.HACKY_BROWSER_EXECUTABLE ? { executablePath: process.env.HACKY_BROWSER_EXECUTABLE } : {}) });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: true });
      const page = await context.newPage();
      const errors = [], unexpected = [], invitations = [];
      page.on('pageerror', error => errors.push(error.message));
      const person = (userId, name, role = 'hacker') => ({ userId, name, handle: userId, role, photoUrl: null, hackyStyle: {} });
      const self = person('alex', 'Alex Rivera'), teammate = person('jamie', 'Jamie Park');
      const recruit = person('sam', 'Sam Lee'), mentor = person('morgan', 'Morgan Taylor', 'mentor');
      const intake = { skills: ['React'], skillsWanted: [], experience: 'intermediate', wantsExperienced: false, goal: 'ship', track: null, interests: [], idea: 'Build an app', motivations: ['build'], summary: 'Frontend developer.', complete: true };
      const summary = (id, peer, kind = 'dm') => ({ id, peer, kind, helpRequest: null, lastMessage: null, unreadCount: 0, peerLastReadAt: null, createdAt: '2026-10-11T10:00:00Z' });
      const group = { ...summary('group', teammate, 'team'), team: { id: 'team', name: 'Your team', maxSize: 4 }, members: [self, teammate] };
      const conversations = [group];
      const requests = [];
      const message = (conversationId, senderId, body, kind = 'text', clientId = null) => ({ id: randomUUID(), conversationId, senderId, body, kind, clientId, createdAt: new Date().toISOString() });
      const messages = { group: [message('group', teammate.userId, 'Our prototype is ready. Let’s find one more teammate.')] };
      const history = [recruit, mentor].map(p => ({ id: `draft-${p.userId}`, role: 'assistant', parts: [{ type: 'tool-draft_intro', toolCallId: `intro-${p.userId}`, state: 'output-available', input: {}, output: { card: 'draft', to: p, intro: `Hi ${p.name}, let’s connect!`, source: 'agent', team: null } }] }));
      await context.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        const respond = (json, status = 200) => route.fulfill({ status, json });
        if (url.pathname === '/api/me') return respond({ demoMode: true, profile: { ...self, bio: 'Frontend developer.', links: {}, isDemo: true }, events: [{ slug: 'knighthacks-ix', name: 'Knight Hacks IX', role: 'hacker', verified: false }] });
        if (url.pathname === '/api/events/knighthacks-ix') return respond({ slug: 'knighthacks-ix', name: 'Knight Hacks IX', theme: {}, tracks: [], startsAt: null, endsAt: null });
        if (url.pathname.endsWith('/me')) return respond({ role: 'hacker', verified: false, availability: 'available', looking: true, intake });
        if (url.pathname.endsWith('/chat')) return respond({ messages: history });
        if (url.pathname.endsWith('/demo/team-chat')) return respond({ conversationId: group.id });
        if (url.pathname.endsWith('/conversations')) return respond({ conversations });
        if (url.pathname.includes('/people/')) return respond({ relation: { state: 'none' } });
        if (url.pathname.endsWith('/help-queue')) return respond({ open: [], mine: [] });
        if (url.pathname.endsWith('/requests')) {
          if (method === 'GET') return respond({ requests });
          const body = request.postDataJSON(), peer = body.toUserId === mentor.userId ? mentor : recruit;
          await sleep(2000);
          const id = `dm-${peer.userId}`;
          conversations.push(summary(id, peer));
          messages[id] = [message(id, self.userId, body.intro)];
          const accepted = { id: randomUUID(), person: peer, status: 'accepted', direction: 'outgoing', conversationId: id, intro: body.intro, hiddenAt: null, createdAt: new Date().toISOString() };
          requests.push(accepted);
          return respond({ request: accepted });
        }
        if (url.pathname.endsWith('/team-members')) {
          invitations.push(request.postDataJSON());
          await sleep(2000);
          group.members.push(recruit);
          messages.group.push(message('group', null, 'Sam Lee accepted the invitation and joined the team.', 'system'));
          return respond({ conversationId: group.id });
        }
        const thread = url.pathname.match(/^\/api\/conversations\/([^/]+)\/(messages|read)$/);
        if (thread) {
          const [, id, action] = thread;
          if (action === 'read') return respond({ lastReadAt: new Date().toISOString() });
          if (method === 'GET') return respond({ messages: messages[id] || [], hasMore: false });
          const { body, clientId } = request.postDataJSON();
          const saved = message(id, self.userId, body, 'text', clientId);
          messages[id].push(saved);
          return respond({ message: saved }, 201);
        }
        if (url.pathname === '/api/realtime/token') return respond({ error: { code: 'internal', message: 'Polling in test.' } }, 503);
        unexpected.push(`${method} ${url.pathname}`);
        return respond({ error: { code: 'internal', message: 'Unexpected fixture request.' } }, 500);
      });
      await page.goto(`${process.env.HACKY_TEST_URL || 'http://127.0.0.1:5173'}/index.html`);
      await page.waitForFunction(() => document.querySelector('#feed')?.getAttribute('aria-busy') === 'false');
      const sendCard = name => page.locator('.hc-card').filter({ hasText: `Intro to ${name}` }).getByRole('button', { name: 'Send request', exact: true });
      const started = Date.now();
      await sendCard(recruit.name).tap();
      await page.getByRole('button', { name: 'Sending…', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Invite to team chat', exact: true }).waitFor();
      assert.ok(Date.now() - started >= 1900, 'The invite opens a DM after the acceptance delay');
      assert.equal(await page.locator('#dm-title').innerText(), recruit.name);
      await page.screenshot({ path: path.join(os.tmpdir(), `hacky-team-invite-${mobile ? 'mobile' : 'desktop'}.png`) });
      const joinStarted = Date.now();
      await page.getByRole('button', { name: 'Invite to team chat', exact: true }).tap();
      await page.getByRole('button', { name: 'Inviting…', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Inviting…', exact: true }).isDisabled(), true);
      await page.getByLabel('Team members', { exact: true }).waitFor();
      assert.ok(Date.now() - joinStarted >= 1900);
      assert.equal(await page.locator('#dm-title').innerText(), 'Your team');
      assert.equal(await page.locator('.team-member-chip[title="Sam Lee"] .person-avatar').count(), 1);
      assert.equal(await page.locator('#dm-avatar .team-photo-stack .person-avatar').count(), 3);
      await page.locator('#dm-feed').getByText('Our prototype is ready. Let’s find one more teammate.', { exact: true }).waitFor();
      await page.locator('#dm-feed').getByText('Sam Lee accepted the invitation and joined the team.', { exact: true }).waitFor();
      assert.equal(await page.locator('#dm-feed .sender').first().innerText(), 'Jamie');
      await page.locator('#dm-input').fill('Welcome to the team!');
      await page.locator('#dm-send').tap();
      await page.waitForFunction(() => !document.querySelector('#dm-feed .social-sending'));
      await page.screenshot({ path: path.join(os.tmpdir(), `hacky-team-chat-${mobile ? 'mobile' : 'desktop'}.png`) });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      await page.locator('#back-list').tap();
      await page.locator('[data-contact="dm-sam"]').tap();
      await page.getByRole('button', { name: 'Open team chat', exact: true }).waitFor();
      assert.equal(invitations.length, 1, 'Joined teammates get navigation instead of duplicate invitations');
      if (mobile) {
        await page.locator('#back-list').tap();
        await page.locator('#close-sidebar').tap();
      }
      await sendCard(mentor.name).tap();
      await page.waitForFunction(() => document.querySelector('#dm-title')?.textContent === 'Morgan Taylor');
      assert.equal(await page.getByRole('button', { name: 'Invite to team chat', exact: true }).count(), 0, 'Mentors only have one-to-one chats');
      assert.equal(await page.getByRole('button', { name: 'Open team chat', exact: true }).count(), 0);
      await page.locator('#dm-input').fill('Could you help with our prototype?');
      await page.locator('#dm-send').tap();
      await page.waitForFunction(() => !document.querySelector('#dm-feed .social-sending'));
      assert.deepEqual(invitations, [{ userId: 'sam' }]);
      assert.deepEqual(unexpected, []);
      assert.deepEqual(errors, []);
      console.log(`PASS ${mobile ? 'mobile' : 'desktop'}: invite → 2s → DM → team invitation → 2s → existing group; history, members, send and mentor exclusion.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
