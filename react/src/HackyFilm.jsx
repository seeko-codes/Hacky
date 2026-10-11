import {useMedia} from './storage';

// Supplied character performances, each with a still poster frame. The clips are animated
// WebP: it keeps alpha in every browser, iOS Safari included, which ignores HEVC alpha.
export const ONBOARDING_CLIP = {
  webp: '/assets/mascots/video/hacky-onboarding.webp',
  poster: '/assets/mascots/video/hacky-onboarding-transparent.png',
  label: 'Hacky floats, smiles, and gestures to welcome you',
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
  return <div className="hacky-film">
    <img src={reduced ? clip.poster : clip.webp} alt={clip.label} decoding="async" draggable={false} onError={onUnavailable}/>
  </div>;
}
