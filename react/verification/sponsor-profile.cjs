// Uses fixture API responses, including profile saves; never changes real accounts.
const { chromium } = require(process.env.HACKY_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.HACKY_BROWSER_EXECUTABLE ? { executablePath: process.env.HACKY_BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    const profile = { userId: 'sponsor-test', handle: 'sponsor_test', name: 'Alex Rivera', bio: 'Me llamo nicolas cadena', hackyStyle: {}, photoUrl: null, links: {} };
    const intake = { skills: ['Solidity', 'Python', 'Blockchain', 'Web3', 'Backend', 'GPU'], skillsWanted: [], experience: 'intermediate', wantsExperienced: false, goal: 'ship', track: null, interests: [], idea: 'I want to build a decentralized verification protocol for corporate carbon offsets.', motivations: ['build'], summary: 'A GPU and backend developer.', complete: true };
    const member = { role: 'hacker', verified: false, availability: 'available', looking: true, intake };
    const messages = [
      { id: 'sponsor-question', role: 'user', parts: [{ type: 'text', text: 'Which sponsors could help with my project, and why?' }] },
      { id: 'sponsor-answer', role: 'assistant', parts: [{ type: 'text', text: 'Neon could help with the backend of your carbon offset project.' }] },
    ];
    await context.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const respond = json => route.fulfill({ json });
      if (request.method() === 'PATCH') {
        writes.push(request.postDataJSON());
        if (url.pathname === '/api/me/profile') { Object.assign(profile, writes.at(-1)); return respond(profile); }
        if (url.pathname === '/api/events/knighthacks-ix/me') { Object.assign(intake, writes.at(-1)); return respond(member); }
      }
      if (url.pathname === '/api/me') return respond({ profile, events: [{ slug: 'knighthacks-ix', name: 'Knight Hacks IX', role: 'hacker', verified: false }] });
      if (url.pathname === '/api/events/knighthacks-ix') return respond({ slug: 'knighthacks-ix', name: 'Knight Hacks IX', theme: {}, tracks: [], startsAt: null, endsAt: null });
      if (url.pathname.endsWith('/people/sponsor_test')) return respond({ ...profile, ...member, ...intake, relation: { state: 'none', requestId: null, conversationId: null } });
      if (url.pathname.endsWith('/me')) return respond(member);
      if (url.pathname.endsWith('/chat')) return respond({ messages });
      if (url.pathname.endsWith('/requests')) return respond({ requests: [] });
      if (url.pathname.endsWith('/conversations')) return respond({ conversations: [] });
      if (url.pathname.endsWith('/help-queue')) return respond({ open: [], mine: [] });
      if (url.pathname === '/api/realtime/token') return route.fulfill({ status: 503, json: { error: { code: 'internal', message: 'Polling in test.' } } });
      throw new Error(`Unexpected test request: ${request.method()} ${url.pathname}`);
    });
    const base = process.env.HACKY_TEST_URL || 'http://127.0.0.1:5183';
    await page.goto(`${base}/index.html`);
    const cards = page.locator('.sponsor-directory [data-sponsor-detail]');
    const sponsor = id => page.locator(`.sponsor-directory [data-sponsor-detail="${id}"]`);
    await sponsor('neon').waitFor();
    assert.equal(await cards.count(), 23, 'Every sponsor is shown, although the reply only names Neon');
    assert.equal(await sponsor('neon').getAttribute('data-profile-match'), 'true');
    assert.equal(await sponsor('figma').getAttribute('data-profile-match'), null);
    assert.equal(await sponsor('neon').locator('.sponsor-name').evaluate(el => getComputedStyle(el).textDecorationLine), 'underline');
    assert.equal(await sponsor('figma').locator('.sponsor-name').evaluate(el => getComputedStyle(el).textDecorationLine), 'none');
    assert.ok((await sponsor('neon').innerText()).includes('Backend'));
    await sponsor('neon').click();
    await page.getByRole('heading', { name: 'Why it fits your profile', exact: true }).waitFor();
    assert.ok((await page.locator('#info-content').innerText()).includes('Best Use of Neon'));
    assert.ok(await page.getByRole('link', { name: 'View in hacker guide', exact: true }).getAttribute('href'));
    await page.locator('#close-info').click();
    await sponsor('crest').click();
    assert.equal(await page.getByRole('heading', { name: 'Why it fits your profile', exact: true }).count(), 0);
    assert.ok((await page.locator('#info-content').innerText()).includes('Check the hacker guide'));
    await page.locator('#close-info').click();

    const openEditor = async () => {
      await page.getByRole('button', { name: 'Your profile', exact: true }).click();
      await page.getByRole('button', { name: 'Edit my answers', exact: true }).click();
    };
    await openEditor();
    await page.locator('#profile-skills').fill('Figma');
    await page.locator('#profile-idea').fill('Design a mobile interface');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.locator('#close-person').click();
    assert.equal(await sponsor('figma').getAttribute('data-profile-match'), null, 'Cancelled edits do not affect highlights');
    assert.equal(writes.length, 0);

    await openEditor();
    await page.locator('#profile-skills').fill('Figma');
    await page.locator('#profile-idea').fill('Design a mobile interface');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('button', { name: 'Edit my answers', exact: true }).waitFor();
    await page.locator('#close-person').click();
    assert.equal(await sponsor('figma').getAttribute('data-profile-match'), 'true', 'Saved changes update existing chat cards');
    assert.equal(await sponsor('neon').getAttribute('data-profile-match'), null, 'Old backend/summary matches are cleared');
    assert.equal(await cards.count(), 23);
    await page.locator('.sponsor-directory').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(os.tmpdir(), 'hacky-sponsors-desktop.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await sponsor('figma').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow on mobile');
    assert.ok(await sponsor('figma').evaluate(el => el.scrollWidth <= el.clientWidth), 'Card content fits on mobile');
    assert.ok(await sponsor('neon').locator('.sponsor-monogram').evaluate(el => el.getBoundingClientRect().width <= 30), 'Fallback icon stays compact');
    assert.deepEqual(await page.locator('.sponsor-directory img').evaluateAll(images => images.filter(img => !img.complete || !img.naturalWidth).map(img => img.src)), []);
    await page.screenshot({ path: path.join(os.tmpdir(), 'hacky-sponsors-mobile.png') });
    await page.reload();
    await sponsor('figma').waitFor();
    assert.equal(await sponsor('figma').getAttribute('data-profile-match'), 'true', 'Saved matches survive reload');
    assert.equal(await cards.count(), 23);
    assert.deepEqual(errors, []);
    console.log('PASS: all 23 sponsors, evidence and underlines, details, cancel/save updates, persisted matches, mobile layout and logos.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
