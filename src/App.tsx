import { useRef } from 'react';
import { gsap, useGSAP, SplitText } from './lib/gsap';
import { registerSegment } from './motion/registry';
import { boot, togglePower } from './motion/director';
import { isDemoPlaying, playDemo, stopDemo } from './motion/demo';
import { Nav } from './components/Nav';
import { EnergyFlow } from './components/EnergyFlow';
import { DeviceCard } from './components/DeviceCard';
import { DetailsCard } from './components/DetailsCard';
import { CableCard } from './components/CableCard';
import { ChipCard } from './components/ChipCard';

export function App() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    (_context, contextSafe) => {
      const q = gsap.utils.selector(root);
      let split: SplitText | null = null;

      const unregister = registerSegment('shell', {
        reset() {
          split?.revert();
          split = null;
          gsap.set(q('.app'), { autoAlpha: 0 });
          gsap.set(q('.nav > *'), { autoAlpha: 0 });
          gsap.set(q('.card'), { autoAlpha: 0 });
          gsap.set(q('.card-trace'), { autoAlpha: 0 });
        },
        // The frame lands, the cards rise in reading order, a trace of light runs
        // around each card's edge, and the display titles slide up out of a mask.
        intro() {
          const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
          tl.fromTo(q('.app'), { autoAlpha: 0, scale: 0.965, y: 22 }, { autoAlpha: 1, scale: 1, y: 0, duration: 1.4 }, 0)
            .fromTo(q('.nav > *'), { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.08 }, 0.2)
            .fromTo(
              q('.card'),
              { autoAlpha: 0, y: 30, scale: 0.982 },
              { autoAlpha: 1, y: 0, scale: 1, duration: 1.25, stagger: 0.07 },
              0.28,
            )
            .fromTo(q('.card-trace'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, stagger: 0.07, ease: 'none' }, 0.45)
            .fromTo(
              q('.card-trace'),
              { '--trace': '-40deg' },
              { '--trace': '330deg', duration: 1.7, stagger: 0.07, ease: 'power2.inOut' },
              0.45,
            )
            .to(q('.card-trace'), { autoAlpha: 0, duration: 0.6, stagger: 0.07, ease: 'power1.in' }, 1.6);

          split = SplitText.create(q('.split-title'), { type: 'lines,chars', mask: 'lines' });
          tl.fromTo(split.chars, { yPercent: 120 }, { yPercent: 0, duration: 1.2, stagger: 0.022 }, 0.5);
          tl.call(() => {
            split?.revert();
            split = null;
          });
          return tl;
        },
      });

      const params = new URLSearchParams(window.location.search);
      const zoom = params.get('zoom') !== 'off';

      let alive = true;
      const start = contextSafe!(() => {
        if (!alive) return;
        document.documentElement.removeAttribute('data-booting');
        if (params.has('demo')) playDemo({ zoom });
        else boot();
      });
      Promise.all([document.fonts.ready, document.fonts.load('300 48px "Mona Sans Variable"')]).then(start, start);

      // R replays the boot, P toggles power, D plays the recorded demo, Esc stops it.
      const onKey = contextSafe!((e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
        const key = e.key.toLowerCase();
        if (key === 'escape') stopDemo();
        if (key === 'd') playDemo({ zoom });
        if (isDemoPlaying()) return;
        if (key === 'r') boot();
        if (key === 'p') togglePower();
      });
      window.addEventListener('keydown', onKey);

      return () => {
        alive = false;
        stopDemo();
        unregister();
        window.removeEventListener('keydown', onKey);
      };
    },
    { scope: root },
  );

  return (
    <div className="stage" ref={root}>
      <div className="camera">
        <div className="app">
          <Nav />
          <main className="board">
            <EnergyFlow />
            <DeviceCard />
            <div className="board-row">
              <DetailsCard />
              <CableCard />
              <ChipCard />
            </div>
          </main>
        </div>
      </div>
      <div className="grain" aria-hidden />
    </div>
  );
}
