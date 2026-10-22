import { useSyncExternalStore } from 'react';

export type SystemState = {
  /** Whether the station is switched on. */
  power: boolean;
  /** True while a boot or power transition is playing; inputs wait for it. */
  busy: boolean;
};

let state: SystemState = { power: true, busy: true };
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
