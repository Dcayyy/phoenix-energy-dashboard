import { gsap } from '../lib/gsap';
import { boot } from './director';
import { activeScene } from '../scene/active';

type Point = { x: number; y: number };
type Target = () => Element | null;

const $ = (selector: string) => document.querySelector(selector);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Zooms the whole board like a screen-recording app would: transform the
 * `.camera` wrapper so a point of the board lands in the middle of the screen.
 * Points are in "board space": untransformed pixels from the board's top-left.
 */
class Camera {
  readonly state = { s: 1, x: 0, y: 0 };

  constructor(private el: HTMLElement) {}

  apply = () => {
    const { s, x, y } = this.state;
    this.el.style.transform = s === 1 && !x && !y ? '' : `translate3d(${x}px, ${y}px, 0) scale(${s})`;
  };

  private get stage() {
    return this.el.parentElement as HTMLElement;
  }

  /** How much the stage itself is scaled on screen (1, except in the ?reel frame). */
  get k() {
    return this.stage.getBoundingClientRect().width / this.stage.offsetWidth || 1;
  }

  /** True when the frame is taller than wide, as in the 9:16 reel. */
  get portrait() {
    return this.stage.offsetHeight > this.stage.offsetWidth;
  }

  /** Screen position of the board's top-left corner before the camera transform. */
  private origin(): Point {
    const r = this.el.getBoundingClientRect();
    const k = this.k;
    return { x: r.left - this.state.x * k, y: r.top - this.state.y * k };
  }

  toScreen(p: Point): Point {
    const { s, x, y } = this.state;
    const o = this.origin();
    const k = this.k;
    return { x: o.x + k * (x + s * p.x), y: o.y + k * (y + s * p.y) };
  }

  toBoard(screen: Point): Point {
    const { s, x, y } = this.state;
    const o = this.origin();
    const k = this.k;
    return { x: ((screen.x - o.x) / k - x) / s, y: ((screen.y - o.y) / k - y) / s };
  }

  boardPoint(el: Element, ax = 0.5, ay = 0.5): Point {
    const r = el.getBoundingClientRect();
    return this.toBoard({ x: r.left + r.width * ax, y: r.top + r.height * ay });
  }

  /** The camera state that centres `el` at zoom `s` without pulling the board's edges into view. */
  private solve(el: Element, s: number) {
    const p = this.boardPoint(el);
    const o = this.origin();
    const k = this.k;
    const frame = this.stage.getBoundingClientRect();
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const x = (frame.left + frame.width / 2 - o.x) / k - s * p.x;
    const y = (frame.top + frame.height / 2 - o.y) / k - s * p.y;
    return { s, x: gsap.utils.clamp(w * (1 - s), 0, x), y: gsap.utils.clamp(h * (1 - s), 0, y) };
  }

  focus(target: Target, s: number, duration = 1.5) {
    const from = { s: 1, x: 0, y: 0 };
    const tween = { p: 0 };
    return gsap.to(tween, {
      p: 1,
      duration,
      ease: 'expo.inOut',
      onStart: () => Object.assign(from, this.state),
      onUpdate: () => {
        const el = target();
        const to = el ? this.solve(el, s) : from;
        this.state.s = lerp(from.s, to.s, tween.p);
        this.state.x = lerp(from.x, to.x, tween.p);
        this.state.y = lerp(from.y, to.y, tween.p);
        this.apply();
      },
    });
  }

  reset(duration = 1.5) {
    return gsap.to(this.state, { s: 1, x: 0, y: 0, duration, ease: 'expo.inOut', onUpdate: this.apply });
  }
}

/**
 * A drawn cursor that drives the real UI: it hit-tests what is under it and
 * dispatches pointer and click events, so hover states, tooltips, toggles and
 * the 3D drag all react exactly as they do to a real mouse.
 */
class VirtualMouse {
  readonly pos: Point = { x: 0, y: 0 };
  private sprite: HTMLDivElement;
  private ripple: HTMLDivElement;
  private over: Element | null = null;
  private pressed = false;

  constructor(private camera: Camera) {
    this.sprite = document.createElement('div');
    this.sprite.className = 'v-cursor';
    this.sprite.innerHTML =
      '<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path d="M7 3.5v18.2l4.6-4.4 3.2 7.1 3.3-1.5-3.1-6.9h6.4L7 3.5Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    this.ripple = document.createElement('div');
    this.ripple.className = 'v-ripple';
    document.body.append(this.ripple, this.sprite);
    gsap.set([this.sprite, this.ripple], { autoAlpha: 0 });
  }

  private screen() {
    return this.camera.toScreen(this.pos);
  }

