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

export async function api(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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
