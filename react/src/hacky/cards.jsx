// What Hacky's messages render: text bubbles, answer chips, and one card per
// tool result, chosen by tool name. Shapes: toolOutputs in shared/contract.ts.
// Cards never act on their own; only their buttons call /api.
import { Component, createContext, Fragment, useContext, useEffect, useRef, useState } from 'react';
import { api, ApiError, notifyChanged } from '../api.js';
import { Group, Icon, Modal, PersonAvatar } from '../ui.jsx';

// { slug, busy, viewProfile({ handle, reason }), contactTeam(team), openConversation(id) }
export const CardActions = createContext(null);

const ROLE = { hacker: 'Hacker', mentor: 'Mentor', sponsor: 'Sponsor', organizer: 'Organizer' };
const LEVEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const NOW = { available: 'available now', busy: 'busy right now' };
const LINK = /https?:\/\/|www\./i;
const list = (value) => (Array.isArray(value) ? value : []);
const firstName = (person) => person?.name?.split(/\s+/)[0] || 'them';
const failure = (error, fallback) => (error instanceof ApiError ? error.message : fallback);
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// A result card reads in about two seconds: who (avatar, name, one quiet meta
// line), one short "why" line, up to three skills, one main action. Longer
// text (bio, team idea, the full reason) lives in the profile dialog.

// The "why" line: the strongest evidence first, from the card's own fields only.
const WHY_MAX = 38; // characters: one line on a card 2 across (about 280px of text)

// "React", "React + UI", "React, UI + Figma", "React, UI + 2 more": every name
// while it fits in room characters, else the first one or two and a count.
function skillText(skills, room) {
  const name = (shown) => (shown.length === skills.length
    ? `${shown.slice(0, -1).join(', ')}${shown.length > 1 ? ' + ' : ''}${shown.at(-1)}`
    : `${shown.join(', ')} + ${skills.length - shown.length} more`);
  const tries = [skills.length <= 3 ? skills : null, skills.slice(0, 2), skills.slice(0, 1)].filter(Boolean);
  return tries.map(name).find((text) => text.length <= room) ?? name(skills.slice(0, 1));
}

// The lead, plus the first extra that still fits on the line.
function why(lead, extras = []) {
  const extra = extras.find((x) => x && `${lead}, ${x}`.length <= WHY_MAX);
  return extra ? `${lead}, ${extra}` : lead;
}

// Fallback: the search's own reason, cut at its first point.
const firstPoint = (reason) => String(reason || '').split(/;|\.(?:\s|$)/)[0].trim();

// A closest fit has no strong skill match, so its line says what they do bring.
function personWhy({ evidence: e = {}, skills, reason }, closest) {
  const matched = list(e.matchedSkills), own = list(skills), interests = list(e.sharedInterests);
  const extras = [
    e.sameTrack && e.track && `also on ${e.track}`,
    interests.length > 0 && `also into ${interests[0]}`,
    e.sameGoal && e.goal && `also wants to ${e.goal}`,
  ];
  if (matched.length) return why(`Knows ${skillText(matched, WHY_MAX - 6)}`, extras);
  if (closest && own.length) return why(`Knows ${skillText(own.slice(0, 2), WHY_MAX - 6)}`, extras);
  const shared = extras.find(Boolean);
  return shared ? capital(shared) : firstPoint(reason);
}

function mentorWhy({ evidence: e = {}, skills, reason }, closest) {
  const matched = list(e.matchedSkills), own = list(skills), now = NOW[e.availability];
  if (matched.length) return why(`Knows ${skillText(matched, WHY_MAX - 6)}`, [now]);
  if (closest && own.length) return why(`Knows ${skillText(own.slice(0, 2), WHY_MAX - 6)}`, [now]);
  return now ? capital(now) : firstPoint(reason);
}

// One quiet line of facts joined by dots. A dot that would start a wrapped line
// is clipped (hacky-chat.css), so it only ever breaks between facts.
function Meta({ items }) {
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return <span className="hc-sub"><span>{shown.map((item, i) => <span key={i}>{item}</span>)}</span></span>;
}

