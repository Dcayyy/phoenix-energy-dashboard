import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Check, Cpu, Loader, ScanLine, SendHorizontal } from 'lucide-react';
import { gsap } from '../lib/gsap';
import { countTo, fixed, writeCount } from '../motion/count';
import { Card, screenSegment, seeded, useSegment } from './kit';
import './support.css';

// --- the diagnostics run, shared by the cards on this screen ---------------------

type Phase = 'idle' | 'running' | 'done';
type Step = () => gsap.core.Animation;

const run = {
  phase: 'idle' as Phase,
  listeners: new Set<() => void>(),
  steps: {} as { scan?: Step; checks?: Step; ask?: Step; reply?: Step },
  set(phase: Phase) {
    run.phase = phase;
    run.listeners.forEach((l) => l());
  },
};

const subscribe = (l: () => void) => {
  run.listeners.add(l);
  return () => {
    run.listeners.delete(l);
  };
};
const usePhase = () => useSyncExternalStore(subscribe, () => run.phase);

/** One check, three cards: the cells are scanned, the systems tick off, Mira reports back. */
export function runDiagnostics(fromChat = false) {
  if (run.phase === 'running') return null;
  run.set('running');
  const tl = gsap.timeline({ onComplete: () => run.set('done') });
  if (fromChat && run.steps.ask) tl.add(run.steps.ask(), 0);
  tl.add(run.steps.scan?.() ?? gsap.timeline(), fromChat ? 0.5 : 0);
  tl.add(run.steps.checks?.() ?? gsap.timeline(), '<0.3');
  tl.add(run.steps.reply?.() ?? gsap.timeline(), '>-0.3');
  return tl;
}

// --- battery cell scan: the hero -----------------------------------------------------

const COLS = 24;
const ROWS = 4;
const CELLS = (() => {
  const rnd = seeded(19);
  return Array.from({ length: COLS * ROWS }, (_, i) => ({
    charge: 82 + rnd() * 16,
    // Two cells drift a little, enough to flag, not enough to worry.
    watch: i === 37 || i === 82,
  }));
})();

