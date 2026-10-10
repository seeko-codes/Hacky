async page => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/index.html?onboarding=1');
  const words = page.locator('.speech-words');
  const full = await page.locator('#plan-heading').getAttribute('aria-label');
  await page.waitForFunction(() => {
    const text = document.querySelector('.speech-words').textContent;
    return text.length > 4 && text.length < document.querySelector('#plan-heading').getAttribute('aria-label').length;
  });
  if (!await page.locator('.companion-responses').evaluate(e=>e.inert && getComputedStyle(e).visibility==='hidden')) throw Error('Answers appeared before speech finished');
  await page.waitForFunction(()=>document.querySelector('.companion-responses').dataset.ready==='true');
  if (await words.textContent()!==full) throw Error('Speech did not finish');
  await page.getByLabel('Build something',{exact:true}).check();
  await page.locator('#make-plan').click();
  await page.waitForFunction(()=>document.querySelector('#onboarding').dataset.step==='2');
  if (!await page.locator('.companion-responses').evaluate(e=>e.inert)) throw Error('FRQ revealed before question');
  await page.waitForFunction(()=>document.querySelector('.companion-responses').dataset.ready==='true');
  await page.locator('#plan-detail').fill('I want to build an accessible tool with a team.');
  await page.waitForTimeout(450);
  await page.screenshot({path:'/tmp/hacky-speaking-frq.png',scale:'css'});
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.companion-responses').dataset.ready==='true');
  if(!await page.getByLabel('Build something',{exact:true}).isChecked()) throw Error('Choice lost');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:5173/index.html?onboarding=1');
  if(await page.locator('.companion-responses').getAttribute('data-ready')!=='true')throw Error('Reduced motion delayed answers');
  await page.locator('#skip-plan').click();
  await page.waitForFunction(()=>!document.querySelector('#onboarding'));
  return ['Progressive silent speech','Answers hidden and inert until complete','Reaction completes before next question','FRQ waits for its question','Back preserves choices','Reduced motion immediate','Skip works'];
}