function CardHead({ person, title, meta, closest }) {
  return (
    <div className="hc-head">
      <PersonAvatar person={person} />
      <div className="info">
        <span className="hc-title">
          <span className="name">{title}</span>
          {/* A "closest" result: near the search, not a strong match. */}
          {closest && <span className="hc-closest">Closest fit</span>}
        </span>
        <Meta items={meta} />
      </div>
    </div>
  );
}

const personMeta = (role, experience, track) => [ROLE[role] || 'Member', LEVEL[experience], track];
const mentorMeta = (verified) => ['Mentor', verified && 'Verified'];

// At most three: matched skills first and highlighted, the rest muted.
function SkillTags({ skills, matched, label }) {
  const hit = new Set(list(matched).map((s) => s.toLowerCase()));
  const seen = new Set();
  const shown = [...list(matched), ...list(skills)]
    .filter((s) => !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, 3);
  if (!shown.length) return null;
  return (
    <ul className="hc-tags" aria-label={label}>
      {shown.map((skill) => <li key={skill} className={hit.has(skill.toLowerCase()) ? 'matched' : undefined}>{skill}</li>)}
    </ul>
  );
}

// The card's main button, or a small text link when the card has another main action.
function ViewProfile({ person, reason, label = 'View profile', link = false }) {
  const { viewProfile } = useContext(CardActions);
  return (
    <button
      type="button"
      className={link ? 'hc-link' : 'hk-button'}
      aria-haspopup="dialog"
      aria-label={`${label}, ${person.name}`}
      onClick={(event) => {
        // WebKit doesn't focus buttons on click; the dialog restores focus here.
        event.currentTarget.focus({ preventScroll: true });
        viewProfile({ handle: person.handle, reason });
      }}
    >
      {label}
    </button>
  );
}

function MatchCard({ card, closest }) {
  const { person, reason } = card;
  const evidence = card.evidence || {};
  if (!person?.handle) return null;
  const mentor = card.card === 'mentor';
  const line = mentor ? mentorWhy(card, closest) : personWhy(card, closest);
  return (
    <article className="hc-card">
      <CardHead
        person={person}
        title={person.name}
        meta={mentor ? mentorMeta(card.verified) : personMeta(person.role, evidence.experience, evidence.track)}
        closest={closest}
      />
      {line && <p className="hc-why">{line}</p>}
      <SkillTags skills={card.skills} matched={evidence.matchedSkills} label={`${person.name}'s skills`} />
      <div className="hc-actions"><ViewProfile person={person} reason={reason} /></div>
    </article>
  );
}

const spotsLeft = (team) => {
  const left = Math.max(0, team.maxSize - team.size);
  return left === 0 ? 'Full' : `${left} ${left === 1 ? 'spot' : 'spots'} left`;
};

// The preview: name, spots left, what they're looking for. Everything else is in the details.
function TeamCard({ card, closest }) {
  const { team } = card;
  const [open, setOpen] = useState(false);
  if (!team?.owner?.handle) return null;
  return (
    <article className="hc-card hc-team">
      <span className="hc-title">
        <span className="name">{team.name}</span>
        {closest && <span className="hc-closest">Closest fit</span>}
      </span>
      <p className="hc-team-spots">{spotsLeft(team)}</p>
      {list(team.wantedSkills).length ? (
        <div className="hc-team-wants">
          <span className="hc-team-label">Looking for</span>
          <SkillTags skills={team.wantedSkills} matched={card.evidence?.matchedSkills} label={`Skills ${team.name} is looking for`} />
        </div>
      ) : <p className="hc-team-label">Looking for any skills</p>}
      <div className="hc-actions">
        <button
          type="button"
          className="hk-button"
          aria-haspopup="dialog"
          aria-label={`View details, ${team.name}`}
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true }); // the dialog returns focus here
            setOpen(true);
          }}
        >
          View details
        </button>
      </div>
      <TeamDialog team={team} open={open} onClose={() => setOpen(false)} />
    </article>
  );
}

