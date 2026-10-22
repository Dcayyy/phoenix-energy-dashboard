import { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from '../lib/gsap';
import { registerSegment } from '../motion/registry';
import { useSystem } from '../state/system';
import { Toggle } from './Toggle';
import './cable-card.css';

const CABLE = 'M-12 128 C26 126 48 106 66 86 S98 42 126 40 S168 52 184 56';

export function CableCard() {
  const power = useSystem((s) => s.power);
  const [on, setOn] = useState(true);
  const artRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const art = artRef.current;
    if (!art) return;
    const q = gsap.utils.selector(art);
    return registerSegment('cable', {
      reset() {
        setOn(true);
        gsap.set(q('.draw'), { strokeDasharray: '100 100', strokeDashoffset: 100 });
        gsap.set(q('.plug-body'), { x: -18, autoAlpha: 0 });
        gsap.set(q('.badge'), { scale: 0, transformOrigin: '50% 50%' });
        gsap.set(q('.callout-text'), { autoAlpha: 0, x: -6 });
      },
      intro() {
        return gsap
          .timeline({ defaults: { ease: 'power3.inOut' } })
          .to(q('.draw-cable'), { strokeDashoffset: 0, duration: 1.4 }, 0)
          .to(q('.draw-ring'), { strokeDashoffset: 0, duration: 0.8, stagger: 0.12 }, 0.5)
          .to(q('.plug-body'), { x: 0, autoAlpha: 1, duration: 0.8, ease: 'expo.out' }, 1.0)
          .to(q('.badge'), { scale: 1, duration: 0.7, ease: 'back.out(2.6)' }, 1.1)
          .to(q('.draw-leader'), { strokeDashoffset: 0, duration: 0.7 }, 1.2)
          .to(q('.callout-text'), { autoAlpha: 1, x: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out' }, 1.45);
      },
      powerOn() {
        return gsap.timeline().fromTo(
          q('.badge-wave'),
          { scale: 0.4, autoAlpha: 0, transformOrigin: '50% 100%' },
          { scale: 1, autoAlpha: 1, duration: 0.6, stagger: 0.12, ease: 'back.out(2)' },
        );
      },
      powerOff() {
        return gsap.timeline().to(q('.badge-wave'), { autoAlpha: 0.25, duration: 0.4, stagger: -0.08 });
      },
    });
  }, []);

  return (
    <section className="card cable-card" data-live={on && power} aria-labelledby="cable-title">
      <i className="card-trace" aria-hidden />
      <svg ref={artRef} className="cable-art" viewBox="0 0 240 140" aria-hidden>
        <defs>
          <linearGradient id="plug-metal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4f4f4" />
            <stop offset="0.45" stopColor="#b9bbbf" />
            <stop offset="1" stopColor="#e3e4e6" />
          </linearGradient>
          <linearGradient id="plug-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e6c27a" />
            <stop offset="0.55" stopColor="#a87b34" />
            <stop offset="1" stopColor="#d6b06a" />
          </linearGradient>
          <filter id="cable-soft" x="-20%" y="-20%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>

        <g className="callout">
          <text x="16" y="21" className="callout-text callout-main">
            Ω 15
          </text>
          <text x="16" y="36" className="callout-text">
            1 W
          </text>
          <path d="M45 17 H58 L70 31" pathLength={100} className="leader draw draw-leader" />
          <circle cx="70" cy="31" r="1.8" className="callout-text leader-dot" />
        </g>

        <path d={CABLE} pathLength={100} className="cable-drop draw draw-cable" filter="url(#cable-soft)" transform="translate(4 9)" />

        <g transform="translate(92 56) rotate(-43)">
          <path d="M0 -20 A7 20 0 0 0 0 20" pathLength={100} className="ring draw draw-ring" />
        </g>

        <path d={CABLE} pathLength={100} className="cable-core draw draw-cable" />
        <path d={CABLE} pathLength={100} className="cable-sheen draw draw-cable" transform="translate(-0.6 -2.6)" />
        <path d={CABLE} pathLength={100} className="cable-pulse" />
        <path d={CABLE} pathLength={100} className="cable-pulse cable-pulse--late" />

        <g transform="translate(92 56) rotate(-43)">
          <path d="M0 20 A7 20 0 0 0 0 -20" pathLength={100} className="ring draw draw-ring" />
          <path d="M0 20 A7 20 0 0 0 0 -20" pathLength={100} className="ring-hi draw draw-ring" transform="translate(1.2 0)" />
        </g>

        <g transform="translate(184 56) rotate(14)">
          <g className="plug-body">
            <rect x="0" y="-6.5" width="13" height="13" rx="3" fill="#1b1c1f" />
            <rect x="11" y="-8.5" width="27" height="17" rx="4.5" fill="url(#plug-metal)" stroke="rgb(0 0 0 / 0.22)" strokeWidth="0.6" />
            <rect x="37" y="-5.5" width="12" height="11" rx="2.6" fill="url(#plug-gold)" />
            <rect x="40" y="-2" width="7" height="4" rx="1.6" fill="#4a3313" />
          </g>
        </g>

        <g className="badge" transform="translate(74 37)">
          <circle r="11" className="badge-disc" />
          <g transform="translate(0 3)">
            <circle r="1.6" className="badge-dot" />
            <path d="M-4 -3.4 A5.4 5.4 0 0 1 4 -3.4" className="badge-wave" />
            <path d="M-6.6 -6.2 A9 9 0 0 1 6.6 -6.2" className="badge-wave" />
          </g>
        </g>
      </svg>

      <div className="cable-foot">
        <div className="cable-name">
          <span className="cable-kicker">Flash mode</span>
          <h3 id="cable-title" className="display cable-title split-title">
            Cable
          </h3>
        </div>
        <Toggle tone="steel" showState checked={on} onChange={() => setOn((v) => !v)} label="Flash mode cable" />
      </div>
    </section>
  );
}
