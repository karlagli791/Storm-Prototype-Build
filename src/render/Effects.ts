/**
 * Effects.ts — Lightweight VFX pool: hit sparks, spark-dash flash, substitution log + smoke,
 * guard sphere, dash trail, Rasengan / Chidori jutsu emitters, clash burst, wall-splat dust.
 */
import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  grow: number;
  gravity: number;
  spin: number;
}

interface SpriteFx {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  grow: number;
  gravity: number;
  spin: number;
  fadeIn: number;
}

/** Kenney particle sheets (CC0) in public/assets/vfx. */
const VFX_TEX: Record<string, string> = {
  spark: 'assets/vfx/spark_04.png',
  spark2: 'assets/vfx/spark_05.png',
  star: 'assets/vfx/star_07.png',
  flare: 'assets/vfx/flare_01.png',
  light: 'assets/vfx/light_02.png',
  smoke: 'assets/vfx/smoke_04.png',
  smoke2: 'assets/vfx/smoke_08.png',
  dirt: 'assets/vfx/dirt_02.png',
  magic: 'assets/vfx/magic_04.png',
  magic2: 'assets/vfx/magic_05.png',
  twirl: 'assets/vfx/twirl_02.png',
  slash: 'assets/vfx/slash_03.png',
  circle: 'assets/vfx/circle_05.png',
  trace: 'assets/vfx/trace_03.png',
  scorch: 'assets/vfx/scorch_01.png',
  flame: 'assets/vfx/flame_03.png',
};

