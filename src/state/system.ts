import { useSyncExternalStore } from 'react';

export type Screen = 'dashboard' | 'statistics' | 'support' | 'settings';

export const SCREENS: { id: Screen; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'support', label: 'Support' },
  { id: 'settings', label: 'Settings' },
];

export type SystemState = {
  /** Whether the station is switched on. */
  power: boolean;
  /** True while a boot, power or screen transition is playing; inputs wait for it. */
  busy: boolean;
  /** The screen on show. */
  screen: Screen;
};

let state: SystemState = { power: true, busy: true, screen: 'dashboard' };
const listeners = new Set<() => void>();

export const system = {
  get: () => state,
  set(patch: Partial<SystemState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useSystem<T>(select: (s: SystemState) => T): T {
  return useSyncExternalStore(system.subscribe, () => select(state));
}
