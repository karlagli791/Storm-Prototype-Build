/**
 * Projectiles.ts — Shuriken and support cover-fire projectiles (PL_ACT_PRJ_* / SKILL_PRIORITY
 * SYURIKEN). Straight-line flight with light homing, guardable, pierced by chakra dashes
 * (the blueprint's "dash pierces standard shurikens"), despawn on the arena wall.
 */
import * as THREE from 'three';
import { ARENA_RADIUS, CombatState, HitPriority, HitReaction, HitboxDef } from '../core/Types';
import { Fighter } from './Fighter';
import { CombatStateMachine } from './CombatStateMachine';
import { Effects } from '../render/Effects';
import { BALANCE } from './StormStates';
import { SOCKET } from './CharacterDefs';

export interface Projectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  owner: Fighter;
  target: Fighter | null;
  life: number;
  damage: number;
  /** Damage rate multiplier (support cover fire uses DAMAGERATE_SUPPORT_COVERING_FIRE). */
  rate: number;
  spin: number;
}

const DASH_STATES: ReadonlySet<CombatState> = new Set([CombatState.DASH_HOMING, CombatState.SPARK_DASH]);

export class Projectiles {
  readonly group = new THREE.Group();
  readonly list: Projectile[] = [];
  private geo = new THREE.CylinderGeometry(0.02, 0.02, 0.36, 4);
  private starGeo: THREE.BufferGeometry;
  private mat = new THREE.MeshBasicMaterial({ color: 0x2a2f3a });
  private edgeMat = new THREE.MeshBasicMaterial({ color: 0xd8dde8 });
  private tmp = new THREE.Vector3();

  constructor(private fsm: CombatStateMachine, private effects: Effects) {
    // Four-point shuriken silhouette: a flat star built from two thin crossed boxes
    const a = new THREE.BoxGeometry(0.42, 0.02, 0.07);
    const b = new THREE.BoxGeometry(0.07, 0.02, 0.42);
    const ring = new THREE.TorusGeometry(0.05, 0.015, 6, 12);
    ring.rotateX(Math.PI / 2);
    // Merge manually (avoid BufferGeometryUtils import)
    const geos = [a, b, ring];
    let count = 0;
    for (const g of geos) count += g.getAttribute('position').count;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const idx: number[] = [];
    let vo = 0;
    for (const g of geos) {
      const p = g.getAttribute('position');
      const n = g.getAttribute('normal');
      pos.set(p.array as Float32Array, vo * 3);
      nor.set(n.array as Float32Array, vo * 3);
      const gi = g.getIndex();
      if (gi) for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + vo);
      vo += p.count;
    }
    const star = new THREE.BufferGeometry();
    star.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    star.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    star.setIndex(idx);
    this.starGeo = star;
  }

  /** Throw from `owner`'s right hand toward `target`. */
  throw(owner: Fighter, target: Fighter | null, opts: { rate?: number; spread?: number; fromSocket?: string } = {}): Projectile {
    const start = new THREE.Vector3();
    owner.rig.socketWorld(opts.fromSocket ?? SOCKET.R_HAND, start);
    if (!Number.isFinite(start.x)) start.copy(owner.position).setY(owner.position.y + 1.2);
    const dir = new THREE.Vector3();
    if (target) {
      dir.copy(target.position).setY(target.position.y + 1.0).sub(start);
      // Lead the target a little (SKILL_SHOT_TYPE_DEFAULT ~ light prediction)
      const tau = dir.length() / BALANCE.PRJ_SPEED;
      dir.addScaledVector(target.velocity, tau * 0.6);
    } else {
      owner.forward(dir);
    }
    if (opts.spread) {
      const a = (Math.random() - 0.5) * opts.spread;
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    }
    dir.normalize();
    const mesh = new THREE.Mesh(this.starGeo, this.mat);
    const edge = new THREE.Mesh(this.geo, this.edgeMat);
    edge.rotation.x = Math.PI / 2;
    mesh.add(edge);
    mesh.position.copy(start);
    this.group.add(mesh);
    const p: Projectile = { mesh, pos: start.clone(), vel: dir.multiplyScalar(BALANCE.PRJ_SPEED), owner, target, life: 2.0, damage: BALANCE.PRJ_DAMAGE, rate: opts.rate ?? 1, spin: 40 };
    this.list.push(p);
    this.effects.dashTrail(start, 0xffffff);
    return p;
  }

  update(dt: number, fighters: Fighter[]): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y += p.spin * dt;
      p.mesh.lookAt(this.tmp.copy(p.pos).add(p.vel));
      p.mesh.rotateX(Math.PI / 2);
      let dead = p.life <= 0 || p.pos.y < -0.2 || Math.hypot(p.pos.x, p.pos.z) > ARENA_RADIUS + 1;
      if (!dead) {
        for (const f of fighters) {
          if (f.team === p.owner.team || !f.isLeader) continue;
          if (f.invulnFrames > 0 || f.state === CombatState.DEAD || f.state === CombatState.SUBSTITUTED) continue;
          // Chakra dashes pierce shurikens; jutsu armor too
          if (DASH_STATES.has(f.state) || f.armorActive()) continue;
          this.tmp.copy(f.position);
          this.tmp.y += 1.0;
          if (this.tmp.distanceTo(p.pos) < 0.75) {
            const hb: HitboxDef = {
              id: 'shuriken',
              socket: SOCKET.CHEST,
              radius: 0.3,
              damage: Math.round(p.damage * p.rate),
              chakraGain: 1,
              reaction: HitReaction.STAGGER,
              knockback: 2.0,
              launch: 0,
              hitstunFrames: BALANCE.PRJ_HITSTUN,
              blockstunFrames: 6,
              guardDamage: 3,
              priority: HitPriority.NONE,
              activeStart: 0,
              activeEnd: 0,
            };
            const guarding = f.state === CombatState.GUARDING || f.state === CombatState.BLOCKSTUN || f.state === CombatState.GUARD_COUNTER;
            if (f.parryActive) this.fsm.applyParry(f, p.owner, this.tmp.clone());
            else if (guarding) this.fsm.applyGuardHit(f, p.owner, hb, this.tmp.clone());
            else this.fsm.applyHit(f, p.owner, hb, this.tmp.clone(), { hitstop: 1 });
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        this.group.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.list) this.group.remove(p.mesh);
    this.list.length = 0;
  }
}