export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  private sprites: SpriteFx[] = [];
  private texCache = new Map<string, THREE.Texture>();
  private spriteMatCache = new Map<string, THREE.SpriteMaterial>();

  private tex(name: string): THREE.Texture {
    let t = this.texCache.get(name);
    if (!t) {
      t = new THREE.TextureLoader().load(VFX_TEX[name] ?? VFX_TEX.spark);
      t.colorSpace = THREE.SRGBColorSpace;
      this.texCache.set(name, t);
    }
    return t;
  }

  private spriteMat(name: string, color: number, additive: boolean): THREE.SpriteMaterial {
    const key = `${name}|${color}|${additive ? 1 : 0}`;
    let m = this.spriteMatCache.get(key);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: this.tex(name), color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 1 });
      this.spriteMatCache.set(key, m);
    }
    return m;
  }

  /**
   * Billboard burst: `count` sprites of sheet `name` thrown from `pos`. Additive for light/sparks,
   * normal blending for smoke/dirt. Each sprite gets its own material clone so opacity can fade.
   */
  spriteBurst(name: string, pos: THREE.Vector3, opts: { color?: number; count?: number; size?: number; life?: number; speed?: number; up?: number; gravity?: number; grow?: number; additive?: boolean; spin?: number; spread?: number; fadeIn?: number } = {}): void {
    const count = opts.count ?? 6;
    const base = this.spriteMat(name, opts.color ?? 0xffffff, opts.additive ?? true);
    for (let i = 0; i < count; i++) {
      const mat = base.clone();
      mat.rotation = Math.random() * Math.PI * 2;
      const sp = new THREE.Sprite(mat);
      const size = (opts.size ?? 0.8) * (0.7 + Math.random() * 0.6);
      sp.scale.setScalar(size);
      sp.position.copy(pos);
      const spread = opts.spread ?? 0.25;
      sp.position.x += (Math.random() - 0.5) * spread * 2;
      sp.position.y += (Math.random() - 0.5) * spread * 2;
      sp.position.z += (Math.random() - 0.5) * spread * 2;
      const vel = new THREE.Vector3((Math.random() - 0.5) * 2, (opts.up ?? 0.4) + Math.random() * 0.8, (Math.random() - 0.5) * 2);
      vel.normalize().multiplyScalar((opts.speed ?? 2.5) * (0.4 + Math.random() * 0.9));
      this.group.add(sp);
      const life = (opts.life ?? 0.35) * (0.7 + Math.random() * 0.6);
      this.sprites.push({ sprite: sp, vel, life, maxLife: life, grow: opts.grow ?? 0, gravity: opts.gravity ?? 0, spin: (opts.spin ?? 0) * (Math.random() < 0.5 ? -1 : 1), fadeIn: opts.fadeIn ?? 0 });
    }
  }

  /** One big flat flash at the impact point (hit flash / jutsu flash). */
  flash(name: string, pos: THREE.Vector3, size = 2.2, color = 0xffffff, life = 0.18): void {
    this.spriteBurst(name, pos, { color, count: 1, size, life, speed: 0, up: 0, spread: 0, grow: size * 3, additive: true });
  }
  private sphereGeo = new THREE.SphereGeometry(1, 8, 6);
  private boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private logGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.2, 10);
  private logMat = new THREE.MeshBasicMaterial({ color: 0x8a5a2b });
  private logRingMat = new THREE.MeshBasicMaterial({ color: 0x5a3818 });
  private matCache = new Map<number, THREE.MeshBasicMaterial>();

  private mat(color: number, opacity = 1): THREE.MeshBasicMaterial {
    const key = color * 1000 + Math.round(opacity * 100);
    let m = this.matCache.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
      this.matCache.set(key, m);
    }
    return m;
  }

  private spawn(geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, opts: { grow?: number; gravity?: number; spin?: number } = {}): Particle {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(size);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.group.add(mesh);
    const p: Particle = { mesh, vel: vel.clone(), life, maxLife: life, grow: opts.grow ?? 0, gravity: opts.gravity ?? 0, spin: opts.spin ?? 0 };
    this.particles.push(p);
    return p;
  }

  update(dt: number): void {
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const p = this.sprites[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.sprite);
        p.sprite.material.dispose();
        this.sprites.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      if (p.grow) p.sprite.scale.addScalar(p.grow * dt);
      p.sprite.material.rotation += p.spin * dt;
      const age = 1 - t;
      const fade = p.fadeIn > 0 ? Math.min(1, age / p.fadeIn) : 1;
      p.sprite.material.opacity = Math.min(1, t * 1.4) * fade;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      const s = p.mesh.scale.x + p.grow * dt;
      p.mesh.scale.setScalar(Math.max(0.001, s * (p.grow === 0 ? t : 1)));
      p.mesh.rotation.y += p.spin * dt;
      const m = p.mesh.material as THREE.MeshBasicMaterial;
      if (m.transparent) m.opacity = Math.min(m.opacity, t);
    }
  }

  hitSpark(pos: THREE.Vector3, color = 0xffe066, count = 10, power = 6): void {
    this.flash('light', pos, 1.6 + power * 0.08, 0xffffff, 0.14);
    this.spriteBurst('spark', pos, { color, count: Math.min(8, Math.round(count * 0.7)), size: 0.55, life: 0.3, speed: 4.5, up: 0.6, gravity: -9, additive: true, spin: 6 });
    this.spriteBurst('star', pos, { color: 0xffffff, count: 2, size: 0.9, life: 0.16, speed: 0.5, grow: 2.5, additive: true });
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(power * (0.5 + Math.random()));
      this.spawn(this.boxGeo, this.mat(color), pos, v, 0.25 + Math.random() * 0.2, 0.12 + Math.random() * 0.1, { gravity: -12, spin: 20 });
    }
    // flash sphere
    this.spawn(this.sphereGeo, this.mat(0xffffff, 0.8), pos, new THREE.Vector3(), 0.12, 0.35, { grow: 6 });
  }

  guardSpark(pos: THREE.Vector3, color: number): void {
    this.flash('circle', pos, 1.4, color, 0.16);
    this.spriteBurst('spark2', pos, { color, count: 5, size: 0.45, life: 0.25, speed: 3.5, additive: true, spin: 4 });
    this.spawn(this.sphereGeo, this.mat(color, 0.6), pos, new THREE.Vector3(), 0.18, 0.6, { grow: 5 });
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random(), (Math.random() - 0.5)).multiplyScalar(4);
      this.spawn(this.boxGeo, this.mat(color), pos, v, 0.25, 0.08, { gravity: -8 });
    }
  }

  parryFlash(pos: THREE.Vector3): void {
    this.spawn(this.sphereGeo, this.mat(0x9be7ff, 0.9), pos, new THREE.Vector3(), 0.3, 0.5, { grow: 10 });
    this.spawn(this.sphereGeo, this.mat(0xffffff, 0.9), pos, new THREE.Vector3(), 0.16, 0.3, { grow: 14 });
  }

  /** Yellow spark denoting a Spark Dash cancel. */
  sparkDash(pos: THREE.Vector3): void {
    this.spawn(this.sphereGeo, this.mat(0xffee33, 0.95), pos, new THREE.Vector3(), 0.22, 0.6, { grow: 9 });
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize().multiplyScalar(9);
      this.spawn(this.boxGeo, this.mat(0xffee33), pos, v, 0.3, 0.1, { spin: 30 });
    }
  }

  chargeAura(pos: THREE.Vector3, color: number): void {
    this.spriteBurst('magic', pos, { color, count: 2, size: 0.7, life: 0.5, speed: 1.2, up: 1.4, additive: true, spin: 2, spread: 0.6, fadeIn: 0.2 });
    const off = new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.3, (Math.random() - 0.5) * 1.2);
    const p = pos.clone().add(off);
    this.spawn(this.boxGeo, this.mat(color, 0.9), p, new THREE.Vector3(0, 4 + Math.random() * 3, 0), 0.35, 0.09);
  }

  dashTrail(pos: THREE.Vector3, color: number): void {
    this.spriteBurst('light', pos, { color, count: 1, size: 1.1, life: 0.22, speed: 0, up: 0, additive: true, grow: 1.5 });
    this.spawn(this.sphereGeo, this.mat(color, 0.45), pos, new THREE.Vector3(), 0.18, 0.5);
  }

  clashBurst(pos: THREE.Vector3): void {
    this.flash('flare', pos, 3.5, 0xffffff, 0.3);
    this.spriteBurst('twirl', pos, { color: 0xfff1a8, count: 1, size: 2.4, life: 0.35, speed: 0, up: 0, grow: 6, additive: true, spin: 5 });
    this.spriteBurst('spark', pos, { color: 0xffe066, count: 12, size: 0.6, life: 0.4, speed: 7, up: 0.7, gravity: -12, additive: true, spin: 8 });
    this.spawn(this.sphereGeo, this.mat(0xffffff, 0.9), pos, new THREE.Vector3(), 0.25, 0.8, { grow: 12 });
    this.spawn(this.sphereGeo, this.mat(0x3fa9ff, 0.6), pos, new THREE.Vector3(), 0.4, 0.4, { grow: 18 });
    for (let i = 0; i < 18; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.6, (Math.random() - 0.5)).normalize().multiplyScalar(11);
      this.spawn(this.boxGeo, this.mat(0xcfe9ff), pos, v, 0.4, 0.12, { gravity: -14, spin: 25 });
    }
  }

  /** Substitution: drops a log where the victim was, plus a smoke puff. */
  substitutionLog(pos: THREE.Vector3): void {
    const log = new THREE.Mesh(this.logGeo, this.logMat);
    log.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 14), this.logRingMat);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = 0.3;
    const ring2 = ring1.clone();
    ring2.position.y = -0.3;
    log.add(ring1, ring2);
    const p = pos.clone();
    p.y += 0.6;
    log.position.copy(p);
    this.group.add(log);
    this.particles.push({ mesh: log, vel: new THREE.Vector3(0, 3.5, 0), life: 1.4, maxLife: 1.4, grow: 0.0001, gravity: -14, spin: 4 });
    this.smokePuff(pos, 0xf2f2f2, 12);
  }

  smokePuff(pos: THREE.Vector3, color = 0xdddddd, count = 10): void {
    this.spriteBurst('smoke', pos, { color, count: Math.min(6, Math.round(count * 0.6)), size: 1.0, life: 0.55, speed: 1.6, up: 0.8, grow: 1.4, additive: false, spin: 1.5, spread: 0.3 });
    for (let i = 0; i < count; i++) {
      const off = new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.6, (Math.random() - 0.5) * 1.2);
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random(), (Math.random() - 0.5) * 2);
      this.spawn(this.sphereGeo, this.mat(color, 0.75), pos.clone().add(off), v, 0.5 + Math.random() * 0.4, 0.35 + Math.random() * 0.3, { grow: 1.2 });
    }
  }

  wallDust(pos: THREE.Vector3, normal: THREE.Vector3): void {
    this.spriteBurst('dirt', pos, { color: 0xd8cbb0, count: 6, size: 0.9, life: 0.5, speed: 2.5, up: 0.9, gravity: -6, additive: false, spin: 2, spread: 0.4 });
    for (let i = 0; i < 12; i++) {
      const v = normal.clone().multiplyScalar(3 + Math.random() * 3);
      v.x += (Math.random() - 0.5) * 4;
      v.y += Math.random() * 4;
      v.z += (Math.random() - 0.5) * 4;
      this.spawn(this.boxGeo, this.mat(0xb9b09a), pos, v, 0.5, 0.15, { gravity: -10, spin: 10 });
    }
    this.smokePuff(pos, 0xc9c1a8, 6);
  }

  rasenganTick(pos: THREE.Vector3): void {
    this.spriteBurst('magic2', pos, { color: 0x9fd8ff, count: 1, size: 1.0, life: 0.16, speed: 0.5, additive: true, spin: 12 });
    // swirling sphere fragments around the palm
    this.spawn(this.sphereGeo, this.mat(0x7dd3ff, 0.55), pos, new THREE.Vector3(), 0.1, 0.9);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), (Math.random() - 0.5), Math.sin(a)).multiplyScalar(6);
      this.spawn(this.boxGeo, this.mat(0xe0f6ff), pos, v, 0.15, 0.07, { spin: 40 });
    }
  }

  chidoriTick(pos: THREE.Vector3): void {
    this.spriteBurst('spark2', pos, { color: 0xbfe8ff, count: 2, size: 0.8, life: 0.12, speed: 3, additive: true, spin: 10, spread: 0.3 });
    this.spawn(this.sphereGeo, this.mat(0xbfefff, 0.5), pos, new THREE.Vector3(), 0.08, 0.7);
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(14);
      const p = this.spawn(this.boxGeo, this.mat(0xe8fbff), pos, v, 0.08, 0.05);
      p.mesh.scale.set(0.04, 0.04, 0.5 + Math.random() * 0.5);
      p.mesh.lookAt(pos.clone().add(v));
    }
  }

  switchFlash(pos: THREE.Vector3, color: number): void {
    this.flash('flare', pos, 2.6, color, 0.25);
    this.smokePuff(pos, 0xffffff, 8);
    this.spawn(this.sphereGeo, this.mat(color, 0.8), pos.clone().setY(pos.y + 1), new THREE.Vector3(), 0.25, 0.6, { grow: 8 });
  }
}

/** Translucent guard sphere that follows a fighter and recolors with durability. */
export class GuardSphere {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 16), this.mat);
    this.mesh.visible = false;
    const wire = new THREE.Mesh(new THREE.SphereGeometry(1.36, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.18, depthWrite: false }));
    this.mesh.add(wire);
  }
  update(pos: THREE.Vector3, visible: boolean, color: number, pulse: number): void {
    this.mesh.visible = visible;
    if (!visible) return;
    this.mesh.position.copy(pos);
    this.mesh.position.y += 1.0;
    this.mat.color.setHex(color);
    const s = 1 + pulse * 0.15;
    this.mesh.scale.setScalar(s);
    this.mesh.rotation.y += 0.02;
    const flashing = color === 0xff3f3f;
    this.mat.opacity = flashing ? 0.2 + 0.2 * Math.abs(Math.sin(performance.now() * 0.02)) : 0.28;
  }
}