function CellScanCard() {
  const phase = usePhase();
  const gridRef = useRef<HTMLDivElement>(null);
  const beamRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const statRefs = useRef<(HTMLElement | null)[]>([]);

  useLayoutEffect(() => {
    run.steps.scan = () => {
      const grid = gridRef.current;
      const cells = Array.from(grid?.querySelectorAll<HTMLElement>('.cell') ?? []);
      cells.forEach((c) => (c.dataset.state = 'idle'));
      const sweep = { p: 0 };
      let column = -1;
      const [avg, spread, health] = statRefs.current;
      // Readings start from zero and settle as the beam reads the cells.
      writeCount(avg, 0, fixed(2));
      writeCount(spread, 0, fixed(2));
      writeCount(health, 0, fixed(0));
      return gsap
        .timeline()
        .set(beamRef.current, { autoAlpha: 1, left: '0%' })
        .to(sweep, {
          p: 1,
          duration: 4.2,
          ease: 'none',
          onUpdate: () => {
            gsap.set(beamRef.current, { left: `${sweep.p * 100}%` });
            const reached = Math.min(Math.floor(sweep.p * COLS), COLS - 1);
            while (column < reached) {
              column++;
              for (let r = 0; r < ROWS; r++) {
                const i = r * COLS + column;
                const cell = cells[i];
                if (!cell) continue;
                cell.dataset.state = 'hot';
                gsap.delayedCall(0.28 + r * 0.03, () => {
                  cell.dataset.state = CELLS[i].watch ? 'watch' : 'ok';
                });
              }
              writeCount(countRef.current, (column + 1) * ROWS, fixed(0));
            }
          },
        })
        .to(beamRef.current, { autoAlpha: 0, duration: 0.3 })
        .add(countTo(avg, 3.31, { duration: 1, format: fixed(2) }), 0.6)
        .add(countTo(spread, 0.02, { duration: 1, format: fixed(2) }), 1.2)
        .add(countTo(health, 98, { duration: 1.4, format: fixed(0) }), 3.4);
    };
    return () => {
      delete run.steps.scan;
    };
  }, []);

  useSegment('support:cells', () => ({
    reset() {
      run.set('idle');
      gridRef.current?.querySelectorAll<HTMLElement>('.cell').forEach((c) => (c.dataset.state = 'idle'));
      gsap.set(gridRef.current?.querySelectorAll('.cell') ?? [], { scale: 0.4, autoAlpha: 0 });
      gsap.set(beamRef.current, { autoAlpha: 0 });
      writeCount(countRef.current, 0, fixed(0));
    },
    intro() {
      return gsap.to(gridRef.current?.querySelectorAll('.cell') ?? [], {
        scale: 1,
        autoAlpha: 1,
        duration: 0.5,
        ease: 'back.out(2)',
        stagger: { grid: [ROWS, COLS], from: 'start', amount: 0.9 },
      });
    },
  }));

  const label = phase === 'running' ? 'Checking…' : phase === 'done' ? 'Run again' : 'Run check';
  return (
    <Card className="slot-hero scan-card" label="Battery diagnostics">
      <div className="card-head">
        <div>
          <h2 className="display card-title--hero split-title">Diagnostics</h2>
          <p className="card-note">{phase === 'done' ? 'Checked just now' : 'Last full check 3 days ago'}</p>
        </div>
        <button type="button" className="pill scan-run" onClick={() => runDiagnostics()} disabled={phase === 'running'}>
          {phase === 'running' ? <Loader size={14} className="spin" aria-hidden /> : <ScanLine size={14} aria-hidden />}
          {label}
        </button>
      </div>

      <div className="cells-wrap">
        <div className="cells" ref={gridRef} style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
          {CELLS.map((c, i) => (
            <i key={i} className="cell" data-state="idle" style={{ '--charge': `${c.charge}%` } as CSSProperties} />
          ))}
        </div>
        <div className="scan-beam" ref={beamRef} aria-hidden />
      </div>

      <dl className="scan-stats">
        <div>
          <dt>Cells checked</dt>
          <dd>
            <span ref={countRef}>0</span> / 96
          </dd>
        </div>
        <div>
          <dt>Average</dt>
          <dd>
            <span
              ref={(el) => {
                statRefs.current[0] = el;
              }}
            >
              3.31
            </span>{' '}
            V
          </dd>
        </div>
        <div>
          <dt>Spread</dt>
          <dd>
            <span
              ref={(el) => {
                statRefs.current[1] = el;
              }}
            >
              0.02
            </span>{' '}
            V
          </dd>
        </div>
        <div>
          <dt>Health</dt>
          <dd>
            <span
              ref={(el) => {
                statRefs.current[2] = el;
              }}
            >
              98
            </span>
            %
          </dd>
        </div>
      </dl>
    </Card>
  );
}

// --- technician chat ----------------------------------------------------------------------

type Message = { id: number; from: 'agent' | 'me'; text: string };

const OPENING: Message[] = [
  { id: 1, from: 'agent', text: "Hi, I'm Mira from Phoenix support. Your Zeus-X checked in a minute ago." },
  { id: 2, from: 'agent', text: 'Want me to run a full diagnostic on it?' },
];

