import {useEffect, useRef, useState} from 'react';
import {Icon} from './ui.jsx';
import HackyFilm from './HackyFilm';
import {useMedia} from './storage';
import './Onboarding.css';

// [choice, label, intake motivation id]
const goals = [
  ['Build a project', 'Build something', 'build'],
  ['Learn new skills', 'Learn something', 'learn'],
  ['Meet people', 'Meet my people', 'meet'],
  ['Career opportunities', 'Grow my career', 'career'],
  ['Compete for prizes', 'Win a prize', 'compete'],
  ['Have fun', 'Have fun', 'fun'],
];
// onComplete(plan, answers): plan stays local for event picks; answers ({motivations, idea}) go to the intake.
export default function Onboarding({initialPlan, intake, onComplete, onSkip}) {
  const [step, setStep] = useState(1);
  const [reacting, setReacting] = useState(false);
  const [choices, setChoices] = useState(() => initialPlan
    ? initialPlan.choices || [initialPlan.choice].filter(Boolean)
    : goals.filter(goal => intake?.motivations?.includes(goal[2])).map(goal => goal[0]));
  const [detail, setDetail] = useState(() => initialPlan ? initialPlan.detail || '' : intake?.idea || '');
  const heading = useRef(null);
  const [listening, setListening] = useState(false);

  // Skipping the second question leaves the saved idea alone.
  function complete(context = detail, keepIdea = false) {
    context = context.trim();
    const picked = goals.filter(([value]) => choices.includes(value));
    const selected = picked.map(goal => goal[0]);
    const motivations = picked.map(goal => goal[2]);
    onComplete({choices: selected, detail: context,
      goal: (selected.length ? selected.join(' + ') : 'Explore everything') + (context ? ': ' + context : ''), pace: '4'},
      keepIdea ? {motivations} : {motivations, idea: context || null});
  }

  const acknowledgement = choices.length > 1 ? "I like that mix. We'll make it happen." : {
    'Build a project': "Let's bring something to life!",
    'Learn new skills': "Ooh, let's learn something new!",
    'Meet people': "Let's find your kind of people!",
    'Career opportunities': "Let's open a few doors!",
    'Compete for prizes': "A little ambition. I like it!",
    'Have fun': "Now that's my kind of plan!",
  }[choices[0]] || "A little of everything? I'm in!";

  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const message = reacting ? acknowledgement : step === 1
    ? 'Hey, I’m Hacky.\nWhat brings you here?'
    : 'What are you hoping\nto find here?';
  const [speech, setSpeech] = useState({message: '', count: 0});
  const spoken = speech.message === message ? message.slice(0, speech.count) : '';
  const finished = reducedMotion || spoken === message;
  const answersReady = finished && !reacting;

  useEffect(() => {
    heading.current?.focus({preventScroll: true});
    if (reducedMotion) return;
    let count = 0;
    let timer;
    setSpeech({message, count});
    const advance = () => {
      count += 1;
      setSpeech({message, count});
      if (count < message.length) {
        const pause = /[.!?\n]/.test(message[count - 1]) ? 160 : 32;
        timer = window.setTimeout(advance, pause);
      }
    };
    timer = window.setTimeout(advance, 280);
    return () => window.clearTimeout(timer);
  }, [message, reducedMotion]);

  useEffect(() => {
    if (!reacting || !finished) return;
    const timer = window.setTimeout(() => { setStep(2); setReacting(false); }, reducedMotion ? 0 : 450);
    return () => window.clearTimeout(timer);
  }, [reacting, finished, reducedMotion]);

  return <main id="onboarding" className="companion-onboarding" data-step={step}>
    <form id="plan-form" className="companion-flow" onSubmit={event => {
      event.preventDefault();
      if (!answersReady) return;
      if (step === 1) setReacting(true);
      else complete();
    }}>
      <nav className="companion-nav" aria-label="Onboarding progress">
        <button type="button" className="companion-back" aria-label="Back" disabled={step === 1 || reacting} onClick={() => setStep(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>
        <span className="companion-progress" aria-label={`Question ${step} of 2`}><i className="active"/><i className={step === 2 ? 'active' : ''}/></span>
        <button id="skip-plan" type="button" className="companion-skip" onClick={() => step === 1 ? onSkip() : complete('', true)}>Skip</button>
      </nav>
      <div className="companion-stage">
        <div className="companion-thought" key={`${step}-${reacting}`}>
          <h1 id="plan-heading" className="companion-speaking" ref={heading} tabIndex={-1} aria-label={message}>
            <span className="speech-measure" aria-hidden="true">{message}</span>
            <span className="speech-words" aria-hidden="true">{reducedMotion ? message : spoken || <span className="speech-wait"><i/><i/><i/></span>}</span>
          </h1>
        </div>
        <div id="onboarding-pet" className="companion-portrait"><HackyFilm/></div>
      </div>
      <div className="companion-responses" data-ready={answersReady} aria-hidden={!answersReady} inert={!answersReady}>
        {step === 1 ? <>
          <p className="companion-hint">Pick what sounds like you</p>
          <fieldset id="plan-goals" className="companion-options" aria-labelledby="plan-heading" disabled={!answersReady}>
            {goals.map(([value, label], index) => <label className="companion-option" key={value} style={{'--answer-order': index}}>
              <input type="checkbox" name="goal" value={value} checked={choices.includes(value)} onChange={event => {
                setChoices(previous => event.target.checked ? [...previous, value] : previous.filter(choice => choice !== value));
              }}/>
              <span>{label}</span><Icon name="check"/>
            </label>)}
          </fieldset>
        </> : <div id="plan-context" className="companion-context">
          <p id="detail-hint" className="companion-hint">Share your interests, ideas, and what you’re looking for. More detail helps me find better matches.</p>
          <label className="sr-only" htmlFor="plan-detail">Your interests and hopes for the event (optional)</label>
          <textarea id="plan-detail" name="detail" rows={4} maxLength={2000} aria-describedby="detail-hint" placeholder="I love design and want to build something useful. I’d love to meet someone who can help bring my ideas to life…" value={detail} onFocus={() => setListening(true)} onBlur={() => setListening(false)} onChange={event => setDetail(event.target.value)}/>
        </div>}
        <button className="hk-button" id="make-plan" type="submit" disabled={!answersReady}>{reacting ? 'Got you...' : step === 1 ? choices.length ? 'That’s me' : 'I’m just exploring' : 'Let’s go'}<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
      </div>
    </form>
  </main>;
}
