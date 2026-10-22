import { useLayoutEffect, useRef } from 'react';
import { registerSegment } from '../motion/registry';
import { useSystem } from '../state/system';
import { DeviceScene } from '../scene/DeviceScene';
import { setActiveScene } from '../scene/active';
import { PowerKnob } from './PowerKnob';
import { ChargingGauge } from './ChargingGauge';
import './device-card.css';

export function DeviceCard() {
  const stageRef = useRef<HTMLDivElement>(null);
  const power = useSystem((s) => s.power);

  useLayoutEffect(() => {
    const host = stageRef.current;
    if (!host) return;
    let scene: DeviceScene;
    try {
      scene = new DeviceScene(host);
    } catch {
      // No WebGL: the storm backdrop in CSS still frames the card.
      host.dataset.fallback = 'true';
      return;
    }
    const unregister = registerSegment('device', {
      reset: () => scene.reset(),
      intro: () => scene.intro(),
      powerOn: () => scene.powerOn(),
      powerOff: () => scene.powerOff(),
    });
    setActiveScene(scene);
    return () => {
      setActiveScene(null);
      unregister();
      scene.dispose();
    };
  }, []);

  return (
    <section className="card device-card slot-side" aria-labelledby="device-title">
      <i className="card-trace" aria-hidden />
      <div className="device-hero">
        <div className="device-stage" ref={stageRef} />
        <div className="device-shade" aria-hidden />
        <header className="device-head">
          <h2 id="device-title" className="display device-title split-title">
            Zeus–X
          </h2>
          <span className="mode-pill">X-boost mode</span>
        </header>
        <div className="power-row">
          <span className="power-label">Power</span>
          <PowerKnob />
          <span className="power-state" aria-hidden>
            <b data-active={power}>On</b>
            <b data-active={!power}>Off</b>
          </span>
        </div>
      </div>

      <div className="charging">
        <h3 className="display charging-title split-title">Charging mode</h3>
        <ChargingGauge />
        <dl className="charging-foot">
          <div>
            <dt>Power</dt>
            <dd>5A / 220V</dd>
          </div>
          <div>
            <dt>Input</dt>
            <dd>200 kWh</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
