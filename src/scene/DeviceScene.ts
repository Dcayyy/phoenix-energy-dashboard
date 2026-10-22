import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { gsap } from '../lib/gsap';
import { skyVertex, skyFragment, rainVertex, rainFragment } from './shaders';

const EMBER = new THREE.Color('#ff6a2b');
const LED_OFF = new THREE.Color('#1c0d06');
const LED_ON = EMBER.clone().multiplyScalar(4.2);
const FONT = '"Mona Sans Variable", system-ui, sans-serif';

/** Device dimensions, in metres. */
const L = 1.7;
const D = 1.0;
const CLEAR = 0.17;
const LOWER = 0.6;
const SEAM = 0.025;
const UPPER = 0.42;
const TOP = CLEAR + LOWER + SEAM + UPPER - 0.01;

function canvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function radialTexture(inner: string, outer: string, hold = 0) {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  if (hold) g.addColorStop(hold, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Recursive midpoint displacement: a jagged lightning channel between two points. */
function channel(from: THREE.Vector3, to: THREE.Vector3, depth: number, roughness: number) {
  let points = [from, to];
  for (let level = 0; level < depth; level++) {
    const next = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const span = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.x += (Math.random() - 0.5) * span * 0.5 * roughness;
      mid.z += (Math.random() - 0.5) * span * 0.3 * roughness;
      mid.y += (Math.random() - 0.5) * span * 0.12 * roughness;
      next.push(mid, b);
    }
    points = next;
  }
  return points;
}

/**
 * The Zeus-X power station: a rugged trolley battery with ember light strips,
 * standing on wet asphalt in a thunderstorm. Rendered with bloom so the strips
 * and lightning actually glow.
 */
export class DeviceScene {
  /** Tweened by GSAP; read every frame. */
  readonly state = { led: 0, screen: 0, flash: 0, dolly: 1, spin: 0 };
  autoStrike = true;

  private host: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
  private composer: EffectComposer;
  private device = new THREE.Group();
  private target = new THREE.Vector3(0, 0.84, 0);
  private viewDir = new THREE.Vector3(0.8, 0.075, 0.58).normalize();
  private leds: THREE.MeshBasicMaterial[] = [];
  private screenCanvas = canvas(512, 224);
  private screenTex = new THREE.CanvasTexture(this.screenCanvas);
  private screenMat = new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false });
  private logoCanvas = canvas(512, 80);
  private logoTex = new THREE.CanvasTexture(this.logoCanvas);
  private emberLight = new THREE.PointLight(EMBER, 0, 4.5, 2);
  private strikeLight = new THREE.DirectionalLight('#d4e2ff', 0);
  private groundGlow!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private sky!: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private rain!: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private bolt = new THREE.Group();
  private boltMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.6, 2.8, 3.4),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  private textures: THREE.Texture[] = [];
  private user = { rot: 0, vel: 0, dragging: false, lastX: 0, lastT: 0 };
  /** Where the pointer is over the card, -0.5..0.5, and its eased follower. */
  private look = { x: 0, y: 0, ex: 0, ey: 0 };
  private start = performance.now();
  private last = performance.now();
  private nextStrike = 9;
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;

  constructor(host: HTMLElement) {
    this.host = host;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = 'device-gl';
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene.fog = new THREE.Fog('#2c3337', 7, 30);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.textures.push(env);
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.16;
    pmrem.dispose();

    this.buildLights();
    this.buildSky();
    this.buildGround();
    this.buildDevice();
    this.buildRain();
    this.scene.add(this.bolt);

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.42, 1.0));
    this.composer.addPass(new OutputPass());

    this.drawScreen();
    this.drawLogo();
    document.fonts.ready.then(() => {
      this.drawScreen();
      this.drawLogo();
    });

    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.updateLoop();
    });
    this.io.observe(host);
    document.addEventListener('visibilitychange', this.updateLoop);
    this.resize();
    this.updateLoop();
  }

  // --- choreography ------------------------------------------------------

  reset() {
    gsap.killTweensOf(this.state);
    Object.assign(this.state, { led: 0, screen: 0, flash: 0, dolly: 1.32, spin: -0.85 });
    this.user.rot = 0;
    this.user.vel = 0;
    gsap.set(this.host, { autoAlpha: 0 });
    this.nextStrike = this.elapsed() + 10;
  }

  /** The camera settles in while the device turns to face you. */
  intro() {
    return gsap
      .timeline()
      .to(this.host, { autoAlpha: 1, duration: 1.2, ease: 'power2.out' }, 0)
      .to(this.state, { dolly: 1, spin: 0, duration: 2.8, ease: 'expo.out' }, 0);
  }

  /** Lightning strikes and the light strips stutter on like a cold fluorescent tube. */
  powerOn() {
    const s = this.state;
    return gsap
      .timeline()
      .add(this.strike(1), 0)
      .to(s, { led: 0.9, duration: 0.05, ease: 'none' }, 0.14)
      .to(s, { led: 0.04, duration: 0.07, ease: 'none' })
      .to(s, { led: 0.7, duration: 0.05, ease: 'none' })
      .to(s, { led: 0.1, duration: 0.14, ease: 'none' })
      .to(s, { led: 1, duration: 0.7, ease: 'power2.out' })
      .to(s, { screen: 1, duration: 0.9, ease: 'power2.out' }, 0.6);
  }

  powerOff() {
    const s = this.state;
    return gsap
      .timeline()
      .to(s, { screen: 0, duration: 0.4, ease: 'power2.in' }, 0)
      .to(s, { led: 0.35, duration: 0.07, ease: 'none' }, 0.1)
      .to(s, { led: 0.85, duration: 0.05, ease: 'none' })
      .to(s, { led: 0, duration: 0.9, ease: 'power3.in' });
  }

  strike(power = 1) {
    this.makeBolt();
    const s = this.state;
    return gsap
      .timeline()
      .to(s, { flash: power, duration: 0.05, ease: 'none' })
      .to(s, { flash: 0.12 * power, duration: 0.08, ease: 'none' })
      .to(s, { flash: 0.92 * power, duration: 0.04, ease: 'none' })
      .to(s, { flash: 0.25 * power, duration: 0.1, ease: 'none' })
      .to(s, { flash: 0.55 * power, duration: 0.05, ease: 'none' })
      .to(s, { flash: 0, duration: 0.95, ease: 'power2.out' });
  }

  /** Give the device a flick, as if someone spun it. */
  nudge(velocity: number) {
    this.user.vel += velocity;
  }

  /**
   * Coast on to the next whole turn in the direction it is already spinning,
   * so a flick always lands with the front facing the camera again.
   */
  flick() {
    const turn = Math.PI * 2;
    const u = this.user;
    const goal = (u.vel < 0 ? Math.floor(u.rot / turn) : Math.ceil(u.rot / turn)) * turn;
    // Velocity decays as e^(-3t), so it coasts exactly vel / 3 before stopping.
    u.vel = 3 * (goal - u.rot);
  }

  /** Render at a higher pixel ratio while the demo camera zooms in, so the canvas stays sharp. */
  setDetail(factor: number) {
    // Capped so the zoomed demo stays smooth on laptops without a big GPU.
    const ratio = Math.min(window.devicePixelRatio * factor, 2.5);
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.resize();
  }

  // --- scene -------------------------------------------------------------

  private buildLights() {
    const hemi = new THREE.HemisphereLight('#8fa2b4', '#101214', 0.55);
    const key = new THREE.DirectionalLight('#dfe8f1', 1.25);
    key.position.set(3.2, 6.5, 4.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 1, far: 20 });
    key.shadow.bias = -0.0004;
    key.shadow.radius = 5;
    const rim = new THREE.DirectionalLight('#b3c8dc', 3.2);
    rim.position.set(-5, 3.6, -4.6);
    this.emberLight.position.set(1.3, 0.35, 0.25);
    this.strikeLight.position.set(-8, 10, -9);
    this.scene.add(hemi, key, rim, this.emberLight, this.strikeLight);
  }

  private buildSky() {
    const material = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uBolt: { value: new THREE.Vector3(-0.6, 0.4, -0.7).normalize() },
        uHorizon: { value: new THREE.Color('#2c3337') },
        uZenith: { value: new THREE.Color('#0d1013') },
        uCloud: { value: new THREE.Color('#56616a') },
        uCam: { value: new THREE.Vector3() },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), material);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  private buildGround() {
    // The ground fades out with distance, so it melts into the sky instead of ending in a hard horizon.
    const fade = radialTexture('rgba(255,255,255,1)', 'rgba(0,0,0,1)', 0.42);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(24, 64),
      new THREE.MeshStandardMaterial({
        color: '#16191c',
        roughness: 0.82,
        metalness: 0,
        envMapIntensity: 0.4,
        alphaMap: fade,
        transparent: true,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    // Transparent layers draw in this order: ground, shadow and glow decals, rain.
    ground.renderOrder = 1;

    const contact = radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)');
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.9, 2.1),
      new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    shadow.renderOrder = 2;

    // Light from the strips pooling on the wet ground in front of the device.
    const pool = radialTexture('rgba(255,140,80,1)', 'rgba(255,106,43,0)');
    this.groundGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.9),
      new THREE.MeshBasicMaterial({
        map: pool,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.groundGlow.rotation.x = -Math.PI / 2;
    this.groundGlow.position.set(0.95, 0.004, 0.1);
    this.groundGlow.renderOrder = 3;
    this.textures.push(contact, pool, fade);
    this.device.add(shadow, this.groundGlow);
    this.scene.add(ground);
  }

  private buildDevice() {
    const d = this.device;
    const shell = new THREE.MeshPhysicalMaterial({
      color: '#23262b',
      metalness: 0.6,
      roughness: 0.42,
      clearcoat: 0.6,
      clearcoatRoughness: 0.35,
    });
    const shellUpper = new THREE.MeshPhysicalMaterial({
      color: '#2d3137',
      metalness: 0.55,
      roughness: 0.36,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
    });
    const trim = new THREE.MeshStandardMaterial({ color: '#121316', metalness: 0.2, roughness: 0.7 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#0e0f11', roughness: 0.95 });
    const steel = new THREE.MeshStandardMaterial({ color: '#9aa1a9', metalness: 0.92, roughness: 0.28 });
    const gunmetal = new THREE.MeshStandardMaterial({ color: '#3a3e44', metalness: 0.85, roughness: 0.35 });
    const panel = new THREE.MeshStandardMaterial({ color: '#16181b', metalness: 0.35, roughness: 0.55 });
    const led = () => {
      const m = new THREE.MeshBasicMaterial({ color: LED_OFF.clone() });
      this.leds.push(m);
      return m;
    };
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geometry, material);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      d.add(m);
      return m;
    };

    // Body: two clamshell halves with a dark seam between them.
    add(new RoundedBoxGeometry(L, LOWER, D, 5, 0.085), shell, 0, CLEAR + LOWER / 2);
    add(new THREE.BoxGeometry(L - 0.07, SEAM + 0.01, D - 0.07), trim, 0, CLEAR + LOWER + SEAM / 2);
    add(new RoundedBoxGeometry(L - 0.03, UPPER, D - 0.03, 5, 0.085), shellUpper, 0, CLEAR + LOWER + SEAM + UPPER / 2 - 0.01);

    // Solar lid.
    add(new RoundedBoxGeometry(L - 0.2, 0.03, D - 0.2, 3, 0.012), trim, 0, TOP + 0.004);
    const lid = this.solarTexture();
    const solar = add(
      new THREE.PlaneGeometry(L - 0.28, D - 0.28),
      new THREE.MeshStandardMaterial({ map: lid, metalness: 0.3, roughness: 0.55 }),
      0,
      TOP + 0.021,
    );
    solar.rotation.x = -Math.PI / 2;

    // Front panel with a status screen and outlets.
    const fx = L / 2;
    add(new RoundedBoxGeometry(0.03, 0.44, D - 0.28, 3, 0.012), panel, fx + 0.004, CLEAR + 0.33);
    const screen = add(new THREE.PlaneGeometry(0.36, 0.158), this.screenMat, fx + 0.021, CLEAR + 0.43);
    screen.rotation.y = Math.PI / 2;
    screen.castShadow = false;
    for (const z of [-0.17, 0, 0.17]) {
      add(new RoundedBoxGeometry(0.02, 0.06, 0.1, 2, 0.01), trim, fx + 0.02, CLEAR + 0.22, z);
      add(new THREE.SphereGeometry(0.011, 12, 8), led(), fx + 0.024, CLEAR + 0.285, z + 0.036);
    }

    // Light strips: two down the front corners, one along each side.
    const stripH = TOP - CLEAR - 0.16;
    for (const z of [-0.41, 0.41]) add(new THREE.BoxGeometry(0.018, stripH, 0.02), led(), fx + 0.006, CLEAR + 0.08 + stripH / 2, z);
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(1.22, 0.02, 0.018), led(), -0.02, TOP - 0.12, side * ((D - 0.03) / 2 + 0.006));
      // Vent slots.
      for (let i = 0; i < 6; i++) {
        add(new THREE.BoxGeometry(0.5, 0.016, 0.012), trim, 0.18, CLEAR + 0.12 + i * 0.05, side * (D / 2 + 0.002));
        add(new THREE.BoxGeometry(0.3, 0.016, 0.012), trim, -0.45, CLEAR + 0.12 + i * 0.05, side * (D / 2 + 0.002));
      }
    }

    // Wordmark on the near side.
    const logo = add(
      new THREE.PlaneGeometry(0.5, 0.078),
      new THREE.MeshBasicMaterial({ map: this.logoTex, transparent: true, opacity: 0.8, color: '#d9dde2' }),
      0.32,
      CLEAR + LOWER - 0.1,
      D / 2 + 0.004,
    );
    logo.castShadow = false;

    // Telescopic trolley handle at the back.
    const bx = -L / 2 - 0.04;
    const rodH = TOP + 0.36 - (CLEAR + 0.2);
    for (const z of [-0.3, 0.3]) {
      add(new THREE.CylinderGeometry(0.022, 0.022, rodH, 16), steel, bx, CLEAR + 0.2 + rodH / 2, z);
      add(new RoundedBoxGeometry(0.06, 0.07, 0.07, 2, 0.015), gunmetal, bx + 0.012, CLEAR + 0.26, z);
      add(new RoundedBoxGeometry(0.06, 0.07, 0.07, 2, 0.015), gunmetal, bx + 0.012, TOP - 0.06, z);
    }
    const grip = add(new THREE.CapsuleGeometry(0.034, 0.56, 6, 16), rubber, bx, TOP + 0.36, 0);
    grip.rotation.x = Math.PI / 2;

    // Wheels at the back, with lit hub rings.
    for (const side of [-1, 1]) {
      const z = side * (D / 2 + 0.05);
      const tire = add(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 40), rubber, -0.62, 0.19, z);
      tire.rotation.x = Math.PI / 2;
      const hub = add(new THREE.CylinderGeometry(0.105, 0.105, 0.104, 32), gunmetal, -0.62, 0.19, z);
      hub.rotation.x = Math.PI / 2;
      add(new THREE.TorusGeometry(0.135, 0.007, 8, 48), led(), -0.62, 0.19, z + side * 0.052);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 16), steel, -0.62, 0.19, z).rotation.x = Math.PI / 2;
    }

    // Rubber feet at the front.
    for (const z of [-0.36, 0.36]) add(new THREE.CylinderGeometry(0.055, 0.066, CLEAR, 20), rubber, L / 2 - 0.17, CLEAR / 2, z);

    this.scene.add(d);
  }

  private solarTexture() {
    const c = canvas(512, 320);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0a0d11';
    ctx.fillRect(0, 0, 512, 320);
    const cols = 8;
    const rows = 5;
    const gap = 6;
    const cw = (512 - gap * (cols + 1)) / cols;
    const ch = (320 - gap * (rows + 1)) / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = gap + col * (cw + gap);
        const y = gap + r * (ch + gap);
        const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
        g.addColorStop(0, '#1d2733');
        g.addColorStop(1, '#121821');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, cw, ch);
        ctx.strokeStyle = 'rgba(120,150,180,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + cw / 2, y);
        ctx.lineTo(x + cw / 2, y + ch);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.push(tex);
    return tex;
  }

  private drawScreen() {
    const ctx = this.screenCanvas.getContext('2d')!;
    const { width, height } = this.screenCanvas;
    ctx.fillStyle = '#040506';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#ff6a2b';
    ctx.fillStyle = '#ff6a2b';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.roundRect(42, 56, 150, 112, 16);
    ctx.stroke();
    ctx.fillRect(192, 90, 16, 44);
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 1 - i * 0.18;
      ctx.beginPath();
      ctx.roundRect(60 + i * 40, 74, 30, 76, 6);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `300 118px ${FONT}`;
    ctx.fontStretch = 'expanded';
    ctx.textBaseline = 'middle';
    ctx.fillText('74%', 232, 118);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenTex.needsUpdate = true;
  }

  private drawLogo() {
    const ctx = this.logoCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 80);
    ctx.fillStyle = '#ffffff';
    ctx.font = `500 58px ${FONT}`;
    ctx.fontStretch = 'expanded';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '6px';
    ctx.fillText('ZEUS–X', 6, 42);
    this.logoTex.colorSpace = THREE.SRGBColorSpace;
    this.logoTex.needsUpdate = true;
  }

  private buildRain() {
    const count = 1200;
    const position = new Float32Array(count * 6);
    const end = new Float32Array(count * 2);
    const speed = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 10;
      const y = Math.random() * 6;
      const z = (Math.random() - 0.5) * 10;
      const s = 5.5 + Math.random() * 3.5;
      for (let k = 0; k < 2; k++) {
        position.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
        speed[i * 2 + k] = s;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: rainVertex,
      fragmentShader: rainFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uLen: { value: 0.3 },
        uOpacity: { value: 0.3 },
        uFlash: { value: 0 },
        uColor: { value: new THREE.Color('#9fb0c0') },
      },
    });
    this.rain = new THREE.LineSegments(geometry, material);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 4;
    this.scene.add(this.rain);
  }

  private makeBolt() {
    this.bolt.children.forEach((child) => (child as THREE.Mesh).geometry.dispose());
    this.bolt.clear();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(this.viewDir, up).normalize();
    const side = Math.random() < 0.5 ? -1 : 1;
    const base = this.target
      .clone()
      .addScaledVector(this.viewDir, -14)
      .addScaledVector(right, side * (1.6 + Math.random() * 1.8));
    const top = base.clone().setY(11);
    const ground = base.clone().setY(0.4).addScaledVector(right, (Math.random() - 0.5) * 2);
    const main = channel(top, ground, 7, 1.1);
    this.bolt.add(this.ribbon(main, 0.16, 0.05));
    for (let b = 0; b < 3; b++) {
      const from = main[Math.floor(main.length * (0.15 + Math.random() * 0.45))];
      const to = from
        .clone()
        .add(new THREE.Vector3(0, -2 - Math.random() * 2.5, 0))
        .addScaledVector(right, (Math.random() - 0.5) * 5);
      this.bolt.add(this.ribbon(channel(from, to, 5, 1.3), 0.06, 0.012));
    }
    this.strikeLight.position.copy(base).setY(10);
    const uBolt = this.sky.material.uniforms.uBolt.value as THREE.Vector3;
    uBolt.copy(base).setY(6).sub(this.camera.position).normalize();
  }

  /** A camera-facing strip along a polyline, tapering from w0 to w1. */
  private ribbon(points: THREE.Vector3[], w0: number, w1: number) {
    const positions: number[] = [];
    const indices: number[] = [];
    const eye = this.camera.position;
    const dir = new THREE.Vector3();
    const view = new THREE.Vector3();
    const side = new THREE.Vector3();
    points.forEach((p, i) => {
      const next = points[Math.min(i + 1, points.length - 1)];
      const prev = points[Math.max(i - 1, 0)];
      dir.subVectors(next, prev).normalize();
      view.subVectors(eye, p).normalize();
      const width = w0 + (w1 - w0) * (i / (points.length - 1));
      side.crossVectors(dir, view).normalize().multiplyScalar(width / 2);
      positions.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z);
      if (i < points.length - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, this.boltMat);
    mesh.frustumCulled = false;
    return mesh;
  }

  // --- runtime -----------------------------------------------------------

  private bindPointer() {
    const el = this.renderer.domElement;
    const u = this.user;
    el.addEventListener('pointerdown', (e) => {
      u.dragging = true;
      u.vel = 0;
      u.lastX = e.clientX;
      u.lastT = performance.now();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointers (the scripted demo) cannot be captured.
      }
      el.dataset.dragging = 'true';
    });
    el.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      this.look.x = (e.clientX - rect.left) / rect.width - 0.5;
      this.look.y = (e.clientY - rect.top) / rect.height - 0.5;
      if (!u.dragging) return;
      const now = performance.now();
      const delta = (e.clientX - u.lastX) * 0.009;
      const dt = Math.max(now - u.lastT, 8) / 1000;
      u.rot += delta;
      u.vel = u.vel * 0.4 + (delta / dt) * 0.6;
      u.lastX = e.clientX;
      u.lastT = now;
    });
    const release = () => {
      u.dragging = false;
      delete el.dataset.dragging;
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', () => {
      this.look.x = 0;
      this.look.y = 0;
    });
  }

  private elapsed() {
    return (performance.now() - this.start) / 1000;
  }

  private resize() {
    const w = Math.max(this.host.clientWidth, 1);
    const h = Math.max(this.host.clientHeight, 1);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render(0);
  }

  private frame(tilt = 0) {
    const cam = this.camera;
    const vf = THREE.MathUtils.degToRad(cam.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
    const fit = Math.min(vf, hf * 1.1);
    const distance = (1.5 / Math.tan(fit / 2)) * this.state.dolly;
    cam.position.copy(this.target).addScaledVector(this.viewDir, distance);
    cam.position.y += tilt * 0.9;
    cam.lookAt(this.target);
    this.sky.position.copy(cam.position);
  }

  private apply(t: number) {
    const s = this.state;
    const led = Math.max(0, s.led);
    for (const m of this.leds) m.color.copy(LED_OFF).lerp(LED_ON, led);
    this.screenMat.color.setScalar(0.03 + 1.25 * s.screen);
    this.emberLight.intensity = 4 * led;
    this.groundGlow.material.opacity = 0.42 * led;
    this.strikeLight.intensity = 3.2 * s.flash;
    this.boltMat.opacity = Math.min(1, s.flash * 1.5);
    this.bolt.visible = s.flash > 0.02;
    const sky = this.sky.material.uniforms;
    sky.uTime.value = t;
    sky.uFlash.value = s.flash;
    (sky.uCam.value as THREE.Vector3).copy(this.camera.position);
    const rain = this.rain.material.uniforms;
    rain.uTime.value = t;
    rain.uFlash.value = s.flash;
  }

  private render(dt: number) {
    const t = this.elapsed();
    const u = this.user;
    if (!u.dragging) {
      u.rot += u.vel * dt;
      u.vel *= Math.exp(-3 * dt);
    }
    const look = this.look;
    const ease = 1 - Math.exp(-4 * dt);
    look.ex += (look.x - look.ex) * ease;
    look.ey += (look.y - look.ey) * ease;
    this.device.rotation.y = -0.42 + Math.sin(t * 0.3) * 0.16 + u.rot + this.state.spin + look.ex * 0.5;
    this.frame(look.ey);
    this.apply(t);
    this.composer.render(dt);
  }

  private tick = () => {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    if (this.autoStrike && this.elapsed() > this.nextStrike) {
      this.strike(0.7);
      this.nextStrike = this.elapsed() + 8 + Math.random() * 8;
    }
    this.render(dt);
  };

  private updateLoop = () => {
    const run = this.visible && document.visibilityState === 'visible';
    this.last = performance.now();
    this.renderer.setAnimationLoop(run ? this.tick : null);
  };

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener('visibilitychange', this.updateLoop);
    gsap.killTweensOf(this.state);
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.geometry) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((m) => m?.dispose());
    });
    [...this.textures, this.screenTex, this.logoTex].forEach((t) => t.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
