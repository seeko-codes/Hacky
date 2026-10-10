import { useEffect, useState } from 'react';
export function readStore(key, fallback) {
  try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); }
  catch { return fallback; }
}
export function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
export function useMedia(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => { const media = matchMedia(query); const update = () => setMatches(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, [query]);
  return matches;
}
export function replyDelay(text = '') {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.min(6500, 2400 + words * 100);
}
