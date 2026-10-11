import { useEffect, useState } from 'react';
import { readStore, writeStore } from '../storage.js';

// A local display preference, scoped to the signed-in person and event. No API mutation.
const readIds = key => {
  const value = readStore(key, []);
  return Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
};
export function useHiddenChats(userId, slug) {
  const key = `hacky-hidden-chats:${userId}:${slug}`;
  const [state, setState] = useState(() => ({ key, ids: readIds(key), error: '' }));
  const ids = state.key === key ? state.ids : readIds(key);
  useEffect(() => {
    const sync = event => { if (event.key === key || event.key === null) setState({ key, ids: readIds(key), error: '' }); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key]);
  const save = next => {
    if (!writeStore(key, next)) {
      setState({ key, ids, error: 'Couldn’t save this preference on your device. Try again.' });
      return false;
    }
    setState({ key, ids: next, error: '' });
    return true;
  };
  return {
    ids,
    error: state.key === key ? state.error : '',
    hide: id => save([...new Set([...ids, id])]),
    restore: id => !ids.includes(id) || save(ids.filter(value => value !== id)),
  };
}
