import {useEffect, useRef, useState} from 'react';
import {WorkingPet} from './ui.jsx';

const goals = [
  ['Build a project', 'Build something'],
  ['Learn new skills', 'Learn something'],
  ['Meet people', 'Meet my people'],
  ['Career opportunities', 'Grow my career'],
  ['Compete for prizes', 'Compete for prizes'],
  ['Have fun', 'Have fun'],
];

export default function Onboarding({initialPlan, style, onComplete, onSkip}) {
  const [step, setStep] = useState(1);
  const [choices, setChoices] = useState(() => initialPlan?.choices || [initialPlan?.choice].filter(Boolean));
  const [detail, setDetail] = useState(initialPlan?.detail || '');
  const heading = useRef(null);
  const main = useRef(null);

  useEffect(() => {
    if (main.current) main.current.scrollTop = 0;
    heading.current?.focus({preventScroll: true});
  }, [step]);

  function complete(context = detail) {
    const trimmed = context.trim();
    const selected = goals.map(([value]) => value).filter(value => choices.includes(value));
    onComplete({
      choices: selected, detail: trimmed,
      goal: (selected.length ? selected.join(' + ') : 'Explore everything') + (trimmed ? ': ' + trimmed : ''),
      pace: '4',
    });
  }

  return <main id="onboarding" ref={main}>
    <form id="plan-form" className="onboarding-form" onSubmit={event => {
      event.preventDefault();
      if (step === 1) setStep(2);
      else complete();
    }}>
      <nav className="plan-progress" aria-label="Onboarding progress">
        <button type="button" className="toggle" id="plan-back" hidden={step === 1} onClick={() => setStep(1)}>Back</button>
        <span id="plan-step-count">{step} of 2</span>
      </nav>
      <div className="onboarding-intro">
        <div id="onboarding-pet"><WorkingPet style={style} state="listening" /></div>
        <h1 id="plan-heading" tabIndex={-1} ref={heading}>{step === 1 ? 'What would make this worthwhile?' : 'What do you have in mind?'}</h1>
        <p id="plan-intro-hint">{step === 1 ? 'Pick any, or leave it open.' : 'Optional'}</p>
      </div>
      <fieldset id="plan-goals" aria-labelledby="plan-heading" hidden={step !== 1}>
        <div className="goal-options">{goals.map(([value, label]) =>
          <label className="goal-option" key={value}>
            <input type="checkbox" name="goal" value={value} checked={choices.includes(value)} onChange={event => {
              setChoices(previous => event.target.checked ? [...previous, value] : previous.filter(choice => choice !== value));
            }} />
            <span>{label}</span>
          </label>
        )}</div>
      </fieldset>
      <div id="plan-context" hidden={step !== 2}>
        <label className="hk-field plan-detail" htmlFor="plan-detail">
          <span className="sr-only">What do you have in mind?</span>
          <textarea id="plan-detail" name="detail" rows={3} maxLength={2000} aria-describedby="detail-hint" placeholder="An idea, a skill, people to meet, or something you need help with…" value={detail} onChange={event => setDetail(event.target.value)} />
          <span id="detail-hint" className="detail-hint">More detail, better recommendations.</span>
        </label>
      </div>
      <button className="hk-button" id="make-plan" type="submit">{step === 1 ? 'Continue' : 'Make it mine'}</button>
      <button className="toggle" id="skip-plan" type="button" onClick={() => step === 1 ? onSkip() : complete('')}>{step === 1 ? 'Skip for now' : 'Skip this'}</button>
      <p className="guidance-note">Saved in this browser.</p>
    </form>
  </main>;
}
