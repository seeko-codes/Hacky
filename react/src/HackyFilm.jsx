import {useEffect, useRef} from 'react';
import {useMedia} from './storage';

// Supplied character performances. WebP clips retain their transparent backgrounds.
export const ONBOARDING_CLIP = {
  webp: '/onboarding/hacky-match-dance.webp',
  poster: '/onboarding/hacky-match-dance.png',
  label: 'Hacky dances to welcome you',
};
export const CHAT_CLIP = {
  webp: '/assets/mascots/video/hacky-chat.webp',
  poster: '/assets/mascots/video/hacky-chat.png',
  label: 'Hacky rides a little green dragon and points the way',
};
export const THINKING_CLIP = {
  webp: '/assets/mascots/video/hacky-thinking.webp',
  poster: '/assets/mascots/video/hacky-thinking.png',
  label: 'Hacky thinks it over',
};

// onUnavailable runs when the clip can't load, so the caller can show the still Hacky instead.
export default function HackyFilm({clip = ONBOARDING_CLIP, onUnavailable}) {
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const video = useRef(null);
  useEffect(() => {
    if (!video.current) return;
    if (reduced) video.current.pause();
    else video.current.play().catch(() => {});
  }, [reduced, clip.video]);
  return <div className="hacky-film">
    {clip.video
      ? <video ref={video} src={clip.video} autoPlay={!reduced} muted loop playsInline preload="auto" aria-label={clip.label} onError={onUnavailable}/>
      : <img src={reduced ? clip.poster : clip.webp} alt={clip.label} decoding="async" draggable={false} onError={onUnavailable}/>}
  </div>;
}