  /** Re-place the sprite and fire hover events for whatever is under it. */
  sync = () => {
    const p = this.screen();
    const zoom = Math.min(1 + (this.camera.state.s - 1) * 0.7, 1.6);
    gsap.set(this.sprite, { x: p.x, y: p.y, scale: zoom * Math.max(this.camera.k, 0.75) });
    const hit = document.elementFromPoint(p.x, p.y);
    if (hit !== this.over) {
      const prev = this.over;
      if (prev) {
        this.fire(prev, 'pointerout', { relatedTarget: hit });
        this.fire(prev, 'pointerleave', { bubbles: false, relatedTarget: hit });
        this.chain(prev).forEach((el) => el.classList.remove('is-vhover'));
      }
      if (hit) {
        this.fire(hit, 'pointerover', { relatedTarget: prev });
        this.fire(hit, 'pointerenter', { bubbles: false, relatedTarget: prev });
        this.chain(hit).forEach((el) => el.classList.add('is-vhover'));
      }
      this.over = hit;
    }
    if (hit) this.fire(hit, 'pointermove');
  };

  private chain(el: Element) {
    const list: Element[] = [];
    for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) list.push(node);
    return list;
  }

  private fire(el: Element, type: string, init: PointerEventInit = {}) {
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        ...this.client(),
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: this.pressed ? 1 : 0,
        ...init,
      }),
    );
  }

  private client() {
    const p = this.screen();
    return { clientX: p.x, clientY: p.y };
  }

  show(from: Point) {
    return gsap
      .timeline()
      .call(() => {
        Object.assign(this.pos, from);
        this.sync();
      })
      .to(this.sprite, { autoAlpha: 1, duration: 0.3 });
  }

  hide() {
    return gsap.to(this.sprite, { autoAlpha: 0, duration: 0.4 });
  }

  /**
   * Glide to a moving or not-yet-rendered target: the destination is looked up
   * on every frame, so rows that slide into place are tracked, not missed.
   */
  glide(to: () => Point | null, duration = 1, ease = 'power3.inOut') {
    const from = { ...this.pos };
    const tween = { p: 0 };
    return gsap.to(tween, {
      p: 1,
      duration,
      ease,
      onStart: () => Object.assign(from, this.pos),
      onUpdate: () => {
        const end = to() ?? from;
        this.pos.x = lerp(from.x, end.x, tween.p);
        this.pos.y = lerp(from.y, end.y, tween.p);
        this.sync();
      },
    });
  }

  /** Glide to a point on an element (ax/ay are fractions of its box). */
  moveTo(target: Target, duration = 1, ax = 0.5, ay = 0.5) {
    return this.glide(() => {
      const el = target();
      return el ? this.camera.boardPoint(el, ax, ay) : null;
    }, duration);
  }

  /** Board-space point at fraction `t` along an SVG path. */
  pointOn(path: SVGPathElement | null, t: number): Point | null {
    const matrix = path?.getScreenCTM();
    if (!path || !matrix) return null;
    const pt = path.getPointAtLength(path.getTotalLength() * t);
    const screen = new DOMPoint(pt.x, pt.y).matrixTransform(matrix);
    return this.camera.toBoard(screen);
  }

  /** Follow an SVG path from fraction t0 to t1, as if tracing a cable with the mouse. */
  trace(path: () => SVGPathElement | null, t0: number, t1: number, duration = 1.4) {
    const tween = { t: t0 };
    return gsap.to(tween, {
      t: t1,
      duration,
      ease: 'sine.inOut',
      onUpdate: () => {
        const p = this.pointOn(path(), tween.t);
        if (!p) return;
        Object.assign(this.pos, p);
        this.sync();
      },
    });
  }

  private press() {
    this.pressed = true;
    const target = this.over;
    if (target) {
      this.fire(target, 'pointerdown');
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...this.client() }));
    }
    const p = this.screen();
    gsap.fromTo(
      this.ripple,
      { x: p.x, y: p.y, scale: 0.2, autoAlpha: 0.9 },
      { scale: 1.6, autoAlpha: 0, duration: 0.6, ease: 'expo.out' },
    );
    gsap.to(this.sprite, { scale: '-=0.18', duration: 0.1, ease: 'power2.out' });
  }

  private release(click: boolean) {
    this.pressed = false;
    const target = this.over;
    if (target) {
      this.fire(target, 'pointerup');
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, ...this.client() }));
      if (click) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...this.client() }));
    }
    gsap.to(this.sprite, { scale: '+=0.18', duration: 0.25, ease: 'back.out(3)' });
  }

  click() {
    return gsap
      .timeline()
      .call(() => {
        this.sync();
        this.press();
      })
      .call(() => this.release(true), [], 0.12);
  }

  /** Press, drag by (dx, dy) board pixels, release. A flat drag gets a little natural sag. */
  drag(dx: number, duration = 0.8, ease = 'power2.inOut', dy = dx * -0.04) {
    const tween = { p: 0 };
    let from: Point = { ...this.pos };
    return gsap
      .timeline()
      .call(() => {
        from = { ...this.pos };
        this.press();
      })
      .to(
        tween,
        {
          p: 1,
          duration,
          ease,
          onUpdate: () => {
            this.pos.x = from.x + dx * tween.p;
            this.pos.y = from.y + dy * tween.p;
            this.sync();
          },
        },
        0.1,
      )
      .call(() => this.release(false));
  }

  dispose() {
    if (this.over) this.chain(this.over).forEach((el) => el.classList.remove('is-vhover'));
    this.sprite.remove();
    this.ripple.remove();
  }
}

