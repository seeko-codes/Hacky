import { useRef, useState } from 'react';
import { api, notifyChanged } from './api.js';
import { useSession } from './session.jsx';
import './ProfileEditor.css';

// About belongs to the public profile; skills belong to this event's intake.
export default function ProfileEditor({ person, onUpdate, onDone, busy, onBusy }) {
  const session = useSession();
  const [about, setAbout] = useState(person.bio || person.summary || '');
  const [skills, setSkills] = useState(person.skills.join(', '));
  const [error, setError] = useState('');
  const saving = useRef(false);
  const tags = [...new Map(skills.split(',').map(s => s.trim()).filter(Boolean).map(s => [s.toLowerCase(), s])).values()];
  const problem = about.trim().length > 500 ? 'Keep About to 500 characters.'
    : tags.length > 30 ? 'Add up to 30 skills.'
    : tags.some(s => s.length > 40) ? 'Keep each skill to 40 characters.' : '';

  const save = async event => {
    event.preventDefault();
    if (saving.current || problem) return;
    saving.current = true;
    onBusy(true);
    setError('');
    let savedAbout = false;
    try {
      const bio = about.trim() || null;
      if (bio !== person.bio) {
        const profile = await api('/api/me/profile', { method: 'PATCH', body: { bio } });
        session.setProfile(profile);
        onUpdate(profile);
        savedAbout = true;
        notifyChanged('profile');
      }
      if (JSON.stringify(tags) !== JSON.stringify(person.skills)) {
        const member = await api(`/api/events/${session.slug}/me`, { method: 'PATCH', body: { skills: tags } });
        session.setEventMe(member);
        onUpdate({ skills: member.intake.skills, summary: member.intake.summary });
        notifyChanged('profile');
      }
      onDone();
    } catch (cause) {
      setError(`${savedAbout ? 'About saved. Skills could not be saved. ' : ''}${cause.message || 'Couldn’t save your profile. Try again.'}`);
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
    {(error || problem) && <p className="social-error" role="alert">{problem || error}</p>}
    <div className="social-footer-actions">
      <button className="hk-button" type="submit" disabled={busy || Boolean(problem)}>{busy ? 'Saving…' : 'Save changes'}</button>
      <button className="hk-button secondary" type="button" disabled={busy} onClick={onDone}>Cancel</button>
    </div>
  </form>;
}
