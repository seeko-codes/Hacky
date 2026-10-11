import {useEffect, useRef, useState} from 'react';
import {Modal, PersonAvatar} from './ui.jsx';
import {api} from './api.js';
import {switchedCopy, useSession} from './session.jsx';
import {hackyUrl} from './entry.js';
import {activity, chatsLine, requestsLine, roleLine, skillsLine, teamStatus} from './dashboard-model.js';

// The event dashboard at /: one template for every person, filled from the same session as Hacky
// (session.jsx: /api/me, then /api/events/:slug and /api/events/:slug/me) plus their own requests and
// chats in that event. The badge QR is the same reference image for everyone; the résumé has no data
// behind it yet, so it's labeled a preview.

// ↗ as text: without the variation selector iOS draws it as an emoji.
const ARROW = '\u2197\uFE0E';

function DashboardIcon({path}) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>;
}

// Links into Hacky keep this page's event when it was opened for one (?event=).
function useLinks(session) {
  const asked = new URLSearchParams(location.search).get('event');
  const event = asked && asked === session.slug ? asked : null;
  return {useHacky: hackyUrl({onboarding: true, event}), joinTeam: hackyUrl({start: 'team', event}), open: hackyUrl({event})};
}

export default function Dashboard() {
  const session = useSession();
  const links = useLinks(session);
  const menu = useRef(null);
  const ready = session.status === 'ready';
  const mine = useMine(ready ? session.slug : null);
  useEffect(() => {
    if (session.event?.name) document.title = `${session.event.name} · Dashboard`;
  }, [session.event?.name]);
  return <>
    <header className="site-header">
      <a href="#profile" aria-label="Knight Hacks dashboard"><img src="/event-demo/assets/knight-hacks-logo.svg" width="100" height="38" alt="Knight Hacks" /></a>
      <details className="menu" ref={menu}>
        <summary aria-label="Open navigation"><DashboardIcon path="M5 6h14M5 12h14M5 18h14" /></summary>
        <nav aria-label="Dashboard" onClick={event => {if (event.target.closest('a') && menu.current) menu.current.open = false;}}>
          <a href="#profile">Your badge</a>{ready && <a href="#activity">Requests and chats</a>}<a href="#happening">Happening now</a><a href="#help">Need help?</a><a href={links.useHacky}>Use Hacky</a>
        </nav>
      </details>
    </header>
    <div className="scenery" aria-hidden="true"><i className="trunk" /><i className="vine" /><i className="leaves" /><i className="fan" /></div>
    <main>
      {ready ? <Profile session={session} links={links} mine={mine} /> : <Gate session={session} />}
      {ready && <Activity mine={mine} href={links.open} />}
      <section className="happening" id="happening">
        <div className="section-heading"><h2>Happening now</h2><a href="https://knight-hacks.notion.site/Knight-Hacks-IX-Schedule-38ae290ccffe802796e3e34ff53952f5" target="_blank" rel="noopener">Schedule <span aria-hidden="true">{ARROW}</span></a></div>
        <p>No events are happening right now.</p>
      </section>
      <section id="help" className="help">
        <h2>Need help?</h2>
        <dl>
          <div><dt>Emergency<span>Immediate danger or medical help</span></dt><dd><a href="tel:911">911</a></dd></div>
          <div><dt>UCF Police<span>Non-emergency</span></dt><dd><a href="tel:+14078235555">407-823-5555</a></dd></div>
          <div><dt>MLH<span>Report harassment or a conduct concern</span></dt><dd><a href="tel:+14092026060">409-202-6060</a></dd></div>
        </dl>
        <nav aria-label="Help resources"><a href="mailto:incidents@mlh.io">Email MLH</a><a href="https://www.police.ucf.edu/" target="_blank" rel="noopener">UCF safety {ARROW}</a><a href="https://mlh.io/code-of-conduct" target="_blank" rel="noopener">MLH conduct policy {ARROW}</a></nav>
      </section>
      {ready && <footer>Signed in as {session.me.profile.name} (@{session.me.profile.handle})</footer>}
    </main>
  </>;
}

// Loading, signed out, not in an event, an error, or another tab switched people.
function Gate({session}) {
  const [retrying, setRetrying] = useState(false);
  if (session.status === 'loading') {
    return <section className="profile dash-gate" id="profile" aria-busy="true"><p className="checked" role="status">Loading your dashboard…</p></section>;
  }
  const retry = async () => {setRetrying(true); try {await session.reload();} finally {setRetrying(false);}};
  const copy = session.status === 'switched' ? switchedCopy(session.now) : {
    'signed-out': {title: 'You’re signed out', line: 'Sign in through your hackathon to see your dashboard.'},
    'no-event': {title: 'You’re not in a hackathon on Hacky yet', line: 'Open Hacky from your hackathon’s dashboard to join.'},
  }[session.status] || {title: 'Your dashboard couldn’t load', line: session.error?.message || 'Something went wrong. Try again.'};
  return <section className="profile dash-gate" id="profile" aria-labelledby="gate-title" role={session.status === 'switched' ? 'alert' : undefined}>
    <h1 id="gate-title">{copy.title}</h1>
    <p className="checked">{copy.line}</p>
    {session.status === 'switched'
      ? <button type="button" className="dash-action" onClick={() => location.reload()}>{copy.action}</button>
      : session.status === 'error'
        ? <button type="button" className="dash-action" disabled={retrying} onClick={retry}>{retrying ? 'Retrying…' : 'Retry'}</button>
        : <a className="dash-action" href="/api/demo/portal">Demo sign-in</a>}
  </section>;
}