let active: { tl: gsap.core.Timeline; cleanup: () => void } | null = null;

export function stopDemo() {
  if (!active) return;
  active.tl.kill();
  active.cleanup();
  active = null;
}

export const isDemoPlaying = () => active !== null;

export type SceneName = 'dashboard' | 'statistics' | 'support' | 'settings';
const TOUR: SceneName[] = ['dashboard', 'statistics', 'support', 'settings'];

type Kit = {
  camera: Camera;
  mouse: VirtualMouse;
  /** Zoom for the wide layout, and a gentler one for the 9:16 frame. */
  z: (wide: number, tall?: number) => number;
  flick: () => void;
};

const tab = (id: SceneName): Target => () => $(`.tab[data-screen="${id}"]`);
const inScreen = (id: SceneName, selector: string): Target => () => $(`.board[data-screen="${id}"] ${selector}`);

/** Click a nav tab; the scan transition takes about 1.5 s. */
const visit = (k: Kit, id: SceneName) => gsap.timeline().add(k.mouse.moveTo(tab(id), 1)).add(k.mouse.click(), '+=0.1');

const SCENES: Record<SceneName, (k: Kit) => gsap.core.Timeline> = {
  // Ports switched on one by one, a port added, the station spun, powered down and struck back to life.
  dashboard: ({ camera, mouse, z, flick }) => {
    const toggle = (id: string): Target => () => $(`.port[data-id="${id}"] .toggle`);
    const cable = (id: string) => () => $(`.cable-hit[data-port="${id}"]`) as SVGPathElement | null;
    return gsap
      .timeline()
      .add(camera.focus(() => $('.flow-card'), z(1.3), 1.6), 0)
      .add(mouse.moveTo(toggle('usb-c-1'), 1.2), 0.3)
      .add(mouse.click(), 1.65)
      .add(mouse.glide(() => mouse.pointOn(cable('usb-c-1')(), 0.8), 0.8), 2.5)
      .add(mouse.trace(cable('usb-c-1'), 0.8, 0.38, 1.4), 3.3)
      .add(mouse.moveTo(toggle('sec-ac'), 0.8), 4.8)
      .add(mouse.click(), 5.7)
      .add(mouse.moveTo(() => $('.add-port'), 0.9), 6.5)
      .add(mouse.click(), 7.5)
      .add(mouse.moveTo(toggle('wireless'), 0.9), 8.6)
      .add(mouse.click(), 9.6)
      .add(camera.reset(1.4), 10.6)
      .add(mouse.moveTo(() => $('.device-stage'), 1.1, 0.62, 0.55), 10.8)
      // A flick: the drag accelerates, then the station coasts round a full turn.
      .add(mouse.drag(-190, 0.55, 'power2.in'), 12.1)
      .call(flick, [], 12.8)
      .add(camera.focus(() => $('.device-card'), z(1.32), 1.4), 13.2)
      .add(mouse.moveTo(() => $('.knob'), 1), 13.5)
      .add(mouse.click(), 14.7)
      .add(camera.reset(1.6), 15.5)
      .add(mouse.moveTo(() => $('.knob'), 0.5), 17.3)
      .add(mouse.click(), 18)
      .add(camera.focus(() => $('.board[data-screen="dashboard"]'), z(1.06), 3.2), 18.5)
      .add(camera.reset(1.2), 21.9);
  },

  // The chart morphs Week → Month → Year, with a hover sweep across it.
  statistics: (k) => {
    const { camera, mouse, z } = k;
    const period = (label: string): Target => () => $(`.stats-hero .segmented-option[data-id="${label}"]`);
    const plot = inScreen('statistics', '.chart-hit');
    return gsap
      .timeline()
      .add(visit(k, 'statistics'), 0)
      .add(camera.focus(inScreen('statistics', '.stats-hero'), z(1.25), 1.4), 2.4)
      .add(mouse.moveTo(period('month'), 1), 2.6)
      .add(mouse.click(), 3.9)
      .add(mouse.moveTo(plot, 0.8, 0.12, 0.42), 5)
      .add(mouse.moveTo(plot, 2.2, 0.88, 0.5), 5.9)
      .add(mouse.moveTo(period('year'), 0.9), 8.3)
      .add(mouse.click(), 9.3)
      .add(camera.reset(1.4), 10.6);
  },

  // Mira offers a check, the 96 cells are scanned, she reports back, firmware updates.
  support: (k) => {
    const { camera, mouse, z } = k;
    return gsap
      .timeline()
      .add(visit(k, 'support'), 0)
      .add(camera.focus(inScreen('support', '.chat-card'), z(1.22), 1.4), 2.6)
      .add(mouse.moveTo(inScreen('support', '.chip'), 1), 4.4)
      .add(mouse.click(), 5.5)
      .add(camera.focus(inScreen('support', '.scan-card'), z(1.2), 1.4), 6.1)
      .add(camera.focus(inScreen('support', '.chat-card'), z(1.22), 1.3), 10.9)
      .add(camera.reset(1.3), 13.4)
      .add(mouse.moveTo(inScreen('support', '.fw-button'), 1), 13.6)
      .add(mouse.click(), 14.8)
      .to({}, { duration: 2.4 });
  },

  // The dial swings Eco → X-Boost, the charge limit is dragged up, then home to the dashboard.
  settings: (k) => {
    const { camera, mouse, z } = k;
    const mode = (id: string): Target => () => $(`.dial-label[data-mode="${id}"]`);
    return gsap
      .timeline()
      .add(visit(k, 'settings'), 0)
      .add(camera.focus(inScreen('settings', '.mode-card'), z(1.22), 1.4), 2.5)
      .add(mouse.moveTo(mode('eco'), 1), 2.9)
      .add(mouse.click(), 4.1)
      .add(mouse.moveTo(mode('boost'), 1), 5.5)
      .add(mouse.click(), 6.6)
      .add(camera.focus(inScreen('settings', '.limit-card'), z(1.15), 1.4), 8)
      .add(mouse.moveTo(inScreen('settings', '.battery'), 1, 0.5, 0.22), 8.3)
      .add(mouse.drag(0, 0.9, 'power2.inOut', -46), 9.5)
      .add(camera.reset(1.4), 11)
      .add(visit(k, 'dashboard'), 11.4)
      .to({}, { duration: 1.6 });
  },
};

