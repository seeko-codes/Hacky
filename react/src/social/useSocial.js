// The Chats sidebar's data: requests, conversations, the help queue, DM
// threads and the one live-updates socket. The API is the truth; live events
// and local patches only make it feel instant.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api, onChanged } from '../api.js';
import { useSession } from '../session.jsx';
import { useHiddenChats } from './useHiddenChats.js';
import { createLive } from './live.js';
import {
  bumpConversation,
  localMessage,
  mergeMessages,
  newClientId,
  newestId,
  oldestId,
  pageConnects,
  reconcileMessages,
  removeMessage,
  savedIds,
  splitRequests,
  updateLocal,
} from './messages.js';

const SOMETHING_WRONG = 'Something went wrong. Try again.';
export const friendly = (error, fallback = SOMETHING_WRONG) =>
  error?.status >= 500 || !error?.message ? fallback : error.message;

// One list from the API, refetched on demand and on notifyChanged(kind).
// A refetch asked for mid-flight runs once more afterwards, so it never misses a write.
function useResource(kind, load) {
  const [state, setState] = useState({ data: null, error: '', loaded: false, refreshing: false });
  const loadRef = useRef(load);
  loadRef.current = load;
  const run = useRef({ promise: null, again: false });

  const refetch = useCallback(() => {
    const r = run.current;
    if (r.promise) {
      r.again = true;
      return r.promise;
    }
    setState((s) => (s.refreshing ? s : { ...s, refreshing: true }));
    r.promise = (async () => {
      do {
        r.again = false;
        try {
          const data = await loadRef.current();
          setState((s) => ({ ...s, data, error: '', loaded: true }));
        } catch (error) {
          setState((s) => ({ ...s, error: friendly(error, 'Couldn’t refresh right now.'), loaded: true }));
        }
      } while (r.again);
      r.promise = null;
      setState((s) => ({ ...s, refreshing: false }));
    })();
    return r.promise;
  }, []);

  const patch = useCallback((fn) => setState((s) => (s.data ? { ...s, data: fn(s.data) } : s)), []);

  useEffect(() => {
    refetch();
    return onChanged(kind, refetch);
  }, [kind, refetch]);

  return { ...state, refetch, patch };
}

function useVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

const EMPTY_THREAD = { messages: [], hasMore: false, loaded: false, loading: false, older: false, error: '' };

