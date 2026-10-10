async page => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:5173/index.html?onboarding=1');
 await page.waitForFunction(()=>{const v=document.querySelector('video');return v?.currentTime>.2&&!v.paused});
 if(!await page.locator('video').evaluate(v=>v.muted&&v.loop&&v.playsInline))throw Error('Playback configuration');
 await page.getByRole('button',{name:'Pause Hacky animation'}).click();
 if(!await page.locator('video').evaluate(v=>v.paused))throw Error('Pause failed');
 await page.getByRole('button',{name:'Play Hacky animation'}).click();
 await page.waitForFunction(()=>!document.querySelector('video').paused);
 await page.waitForTimeout(4000);
 await page.screenshot({path:'/tmp/hacky-film-phone.png',scale:'css'});
 await page.getByLabel('Build something',{exact:true}).check();await page.locator('#make-plan').click();
 await page.locator('#plan-detail').fill('I want to build a game with a team.');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>document.querySelector('video').paused);
 await page.setViewportSize({width:1280,height:800});
 await page.screenshot({path:'/tmp/hacky-film-desktop.png',scale:'css'});
 if(errors.length)throw Error(errors.join('\n'));
 return 'Muted video plays; pause/resume works; FRQ works; reduced motion pauses; no runtime errors';
}
