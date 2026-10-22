import { useLayoutEffect, useRef } from 'react';
import { gsap } from '../lib/gsap';
import { registerSegment } from '../motion/registry';
import { fixed, writeCount } from '../motion/count';

const CHARGE = 74;
const CX = 130;
const CY = 140;
const R = 98;
const STROKE = 22;
/** Gap between the charged arc and the track, in pathLength units (about 2px). */
const GAP = 0.7;
const TICKS = 41;
const ARC = `M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`;

const ticks = Array.from({ length: TICKS }, (_, i) => {
  const t = i / (TICKS - 1);
  const angle = Math.PI * (1 - t);
  const r0 = R + STROKE / 2 + 7;
  const r1 = r0 + (i % 5 === 0 ? 7 : 4);
  return {
    at: t * 100,
    x1: CX + r0 * Math.cos(angle),
    y1: CY - r0 * Math.sin(angle),
    x2: CX + r1 * Math.cos(angle),
    y2: CY - r1 * Math.sin(angle),
  };
});

export function ChargingGauge() {
  const valueRef = useRef<SVGPathElement>(null);
  const trackRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const shimmerRef = useRef<SVGPathElement>(null);
  const headRef = useRef<SVGCircleElement>(null);
  const numberRef = useRef<SVGTSpanElement>(null);
  const ticksRef = useRef<SVGGElement>(null);
  const charge = useRef({ value: 0 });

  useLayoutEffect(() => {
    const tickEls = Array.from(ticksRef.current?.children ?? []) as SVGLineElement[];

    const render = () => {
      const v = charge.current.value;
      valueRef.current?.setAttribute('stroke-dasharray', `${v.toFixed(2)} 200`);
      glowRef.current?.setAttribute('stroke-dasharray', `${v.toFixed(2)} 200`);
      trackRef.current?.setAttribute('stroke-dasharray', `${Math.max(100 - v - GAP, 0).toFixed(2)} 200`);
      trackRef.current?.setAttribute('stroke-dashoffset', (-(v + GAP)).toFixed(2));
      const angle = Math.PI * (1 - v / 100);
      headRef.current?.setAttribute('cx', (CX + R * Math.cos(angle)).toFixed(2));
      headRef.current?.setAttribute('cy', (CY - R * Math.sin(angle)).toFixed(2));
      if (headRef.current) headRef.current.style.opacity = v > 0.5 ? '1' : '0';
      tickEls.forEach((el, i) => el.classList.toggle('is-lit', ticks[i].at <= v + 0.01 && v > 0.5));
      writeCount(numberRef.current as unknown as HTMLElement, v, fixed(0));
    };

    let shimmer: gsap.core.Tween | null = null;
    const startShimmer = () => {
      shimmer?.kill();
      shimmer = gsap.fromTo(
        shimmerRef.current,
        { strokeDashoffset: 8, autoAlpha: 1 },
        { strokeDashoffset: -(CHARGE - 8), duration: 2.4, ease: 'power1.inOut', repeat: -1, repeatDelay: 1.1 },
      );
    };
    const stopShimmer = () => {
      shimmer?.kill();
      shimmer = null;
      gsap.set(shimmerRef.current, { autoAlpha: 0 });
    };

    render();
    return registerSegment('gauge', {
      reset() {
        stopShimmer();
        gsap.killTweensOf(charge.current);
        charge.current.value = 0;
        render();
      },
      powerOn() {
        return gsap
          .timeline()
          .to(charge.current, { value: CHARGE, duration: 2, ease: 'power3.inOut', onUpdate: render })
          .add(startShimmer, '-=0.2');
      },
      powerOff() {
        return gsap
          .timeline()
          .add(stopShimmer, 0)
          .to(charge.current, { value: 0, duration: 1.2, ease: 'power3.inOut', onUpdate: render }, 0);
      },
    });
  }, []);

  return (
    <div className="gauge">
      <svg viewBox="0 0 260 168" role="img" aria-label={`Battery charged to ${CHARGE} percent`}>
        <defs>
          <linearGradient id="gauge-value" gradientUnits="userSpaceOnUse" x1={CX - R} x2={CX + R * 0.6} y1="0" y2="0">
            <stop offset="0" stopColor="#a8380d" />
            <stop offset="0.55" stopColor="#f2581d" />
            <stop offset="1" stopColor="#ff8547" />
          </linearGradient>
          <linearGradient id="gauge-track" gradientUnits="userSpaceOnUse" x1={CX} x2={CX + R} y1="0" y2="0">
            <stop offset="0" stopColor="#d9dadc" />
            <stop offset="1" stopColor="#8f9297" />
          </linearGradient>
          <filter id="gauge-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        <g ref={ticksRef} className="gauge-ticks">
          {ticks.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
          ))}
        </g>

        <path d={ARC} pathLength={100} className="gauge-base" strokeWidth={STROKE} />
        <path ref={trackRef} d={ARC} pathLength={100} className="gauge-track" strokeWidth={STROKE} />
        <path ref={glowRef} d={ARC} pathLength={100} className="gauge-glow" strokeWidth={STROKE} filter="url(#gauge-soft)" />
        <path ref={valueRef} d={ARC} pathLength={100} className="gauge-value" strokeWidth={STROKE} />
        <path
          ref={shimmerRef}
          d={ARC}
          pathLength={100}
          className="gauge-shimmer"
          strokeWidth={STROKE}
          strokeDasharray="8 200"
          filter="url(#gauge-soft)"
        />
        <circle ref={headRef} r="4" className="gauge-head" />

        <g className="gauge-battery" transform={`translate(${CX - 6} ${CY - 84})`}>
          <rect x="0.75" y="2.75" width="10.5" height="16.5" rx="2.4" />
          <rect x="3.5" y="0" width="5" height="2.4" rx="1" className="gauge-battery-cap" />
          <rect x="3" y="9" width="6" height="8" rx="1" className="gauge-battery-fill" />
        </g>
        <text x={CX} y={CY - 26} className="gauge-number" textAnchor="middle">
          <tspan ref={numberRef}>0</tspan>
          <tspan className="gauge-percent">%</tspan>
        </text>
        <text x={CX - R} y={CY + 22} className="gauge-scale" textAnchor="middle">
          0%
        </text>
        <text x={CX + R} y={CY + 22} className="gauge-scale" textAnchor="middle">
          100%
        </text>
      </svg>
    </div>
  );
}
