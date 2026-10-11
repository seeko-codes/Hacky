import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { people } from './people';
import { colors, defaults } from './mascot-data';
import symbols from './symbols.svg?raw';
import { useSession } from './session';
import './session.css';

// Trusted, static SVG symbols copied from the approved source, never user markup.
export function Symbols() { return <div aria-hidden="true" style={{display:'contents'}} dangerouslySetInnerHTML={{__html:symbols}} />; }
export function Icon({ name, ...props }) { return <svg aria-hidden="true" {...props}><use href={'#'+name}/></svg>; }
export function Avatar({ id }) {
  const [failed, setFailed] = useState(false);
  const person = people[id] || {name:'You',kind:'Hacker'};
  useEffect(() => setFailed(false), [id, person.photoUrl]);
  if (id === 'team') return <span className="avatar team-portraits" aria-hidden="true"><Avatar id="kai"/><Avatar id="lena"/></span>;
  return <span className={'avatar portrait person-photo '+(id==='self'?'self-portrait':'')} data-role={person.kind} aria-hidden="true"><span className="photo-initials">{person.name.split(/\s+/).map(w=>w[0]).slice(0,2).join('')}</span>{person.photoUrl&&!failed&&<img src={person.photoUrl} alt="" decoding="async" onError={()=>setFailed(true)}/>}</span>;
}
// Knit avatar art exists for exactly these hackyStyle values (public/assets/mascots/avatars).
const KNIT_COLORS=['original','berry','mint','sunset','rose','ice'], KNIT_FLAIRS=['none','stars','hearts'];
export function knitAvatarUrl(style) {
  const flair=style?.flair==='sparks'?'stars':style?.flair; // 'sparks' is the old name for stars
  return `/assets/mascots/avatars/knit-${KNIT_COLORS.includes(style?.color)?style.color:'original'}-${KNIT_FLAIRS.includes(flair)?flair:'none'}.webp`;
}
const initials=(name)=>String(name||'').trim().split(/\s+/).filter(Boolean).map(w=>Array.from(w)[0]).slice(0,2).join('').toUpperCase();
// A person's avatar: their photo, else a knit Hacky in their hackyStyle color and flair, else initials.
// Each image that fails to load falls through to the next. Decorative: the name is always shown beside it.
// person: any API person (PersonSummary, PublicProfile, PersonDetail, me.profile). photoUrl may be missing.
export function PersonAvatar({ person }) {
  const photo=typeof person?.photoUrl==='string'&&person.photoUrl?person.photoUrl:null;
  const sources=[photo&&['photo',photo],['knit',knitAvatarUrl(person?.hackyStyle)]].filter(Boolean);
  const key=sources.map(s=>s[1]).join(' ');
  const [failed,setFailed]=useState({key,count:0});
  const count=failed.key===key?failed.count:0; // a new person or photo starts over
  const [kind,src]=sources[count]||['initials'];
  const fail=()=>setFailed(f=>{const c=f.key===key?f.count:0;return c===count?{key,count:c+1}:f;});
  return <span className="avatar portrait person-avatar" data-role={person?.role} data-avatar={kind} aria-hidden="true">{src?<img key={src} src={src} alt="" loading="lazy" decoding="async" onError={fail}/>:<span className="avatar-initials">{initials(person?.name)}</span>}</span>;
}
// The signed-in person's avatar.
export function SelfAvatar() {
  const session = useSession();
  return <PersonAvatar person={session.me?.profile} />;
}
export function Pet({ style=defaults, extra='', animated=false, intro=false }) {
  const state={...defaults,...style};
  const filter=colors.find(c=>c[0]===state.color)?.[3]||'none';
  return <span className={'hacky-pet '+extra} role="img" aria-label="Your customized Hacky" data-flair={state.flair} data-move={state.move} data-animated={animated?'':undefined} data-intro-dance={intro?'':undefined} style={{'--pet-filter':filter}}><span className="pet-sprite"/><span className="pet-flair" aria-hidden="true">{[0,1,2].map(n=><i key={n}><Icon name={state.flair==='hearts'?'heart':'star'}/></i>)}</span></span>;
}
export function WorkingPet({style,state='working'}) {
  return <span className={'working-hacky '+state} aria-hidden="true"><Pet style={style}/><span className="work-mark">{state==='done'?<Icon name="check"/>:<><span/><span/><span/></>}</span></span>;
}
export function Dots() { return <span className="thinking-dots" aria-hidden="true"><i/><i/><i/></span>; }
export function ExternalLink({href,children,className='event-source',...props}) { return <a href={href} className={className} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>; }
export function Group({label,children,className='recommendation-choices'}) {
  const [open,setOpen]=useState(true);
  return <details className="hk-disclosure recommendation-group" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{open?'Hide':'Show'} {label}</summary><div className={className}>{children}</div></details>;
}
// The last input, as <html data-input="keyboard|pointer">. After touch or a mouse, focus that script
// moves (a dialog returning focus to the button that opened it) shows no ring (hacky-primitives.css):
// WebKit would otherwise ring the tapped button, so it looks stuck or selected. Keyboard users keep it.
if(typeof window!=='undefined'){
  const input=value=>{document.documentElement.dataset.input=value;};
  // A touch screen starts as pointer, so focus moved before the first tap shows no ring either.
  if(window.matchMedia?.('(hover:none) and (pointer:coarse)').matches)input('pointer');
  // Typing into a field (the iPhone keyboard's keys too) isn't keyboard navigation; Tab and Escape are.
  const typing=e=>e.key!=='Tab'&&e.key!=='Escape'&&e.target?.matches?.('textarea,select,[contenteditable],input:not([type=checkbox],[type=radio],[type=button],[type=submit])');
  window.addEventListener('keydown',e=>{if(!e.metaKey&&!e.ctrlKey&&!e.altKey&&!typing(e))input('keyboard');},true);
  window.addEventListener('pointerdown',()=>input('pointer'),true);
  // Older WebKit and embedded browsers can deliver touch/mouse events without pointerdown.
  // Register before focus changes so opening or closing a dialog never inherits a keyboard ring.
  window.addEventListener('touchstart',()=>input('pointer'),{capture:true,passive:true});
  window.addEventListener('mousedown',()=>input('pointer'),true);
}
// Focus moved by script without scrolling. The ring rule above decides whether it shows; focusVisible
// says the same to browsers that support that option.
export function focusQuietly(el){el?.focus({preventScroll:true,focusVisible:document.documentElement.dataset.input==='keyboard'});}
export function Modal({open,onClose,id,className,labelledBy,label,children,initialFocus}) {
  const ref=useRef(null), origin=useRef(null), closeRef=useRef(onClose);
  closeRef.current=onClose;
  useLayoutEffect(()=>{
    const node=ref.current;
    if(open&&!node.open){origin.current=document.activeElement;node.showModal();focusQuietly(initialFocus?node.querySelector(initialFocus):document.activeElement);}
    else if(!open&&node.open){node.close();if(origin.current?.isConnected)focusQuietly(origin.current);}
  },[open,initialFocus]);
  // A tap on the dimmed backdrop closes. The listener sits on the dialog itself, not React's root:
  // iOS Safari can skip the click for a tap on an element with no click listener of its own.
  useEffect(()=>{
    const node=ref.current;
    const backdrop=e=>{if(e.target!==node)return;const r=node.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeRef.current?.();};
    node.addEventListener('click',backdrop);
    return()=>node.removeEventListener('click',backdrop);
  },[]);
  return createPortal(<dialog ref={ref} id={id} className={className} aria-labelledby={labelledBy} aria-label={label} onCancel={e=>{e.preventDefault();closeRef.current?.();}} onClose={()=>{if(open)closeRef.current?.();}}>{children}</dialog>,document.body);
}
