import { useEffect, useState } from 'react';
import Conversation from './Conversation';
import Onboarding from './Onboarding';
import Customizer from './Customizer';
import { useEvents } from './Events';
import { Symbols } from './ui';
import { defaults, looks, colors, flairs, moves } from './mascot-data';
import { readStore, writeStore } from './storage';

function storedStyle(){const raw=readStore('hacky-style-v1',defaults),result={...defaults};for(const [key,options] of Object.entries({look:looks,color:colors,flair:flairs,move:moves})){const value=key==='flair'&&raw?.[key]==='sparks'?'stars':raw?.[key];if(options.some(option=>option[0]===value))result[key]=value;}return result;}
function storedPlan(){const plan=readStore('hacky-plan-khix-v1',null);return typeof plan?.goal==='string'&&typeof plan?.pace==='string'?plan:null;}
function needsOnboarding(){let skipped=false;try{skipped=sessionStorage.getItem('hacky-onboarding-skipped')==='true';}catch{}return new URLSearchParams(location.search).get('onboarding')==='1'||(!storedPlan()&&!skipped&&location.hash!=='#events');}
export default function App(){
 const [plan,setPlan]=useState(storedPlan),[planRevision,setPlanRevision]=useState(0),[style,setStyle]=useState(storedStyle),[onboarding,setOnboarding]=useState(needsOnboarding),[customizing,setCustomizing]=useState(false),[theme,setTheme]=useState(document.documentElement.dataset.theme||'light'),[notice,setNotice]=useState('');
 const events=useEvents(plan);
 useEffect(()=>{const params=new URLSearchParams(location.search);if(params.has('onboarding')){params.delete('onboarding');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}},[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();},[theme]);
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme:dark)');const update=()=>{let manual;try{manual=localStorage.getItem('hacky-theme');}catch{}if(!['dark','light'].includes(manual))setTheme(media.matches?'dark':'light');};media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3000);return()=>clearTimeout(timer);},[notice]);
 const changeTheme=next=>{const value=typeof next==='string'?next:theme==='light'?'dark':'light';setTheme(value);try{localStorage.setItem('hacky-theme',value);}catch{}};
 const savePlan=next=>{setPlan(next);setOnboarding(false);setPlanRevision(n=>n+1);if(!writeStore('hacky-plan-khix-v1',next))setNotice('Couldn’t save preferences. They’ll last for this session.');};
 const skip=()=>{try{sessionStorage.setItem('hacky-onboarding-skipped','true');}catch{}setOnboarding(false);};
 return <><Symbols/>{onboarding&&<Onboarding initialPlan={plan} style={style} onComplete={savePlan} onSkip={skip}/>}<div hidden={onboarding}><Conversation plan={plan} planRevision={planRevision} style={style} onPreferences={()=>setOnboarding(true)} onCustomize={event=>{event.currentTarget.focus({preventScroll:true});setCustomizing(true);}} events={events} theme={theme} onThemeChange={changeTheme}/></div>{events.dialogs}{events.nudge}<Customizer open={customizing} style={style} onSave={next=>{setStyle(next);setCustomizing(false);setNotice(writeStore('hacky-style-v1',next)?'Hacky’s look is saved.':'Your Hacky is ready for this session.');}} onClose={()=>setCustomizing(false)}/>{notice&&<div className="pet-toast" role="status">{notice}</div>}</>;
}
