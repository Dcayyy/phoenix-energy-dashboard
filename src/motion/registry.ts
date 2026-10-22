/**
 * Every animated part of the dashboard registers a segment here. The director
 * stitches segments into the boot and power timelines, so the whole
 * choreography lives in one place (director.ts) instead of being scattered
 * across components as delays.
 */
export type Segment = {
  /** Put the visuals back into their pre-boot state. */
  reset?: () => void;
  /** Layout entrance, played once per boot. */
  intro?: () => gsap.core.Animation;
  powerOn?: () => gsap.core.Animation;
  powerOff?: () => gsap.core.Animation;
};

export type Phase = Exclude<keyof Segment, 'reset'>;

export const segments = new Map<string, Segment>();

export function registerSegment(name: string, segment: Segment) {
  segments.set(name, segment);
  return () => {
    if (segments.get(name) === segment) segments.delete(name);
  };
}
