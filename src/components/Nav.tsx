import { useLayoutEffect, useRef } from 'react';
import { Bell, LayoutGrid } from 'lucide-react';
import { gsap } from '../lib/gsap';
import { goTo } from '../motion/screens';
import { SCREENS, useSystem } from '../state/system';
import './nav.css';

function LogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M3.4 17.2 10.4 2.6l2.3 4.8-4.8 9.8Z" fill="currentColor" />
      <path d="m11.2 17.2 3.5-7.2 3.6 7.2Z" fill="var(--ember)" />
    </svg>
  );
}

export function Nav() {
  const screen = useSystem((s) => s.screen);
  const active = SCREENS.findIndex((s) => s.id === screen);
  const tabsRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const place = (animate: boolean) => {
      const tab = tabsRef.current?.children[active] as HTMLElement | undefined;
      if (!tab || !markRef.current) return;
      const x = tab.offsetLeft + tab.offsetWidth / 2 - 9;
      if (animate) gsap.to(markRef.current, { x, duration: 0.7, ease: 'expo.out' });
      else gsap.set(markRef.current, { x });
    };
    place(!first.current);
    first.current = false;
    const ro = new ResizeObserver(() => place(false));
    if (tabsRef.current) ro.observe(tabsRef.current);
    return () => ro.disconnect();
  }, [active]);

  return (
    <header className="nav">
      <div className="brand">
        <LogoMark />
        <span>Phoenix</span>
      </div>
      <nav className="tabs-wrap" aria-label="Main">
        <div className="tabs" ref={tabsRef}>
          {SCREENS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="tab"
              data-screen={s.id}
              aria-current={i === active ? 'page' : undefined}
              onClick={() => goTo(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="tab-mark" ref={markRef} aria-hidden />
      </nav>
      <div className="nav-actions">
        <button type="button" className="icon-btn" aria-label="Widgets">
          <LayoutGrid size={16} strokeWidth={2} />
        </button>
        <button type="button" className="icon-btn" aria-label="Notifications, 1 unread">
          <Bell size={16} strokeWidth={2} />
          <span className="badge-dot" aria-hidden />
        </button>
      </div>
    </header>
  );
}
