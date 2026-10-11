// Run from the repository root with an independent Playwright CLI WebKit session:
// npx playwright-cli -s=react-customizer run-code --filename react/verification/customizer-check.js
async page => {
  const context = await page.context().browser().newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce', colorScheme: 'light'});
  const checks = [], errors = [];
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem('hacky-onboarding-skipped', 'true'));
  const appliedPet = () => page.locator('#hacky-brief .hacky-pet');
  const activeTab = () => page.locator('.custom-tab[aria-selected="true"]').getAttribute('data-tab');
  const petFilter = pet => pet.evaluate(element => element.style.getPropertyValue('--pet-filter'));
  try {
    await page.goto('http://127.0.0.1:5173/index.html');
    check(await page.locator('html').getAttribute('data-theme') === 'light', 'Initial light theme');
    await page.locator('#theme-toggle').click();
    check(await page.locator('html').getAttribute('data-theme') === 'dark', 'Theme toggles to dark');
    await page.reload();
    check(await page.locator('html').getAttribute('data-theme') === 'dark', 'Dark theme persists after reload');
    await page.locator('#customize-hacky').click();
    check(await page.locator('#custom-dialog').evaluate(dialog => dialog.open), 'Customizer opens native dialog');
    check(await page.locator('#save-hacky').isDisabled(), 'Unchanged draft cannot be saved');
    await page.locator('[data-type="color"][data-option="mint"]').click();
    check(await page.locator('#save-status').innerText() === 'Unsaved changes. Close to discard.', 'Draft changes are disclosed');
    check(await petFilter(appliedPet()) === 'none', 'Preview does not change applied mascot');
    await page.locator('#close-customizer').click();
    check(await petFilter(appliedPet()) === 'none', 'Close discards draft');
    await page.locator('#customize-hacky').click();
    check(await petFilter(page.locator('.preview-pet')) === 'none', 'Reopen resets discarded draft');
    await page.locator('#tab-color').focus();
    await page.keyboard.press('ArrowRight');
    check(await activeTab() === 'flair', 'ArrowRight selects next tab');
    check(await page.locator('#tab-flair').evaluate(element => element === document.activeElement), 'Keyboard tab selection moves focus');
    await page.keyboard.press('End');
    check(await activeTab() === 'move', 'End selects Moves');
    check(await page.locator('#panel-move .choice-note').isVisible(), 'Reduced-motion notice is visible');
    await page.keyboard.press('Home');
    check(await activeTab() === 'color', 'Home selects Color');
    await page.keyboard.press('ArrowLeft');
    check(await activeTab() === 'move', 'ArrowLeft wraps to final tab');
    await page.keyboard.press('Escape');
    check(!await page.locator('#custom-dialog').evaluate(dialog => dialog.open), 'Escape dismisses customizer');
    check(await page.locator('#customize-hacky').evaluate(element => element === document.activeElement), 'Customizer restores trigger focus');
    await page.locator('#customize-hacky').click();
    await page.locator('#tab-color').click();
    await page.locator('[data-type="color"][data-option="mint"]').click();
    await page.locator('#tab-flair').click();
    await page.locator('[data-type="flair"][data-option="hearts"]').click();
    await page.locator('#tab-move').click();
    await page.locator('[data-type="move"][data-option="dance"]').click();
    await page.locator('#save-hacky').click();
    check(!await page.locator('#custom-dialog').evaluate(dialog => dialog.open), 'Save closes customizer');
    check(await page.evaluate(() => {
      const style = JSON.parse(localStorage.getItem('hacky-style-v1'));
      return style.color === 'mint' && style.flair === 'hearts' && style.move === 'dance';
    }), 'All three customization choices persist');
    await page.reload();
    check(await appliedPet().evaluate(pet => pet.dataset.flair === 'hearts' && pet.dataset.move === 'dance' && pet.style.getPropertyValue('--pet-filter') === 'hue-rotate(290deg)'), 'Saved mascot is applied after reload');
    await page.locator('#customize-hacky').click();
    check(await page.locator('.preview-pet .pet-sprite').evaluate(sprite => getComputedStyle(sprite).animationName) === 'none', 'Reduced motion disables mascot animation');
    await page.keyboard.press('Escape');
    await page.locator('#theme-toggle').click();
    await page.reload();
    check(await page.locator('html').getAttribute('data-theme') === 'light', 'Light theme persists after reload');
    check(errors.length === 0, 'No runtime errors: ' + JSON.stringify(errors));
    return {browser: 'WebKit', checks, errors};
  } finally {
    await context.close();
  }
}
