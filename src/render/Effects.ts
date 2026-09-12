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

export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
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
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(power * (0.5 + Math.random()));
      this.spawn(this.boxGeo, this.mat(color), pos, v, 0.25 + Math.random() * 0.2, 0.12 + Math.random() * 0.1, { gravity: -12, spin: 20 });
    }
    // flash sphere
    this.spawn(this.sphereGeo, this.mat(0xffffff, 0.8), pos, new THREE.Vector3(), 0.12, 0.35, { grow: 6 });
  }

  guardSpark(pos: THREE.Vector3, color: number): void {
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
    const off = new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.3, (Math.random() - 0.5) * 1.2);
    const p = pos.clone().add(off);
    this.spawn(this.boxGeo, this.mat(color, 0.9), p, new THREE.Vector3(0, 4 + Math.random() * 3, 0), 0.35, 0.09);
  }

  dashTrail(pos: THREE.Vector3, color: number): void {
    this.spawn(this.sphereGeo, this.mat(color, 0.45), pos, new THREE.Vector3(), 0.18, 0.5);
  }

  clashBurst(pos: THREE.Vector3): void {
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
    for (let i = 0; i < count; i++) {
      const off = new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.6, (Math.random() - 0.5) * 1.2);
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random(), (Math.random() - 0.5) * 2);
      this.spawn(this.sphereGeo, this.mat(color, 0.75), pos.clone().add(off), v, 0.5 + Math.random() * 0.4, 0.35 + Math.random() * 0.3, { grow: 1.2 });
    }
  }

  wallDust(pos: THREE.Vector3, normal: THREE.Vector3): void {
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
    // swirling sphere fragments around the palm
    this.spawn(this.sphereGeo, this.mat(0x7dd3ff, 0.55), pos, new THREE.Vector3(), 0.1, 0.9);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), (Math.random() - 0.5), Math.sin(a)).multiplyScalar(6);
      this.spawn(this.boxGeo, this.mat(0xe0f6ff), pos, v, 0.15, 0.07, { spin: 40 });
    }
  }

  chidoriTick(pos: THREE.Vector3): void {
    this.spawn(this.sphereGeo, this.mat(0xbfefff, 0.5), pos, new THREE.Vector3(), 0.08, 0.7);
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(14);
      const p = this.spawn(this.boxGeo, this.mat(0xe8fbff), pos, v, 0.08, 0.05);
      p.mesh.scale.set(0.04, 0.04, 0.5 + Math.random() * 0.5);
      p.mesh.lookAt(pos.clone().add(v));
    }
  }

  switchFlash(pos: THREE.Vector3, color: number): void {
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