// Threads live in a ref so async loaders read the latest copy; a counter re-renders.
function useThreads(selfId) {
  const store = useRef({});
  const busy = useRef(new Set());
  const [, render] = useReducer((n) => n + 1, 0);
  const get = (id) => store.current[id] || EMPTY_THREAD;
  const update = useCallback((id, fn) => {
    store.current = { ...store.current, [id]: fn(store.current[id] || EMPTY_THREAD) };
    render();
  }, []);
  const merge = (id, messages) => update(id, (t) => ({ ...t, messages: mergeMessages(t.messages, messages) }));

  // The newest page brings what's new and drops what its sender deleted (there's
  // no live event for deletes). When more arrived than one page holds, page
  // forward from the newest message on screen first. A cursor the server
  // rejects (400) was deleted: drop it and go on from the one before.
  const catchUp = useCallback(async (id) => {
    const t = store.current[id];
    if (!t?.loaded || busy.current.has(id)) return;
    busy.current.add(id);
    try {
      const asked = savedIds(get(id).messages);
      const newest = await api(`/api/conversations/${id}/messages?limit=30`);
      if (!pageConnects(get(id).messages, newest)) {
        let after = newestId(get(id).messages);
        for (let page = 0; page < 10 && after; page++) {
          try {
            const next = await api(`/api/conversations/${id}/messages?after=${after}&limit=100`);
            merge(id, next.messages);
            if (!next.hasMore) break;
            after = next.messages.at(-1)?.id;
          } catch (error) {
            if (error?.status !== 400) throw error;
            update(id, (t) => ({ ...t, messages: removeMessage(t.messages, after) }));
            after = newestId(get(id).messages);
          }
        }
      }
      update(id, (t) => ({
        ...t,
        messages: reconcileMessages(t.messages, newest, asked),
        hasMore: oldestId(t.messages) ? t.hasMore : newest.hasMore,
      }));
    } catch {
      // The next open, focus or poll catches up again.
    } finally {
      busy.current.delete(id);
    }
  }, []);

  const load = useCallback(async (id, again = false) => {
    const t = get(id);
    if (t.loading || busy.current.has(id)) return;
    if (t.loaded && !again) return catchUp(id);
    update(id, (t) => ({ ...t, loading: true, error: '' }));
    try {
      const page = await api(`/api/conversations/${id}/messages?limit=30`);
      update(id, (t) => ({
        ...t,
        messages: mergeMessages(t.messages, page.messages),
        hasMore: oldestId(t.messages) ? t.hasMore : page.hasMore,
        loaded: true,
        loading: false,
      }));
    } catch (error) {
      update(id, (t) => ({ ...t, loading: false, error: friendly(error, 'Couldn’t load this chat.') }));
    }
  }, []);

  const loadOlder = useCallback(async (id) => {
    const t = get(id);
    const before = oldestId(t.messages);
    if (!t.loaded || !t.hasMore || t.older || !before) return;
    update(id, (t) => ({ ...t, older: true }));
    try {
      const page = await api(`/api/conversations/${id}/messages?before=${before}&limit=30`);
      update(id, (t) => ({ ...t, messages: mergeMessages(t.messages, page.messages), hasMore: page.hasMore, older: false }));
    } catch (error) {
      // 400: the oldest message on screen was deleted, so it can't be a cursor.
      const gone = error?.status === 400;
      update(id, (t) => ({ ...t, messages: gone ? removeMessage(t.messages, before) : t.messages, older: false }));
    }
  }, []);

  // Unsend for everyone. 404 means it's already gone (or the chat is), so it
  // leaves the screen either way; other errors are for the caller to show.
  const remove = useCallback(async (id, messageId) => {
    try {
      await api(`/api/conversations/${id}/messages/${messageId}`, { method: 'DELETE' });
    } catch (error) {
      if (error?.status !== 404) throw error;
    }
    update(id, (t) => ({ ...t, messages: removeMessage(t.messages, messageId) }));
  }, []);

  // Live message-new: only threads we've opened keep messages in memory.
  const receive = useCallback((message) => {
    if (store.current[message.conversationId]) merge(message.conversationId, [message]);
  }, []);

  const post = useCallback(async (id, clientId, body, onSent) => {
    try {
      const { message } = await api(`/api/conversations/${id}/messages`, { method: 'POST', body: { clientId, body } });
      merge(id, [message]);
      onSent?.(message);
    } catch (error) {
      const text = error?.status === 403 ? error.message : friendly(error, 'Not sent.');
      update(id, (t) => ({ ...t, messages: updateLocal(t.messages, clientId, { status: 'failed', error: text }) }));
    }
  }, []);

  const send = useCallback((id, body, onSent) => {
    const clientId = newClientId();
    update(id, (t) => ({
      ...t,
      messages: [...t.messages, localMessage({ conversationId: id, senderId: selfId, clientId, body })],
    }));
    post(id, clientId, body, onSent);
  }, [selfId]);

  // Same clientId, so a retry never duplicates.
  const retry = useCallback((id, clientId, onSent) => {
    const m = get(id).messages.find((x) => x.local && x.clientId === clientId);
    if (!m || m.status === 'sending') return;
    update(id, (t) => ({ ...t, messages: updateLocal(t.messages, clientId, { status: 'sending', error: '' }) }));
    post(id, clientId, m.body, onSent);
  }, []);

  return { threads: store.current, load, loadOlder, catchUp, receive, send, retry, remove };
}

