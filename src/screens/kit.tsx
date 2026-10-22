import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { gsap } from '../lib/gsap';
import { registerSegment, segments, type Segment } from '../motion/registry';
import './kit.css';

/** A card with the boot-time edge trace. */
export function Card({
  className = '',
  label,
  children,
}: {
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card ${className}`} aria-label={label}>
      <i className="card-trace" aria-hidden />
      {children}
    </section>
  );
}

/**
 * Register a choreography segment for as long as the component is mounted.
 * Each call goes through the latest render's builder, so intros always start
 * from current state (a limit you changed, the mode you picked).
 */
export function useSegment(name: string, build: () => Segment) {
  const buildRef = useRef(build);
  buildRef.current = build;
  useLayoutEffect(
    () =>
      registerSegment(name, {
        reset: () => buildRef.current().reset?.(),
        intro: () => buildRef.current().intro?.() ?? gsap.timeline(),
      }),
    [name],
  );
}

/**
 * A screen's choreography: reset every card, then play each card's intro at
 * its offset. The cards register their own segments under these names.
 */
export function screenSegment(cues: [name: string, at: number][]): Segment {
  return {
    reset: () => cues.forEach(([name]) => segments.get(name)?.reset?.()),
    intro: () => {
      const tl = gsap.timeline();
      for (const [name, at] of cues) {
        const animation = segments.get(name)?.intro?.();
        if (animation) tl.add(animation, at);
      }
      return tl;
    },
  };
}

/** Pill tabs with a lit capsule that slides to the chosen option. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const place = (animate: boolean) => {
      const button = rootRef.current?.querySelector<HTMLElement>(`[data-id="${value}"]`);
      if (!button || !thumbRef.current) return;
      const vars = { x: button.offsetLeft, width: button.offsetWidth };
      if (animate) gsap.to(thumbRef.current, { ...vars, duration: 0.55, ease: 'expo.out' });
      else gsap.set(thumbRef.current, vars);
    };
    place(!first.current);
    first.current = false;
    const ro = new ResizeObserver(() => place(false));
    if (rootRef.current) ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, [value]);

  return (
    <div className="segmented" role="tablist" aria-label={label} ref={rootRef}>
      <span className="segmented-thumb" ref={thumbRef} aria-hidden />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          data-id={o.id}
          aria-selected={o.id === value}
          className="segmented-option"
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Deterministic pseudo-random numbers, so the charts look the same on every load. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth SVG path through points (Catmull-Rom converted to cubic Béziers). */
export function smoothPath(points: { x: number; y: number }[], tension = 0.5) {
  if (points.length < 2) return '';
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const k = tension / 3;
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Observe an element's content size. */
export function useSize(ref: RefObject<HTMLElement | null>, onSize: (w: number, h: number) => void) {
  const cb = useRef(onSize);
  cb.current = onSize;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth && el.clientHeight) cb.current(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}
