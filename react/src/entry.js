// Links into Hacky from the event dashboard. Hacky reads each param once and removes it from the
// address, so a refresh or Back never repeats it.
//
//   hackyUrl({ onboarding: true })  // '/index.html?onboarding=1': the explicit entry (welcome screen)
//   hackyUrl({ start: 'team' })     // '/index.html?start=team': Hacky starts an open-team search (HackyPane)
//
// event: only when the dashboard itself was opened for a specific event (?event=), so both pages
// show the same event. Without it, both pick the same default (session.jsx pickEvent).

export function hackyUrl({ onboarding = false, start, event = null } = {}) {
  const params = new URLSearchParams();
  if (event) params.set('event', event);
  if (onboarding) params.set('onboarding', '1');
  if (start) params.set('start', start);
  const query = params.toString();
  return `/index.html${query ? `?${query}` : ''}`;
}
