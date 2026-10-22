import { gsap, SplitText, prefersReducedMotion } from '../lib/gsap';
import { segments } from './registry';
import { system, type Screen } from '../state/system';

const boardOf = (screen: Screen) => document.querySelector<HTMLElement>(`.board[data-screen="${screen}"]`);
const cardsOf = (board: HTMLElement) => Array.from(board.querySelectorAll<HTMLElement>('.card'));

/** Show one screen and hide the rest, with no animation (used by the boot). */
export function showScreen(screen: Screen) {
  document.querySelectorAll<HTMLElement>('.board[data-screen]').forEach((board) => {
    board.hidden = board.dataset.screen !== screen;
  });
  system.set({ screen });
}

/**
 * The ember scan: a line of light sweeps down the board and each card is
 * revealed exactly where the line has passed, as if the station printed it.
 */
function scan(board: HTMLElement) {
  const line = board.parentElement?.querySelector<HTMLElement>('.scanline');
  const sweep = { p: 0 };
  let cards: { el: HTMLElement; top: number; height: number }[] = [];
  let height = 1;
  let split: SplitText | null = null;

  const tl = gsap.timeline();
  tl.call(() => {
    height = board.offsetHeight;
    cards = cardsOf(board).map((el) => ({ el, top: el.offsetTop, height: el.offsetHeight }));
    gsap.set(cardsOf(board), { autoAlpha: 1, y: 0, scale: 1, clipPath: 'inset(0 0 100% 0 round var(--radius-card))' });
    gsap.set(line ?? [], { autoAlpha: 1, y: -20 });
    split = SplitText.create(board.querySelectorAll('.split-title'), { type: 'lines,chars', mask: 'lines' });
    gsap.fromTo(split.chars, { yPercent: 120 }, { yPercent: 0, duration: 1.1, stagger: 0.02, ease: 'expo.out', delay: 0.2 });
  })
    .to(sweep, {
      p: 1,
      duration: 0.95,
      ease: 'power2.inOut',
      onUpdate: () => {
        const y = sweep.p * (height + 40) - 20;
        if (line) gsap.set(line, { y });
        for (const c of cards) {
          const shown = gsap.utils.clamp(0, 1, (y - c.top) / c.height);
          c.el.style.clipPath = `inset(0 0 ${((1 - shown) * 100).toFixed(2)}% 0 round var(--radius-card))`;
        }
      },
    })
    .to(line ?? [], { autoAlpha: 0, duration: 0.3 })
    .call(() => gsap.set(cards.map((c) => c.el), { clearProps: 'clipPath' }))
    .call(() => {
      split?.revert();
      split = null;
    }, [], '+=0.6');
  return tl;
}

/** Switch screens: the old cards fall away, then the scan prints the new screen. */
export function goTo(next: Screen) {
  const { screen, busy } = system.get();
  if (busy || next === screen) return null;
  const from = boardOf(screen);
  const to = boardOf(next);
  if (!from || !to) return null;
  system.set({ screen: next, busy: true });

  const leaving = cardsOf(from);
  const tl = gsap.timeline({ onComplete: () => system.set({ busy: false }) });
  tl.to(leaving, { autoAlpha: 0, y: -14, scale: 0.975, duration: 0.38, stagger: 0.03, ease: 'power3.in' })
    .call(() => {
      from.hidden = true;
      to.hidden = false;
      gsap.set(leaving, { clearProps: 'transform' });
      segments.get(next)?.reset?.();
    })
    .add(scan(to))
    .call(() => {
      segments.get(next)?.intro?.();
    }, [], '<0.35');

  if (prefersReducedMotion()) tl.progress(1);
  return tl;
}