function Profile({session, links, mine}) {
  const {me, event, eventMe} = session;
  const profile = me.profile;
  const intake = eventMe.intake;
  const [dialog, setDialog] = useState(null);
  // Their team, then team requests ("Contact team"), then the membership's flag. Hidden while those
  // load, so it never flashes "Looking" for someone who leads a team; if they fail, the flag alone.
  const loaded = mine.requests !== null || Boolean(mine.error);
  const team = loaded ? teamStatus(eventMe, mine.requests || [], mine.team) : null;
  const skills = skillsLine(intake?.skills);

  function openDialog(event, next) {
    // WebKit does not focus buttons on pointer clicks; retain the trigger for dialog restoration.
    event.currentTarget.focus({preventScroll: true});
    setDialog(next);
  }
  return <section className="profile" id="profile" aria-labelledby="hacker-name">
    <span className="profile-photo"><PersonAvatar person={{...profile, role: eventMe.role}} /></span>
    <h1 id="hacker-name">{profile.name}</h1>
    <p className="checked">{roleLine(eventMe, event.name)}</p>
    {intake?.track && <p className="profile-line">Track <strong>{intake.track}</strong></p>}
    {skills && <p className="profile-line">Skills <strong>{skills}</strong></p>}
    {!loaded && eventMe.role === 'hacker' && <p className="profile-line" data-team="loading" aria-busy="true">Team <strong>…</strong></p>}
    {team && <p className="profile-line" data-team={team.kind}>Team <strong>{team.label}</strong>
      {(team.kind === 'looking' || team.kind === 'not-looking') && <a href={links.joinTeam}>Join a team <span aria-hidden="true">{ARROW}</span></a>}
    </p>}
    {!intake?.track && !skills && eventMe.role === 'hacker' && <p className="profile-line">Profile <a href={links.useHacky}>Tell Hacky about you <span aria-hidden="true">{ARROW}</span></a></p>}
    <button className="resume" id="resume" onClick={event => openDialog(event, 'resume')}><DashboardIcon path="M14 3H6v18h13V8Z M14 3v5h5M9 12h7M9 16h7" />Résumé <span className="preview-tag">Preview</span></button>
    {/* The same reference badge QR for everyone (not personalized). */}
    <button className="badge" id="badge" aria-label="Enlarge attendee QR code" onClick={event => openDialog(event, 'qr')}>
      <span className="qr-code" role="img" aria-label="Attendee QR code from the provided dashboard reference" />
      <span className="enlarge"><DashboardIcon path="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M3 3l6 6m12-6-6 6M3 21l6-6m15 9-9-9" />Tap to enlarge</span>
    </button>
    <div className="hacky-invitation"><p>Need a team?<br />Help navigating the hackathon?</p><a id="use-hacky" href={links.useHacky}>Use Hacky <DashboardIcon path="M5 12h14m-6-6 6 6-6 6" /></a></div>
    <Modal open={dialog === 'qr'} onClose={() => setDialog(null)} id="qr-dialog" label="Attendee badge">
      <button className="close" aria-label="Close badge" onClick={() => setDialog(null)}>×</button>
      <span className="qr-code" role="img" aria-label="Enlarged attendee QR code" /><p>Reference badge · Preview only</p>
    </Modal>
    <Modal open={dialog === 'resume'} onClose={() => setDialog(null)} id="resume-dialog" labelledBy="resume-title">
      <button className="close" aria-label="Close résumé preview" onClick={() => setDialog(null)}>×</button>
      <h2 id="resume-title">Résumé</h2><p>Résumé uploads aren’t connected yet. Nothing from your profile is shared here.</p>
    </Modal>
  </section>;
}

// The signed-in person's own requests, chats and team in this event (the API scopes all three to the
// session), loaded once and again whenever the tab comes back. slug null: not signed in yet.
function useMine(slug) {
  const [state, setState] = useState({slug: null, requests: null, conversations: null, team: null, error: ''});
  useEffect(() => {
    if (!slug) return undefined;
    let controller = null;
    const load = () => {
      controller?.abort();
      const current = controller = new AbortController();
      Promise.all([
        api(`/api/events/${slug}/requests`, {signal: current.signal}),
        api(`/api/events/${slug}/conversations`, {signal: current.signal}),
        api(`/api/events/${slug}/me/team`, {signal: current.signal}),
      ]).then(([r, c, t]) => setState({slug, requests: Array.isArray(r?.requests) ? r.requests : [], conversations: Array.isArray(c?.conversations) ? c.conversations : [], team: t?.team ?? null, error: ''}))
        .catch(error => {if (error.name !== 'AbortError') setState(s => ({...(s.slug === slug ? s : {requests: null, conversations: null, team: null}), slug, error: 'Couldn’t load your requests and chats. Try again soon.'}));});
    };
    load();
    const visible = () => {if (document.visibilityState === 'visible') load();};
    document.addEventListener('visibilitychange', visible);
    return () => {controller?.abort(); document.removeEventListener('visibilitychange', visible);};
  }, [slug]);
  return state.slug === slug ? state : {requests: null, conversations: null, team: null, error: ''};
}

function Activity({mine, href}) {
  const data = mine.requests && mine.conversations ? activity(mine.requests, mine.conversations) : null;
  const error = mine.error;
  return <section className="activity" id="activity" aria-labelledby="activity-title">
    <div className="section-heading"><h2 id="activity-title">Requests and chats</h2><a href={href}>Open Hacky <span aria-hidden="true">{ARROW}</span></a></div>
    {error && !data ? <p className="activity-note" role="alert">{error}</p> : !data ? <p className="activity-note" role="status">Loading…</p> : <dl>
      <div data-activity="requests"><dt>Requests</dt><dd>{requestsLine(data)}</dd></div>
      <div data-activity="chats"><dt>Chats</dt><dd>{chatsLine(data)}</dd></div>
    </dl>}
  </section>;
}
