import { useRef } from 'react';
import { gsap, useGSAP, SplitText } from './lib/gsap';
import { registerSegment } from './motion/registry';
import { boot, togglePower } from './motion/director';
import { isDemoPlaying, playDemo, stopDemo, type SceneName } from './motion/demo';
import { goTo, showScreen } from './motion/screens';
import { SCREENS } from './state/system';
import { Nav } from './components/Nav';
import { EnergyFlow } from './components/EnergyFlow';
import { DeviceCard } from './components/DeviceCard';
import { DetailsCard } from './components/DetailsCard';
import { CableCard } from './components/CableCard';
import { ChipCard } from './components/ChipCard';
import { StatisticsScreen } from './screens/StatisticsScreen';
import { SupportScreen } from './screens/SupportScreen';
import { SettingsScreen } from './screens/SettingsScreen';

/** The dashboard's cards and titles; the other screens animate in through their own transition. */
const DASH = '.board[data-screen="dashboard"]';

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
          showScreen('dashboard');
          gsap.set(q('.app'), { autoAlpha: 0 });
          gsap.set(q('.nav > *'), { autoAlpha: 0 });
          gsap.set(q('.card'), { autoAlpha: 0, clearProps: 'clipPath' });
          gsap.set(q('.card-trace'), { autoAlpha: 0 });
        },
        // The frame lands, the cards rise in reading order, a trace of light runs
        // around each card's edge, and the display titles slide up out of a mask.
        intro() {
          const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
          tl.fromTo(q('.app'), { autoAlpha: 0, scale: 0.965, y: 22 }, { autoAlpha: 1, scale: 1, y: 0, duration: 1.4 }, 0)
            .fromTo(q('.nav > *'), { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.08 }, 0.2)
            .fromTo(
              q(`${DASH} .card`),
              { autoAlpha: 0, y: 30, scale: 0.982 },
              { autoAlpha: 1, y: 0, scale: 1, duration: 1.25, stagger: 0.07 },
              0.28,
            )
            .fromTo(q(`${DASH} .card-trace`), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, stagger: 0.07, ease: 'none' }, 0.45)
            .fromTo(
              q(`${DASH} .card-trace`),
              { '--trace': '-40deg' },
              { '--trace': '330deg', duration: 1.7, stagger: 0.07, ease: 'power2.inOut' },
              0.45,
            )
            .to(q(`${DASH} .card-trace`), { autoAlpha: 0, duration: 0.6, stagger: 0.07, ease: 'power1.in' }, 1.6);

          split = SplitText.create(q(`${DASH} .split-title`), { type: 'lines,chars', mask: 'lines' });
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
      // ?demo plays the full tour; ?demo=statistics,settings plays just those scenes.
      const only = (params.get('demo') || '').split(',').filter(Boolean) as SceneName[];

      let alive = true;
      const start = contextSafe!(() => {
        if (!alive) return;
        document.documentElement.removeAttribute('data-booting');
        if (params.has('demo')) playDemo({ zoom, scenes: only.length ? only : undefined });
        else boot();
      });
      Promise.all([document.fonts.ready, document.fonts.load('300 48px "Mona Sans Variable"')]).then(start, start);

      // R replays the boot, P toggles power, 1-4 switch screens,
      // D plays the recorded tour, Esc stops it.
      const onKey = contextSafe!((e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
        const key = e.key.toLowerCase();
        if (key === 'escape') stopDemo();
        if (key === 'd') playDemo({ zoom });
        if (isDemoPlaying()) return;
        if (key === 'r') boot();
        if (key === 'p') togglePower();
        const screen = SCREENS[Number(key) - 1];
        if (screen) goTo(screen.id);
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
          <main className="screens">
            <div className="board" data-screen="dashboard">
              <EnergyFlow />
              <DeviceCard />
              <div className="board-row">
                <DetailsCard />
                <CableCard />
                <ChipCard />
              </div>
            </div>
            <div className="board" data-screen="statistics">
              <StatisticsScreen />
            </div>
            <div className="board" data-screen="support">
              <SupportScreen />
            </div>
            <div className="board" data-screen="settings">
              <SettingsScreen />
            </div>
            <div className="scanline" aria-hidden />
          </main>
        </div>
      </div>
      <div className="grain" aria-hidden />
    </div>
  );
}
