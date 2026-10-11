import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { data } from './event-data.js';
import { schedule, recommendEvents, matchQuestion, describeEvent, stillOn, isRecommendationQuestion } from './event-model.js';
import { Icon, Modal, Group, ExternalLink, focusQuietly } from './ui.jsx';
import { readStore, writeStore, useMedia } from './storage.js';

const guidanceKey = 'hacky-guidance-khix-2026-v1';
function createGuidanceStore() {
  const stored = readStore(guidanceKey, null);
  let value = stored && typeof stored.muted === 'boolean' && stored.events && typeof stored.events === 'object' && !Array.isArray(stored.events) ? stored : { muted: false, events: {} };
  let error = '';
  let snapshot = { value, error };
  const listeners = new Set();
  const publish = () => { snapshot = { value, error }; listeners.forEach(fn => fn()); };
  return {
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => snapshot,
    save(next) {
      if (writeStore(guidanceKey, next)) { value = next; error = ''; publish(); return true; }
      error = 'Could not save this preference. Free up browser storage and try again.'; publish(); return false;
    },
    update(id, patch) { return this.save({ ...value, events: { ...value.events, [id]: { ...value.events[id], ...patch } } }); },
  };
}
function useGuidance(store) { return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot); }
function SponsorIcon({ id }) {
  const ext = ['codex','figma','hugging-face'].includes(id) ? 'svg' : 'png';
  return <img className={`recommendation-icon sponsor-icon sponsor-${id}`} src={`/assets/brand/${id}.${ext}`} alt="" width="28" height="28" />;
}
function EventIcon({ event }) {
  return event.sponsorIds?.length ? <SponsorIcon id={event.sponsorIds[0]} /> : <svg className="recommendation-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 10h16m-9 5h3" /></svg>;
}
// reason: why it was recommended, shown under the name.
export function EventChoice({ event, openDetail, reason, selected = false }) {
  return <div className="event-result"><button type="button" className="detail-choice" data-event-detail={event.id} data-selected={selected || undefined} aria-haspopup="dialog" onClick={e => openDetail('event', event.id, e.currentTarget)}><EventIcon event={event} /><span>{event.name}{reason && <small className="choice-reason">{reason}</small>}</span><Icon name="back" /></button></div>;
}
export function EventChoices({ events, openDetail, label, reasons }) {
  return events.length ? <Group label={label || `${events.length} events`}>{events.map(event => <EventChoice key={event.id} event={event} openDetail={openDetail} reason={reasons?.[event.id]} />)}</Group> : null;
}
export function Sponsors({ sponsors = data.sponsors, openDetail }) {
  return sponsors.length ? <Group label={`${sponsors.length} sponsors`}>{sponsors.map(sponsor => <div className="sponsor-entry" key={sponsor.id}><button type="button" className="detail-choice" data-sponsor-detail={sponsor.id} aria-haspopup="dialog" onClick={e => openDetail('sponsor', sponsor.id, e.currentTarget)}><SponsorIcon id={sponsor.id} /><span>{sponsor.name}</span><Icon name="back" /></button></div>)}</Group> : null;
}
function GuidanceError({ error }) { return error ? <p className="guidance-note guidance-error" role="alert">{error}</p> : null; }
function Reminder({ event, store }) {
  const { value, error } = useGuidance(store);
  if (Date.parse(event.startDateTime) <= Date.now()) return null;
  const saved = !!value.events[event.id]?.saved;
  return <div data-reminder-for={event.id}><button type="button" className="event-remind" data-remind={event.id} aria-pressed={saved} onClick={() => store.update(event.id, { saved: !saved, dismissed: false })}>{saved ? 'Reminder set · Remove' : 'Remind me'}</button>{value.muted && <p className="guidance-note">Reminders paused.</p>}<GuidanceError error={error} /></div>;
}
function EventCard({ event, store }) {
  const links = [{ label: 'Official schedule', url: event.sourceUrl }];
  if (/submission|devpost-workshop/.test(event.id)) links.unshift({ label: 'Open Devpost', url: data.sources.devpost });
  return <article className="event-card" data-event={event.id}><div className="event-card-overview"><span className="event-when">{data.days[event.day].label}, {data.days[event.day].short} · {event.time}{event.end ? ` - ${event.end}` : ''} EDT</span><span className="event-place"><Icon name="event-pin" />{event.place}</span></div><div className="event-card-detail"><div className="event-actions"><Reminder event={event} store={store} /></div><p className="event-description" title={event.description}>{event.description}</p>{links.some(link => link.url !== event.sourceUrl) && <nav className="event-links" aria-label={`Links for ${event.name}`}>{links.filter(link => link.url !== event.sourceUrl).map(link => <ExternalLink key={link.url} href={link.url}>{link.label}</ExternalLink>)}</nav>}</div></article>;
}
function Help({ items = data.help }) { return items.map(item => <p key={item.title}>{item.text} <ExternalLink href={item.url}>{item.title}</ExternalLink></p>); }
function ScheduleAnswer({ openDetail }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: data.timeZone }).format(new Date());
  const [day, setDay] = useState(Math.max(0, data.days.findIndex(item => item.date === today)));
  const events = schedule.filter(event => event.day === day);
  return <><label className="schedule-day-label">Day <select aria-label="Schedule day" value={day} onChange={e => setDay(Number(e.target.value))}>{data.days.map((item,i) => <option key={item.date} value={i}>{item.label}, {item.short}</option>)}</select></label><div className="event-schedule"><EventChoices events={events} openDetail={openDetail} /></div></>;
}
function ReminderAnswer({ store, openDetail }) {
  const { value, error } = useGuidance(store);
  const events = schedule.filter(event => value.events[event.id]?.saved);
  return <><label className="reminder-setting"><input type="checkbox" checked={value.muted} onChange={e => store.save({ ...value, muted: e.target.checked })} /> Pause reminders</label><div className="saved-sessions">{events.length > 1 ? <EventChoices events={events} openDetail={openDetail} label={`${events.length} saved events`} /> : events.length ? <EventChoice event={events[0]} openDetail={openDetail} /> : <p>No reminders yet. Choose Remind me on an event.</p>}</div><GuidanceError error={error} /></>;
}
function ReminderNudge({ children, token }) {
  const [target, setTarget] = useState(null);
  useEffect(() => { setTarget(document.getElementById('thread')); }, []);
  useEffect(() => {
    const feed = document.getElementById('feed');
    if (!feed || !target) return;
    const follow = feed.scrollHeight - feed.clientHeight - feed.scrollTop < 160;
    feed.classList.add('has-conversation');
    if (follow) feed.scrollTop = feed.scrollHeight;
    else { const notice = document.getElementById('hacky-new-reply'); if (notice) notice.hidden = false; }
  }, [target, token]);
  return target ? createPortal(children, target) : children;
}

