import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { gsap } from '../lib/gsap';
import { countTo, fixed, writeCount, type Formatter } from '../motion/count';
import { Card, Segmented, screenSegment, seeded, smoothPath, useSegment, useSize } from './kit';
import './statistics.css';

type Period = 'day' | 'week' | 'month' | 'year';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];

type Series = {
  output: number[];
  solar: number[];
  /** Label for each data point, used by the hover readout. */
  names: string[];
  /** Axis labels at fractions of the width. */
  axis: { at: number; text: string }[];
  delta: number;
  versus: string;
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const bell = (x: number, mu: number, width: number) => Math.exp(-((x - mu) ** 2) / width);

/** Plausible, repeatable data: evening peaks, a solar bell, darker winters. */
function buildSeries(period: Period): Series {
  const rnd = seeded({ day: 11, week: 23, month: 37, year: 41 }[period]);
  if (period === 'day') {
    const hours = Array.from({ length: 24 }, (_, h) => h);
    return {
      output: hours.map((h) => 0.7 + 2.4 * bell(h, 8, 5) + 3.6 * bell(h, 19.5, 6) + rnd() * 0.45),
      solar: hours.map((h) => (h < 6 || h > 19 ? 0 : 3.4 * bell(h, 13, 9) + rnd() * 0.25)),
      names: hours.map((h) => `${String(h).padStart(2, '0')}:00`),
      axis: ['00', '04', '08', '12', '16', '20', '23'].map((t) => ({ at: Number(t) / 23, text: t })),
      delta: 8,
      versus: 'vs yesterday',
    };
  }
  if (period === 'week') {
    return {
      output: DAYS.map((_, i) => 52 + 12 * Math.sin(i * 1.1) + rnd() * 9),
      solar: DAYS.map(() => 19 + rnd() * 11),
      names: DAYS,
      axis: DAYS.map((d, i) => ({ at: i / 6, text: d })),
      delta: 12,
      versus: 'vs last week',
    };
  }
  if (period === 'month') {
    const days = Array.from({ length: 30 }, (_, i) => i);
    return {
      output: days.map((i) => 50 + 11 * Math.sin(i / 3.2) + rnd() * 12),
      solar: days.map((i) => 17 + 7 * Math.sin(i / 5 + 1) + rnd() * 5),
      names: days.map((i) => `Oct ${i + 1}`),
      axis: [1, 5, 10, 15, 20, 25, 30].map((d) => ({ at: (d - 1) / 29, text: String(d) })),
      delta: -4,
      versus: 'vs last month',
    };
  }
  return {
    output: MONTHS.map((_, m) => 1500 + 480 * Math.cos(((m + 0.5) / 12) * Math.PI * 2) + rnd() * 140),
    solar: MONTHS.map((_, m) => 380 + 360 * Math.sin(((m - 2) / 12) * Math.PI * 2 + 0.4) + rnd() * 60),
    names: MONTHS,
    axis: MONTHS.filter((_, m) => m % 2 === 0).map((t, i) => ({ at: (i * 2) / 11, text: t })),
    delta: 21,
    versus: 'vs last year',
  };
}

const SAMPLES = 72;
const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

/** Resample any series to a fixed number of points, so every period morphs into every other. */
function resample(values: number[]) {
  return Array.from({ length: SAMPLES }, (_, i) => {
    const t = (i / (SAMPLES - 1)) * (values.length - 1);
    const k = Math.floor(t);
    const at = (j: number) => values[Math.min(Math.max(j, 0), values.length - 1)];
    return Math.max(catmull(at(k - 1), at(k), at(k + 1), at(k + 2), t - k), 0);
  });
}

function niceMax(v: number) {
  const exp = 10 ** Math.floor(Math.log10(v));
  const n = v / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * exp;
}

const kwh: Formatter = (v) => (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1));
const total = (s: Series) => s.output.reduce((a, b) => a + b, 0);

// --- Output chart: the hero -----------------------------------------------

