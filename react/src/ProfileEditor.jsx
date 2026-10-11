import { useRef, useState } from 'react';
import { api, notifyChanged } from './api.js';
import { useSession } from './session.jsx';
import { goals } from './Onboarding.jsx';
import { Icon } from './ui.jsx';
import './ProfileEditor.css';

// About belongs to the public profile; skills and preferences belong to this event's intake.
export default function ProfileEditor({ person, onUpdate, onDone, busy, onBusy }) {
  const session = useSession();
  const savedMotivations = person.motivations ?? session.eventMe.intake.motivations ?? [];
  const savedIdea = (person.idea === undefined ? session.eventMe.intake.idea : person.idea) || '';
  const [about, setAbout] = useState(person.bio || '');
  const [skills, setSkills] = useState(person.skills.join(', '));
  const [motivations, setMotivations] = useState(savedMotivations);
  const [idea, setIdea] = useState(savedIdea);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const tags = [...new Map(skills.split(',').map(s => s.trim()).filter(Boolean).map(s => [s.toLowerCase(), s])).values()];
  const problem = about.trim().length > 500 ? 'Keep About to 500 characters.'
    : idea.trim().length > 2000 ? 'Keep Interests & ideas to 2,000 characters.'
    : tags.length > 30 ? 'Add up to 30 skills.'
    : tags.some(s => s.length > 40) ? 'Keep each skill to 40 characters.' : '';

  const save = async event => {
    event.preventDefault();
    if (saving.current || problem) return;
    saving.current = true;
    onBusy(true);
    setError('');
    let savedAbout = false;
    const changes = {};
    if (JSON.stringify(tags) !== JSON.stringify(person.skills)) changes.skills = tags;
    const orderedMotivations = selected => goals.filter(([, , id]) => selected.includes(id)).map(([, , id]) => id);
    if (JSON.stringify(orderedMotivations(motivations)) !== JSON.stringify(orderedMotivations(savedMotivations))) changes.motivations = orderedMotivations(motivations);
    if (idea.trim() !== savedIdea.trim()) changes.idea = idea.trim() || null;
    const preferencesChanged = 'motivations' in changes || 'idea' in changes;
    try {
      const bio = about.trim() || null;
      if (bio !== person.bio) {
        const profile = await api('/api/me/profile', { method: 'PATCH', body: { bio } });
        session.setProfile(profile);
        onUpdate(profile);
        savedAbout = true;
        notifyChanged('profile');
      }
      if (Object.keys(changes).length) {
        const member = await api(`/api/events/${session.slug}/me`, { method: 'PATCH', body: changes });
        session.setEventMe(member);
        onUpdate({ skills: member.intake.skills, summary: member.intake.summary, motivations: member.intake.motivations, idea: member.intake.idea });
        notifyChanged('profile');
      }
      onDone();
    } catch (cause) {
      const unsaved = preferencesChanged ? ('skills' in changes ? 'Skills and preferences' : 'Preferences') : 'Skills';
      setError(`${savedAbout ? `About saved. ${unsaved} could not be saved. ` : ''}${cause.message || 'Couldn’t save your profile. Try again.'}`);
    } finally {
      saving.current = false;
      onBusy(false);
    }
  };

  return <form className="profile-editor" onSubmit={save} aria-label="Edit your profile" aria-busy={busy}>
    <h3>Edit your profile</h3>
    <label className="hk-field" htmlFor="profile-about">
      <span>About</span>
      <textarea id="profile-about" value={about} onChange={e => setAbout(e.target.value)} rows={4} maxLength={500} disabled={busy} aria-describedby="profile-about-help" />
    </label>
    <p className="profile-editor-hint" id="profile-about-help">A little about you and what you enjoy building. {about.length}/500</p>
    <label className="hk-field" htmlFor="profile-skills">
      <span>Skills</span>
      <input id="profile-skills" value={skills} onChange={e => setSkills(e.target.value)} disabled={busy} placeholder="React, TypeScript, UI design" aria-describedby="profile-skills-help" />
    </label>
    <p className="profile-editor-hint" id="profile-skills-help">Separate skills with commas. Up to 30 skills, 40 characters each.</p>
    <section className="profile-preferences" aria-labelledby="profile-preferences-title">
      <h3 id="profile-preferences-title">Preferences</h3>
      <p className="profile-preferences-hint">Help Hacky suggest people, sponsors, and events that fit what you’re here for.</p>
      <fieldset className="companion-options profile-goals" disabled={busy} aria-describedby="profile-goals-help">
        <legend>Hackathon goals</legend>
        {goals.map(([, label, id]) => <label className="companion-option" key={id}>
          <input type="checkbox" name="motivation" value={id} checked={motivations.includes(id)} onChange={e => setMotivations(previous => e.target.checked ? [...previous, id] : previous.filter(value => value !== id))} />
          <span>{label}</span><Icon name="check" />
        </label>)}
      </fieldset>
      <p className="profile-editor-hint" id="profile-goals-help">Pick as many as you like. You can change these anytime.</p>
      <label className="hk-field" htmlFor="profile-idea">
        <span>Interests &amp; ideas</span>
        <textarea id="profile-idea" value={idea} onChange={e => setIdea(e.target.value)} rows={4} maxLength={2000} disabled={busy} aria-describedby="profile-idea-help" placeholder="What are you building, learning, or hoping to find?" />
      </label>
      <p className="profile-editor-hint" id="profile-idea-help">Share your interests, project idea, and what you’re looking for. {idea.length}/2000</p>
    </section>
    {(error || problem) && <p className="social-error" role="alert">{problem || error}</p>}
    <div className="social-footer-actions">
      <button className="hk-button" type="submit" disabled={busy || Boolean(problem)}>{busy ? 'Saving…' : 'Save changes'}</button>
      <button className="hk-button secondary" type="button" disabled={busy} onClick={onDone}>Cancel</button>
    </div>
  </form>;
}
