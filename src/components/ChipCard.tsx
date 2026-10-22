import { useLayoutEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { gsap } from '../lib/gsap';
import { registerSegment } from '../motion/registry';
import { useSystem } from '../state/system';
import './chip-card.css';

const CX = 120;
const CY = 74;
const PIN_STEP = 12;
const PINS = [0, 1, 2, 3, 4, 5, 6];
/** Pins that carry current on the left and right edges. */
const LIVE = new Set([2, 3, 4]);

const pinY = (i: number) => CY + (i - 3) * PIN_STEP;
const pinX = (i: number) => CX + (i - 3) * PIN_STEP;

/** A PCB trace from a side pin out to the card edge, with one 45° jog. */
function trace(side: -1 | 1, i: number) {
  const y = pinY(i);
  const x0 = side < 0 ? 58 : 182;
  const jog = (i - 3) * 6;
  const x1 = x0 + side * 14;
  const x2 = x1 + side * Math.abs(jog);
  const end = side < 0 ? -4 : 244;
  return `M${x0} ${y} H${x1} L${x2} ${y + jog} H${end}`;
}

export function ChipCard() {
  const power = useSystem((s) => s.power);
  const artRef = useRef<SVGSVGElement>(null);
  const voltRef = useRef<SVGTSpanElement>(null);
  const acRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const art = artRef.current;
    if (!art) return;
    const q = gsap.utils.selector(art);
    let jitter: gsap.core.Tween | null = null;

    const show = (volts: string) => {
      if (voltRef.current) voltRef.current.textContent = volts;
      if (acRef.current) acRef.current.textContent = volts;
    };

    // A live meter never sits perfectly still.
    const wander = () => {
      const v = (23.6 + Math.random() * 0.35).toFixed(1);
      show(v);
      gsap.fromTo(voltRef.current, { opacity: 0.55 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
      jitter = gsap.delayedCall(1.4 + Math.random() * 1.6, wander);
    };
    const stopWander = () => {
      jitter?.kill();
      jitter = null;
    };

    return registerSegment('chip', {
      reset() {
        stopWander();
        show('00.0');
        art.dataset.live = 'false';
        gsap.set(q('.chip-package'), { scale: 0.86, autoAlpha: 0, transformOrigin: '50% 50%' });
        gsap.set(q('.pin'), { autoAlpha: 0 });
        gsap.set(q('.trace'), { strokeDasharray: '100 100', strokeDashoffset: 100 });
      },
      intro() {
        return gsap
          .timeline()
          .to(q('.chip-package'), { scale: 1, autoAlpha: 1, duration: 1, ease: 'expo.out' }, 0)
          .to(q('.pin'), { autoAlpha: 1, duration: 0.3, stagger: { each: 0.012, from: 'center' } }, 0.25)
          .to(q('.trace'), { strokeDashoffset: 0, duration: 1.1, ease: 'power3.inOut', stagger: 0.03 }, 0.35);
      },
      powerOn() {
        const lit = q('.pin.is-live');
        return gsap
          .timeline()
          .add(() => {
            art.dataset.live = 'true';
          }, 0)
          .fromTo(lit, { scale: 1.8, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.6, ease: 'expo.out', stagger: 0.05 }, 0)
          .to(voltRef.current, { duration: 1, scrambleText: { text: '23.8', chars: '0123456789', speed: 0.5 } }, 0.15)
          .add(() => show('23.8'), 1.15)
          .add(() => {
            stopWander();
            jitter = gsap.delayedCall(2, wander);
          }, 1.2);
      },
      powerOff() {
        return gsap
          .timeline()
          .add(() => {
            stopWander();
            art.dataset.live = 'false';
          }, 0)
          .to(voltRef.current, { duration: 0.7, scrambleText: { text: '00.0', chars: '0123456789', speed: 0.5 } }, 0)
          .add(() => show('00.0'), 0.75);
      },
    });
  }, []);

  return (
    <section className="card chip-card" data-power={power ? 'on' : 'off'} aria-labelledby="chip-title">
      <i className="card-trace" aria-hidden />
      <h3 id="chip-title" className="sr-only">
        Voltage display
      </h3>
      <svg ref={artRef} className="chip-art" viewBox="0 0 240 150" data-live="false" aria-hidden>
        <defs>
          <linearGradient id="chip-shell" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34373d" />
            <stop offset="1" stopColor="#17181b" />
          </linearGradient>
          <radialGradient id="chip-die" cx="0.35" cy="0.25" r="0.9">
            <stop offset="0" stopColor="#1d1f23" />
            <stop offset="1" stopColor="#0b0c0e" />
          </radialGradient>
          <pattern id="pcb-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M12 0H0V12" fill="none" stroke="rgb(255 255 255 / 0.035)" strokeWidth="0.6" />
          </pattern>
        </defs>

        <rect x="-10" y="-10" width="260" height="170" fill="url(#pcb-grid)" />

        {PINS.map((i) => (
          <g key={`t${i}`}>
            <path d={trace(-1, i)} pathLength={100} className={`trace${LIVE.has(i) ? ' is-live' : ''}`} />
            <path d={trace(1, i)} pathLength={100} className={`trace${LIVE.has(i) ? ' is-live' : ''}`} />
          </g>
        ))}
        {PINS.filter((i) => LIVE.has(i)).map((i) => (
          <g key={`p${i}`}>
            <path d={trace(-1, i)} pathLength={100} className="trace-pulse" style={{ animationDelay: `${-i * 0.37}s` }} />
            <path d={trace(1, i)} pathLength={100} className="trace-pulse trace-pulse--out" style={{ animationDelay: `${-i * 0.29}s` }} />
          </g>
        ))}

        {PINS.map((i) => (
          <g key={`pin${i}`}>
            <rect x="58" y={pinY(i) - 1.8} width="14" height="3.6" rx="1" className={`pin${LIVE.has(i) ? ' is-live' : ''}`} />
            <rect x="168" y={pinY(i) - 1.8} width="14" height="3.6" rx="1" className={`pin${LIVE.has(i) ? ' is-live' : ''}`} />
            <rect x={pinX(i) - 1.8} y="14" width="3.6" height="14" rx="1" className="pin" />
            <rect x={pinX(i) - 1.8} y="120" width="3.6" height="14" rx="1" className="pin" />
          </g>
        ))}

        <g className="chip-package">
          <rect x="72" y="26" width="96" height="96" rx="14" fill="url(#chip-shell)" stroke="#43474e" strokeWidth="1" />
          <rect x="86" y="40" width="68" height="68" rx="10" fill="url(#chip-die)" stroke="#2c2f34" strokeWidth="1" />
          <circle cx="80" cy="34" r="2" className="chip-mark" />
          <rect x="98" y="51" width="44" height="21" rx="10.5" className="volt-pill" />
          <text x={CX} y="65.6" textAnchor="middle" className="volt-value">
            <tspan ref={voltRef}>00.0</tspan>
          </text>
          <path d="M98 83 q2.2 -4 4.4 0 t4.4 0" className="volt-wave" />
          <text x="98" y="96" className="volt-label">
            Volt
          </text>
          <text x="98" y="104" className="volt-sub">
            Display
          </text>
        </g>
      </svg>

      <div className="chip-foot">
        <p className="chip-reading">
          AC <b><span ref={acRef}>00.0</span>V</b> / DC <b>14V</b>
        </p>
        <button type="button" className="pill pill--small">
          Details
          <ChevronRight size={13} strokeWidth={2.4} aria-hidden />
        </button>
      </div>
    </section>
  );
}
