import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Asterisk, Plus, Zap } from 'lucide-react';
import { gsap } from '../lib/gsap';
import { registerSegment } from '../motion/registry';
import { fixed, writeCount } from '../motion/count';
import { system } from '../state/system';
import { Toggle } from './Toggle';
import './energy-flow.css';

type Port = { id: string; name: string; rated: number; on: boolean };

const START_PORTS: Port[] = [
  { id: 'main-ac', name: 'Main AC', rated: 30, on: true },
  { id: 'sec-ac', name: 'Sec-AC', rated: 14, on: false },
  { id: 'usb-c-1', name: 'USB-C', rated: 6, on: false },
  { id: 'usb-c-2', name: 'USB-C', rated: 8, on: true },
  { id: 'usb-a', name: 'USB-A', rated: 3, on: false },
];
const EXTRA_PORT: Port = { id: 'wireless', name: 'Wireless', rated: 5, on: false };

/** Usable battery energy: 38 kWh of output drains it in 12 hours. */
const CAPACITY = 456;
const MAX_RATED = 30;
const MIN_STROKE = 5;
const MAX_STROKE = 18;
const BUNDLE_GAP = 1.5;

const strokeFor = (kwh: number) =>
  MIN_STROKE + (MAX_STROKE - MIN_STROKE) * Math.pow(Math.max(kwh, 0) / MAX_RATED, 0.65);

/** Particles travel faster on cables that carry more energy. */
const particleSeconds = (rated: number) => (26 / (46 + rated * 4.2)).toFixed(3);

const loadLabel = (kwh: number) =>
  kwh < 0.5 ? 'No load' : kwh < 20 ? 'Low load' : kwh <= 45 ? 'Medium load' : 'High load';

/** Live, tweened state of one cable. The cable is lit between `tail` and `head`. */
type Flow = { y: number; kwh: number; head: number; tail: number; reveal: number; alpha: number };

type Els = {
  shadow: SVGPathElement;
  base: SVGPathElement;
  sheen: SVGPathElement;
  term: SVGRectElement;
  hit: SVGPathElement;
  glow: SVGPathElement;
  live: SVGPathElement;
  liveSheen: SVGPathElement;
  dotsA: SVGPathElement;
  dotsB: SVGPathElement;
  spark: SVGGElement;
  row: HTMLLIElement;
  value: HTMLSpanElement;
};
const EL_KEYS: (keyof Els)[] = [
  'shadow', 'base', 'sheen', 'term', 'hit', 'glow', 'live', 'liveSheen', 'dotsA', 'dotsB', 'spark', 'row', 'value',
];

type Geometry = { w: number; h: number; nodeX: number; x0: number; x1: number; sy: number; ys: number[] };

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

function measure(w: number, h: number, count: number): Geometry {
  const compact = w < 600;
  const nodeX = compact ? clamp(w * 0.25, 92, 150) : clamp(w * 0.3, 160, 330);
  const portsWidth = compact ? 150 : clamp(w * 0.255, 176, 236);
  const top = compact ? Math.max(h * 0.33, 132) : Math.max(h * 0.255, 96);
  // Narrow cards stack the battery footer under the ports instead of beside them.
  const bottom = h - (compact ? 116 : 36);
  const step = count > 1 ? (bottom - top) / (count - 1) : 0;
  return {
    w,
    h,
    nodeX,
    x0: nodeX + 14,
    x1: w - portsWidth,
    sy: Math.round(h * (compact ? 0.56 : 0.52)),
    ys: Array.from({ length: count }, (_, i) => top + i * step),
  };
}

