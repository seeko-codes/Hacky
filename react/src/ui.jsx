import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { people } from './people';
import { colors, defaults } from './mascot-data';
import symbols from './symbols.svg?raw';

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
export function Pet({ style=defaults, extra='', animated=false, intro=false }) {
  const state={...defaults,...style};
  const filter=colors.find(c=>c[0]===state.color)?.[3]||'none';
  return <span className={'hacky-pet '+extra} role="img" aria-label="Your customized Hacky" data-look={state.look} data-flair={state.flair} data-move={state.move} data-animated={animated?'':undefined} data-intro-dance={intro?'':undefined} style={{'--pet-url':`url("/assets/mascots/webp/hacky-${state.look}.webp")`,'--pet-filter':filter}}><span className="pet-sprite"/><span className="pet-flair" aria-hidden="true">{[0,1,2].map(n=><i key={n}><Icon name={state.flair==='hearts'?'heart':'star'}/></i>)}</span></span>;
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
export function Modal({open,onClose,id,className,labelledBy,label,children,initialFocus}) {
  const ref=useRef(null), origin=useRef(null), closeRef=useRef(onClose);
  closeRef.current=onClose;
  useLayoutEffect(()=>{
    const node=ref.current;
    if(open&&!node.open){origin.current=document.activeElement;node.showModal();if(initialFocus)node.querySelector(initialFocus)?.focus({preventScroll:true});}
    else if(!open&&node.open){node.close();if(origin.current?.isConnected)origin.current.focus({preventScroll:true});}
  },[open,initialFocus]);
  return createPortal(<dialog ref={ref} id={id} className={className} aria-labelledby={labelledBy} aria-label={label} onCancel={e=>{e.preventDefault();closeRef.current?.();}} onClose={()=>{if(open)closeRef.current?.();}} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeRef.current?.();}}>{children}</dialog>,document.body);
}
