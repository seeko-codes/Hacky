// The live-updates socket from docs/frontend.md section 7, without React so
// node can test it. The app makes exactly one (useLive).
//
//   const live = createLive({ getToken, openSocket, onEvent, onOpen, onPoll });
//   live.start(); ... live.stop();
//
// getToken() resolves to { token, url, expiresAt } or throws { status }.
// onOpen runs on every open, onPoll every ~10 s while live updates are down.

export const SILENCE_MS = 40_000;
export const REFRESH_BEFORE_MS = 60_000;
export const POLL_MS = 10_000;
export const MAX_BACKOFF_MS = 30_000;
export const POLL_AFTER_FAILURES = 3;
const MIN_REFRESH_MS = 5_000;
const EXPIRED_LOOP_MS = 10_000;

// 2 s, 4 s, 8 s, ... up to 30 s.
export const backoff = (failures) => Math.min(MAX_BACKOFF_MS, 2000 * 2 ** Math.max(0, failures - 1));

export function socketUrl(url, token) {
  const u = new URL(url);
  u.searchParams.set('token', token);
  return u.toString();
}

const browserClock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  now: () => Date.now(),
};

export function createLive({ getToken, openSocket, onEvent, onOpen, onPoll, clock = browserClock }) {
  let stopped = true, socket = null, failures = 0, generation = 0, expiredAt = -Infinity;
  let retryTimer = null, refreshTimer = null, silenceTimer = null, pollTimer = null;

  const polling = (on) => {
    if (on && !pollTimer && !stopped) pollTimer = clock.setInterval(() => onPoll(), POLL_MS);
    if (!on && pollTimer) {
      clock.clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  // Forget the current socket, then close it, so its close event is ignored.
  const drop = () => {
    clock.clearTimeout(refreshTimer);
    clock.clearTimeout(silenceTimer);
    refreshTimer = silenceTimer = null;
    const old = socket;
    socket = null;
    if (!old) return;
    old.onopen = old.onmessage = old.onclose = old.onerror = null;
    try { old.close(1000); } catch { /* already closed */ }
  };

  const retryIn = (ms) => {
    clock.clearTimeout(retryTimer);
    retryTimer = clock.setTimeout(() => {
      retryTimer = null;
      connect();
    }, ms);
  };

  const fail = (pollNow = false) => {
    drop();
    if (stopped) return;
    failures += 1;
    if (pollNow || failures >= POLL_AFTER_FAILURES) polling(true);
    retryIn(backoff(failures));
  };

  const listen = () => {
    clock.clearTimeout(silenceTimer);
    silenceTimer = clock.setTimeout(() => fail(), SILENCE_MS);
  };

  async function connect() {
    if (stopped) return;
    const attempt = ++generation;
    drop();
    clock.clearTimeout(retryTimer);
    retryTimer = null;
    let grant;
    try {
      grant = await getToken();
    } catch (error) {
      if (stopped || attempt !== generation) return;
      return fail(error?.status === 503);
    }
    if (stopped || attempt !== generation) return;
    let ws;
    try {
      ws = openSocket(socketUrl(grant.url, grant.token));
    } catch {
      return fail();
    }
    socket = ws;
    listen();
    ws.onopen = () => {
      failures = 0;
      polling(false);
      listen();
      const wait = Date.parse(grant.expiresAt) - REFRESH_BEFORE_MS - clock.now();
      refreshTimer = clock.setTimeout(connect, Math.max(MIN_REFRESH_MS, wait || 0));
      onOpen();
    };
    ws.onmessage = (event) => {
      listen();
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data && typeof data.type === 'string' && data.type !== 'ping') onEvent(data);
    };
    ws.onclose = (event) => {
      if (socket !== ws) return;
      // 4001: the token expired, so mint a new one now (unless that keeps happening).
      if (event.code === 4001 && clock.now() - expiredAt > EXPIRED_LOOP_MS) {
        expiredAt = clock.now();
        drop();
        return connect();
      }
      fail(event.code === 4011);
    };
    ws.onerror = () => {
      if (socket === ws) fail();
    };
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      generation += 1;
      drop();
      clock.clearTimeout(retryTimer);
      retryTimer = null;
      polling(false);
    },
    get polling() {
      return Boolean(pollTimer);
    },
  };
}
