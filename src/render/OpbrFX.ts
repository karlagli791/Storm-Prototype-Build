/**
 * OpbrFX.ts — effects for the One Piece skills.
 *
 * Built on the existing pools (Effects sprites/decals, ElementFX shader shells) plus the pieces
 * the Devil Fruits need and nothing else had: a ROOM sphere, gravity orbs and meteors, mochi
 * blobs, Kuma's paw shock, a crow swarm and Conqueror's Haki lightning.
 */
import * as THREE from 'three';
import { OpbrFxKind } from '../core/Types';
import { Effects } from './Effects';

const FRESNEL_VS = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const ROOM_FS = /* glsl */ `
  precision highp float;
  uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 1.6);
    // Scan lines crawling up the dome sell the "operating room" look.
    float scan = 0.5 + 0.5 * sin(vN.y * 42.0 - uTime * 3.0);
    float a = (f * 0.85 + scan * 0.12) * uOpacity;
    gl_FragColor = vec4(uColor * (0.7 + f), a);
  }
`;
const ORB_FS = /* glsl */ `
  precision highp float;
  uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 2.2);
    float swirl = 0.5 + 0.5 * sin(vN.x * 9.0 + vN.z * 7.0 - uTime * 6.0);
    vec3 c = mix(uColor * 0.25, uColor, swirl);
    gl_FragColor = vec4(c + f * 0.8, (0.55 + f * 0.45) * uOpacity);
  }
`;

interface Timed { obj: THREE.Object3D; life: number; max: number; grow: number; spin?: number; fall?: THREE.Vector3; }

export class OpbrFX {
  readonly group = new THREE.Group();
  private live: Timed[] = [];
  private sphereGeo = new THREE.SphereGeometry(1, 24, 18);
  private blobGeo = new THREE.IcosahedronGeometry(1, 1);
  private rockGeo = new THREE.DodecahedronGeometry(1, 0);
  private pawTex: THREE.Texture | null = null;
  private clock = 0;

  constructor(private fx: Effects) {
    this.group.renderOrder = 12;
  }