const essentialNames = { 'check-in': 'Check-in', submission: 'Submit on Devpost', 'code-freeze': 'Final code push', judging: 'Judging & expo' };
const essentials = Object.keys(essentialNames).map(id => schedule.find(event => event.id === `khix-${id}`));

export function useEvents(plan) {
  const [store] = useState(createGuidanceStore);
  const { value: guidance, error } = useGuidance(store);
  const [attention, setAttention] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useState('recommendations');
  const [page, setPage] = useState(0);
  const [detailStack, setDetailStack] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [now, setNow] = useState(Date.now);
  const detailContent = useRef(null);
  const previousDetails = useRef(detailStack);
  const short = useMedia('(max-height: 599px)');
  const size = short ? 2 : 4;
  const picks = useMemo(() => recommendEvents(plan?.intake, now), [plan, now]);
  const reasons = useMemo(() => Object.fromEntries(picks.map(pick => [pick.event.id, pick.reason])), [picks]);
  // When nothing ahead matches, show what's still on (in progress or later) rather than an empty panel.
  const shown = useMemo(() => picks.length ? picks.map(pick => pick.event) : stillOn(now), [picks, now]);
  const openDetail = useCallback((type, id, origin) => {
    if (type === 'event') setSelectedEventId(id);
    setDetailStack(stack => [...stack, { type, id, origin }]);
  }, []);
  const closeDetail = useCallback(() => setDetailStack(stack => stack.slice(0, -1)), []);
  useEffect(() => {
    const previous = previousDetails.current;
    previousDetails.current = detailStack;
    // Modal restores focus when the outer sheet closes. Only a nested Back needs its own return.
    if (!detailStack.length) return;
    if (detailContent.current) detailContent.current.scrollTop = 0;
    const closed = previous.length > detailStack.length ? previous.at(-1) : null;
    const origin = closed?.origin?.isConnected ? closed.origin : closed && document.querySelector(`#info-content [data-event-detail="${closed.id}"]`);
    focusQuietly(origin || document.querySelector('#info-dialog .person-sheet'));
  }, [detailStack]);
  useEffect(() => {
    const tick = () => { if (!document.hidden) setNow(Date.now()); };
    const interval = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const openPanel = useCallback(event => { focusQuietly(event?.currentTarget); setView('recommendations'); setPage(0); setSelectedEventId(null); setAttention(false); setPanelOpen(true); }, []);
  const total = Math.max(1, Math.ceil((view === 'recommendations' ? shown.length : essentials.length) / size));
  const safePage = Math.min(page, total - 1);
  const activeDetail = detailStack.at(-1);
  const detailEvent = activeDetail?.type === 'event' ? schedule.find(event => event.id === activeDetail.id) : null;
  const detailSponsor = activeDetail?.type === 'sponsor' ? data.sponsors.find(sponsor => sponsor.id === activeDetail.id) : null;
  const switchView = () => { setView(v => v === 'recommendations' ? 'essentials' : 'recommendations'); setPage(0); setSelectedEventId(null); requestAnimationFrame(() => { document.getElementById('event-panel-content')?.scrollTo(0, 0); focusQuietly(document.getElementById('essentials-title')); }); };
  // The wording follows the saved goals (plan.set), never the editor's unsaved picks.
  const intro = !shown.length ? 'No upcoming sessions in this guide snapshot.' : !plan?.set ? 'Here are some upcoming events you might like.' : picks.length ? 'Based on your goals and context.' : 'Nothing coming up matches your goals. Here’s what’s still on.';
  const dialogs = <>
    <Modal open={panelOpen} onClose={() => setPanelOpen(false)} id="essentials-dialog" className="essentials-dialog" labelledBy="essentials-title" initialFocus="#close-essentials">
      <header><h2 id="essentials-title" tabIndex={-1}>{view === 'recommendations' ? 'Recommended events' : 'Check-in & deadlines'}</h2><button type="button" className="icon" id="close-essentials" aria-label="Close essentials" onClick={() => setPanelOpen(false)}><Icon name="close" /></button></header>
      <div id="event-panel-content" className="event-panel-content"><div id="your-events" hidden={view !== 'recommendations'}><p className="guidance-note" id="your-events-intro">{intro}</p><div id="recommended-events">{shown.slice(safePage * size, (safePage + 1) * size).map(event => <EventChoice key={event.id} event={event} openDetail={openDetail} reason={reasons[event.id]} selected={event.id === selectedEventId} />)}</div></div><div id="event-essentials" hidden={view !== 'essentials'}><div className="essential-content"><p className="essentials-timezone">All times EDT</p><div className="essential-rows">{essentials.slice(safePage * size, (safePage + 1) * size).map(event => { const id = event.id.replace('khix-', ''); return <div className="essential-row" key={event.id}><button type="button" className="essential-choice" data-event-detail={event.id} aria-haspopup="dialog" onClick={e => openDetail('event', event.id, e.currentTarget)}><span className="essential-label">{essentialNames[id]}</span><span className="essential-time">{data.days[event.day].short} · {event.time}{id === 'submission' ? ' · Verify time' : Date.parse(event.endDateTime || event.startDateTime) < now ? ' · Past' : ''}</span><Icon name="back" /></button></div>; })}</div></div></div></div>
      <footer className="event-panel-footer"><nav id="event-pager" className="event-pager" aria-label="Event pages" hidden={total === 1}><button type="button" id="event-prev" className="toggle" aria-label="Previous page" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Back</button><span id="event-page-count" aria-live="polite">{safePage + 1} of {total}</span><button type="button" id="event-next" className="toggle" aria-label="Next page" disabled={safePage === total - 1} onClick={() => setPage(safePage + 1)}>Next</button></nav><nav className="event-links" aria-label="Event resources"><button type="button" id="event-panel-switch" className="event-source event-panel-switch" onClick={switchView}>{view === 'recommendations' ? 'Essentials' : 'Events'}</button><ExternalLink href={data.sources.agenda}>Schedule</ExternalLink><ExternalLink href={data.sources.guide}>Guide</ExternalLink></nav></footer>
    </Modal>
    <Modal open={!!activeDetail} onClose={closeDetail} id="info-dialog" className="person-dialog info-dialog" labelledBy="info-title" initialFocus=".person-sheet"><div className="person-sheet" tabIndex={-1}><header className="person-toolbar"><button type="button" className="toggle" id="close-info" onClick={closeDetail}><Icon name="back" />Back</button></header><div className="person-content" id="info-content" ref={detailContent}>{detailEvent && <><h2 id="info-title">{detailEvent.name}</h2><EventCard event={detailEvent} store={store} /><nav className="info-sources" aria-label="Sources"><ExternalLink href={data.sources.guide}>Hacker guide</ExternalLink><ExternalLink href={detailEvent.sourceUrl}>Official schedule</ExternalLink></nav></>}{detailSponsor && <><div className="info-identity"><SponsorIcon id={detailSponsor.id} /><h2 id="info-title">{detailSponsor.name}</h2></div><p className="info-focus">{detailSponsor.focus}</p>{detailSponsor.challenge && <section className="profile-section"><h3>Challenge</h3><p>{detailSponsor.challenge}</p></section>}<section className="profile-section"><h3>Where to meet</h3><p>{detailSponsor.careerFair ? 'Friday career fair · SU Key West' : 'Not attending the career fair'}</p></section><ExternalLink href={detailSponsor.website}>Visit {detailSponsor.name}</ExternalLink><div className="sponsor-sessions">{schedule.filter(event => event.sponsorIds.includes(detailSponsor.id)).map(event => <EventChoice key={event.id} event={event} openDetail={openDetail} />)}</div></>}</div></div></Modal>
  </>;
  const nudgeEvent = guidance.muted ? null : schedule.find(event => { const state = guidance.events[event.id], start = Date.parse(event.startDateTime); return state?.saved && !state.dismissed && start > now && start - now <= 15 * 60000; });
  const nudge = nudgeEvent ? <ReminderNudge token={nudgeEvent.id}><aside id="event-nudge" data-token={nudgeEvent.id}><div className="nudge-copy"><p>{nudgeEvent.name} starts {data.days[nudgeEvent.day].label}, {data.days[nudgeEvent.day].short} at {nudgeEvent.time} EDT · {nudgeEvent.place}</p><button type="button" className="toggle" id="nudge-open" onClick={e => openDetail('event', nudgeEvent.id, e.currentTarget)}>View event</button><GuidanceError error={error} /></div><button type="button" className="icon" id="nudge-dismiss" aria-label="Dismiss event reminder" onClick={() => store.update(nudgeEvent.id, { dismissed: true })}><Icon name="close" /></button></aside></ReminderNudge> : null;
  // null: not a guide question, so Hacky's AI answers it. Personal picks ("what do you recommend
  // for me?") always go there: the AI explains them from the saved profile and the chat.
  const answer = useCallback(question => {
    const q = question.toLowerCase();
    if (isRecommendationQuestion(q)) return null;
    if (/my reminders|pause reminders|reminder settings|saved sessions/.test(q)) return { text: 'Reminders · 15 minutes before, while Hacky is open.', content: <ReminderAnswer store={store} openDetail={openDetail} /> };
    if (/tell me about the events|recommended events/.test(q)) {
      const events = recommendEvents(plan?.intake);
      const actions = { 'Career opportunities': 'grow your career', 'Compete for prizes': 'compete for prizes' };
      const choices = plan?.choices || [];
      const context = choices.length ? 'You’re here to ' + choices.slice(0, 2).map(x => actions[x] || x.toLowerCase()).join(' and ') + '.' : 'Here are a few places to start.';
      return { text: events.length ? `${context} Here are ${events.length} events for you.` : 'No upcoming recommendations in this guide snapshot.', content: <EventChoices events={events.map(item => item.event)} openDetail={openDetail} reasons={Object.fromEntries(events.map(item => [item.event.id, item.reason]))} /> };
    }
    if (/sponsor|api partner|developer tools/.test(q)) return { text: 'Sponsors from the hacker guide:', content: <Sponsors openDetail={openDetail} /> };
    if (/practical help|get help/.test(q)) return { text: 'Get help', content: <Help /> };
    if (/schedule|explore events|browse events|different events/.test(q)) return { text: 'From the hacker guide:', content: <ScheduleAnswer openDetail={openDetail} /> };
    if (/tell me about the event|event information|event info/.test(q)) return { text: 'Knight Hacks IX · October 9-11 · UCF', content: <><div className="chat-followups"><button type="button" className="toggle" data-ask="Where can I get help at the event?">Practical help</button><button type="button" className="toggle" data-ask="Show my reminders">My reminders</button></div><ExternalLink href={data.sources.guide}>Hacker guide</ExternalLink></> };
    if (/when|where|event|workshop|session|deadline|submission|devpost|ceremony|career fair|check.in|judging|next|figma|codex|databricks|oneethos|aws|hacking ends|organizer/.test(q) && !/find.*(mentor|teammate|person)|designer|design.*help/.test(q)) {
      const matches = matchQuestion(question);
      if (matches.best) return { text: describeEvent(matches.best), content: <EventChoice event={matches.best} openDetail={openDetail} /> };
      if (matches.found && (matches.events.length || matches.sponsors.length || matches.help.length)) return { text: 'From the guide:', content: <><EventChoices events={matches.events} openDetail={openDetail} /><Sponsors sponsors={matches.events.length ? [] : matches.sponsors} openDetail={openDetail} /><Help items={matches.help} /></> };
      return { text: 'Not found in this guide snapshot.', content: <ExternalLink href={data.sources.guide}>Hacker guide</ExternalLink> };
    }
    return null;
  }, [plan, openDetail, store]);
  return { answer, openPanel, openDetail, attention, setAttention, dialogs, nudge, recommendedCount: picks.length };
}