function ChatCard() {
  const phase = usePhase();
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const shown = useRef(0);

  // Each new bubble rises in; the list keeps the newest at the bottom.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const bubbles = list.querySelectorAll('.bubble');
    if (bubbles.length > shown.current) {
      gsap.fromTo(
        Array.from(bubbles).slice(shown.current),
        { autoAlpha: 0, y: 14, scale: 0.96 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.8)', stagger: 0.1 },
      );
    }
    shown.current = bubbles.length;
    list.scrollTop = list.scrollHeight;
  }, [messages, typing]);

  const say = (message: Message, typeFor = 0.9) =>
    gsap
      .timeline()
      .call(() => setTyping(true))
      .call(() => {
        setTyping(false);
        setMessages((m) => [...m, message]);
      }, [], typeFor);

  useLayoutEffect(() => {
    run.steps.ask = () => gsap.timeline().call(() => setMessages((m) => [...m, { id: 10, from: 'me', text: 'Run diagnostics' }]));
    run.steps.reply = () =>
      say(
        {
          id: 11,
          from: 'agent',
          text: 'Done. All 96 cells are balanced and battery health is 98%. One firmware update is waiting for you.',
        },
        1.2,
      );
    return () => {
      delete run.steps.ask;
      delete run.steps.reply;
    };
  }, []);

  useSegment('support:chat', () => ({
    reset() {
      shown.current = 0;
      setMessages([]);
      setTyping(false);
    },
    intro() {
      return gsap.timeline().add(say(OPENING[0], 0.8), 0.2).add(say(OPENING[1], 0.7), '+=0.2');
    },
  }));

  return (
    <Card className="slot-side chat-card" label="Support chat">
      <div className="card-head">
        <h3 className="display card-title split-title">Support</h3>
        <span className="chat-status">
          <i className="status-dot" data-tone="live" /> Online
        </span>
      </div>
      <div className="agent">
        <span className="agent-avatar" aria-hidden>
          M
        </span>
        <div>
          <strong>Mira</strong>
          <span>Phoenix support, replies in minutes</span>
        </div>
      </div>
      <div className="chat-list" ref={listRef} aria-live="polite">
        {messages.map((m) => (
          <p key={m.id} className="bubble" data-from={m.from}>
            {m.text}
          </p>
        ))}
        {typing && (
          <p className="bubble bubble--typing" data-from="agent" aria-label="Mira is typing">
            <i />
            <i />
            <i />
          </p>
        )}
      </div>
      <div className="chips" data-hidden={phase !== 'idle' || messages.length < 2 || undefined}>
        <button type="button" className="chip" onClick={() => runDiagnostics(true)}>
          Run diagnostics
        </button>
        <button type="button" className="chip">
          Book a service
        </button>
      </div>
      <div className="composer">
        <span>Write a message</span>
        <button type="button" className="composer-send" aria-label="Send">
          <SendHorizontal size={15} />
        </button>
      </div>
    </Card>
  );
}

// --- system checks ---------------------------------------------------------------------------

const SYSTEMS = [
  { name: 'Inverter', result: 'OK' },
  { name: 'Thermal', result: '34 °C' },
  { name: 'Ports', result: '6 of 6' },
  { name: 'Firmware', result: 'Update ready', warn: true },
];

