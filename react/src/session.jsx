// Who is signed in and which event they're in. Loaded once from /api.
//
//   const { status, me, slug, event, eventMe } = useSession();
//
// status: 'loading' | 'signed-out' | 'no-event' | 'error' | 'ready'.
// When ready: me = { profile, events }, slug = the event slug, event = EventInfo,
// eventMe = membership + intake (role, verified, availability, intake.complete, ...).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from './api';

const SessionContext = createContext(null);
const PREFERRED_EVENT = 'knighthacks-ix';

export function SessionProvider({ children }) {
  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const me = await api('/api/me');
      const asked = new URLSearchParams(location.search).get('event');
      const slug = [asked, PREFERRED_EVENT].map((s) => me.events.find((e) => e.slug === s)?.slug).find(Boolean)
        || me.events[0]?.slug;
      if (!slug) return setState({ status: 'no-event', me });
      const [event, eventMe] = await Promise.all([
        api(`/api/events/${slug}`),
        api(`/api/events/${slug}/me`),
      ]);
      setState({ status: 'ready', me, slug, event, eventMe });
    } catch (error) {
      setState(error instanceof ApiError && error.status === 401
        ? { status: 'signed-out' }
        : { status: 'error', error });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const value = useMemo(() => ({
    ...state,
    reload: load,
    // Call these with the API's response after a successful PATCH.
    setProfile: (profile) => setState((s) => ({ ...s, me: { ...s.me, profile } })),
    setEventMe: (eventMe) => setState((s) => ({ ...s, eventMe })),
  }), [state, load]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
