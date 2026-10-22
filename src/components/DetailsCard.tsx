import { useLayoutEffect, useRef, type ComponentType } from 'react';
import { AudioWaveform, Clock3, Gauge, Settings, Thermometer, Zap, type LucideProps } from 'lucide-react';
import { gsap } from '../lib/gsap';
import { registerSegment } from '../motion/registry';
import { countTo, hoursMinutes, writeCount, type Formatter } from '../motion/count';
import { useSystem } from '../state/system';
import './details-card.css';

type Reading =
  | { id: string; label: string; icon: ComponentType<LucideProps>; text: { on: string; off: string } }
  | { id: string; label: string; icon: ComponentType<LucideProps>; on: number; off: number; format: Formatter };

const unit = (suffix: string): Formatter => (v) => `${Math.round(v)}${suffix}`;

const READINGS: Reading[] = [
  { id: 'mode', label: 'Mode', icon: Zap, text: { on: 'X-Boost', off: 'Standby' } },
  { id: 'time', label: 'Time', icon: Clock3, on: 195, off: 0, format: hoursMinutes },
  { id: 'freq', label: 'Frequency', icon: AudioWaveform, on: 50, off: 0, format: unit(' Hz') },
  { id: 'temp', label: 'Temp', icon: Thermometer, on: 30, off: 24, format: unit('°C') },
  { id: 'amp', label: 'Ampere', icon: Gauge, on: 600, off: 0, format: unit('A') },
  { id: 'current', label: 'Current', icon: Settings, on: 10, off: 0, format: unit('A') },
];

export function DetailsCard() {
  const power = useSystem((s) => s.power);
  const values = useRef(new Map<string, HTMLElement>());
  const icons = useRef<HTMLSpanElement[]>([]);

  useLayoutEffect(() => {
    const set = (state: 'on' | 'off') => {
      for (const r of READINGS) {
        const el = values.current.get(r.id);
        if (!el) continue;
        if ('text' in r) el.textContent = r.text[state];
        else writeCount(el, r[state], r.format);
      }
    };

    const settle = (state: 'on' | 'off') => {
      const tl = gsap.timeline();
      READINGS.forEach((r, i) => {
        const el = values.current.get(r.id);
        if (!el) return;
        const at = i * 0.08;
        if ('text' in r) {
          tl.to(el, { duration: 0.9, scrambleText: { text: r.text[state], chars: 'XB0OST-', speed: 0.6 } }, at);
        } else {
          tl.add(countTo(el, r[state], { duration: state === 'on' ? 1.4 : 0.9, format: r.format }), at);
        }
      });
      return tl;
    };

    set('off');
    return registerSegment('details', {
      reset() {
        set('off');
        gsap.set(icons.current, { scale: 0.6, autoAlpha: 0.25 });
      },
      powerOn() {
        return settle('on').fromTo(
          icons.current,
          { scale: 0.6, autoAlpha: 0.25 },
          { scale: 1, autoAlpha: 1, duration: 0.7, ease: 'back.out(2.6)', stagger: 0.08 },
          0,
        );
      },
      powerOff() {
        return settle('off').to(icons.current, { scale: 0.85, autoAlpha: 0.35, duration: 0.5, stagger: 0.04 }, 0);
      },
    });
  }, []);

  return (
    <section className="card details-card" data-power={power ? 'on' : 'off'} aria-labelledby="details-title">
      <i className="card-trace" aria-hidden />
      <h3 id="details-title" className="display details-title split-title">
        Details
      </h3>
      <dl className="readings">
        {READINGS.map((r, i) => {
          const Icon = r.icon;
          return (
            <div key={r.id} className="reading" data-id={r.id}>
              <dt>{r.label}</dt>
              <dd
                ref={(el) => {
                  if (el) values.current.set(r.id, el);
                }}
              />
              <span
                className="reading-icon"
                aria-hidden
                ref={(el) => {
                  if (el) icons.current[i] = el;
                }}
              >
                <Icon size={15} strokeWidth={2} />
              </span>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
