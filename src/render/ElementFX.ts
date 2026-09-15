/**
 * ElementFX.ts — character-specific chakra effects built procedurally (three.js shaders + meshes),
 * following the Storm-style layering rule: POLYGON (a shape: swirl sphere, shock dome, arc) +
 * EDGE (lines: lightning bolts, wind ribbons, slash arcs) + VERTEX (particles: sparks, gravel,
 * droplets, flames), wrapped in low-opacity AIRFLOW (a ground wave spreading out and wind rising
 * around the body) so every effect sits in the scene instead of floating on it.
 *
 *   hold(key, kind, pos, color)   — persistent effect refreshed every frame (jutsu in the hand,
 *                                   ultimate rush); fades out by itself when no longer refreshed
 *   impact(kind, pos, color, s)   — one-shot burst at a contact point
 *   aura(kind, feet, color, s)    — airflow around a fighter (charging, awakening, intros)
 */
import * as THREE from 'three';
import type { ElementKind } from '../core/Types';
import type { Effects } from './Effects';

// ------------------------------------------------------------------------------------ shaders
const VS_VIEW = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec2 vUv;
  void main() {
    vUv = uv; vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

const NOISE = /* glsl */ `
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }`;

/** Swirling chakra ball: fresnel rim + spiral bands + scrolling noise, white-hot core. */
const FS_SWIRL = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uCore; uniform float uTime; uniform float uOpacity; uniform float uBands; uniform float uNoise;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  ${NOISE}
  void main() {
    float fres = pow(1.0 - abs(dot(vN, vV)), 2.0);
    float ang = atan(vP.z, vP.x);
    float bands = sin(ang * uBands + vP.y * 7.0 - uTime * 16.0) * 0.5 + 0.5;
    float n = noise3(vP * 4.5 + vec3(0.0, uTime * 3.0, uTime * 2.2));
    float body = mix(bands, n, uNoise);
    float core = pow(1.0 - fres, 3.0);
    vec3 col = mix(uColor, uCore, core * 0.85 + body * 0.2);
    float a = (0.22 + fres * 0.95) * (0.55 + body * 0.65) * uOpacity;
    gl_FragColor = vec4(col * (1.15 + body * 0.6), a);
  }`;

/** Shock dome: only the fresnel rim draws (a refraction-like shell). */
const FS_DOME = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  ${NOISE}
  void main() {
    float fres = pow(1.0 - abs(dot(vN, vV)), 2.6);
    float n = noise3(vP * 3.0 + vec3(uTime * 2.0));
    gl_FragColor = vec4(uColor * (1.0 + n * 0.4), fres * (0.7 + n * 0.3) * uOpacity);
  }`;

const VS_UV = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Ground wave: a noisy band that travels from the centre to the rim of a flat quad. */
const FS_WAVE = /* glsl */ `
  uniform vec3 uColor; uniform float uProgress; uniform float uOpacity; uniform float uTime; varying vec2 vUv;
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1,0)), f.x), mix(h2(i + vec2(0,1)), h2(i + vec2(1,1)), f.x), f.y); }
  void main() {
    vec2 d = vUv - 0.5; float r = length(d) * 2.0; float ang = atan(d.y, d.x);
    float band = smoothstep(uProgress - 0.26, uProgress, r) * (1.0 - smoothstep(uProgress, uProgress + 0.05, r));
    float streak = n2(vec2(ang * 7.0, r * 4.0 - uTime * 2.5));
    float a = band * (0.3 + 0.7 * streak) * uOpacity * (1.0 - smoothstep(0.9, 1.0, r));
    gl_FragColor = vec4(uColor * (1.0 + streak * 0.5), a);
  }`;

/** Ribbon / arc: bright head travelling along uv.x, soft across uv.y. */
const FS_STREAK = /* glsl */ `
  uniform vec3 uColor; uniform float uProgress; uniform float uOpacity; uniform float uTime; varying vec2 vUv;
  void main() {
    float along = vUv.x;
    float vis = step(along, uProgress);
    float head = 1.0 - clamp((uProgress - along) * 2.2, 0.0, 1.0);
    float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
    float flicker = 0.75 + 0.25 * sin(along * 40.0 - uTime * 30.0);
    float a = vis * head * smoothstep(0.0, 0.6, across) * flicker * uOpacity;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), head * 0.5), a);
  }`;

function shader(fs: string, vs: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: vs, fragmentShader: fs,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------------------------ per-kind look
interface HoldSpec {
  core: { s: number; bands: number; noise: number; core: number };
  shell: { s: number; op: number };
  rings: number;
  bolts: number;
  sprite: { n: string; c: number; every: number; size: number; speed: number; up?: number; gravity?: number };
}

const HOLD: Record<ElementKind, HoldSpec> = {
  wind:      { core: { s: 0.30, bands: 5, noise: 0.35, core: 0xffffff }, shell: { s: 0.46, op: 0.5 }, rings: 2, bolts: 0, sprite: { n: 'spark', c: 0xe8f8ff, every: 2, size: 0.22, speed: 4 } },
  lightning: { core: { s: 0.17, bands: 0, noise: 1.0, core: 0xffffff }, shell: { s: 0.30, op: 0.85 }, rings: 0, bolts: 6, sprite: { n: 'spark2', c: 0xffffff, every: 2, size: 0.3, speed: 6 } },
  fire:      { core: { s: 0.32, bands: 0, noise: 1.0, core: 0xfff0a0 }, shell: { s: 0.45, op: 0.45 }, rings: 0, bolts: 0, sprite: { n: 'flame', c: 0xff8a30, every: 1, size: 0.5, speed: 1.2, up: 2.4 } },
  water:     { core: { s: 0.34, bands: 2, noise: 0.8, core: 0xe8ffff }, shell: { s: 0.48, op: 0.4 }, rings: 1, bolts: 0, sprite: { n: 'circle', c: 0xbfeeff, every: 3, size: 0.16, speed: 3, gravity: 9 } },
  sand:      { core: { s: 0.36, bands: 3, noise: 1.0, core: 0xfff0c0 }, shell: { s: 0.50, op: 0.3 }, rings: 1, bolts: 0, sprite: { n: 'dirt', c: 0xd8c090, every: 2, size: 0.3, speed: 2.5, gravity: 6 } },
  explosion: { core: { s: 0.22, bands: 0, noise: 1.0, core: 0xffffff }, shell: { s: 0.34, op: 0.6 }, rings: 0, bolts: 0, sprite: { n: 'spark', c: 0xfff0b0, every: 2, size: 0.25, speed: 3 } },
  gentle:    { core: { s: 0.20, bands: 0, noise: 0.4, core: 0xffffff }, shell: { s: 0.42, op: 0.7 }, rings: 1, bolts: 0, sprite: { n: 'light', c: 0xbfe8ff, every: 4, size: 0.5, speed: 0.5 } },
  strength:  { core: { s: 0.24, bands: 0, noise: 0.6, core: 0xffffff }, shell: { s: 0.40, op: 0.6 }, rings: 1, bolts: 0, sprite: { n: 'magic', c: 0xffc0e0, every: 3, size: 0.4, speed: 1 } },
  taijutsu:  { core: { s: 0.16, bands: 4, noise: 0.3, core: 0xffffff }, shell: { s: 0.30, op: 0.35 }, rings: 2, bolts: 0, sprite: { n: 'trace', c: 0xffffff, every: 3, size: 0.5, speed: 4 } },
  poison:    { core: { s: 0.30, bands: 2, noise: 0.9, core: 0xe0c0ff }, shell: { s: 0.44, op: 0.35 }, rings: 0, bolts: 0, sprite: { n: 'smoke', c: 0x7a40a0, every: 2, size: 0.6, speed: 0.8, up: 0.6 } },
  push:      { core: { s: 0.18, bands: 0, noise: 0.2, core: 0xffffff }, shell: { s: 0.60, op: 0.35 }, rings: 2, bolts: 0, sprite: { n: 'light', c: 0xffe0c0, every: 5, size: 0.6, speed: 0 } },
  blade:     { core: { s: 0.14, bands: 0, noise: 0.3, core: 0xffffff }, shell: { s: 0.26, op: 0.5 }, rings: 0, bolts: 2, sprite: { n: 'spark', c: 0xffffff, every: 3, size: 0.2, speed: 5 } },
  scalpel:   { core: { s: 0.16, bands: 0, noise: 0.3, core: 0xeaffea }, shell: { s: 0.30, op: 0.6 }, rings: 0, bolts: 0, sprite: { n: 'spark2', c: 0xb0ffc8, every: 3, size: 0.2, speed: 2 } },
  dark:      { core: { s: 0.22, bands: 3, noise: 0.8, core: 0x2a0c40 }, shell: { s: 0.40, op: 0.6 }, rings: 0, bolts: 5, sprite: { n: 'spark2', c: 0xd0b0ff, every: 2, size: 0.3, speed: 5 } },
};

/** Particle debris kicked up by each kind on impact / aura. */
const DEBRIS: Record<ElementKind, { n: string; c: number; gravity: number; up: number }> = {
  wind: { n: 'spark', c: 0xe8f8ff, gravity: 0, up: 1 }, lightning: { n: 'spark2', c: 0xffffff, gravity: 0, up: 0.5 },
  fire: { n: 'flame', c: 0xff7a2a, gravity: -3, up: 3 }, water: { n: 'circle', c: 0xbfeeff, gravity: 14, up: 5 },
  sand: { n: 'dirt', c: 0xd8c090, gravity: 10, up: 4 }, explosion: { n: 'flame', c: 0xffb050, gravity: -2, up: 2 },
  gentle: { n: 'light', c: 0xbfe8ff, gravity: 0, up: 0.5 }, strength: { n: 'dirt', c: 0xb0a090, gravity: 16, up: 6 },
  taijutsu: { n: 'dirt', c: 0xc8bca8, gravity: 14, up: 4 }, poison: { n: 'smoke', c: 0x7a40a0, gravity: -1, up: 1 },
  push: { n: 'dirt', c: 0xb8aa98, gravity: 12, up: 5 }, blade: { n: 'spark', c: 0xffffff, gravity: 6, up: 1 },
  scalpel: { n: 'spark2', c: 0xb0ffc8, gravity: 0, up: 0.5 }, dark: { n: 'spark2', c: 0xc8a0ff, gravity: 0, up: 1 },
};

interface Live { obj: THREE.Object3D; t: number; life: number; tick: (k: number, dt: number) => void; dispose: () => void }
interface Held { obj: THREE.Group; last: number; miss: number; frame: number; tick: (dt: number, pos: THREE.Vector3) => void; dispose: () => void; pos: THREE.Vector3; mats: THREE.ShaderMaterial[] }

export class ElementFX {
  readonly group = new THREE.Group();
  private clock = 0;
  private live: Live[] = [];
  private held = new Map<string, Held>();
  private sphere = new THREE.SphereGeometry(1, 32, 20);
  private plane = new THREE.PlaneGeometry(1, 1);
  private ribbon = new THREE.TorusGeometry(1, 0.035, 6, 64, Math.PI * 1.35);
  private tmp = new THREE.Vector3();

  constructor(private fx: Effects) {
    fx.group.add(this.group);
  }

  // ---------------------------------------------------------------------------- materials
  private swirl(color: number, core: number, bands: number, noise: number): THREE.ShaderMaterial {
    return shader(FS_SWIRL, VS_VIEW, { uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(core) }, uTime: { value: 0 }, uOpacity: { value: 1 }, uBands: { value: bands }, uNoise: { value: noise } });
  }
  private dome(color: number): THREE.ShaderMaterial {
    return shader(FS_DOME, VS_VIEW, { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uTime: { value: 0 } });
  }
  private wave(color: number): THREE.ShaderMaterial {
    return shader(FS_WAVE, VS_UV, { uColor: { value: new THREE.Color(color) }, uProgress: { value: 0 }, uOpacity: { value: 1 }, uTime: { value: 0 } });
  }
  private streak(color: number): THREE.ShaderMaterial {
    return shader(FS_STREAK, VS_UV, { uColor: { value: new THREE.Color(color) }, uProgress: { value: 1 }, uOpacity: { value: 1 }, uTime: { value: 0 } });
  }

  // ---------------------------------------------------------------------------- lightning bolts
  /** Two crossed ribbons following a jagged path (reads as volume from any angle). */
  private boltGeometry(segs: number): THREE.BufferGeometry {
    const n = segs + 1;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
    const idx: number[] = [];
    for (let r = 0; r < 2; r++) for (let i = 0; i < segs; i++) { const b = r * n * 2 + i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    g.setIndex(idx);
    return g;
  }
  private shapeBolt(g: THREE.BufferGeometry, from: THREE.Vector3, to: THREE.Vector3, jag: number, width: number): void {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const n = pos.count / 4;
    const dir = new THREE.Vector3().subVectors(to, from);
    const up = Math.abs(dir.y) > dir.length() * 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3().crossVectors(dir, up).normalize();
    const b = new THREE.Vector3().crossVectors(dir, a).normalize();
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const env = Math.sin(Math.PI * t) * jag;
      p.copy(from).addScaledVector(dir, t).addScaledVector(a, (Math.random() * 2 - 1) * env).addScaledVector(b, (Math.random() * 2 - 1) * env);
      const w = width * (1 - t * 0.6);
      pos.setXYZ(i * 2, p.x + a.x * w, p.y + a.y * w, p.z + a.z * w);
      pos.setXYZ(i * 2 + 1, p.x - a.x * w, p.y - a.y * w, p.z - a.z * w);
      pos.setXYZ(n * 2 + i * 2, p.x + b.x * w, p.y + b.y * w, p.z + b.z * w);
      pos.setXYZ(n * 2 + i * 2 + 1, p.x - b.x * w, p.y - b.y * w, p.z - b.z * w);
    }
    pos.needsUpdate = true;
    g.computeBoundingSphere();
  }
  private boltMesh(color: number, opacity: number): THREE.Mesh {
    const m = new THREE.Mesh(this.boltGeometry(8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    return m;
  }

  /** Slash arc with uv.x along the arc and uv.y across it. */
  private arcGeometry(inner: number, outer: number, theta: number, segs = 28): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, a = t * theta;
      const c = Math.cos(a), s = Math.sin(a);
      pos.push(c * inner, 0, s * inner, c * outer, 0, s * outer);
      uv.push(t, 0, t, 1);
      if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  private add(obj: THREE.Object3D, life: number, tick: (k: number, dt: number) => void, dispose: () => void): void {
    obj.traverse((o) => { (o as THREE.Mesh).frustumCulled = false; });
    this.group.add(obj);
    this.live.push({ obj, t: 0, life, tick, dispose });
  }

  // ---------------------------------------------------------------------------- hold
  hold(key: string, kind: ElementKind, pos: THREE.Vector3, color: number, scale = 1): void {
    let h = this.held.get(key);
    if (!h) { h = this.buildHold(kind, color, scale); this.held.set(key, h); this.group.add(h.obj); }
    h.last = this.clock;
    h.miss = 0;
    h.pos.copy(pos);
  }

  private buildHold(kind: ElementKind, color: number, scale: number): Held {
    const spec = HOLD[kind] ?? HOLD.wind;
    const g = new THREE.Group();
    const mats: THREE.ShaderMaterial[] = [];
    const extra: THREE.Material[] = [];
    const core = new THREE.Mesh(this.sphere, this.swirl(color, spec.core.core, spec.core.bands, spec.core.noise));
    core.scale.setScalar(spec.core.s * scale);
    mats.push(core.material as THREE.ShaderMaterial);
    const shell = new THREE.Mesh(this.sphere, this.dome(color));
    shell.scale.setScalar(spec.shell.s * scale);
    (shell.material as THREE.ShaderMaterial).uniforms.uOpacity.value = spec.shell.op;
    mats.push(shell.material as THREE.ShaderMaterial);
    g.add(core, shell);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < spec.rings; i++) {
      const r = new THREE.Mesh(this.ribbon, this.streak(i ? 0xffffff : color));
      r.scale.setScalar((spec.shell.s * 1.15 + i * 0.1) * scale);
      r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      mats.push(r.material as THREE.ShaderMaterial);
      rings.push(r); g.add(r);
    }
    const bolts: THREE.Mesh[] = [];
    for (let i = 0; i < spec.bolts; i++) {
      const b = this.boltMesh(i % 2 ? color : 0xffffff, i % 2 ? 0.55 : 0.95);
      extra.push(b.material as THREE.Material);
      bolts.push(b); this.group.add(b);
    }
    const pos = new THREE.Vector3();
    const h: Held = {
      obj: g, last: this.clock, miss: 0, frame: 0, pos, mats,
      tick: (dt, p) => {
        h.frame++;
        g.position.copy(p);
        const pulse = 1 + Math.sin(this.clock * 30) * 0.06;
        core.scale.setScalar(spec.core.s * scale * pulse);
        for (const m of mats) m.uniforms.uTime.value = this.clock;
        rings.forEach((r, i) => { r.rotation.x += dt * (6 + i * 3); r.rotation.z += dt * (4 - i * 2); });
        if (bolts.length && h.frame % 2 === 0) {
          for (const b of bolts) {
            this.tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar((0.45 + Math.random() * 0.7) * scale);
            this.shapeBolt(b.geometry, p, this.tmp.add(p), 0.12 * scale, 0.018 * scale);
          }
        }
        if (h.frame % spec.sprite.every === 0) {
          this.fx.spriteBurst(spec.sprite.n, p, { color: spec.sprite.c, count: 1, size: spec.sprite.size * scale, life: 0.22, speed: spec.sprite.speed, up: spec.sprite.up ?? 0, gravity: spec.sprite.gravity ?? 0, additive: spec.sprite.n !== 'smoke' && spec.sprite.n !== 'dirt', spin: 6 });
        }
      },
      dispose: () => {
        for (const m of mats) m.dispose();
        for (const b of bolts) { this.group.remove(b); b.geometry.dispose(); }
        for (const m of extra) m.dispose();
      },
    };
    return h;
  }

  // ---------------------------------------------------------------------------- impact
  impact(kind: ElementKind, pos: THREE.Vector3, color: number, scale = 1, groundY?: number): void {
    const feet = pos.clone();
    feet.y = groundY !== undefined ? groundY + 0.04 : Math.max(0.04, pos.y - 1);
    // POLYGON: expanding shock dome + a flash of the chakra ball.
    this.shockDome(pos, color, 2.4 * scale, kind === 'push' ? 0.6 : 0.35);
    const ball = new THREE.Mesh(this.sphere, this.swirl(color, 0xffffff, kind === 'wind' ? 6 : 0, kind === 'wind' ? 0.3 : 0.9));
    ball.position.copy(pos);
    const ballLife = kind === 'wind' ? 0.45 : 0.22;
    const bm = ball.material as THREE.ShaderMaterial;
    this.add(ball, ballLife, (k) => { ball.scale.setScalar((0.3 + k * (kind === 'wind' ? 1.6 : 1.0)) * scale); bm.uniforms.uOpacity.value = 1 - k; bm.uniforms.uTime.value = this.clock; }, () => bm.dispose());
    // AIRFLOW: ground wave.
    this.groundWave(feet, color, 7 * scale, 0.5, 0.8);
    // EDGE: bolts / arcs / wind ribbons.
    if (kind === 'lightning' || kind === 'dark') this.radialBolts(pos, color, 8, 2.6 * scale);
    if (kind === 'blade' || kind === 'scalpel') for (let i = 0; i < 3; i++) this.slashArc(pos, color, 1.3 * scale, i * 0.05);
    if (kind === 'wind' || kind === 'taijutsu' || kind === 'push' || kind === 'gentle') for (let i = 0; i < 3; i++) this.windRibbon(pos, kind === 'gentle' ? color : 0xffffff, 1.0 * scale, i);
    // VERTEX: debris.
    const d = DEBRIS[kind] ?? DEBRIS.wind;
    this.fx.spriteBurst(d.n, pos, { color: d.c, count: Math.round(14 * scale), size: 0.35 * Math.sqrt(scale), life: 0.55, speed: 7 * scale, up: d.up, gravity: d.gravity, additive: d.n !== 'dirt' && d.n !== 'smoke', spin: 8, spread: 0.3 });
    if (kind === 'strength' || kind === 'push' || kind === 'explosion' || kind === 'sand') this.fx.groundCrack(feet, 1.8 * scale, kind === 'explosion');
    if (kind === 'explosion' || kind === 'fire') {
      this.fx.spriteBurst('flame', pos, { color: 0xff9a40, count: Math.round(10 * scale), size: 1.0 * scale, life: 0.5, speed: 4 * scale, up: 2, additive: true, spin: 3, grow: 2 });
      this.fx.spriteBurst('smoke2', pos, { color: 0x4a4038, count: Math.round(6 * scale), size: 1.4 * scale, life: 0.9, speed: 2 * scale, up: 1.5, grow: 2.5, spin: 1 });
    }
    if (kind === 'water') this.fx.spriteBurst('smoke2', feet, { color: 0xd8f4ff, count: Math.round(8 * scale), size: 1.2 * scale, life: 0.7, speed: 3 * scale, up: 1, grow: 2, additive: false });
    if (kind === 'sand' || kind === 'strength' || kind === 'push' || kind === 'taijutsu') this.fx.dustKick(feet, Math.round(10 * scale), 0.9 * scale, 1.2 * scale);
    this.fx.flash('light', pos, 2.4 * scale, color, 0.16);
  }

  // ---------------------------------------------------------------------------- aura (airflow)
  aura(kind: ElementKind, feet: THREE.Vector3, color: number, strength = 1): void {
    const base = feet.clone(); base.y += 0.04;
    this.groundWave(base, color, 4.2 * strength, 0.28, 0.65);
    for (let i = 0; i < 2; i++) {
      const p = base.clone(); p.y += 0.3 + Math.random() * 0.6;
      this.windRibbon(p, i ? 0xffffff : color, (0.8 + Math.random() * 0.3) * strength, i, true);
    }
    const d = DEBRIS[kind] ?? DEBRIS.wind;
    // gravel lifted by the chakra pressure, and the kind's own motes rising around the body
    this.fx.spriteBurst('dirt', base, { color: 0xb8aa98, count: Math.round(3 * strength), size: 0.12, life: 0.5, speed: 2.2, up: 3.5, gravity: 9, spread: 1, spin: 6 });
    const mid = base.clone(); mid.y += 0.9;
    this.fx.spriteBurst(d.n === 'dirt' ? 'magic' : d.n, mid, { color: d.n === 'dirt' ? color : d.c, count: Math.round(2 * strength), size: 0.4, life: 0.5, speed: 1.2, up: 2.2, additive: d.n !== 'smoke', spin: 3, spread: 0.6, fadeIn: 0.15 });
    if (kind === 'lightning' || kind === 'dark') this.radialBolts(mid, color, 2, 1.1 * strength);
  }

  // ---------------------------------------------------------------------------- building blocks
  shockDome(pos: THREE.Vector3, color: number, size: number, life = 0.35): void {
    const m = new THREE.Mesh(this.sphere, this.dome(color));
    m.position.copy(pos);
    const mat = m.material as THREE.ShaderMaterial;
    this.add(m, life, (k) => { m.scale.setScalar(0.2 + size * (1 - (1 - k) * (1 - k))); mat.uniforms.uOpacity.value = (1 - k) * 1.2; mat.uniforms.uTime.value = this.clock; }, () => mat.dispose());
  }

  groundWave(feet: THREE.Vector3, color: number, size: number, opacity: number, life: number): void {
    const m = new THREE.Mesh(this.plane, this.wave(color));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(feet);
    m.scale.setScalar(size);
    m.renderOrder = 6;
    const mat = m.material as THREE.ShaderMaterial;
    this.add(m, life, (k) => { mat.uniforms.uProgress.value = 0.1 + k * 0.9; mat.uniforms.uOpacity.value = opacity * (1 - k * 0.6); mat.uniforms.uTime.value = this.clock; }, () => mat.dispose());
  }

  windRibbon(pos: THREE.Vector3, color: number, radius: number, i: number, rising = false): void {
    const m = new THREE.Mesh(this.ribbon, this.streak(color));
    m.position.copy(pos);
    m.rotation.set(rising ? Math.PI / 2 + (Math.random() - 0.5) * 0.5 : Math.random() * Math.PI, Math.random() * Math.PI * 2, 0);
    const mat = m.material as THREE.ShaderMaterial;
    const spin = (i % 2 ? -1 : 1) * (5 + Math.random() * 4);
    const y0 = pos.y;
    this.add(m, rising ? 0.6 : 0.4, (k, dt) => {
      m.scale.setScalar(radius * (0.7 + k * (rising ? 0.6 : 1.4)));
      m.rotation.z += spin * dt;
      if (rising) m.position.y = y0 + k * 1.3;
      mat.uniforms.uProgress.value = Math.min(1, 0.2 + k * 1.6);
      mat.uniforms.uOpacity.value = rising ? 0.45 * (1 - k) : 1 - k;
      mat.uniforms.uTime.value = this.clock;
    }, () => mat.dispose());
  }

  radialBolts(pos: THREE.Vector3, color: number, count: number, length: number): void {
    for (let i = 0; i < count; i++) {
      const b = this.boltMesh(i % 2 ? color : 0xffffff, 0.9);
      const to = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.2 - 0.4, Math.random() * 2 - 1).normalize().multiplyScalar(length * (0.6 + Math.random() * 0.5)).add(pos);
      this.shapeBolt(b.geometry, pos, to, 0.2 * length / 2.6, 0.03);
      const mat = b.material as THREE.MeshBasicMaterial;
      let fr = 0;
      this.add(b, 0.18 + Math.random() * 0.08, (k) => {
        mat.opacity = 0.95 * (1 - k);
        if (++fr % 2 === 0) this.shapeBolt(b.geometry, pos, to, 0.2 * length / 2.6, 0.03 * (1 - k * 0.5));
      }, () => { b.geometry.dispose(); mat.dispose(); });
    }
  }

  slashArc(pos: THREE.Vector3, color: number, radius: number, delay: number): void {
    const theta = Math.PI * (0.9 + Math.random() * 0.5);
    const m = new THREE.Mesh(this.arcGeometry(radius * 0.72, radius, theta), this.streak(color));
    m.position.copy(pos);
    m.rotation.set((Math.random() - 0.5) * 2.4, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 2.4);
    const mat = m.material as THREE.ShaderMaterial;
    this.add(m, 0.26 + delay, (k) => {
      const kk = Math.max(0, (k * (0.26 + delay) - delay) / 0.26);
      mat.uniforms.uProgress.value = Math.min(1.2, kk * 2.2);
      mat.uniforms.uOpacity.value = kk <= 0 ? 0 : 1 - Math.max(0, kk - 0.5) * 2;
      mat.uniforms.uTime.value = this.clock;
    }, () => { m.geometry.dispose(); mat.dispose(); });
  }

  // ---------------------------------------------------------------------------- update
  update(dt: number): void {
    this.clock += dt;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.t += dt;
      const k = Math.min(1, e.t / e.life);
      e.tick(k, dt);
      if (k >= 1) {
        this.group.remove(e.obj);
        e.dispose();
        this.live.splice(i, 1);
      }
    }
    for (const [key, h] of this.held) {
      // Fade only when the effect missed several updates *and* some time passed: a single long frame
      // (slow machine, background tab) must not drop an effect that is still being refreshed.
      h.miss++;
      if (h.miss > 2 && this.clock - h.last > 0.1) {
        // no longer refreshed: fade the held effect out over 0.18 s
        this.held.delete(key);
        const g = h.obj;
        const mats = h.mats;
        const op0 = mats.map((m) => m.uniforms.uOpacity.value as number);
        this.live.push({ obj: g, t: 0, life: 0.18, tick: (k) => { mats.forEach((m, j) => { m.uniforms.uOpacity.value = op0[j] * (1 - k); }); g.scale.setScalar(1 + k * 0.5); }, dispose: h.dispose });
        continue;
      }
      h.tick(dt, h.pos);
    }
  }
}
