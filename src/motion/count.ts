import { gsap } from '../lib/gsap';

export type Formatter = (value: number) => string;

export const fixed =
  (decimals = 0, pad = 0): Formatter =>
  (value) => {
    const [int, frac] = value.toFixed(decimals).split('.');
    return int.padStart(pad, '0') + (frac ? `.${frac}` : '');
  };

/** 195 minutes reads as "3H 15M". */
export const hoursMinutes: Formatter = (value) => {
  const total = Math.round(value);
  return `${Math.floor(total / 60)}H ${String(total % 60).padStart(2, '0')}M`;
};

export function writeCount(el: HTMLElement | null | undefined, value: number, format: Formatter = fixed()) {
  if (!el) return;
  el.dataset.value = String(value);
  el.textContent = format(value);
}

export function readCount(el: HTMLElement) {
  return Number(el.dataset.value ?? 0) || 0;
}

/** Tween the number shown in an element, starting from whatever it shows now. */
export function countTo(
  el: HTMLElement | null | undefined,
  to: number,
  vars: { duration?: number; ease?: string; format?: Formatter } = {},
) {
  if (!el) return gsap.timeline();
  const format = vars.format ?? fixed();
  const proxy = { value: 0 };
  // The start value is read when the tween first renders, not when it is built,
  // so a count placed late in a timeline continues from the live number.
  return gsap.fromTo(
    proxy,
    { value: () => readCount(el) },
    {
      value: to,
      immediateRender: false,
      duration: vars.duration ?? 1.2,
      ease: vars.ease ?? 'power3.out',
      onUpdate: () => writeCount(el, proxy.value, format),
    },
  );
}
