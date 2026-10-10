async page=>{
const results=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const [width,height] of [[390,844],[320,568],[375,667],[844,390],[1280,800]]){
await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:5173/index.html?onboarding=1');await page.waitForFunction(()=>[...document.querySelectorAll('link[rel=stylesheet]')].every(l=>l.sheet));await page.evaluate(()=>document.fonts.ready);
if(await page.locator('#onboarding-pet .pet-sprite').count())await page.locator('#onboarding-pet .pet-sprite').evaluate(async e=>{const image=new Image();image.src=getComputedStyle(e).backgroundImage.slice(5,-2);await image.decode()});
await page.locator('#onboarding-pet').evaluate(e=>window.originalPet=e);
for(const step of [1,2]){
const fit=await page.locator('#onboarding').evaluate(e=>({h:e.scrollHeight-e.clientHeight,w:e.scrollWidth-e.clientWidth}));results.push({width,height,step,...fit});if(fit.h>2||fit.w>2)throw Error(`Overflow at ${width}x${height}, step ${step}`);

if(step===1){await page.getByLabel('Build something',{exact:true}).check();await page.locator('#make-plan').click();await page.waitForFunction(()=>document.querySelector('#onboarding').dataset.step==='2');}
}
if(!await page.locator('#onboarding-pet').evaluate(e=>e===window.originalPet))throw Error('Pet remounted');
await page.locator('#plan-detail').fill('  I love design and want to build an accessible app with a team.  ');await page.getByRole('button',{name:'Back',exact:true}).click();if(!await page.getByLabel('Build something',{exact:true}).isChecked())throw Error('Lost choice');await page.locator('#make-plan').click();await page.waitForFunction(()=>document.querySelector('#onboarding').dataset.step==='2');if(await page.locator('#plan-detail').inputValue()!=='  I love design and want to build an accessible app with a team.  ')throw Error('Lost context');await page.locator('#make-plan').click();await page.waitForFunction(()=>!document.querySelector('#onboarding'));const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('hacky-plan-khix-v1')));if(saved.detail!=='I love design and want to build an accessible app with a team.')throw Error('Save failed');
}return {results,errors};}
