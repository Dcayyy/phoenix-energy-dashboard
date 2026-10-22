import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Bike, Fan, Laptop, Lamp, Refrigerator, type LucideIcon } from 'lucide-react';
import { gsap } from '../lib/gsap';
import { countTo, fixed, writeCount, type Formatter } from '../motion/count';
import { Toggle } from '../components/Toggle';
import { Card, screenSegment, seeded, useSegment } from './kit';
import './settings.css';

// --- power mode: a rotary dial ---------------------------------------------------------

type Mode = 'eco' | 'balanced' | 'boost';

const MODES: { id: Mode; label: string; angle: number; output: number; runtime: number; fan: number; note: string }[] = [
  { id: 'eco', label: 'Eco', angle: -80, output: 1200, runtime: 18, fan: 24, note: 'Quiet, with the longest runtime. Output is capped at 1,200 W.' },
  { id: 'balanced', label: 'Balanced', angle: 0, output: 1800, runtime: 14, fan: 32, note: 'The everyday mix of power and runtime.' },
  { id: 'boost', label: 'X-Boost', angle: 80, output: 2400, runtime: 9, fan: 46, note: 'The full 2,400 W for heavy tools. The fans work harder.' },
];

/** Ticks every 4° across a 240° sweep, from -120° to +120° around 12 o'clock. */
const TICKS = Array.from({ length: 61 }, (_, i) => -120 + i * 4);
const tickLine = (deg: number, i: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  const r0 = 128;
  const r1 = i % 5 === 0 ? 141 : 136;
  return { x1: 150 + r0 * Math.cos(a), y1: 150 + r0 * Math.sin(a), x2: 150 + r1 * Math.cos(a), y2: 150 + r1 * Math.sin(a) };
};
const labelAt = (deg: number): CSSProperties => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { left: `${50 + 56 * Math.cos(a)}%`, top: `${50 + 56 * Math.sin(a)}%` };
};

const watts: Formatter = (v) => Math.round(v).toLocaleString('en-US');

