import { createRoot } from 'react-dom/client';
import '@fontsource-variable/mona-sans/standard.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import { App } from './App';
import { gsap } from './lib/gsap';
import { boot, currentTimeline, setPower } from './motion/director';
import { playDemo } from './motion/demo';
import { activeScene } from './scene/active';
import { goTo } from './motion/screens';

const params = new URLSearchParams(window.location.search);
const html = document.documentElement;

if (params.get('motion') === 'full') html.dataset.motion = 'full';

// ?reel lays the board out in a fixed 9:16 frame and scales it to the window,
// so a screen recording of that frame is already a vertical video.
if (params.has('reel')) {
  html.classList.add('is-reel');
  const fit = () => html.style.setProperty('--reel-fit', String(Math.min(innerWidth / 840, innerHeight / 1493)));
  fit();
  window.addEventListener('resize', fit);
}

// Dev-only handle for scrubbing the choreography from the console.
if (import.meta.env.DEV) {
  Object.assign(window, { __phoenix: { gsap, boot, setPower, playDemo, goTo, scene: activeScene, timeline: currentTimeline } });
}

createRoot(document.getElementById('root')!).render(<App />);
