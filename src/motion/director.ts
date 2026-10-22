import { gsap, prefersReducedMotion } from '../lib/gsap';
import { segments, type Phase } from './registry';
import { system } from '../state/system';

type Cue = [segment: string, phase: Phase, at: number];

/**
 * Boot: the shell assembles, a lightning strike wakes the station, then power
 * runs outward from the source: cables, chip, gauge, readings, accessories.
 */
const BOOT: Cue[] = [
  ['shell', 'intro', 0],
  ['device', 'intro', 0.25],
  ['flow', 'intro', 0.55],
  ['cable', 'intro', 0.7],
  ['chip', 'intro', 0.75],
  ['device', 'powerOn', 1.15],
  ['flow', 'powerOn', 1.35],
  ['chip', 'powerOn', 1.6],
  ['gauge', 'powerOn', 1.7],
  ['details', 'powerOn', 1.8],
  ['cable', 'powerOn', 2.15],
];

const POWER_ON: Cue[] = [
  ['device', 'powerOn', 0],
  ['flow', 'powerOn', 0.2],
  ['chip', 'powerOn', 0.45],
  ['gauge', 'powerOn', 0.55],
  ['details', 'powerOn', 0.65],
  ['cable', 'powerOn', 0.95],
];

/** Power off drains in the opposite order: accessories first, the station last. */
const POWER_OFF: Cue[] = [
  ['cable', 'powerOff', 0],
  ['flow', 'powerOff', 0.05],
  ['details', 'powerOff', 0.15],
  ['chip', 'powerOff', 0.2],
  ['gauge', 'powerOff', 0.25],
  ['device', 'powerOff', 0.55],
];

const root = document.documentElement;
let current: gsap.core.Timeline | null = null;

function assemble(cues: Cue[]) {
  const tl = gsap.timeline();
  for (const [name, phase, at] of cues) {
    const animation = segments.get(name)?.[phase]?.();
    if (animation) tl.add(animation, at);
  }
  return tl;
}

function finish(tl: gsap.core.Timeline) {
  tl.eventCallback('onComplete', () => system.set({ busy: false }));
  current = tl;
  if (prefersReducedMotion()) tl.progress(1);
  return tl;
}

/** Plays the full start-up sequence from a blank screen. Press R to replay. */
export function boot() {
  current?.kill();
  system.set({ power: true, busy: true });
  segments.forEach((segment) => segment.reset?.());
  gsap.set(root, { '--power': 0 });
  const tl = assemble(BOOT);
  tl.to(root, { '--power': 1, duration: 1.4, ease: 'power2.inOut' }, 1.2);
  return finish(tl);
}

export function setPower(on: boolean) {
  const { power, busy } = system.get();
  if (power === on || busy) return null;
  system.set({ power: on, busy: true });
  const tl = assemble(on ? POWER_ON : POWER_OFF);
  tl.to(root, { '--power': on ? 1 : 0, duration: on ? 1.2 : 0.9, ease: 'power2.inOut' }, on ? 0.1 : 0.3);
  return finish(tl);
}

export const togglePower = () => setPower(!system.get().power);

/** The boot or power timeline that is playing (or last played). */
export const currentTimeline = () => current;
