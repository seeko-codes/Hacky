async page => {
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:5173/index.html?onboarding=1');
 await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
 await page.getByRole('button',{name:'Pause Hacky animation'}).click();
 const samples=[];
 for(const t of [.2,3,5.4,8,10.9]){
  samples.push(await page.locator('video').evaluate(async(v,t)=>{
   v.currentTime=t;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));
   const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;
   const ctx=c.getContext('2d');ctx.drawImage(v,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;
   const corners=[d[3],d[(c.width-1)*4+3],d[(c.width*(c.height-1))*4+3],d[d.length-1]];
   return {t,corners,solid:d[((Math.floor(c.height/2)*c.width)+Math.floor(c.width/2))*4+3]};
  },t));
 }
 if(samples.some(s=>s.corners.some(a=>a!==0)||s.solid<240))throw Error(JSON.stringify(samples));
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.screenshot({path:`/tmp/hacky-transparent-${theme}.png`,scale:'css'});
 }
 return samples;
}
