import './social.css';

const ROLES = { hacker: 'Hacker', mentor: 'Mentor', sponsor: 'Sponsor', organizer: 'Organizer' };
export const roleLabel = (role) => ROLES[role] || '';

export function RoleChip({ role, verified = false }) {
  if (!ROLES[role]) return null;
  return (
    <span className="person-kind" data-kind={role === 'organizer' ? 'other' : role}>
      {ROLES[role]}
      {verified && role !== 'hacker' && <span className="social-verified"> · Verified</span>}
    </span>
  );
}

const HELP = { open: 'Waiting for a mentor', claimed: 'In progress', resolved: 'Resolved' };
export const helpLabel = (status) => HELP[status] || '';

export function HelpStatus({ status }) {
  return <span className="social-status" data-status={status}>{helpLabel(status)}</span>;
}

export const firstName = (name = '') => name.trim().split(/\s+/)[0] || name;
