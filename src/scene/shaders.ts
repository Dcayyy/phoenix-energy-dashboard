/** Storm sky on an inside-out sphere that follows the camera. Colors are linear. */
export const skyVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const skyFragment = /* glsl */ `
  uniform vec3 uCam;
  uniform float uTime;
  uniform float uFlash;
  uniform vec3 uBolt;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uCloud;
  varying vec3 vWorld;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) {
      value += amp * noise(p);
      p = m * p;
      amp *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 dir = normalize(vWorld - uCam);
    float h = dir.y;
    vec3 col = mix(uHorizon, uZenith, smoothstep(-0.05, 0.6, h));

    // Clouds projected onto a flat ceiling, drifting with the wind.
    vec2 uv = dir.xz / (max(h, 0.0) + 0.16);
    uv += vec2(uTime * 0.018, uTime * 0.005);
    float body = fbm(uv * 0.75);
    float detail = fbm(uv * 2.1 + 3.7);
    float cloud = smoothstep(0.34, 0.86, body * 0.8 + detail * 0.32);
    float band = smoothstep(0.0, 0.08, h);
    col = mix(col, uCloud, cloud * band * 0.85);
    // Darker, heavier bellies under the cloud tops.
    col *= 1.0 - 0.38 * smoothstep(0.5, 0.95, detail) * band;
    // A thin band of haze where the clouds meet the ground.
    col += uCloud * 0.35 * exp(-abs(h) * 22.0);

    // Lightning lights the clouds around the bolt from inside.
    float facing = max(dot(dir, normalize(uBolt)), 0.0);
    float halo = pow(facing, 18.0) * 1.4 + pow(facing, 4.0) * 0.22;
    col += uFlash * vec3(0.5, 0.58, 0.78) * (halo * (0.2 + cloud * 1.3) + 0.015 * band);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Rain streaks: each drop is a two-vertex line that falls and wraps in a box. */
export const rainVertex = /* glsl */ `
  attribute float aEnd;
  attribute float aSpeed;
  uniform float uTime;
  uniform float uLen;
  varying float vEnd;
  void main() {
    vec3 p = position;
    float span = 6.0;
    p.y = mod(position.y - uTime * aSpeed, span) - 0.2;
    p.x += (span - p.y) * 0.08;
    p += vec3(-0.08, 1.0, 0.0) * uLen * aEnd;
    vEnd = aEnd;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

export const rainFragment = /* glsl */ `
  uniform float uOpacity;
  uniform float uFlash;
  uniform vec3 uColor;
  varying float vEnd;
  void main() {
    float alpha = (uOpacity + uFlash * 0.15) * (1.0 - vEnd);
    gl_FragColor = vec4(uColor * (1.0 + uFlash * 0.6), alpha);
  }
`;