function OutputCard() {
  const [period, setPeriod] = useState<Period>('week');
  const series = useMemo(() => buildSeries(period), [period]);
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 600, h: 260 });
  const [hover, setHover] = useState<number | null>(null);
  const model = useRef<{ output: number[]; solar: number[]; max: number; reveal: number }>(null!);
  if (!model.current) {
    const week = buildSeries('week');
    model.current = {
      output: resample(week.output),
      solar: resample(week.solar),
      max: niceMax(Math.max(...week.output, ...week.solar) * 1.1),
      reveal: 0,
    };
  }
  const seriesRef = useRef(series);
  seriesRef.current = series;

  useSize(boxRef, (w, h) => setSize({ w, h }));

  const pad = { l: 38, r: 14, t: 14, b: 28 };
  const iw = Math.max(size.w - pad.l - pad.r, 10);
  const ih = Math.max(size.h - pad.t - pad.b, 10);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const m = model.current;
    const x = (i: number) => pad.l + (i / (SAMPLES - 1)) * iw;
    const y = (v: number) => pad.t + ih - (v / m.max) * ih;
    const out = m.output.map((v, i) => ({ x: x(i), y: y(v) }));
    const sun = m.solar.map((v, i) => ({ x: x(i), y: y(v) }));
    const line = smoothPath(out);
    const base = pad.t + ih;
    svg.querySelector('.chart-line')?.setAttribute('d', line);
    svg.querySelector('.chart-glow')?.setAttribute('d', line);
    svg.querySelector('.chart-area')?.setAttribute('d', `${line} L${x(SAMPLES - 1)},${base} L${x(0)},${base} Z`);
    svg.querySelector('.chart-solar')?.setAttribute('d', smoothPath(sun));
    svg.querySelector('#chart-reveal rect')?.setAttribute('width', String(pad.l + m.reveal * (iw + pad.r)));
    const end = out[out.length - 1];
    const dot = svg.querySelector('.chart-now');
    dot?.setAttribute('transform', `translate(${end.x.toFixed(1)} ${end.y.toFixed(1)})`);
    if (dot instanceof SVGElement) dot.style.opacity = m.reveal > 0.98 ? '1' : '0';
    svg.querySelectorAll<SVGTextElement>('.chart-ylabel').forEach((t, i) => {
      const value = (m.max * (2 - i)) / 2;
      t.textContent = value >= 100 ? Math.round(value).toLocaleString('en-US') : String(Math.round(value * 10) / 10);
    });
  }, [iw, ih, pad.l, pad.t, pad.r]);

  useLayoutEffect(draw, [draw, size]);

  // Period switch: every sample glides to its new value, and the axis rescales with it.
  const changePeriod = (next: Period) => {
    if (next === period) return;
    const s = buildSeries(next);
    const to = { output: resample(s.output), solar: resample(s.solar) };
    const m = model.current;
    const from = { output: [...m.output], solar: [...m.solar], max: m.max };
    const targetMax = niceMax(Math.max(...s.output, ...s.solar) * 1.1);
    const tween = { p: 0 };
    gsap.killTweensOf(tween);
    gsap.to(tween, {
      p: 1,
      duration: 1.1,
      ease: 'power3.inOut',
      onUpdate: () => {
        for (let i = 0; i < SAMPLES; i++) {
          m.output[i] = from.output[i] + (to.output[i] - from.output[i]) * tween.p;
          m.solar[i] = from.solar[i] + (to.solar[i] - from.solar[i]) * tween.p;
        }
        m.max = from.max + (targetMax - from.max) * tween.p;
        draw();
      },
    });
    gsap.fromTo('.chart-axis', { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.6, delay: 0.35, ease: 'power2.out' });
    countTo(totalRef.current, total(s), { duration: 1.1, format: kwh });
    setHover(null);
    setPeriod(next);
  };

  useSegment('stats:chart', () => ({
    reset() {
      model.current.reveal = 0;
      writeCount(totalRef.current, 0, kwh);
      draw();
    },
    intro() {
      return gsap
        .timeline()
        .to(model.current, { reveal: 1, duration: 1.8, ease: 'power2.inOut', onUpdate: draw }, 0.1)
        .add(countTo(totalRef.current, total(seriesRef.current), { duration: 1.8, format: kwh }), 0.1)
        .fromTo('.chart-legend > *', { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, stagger: 0.08, duration: 0.6 }, 0.4);
    },
  }));

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = gsap.utils.clamp(0, 1, (e.clientX - rect.left) / rect.width);
    const n = series.output.length;
    const index = Math.round(frac * (n - 1));
    setHover(index);
    const box = boxRef.current;
    const tip = tipRef.current;
    if (!box || !tip) return;
    const scale = box.getBoundingClientRect().width / box.offsetWidth || 1;
    const px = pad.l + (index / (n - 1)) * iw;
    const right = px > box.offsetWidth - 180;
    gsap.to(tip, { x: right ? px - 158 : px + 14, y: (e.clientY - box.getBoundingClientRect().top) / scale - 30, duration: 0.25, ease: 'power3' });
  };

  const hoverX = hover === null ? 0 : pad.l + (hover / (series.output.length - 1)) * iw;
  const m = model.current;
  const yOf = (v: number) => pad.t + ih - (v / m.max) * ih;
  const delta = series.delta;

  return (
    <Card className="slot-hero stats-hero" label="Energy statistics">
      <div className="card-head stats-head">
        <div>
          <h2 className="display card-title--hero split-title">Statistics</h2>
          <div className="stats-total">
            <span className="kicker">Total output</span>
            <span className="figure stats-total-value">
              <span ref={totalRef}>0</span>
              <small>kWh</small>
            </span>
            <span className="stats-delta">
              {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(delta)}% {series.versus}
            </span>
          </div>
        </div>
        <div className="stats-controls">
          <Segmented options={PERIODS} value={period} onChange={changePeriod} label="Period" />
          <div className="chart-legend">
            <span>
              <i className="key key--output" /> Output
            </span>
            <span>
              <i className="key key--solar" /> Solar input
            </span>
          </div>
        </div>
      </div>

      <div className="chart-box" ref={boxRef}>
        <svg ref={svgRef} className="chart" viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden>
          <defs>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff6a2b" stopOpacity="0.38" />
              <stop offset="0.7" stopColor="#ff6a2b" stopOpacity="0.06" />
              <stop offset="1" stopColor="#ff6a2b" stopOpacity="0" />
            </linearGradient>
            <clipPath id="chart-reveal">
              <rect x="0" y="0" width="0" height={size.h} />
            </clipPath>
            <filter id="chart-blur" x="-5%" y="-30%" width="110%" height="160%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <line className="chart-grid" x1={pad.l} x2={size.w - pad.r} y1={pad.t + (ih * i) / 2} y2={pad.t + (ih * i) / 2} />
              <text className="chart-ylabel" x={pad.l - 10} y={pad.t + (ih * i) / 2 + 4} textAnchor="end" />
            </g>
          ))}
          <g className="chart-axis">
            {series.axis.map((a) => (
              <text key={a.text} x={pad.l + a.at * iw} y={size.h - 8} textAnchor="middle">
                {a.text}
              </text>
            ))}
          </g>
          <g clipPath="url(#chart-reveal)">
            <path className="chart-area" />
            <path className="chart-solar" />
            <path className="chart-glow" filter="url(#chart-blur)" />
            <path className="chart-line" />
          </g>
          {hover !== null && (
            <g className="chart-cross">
              <line x1={hoverX} x2={hoverX} y1={pad.t} y2={pad.t + ih} />
              <circle cx={hoverX} cy={yOf(series.solar[hover])} r="4" className="cross-solar" />
              <circle cx={hoverX} cy={yOf(series.output[hover])} r="5" className="cross-output" />
            </g>
          )}
          <g className="chart-now">
            <circle r="10" className="now-ring" />
            <circle r="4.5" className="now-dot" />
          </g>
          <rect
            className="chart-hit"
            x={pad.l}
            y={pad.t}
            width={iw}
            height={ih}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        <div className="chart-tip" ref={tipRef} data-show={hover !== null}>
          {hover !== null && (
            <>
              <strong>{series.names[hover]}</strong>
              <span>
                <i className="key key--output" /> Output {kwh(series.output[hover])} kWh
              </span>
              <span>
                <i className="key key--solar" /> Solar {kwh(series.solar[hover])} kWh
              </span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// --- Port share: radial bars ------------------------------------------------

const SHARES = [
  { name: 'Main AC', share: 48 },
  { name: 'Sec-AC', share: 22 },
  { name: 'USB-C 1', share: 12 },
  { name: 'USB-C 2', share: 11 },
  { name: 'USB-A', share: 7 },
];
const RING_R = [116, 98, 80, 62, 44];
/** A ring sweeps 270°, starting at 12 o'clock; 100% of output fills it. */
function ringPath(r: number) {
  const a0 = -Math.PI / 2;
  const a1 = a0 + (Math.PI * 3) / 2;
  const p = (a: number) => `${(150 + r * Math.cos(a)).toFixed(2)} ${(150 + r * Math.sin(a)).toFixed(2)}`;
  return `M${p(a0)} A${r} ${r} 0 1 1 ${p(a1)}`;
}

function PortShareCard() {
  const svgRef = useRef<SVGSVGElement>(null);
  const centerRef = useRef<HTMLSpanElement>(null);
  const today = useMemo(() => total(buildSeries('day')), []);

  useSegment('stats:ports', () => ({
    reset() {
      const q = gsap.utils.selector(svgRef);
      gsap.set(q('.ring-value'), { strokeDasharray: '0 200', autoAlpha: 0 });
      gsap.set(q('.ring-label'), { autoAlpha: 0, x: 8 });
      writeCount(centerRef.current, 0, fixed(1));
    },
    intro() {
      const q = gsap.utils.selector(svgRef);
      const tl = gsap.timeline();
      q('.ring-value').forEach((el, i) => {
        tl.set(el, { autoAlpha: 1 }, i * 0.1).to(
          el,
          { strokeDasharray: `${SHARES[i].share * 0.75} 200`, duration: 1.4, ease: 'power3.out' },
          i * 0.1,
        );
      });
      tl.to(q('.ring-label'), { autoAlpha: 1, x: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out' }, 0.2).add(
        countTo(centerRef.current, today, { duration: 1.6, format: fixed(1) }),
        0,
      );
      return tl;
    },
  }));

  return (
    <Card className="slot-side share-card" label="Output by port">
      <div className="card-head">
        <div>
          <h3 className="display card-title split-title">Port share</h3>
          <p className="card-note">Share of output this week</p>
        </div>
      </div>
      <div className="share-body">
        <div className="share-chart">
          <svg ref={svgRef} viewBox="0 0 300 300" aria-hidden>
            {RING_R.map((r, i) => (
              <g key={r}>
                <path d={ringPath(r)} pathLength={75} className="ring-track" />
                <path d={ringPath(r)} pathLength={75} className="ring-value" />
                <text x="140" y={150 - r + 4} textAnchor="end" className="ring-label">
                  {SHARES[i].name} <tspan className="ring-pct">{SHARES[i].share}%</tspan>
                </text>
              </g>
            ))}
          </svg>
          <div className="share-center">
            <span className="figure share-value">
              <span ref={centerRef}>0</span>
            </span>
            <span className="kicker">kWh today</span>
          </div>
        </div>
        <dl className="share-facts">
          <div>
            <dt>Peak hour</dt>
            <dd>19:00</dd>
          </div>
          <div>
            <dt>Efficiency</dt>
            <dd>94.6%</dd>
          </div>
          <div>
            <dt>Busiest port</dt>
            <dd>Main AC</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

// --- Peak hours heatmap ---------------------------------------------------------

const HEAT = (() => {
  const rnd = seeded(5);
  return DAYS.map((_, d) =>
    Array.from({ length: 24 }, (_, h) => {
      const weekend = d >= 5 ? 0.35 : 0;
      const v = 0.15 + 0.55 * bell(h, 19.5, 7) + 0.3 * bell(h, 8, 4) + weekend * bell(h, 13, 12) + rnd() * 0.18;
      return Math.min(4, Math.floor(v * 4.6));
    }),
  );
})();

function PeakHoursCard() {
  const gridRef = useRef<SVGSVGElement>(null);
  // Tall cells: the card has height to spare, and pills read well at this size.
  const cell = 9;
  const tall = 16;
  const gap = 2.4;
  const left = 14;

  useSegment('stats:heat', () => ({
    reset() {
      gsap.set(gridRef.current?.querySelectorAll('.heat-cell') ?? [], { scale: 0, transformOrigin: '50% 50%' });
    },
    intro() {
      return gsap.to(gridRef.current?.querySelectorAll('.heat-cell') ?? [], {
        scale: 1,
        duration: 0.5,
        ease: 'back.out(2.2)',
        // A ripple out from the Thursday-evening peak.
        stagger: { grid: [7, 24], from: [0.8, 0.5], amount: 1.1 },
      });
    },
  }));

  return (
    <Card className="heat-card" label="Peak hours">
      <h3 className="display card-title split-title">Peak hours</h3>
      <p className="card-note">Busiest 18:00–21:00</p>
      <svg ref={gridRef} className="heat" viewBox={`0 0 ${left + 24 * (cell + gap)} ${7 * (tall + gap) + 14}`} aria-hidden>
        {DAYS.map((day, d) => (
          <text key={day} x="0" y={d * (tall + gap) + tall / 2 + 2.5} className="heat-day">
            {day[0]}
          </text>
        ))}
        {HEAT.map((row, d) =>
          row.map((v, h) => (
            <rect
              key={`${d}-${h}`}
              className="heat-cell"
              data-level={v}
              x={left + h * (cell + gap)}
              y={d * (tall + gap)}
              width={cell}
              height={tall}
              rx="2.6"
            >
              <title>{`${DAYS[d]} ${String(h).padStart(2, '0')}:00`}</title>
            </rect>
          )),
        )}
        {[0, 6, 12, 18].map((h) => (
          <text key={h} x={left + h * (cell + gap)} y={7 * (tall + gap) + 11} className="heat-hour">
            {String(h).padStart(2, '0')}
          </text>
        ))}
      </svg>
      <div className="heat-legend" aria-hidden>
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((v) => (
          <i key={v} data-level={v} />
        ))}
        <span>More</span>
      </div>
    </Card>
  );
}

// --- Solar: the sun travels its arc ------------------------------------------------

const SUNRISE = 7.2;
const SUNSET = 18.07;
const NOW = 15.5;

function SolarCard() {
  const svgRef = useRef<SVGSVGElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const solarToday = useMemo(() => buildSeries('day').solar.reduce((a, b) => a + b, 0), []);
  const sun = useRef({ t: 0 });

  const place = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const angle = Math.PI * (1 - sun.current.t);
    const x = 120 + 96 * Math.cos(angle);
    const y = 104 - 96 * Math.sin(angle);
    svg.querySelector('.sun')?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    svg.querySelector('.sun-path')?.setAttribute('stroke-dasharray', `${(sun.current.t * 100).toFixed(2)} 200`);
  }, []);

  useSegment('stats:solar', () => ({
    reset() {
      sun.current.t = 0;
      place();
      writeCount(valueRef.current, 0, fixed(1));
      gsap.set(svgRef.current?.querySelector('.sun-track') ?? [], { autoAlpha: 0 });
    },
    intro() {
      const frac = (NOW - SUNRISE) / (SUNSET - SUNRISE);
      return gsap
        .timeline()
        .to(svgRef.current?.querySelector('.sun-track') ?? [], { autoAlpha: 1, duration: 0.8, ease: 'power2.out' }, 0)
        .to(sun.current, { t: frac, duration: 2, ease: 'power3.inOut', onUpdate: place }, 0.3)
        .add(countTo(valueRef.current, solarToday, { duration: 2, format: fixed(1) }), 0.3);
    },
  }));

  return (
    <Card className="steel solar-card" label="Solar today">
      <h3 className="display card-title split-title">Solar</h3>
      <svg ref={svgRef} className="sun-arc" viewBox="0 0 240 122" aria-hidden>
        <path d="M24 104 A96 96 0 0 1 216 104" pathLength={100} className="sun-track" />
        <path d="M24 104 A96 96 0 0 1 216 104" pathLength={100} className="sun-path" />
        <line x1="8" x2="232" y1="104" y2="104" className="sun-horizon" />
        <g className="sun">
          <circle r="16" className="sun-halo" />
          <circle r="8" className="sun-disc" />
        </g>
        <text x="24" y="119" textAnchor="middle" className="sun-time">
          07:12
        </text>
        <text x="216" y="119" textAnchor="middle" className="sun-time">
          18:04
        </text>
      </svg>
      <div className="solar-foot">
        <span className="figure solar-value">
          <span ref={valueRef}>0</span>
          <small>kWh</small>
        </span>
        <span className="kicker">Harvested today</span>
      </div>
    </Card>
  );
}

// --- Savings: twelve months, this one lit --------------------------------------------------

const SAVED = [142, 131, 120, 108, 96, 88, 91, 99, 127, 184, 0, 0];
const THIS_MONTH = 9;

function SavingsCard() {
  const barsRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const top = Math.max(...SAVED);

  useSegment('stats:savings', () => ({
    reset() {
      gsap.set(barsRef.current?.querySelectorAll('.bar-fill') ?? [], { scaleY: 0 });
      writeCount(valueRef.current, 0, fixed(0));
    },
    intro() {
      return gsap
        .timeline()
        .to(barsRef.current?.querySelectorAll('.bar-fill') ?? [], {
          scaleY: 1,
          duration: 0.9,
          ease: 'expo.out',
          stagger: 0.05,
        })
        .add(countTo(valueRef.current, SAVED[THIS_MONTH], { duration: 1.5, format: fixed(0) }), 0.1);
    },
  }));

  return (
    <Card className="savings-card" label="Savings">
      <h3 className="display card-title split-title">Savings</h3>
      <div className="savings-figure">
        <span className="figure savings-value">
          €<span ref={valueRef}>0</span>
        </span>
        <span className="card-note">saved this month against grid power</span>
      </div>
      <div className="bars" ref={barsRef}>
        {SAVED.map((v, i) => (
          <div key={MONTHS[i]} className="bar" data-current={i === THIS_MONTH || undefined} title={`${MONTHS[i]}: €${v}`}>
            <span className="bar-fill" style={{ height: `${Math.max((v / top) * 100, 4)}%` }} />
            <span className="bar-label">{MONTHS[i][0]}</span>
          </div>
        ))}
      </div>
      <p className="card-note savings-co2">92 kg of CO₂ avoided</p>
    </Card>
  );
}

export function StatisticsScreen() {
  useSegment('statistics', () =>
    screenSegment([
      ['stats:chart', 0],
      ['stats:ports', 0.15],
      ['stats:heat', 0.3],
      ['stats:solar', 0.35],
      ['stats:savings', 0.45],
    ]),
  );

  return (
    <>
      <OutputCard />
      <PortShareCard />
      <div className="board-row">
        <PeakHoursCard />
        <SolarCard />
        <SavingsCard />
      </div>
    </>
  );
}
