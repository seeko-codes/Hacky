// Who is signed in and which event they're in. Loaded once from /api.
//
//   const { status, me, slug, event, eventMe } = useSession();
//
// status: 'loading' | 'signed-out' | 'no-event' | 'error' | 'ready' | 'switched'.
// When ready: me = { profile, events }, slug = the event slug, event = EventInfo,
// eventMe = membership + intake (role, verified, availability, intake.complete, ...).
// switched: another tab signed in as someone else (now = their Me) or signed out (now = null).
// The page stops showing the old person; reloading it loads the new one.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, setPageUser, USER_CHANGED } from './api';

const SessionContext = createContext(null);
const PREFERRED_EVENT = 'knighthacks-ix';

// The event a page shows: ?event= when they're in it, else the preferred one, else their first.
export function pickEvent(events, asked = new URLSearchParams(location.search).get('event')) {
  return [asked, PREFERRED_EVENT].map((s) => events.find((e) => e.slug === s)?.slug).find(Boolean)
    || events[0]?.slug || null;
}

// What a switched page says (Hacky's and the dashboard's gates). now: who's signed in now, or null.
export function switchedCopy(now) {
  const name = now?.profile?.name;
  return name
    ? { title: `You’re signed in as ${name} now`, line: 'Another tab switched people, so this page stopped. Reload to continue as them.', action: `Continue as ${name.split(/\s+/)[0]}` }
    : { title: 'You’re signed out', line: 'This browser signed out in another tab, so this page stopped.', action: 'Reload' };
}

export function SessionProvider({ children }) {
  const [state, setState] = useState({ status: 'loading' });
  const user = useRef(null); // who this page shows; set once, so a later change is a switch

  const load = useCallback(async () => {
    try {
      const me = await api('/api/me', { anyUser: !user.current });
      user.current ??= me.profile.userId;
      setPageUser(user.current);
      const slug = pickEvent(me.events);
      if (!slug) return setState({ status: 'no-event', me });
      const [event, eventMe] = await Promise.all([
        api(`/api/events/${slug}`),
        api(`/api/events/${slug}/me`),
      ]);
      setState({ status: 'ready', me, slug, event, eventMe });
    } catch (error) {
      // Someone else, or nobody, is signed in now: api.js fired USER_CHANGED and check() switches.
      if (error instanceof ApiError && user.current && (error.status === 409 || error.status === 401)) return;
      setState(error instanceof ApiError && error.status === 401 && !user.current
        ? { status: 'signed-out' }
        : { status: 'error', error });
    }
  }, []);

  // Who's signed in now? Run when the tab comes back (focus, visible again, restored by Back)
  // and when the API refuses a request as someone else (api.js). A different person, or nobody,
  // switches the page. Network trouble changes nothing.
  const checking = useRef(false);
  const check = useCallback(async () => {
    if (!user.current || checking.current) return;
    checking.current = true;
    try {
      const now = await api('/api/me', { anyUser: true });
      if (now.profile.userId !== user.current) setState({ status: 'switched', now });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setState({ status: 'switched', now: null });
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    const shown = (event) => { if (event.persisted) check(); };
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', shown);
    window.addEventListener(USER_CHANGED, check);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', shown);
      window.removeEventListener(USER_CHANGED, check);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [check]);

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