function cablePath(x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0;
  return `M${x0.toFixed(1)},${y0.toFixed(1)} C${(x0 + dx * 0.52).toFixed(1)},${y0.toFixed(1)} ${(x1 - dx * 0.48).toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

/** Show only the [from, to] stretch of a path (lengths in px). */
function reveal(paths: SVGPathElement[], from: number, to: number, length: number) {
  const visible = to - from;
  for (const p of paths) {
    if (visible <= 0.5) {
      p.style.visibility = 'hidden';
      continue;
    }
    p.style.visibility = 'visible';
    if (from <= 0.01 && to >= length - 0.01) {
      p.style.strokeDasharray = 'none';
      p.style.strokeDashoffset = '0';
    } else {
      p.style.strokeDasharray = `${visible.toFixed(2)} ${(length * 2).toFixed(0)}`;
      p.style.strokeDashoffset = (-from).toFixed(2);
    }
  }
}

const setStroke = (el: SVGElement, width: number) => {
  el.style.strokeWidth = width.toFixed(2);
};

export function EnergyFlow() {
  const [ports, setPorts] = useState(START_PORTS);
  const [hover, setHover] = useState<string | null>(null);

  const portsRef = useRef(ports);
  portsRef.current = ports;
  // The tooltip keeps showing the last cable while it fades out, instead of
  // emptying into a blank dark box.
  const tipIdRef = useRef<string | null>(null);
  if (hover) tipIdRef.current = hover;

  const cardRef = useRef<HTMLElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLSpanElement>(null);
  const outputRef = useRef<HTMLSpanElement>(null);
  const hoursRef = useRef<HTMLSpanElement>(null);
  const loadRef = useRef<HTMLSpanElement>(null);
  const waveRef = useRef<SVGSVGElement>(null);
  const portsListRef = useRef<HTMLUListElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipValueRef = useRef<HTMLSpanElement>(null);
  const cableGradRef = useRef<SVGLinearGradientElement>(null);
  const liveGradRef = useRef<SVGLinearGradientElement>(null);

  const geo = useRef<Geometry | null>(null);
  const flows = useRef(new Map<string, Flow>());
  const els = useRef(new Map<string, Partial<Els>>());
  const dirty = useRef(true);

  const flowOf = useCallback((id: string) => {
    let flow = flows.current.get(id);
    if (!flow) {
      flow = { y: 0, kwh: 0, head: 0, tail: 0, reveal: 0, alpha: 1 };
      flows.current.set(id, flow);
    }
    return flow;
  }, []);

  const bind = (id: string, key: keyof Els) => (el: Element | null) => {
    const entry = els.current.get(id) ?? {};
    if (el) (entry as Record<string, Element>)[key] = el;
    else delete entry[key];
    els.current.set(id, entry);
    dirty.current = true;
  };

  const invalidate = useCallback(() => {
    dirty.current = true;
  }, []);

  /** Writes every tweened value into the SVG and the port rows. Runs at most once per frame. */
  const draw = useCallback(() => {
    const g = geo.current;
    if (!g) return;
    const list = portsRef.current;
    const strokes = list.map((p) => strokeFor(flowOf(p.id).kwh));
    const bundle = strokes.reduce((a, b) => a + b, 0) + BUNDLE_GAP * (list.length - 1);
    let cursor = g.sy - bundle / 2;
    let output = 0;

    list.forEach((port, i) => {
      const f = flowOf(port.id);
      const sw = strokes[i];
      const y0 = cursor + sw / 2;
      cursor += sw + BUNDLE_GAP;
      output += f.kwh;

      const e = els.current.get(port.id);
      if (!e || EL_KEYS.some((k) => !e[k])) return;
      const el = e as Els;

      // End half a stroke early so the round cap stops at the terminal.
      const d = cablePath(g.x0, y0, g.x1 - sw / 2 - 1, f.y);
      for (const p of [el.shadow, el.base, el.sheen, el.hit, el.glow, el.live, el.liveSheen, el.dotsA, el.dotsB]) {
        p.setAttribute('d', d);
      }
      const length = el.base.getTotalLength();

      setStroke(el.shadow, sw + 7);
      setStroke(el.base, sw);
      setStroke(el.sheen, Math.max(1.4, sw * 0.26));
      setStroke(el.hit, Math.max(sw + 16, 26));
      setStroke(el.glow, sw + 10);
      setStroke(el.live, sw);
      setStroke(el.liveSheen, Math.max(1.4, sw * 0.26));
      setStroke(el.dotsA, Math.max(2.4, sw * 0.34));
      setStroke(el.dotsB, Math.max(3.2, sw * 0.46));
      const lift = `translate(0 ${(-sw * 0.2).toFixed(2)})`;
      el.sheen.setAttribute('transform', lift);
      el.liveSheen.setAttribute('transform', lift);

      reveal([el.shadow, el.base, el.sheen], 0, f.reveal * length, length);
      reveal([el.glow, el.live, el.liveSheen], f.tail * length, f.head * length, length);

      const flowing = String(f.head > 0.985 && f.tail < 0.015);
      if (el.dotsA.dataset.on !== flowing) {
        el.dotsA.dataset.on = flowing;
        el.dotsB.dataset.on = flowing;
      }

      const charging = f.head > 0.003 && f.head < 0.997 && f.tail < 0.01;
      if (charging) {
        const pt = el.base.getPointAtLength(length * f.head);
        el.spark.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
      }
      el.spark.style.opacity = charging ? '1' : '0';

      const th = Math.max(sw + 10, 16);
      el.term.setAttribute('x', (g.x1 - 1.25).toFixed(1));
      el.term.setAttribute('y', (f.y - th / 2).toFixed(1));
      el.term.setAttribute('height', th.toFixed(1));
      el.term.dataset.lit = String(f.head > 0.99 && f.tail < 0.5 && f.kwh > 0.05);

      el.row.style.transform = `translate3d(0, ${f.y.toFixed(1)}px, 0)`;
      el.row.style.opacity = String(f.alpha);
      writeCount(el.value, f.kwh, fixed(0));
    });

    writeCount(outputRef.current, output, fixed(0));
    if (output > 0.5) writeCount(hoursRef.current, Math.min(CAPACITY / output, 99), fixed(0));

    // The tooltip reads live values, so it keeps counting while you hover.
    const tipId = tipIdRef.current;
    if (tipId && tipValueRef.current) {
      const kwh = flowOf(tipId).kwh;
      tipValueRef.current.textContent =
        kwh > 0.5 && output > 0.5
          ? `${Math.round(kwh)} kWh, ${Math.round((kwh / output) * 100)}% of output`
          : `${Math.round(kwh)} kWh, switched off`;
    }
    const label = loadLabel(output);
    if (loadRef.current && loadRef.current.textContent !== label) loadRef.current.textContent = label;
    waveRef.current?.style.setProperty('--load', String(Math.min(output / 60, 1)));
  }, [flowOf]);

  /** Recomputes geometry from the card size; ports snap to their rows. */
  const layout = useCallback(
    (snap: boolean) => {
      const card = cardRef.current;
      if (!card) return;
      const g = measure(card.clientWidth, card.clientHeight, portsRef.current.length);
      geo.current = g;
      if (snap) portsRef.current.forEach((p, i) => (flowOf(p.id).y = g.ys[i]));
      if (sourceRef.current) {
        sourceRef.current.style.top = `${g.sy}px`;
        sourceRef.current.style.width = `${g.nodeX + 24}px`;
      }
      if (portsListRef.current) portsListRef.current.style.left = `${g.x1 + 14}px`;
      for (const grad of [cableGradRef.current, liveGradRef.current]) {
        grad?.setAttribute('x1', String(g.x0));
        grad?.setAttribute('x2', String(g.x1));
      }
      dirty.current = true;
    },
    [flowOf],
  );

  // One draw per frame, however many tweens touched the model.
  useLayoutEffect(() => {
    const tick = () => {
      if (!dirty.current) return;
      dirty.current = false;
      draw();
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [draw]);

  useLayoutEffect(() => {
    layout(true);
    draw();
    const ro = new ResizeObserver(() => layout(true));
    if (cardRef.current) ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, [layout, draw]);

  useLayoutEffect(() => {
    dirty.current = true;
  }, [ports, hover]);

  const pulseTerminal = useCallback((id: string) => {
    const e = els.current.get(id);
    if (!e?.term) return;
    gsap.fromTo(e.term, { scaleY: 2.4, transformOrigin: '50% 50%' }, { scaleY: 1, duration: 0.8, ease: 'expo.out' });
    if (e.value) gsap.fromTo(e.value, { color: '#ffb48a' }, { color: '', duration: 1.2, ease: 'power2.out', clearProps: 'color' });
  }, []);

  /** Current reaches the port: the energy front races down the cable, then the reading climbs. */
  const energize = useCallback(
    (port: Port) => {
      const f = flowOf(port.id);
      gsap.killTweensOf(f, 'head,tail,kwh');
      const tl = gsap.timeline({ onUpdate: invalidate });
      if (f.tail > 0) tl.set(f, { head: 0, tail: 0 });
      // The source flares as it sends current down the cable.
      tl.fromTo(flashRef.current, { scale: 0.7, autoAlpha: 0.95 }, { scale: 2.1, autoAlpha: 0, duration: 0.8, ease: 'expo.out' }, 0);
      tl.to(f, { head: 1, duration: 1.05, ease: 'power2.inOut' }, 0)
        .to(f, { kwh: port.rated, duration: 1.2, ease: 'power3.out' }, 0.45)
        .add(() => pulseTerminal(port.id), 1.0);
      return tl;
    },
    [flowOf, invalidate, pulseTerminal],
  );

  /** Switching off flushes what is left in the cable into the port. */
  const cutOff = useCallback(
    (port: Port) => {
      const f = flowOf(port.id);
      gsap.killTweensOf(f, 'head,tail,kwh');
      const tl = gsap.timeline({ onUpdate: invalidate });
      if (f.head < 0.02) return tl.to(f, { kwh: 0, duration: 0.6 });
      tl.to(f, { tail: f.head, duration: 0.85, ease: 'power2.in' }, 0)
        .to(f, { kwh: 0, duration: 0.9, ease: 'power2.out' }, 0.1)
        .set(f, { head: 0, tail: 0 });
      return tl;
    },
    [flowOf, invalidate],
  );

  const toggle = (id: string) => {
    const { busy, power } = system.get();
    if (busy) return;
    const port = portsRef.current.find((p) => p.id === id);
    if (!port) return;
    const next = portsRef.current.map((p) => (p.id === id ? { ...p, on: !p.on } : p));
    portsRef.current = next;
    setPorts(next);
    if (power) (port.on ? cutOff(port) : energize(port)).play();
  };

  const addPort = () => {
    if (system.get().busy || portsRef.current.some((p) => p.id === EXTRA_PORT.id)) return;
    const card = cardRef.current;
    if (!card || !geo.current) return;
    const next = [...portsRef.current, EXTRA_PORT];
    const g = measure(card.clientWidth, card.clientHeight, next.length);
    const f = flowOf(EXTRA_PORT.id);
    Object.assign(f, { y: g.ys[g.ys.length - 1] + 26, kwh: 0, head: 0, tail: 0, reveal: 0, alpha: 0 });
    portsRef.current = next;
    setPorts(next);
    geo.current = g;
    const tl = gsap.timeline({ onUpdate: invalidate });
    next.forEach((p, i) => tl.to(flowOf(p.id), { y: g.ys[i], duration: 0.9, ease: 'expo.inOut' }, 0));
    tl.to(f, { alpha: 1, duration: 0.5, ease: 'power2.out' }, 0.45).to(
      f,
      { reveal: 1, duration: 1.1, ease: 'power3.inOut' },
      0.4,
    );
  };

  // Choreography hooks for the director.
  useLayoutEffect(() => {
    return registerSegment('flow', {
      reset() {
        portsRef.current = START_PORTS;
        setPorts(START_PORTS);
        setHover(null);
        layout(true);
        portsRef.current.forEach((p) => {
          const f = flowOf(p.id);
          gsap.killTweensOf(f);
          Object.assign(f, { kwh: 0, head: 0, tail: 0, reveal: 0, alpha: 0 });
        });
        writeCount(hoursRef.current, 0, fixed(0));
        gsap.set(barRef.current, { scaleX: 0 });
        gsap.set(nodeRef.current, { scale: 0.3, autoAlpha: 0 });
        gsap.set(cardRef.current?.querySelectorAll('.flow-foot > *') ?? [], { autoAlpha: 0, y: 12 });
        dirty.current = true;
      },
      intro() {
        const tl = gsap.timeline({ onUpdate: invalidate });
        tl.to(barRef.current, { scaleX: 1, duration: 0.9, ease: 'expo.inOut' }, 0)
          .to(nodeRef.current, { scale: 1, autoAlpha: 1, duration: 0.7, ease: 'back.out(2.4)' }, 0.55)
          .to(cardRef.current?.querySelectorAll('.flow-foot > *') ?? [], { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.1, ease: 'expo.out' }, 0.5);
        portsRef.current.forEach((p, i) => {
          const f = flowOf(p.id);
          tl.to(f, { reveal: 1, duration: 1.0, ease: 'power3.inOut' }, 0.6 + i * 0.07);
          tl.to(f, { alpha: 1, duration: 0.6, ease: 'power2.out' }, 0.9 + i * 0.07);
        });
        return tl;
      },
      powerOn() {
        const tl = gsap.timeline();
        portsRef.current
          .filter((p) => p.on)
          .forEach((p, i) => tl.add(energize(p), i * 0.16));
        return tl;
      },
      powerOff() {
        const tl = gsap.timeline();
        portsRef.current.forEach((p, i) => tl.add(cutOff(p), i * 0.05));
        return tl;
      },
    });
  }, [energize, cutOff, flowOf, invalidate, layout]);

  // Tooltip follows the pointer.
  const tipX = useRef<gsap.QuickToFunc | null>(null);
  const tipY = useRef<gsap.QuickToFunc | null>(null);
  useLayoutEffect(() => {
    if (!tipRef.current) return;
    gsap.set(tipRef.current, { yPercent: -50 });
    tipX.current = gsap.quickTo(tipRef.current, 'x', { duration: 0.35, ease: 'power3' });
    tipY.current = gsap.quickTo(tipRef.current, 'y', { duration: 0.35, ease: 'power3' });
  }, []);

  const onMove = (e: PointerEvent<HTMLElement>) => {
    const card = cardRef.current;
    if (!card || !hover) return;
    const rect = card.getBoundingClientRect();
    // The demo camera may be zooming the board; work in the card's own pixels.
    const scale = rect.width / card.offsetWidth || 1;
    const x = (e.clientX - rect.left) / scale;
    const flip = x > card.offsetWidth - 220;
    tipX.current?.(flip ? x - 200 : x + 16);
    tipY.current?.((e.clientY - rect.top) / scale);
  };

  const tipPort = ports.find((p) => p.id === tipIdRef.current);
  const hasExtra = ports.some((p) => p.id === EXTRA_PORT.id);

  const hoverProps = (id: string) => ({
    onPointerEnter: () => setHover(id),
    onPointerLeave: () => setHover((h) => (h === id ? null : h)),
  });

  return (
    <section
      ref={cardRef}
      className={`card flow-card slot-hero${hover ? ' is-hovering' : ''}`}
      aria-labelledby="flow-title"
      onPointerMove={onMove}
    >
      <i className="card-trace" aria-hidden />
      <div className="flow-dots" aria-hidden />

      <h2 id="flow-title" className="display flow-title split-title">
        Energy
        <br />
        flow
      </h2>
      <button type="button" className="pill add-port" onClick={addPort} disabled={hasExtra}>
        {hasExtra ? 'Ports full' : 'Add port'}
        <Plus size={14} strokeWidth={2.2} aria-hidden />
      </button>

      <svg className="flow-layer flow-base" aria-hidden>
        <defs>
          <linearGradient id="cable-grad" ref={cableGradRef} gradientUnits="userSpaceOnUse" y1="0" y2="0">
            <stop offset="0" stopColor="#3b3e44" />
            <stop offset="0.55" stopColor="#4d5057" />
            <stop offset="1" stopColor="#43464c" />
          </linearGradient>
          <filter id="cable-shadow" x="-10%" y="-40%" width="120%" height="180%">
            <feGaussianBlur stdDeviation="4.5" />
          </filter>
        </defs>
        <g filter="url(#cable-shadow)" transform="translate(0 6)">
          {ports.map((p) => (
            <path key={p.id} ref={bind(p.id, 'shadow')} className="cable-shadow" />
          ))}
        </g>
        {ports.map((p) => (
          <g key={p.id} className="cable" data-active={hover === p.id || undefined}>
            <path ref={bind(p.id, 'base')} className="cable-base" />
            <path ref={bind(p.id, 'sheen')} className="cable-sheen" />
            <rect ref={bind(p.id, 'term')} className="terminal" width="2.5" rx="1.25" />
          </g>
        ))}
        {ports.map((p) => (
          <path key={p.id} ref={bind(p.id, 'hit')} className="cable-hit" data-port={p.id} {...hoverProps(p.id)} />
        ))}
      </svg>

      <svg className="flow-layer flow-live" aria-hidden>
        <defs>
          <linearGradient id="live-grad" ref={liveGradRef} gradientUnits="userSpaceOnUse" y1="0" y2="0">
            <stop offset="0" stopColor="#d4471a" />
            <stop offset="0.45" stopColor="#ff6a2b" />
            <stop offset="1" stopColor="#ff8d50" />
          </linearGradient>
          <filter id="live-glow" x="-10%" y="-60%" width="120%" height="220%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g filter="url(#live-glow)">
          {ports.map((p) => (
            <path key={p.id} ref={bind(p.id, 'glow')} className="live-glow" />
          ))}
        </g>
        {ports.map((p) => (
          <g key={p.id} className="cable" data-active={hover === p.id || undefined}>
            <path ref={bind(p.id, 'live')} className="live" />
            <path ref={bind(p.id, 'liveSheen')} className="live-sheen" />
          </g>
        ))}
      </svg>

      <svg className="flow-layer flow-fx" aria-hidden>
        <defs>
          <radialGradient id="spark-grad">
            <stop offset="0" stopColor="#fff7f0" stopOpacity="1" />
            <stop offset="0.35" stopColor="#ffb37f" stopOpacity="0.85" />
            <stop offset="1" stopColor="#ff6a2b" stopOpacity="0" />
          </radialGradient>
        </defs>
        {ports.map((p) => (
          <g
            key={p.id}
            className="cable"
            data-active={hover === p.id || undefined}
            style={{ '--dur': `${particleSeconds(p.rated)}s` } as CSSProperties}
          >
            <path ref={bind(p.id, 'dotsA')} className="dots dots-a" />
            <path ref={bind(p.id, 'dotsB')} className="dots dots-b" />
            <g ref={bind(p.id, 'spark')} className="spark">
              <circle r="14" fill="url(#spark-grad)" />
              <circle r="2.8" fill="#fff" />
            </g>
          </g>
        ))}
      </svg>

      <div className="source" ref={sourceRef}>
        <div className="source-bar" ref={barRef}>
          <span className="display source-title">Output</span>
          <span className="source-sub">
            <span ref={outputRef}>0</span> kWh
            <Asterisk size={11} strokeWidth={2.6} aria-hidden />
          </span>
        </div>
        <div className="source-node" ref={nodeRef}>
          <span className="node-flash" ref={flashRef} aria-hidden />
          <span className="node-core">
            <Zap size={14} strokeWidth={2.5} fill="currentColor" aria-hidden />
          </span>
        </div>
      </div>

      <ul className="ports" ref={portsListRef} aria-label="Output ports">
        {ports.map((p) => (
          <li key={p.id} ref={bind(p.id, 'row')} className="port" data-id={p.id} data-on={p.on} {...hoverProps(p.id)}>
            <div className="port-meta">
              <span className="port-name">{p.name}</span>
              <span className="port-value">
                <span ref={bind(p.id, 'value')}>0</span> kWh
              </span>
            </div>
            <Toggle checked={p.on} onChange={() => toggle(p.id)} label={`${p.name} output`} />
          </li>
        ))}
      </ul>

      <footer className="flow-foot">
        <div className="battery">
          <span className="display battery-hours" ref={hoursRef}>
            0
          </span>
          <span className="battery-unit">hr</span>
          <span className="foot-label">Battery life</span>
        </div>
        <div className="load">
          <span className="foot-label" ref={loadRef}>
            Medium load
          </span>
          <svg className="wave" ref={waveRef} viewBox="0 0 84 24" aria-hidden>
            <defs>
              <clipPath id="wave-clip">
                <rect width="84" height="24" />
              </clipPath>
            </defs>
            <g clipPath="url(#wave-clip)">
              <path
                className="wave-line"
                d="M0 12 Q10.5 0 21 12 T42 12 T63 12 T84 12 T105 12 T126 12 T147 12 T168 12"
              />
            </g>
            <circle className="wave-dot" cx="42" cy="12" r="3.2" />
          </svg>
        </div>
      </footer>

      <div className="flow-tip" ref={tipRef} aria-hidden={!hover}>
        <strong>{tipPort?.name}</strong>
        <span ref={tipValueRef} />
      </div>
    </section>
  );
}
