import { useRef } from 'react';
import { Power } from 'lucide-react';
import { gsap } from '../lib/gsap';
import { togglePower } from '../motion/director';
import { useSystem } from '../state/system';

export function PowerKnob() {
  const power = useSystem((s) => s.power);
  const busy = useSystem((s) => s.busy);
  const rippleRef = useRef<HTMLSpanElement>(null);

  const press = () => {
    if (busy) return;
    gsap.fromTo(
      rippleRef.current,
      { scale: 1, autoAlpha: 0.9 },
      { scale: 2.8, autoAlpha: 0, duration: 1.1, ease: 'expo.out' },
    );
    togglePower();
  };

  return (
    <button
      type="button"
      className="knob"
      aria-pressed={power}
      aria-label={power ? 'Switch the station off' : 'Switch the station on'}
      onClick={press}
    >
      <span className="knob-ripple" ref={rippleRef} aria-hidden />
      <span className="knob-ring" aria-hidden />
      <span className="knob-cap" aria-hidden>
        <Power size={18} strokeWidth={2.3} />
      </span>
    </button>
  );
}
