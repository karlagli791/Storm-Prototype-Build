/**
 * HitboxManager.ts — Collision pass. Dash arbitration (priority-tiered clash resolution),
 * dash impact, bone-socket-bound melee/jutsu hitboxes (spheres or swept capsules between two
 * sockets) against hurtbox spheres, and debug visualisation.
 */
import * as THREE from 'three';
import { CombatState, DASH_CLASH_RADIUS, DASH_IMPACT_DISTANCE, HitboxDef } from '../core/Types';
import { Fighter } from './Fighter';
import { CombatStateMachine } from './CombatStateMachine';

const DASH_STATES: ReadonlySet<CombatState> = new Set([CombatState.DASH_HOMING, CombatState.SPARK_DASH]);
const KNOCKDOWN_OTG_WINDOW = 12;

export class HitboxManager {
  readonly debugGroup = new THREE.Group();
  debug = false;
  private debugPool: THREE.Mesh[] = [];
  private debugUsed = 0;
  private hitMat = new THREE.MeshBasicMaterial({ color: 0xff3030, wireframe: true, transparent: true, opacity: 0.9 });
  private hurtMat = new THREE.MeshBasicMaterial({ color: 0x30ff60, wireframe: true, transparent: true, opacity: 0.6 });
  private sphereGeo = new THREE.SphereGeometry(1, 10, 8);

  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private c = new THREE.Vector3();
  private closest = new THREE.Vector3();

  constructor(private fsm: CombatStateMachine) {
    this.debugGroup.visible = false;
  }

  update(fighters: Fighter[]): void {
    this.debugUsed = 0;
    this.debugGroup.visible = this.debug;

    // 1. Dash-vs-dash arbitration
    for (let i = 0; i < fighters.length; i++) {
      const fa = fighters[i];
      if (!DASH_STATES.has(fa.state) || fa.dashElapsed < 0) continue;
      for (let j = i + 1; j < fighters.length; j++) {
        const fb = fighters[j];
        if (!DASH_STATES.has(fb.state) || fb.dashElapsed < 0) continue;
        if (fa.team === fb.team) continue;
        if (fa.position.distanceTo(fb.position) <= DASH_CLASH_RADIUS + 0.4) {
          this.fsm.resolveClash(fa, fb);
        }
      }
    }

    // 2. Dash impact against a non-dashing target
    for (const f of fighters) {
      if (!DASH_STATES.has(f.state) || f.dashElapsed < 0) continue;
      const t = f.target;
      if (!t || DASH_STATES.has(t.state)) continue;
      this.a.copy(t.position);
      this.a.y += 0.9;
      this.b.copy(f.position);
      this.b.y += 0.9;
      if (this.a.distanceTo(this.b) <= DASH_IMPACT_DISTANCE + 0.3) {
        this.fsm.resolveDashImpact(f, t);
      }
    }

    // 3. Melee / jutsu hitboxes vs hurtboxes
    for (const attacker of fighters) {
      if (attacker.state !== CombatState.COMBO_STRING && attacker.state !== CombatState.JUTSU && attacker.state !== CombatState.SUPPORT_ACT && attacker.state !== CombatState.ULTIMATE) continue;
      const boxes = attacker.state === CombatState.JUTSU && attacker.def.jutsuProjectile ? [] : attacker.activeHitboxes();
      if (!boxes.length && !this.debug) continue;
      for (const defender of fighters) {
        if (defender === attacker || defender.team === attacker.team) continue;
        if (!defender.isLeader) continue; // only the leader is targetable
        for (const hb of boxes) {
          const hit = this.testHitbox(attacker, hb, defender);
          if (hit) {
            attacker.landedHitIds.add(hb.id);
            this.resolveHit(attacker, defender, hb, this.closest.clone());
          }
        }
      }
      if (this.debug) for (const hb of boxes) this.drawHitbox(attacker, hb);
    }

    if (this.debug) {
      for (const f of fighters) this.drawHurtboxes(f);
      for (let i = this.debugUsed; i < this.debugPool.length; i++) this.debugPool[i].visible = false;
    }
  }

