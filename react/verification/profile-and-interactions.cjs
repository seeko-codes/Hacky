// Local browser regression check. Uses fixture API responses; never writes real profiles.
// HACKY_PLAYWRIGHT_PATH may point to a bundled Playwright installation.
const { chromium } = require(process.env.HACKY_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.HACKY_BROWSER_EXECUTABLE ? { executablePath: process.env.HACKY_BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const profile = { userId: 'profile-test', handle: 'profile_test', name: 'Alex Rivera', bio: 'Frontend developer.', hackyStyle: {}, photoUrl: null, links: {}, isDemo: true };
    const intake = { skills: ['React', 'CSS'], skillsWanted: [], experience: 'intermediate', wantsExperienced: false, goal: 'ship', track: null, interests: [], idea: 'Build an app', motivations: ['build'], summary: 'Frontend developer.', complete: true };
    const membership = { role: 'hacker', verified: false, availability: 'available', looking: true, intake };
    const writes = [];
    let failSkills = false;
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-10-11T08:00:00-04:00'));
    await context.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const respond = (json, status = 200) => route.fulfill({ status, json });
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON();
        writes.push({ path: url.pathname, body });
        if (url.pathname === '/api/me/profile') { Object.assign(profile, body); return respond(profile); }
        if (url.pathname === '/api/events/knighthacks-ix/me') {
          if (failSkills) return respond({ error: { code: 'internal', message: 'Try again.' } }, 503);
          Object.assign(intake, body);
          return respond(membership);
        }
      }
      if (url.pathname === '/api/me') return respond({ profile, events: [{ slug: 'knighthacks-ix', name: 'Knight Hacks IX', role: 'hacker', verified: false }] });
      if (url.pathname === '/api/events/knighthacks-ix') return respond({ slug: 'knighthacks-ix', name: 'Knight Hacks IX', theme: {}, tracks: [], startsAt: null, endsAt: null });
      if (url.pathname.endsWith('/people/profile_test')) return respond({ ...profile, ...membership, ...intake, relation: { state: 'none', requestId: null, conversationId: null } });
      if (url.pathname.endsWith('/me')) return respond(membership);
      if (url.pathname.endsWith('/chat')) return respond({ messages: [] });
      if (url.pathname.endsWith('/requests')) return respond({ requests: [] });
      if (url.pathname.endsWith('/conversations')) return respond({ conversations: [] });
      if (url.pathname.endsWith('/help-queue')) return respond({ open: [], mine: [] });
      if (url.pathname === '/api/realtime/token') return respond({ error: { code: 'internal', message: 'Polling in test.' } }, 503);
      throw new Error(`Unexpected test API request: ${request.method()} ${url.pathname}`);
    });
    const base = process.env.HACKY_TEST_URL || 'http://127.0.0.1:5173';
    await page.goto(`${base}/index.html`);
    await page.getByRole('button', { name: 'Your profile', exact: true }).tap();
    await page.getByRole('button', { name: 'Edit my answers', exact: true }).tap();
    await page.locator('#profile-about').waitFor();
    assert.equal(await page.locator('#onboarding').count(), 0, 'Editor must not reopen onboarding');
    assert.equal(await page.locator('#profile-about').inputValue(), profile.bio);
    assert.equal(await page.locator('#profile-skills').inputValue(), 'React, CSS');
    await page.locator('#profile-about').fill('I build accessible interfaces.');
    await page.locator('#profile-skills').fill('React, TypeScript, React,  CSS  ');
    await page.screenshot({ path: path.join(os.tmpdir(), 'hacky-profile-editor-mobile.png') });
    await page.getByRole('button', { name: 'Save changes', exact: true }).tap();
    await page.getByRole('button', { name: 'Edit my answers', exact: true }).waitFor();
    assert.equal(profile.bio, 'I build accessible interfaces.');
    assert.deepEqual(intake.skills, ['React', 'TypeScript', 'CSS']);
    assert.deepEqual(writes.map(w => w.body), [{ bio: profile.bio }, { skills: ['React', 'TypeScript', 'CSS'] }]);
    await page.getByRole('button', { name: 'Edit my answers', exact: true }).tap();
    await page.locator('#profile-about').fill('Unsaved change');
    await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
    assert.equal(writes.length, 2, 'Cancel must not save');
    await page.getByRole('button', { name: 'Edit my answers', exact: true }).tap();
    assert.equal(await page.locator('#profile-about').inputValue(), profile.bio, 'Cancel discards draft');
    await page.locator('#profile-skills').fill(Array.from({ length: 31 }, (_, i) => `skill${i}`).join(', '));
    await page.getByRole('alert').filter({ hasText: 'Add up to 30 skills.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), true);
    await page.locator('#profile-about').fill('Designer and developer.');
    await page.locator('#profile-skills').fill('React, Figma');
    failSkills = true;
    await page.getByRole('button', { name: 'Save changes', exact: true }).tap();
    await page.getByRole('alert').filter({ hasText: 'About saved. Skills could not be saved.' }).waitFor();
    assert.equal(await page.locator('#profile-skills').inputValue(), 'React, Figma', 'Failed saves keep draft');
    assert.equal(await page.locator('#profile-about').inputValue(), profile.bio);
    failSkills = false;
    await page.getByRole('button', { name: 'Save changes', exact: true }).tap();
    await page.getByRole('button', { name: 'Edit my answers', exact: true }).waitFor();
    assert.equal(writes.filter(w => w.path === '/api/me/profile').length, 2, 'Retry does not repeat the successful About save');
    await page.locator('#close-person').tap();
    await page.reload();
    await page.locator('#my-profile').tap();
    await page.getByText('Designer and developer.', { exact: true }).waitFor();
    await page.locator('#close-person').tap();
    await page.locator('#essentials-button').tap();
    const rows = page.locator('#recommended-events .detail-choice');
    const count = await rows.count();
    assert.ok(count > 1, 'Fixture should expose several events');
    for (let i = 0; i < count; i++) {
      await rows.nth(i).tap();
      await page.locator('#close-info').tap();
      assert.equal(await page.locator('#recommended-events [data-selected=true]').count(), 1);
      assert.equal(await rows.nth(i).getAttribute('data-selected'), 'true');
      assert.ok((await rows.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).outlineStyle))).every(style => style === 'none'), 'Touch does not leave focus rings');
    }
    await page.screenshot({ path: path.join(os.tmpdir(), 'hacky-recommended-mobile.png') });
    await page.locator('#close-essentials').tap();
    assert.equal(await page.locator('#essentials-button').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'Header button should not stay pressed');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.input), 'keyboard');
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid', 'Keyboard navigation keeps visible focus');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await page.locator('#essentials-dialog[open]').waitFor();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.locator('#info-dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.closest('#recommended-events') !== null), true, 'Back returns keyboard focus to the opened event');
    await page.goto(`${base}/index.html?onboarding=1`);
    const mascot = page.locator('#onboarding-pet .hacky-film img');
    await mascot.waitFor();
    await page.waitForFunction(() => document.querySelector('#onboarding-pet img')?.naturalWidth > 0);
    assert.match(await mascot.getAttribute('src'), /\/onboarding\/hacky-match-dance\.webp$/);
    const alpha = await mascot.evaluate(img => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return [data[3], data[(canvas.width - 1) * 4 + 3], data[data.length - 1]];
    });
    assert.deepEqual(alpha, [0, 0, 0], 'Onboarding animation has transparent corners');
    const frame = await mascot.screenshot();
    await page.waitForTimeout(350);
    assert.notDeepEqual(await mascot.screenshot(), frame, 'The transparent emote animates');
    await page.getByRole('button', { name: 'That’s me', exact: true }).waitFor();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(os.tmpdir(), 'hacky-onboarding-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.screenshot({ path: path.join(os.tmpdir(), 'hacky-onboarding-desktop-dark.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#onboarding-pet img')?.src.endsWith('.png'));
    assert.deepEqual(runtimeErrors, []);
    console.log('PASS: mobile profile edit/save/cancel/retry/limits/reload, event selection, touch focus, keyboard navigation, transparent onboarding animation and reduced motion; fixture API only.');
    console.log(`Screenshots: ${path.join(os.tmpdir(), 'hacky-profile-editor-mobile.png')}, ${path.join(os.tmpdir(), 'hacky-recommended-mobile.png')}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
