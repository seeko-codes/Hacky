// The one way the web app talks to the backend. Routes and shapes live in
// shared/contract.ts; docs/frontend.md says how to use them.
//
//   const { requests } = await api(`/api/events/${slug}/requests`);
//   await api(`/api/requests/${id}/accept`, { method: 'POST' });

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// The person this page loaded as (session.jsx sets it). Every request says so in X-Hacky-User,
// and the API refuses one whose cookie is now someone else's (another tab signed in as another
// person), so a stale tab never shows one person while acting as another. A refusal, or a 401
// for a page that had someone, fires 'hacky:user-changed' and the session checks who's signed in.
let pageUser = null;
export function setPageUser(userId) { pageUser = userId || null; }
export const USER_CHANGED = 'hacky:user-changed';

// fetch with that header and check. The chat transport uses it too. anyUser: leave the header
// off (the "who's signed in now?" check itself).
export async function apiFetch(input, init = {}, { anyUser = false } = {}) {
  const headers = new Headers(init.headers);
  const sentAs = anyUser ? null : pageUser;
  if (sentAs) headers.set('X-Hacky-User', sentAs);
  const response = await fetch(input, { ...init, headers });
  if (sentAs && (response.headers.get('X-Hacky-User-Changed') || response.status === 401)) {
    window.dispatchEvent(new CustomEvent(USER_CHANGED));
  }
  return response;
}

export async function api(path, { method = 'GET', body, signal, anyUser = false } = {}) {
  let response;
  try {
    response = await apiFetch(path, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, { anyUser });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'network', 'Can’t reach Hacky. Check your connection and try again.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code || 'internal',
      data?.error?.message || 'Something went wrong. Try again.',
    );
  }
  return data;
}

// A tiny signal between features, e.g. the chat sent a request, so the
// requests list refetches. kind: 'requests' | 'conversations' | 'help' | 'profile'.
export function notifyChanged(kind) {
  window.dispatchEvent(new CustomEvent('hacky:changed', { detail: kind }));
}

export function onChanged(kind, fn) {
  const listener = (event) => { if (event.detail === kind) fn(); };
  window.addEventListener('hacky:changed', listener);
  return () => window.removeEventListener('hacky:changed', listener);
}