// The team's details: what they're building, what they need, and who's on it.
function TeamDialog({ team, open, onClose }) {
  const { slug, busy, contactTeam, viewProfile } = useContext(CardActions);
  const [detail, setDetail] = useState({ team: null, error: '' });
  useEffect(() => {
    if (!open || !slug) return undefined;
    let live = true;
    api(`/api/events/${slug}/teams/${team.id}`)
      .then((loaded) => live && setDetail({ team: loaded, error: '' }))
      .catch((error) => live && setDetail({ team: null, error: failure(error, 'Couldn’t load this team. Try again.') }));
    return () => { live = false; };
  }, [open, slug, team.id]);
  const t = detail.team || team; // the card's summary shows at once; members arrive with the details
  const full = t.maxSize - t.size <= 0;
  const titleId = `team-title-${team.id}`;
  return (
    <Modal open={open} onClose={onClose} className="person-dialog team-dialog" labelledBy={titleId} initialFocus=".team-close">
      {open && (
        <div className="person-sheet">
          <header className="person-toolbar">
            <button type="button" className="toggle team-close" onClick={onClose}>
              <Icon name="back" />
              Back
            </button>
          </header>
          <div className="person-content">
            <div className="profile-identity team-identity">
              <h2 id={titleId}>{t.name}</h2>
              <p className="team-facts">{[t.track, `${t.size} of ${t.maxSize} members`, spotsLeft(t)].filter(Boolean).join(' · ')}</p>
            </div>
            {t.idea && (
              <section className="profile-section">
                <h3>What they’re building</h3>
                <p>{t.idea}</p>
              </section>
            )}
            {list(t.wantedSkills).length > 0 && (
              <section className="profile-section">
                <h3>Looking for</h3>
                <div className="social-chips">{list(t.wantedSkills).map((skill) => <span key={skill} className="social-tag">{skill}</span>)}</div>
              </section>
            )}
            <section className="profile-section">
              <h3>Team</h3>
              {detail.team ? (
                <ul className="team-members">
                  {detail.team.members.map((member) => (
                    <li key={member.userId}>
                      <button
                        type="button"
                        className="team-member"
                        aria-haspopup="dialog"
                        onClick={() => { onClose(); viewProfile({ handle: member.handle }); }}
                      >
                        <PersonAvatar person={member} />
                        <span className="name">{member.name}</span>
                        {member.userId === t.owner.userId && <span className="social-tag">Lead</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hk-empty" role={detail.error ? 'alert' : 'status'}>{detail.error || 'Loading the team…'}</p>
              )}
            </section>
            <div className="team-cta">
              {full ? <p className="hc-team-label">This team is full.</p> : (
                <button type="button" className="hk-button" disabled={busy} onClick={() => { onClose(); contactTeam(t); }}>
                  Contact team
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

const NOUNS = { hacker: ['person', 'people'], team: ['team', 'teams'], mentor: ['mentor', 'mentors'] };

// status: matches (strong fits), closest (no strong fit: a note on what's
// missing, then the nearest few, each tagged), or noMatch (one line).
function SearchCards({ data }) {
  if (data?.status === 'noMatch') return <p className="hc-line">{data.reason || 'No one fits that search yet.'}</p>;
  const cards = list(data?.cards);
  if (!cards.length) return null;
  const closest = data.status === 'closest';
  const [one, many] = NOUNS[data.kind] || NOUNS.hacker;
  const count = `${cards.length}${closest ? ' closest' : ''} ${cards.length === 1 ? one : many}`;
  return (
    <>
      {closest && data.note && <p className="hc-line">{data.note}</p>}
      <Group label={count} className="">
        <div className="matches">
          {cards.map((card, i) => card.card === 'team'
            ? <TeamCard key={card.team?.id || i} card={card} closest={closest} />
            : <MatchCard key={card.person?.userId || i} card={card} closest={closest} />)}
        </div>
      </Group>
    </>
  );
}

const RELATION = { outgoing: 'You sent a request', incoming: 'Wants to connect with you', accepted: 'You’re connected' };

function ProfileCard({ data }) {
  if (!data?.handle) return null;
  const relation = RELATION[data.relation?.state];
  return (
    <article className="hc-card">
      <CardHead person={data} title={data.name} meta={data.role === 'mentor' ? mentorMeta(data.verified) : personMeta(data.role, data.experience, data.track)} />
      {relation ? <p className="hc-why">{relation}</p> : data.bio && <p className="hc-bio">{data.bio}</p>}
      <SkillTags skills={data.skills} label={`${data.name}'s skills`} />
      <div className="hc-actions"><ViewProfile person={data} /></div>
    </article>
  );
}

function DraftCard({ data }) {
  const { slug, openConversation } = useContext(CardActions);
  const [intro, setIntro] = useState(data?.intro || '');
  const [state, setState] = useState({ phase: 'draft' });
  const sending = useRef(false);
  const handle = data?.to?.handle;
  // The sent state isn't saved with the chat, so after a reload ask where things stand
  // and show it already collapsed.
  useEffect(() => {
    if (!slug || !handle) return undefined;
    let live = true;
    api(`/api/events/${slug}/people/${handle}`).then((person) => {
      const relation = person?.relation;
      if (!live || sending.current || !relation) return;
      if (relation.state === 'outgoing') setState({ phase: 'sent', instant: true });
      else if (relation.state === 'accepted') setState({ phase: 'connected', conversationId: relation.conversationId, instant: true });
    }).catch(() => {});
    return () => { live = false; };
  }, [slug, handle]);
  if (!data?.to?.userId) return null;
  const text = intro.trim();
  const problem = !text ? 'Write a short intro first.'
    : text.length > 500 ? 'Keep it under 500 characters.'
    : LINK.test(text) ? 'Intros can’t contain links.' : '';
  const done = state.phase === 'sent' || state.phase === 'connected';
  const send = async () => {
    if (problem || done || sending.current) return;
    sending.current = true;
    setState({ phase: 'sending' });
    try {
      const { request } = await api(`/api/events/${slug}/requests`, {
        method: 'POST',
        body: { toUserId: data.to.userId, intro: text, source: data.source || 'agent', teamId: data.team?.id },
      });
      const mutual = request?.status === 'accepted' && request.conversationId;
      setState({ phase: mutual ? 'connected' : 'sent', conversationId: request?.conversationId });
      if (mutual) openConversation(request.conversationId);
      notifyChanged('requests');
      notifyChanged('conversations');
    } catch (error) {
      sending.current = false;
      setState({ phase: error?.status === 409 ? 'conflict' : 'draft', error: failure(error, 'Couldn’t send that. Try again.') });
    }
  };
  const to = data.to;
  return (
    <article className="hc-card hc-form">
      <CardHead
        person={to}
        title={`Intro to ${data.team ? data.team.name : to.name}`}
        meta={[data.team ? `Goes to ${firstName(to)}, the team lead` : ROLE[to.role] || 'Member']}
      />
      {/* Folds away once sent; "instant" skips the animation when it loads already sent. */}
      <div className={`hc-collapse${done ? ' closed' : ''}${state.instant ? ' instant' : ''}`} inert={done || undefined}>
        <div className="hc-collapse-inner">
          <label className="hk-field">
            <span className="sr-only">Your intro</span>
            <textarea value={intro} onChange={(e) => setIntro(e.target.value)} disabled={done || state.phase === 'sending'} rows={4} maxLength={600} />
          </label>
          {state.error && <p className="hc-alert" role="alert">{state.error}</p>}
          <div className="hc-actions">
            <button type="button" className="hk-button" disabled={Boolean(problem) || state.phase !== 'draft'} onClick={send}>
              {state.phase === 'sending' ? 'Sending…' : 'Send request'}
            </button>
            {/* What's blocking Send, or the count once it's near the limit. */}
            <span className="hc-hint" aria-live="polite">{problem || (text.length > 400 ? `${text.length}/500` : '')}</span>
          </div>
        </div>
      </div>
      {done && (
        <p className={`hc-sent${state.instant ? ' instant' : ''}`} role="status">
          <Icon name="check" />
          {state.phase === 'connected' ? `You’re connected with ${firstName(to)}` : 'Sent'}
          {state.phase === 'connected' && (
            <button type="button" className="toggle" onClick={() => openConversation(state.conversationId)}>Open chat</button>
          )}
        </p>
      )}
    </article>
  );
}

function parseSkills(text) {
  const seen = new Set();
  return text.split(',').map((s) => s.trim()).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}

function HelpRequestCard({ data }) {
  const { slug } = useContext(CardActions);
  const [title, setTitle] = useState(data?.title || '');
  const [details, setDetails] = useState(data?.details || '');
  const [skills, setSkills] = useState(list(data?.skillsNeeded).join(', '));
  const [state, setState] = useState({ phase: 'draft' });
  const sending = useRef(false);
  if (!data) return null;
  const tags = parseSkills(skills);
  const problem = title.trim().length < 3 ? 'Add a short title.'
    : title.trim().length > 120 ? 'Keep the title under 120 characters.'
    : details.trim().length > 2000 ? 'Keep the details under 2000 characters.'
    : tags.length > 10 ? 'List up to 10 skills.'
    : tags.some((t) => t.length > 40) ? 'Keep each skill under 40 characters.' : '';
  const done = state.phase === 'sent';
  const locked = done || state.phase === 'sending';
  const send = async () => {
    if (problem || done || sending.current) return;
    sending.current = true;
    setState({ phase: 'sending' });
    try {
      await api(`/api/events/${slug}/help-requests`, {
        method: 'POST',
        body: { title: title.trim(), details: details.trim() || null, skillsNeeded: tags },
      });
      setState({ phase: 'sent' });
      notifyChanged('help');
    } catch (error) {
      sending.current = false;
      setState({ phase: 'draft', error: failure(error, 'Couldn’t send that. Try again.') });
    }
  };
  return (
    <article className="hc-card hc-form">
      <span className="name">Help request</span>
      <label className="hk-field"><span>What you need</span><input value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} maxLength={140} /></label>
      <label className="hk-field"><span>Details</span><textarea value={details} onChange={(e) => setDetails(e.target.value)} disabled={locked} rows={3} /></label>
      <label className="hk-field"><span>Skills needed</span><input value={skills} onChange={(e) => setSkills(e.target.value)} disabled={locked} placeholder="React, Auth" /></label>
      {state.error && <p className="hc-alert" role="alert">{state.error}</p>}
      {done
        ? <p className="hc-done" role="status">Sent to mentors. Their chat opens in Chats when one picks it up.</p>
        : (
          <div className="hc-actions">
            <button type="button" className="hk-button" disabled={Boolean(problem) || locked} onClick={send}>
              {state.phase === 'sending' ? 'Sending…' : 'Request help'}
            </button>
            <span className="hc-hint" aria-live="polite">{problem}</span>
          </div>
        )}
    </article>
  );
}

const HELP_STATUS = { open: 'Waiting for a mentor', claimed: 'With a mentor', resolved: 'Resolved' };
const names = (requests) => requests.map((r) => r.team ? `${r.person?.name} (${r.team.name})` : r.person?.name).filter(Boolean).join(', ');

function StatusCard({ data }) {
  if (!data) return null;
  const incoming = list(data.incoming), outgoing = list(data.outgoing), help = list(data.helpRequests), team = data.team;
  return (
    <article className="hc-card hc-form">
      <span className="name">Your status</span>
      <dl className="hc-stats">
        <div><dt>Requests for you</dt><dd>{incoming.length}</dd></div>
        <div><dt>Sent</dt><dd>{outgoing.length}</dd></div>
        <div><dt>Connections</dt><dd>{data.connectedCount ?? 0}</dd></div>
        <div><dt>Help requests</dt><dd>{help.length}</dd></div>
      </dl>
      <ul className="hc-status">
        {incoming.length > 0 && <li><strong>Wants to connect:</strong> {names(incoming)}</li>}
        {outgoing.length > 0 && <li><strong>Waiting to hear from:</strong> {names(outgoing)}</li>}
        <li><strong>Team:</strong> {team ? `${team.name} · ${team.size} of ${team.maxSize}${team.isOwner ? ' · you lead it' : ''}` : 'Not on a team yet'}</li>
        {help.map((h) => (
          <li key={h.id}>
            <strong>{h.title}:</strong> {h.status === 'claimed' && h.mentor ? `With ${h.mentor.name}` : HELP_STATUS[h.status] || h.status}
          </li>
        ))}
      </ul>
    </article>
  );
}

const CARDS = {
  search_people: SearchCards,
  get_profile: ProfileCard,
  draft_intro: DraftCard,
  draft_help_request: HelpRequestCard,
  my_status: StatusCard,
};

// One bad stored result shouldn't take the whole chat down.
class CardBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="hc-line">Couldn’t show this card.</p> : this.props.children; }
}

function CardSkeleton() {
  return (
    <div className="hc-card hc-skeleton" aria-hidden="true">
      <span className="hc-skeleton-avatar" />
      <span className="hc-skeleton-lines"><i /><i /></span>
    </div>
  );
}

function Chips({ part, onAnswer }) {
  if (part.state === 'input-streaming' || !part.input) return null; // input is still partial
  const { say, question, options } = part.input;
  // A skipped question (they sent a new message instead) shows no answer bubble.
  const answer = part.state === 'output-available' && !part.output?.skipped
    ? (typeof part.output === 'string' ? part.output : part.output?.answer)
    : null;
  return (
    <>
      {question && <div className="msg assistant">{say && <p className="hc-text">{say}</p>}<p className="hc-text">{question}</p></div>}
      {answer
        ? <div className="msg user" data-anchor=""><p className="hc-text">{answer}</p></div>
        : part.state === 'input-available' && (
          <div className="hc-chips" role="group" aria-label={question || 'Answers'}>
            {list(options).map((option) => (
              <button key={option} type="button" className="hc-chip" disabled={!onAnswer} onClick={() => onAnswer(option)}>{option}</button>
            ))}
          </div>
        )}
    </>
  );
}

// **bold** is the only markup kept; everything else shows as typed.
function Rich({ text }) {
  return text.split(/(\*\*[^*\n]+\*\*)/).map((piece, i) => (
    /^\*\*[^*\n]+\*\*$/.test(piece) ? <strong key={i}>{piece.slice(2, -2)}</strong> : <Fragment key={i}>{piece}</Fragment>
  ));
}

const toolName = (part) => (part.type?.startsWith('tool-') ? part.type.slice(5) : null);

// Whether a part shows anything. Unknown tools (update_profile, ...) never do.
export function isVisiblePart(part) {
  if (part.type === 'text') return Boolean(part.text?.trim());
  const name = toolName(part);
  if (name === 'ask_with_options') return part.state !== 'input-streaming' && Boolean(part.input);
  return Boolean(CARDS[name]);
}

export function MessagePart({ part, onAnswer }) {
  if (part.type === 'text') {
    return part.text?.trim() ? <div className="msg assistant"><p className="hc-text"><Rich text={part.text} /></p></div> : null;
  }
  const name = toolName(part);
  if (name === 'ask_with_options') return <Chips part={part} onAnswer={onAnswer} />;
  const Card = CARDS[name];
  if (!Card) return null; // step-start, reasoning, unknown tools
  if (part.state === 'output-error') return <p className="hc-line">Couldn’t load that. Try again.</p>;
  if (part.state === 'input-streaming' || part.state === 'input-available') return <CardSkeleton />;
  if (part.state !== 'output-available') return null;
  return <CardBoundary><Card data={part.output} /></CardBoundary>;
}