function PowerModeCard() {
  const [mode, setMode] = useState<Mode>('boost');
  const knobRef = useRef<HTMLDivElement>(null);
  const ticksRef = useRef<SVGGElement>(null);
  const statRefs = useRef<(HTMLElement | null)[]>([]);
  const heroRef = useRef<HTMLDivElement>(null);
  const current = MODES.find((m) => m.id === mode)!;

  /** Ticks light up to wherever the knob is pointing right now. */
  const lightTicks = useCallback(() => {
    const knob = knobRef.current;
    if (!knob) return;
    const angle = Number(gsap.getProperty(knob, 'rotation'));
    ticksRef.current?.querySelectorAll<SVGLineElement>('line').forEach((line, i) => {
      line.classList.toggle('is-lit', TICKS[i] <= angle + 0.5);
    });
  }, []);

  const turnTo = useCallback(
    (m: (typeof MODES)[number], fromAngle?: number) => {
      const [output, runtime, fan] = statRefs.current;
      heroRef.current?.style.setProperty('--fan', `${(0.3 + (46 - m.fan) / 40).toFixed(2)}s`);
      const tl = gsap.timeline();
      tl.fromTo(
        knobRef.current,
        { rotation: fromAngle ?? Number(gsap.getProperty(knobRef.current, 'rotation')) },
        { rotation: m.angle, duration: 1.3, ease: 'elastic.out(1, 0.55)', onUpdate: lightTicks },
        0,
      )
        .add(countTo(output, m.output, { duration: 1, format: watts }), 0)
        .add(countTo(runtime, m.runtime, { duration: 1, format: fixed(0) }), 0.05)
        .add(countTo(fan, m.fan, { duration: 1, format: fixed(0) }), 0.1);
      return tl;
    },
    [lightTicks],
  );

  const choose = (id: Mode) => {
    if (id === mode) return;
    setMode(id);
    turnTo(MODES.find((m) => m.id === id)!);
    gsap.fromTo('.mode-note', { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' });
  };

  useSegment('settings:mode', () => ({
    reset() {
      gsap.set(knobRef.current, { rotation: -140 });
      lightTicks();
      statRefs.current.forEach((el) => writeCount(el, 0, fixed(0)));
    },
    intro() {
      return turnTo(MODES.find((m) => m.id === mode)!, -140);
    },
  }));

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = MODES.findIndex((m) => m.id === mode);
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') choose(MODES[Math.min(i + 1, MODES.length - 1)].id);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') choose(MODES[Math.max(i - 1, 0)].id);
  };

  return (
    <Card className="slot-hero mode-card" label="Power mode">
      <div className="mode-layout" ref={heroRef}>
        <div className="mode-copy">
          <h2 className="display card-title--hero split-title">
            Power
            <br />
            mode
          </h2>
          <p className="mode-note">{current.note}</p>
          <dl className="mode-stats">
            <div>
              <dt>Max output</dt>
              <dd>
                <span className="figure" ref={(el) => void (statRefs.current[0] = el)}>
                  0
                </span>
                <small>W</small>
              </dd>
            </div>
            <div>
              <dt>Runtime</dt>
              <dd>
                <span className="figure" ref={(el) => void (statRefs.current[1] = el)}>
                  0
                </span>
                <small>h</small>
              </dd>
            </div>
            <div>
              <dt>Fan noise</dt>
              <dd>
                <span className="figure" ref={(el) => void (statRefs.current[2] = el)}>
                  0
                </span>
                <small>dB</small>
                <Fan size={16} className="mode-fan" aria-hidden />
              </dd>
            </div>
          </dl>
        </div>

        <div className="dial" role="radiogroup" aria-label="Power mode" tabIndex={0} onKeyDown={onKey}>
          <svg className="dial-ticks" viewBox="0 0 300 300" aria-hidden>
            <g ref={ticksRef}>
              {TICKS.map((deg, i) => (
                <line key={deg} {...tickLine(deg, i)} />
              ))}
            </g>
          </svg>
          {/* The sheen stays put like real light on metal; only the knurled grip and pointer turn. */}
          <span className="dial-face" aria-hidden />
          <div className="dial-knob" ref={knobRef}>
            <span className="dial-grip" aria-hidden />
            <span className="dial-pointer" aria-hidden />
          </div>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={m.id === mode}
              className="dial-label"
              data-mode={m.id}
              style={labelAt(m.angle)}
              onClick={() => choose(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

// --- charge limit: a liquid battery you can drag ------------------------------------------------

const MIN_LIMIT = 50;

function ChargeLimitCard() {
  const [limit, setLimit] = useState(80);
  const batteryRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const scheduleRef = useRef<HTMLDivElement>(null);
  const level = useRef({ v: 0 });
  const dragging = useRef(false);

  const paint = useCallback(() => {
    batteryRef.current?.style.setProperty('--level', `${level.current.v.toFixed(2)}%`);
    writeCount(valueRef.current, level.current.v, fixed(0));
  }, []);

  const flowTo = useCallback(
    (v: number, duration = 0.7) => gsap.to(level.current, { v, duration, ease: 'power3.out', overwrite: true, onUpdate: paint }),
    [paint],
  );

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const v = Math.round(gsap.utils.clamp(MIN_LIMIT, 100, (1 - (e.clientY - rect.top) / rect.height) * 100));
    setLimit(v);
    flowTo(v, 0.35);
  };

  useSegment('settings:limit', () => ({
    reset() {
      level.current.v = 0;
      paint();
      gsap.set(scheduleRef.current?.querySelectorAll('.window') ?? [], { scaleX: 0 });
    },
    intro() {
      return gsap
        .timeline()
        .add(flowTo(limit, 1.8), 0)
        .to(scheduleRef.current?.querySelectorAll('.window') ?? [], { scaleX: 1, duration: 0.9, stagger: 0.15, ease: 'expo.out' }, 0.5);
    },
  }));

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 5 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -5 : 0;
    if (!step) return;
    e.preventDefault();
    const v = gsap.utils.clamp(MIN_LIMIT, 100, limit + step);
    setLimit(v);
    flowTo(v);
  };

  return (
    <Card className="slot-side limit-card" label="Charge limit">
      <h3 className="display card-title split-title">Charge limit</h3>
      <p className="card-note">Charging stops here, which keeps the cells healthy for longer.</p>
      <div className="limit-body">
        <div
          className="battery"
          ref={batteryRef}
          role="slider"
          tabIndex={0}
          aria-label="Charge limit"
          aria-valuemin={MIN_LIMIT}
          aria-valuemax={100}
          aria-valuenow={limit}
          aria-valuetext={`${limit}%`}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => dragging.current && fromPointer(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <span className="battery-cap" aria-hidden />
          <span className="battery-inner" aria-hidden>
            <span className="battery-fill">
              <svg className="wave wave--back" viewBox="0 0 200 20" preserveAspectRatio="none">
                <path d="M0 10 Q25 2 50 10 T100 10 T150 10 T200 10 V20 H0 Z" />
              </svg>
              <svg className="wave wave--front" viewBox="0 0 200 20" preserveAspectRatio="none">
                <path d="M0 10 Q25 18 50 10 T100 10 T150 10 T200 10 V20 H0 Z" />
              </svg>
            </span>
            <span className="battery-line" />
            {[60, 70, 80, 90].map((t) => (
              <span key={t} className="battery-tick" style={{ bottom: `${t}%` }} />
            ))}
          </span>
        </div>
        <div className="limit-readout">
          <span className="figure limit-value">
            <span ref={valueRef}>0</span>%
          </span>
          <span className="kicker">Stop charging at</span>
          <p className="card-note">About 11 hours of runtime at this limit.</p>
        </div>
      </div>

      <div className="schedule" ref={scheduleRef}>
        <span className="kicker">Charging schedule</span>
        <div className="schedule-track">
          <span className="window" style={{ left: `${(1 / 24) * 100}%`, width: `${(5 / 24) * 100}%` }} title="Off-peak 01:00–06:00" />
          <span className="window window--solar" style={{ left: `${(11 / 24) * 100}%`, width: `${(4 / 24) * 100}%` }} title="Solar 11:00–15:00" />
          <span className="schedule-now" style={{ left: `${(15.5 / 24) * 100}%` }} />
        </div>
        <div className="schedule-hours" aria-hidden>
          {['00', '06', '12', '18', '24'].map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
        <ul className="schedule-legend">
          <li>
            <i className="window-key" /> Off-peak grid, 01:00–06:00
          </li>
          <li>
            <i className="window-key window-key--solar" /> Solar, 11:00–15:00
          </li>
        </ul>
      </div>
    </Card>
  );
}

// --- preferences ----------------------------------------------------------------------------------

const PREFS = [
  { id: 'silent', name: 'Silent mode', note: 'Fans stay under 30 dB', on: false },
  { id: 'restart', name: 'Auto restart', note: 'After a power cut', on: true },
  { id: 'backup', name: 'Grid backup', note: 'Switch to the grid below 10%', on: true },
  { id: 'lock', name: 'Child lock', note: 'Lock the front panel', on: false },
];

function PreferencesCard() {
  const [prefs, setPrefs] = useState(() => Object.fromEntries(PREFS.map((p) => [p.id, p.on])));
  const listRef = useRef<HTMLUListElement>(null);

  useSegment('settings:prefs', () => ({
    reset() {
      gsap.set(listRef.current?.querySelectorAll('li') ?? [], { autoAlpha: 0, y: 10 });
    },
    intro() {
      return gsap.to(listRef.current?.querySelectorAll('li') ?? [], { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' });
    },
  }));

  return (
    <Card className="prefs-card" label="Preferences">
      <h3 className="display card-title split-title">Preferences</h3>
      <ul className="prefs" ref={listRef}>
        {PREFS.map((p) => (
          <li key={p.id}>
            <div>
              <strong>{p.name}</strong>
              <span>{p.note}</span>
            </div>
            <Toggle checked={prefs[p.id]} onChange={() => setPrefs((s) => ({ ...s, [p.id]: !s[p.id] }))} label={p.name} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// --- display brightness (steel) ---------------------------------------------------------------------

function DisplayCard() {
  const [value, setValue] = useState(70);
  const trackRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const shown = useRef({ v: 0 });
  const dragging = useRef(false);

  const paint = useCallback(() => {
    trackRef.current?.style.setProperty('--value', `${shown.current.v.toFixed(2)}%`);
    writeCount(valueRef.current, shown.current.v, fixed(0));
  }, []);

  const slideTo = useCallback(
    (v: number, duration = 0.5) => gsap.to(shown.current, { v, duration, ease: 'power3.out', overwrite: true, onUpdate: paint }),
    [paint],
  );

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const v = Math.round(gsap.utils.clamp(0, 100, ((e.clientX - rect.left) / rect.width) * 100));
    setValue(v);
    slideTo(v, 0.25);
  };

  useSegment('settings:display', () => ({
    reset() {
      shown.current.v = 0;
      paint();
    },
    intro() {
      return slideTo(value, 1.4);
    },
  }));

  return (
    <Card className="steel display-card" label="Display">
      <h3 className="display card-title split-title">Display</h3>
      <div className="display-figure">
        <span className="figure display-value">
          <span ref={valueRef}>0</span>%
        </span>
        <span className="card-note">Screen brightness</span>
      </div>
      <div
        className="slider"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Screen brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        onKeyDown={(e) => {
          const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0;
          if (!step) return;
          e.preventDefault();
          const v = gsap.utils.clamp(0, 100, value + step);
          setValue(v);
          slideTo(v);
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <span className="slider-fill" />
        <span className="slider-thumb" />
      </div>
      <p className="card-note">Dims on its own after sunset.</p>
    </Card>
  );
}

// --- connected devices, drawing live power -------------------------------------------------------------

const DEVICES: { name: string; icon: LucideIcon; watts: number }[] = [
  { name: 'Fridge', icon: Refrigerator, watts: 140 },
  { name: 'Laptop', icon: Laptop, watts: 65 },
  { name: 'E-bike charger', icon: Bike, watts: 240 },
  { name: 'Desk lamp', icon: Lamp, watts: 9 },
];

function DevicesCard() {
  const listRef = useRef<HTMLUListElement>(null);
  const wattRefs = useRef<(HTMLElement | null)[]>([]);

  useLayoutEffect(() => {
    // Readings wander a little, the way a real meter does.
    const rnd = seeded(3);
    let call: gsap.core.Tween | null = null;
    const tick = () => {
      DEVICES.forEach((d, i) => {
        const el = wattRefs.current[i];
        if (!el || !el.isConnected || !el.offsetParent) return;
        countTo(el, d.watts * (0.92 + rnd() * 0.16), { duration: 0.8, format: fixed(0) });
      });
      call = gsap.delayedCall(1.8, tick);
    };
    call = gsap.delayedCall(2.5, tick);
    return () => {
      call?.kill();
    };
  }, []);

  useSegment('settings:devices', () => ({
    reset() {
      gsap.set(listRef.current?.querySelectorAll('li') ?? [], { autoAlpha: 0, x: 12 });
      wattRefs.current.forEach((el) => writeCount(el, 0, fixed(0)));
    },
    intro() {
      const tl = gsap.timeline();
      tl.to(listRef.current?.querySelectorAll('li') ?? [], { autoAlpha: 1, x: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' });
      DEVICES.forEach((d, i) => tl.add(countTo(wattRefs.current[i], d.watts, { duration: 1.2, format: fixed(0) }), 0.1 + i * 0.08));
      return tl;
    },
  }));

  const total = DEVICES.reduce((sum, d) => sum + d.watts, 0);
  return (
    <Card className="devices-card" label="Connected devices">
      <h3 className="display card-title split-title">Devices</h3>
      <p className="card-note">{DEVICES.length} connected, about {total} W</p>
      <ul className="devices" ref={listRef}>
        {DEVICES.map((d, i) => {
          const Icon = d.icon;
          return (
            <li key={d.name}>
              <span className="device-icon" aria-hidden>
                <Icon size={14} />
              </span>
              <span className="device-name">{d.name}</span>
              <span className="device-watts">
                <span ref={(el) => void (wattRefs.current[i] = el)}>0</span> W
              </span>
              <span className="device-meter" style={{ '--share': `${(d.watts / 240) * 100}%` } as CSSProperties} aria-hidden />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function SettingsScreen() {
  useSegment('settings', () =>
    screenSegment([
      ['settings:mode', 0],
      ['settings:limit', 0.15],
      ['settings:prefs', 0.3],
      ['settings:display', 0.35],
      ['settings:devices', 0.4],
    ]),
  );

  return (
    <>
      <PowerModeCard />
      <ChargeLimitCard />
      <div className="board-row">
        <PreferencesCard />
        <DisplayCard />
        <DevicesCard />
      </div>
    </>
  );
}