// Exactly one socket for the app (useSocial is mounted once, in Conversation).
function useLive(slug, handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!slug) return;
    const live = createLive({
      getToken: () => api('/api/realtime/token', { method: 'POST', body: { eventSlug: slug } }),
      openSocket: (url) => new WebSocket(url),
      onEvent: (event) => ref.current.onEvent(event),
      onOpen: () => ref.current.onSync(),
      onPoll: () => ref.current.onSync(),
    });
    live.start();
    let last = 0;
    const resume = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 2000) return;
      last = Date.now();
      ref.current.onSync();
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      live.stop();
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [slug]);
}

// activeId: the conversation on screen (sidebar open), or null.
export function useSocial({ activeId }) {
  const { slug, event, eventMe, me } = useSession();
  const selfId = me?.profile?.userId;
  const hidden = useHiddenChats(selfId, slug);
  const role = eventMe?.role;
  const helpOn = role === 'hacker' || role === 'mentor';

  const requests = useResource('requests', () =>
    api(`/api/events/${slug}/requests`).then((r) => r.requests));
  const conversations = useResource('conversations', () =>
    api(`/api/events/${slug}/conversations`).then((r) => r.conversations));
  const [teamSetup, setTeamSetup] = useState({ busy: false, error: '' });
  const setupTeam = async () => {
    if (!me?.demoMode || role !== 'hacker') return;
    setTeamSetup({ busy: true, error: '' });
    try {
      await api(`/api/events/${slug}/demo/team-chat`, { method: 'POST' });
      await conversations.refetch();
      setTeamSetup({ busy: false, error: '' });
    } catch (error) { setTeamSetup({ busy: false, error: friendly(error) }); }
  };
  useEffect(() => { setupTeam(); }, [slug, selfId, me?.demoMode, role]);
  const teamChat = conversations.data?.find(c => c.kind === 'team');
  const addToTeam = async (userId) => {
    if (!teamChat) throw new Error('Your team chat is not ready yet.');
    const { conversationId } = await api(`/api/conversations/${teamChat.id}/team-members`, { method: 'POST', body: { userId } });
    await conversations.refetch();
    threads.load(conversationId);
    return conversationId;
  };
  const help = useResource('help', () =>
    helpOn ? api(`/api/events/${slug}/help-queue`) : Promise.resolve({ open: [], mine: [] }));
  const threads = useThreads(selfId);
  const visible = useVisible();

  const latest = useRef({});
  latest.current = { activeId, visible, conversations: conversations.data };

  const sent = useCallback((message) => {
    conversations.patch((list) => bumpConversation(list, message, { selfId, seen: true }) || list);
  }, [selfId]);
  const retry = useCallback((id, clientId) => threads.retry(id, clientId, sent), [sent]);

  const sync = () => {
    requests.refetch();
    conversations.refetch();
    help.refetch();
    if (latest.current.activeId) threads.load(latest.current.activeId);
  };

  const onEvent = (e) => {
    if (e.type === 'message-new' && e.message) {
      const m = e.message;
      threads.receive(m);
      const { activeId: open, visible: shown, conversations: list } = latest.current;
      if (m.kind === 'system' && list?.some(c => c.id === m.conversationId && c.kind === 'team')) conversations.refetch();
      if (!list?.some((c) => c.id === m.conversationId)) conversations.refetch();
      else {
        const seen = m.conversationId === open && shown;
        conversations.patch((l) => bumpConversation(l, m, { selfId, seen }) || l);
      }
    } else if (e.type === 'request-new' || e.type === 'request-updated') {
      requests.refetch();
      if (e.request?.status === 'accepted') conversations.refetch();
    } else if (e.type === 'help-new') {
      help.refetch();
    } else if (e.type === 'help-claimed') {
      help.refetch();
      conversations.refetch();
    }
  };

  useLive(slug, { onEvent, onSync: sync });

  // Coming back to a thread (sidebar reopened) catches up on what it missed.
  useEffect(() => {
    if (activeId) threads.load(activeId);
  }, [activeId]);

  // Mark read while the thread is open, the tab is visible, and something new arrived.
  const thread = activeId ? threads.threads[activeId] : null;
  const active = conversations.data?.find((c) => c.id === activeId);
  const newest = thread?.loaded
    ? thread.messages.findLast((m) => !m.local && m.senderId !== selfId)?.id ?? null
    : undefined;
  const unreadHere = active?.unreadCount || 0;
  const marked = useRef({});
  useEffect(() => {
    if (!activeId || !visible) return;
    const before = marked.current[activeId];
    if (newest !== undefined) marked.current[activeId] = newest;
    const arrived = before !== undefined && newest !== undefined && newest !== before;
    if (!unreadHere && !arrived) return;
    api(`/api/conversations/${activeId}/read`, { method: 'POST' })
      .then(() => conversations.patch((list) => list.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c))))
      .catch(() => {});
  }, [activeId, visible, newest, unreadHere]);

  const split = useMemo(() => splitRequests(requests.data || []), [requests.data]);
  const unreadTotal = (conversations.data || []).reduce(
    (n, c) => n + (hidden.ids.includes(c.id) || (c.id === activeId && visible) ? 0 : c.unreadCount), 0);

  const open = useCallback((id) => {
    hidden.restore(id);
    if (!latest.current.conversations?.some((c) => c.id === id)) conversations.refetch();
    threads.load(id);
  }, [hidden.restore]);

  const accept = async (id) => {
    const { request } = await api(`/api/requests/${id}/accept`, { method: 'POST' });
    requests.refetch();
    await conversations.refetch();
    return request.conversationId;
  };
  const hide = async (id) => {
    await api(`/api/requests/${id}/hide`, { method: 'POST' });
    requests.patch((list) => list.map((r) => (r.id === id ? { ...r, hiddenAt: new Date().toISOString() } : r)));
    requests.refetch();
  };
  const claim = async (id) => {
    try {
      const { helpRequest } = await api(`/api/help-requests/${id}/claim`, { method: 'POST' });
      help.refetch();
      await conversations.refetch();
      return helpRequest.conversationId;
    } catch (error) {
      if (error?.status === 409) help.refetch();
      throw error;
    }
  };
  // The chat list shows the newest message left on screen until the refetch lands.
  const deleteMessage = async (conversationId, messageId) => {
    await threads.remove(conversationId, messageId);
    const left = threads.threads[conversationId]?.messages.findLast((m) => !m.local && m.id !== messageId) ?? null;
    conversations.patch((list) => list.map((c) =>
      c.id === conversationId && c.lastMessage?.id === messageId ? { ...c, lastMessage: left } : c));
    conversations.refetch();
  };
  const resolve = async (helpId, conversationId) => {
    await api(`/api/help-requests/${helpId}/resolve`, { method: 'POST' });
    conversations.refetch();
    help.refetch();
    if (conversationId) threads.catchUp(conversationId);
  };

  return {
    slug,
    eventName: event?.name,
    role,
    verified: Boolean(eventMe?.verified),
    selfId,
    demoMode: Boolean(me?.demoMode),
    teamChat, teamSetup, setupTeam, addToTeam,
    hiddenChats: hidden.ids,
    hideChat: hidden.hide,
    restoreChat: hidden.restore,
    hideChatError: hidden.error,
    requests: { ...requests, ...split },
    conversations,
    help,
    threads: threads.threads,
    thread,
    active,
    unreadTotal,
    incomingCount: split.incoming.length,
    open,
    loadOlder: threads.loadOlder,
    reload: threads.load,
    send: (id, body) => threads.send(id, body, sent),
    retry,
    deleteMessage,
    accept,
    hide,
    claim,
    resolve,
  };
}