  private resolveHit(attacker: Fighter, defender: Fighter, hb: HitboxDef, point: THREE.Vector3): void {
    if (defender.state === CombatState.DEAD || defender.state === CombatState.SUBSTITUTED) return;
    if (defender.invulnFrames > 0) return;
    if (defender.state === CombatState.KNOCKDOWN && defender.stateFrame > KNOCKDOWN_OTG_WINDOW) return;
    if (defender.parryActive) {
      this.fsm.applyParry(defender, attacker, point);
      return;
    }
    const guarding = defender.state === CombatState.GUARDING || defender.state === CombatState.BLOCKSTUN || defender.state === CombatState.GUARD_COUNTER;
    if (guarding && !hb.unblockable) {
      this.fsm.applyGuardHit(defender, attacker, hb, point);
      return;
    }
    this.fsm.applyHit(defender, attacker, hb, point);
  }

  /** Sphere or capsule (socket->socketEnd) vs hurtbox spheres. Writes the contact point to this.closest. */
  private testHitbox(attacker: Fighter, hb: HitboxDef, defender: Fighter): boolean {
    attacker.rig.socketWorld(hb.socket, this.a);
    if (hb.socketEnd) attacker.rig.socketWorld(hb.socketEnd, this.b);
    else this.b.copy(this.a);
    for (const hurt of defender.def.hurtboxes) {
      defender.rig.socketWorld(hurt.socket, this.c);
      const d = this.segmentPointDistance(this.a, this.b, this.c, this.closest);
      if (d <= hb.radius + hurt.radius) {
        // Contact point: midway between the segment's closest point and the hurt sphere center
        this.closest.lerp(this.c, 0.5);
        return true;
      }
    }
    // Body-column fallback: during the active frames a strike connects when the attacker faces the
    // defender at striking distance, even if the swinging socket misses the hurt spheres (retargeted
    // clips, awakened bodies, short characters).
    const dx = defender.position.x - attacker.position.x, dz = defender.position.z - attacker.position.z;
    const hd = Math.hypot(dx, dz);
    const dy = defender.position.y - attacker.position.y;
    if (hd <= 1.3 + Math.min(1.0, hb.radius * 0.6) && Math.abs(dy) < 1.7) {
      const fx = Math.sin(attacker.yaw), fz = Math.cos(attacker.yaw);
      if (hd < 0.6 || (dx * fx + dz * fz) / hd > 0.3) {
        const k = 0.25 / Math.max(hd, 1e-3);
        this.closest.set(defender.position.x - dx * k, defender.position.y + 1.0, defender.position.z - dz * k);
        return true;
      }
    }
    return false;
  }

  private segmentPointDistance(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3, outClosest: THREE.Vector3): number {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
    const ab2 = abx * abx + aby * aby + abz * abz;
    let t = ab2 > 1e-8 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    outClosest.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
    return outClosest.distanceTo(p);
  }

  // ------------------------------------------------------------------ debug
  private debugMesh(): THREE.Mesh {
    let m = this.debugPool[this.debugUsed];
    if (!m) {
      m = new THREE.Mesh(this.sphereGeo, this.hurtMat);
      this.debugPool.push(m);
      this.debugGroup.add(m);
    }
    this.debugUsed++;
    m.visible = true;
    return m;
  }

  private drawHitbox(attacker: Fighter, hb: HitboxDef): void {
    attacker.rig.socketWorld(hb.socket, this.a);
    const m = this.debugMesh();
    m.material = this.hitMat;
    m.position.copy(this.a);
    m.scale.setScalar(hb.radius);
    if (hb.socketEnd) {
      attacker.rig.socketWorld(hb.socketEnd, this.b);
      const steps = 3;
      for (let i = 1; i <= steps; i++) {
        const mm = this.debugMesh();
        mm.material = this.hitMat;
        mm.position.lerpVectors(this.a, this.b, i / steps);
        mm.scale.setScalar(hb.radius);
      }
    }
  }

  private drawHurtboxes(f: Fighter): void {
    for (const hurt of f.def.hurtboxes) {
      f.rig.socketWorld(hurt.socket, this.c);
      const m = this.debugMesh();
      m.material = this.hurtMat;
      m.position.copy(this.c);
      m.scale.setScalar(hurt.radius);
    }
  }
}
