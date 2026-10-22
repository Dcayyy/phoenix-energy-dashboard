import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(useGSAP, SplitText, ScrambleTextPlugin);
gsap.defaults({ ease: 'power3.out', duration: 0.8 });

/**
 * Motion is reduced when the OS asks for it. `?motion=full` overrides that,
 * which matters when you screen-record on a Mac with Reduce Motion switched on.
 */
export function prefersReducedMotion() {
  if (document.documentElement.dataset.motion === 'full') return false;
  const forced = new URLSearchParams(window.location.search).get('motion');
  if (forced === 'full') return false;
  if (forced === 'reduced') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export { gsap, useGSAP, SplitText };