  // -------------------------------------------------------------------- helpers
  private shell(fs: string, color: number, opacity: number, pos: THREE.Vector3, radius: number, life: number, grow = 0): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      vertexShader: FRESNEL_VS, fragmentShader: fs,
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.sphereGeo, mat);
    m.position.copy(pos);
    m.scale.setScalar(radius);
    this.group.add(m);
    this.live.push({ obj: m, life, max: life, grow });
    return m;
  }

  /** Kuma's paw pad, drawn once and reused as a ground decal. */
  private paw(): THREE.Texture {
    if (this.pawTex) return this.pawTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(255,255,255,0)';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(64, 78, 30, 26, 0, 0, Math.PI * 2);
    g.fill();
    for (const [x, y, r] of [[34, 40, 11], [54, 30, 12], [76, 30, 12], [96, 42, 11]] as const) {
      g.beginPath();
      g.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    this.pawTex = t;
    return t;
  }

  private pawPrint(pos: THREE.Vector3, color: number, size: number, life = 0.5): void {
    const mat = new THREE.MeshBasicMaterial({ map: this.paw(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.position.copy(pos);
    m.scale.setScalar(size);
    m.lookAt(pos.clone().add(new THREE.Vector3(0, 0.001, -1)));
    this.group.add(m);
    this.live.push({ obj: m, life, max: life, grow: size * 1.6 });
  }

  private blob(pos: THREE.Vector3, color: number, size: number, vel: THREE.Vector3, life: number): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const m = new THREE.Mesh(this.blobGeo, mat);
    m.position.copy(pos);
    m.scale.set(size, size * 0.8, size);
    this.group.add(m);
    this.live.push({ obj: m, life, max: life, grow: -size * 0.3, fall: vel, spin: 3 });
  }

  // ---------------------------------------------------------------------- kinds
  /** One effect event from a skill's `fx` list. */
  play(kind: OpbrFxKind, pos: THREE.Vector3, dir: THREE.Vector3, color: number, scale = 1, groundY = 0): void {
    const e = this.fx;
    const ahead = pos.clone().addScaledVector(dir, 0.9 * scale);
    switch (kind) {
      case 'haki':
        // Armament: the limb goes black with a hard metallic sheen and a thin shock.
        e.spriteBurst('spark', pos, { color: 0x2a2a3a, count: 10, size: 0.32 * scale, life: 0.3, speed: 4, additive: false });
        e.spriteBurst('light', pos, { color: 0xc8a8ff, count: 4, size: 0.5 * scale, life: 0.22, speed: 2.5 });
        e.el.shockDome(pos, 0x6a5a8a, 0.9 * scale, 0.26);
        break;
      case 'haki_burst':
        e.el.shockDome(pos, color, 1.4 * scale, 0.35);
        e.el.groundWave(pos.clone().setY(groundY), color, 3.4 * scale, 0.5, 0.6);
        e.spriteBurst('spark2', pos, { color, count: 22, size: 0.45 * scale, life: 0.5, speed: 9, up: 3 });
        e.flash('light', pos, 3.4 * scale, color, 0.22);
        break;
      case 'conqueror':
        // Haoshoku: black-violet lightning cracking out of the body, then a wide dome.
        e.el.radialBolts(pos, 0x7a4adf, 10, 4.2 * scale);
        e.el.shockDome(pos, 0x3a1a5a, 2.2 * scale, 0.5);
        e.el.groundWave(pos.clone().setY(groundY), 0x7a4adf, 6.5 * scale, 0.55, 0.8);
        e.spriteBurst('spark', pos, { color: 0xb08aff, count: 26, size: 0.5 * scale, life: 0.6, speed: 12, up: 4 });
        e.flash('window', pos, 6 * scale, 0x8a5aff, 0.3);
        break;
      case 'slash':
      case 'blade_arc':
        e.el.slashArc(ahead, color, 1.0 * scale, 0);
        e.el.slashArc(ahead, 0xffffff, 0.7 * scale, 0.04);
        e.spriteBurst('slash', ahead, { color, count: 2, size: 1.5 * scale, life: 0.14, speed: 0.5 });
        break;
      case 'impact':
        e.hitSpark(ahead, color, 12, 7 * scale);
        e.el.shockDome(ahead, color, 0.7 * scale, 0.16);
        e.flash('light', ahead, 1.6 * scale, color, 0.12);
        break;
      case 'shock':
        // A tight ring of pressure, not a bubble around the whole fighter.
        e.el.shockDome(ahead, color, 0.9 * scale, 0.22);
        e.el.groundWave(ahead.clone().setY(groundY), color, 3.2 * scale, 0.4, 0.4);
        e.gust(ahead, 2.4 * scale, color);
        break;
      case 'quake':
        e.groundCrack(pos.clone().setY(groundY), 2.6 * scale, false);
        e.el.groundWave(pos.clone().setY(groundY), color, 5 * scale, 0.5, 0.7);
        e.dustKick(pos.clone().setY(groundY), 16, 1.5 * scale, 2.4 * scale);
        break;
      case 'dust':
        e.dustKick(pos.clone().setY(groundY), 10, 1.0 * scale, 1.4 * scale);
        break;
      case 'wind':
        e.gust(pos, 3.2 * scale, color);
        for (let i = 0; i < 4; i++) e.el.windRibbon(pos, color, 1.1 * scale, i, true);
        break;
      case 'fire':
        e.spriteBurst('flame', ahead, { color: 0xff8a2a, count: 18, size: 1.1 * scale, life: 0.45, speed: 7, up: 2.4, grow: 1.6, additive: true });
        e.flash('light', ahead, 3 * scale, 0xffb050, 0.2);
        e.el.shockDome(ahead, 0xff7a20, 1.0 * scale, 0.26);
        break;
      case 'fire_trail':
        e.spriteBurst('flame', pos, { color: 0xff7a1a, count: 6, size: 0.8 * scale, life: 0.35, speed: 2.5, up: 1.6, grow: 1.4 });
        break;
      case 'gum':
        // Rubber: a white ring at the stretch point and a snap of speed lines.
        e.el.shockDome(ahead, 0xffffff, 0.8 * scale, 0.18);
        e.spriteBurst('trace', pos, { color: 0xffe9c0, count: 5, size: 0.9 * scale, life: 0.18, speed: 6 });
        break;
      case 'room': {
        const m = this.shell(ROOM_FS, color || 0x6ad8ff, 0.32, pos.clone().setY(groundY + 3.6), 0.6, 1.9, 7.0);
        m.userData.room = true;
        e.el.groundWave(pos.clone().setY(groundY), color || 0x6ad8ff, 9 * scale, 0.35, 1.1);
        break;
      }
      case 'shambles':
        e.spriteBurst('magic', pos, { color: 0x8adfff, count: 14, size: 0.6 * scale, life: 0.3, speed: 6, additive: true });
        e.flash('light', pos, 2.2 * scale, 0x8adfff, 0.16);
        break;
      case 'gamma':
        e.flash('window', ahead, 2.4 * scale, 0x9fe8ff, 0.22);
        e.spriteBurst('spark2', ahead, { color: 0x9fe8ff, count: 16, size: 0.4 * scale, life: 0.4, speed: 5 });
        this.shell(ORB_FS, 0x8adfff, 0.55, ahead, 0.35 * scale, 0.45, 0.8);
        break;
      case 'gravity': {
        // A dense little core, not a bubble the size of the fighter.
        const orb = this.shell(ORB_FS, color || 0x5a3aa8, 0.6, pos, 0.4 * scale, 0.55, 0.5);
        orb.userData.grav = true;
        e.el.groundWave(pos.clone().setY(groundY), 0x7a5ad0, 3.2 * scale, 0.4, 0.5);
        break;
      }
      case 'meteor': {
        // A rock falls in front of the fighter and explodes on the floor.
        const start = ahead.clone().setY(groundY + 11 * scale);
        const mat = new THREE.MeshBasicMaterial({ color: 0x5a4a44 });
        const rock = new THREE.Mesh(this.rockGeo, mat);
        rock.position.copy(start);
        rock.scale.setScalar(0.9 * scale);
        this.group.add(rock);
        this.live.push({ obj: rock, life: 0.55, max: 0.55, grow: 0, spin: 5, fall: new THREE.Vector3(0, -20 * scale, 0) });
        break;
      }
      case 'mochi':
        for (let i = 0; i < 7; i++) {
          const v = new THREE.Vector3(dir.x * 6 + (Math.random() - 0.5) * 3, 2 + Math.random() * 3, dir.z * 6 + (Math.random() - 0.5) * 3);
          this.blob(ahead.clone(), color || 0xf5d8e0, 0.26 * scale * (0.7 + Math.random()), v, 0.6);
        }
        e.el.shockDome(ahead, 0xf0c8d8, 0.8 * scale, 0.22);
        break;
      case 'paw':
        this.pawPrint(ahead.clone().addScaledVector(dir, 0.6), color || 0xff9ad0, 2.4 * scale, 0.42);
        e.el.shockDome(ahead, color || 0xff9ad0, 1.1 * scale, 0.26);
        e.gust(ahead, 3.4 * scale, 0xffd0e8);
        break;
      case 'pawprint':
        this.pawPrint(pos.clone().setY(groundY + 0.06), color || 0xff9ad0, 3.4 * scale, 0.6);
        break;
      case 'crow':
        // The swarm: dark sprites scattering with a violet core.
        e.spriteBurst('smoke2', pos, { color: 0x1a1a22, count: 20, size: 0.7 * scale, life: 0.55, speed: 7, up: 2, spin: 4, additive: false });
        e.spriteBurst('scratch', pos, { color: 0x2a2030, count: 12, size: 0.6 * scale, life: 0.45, speed: 9, spin: 7, additive: false });
        e.spriteBurst('spark', pos, { color: 0x9a6aff, count: 6, size: 0.35 * scale, life: 0.3, speed: 5 });
        break;
      case 'lion':
        e.el.shockDome(pos, 0xffd070, 1.0 * scale, 0.32);
        e.spriteBurst('star', pos, { color: 0xffe0a0, count: 12, size: 0.6 * scale, life: 0.4, speed: 6 });
        e.dustKick(pos.clone().setY(groundY), 14, 1.4 * scale, 2.6 * scale);
        break;
    }
  }

  update(dt: number): void {
    this.clock += dt;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const t = this.live[i];
      t.life -= dt;
      const k = Math.max(0, t.life / t.max);
      const o = t.obj as THREE.Mesh;
      const mat = o.material as THREE.Material & { opacity?: number; uniforms?: Record<string, { value: unknown }> };
      if (t.grow) o.scale.addScalar(t.grow * dt);
      if (t.spin) o.rotation.y += t.spin * dt;
      if (t.fall) {
        o.position.addScaledVector(t.fall, dt);
        t.fall.y -= 24 * dt;
      }
      if (mat.uniforms) {
        if (mat.uniforms.uTime) mat.uniforms.uTime.value = this.clock;
        if (mat.uniforms.uOpacity) {
          const base = o.userData.room ? 0.5 : 0.85;
          mat.uniforms.uOpacity.value = base * (o.userData.room ? Math.min(1, k * 3) : k);
        }
      } else if (mat.opacity !== undefined) {
        mat.transparent = true;
        mat.opacity = 0.9 * k;
      }
      if (t.life <= 0) {
        // A meteor bursts where it lands.
        if (t.fall && (o.geometry as THREE.BufferGeometry) === this.rockGeo) {
          this.fx.groundCrack(o.position.clone().setY(o.position.y), 3.2, true);
          this.fx.spriteBurst('flame', o.position, { color: 0xffa040, count: 16, size: 1.3, life: 0.5, speed: 8, up: 3, grow: 2 });
          this.fx.el.shockDome(o.position, 0xffb060, 3.0, 0.4);
        }
        this.group.remove(o);
        (o.material as THREE.Material).dispose?.();
        this.live.splice(i, 1);
      }
    }
  }
}
