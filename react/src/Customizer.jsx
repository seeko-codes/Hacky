import {useEffect, useRef, useState} from 'react';
import {Icon, Modal, Pet} from './ui.jsx';
import {useMedia} from './storage.js';
import {looks, colors, flairs, moves, defaults} from './mascot-data.js';

const tabs = [['look', 'Looks'], ['color', 'Color'], ['flair', 'Flair'], ['move', 'Moves']];
const groups = {look: looks, color: colors, flair: flairs, move: moves};

export default function Customizer({open, style, onSave, onClose}) {
  const [draft, setDraft] = useState(() => ({...defaults, ...style}));
  const [tab, setTab] = useState('look');
  const tabButtons = useRef({});
  const reducedMotion = useMedia('(prefers-reduced-motion:reduce)');
  useEffect(() => {
    if (open) {
      setDraft({...defaults, ...style});
      setTab('look');
    }
  }, [open, style]);
  const changed = Object.keys(defaults).some(key => draft[key] !== style[key]);

  function selectTab(next, focus = false) {
    setTab(next);
    if (focus) tabButtons.current[next]?.focus();
  }

  function keyTab(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      selectTab(tabs[next][0], true);
    }
  }

  return <Modal open={open} onClose={onClose} id="custom-dialog" className="custom-dialog" labelledBy="custom-title">
    <div className="custom-shell">
      <header className="custom-header">
        <div><h2 id="custom-title">Make Hacky yours.</h2></div>
        <button type="button" className="icon" id="close-customizer" aria-label={changed ? 'Discard changes and close customization' : 'Close customization'} onClick={onClose}><Icon name="close" /></button>
      </header>
      <div className="custom-body">
        <div className="custom-preview">
          <div className="pet-pedestal"><Pet style={draft} extra="preview-pet" animated /></div>
          <div>
            <div className="preview-title" id="preview-title">{looks.find(look => look[0] === draft.look)?.[1]}</div>
            <button type="button" className="surprise" id="surprise-hacky" onClick={() => setDraft(Object.fromEntries(Object.entries(groups).map(([key, options]) => [key, options[Math.floor(Math.random() * options.length)][0]])))}><Icon name="shuffle" />Surprise me</button>
          </div>
        </div>
        <div className="custom-controls">
          <div className="custom-tabs" role="tablist" aria-label="Customize Hacky">{tabs.map(([key, label], index) =>
            <button type="button" className="custom-tab" role="tab" id={'tab-' + key} key={key} aria-selected={tab === key} aria-controls={'panel-' + key} data-tab={key} tabIndex={tab === key ? 0 : -1} ref={button => {tabButtons.current[key] = button;}} onClick={() => selectTab(key)} onKeyDown={event => keyTab(event, index)}>{label}</button>
          )}</div>
          {tabs.map(([type]) => <section className="tab-panel" role="tabpanel" id={'panel-' + type} aria-labelledby={'tab-' + type} hidden={tab !== type} key={type}>
            <div className={type === 'look' ? 'choice-grid' : type + '-grid'} id={type + '-options'}>{groups[type].map(option =>
              <button type="button" key={option[0]} data-option={option[0]} data-type={type} aria-pressed={draft[type] === option[0]} className={type === 'look' ? 'look-choice' : type === 'color' ? 'color-choice' : 'tile-choice'} onClick={() => setDraft(previous => ({...previous, [type]: option[0]}))}>
                {type === 'look' ? <><span className="look-thumb" aria-hidden="true"><Pet style={{...defaults, look: option[0]}} /></span><span className="look-name">{option[1]}</span></> : type === 'color' ? <><span className="swatch" style={{'--swatch': option[2]}} />{option[1]}</> : <><span className="tile-icon" aria-hidden="true"><Icon name={option[2]} /></span>{option[1]}</>}
              </button>
            )}</div>
            {type === 'move' && <p className="choice-note" hidden={!reducedMotion}>Reduced motion is on.</p>}
          </section>)}
        </div>
      </div>
      <footer className="custom-bottom">
        <span className="custom-saved-note" id="save-status">{changed ? 'Unsaved changes. Close to discard.' : 'Your current look.'}</span>
        <button type="button" id="save-hacky" className="custom-save" disabled={!changed} onClick={() => onSave({...draft})}><Icon name="check" />Save Hacky</button>
      </footer>
    </div>
  </Modal>;
}
