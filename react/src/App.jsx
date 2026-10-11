import { useEffect, useMemo, useState } from 'react';
import Conversation from './Conversation';
import Onboarding from './Onboarding';
import Customizer from './Customizer';
import { useEvents } from './Events';
import { Symbols, Pet, WorkingPet } from './ui';
import { defaults, looks, colors, flairs, moves } from './mascot-data';
import { readStore, writeStore } from './storage';
import { api, ApiError } from './api';
import { useSession } from './session';
import './session.css';

function hackyStyle(raw){const result={...defaults};for(const [key,options] of Object.entries({look:looks,color:colors,flair:flairs,move:moves})){const value=key==='flair'&&raw?.[key]==='sparks'?'stars':raw?.[key];if(options.some(option=>option[0]===value))result[key]=value;}return result;}
function storedPlan(){const plan=readStore('hacky-plan-khix-v1',null);return typeof plan?.goal==='string'&&typeof plan?.pace==='string'?plan:null;}
function dismissOnboarding(){try{sessionStorage.setItem('hacky-onboarding-skipped','true');}catch{}}
function needsOnboarding(intake){let skipped=false;try{skipped=sessionStorage.getItem('hacky-onboarding-skipped')==='true';}catch{}return new URLSearchParams(location.search).get('onboarding')==='1'||(!intake.motivations.length&&intake.idea==null&&!skipped&&location.hash!=='#events');}
// Designer-owned event theme (events.theme) onto the app's CSS variables.
const themeVars=[['brand','--action'],['brand','--outgoing-bubble'],['brandContrast','--on-action'],['brandContrast','--outgoing-text'],['accent','--gold'],['surface','--paper']];
function useEventTheme(theme){
 useEffect(()=>{
  const root=document.documentElement.style,applied=themeVars.filter(([key])=>typeof theme?.[key]==='string');
  for(const [key,name] of applied)root.setProperty(name,theme[key]);
  if(typeof theme?.brand==='string')root.setProperty('--action-hover',`color-mix(in srgb,${theme.brand} 85%,black)`);
  return()=>{for(const [,name] of applied)root.removeProperty(name);root.removeProperty('--action-hover');};
 },[theme]);
}

export default function App(){
 const session=useSession();
 useEventTheme(session.event?.theme);
 return <><Symbols/>{session.status==='ready'?<HackyApp/>:<SessionGate session={session}/>}</>;
}

function SessionGate({session}){
 const [retrying,setRetrying]=useState(false);
 if(session.status==='loading')return <main className="session-gate" data-state="loading" aria-busy="true"><WorkingPet/><p className="session-line" role="status">Getting Hacky ready…</p></main>;
 const retry=async()=>{setRetrying(true);try{await session.reload();}finally{setRetrying(false);}};
 const [title,line]={
  'signed-out':['Open Hacky from your hackathon’s dashboard','Hacky signs you in through your event.'],
  'no-event':['You’re not in a hackathon on Hacky yet','Open Hacky from your hackathon’s dashboard to join.'],
 }[session.status]||['Hacky couldn’t load',session.error instanceof ApiError?session.error.message:'Something went wrong. Try again.'];
 return <main className="session-gate"><section className="session-card" aria-labelledby="session-title">
  <span className="session-pet" aria-hidden="true"><Pet/></span>
  <h1 id="session-title">{title}</h1><p className="session-line">{line}</p>
  {session.status==='error'?<button type="button" className="hk-button" disabled={retrying} onClick={retry}>{retrying?'Retrying…':'Retry'}</button>:<a className="hk-button" href="/api/demo/portal">Demo sign-in</a>}
 </section></main>;
}

function HackyApp(){
 const session=useSession(),profile=session.me.profile;
 const style=useMemo(()=>hackyStyle(profile.hackyStyle),[profile.hackyStyle]);
 const [plan,setPlan]=useState(storedPlan),[planRevision,setPlanRevision]=useState(0),[onboarding,setOnboarding]=useState(()=>needsOnboarding(session.eventMe.intake)),[customizing,setCustomizing]=useState(false),[theme,setTheme]=useState(document.documentElement.dataset.theme||'light'),[notice,setNotice]=useState('');
 const events=useEvents(plan);
 useEffect(()=>{const params=new URLSearchParams(location.search);if(params.has('onboarding')){params.delete('onboarding');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}},[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();},[theme]);
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme:dark)');const update=()=>{let manual;try{manual=localStorage.getItem('hacky-theme');}catch{}if(!['dark','light'].includes(manual))setTheme(media.matches?'dark':'light');};media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3000);return()=>clearTimeout(timer);},[notice]);
 const changeTheme=next=>{const value=typeof next==='string'?next:theme==='light'?'dark':'light';setTheme(value);try{localStorage.setItem('hacky-theme',value);}catch{}};
 // The local plan drives event picks; the answers go to the server intake.
 const savePlan=async(next,answers)=>{
  setPlan(next);setOnboarding(false);setPlanRevision(n=>n+1);writeStore('hacky-plan-khix-v1',next);dismissOnboarding();
  try{session.setEventMe(await api(`/api/events/${session.slug}/me`,{method:'PATCH',body:answers}));}
  catch(error){setNotice(error.message);}
 };
 const saveStyle=async next=>{
  setCustomizing(false);session.setProfile({...profile,hackyStyle:next});
  try{session.setProfile(await api('/api/me/profile',{method:'PATCH',body:{hackyStyle:next}}));setNotice('Hacky’s look is saved.');}
  catch(error){session.setProfile(profile);setNotice(error.message);}
 };
 const skip=()=>{dismissOnboarding();setOnboarding(false);};
 return <>{onboarding&&<Onboarding initialPlan={plan} intake={session.eventMe.intake} style={style} onComplete={savePlan} onSkip={skip}/>}<div hidden={onboarding}><Conversation plan={plan} planRevision={planRevision} style={style} onPreferences={()=>setOnboarding(true)} onCustomize={event=>{event.currentTarget.focus({preventScroll:true});setCustomizing(true);}} events={events} theme={theme} onThemeChange={changeTheme}/></div>{events.dialogs}{events.nudge}<Customizer open={customizing} style={style} onSave={saveStyle} onClose={()=>setCustomizing(false)}/>{notice&&<div className="pet-toast" role="status">{notice}</div>}</>;
}