/**
 * A scripted take for screen recording: the boot, then each scene in turn,
 * driven by a drawn cursor while a camera zooms in on the action. The full
 * tour runs about 70 seconds. Press D to play, Esc to stop. `zoom: false`
 * keeps the camera still, for recorders that zoom on their own.
 */
export function playDemo({ zoom = true, scenes = TOUR }: { zoom?: boolean; scenes?: SceneName[] } = {}) {
  stopDemo();
  const cameraEl = $('.camera') as HTMLElement | null;
  if (!cameraEl) return null;

  const camera = new Camera(cameraEl);
  const mouse = new VirtualMouse(camera);
  const scene = activeScene();
  const root = document.documentElement;
  const motion = root.dataset.motion;
  // Asking for the demo is asking for the motion, even with Reduce Motion on.
  root.dataset.motion = 'full';
  root.classList.add('is-demo');
  scene?.setDetail(1.6);

  const kit: Kit = {
    camera,
    mouse,
    // The 9:16 frame is already a close-up, so it zooms less than the wide layout.
    z: (wide, tall = 1 + (wide - 1) * 0.4) => (!zoom ? 1 : camera.portrait ? tall : wide),
    flick: () => scene?.flick(),
  };

  const cleanup = () => {
    mouse.dispose();
    Object.assign(camera.state, { s: 1, x: 0, y: 0 });
    camera.apply();
    scene?.setDetail(1);
    root.classList.remove('is-demo');
    if (motion) root.dataset.motion = motion;
    else delete root.dataset.motion;
  };

  const tl = gsap.timeline({
    onComplete: () => {
      cleanup();
      active = null;
    },
  });

  tl.add(boot(), 0).add(mouse.show({ x: cameraEl.offsetWidth * 0.98, y: cameraEl.offsetHeight * 0.92 }), 3.3);
  let at = 3.1;
  for (const name of scenes.filter((n) => n in SCENES)) {
    const part = SCENES[name](kit);
    tl.add(part, at);
    at += part.duration() + 0.2;
  }
  tl.add(mouse.hide(), at).add(camera.reset(1), at).to({}, { duration: 0.6 });

  active = { tl, cleanup };
  return tl;
}
