import {useEffect, useRef, useState} from 'react';
import {useMedia} from './storage';

// The supplied character performance, cropped for the onboarding stage. No audio.
export default function HackyFilm() {
  const video = useRef(null);
  const previousTime = useRef(0);
  const cycle = useRef(0);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const node = video.current;
    let visible = true;
    node.playbackRate = [.94, .88, .98, .91][cycle.current % 4];
    const sync = () => {
      if (paused || reduced || document.hidden || !visible) node.pause();
      else node.play().catch(() => setPlaying(false));
    };
    const observer = new IntersectionObserver(([entry]) => {visible = entry.isIntersecting; sync();});
    observer.observe(node);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {observer.disconnect(); document.removeEventListener('visibilitychange', sync); node.pause();};
  }, [paused, reduced]);
  return <div className="hacky-film">
    <video ref={video} muted loop playsInline preload="auto" poster="/assets/mascots/video/hacky-onboarding-transparent.png" aria-label="Hacky floats, smiles, and gestures to welcome you" onTimeUpdate={event => {
      const node = event.currentTarget;
      if (!node.seeking && node.currentTime < .3 && previousTime.current > node.duration - 1) {
        cycle.current += 1;
        node.playbackRate = [.94, .88, .98, .91][cycle.current % 4];
      }
      previousTime.current = node.currentTime;
    }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>
      <source src="/assets/mascots/video/hacky-onboarding-smooth.webm" type="video/webm"/>
    </video>
    {!reduced && <button type="button" className="hacky-film-toggle" aria-label={playing ? 'Pause Hacky animation' : 'Play Hacky animation'} onClick={() => {setPaused(playing); if (!playing) video.current.play().catch(() => setPlaying(false));}}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{playing ? <path d="M8 5v14M16 5v14"/> : <path d="m8 5 11 7-11 7Z"/>}</svg>
    </button>}
  </div>;
}
