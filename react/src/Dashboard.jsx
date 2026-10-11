import {useRef, useState} from 'react';
import {Modal} from './ui.jsx';

function DashboardIcon({path}) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>;
}

export default function Dashboard() {
  const [dialog, setDialog] = useState(null);
  const menu = useRef(null);
  const entry = '/index.html';

  function openDialog(event, next) {
    // WebKit does not focus buttons on pointer clicks; retain the trigger for dialog restoration.
    event.currentTarget.focus({preventScroll: true});
    setDialog(next);
  }
  return <>
    <header className="site-header">
      <a href="#profile" aria-label="Knight Hacks dashboard"><img src="/event-demo/assets/knight-hacks-logo.svg" width="100" height="38" alt="Knight Hacks" /></a>
      <details className="menu" ref={menu}>
        <summary aria-label="Open navigation"><DashboardIcon path="M5 6h14M5 12h14M5 18h14" /></summary>
        <nav aria-label="Dashboard" onClick={event => {if (event.target.closest('a') && menu.current) menu.current.open = false;}}>
          <a href="#profile">Your badge</a><a href="#happening">Happening now</a><a href="#help">Need help?</a><a href={entry}>Use Hacky</a>
        </nav>
      </details>
    </header>
    <div className="scenery" aria-hidden="true"><i className="trunk" /><i className="vine" /><i className="leaves" /><i className="fan" /></div>
    <main>
      <section className="profile" id="profile" aria-labelledby="hacker-name">
        <span className="profile-photo" role="img" aria-label="Andres Araque" />
        <h1 id="hacker-name">Andres Araque</h1><p className="checked">Checked in</p>
        <p className="profile-line">Class <strong>Chomper</strong></p>
        <p className="profile-line">Team <a href={entry}>Join a team <span aria-hidden="true">↗</span></a></p>
        <button className="resume" id="resume" onClick={event => openDialog(event, 'resume')}><DashboardIcon path="M14 3H6v18h13V8Z M14 3v5h5M9 12h7M9 16h7" />Résumé</button>
        <button className="badge" id="badge" aria-label="Enlarge attendee QR code" onClick={event => openDialog(event, 'qr')}>
          <span className="qr-code" role="img" aria-label="Attendee QR code from the provided dashboard reference" />
          <span className="enlarge"><DashboardIcon path="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M3 3l6 6m12-6-6 6M3 21l6-6m15 9-9-9" />Tap to enlarge</span>
        </button>
        <div className="hacky-invitation"><p>Need a team?<br />Help navigating the hackathon?</p><a id="use-hacky" href={entry}>Use Hacky <DashboardIcon path="M5 12h14m-6-6 6 6-6 6" /></a></div>
      </section>
      <section className="happening" id="happening">
        <div className="section-heading"><h2>Happening now</h2><a href="https://knight-hacks.notion.site/Knight-Hacks-IX-Schedule-38ae290ccffe802796e3e34ff53952f5" target="_blank" rel="noopener">Schedule <span aria-hidden="true">↗</span></a></div>
        <p>No events are happening right now.</p>
      </section>
      <section id="help" className="help">
        <h2>Need help?</h2>
        <dl>
          <div><dt>Emergency<span>Immediate danger or medical help</span></dt><dd><a href="tel:911">911</a></dd></div>
          <div><dt>UCF Police<span>Non-emergency</span></dt><dd><a href="tel:+14078235555">407-823-5555</a></dd></div>
          <div><dt>MLH<span>Report harassment or a conduct concern</span></dt><dd><a href="tel:+14092026060">409-202-6060</a></dd></div>
        </dl>
        <nav aria-label="Help resources"><a href="mailto:incidents@mlh.io">Email MLH</a><a href="https://www.police.ucf.edu/" target="_blank" rel="noopener">UCF safety ↗</a><a href="https://mlh.io/code-of-conduct" target="_blank" rel="noopener">MLH conduct policy ↗</a></nav>
      </section>
      <footer>Dashboard preview from your screenshots.<br />Event status and badge are a static reference.</footer>
    </main>
    <Modal open={dialog === 'qr'} onClose={() => setDialog(null)} id="qr-dialog" label="Attendee badge">
      <button className="close" aria-label="Close badge" onClick={() => setDialog(null)}>×</button>
      <span className="qr-code" role="img" aria-label="Enlarged attendee QR code" /><p>Reference badge · Preview only</p>
    </Modal>
    <Modal open={dialog === 'resume'} onClose={() => setDialog(null)} id="resume-dialog" labelledBy="resume-title">
      <button className="close" aria-label="Close résumé preview" onClick={() => setDialog(null)}>×</button>
      <h2 id="resume-title">Résumé</h2><p>Your résumé isn’t included in this local preview.</p>
    </Modal>
  </>;
}