function SystemsCard() {
  const listRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    run.steps.checks = () => {
      const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('li') ?? []);
      const tl = gsap.timeline();
      rows.forEach((row, i) => {
        tl.call(() => (row.dataset.state = 'checking'), [], i * 0.95).call(
          () => (row.dataset.state = SYSTEMS[i].warn ? 'warn' : 'ok'),
          [],
          i * 0.95 + 0.8,
        );
      });
      return tl;
    };
    return () => {
      delete run.steps.checks;
    };
  }, []);

  useSegment('support:systems', () => ({
    reset() {
      listRef.current?.querySelectorAll<HTMLElement>('li').forEach((li) => (li.dataset.state = 'idle'));
      gsap.set(listRef.current?.querySelectorAll('li') ?? [], { autoAlpha: 0, x: -10 });
    },
    intro() {
      return gsap.to(listRef.current?.querySelectorAll('li') ?? [], {
        autoAlpha: 1,
        x: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'power3.out',
      });
    },
  }));

  return (
    <Card className="systems-card" label="System checks">
      <h3 className="display card-title split-title">Systems</h3>
      <ul className="systems" ref={listRef}>
        {SYSTEMS.map((s) => (
          <li key={s.name} data-state="idle">
            <span className="system-mark" aria-hidden>
              <Loader size={13} className="spin" />
              <Check size={13} strokeWidth={2.6} />
            </span>
            <span className="system-name">{s.name}</span>
            <span className="system-result">{s.result}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// --- firmware update ------------------------------------------------------------------------

function FirmwareCard() {
  const [state, setState] = useState<'ready' | 'installing' | 'done'>('ready');
  const ringRef = useRef<SVGCircleElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  const install = () => {
    if (state !== 'ready') return;
    setState('installing');
    const p = { v: 0 };
    gsap.to(p, {
      v: 100,
      duration: 3,
      ease: 'power2.inOut',
      onUpdate: () => {
        ringRef.current?.setAttribute('stroke-dasharray', `${p.v.toFixed(2)} 200`);
        writeCount(pctRef.current, p.v, fixed(0));
      },
      onComplete: () => setState('done'),
    });
  };

  useSegment('support:firmware', () => ({
    reset() {
      setState('ready');
      ringRef.current?.setAttribute('stroke-dasharray', '0 200');
      writeCount(pctRef.current, 0, fixed(0));
    },
  }));

  return (
    <Card className="firmware-card" label="Firmware">
      <h3 className="display card-title split-title">Firmware</h3>
      <div className="firmware-body" data-state={state}>
        <div className="fw-ring">
          <svg viewBox="0 0 80 80" aria-hidden>
            <circle cx="40" cy="40" r="34" pathLength={100} className="fw-track" />
            <circle ref={ringRef} cx="40" cy="40" r="34" pathLength={100} className="fw-value" strokeDasharray="0 200" />
          </svg>
          <span className="fw-center">
            {state === 'ready' ? <Cpu size={20} aria-hidden /> : state === 'done' ? <Check size={22} aria-hidden /> : null}
            <span className="fw-pct" hidden={state !== 'installing'}>
              <span ref={pctRef}>0</span>%
            </span>
          </span>
        </div>
        <div className="fw-text">
          <strong>{state === 'done' ? 'Up to date' : state === 'installing' ? 'Installing 4.3.0' : '4.3.0 is ready'}</strong>
          <span>{state === 'done' ? 'Version 4.3.0' : 'Running 4.2.0'}</span>
        </div>
      </div>
      <button type="button" className="pill pill--small fw-button" onClick={install} disabled={state !== 'ready'}>
        {state === 'done' ? 'Installed' : state === 'installing' ? 'Installing…' : 'Update'}
      </button>
    </Card>
  );
}

// --- service interval (steel) ----------------------------------------------------------------

function ServiceCard() {
  const daysRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);

  useSegment('support:service', () => ({
    reset() {
      writeCount(daysRef.current, 0, fixed(0));
      gsap.set(barRef.current, { scaleX: 0 });
    },
    intro() {
      return gsap
        .timeline()
        .add(countTo(daysRef.current, 142, { duration: 1.4, format: fixed(0) }), 0)
        .to(barRef.current, { scaleX: 1, duration: 1.4, ease: 'expo.out' }, 0.1);
    },
  }));

  return (
    <Card className="steel service-card" label="Service">
      <h3 className="display card-title split-title">Service</h3>
      <div className="service-figure">
        <span className="figure service-days">
          <span ref={daysRef}>0</span>
        </span>
        <span className="card-note">days until the next service</span>
      </div>
      <div className="service-bar" aria-hidden>
        <span ref={barRef} />
      </div>
      <p className="card-note">Warranty until March 2029</p>
    </Card>
  );
}

export function SupportScreen() {
  useSegment('support', () =>
    screenSegment([
      ['support:cells', 0],
      ['support:chat', 0.2],
      ['support:systems', 0.3],
      ['support:firmware', 0.35],
      ['support:service', 0.4],
    ]),
  );

  return (
    <>
      <CellScanCard />
      <ChatCard />
      <div className="board-row">
        <SystemsCard />
        <FirmwareCard />
        <ServiceCard />
      </div>
    </>
  );
}
