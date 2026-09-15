/**
 * CombatStateMachine.ts — Finite state machine for a fighter. Owns every transition listed in
 * the blueprint (Idle, Running, NinjaMove, HollowStep, DashStartup/Charging/Homing, ComboString,
 * SparkDash, Jutsu, Guarding, GuardCounter, GuardBreak, Hitstun/Launched/Tumble/Crumple/Knockdown,
 * Substituted, WallSplat) plus the hit-reaction, clash, dash-impact and parry resolvers used by
 * the collision pass.
 */
import * as THREE from 'three';
import {
  CHAKRA_COST_CHARGED_DASH,
  CHAKRA_COST_DASH,
  CHAKRA_COST_SPARK_DASH,
  CHAKRA_COST_TURBO_DASH,
  CLASH_RECOVERY_FRAMES,
  CLASH_REBOUND_SPEED,
  CombatState,
  ComboBranch,
  DASH_REBOUND_SPEED,
  DASH_SPEED_CHARGED,
  DASH_SPEED_SPARK,
  DASH_SPEED_STANDARD,
  DASH_TURN_FORCE_MAX,
  GUARD_BREAK_STUN_FRAMES,
  GUARD_COUNTER_CRUMPLE_FRAMES,
  HOLLOW_STEP_FRAMES,
  HOLLOW_STEP_SPEED,
  HitboxDef,
  HitReaction,
  InputFlag,
  JUMP_VELOCITY,
  LEADER_SWITCH_COST,
  MoveDef,
  NINJA_MOVE_SPEED,
  RUN_ACCEL,
  RUN_DECEL,
  SUB_TELEPORT_DISTANCE,
  SWITCHABLE_STATES,
  WALL_SPLAT_FRAMES,
  clampMagnitude,
  lerpAngle,
} from '../core/Types';
import { DashKind, EventSink, Fighter } from './Fighter';
import { BALANCE } from './StormStates';
import { HitDir, HitPriority } from '../core/Types';
import { Effects } from '../render/Effects';
import { SOCKET } from './CharacterDefs';

export interface CameraBasis {
  forward: THREE.Vector3;
  right: THREE.Vector3;
}

const DASH_STARTUP_STANDARD = 7;
const DASH_STARTUP_TURBO = 3;
const DASH_STARTUP_SPARK = 2;
const DASH_CHARGE_MIN_FRAMES = 14;
const DASH_CHARGE_MAX_FRAMES = 22;
const DASH_MAX_FRAMES = 80;
const DASH_IMPACT_FRAMES = 8;
const DASH_REBOUND_FRAMES = 16;
const NINJA_MOVE_FRAMES = 16;
const JUTSU_COST = 30;
/** Damage dealt by the jutsu demo finish (the palm hit that starts it deals its own). */
const JUTSU_DEMO_DAMAGE = 140;
/** SPSKILL: needs a nearly full gauge (retail: 2nd ultimate consumes 66) and empties it. */
const ULTIMATE_MIN_CHAKRA = 90;
const ULTIMATE_TOTAL = 150;
const ULTIMATE_CUTIN = 26;
const INTRO_FRAMES = 100;
const AWAKEN_FRAMES = 42;
const AWAKEN_DURATION = 20;
const AWAKEN_HP_RATIO = 0.5;
const AWAKEN_DAMAGE_MULT = 1.3;
const GUARD_COUNTER_TOTAL = 20;
const KNOCKDOWN_FRAMES = 34;
const KNOCKDOWN_OTG_WINDOW = 12;
const SUBSTITUTED_FRAMES = 10;
const THROW_RELEASE_FRAME = 7;
const THROW_TOTAL_FRAMES = 20;

const DASH_RANK: Record<DashKind, number> = { STANDARD: 1, TURBO: 1, SPARK: 2, CHARGED: 3 };

export class CombatStateMachine {
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private moveDir = new THREE.Vector3();

  constructor(readonly events: EventSink, private effects: Effects) {}

  // =========================================================================
  // Per-tick update
  // =========================================================================
  /** Set by the game so jutsu can launch projectiles. */
  projectiles: import('./Projectiles').Projectiles | null = null;

  update(f: Fighter, dt: number, cam: CameraBasis): void {
    if (f.awakened) {
      f.awakenTimer -= dt;
      f.stats.chakra = Math.max(0, f.stats.chakra - 2.5 * dt);
      if (f.awakenTimer <= 0 || (f.stats.chakra <= 0 && f.state !== CombatState.ULTIMATE)) {
        f.awakened = false;
        f.rig.setAwakened(false);
        f.setAwakenedForm(false);
        this.events.emit('AWAKEN', { attackerId: f.id, defenderId: -1, damage: 0, text: `${f.def.displayName}: awakening ended`, color: 0xffb27a });
      }
    }
    f.stateFrame++;
    if (f.subLockFrames > 0) f.subLockFrames--;
    if (f.invulnFrames > 0) f.invulnFrames--;

    const buf = f.input.buffer;
    const inp = buf.latest;

    // World-space movement intent from camera-relative stick
    this.moveDir.set(0, 0, 0).addScaledVector(cam.right, inp.moveX).addScaledVector(cam.forward, inp.moveY);
    const mag = Math.min(1, this.moveDir.length());
    if (mag > 1e-4) this.moveDir.divideScalar(this.moveDir.length());

    // Stick direction relative to facing (dash-step clip selection)
    if (mag > 0.15) {
      f.forward(this.tmpA);
      const fwd = this.moveDir.dot(this.tmpA);
      const right = this.moveDir.x * this.tmpA.z - this.moveDir.z * this.tmpA.x;
      f.moveDirLocal = Math.abs(fwd) >= Math.abs(right) ? (fwd >= 0 ? 'F' : 'B') : right >= 0 ? 'L' : 'R';
    }

    // Leader switch is available from a broad set of states
    if (!f.autonomous && SWITCHABLE_STATES.has(f.state) && buf.consume(InputFlag.SWITCH)) {
      if (f.stats.canLeaderSwitch(LEADER_SWITCH_COST)) f.switchRequested = true;
    }

    switch (f.state) {
      case CombatState.IDLE_NEUTRAL: this.updateIdle(f, dt, mag); break;
      case CombatState.RUNNING: this.updateRunning(f, dt, mag); break;
      case CombatState.NINJA_MOVE: this.updateNinjaMove(f, dt, mag); break;
      case CombatState.HOLLOW_STEP: this.updateHollowStep(f, dt, mag); break;
      case CombatState.JUMPING: this.updateJumping(f, dt, mag); break;
      case CombatState.INTRO: this.updateIntro(f); break;
      case CombatState.ULTIMATE: this.updateUltimate(f, dt); break;
      case CombatState.AWAKEN: this.updateAwaken(f, dt); break;
      case CombatState.DASH_STARTUP: this.updateDashStartup(f, dt, mag); break;
      case CombatState.DASH_CHARGING: this.updateDashCharging(f, dt); break;
      case CombatState.DASH_HOMING:
      case CombatState.SPARK_DASH: this.updateDashHoming(f, dt); break;
      case CombatState.DASH_IMPACT: this.updateDashImpact(f, dt); break;
      case CombatState.DASH_REBOUND: this.updateTimedRecovery(f, dt, DASH_REBOUND_FRAMES); break;
      case CombatState.DASH_CLASH: this.updateTimedRecovery(f, dt, CLASH_RECOVERY_FRAMES); break;
      case CombatState.COMBO_STRING: this.updateComboString(f, dt, mag); break;
      case CombatState.JUTSU: this.updateJutsu(f, dt); break;
      case CombatState.GUARDING: this.updateGuarding(f, dt); break;
      case CombatState.GUARD_COUNTER: this.updateGuardCounter(f, dt); break;
      case CombatState.GUARD_BREAK: this.updateGuardBreak(f, dt); break;
      case CombatState.BLOCKSTUN: this.updateBlockstun(f, dt); break;
      case CombatState.HITSTUN: this.updateHitstun(f, dt); break;
      case CombatState.LAUNCHED: this.updateLaunched(f, dt); break;
      case CombatState.TUMBLE: this.updateTumble(f, dt); break;
      case CombatState.CRUMPLE: this.updateCrumple(f, dt); break;
      case CombatState.KNOCKDOWN: this.updateKnockdown(f, dt); break;
      case CombatState.WALL_SPLAT: this.updateWallSplat(f, dt); break;
      case CombatState.SUBSTITUTED: this.updateSubstituted(f, dt); break;
      case CombatState.DEAD: this.applyFriction(f, dt, 30); break;
      case CombatState.CHAKRA_CHARGE: this.updateChakraCharge(f, dt, mag); break;
      case CombatState.THROW: this.updateThrow(f, dt); break;
      case CombatState.SUPPORT_ACT: this.updateSupportAct(f, dt); break;
    }
  }

  // ------------------------------------------------------------ prototype-informed states
  /** PL_ACT_CHAKRA_CHARGE: hold the chakra button with no direction to regenerate quickly. */
  private updateChakraCharge(f: Fighter, dt: number, mag: number): void {
    // Awakening: keep the chakra button held with half health or less (AWAKE_BEGIN).
    if (!f.awakened && f.stats.health <= f.stats.healthMax * AWAKEN_HP_RATIO && f.stateFrame >= 45 && f.input.buffer.isHeld(InputFlag.CHARGE)) {
      this.startAwaken(f);
      return;
    }
    this.applyFriction(f, dt, 50);
    this.faceTarget(f, 0.3);
    const buf = f.input.buffer;
    f.stats.gainChakra(BALANCE.CHAKRA_RECOVER_AT_CHARGE * dt);
    if (f.stateFrame % 4 === 0) this.effects.chargeAura(f.position, f.def.code === '2nrt' ? 0x7dd3ff : 0x9fb7ff);
    if (buf.consume(InputFlag.DASH) && f.stats.canSpendChakra(CHAKRA_COST_DASH)) { this.startDash(f, 'STANDARD'); return; }
    if (buf.consume(InputFlag.ULTIMATE)) {
      if (f.stats.chakra >= ULTIMATE_MIN_CHAKRA) { this.startUltimate(f); return; }
      buf.flush(InputFlag.ULTIMATE);
    }
    if (buf.consume(InputFlag.JUTSU)) {
      if (f.stats.chakra >= ULTIMATE_MIN_CHAKRA && f.target && f.distanceToTarget() < 14) { this.startUltimate(f); return; }
      if (f.stats.spendChakra(JUTSU_COST)) { this.startJutsu(f); return; }
    }
    if (buf.consume(InputFlag.ATTACK)) { this.startCombo(f, this.branchFromHeld(f)); return; }
    if (!buf.isHeld(InputFlag.CHARGE) || mag > 0.15 || buf.isHeld(InputFlag.GUARD)) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  /** PL_ACT_PRJ_LAND: shuriken throw. The projectile is spawned by the game loop at the release frame. */
  private updateThrow(f: Fighter, dt: number): void {
    if (f.grounded) this.applyFriction(f, dt, 60);
    else { f.velocity.x *= 1 - 1.5 * dt; f.velocity.z *= 1 - 1.5 * dt; }
    if (f.stateFrame < 6) this.faceTarget(f, 0.6);
    if (f.stateFrame === THROW_RELEASE_FRAME) f.throwRequested = true;
    if (f.stateFrame >= THROW_TOTAL_FRAMES) f.enterState(f.grounded ? CombatState.IDLE_NEUTRAL : CombatState.JUMPING);
  }

  /** PL_ACT_SUP_*: the support runs its move like a combo string but ignores input and never chains. */
  private updateSupportAct(f: Fighter, dt: number): void {
    const move = f.currentMove;
    if (!move) {
      this.applyFriction(f, dt, 40);
      this.faceTarget(f, 0.5);
      if (f.stateFrame > 30) f.enterState(CombatState.IDLE_NEUTRAL);
      return;
    }
    f.moveFrame++;
    const first = move.hitboxes[0];
    const activeStart = first ? first.activeStart : 6;
    const activeEnd = first ? first.activeEnd : 12;
    if (f.moveFrame < activeStart) this.faceTarget(f, 0.5);
    const dist = f.distanceToTarget();
    if (f.moveFrame >= activeStart - 6 && f.moveFrame <= activeEnd && dist > 1.1) {
      f.forward(this.tmpA);
      f.velocity.x = this.tmpA.x * Math.max(move.forwardStep, 6);
      f.velocity.z = this.tmpA.z * Math.max(move.forwardStep, 6);
    } else {
      this.applyFriction(f, dt, 70);
    }
    if (f.moveFrame >= move.totalFrames) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  /** A support character interrupts the enemy: DASH_CUT knocks a dasher out of its dash, STRIKE_BACK bounces a launched enemy back toward the leader. */
  supportInterrupt(enemy: Fighter, support: Fighter, kind: 'DASH_CUT' | 'STRIKE_BACK'): void {
    const point = enemy.position.clone();
    point.y += 1.0;
    if (kind === 'DASH_CUT') {
      const hb: HitboxDef = { id: 'sup_dash_cut', socket: SOCKET.CHEST, radius: 1, damage: 30, chakraGain: 0, reaction: HitReaction.STAGGER, knockback: 6, launch: 0, hitstunFrames: 22, blockstunFrames: 8, guardDamage: 5, priority: 3, activeStart: 0, activeEnd: 0 };
      this.applyHit(enemy, support, hb, point, { hitstop: BALANCE.HITSTOP_NORMAL });
      enemy.velocity.y = 0;
      this.events.emit('CLASH', { attackerId: support.id, defenderId: enemy.id, point, damage: 30, text: `${support.def.displayName}: DASH CUT`, color: 0xc084fc, shake: 0.2 });
    } else {
      // Reverse the flight back toward our leader (PL_ACT_DMG_BOUND_STRIKESUPPORT)
      const leader = support.team?.active;
      if (leader) {
        this.tmpA.subVectors(leader.position, enemy.position);
        this.tmpA.y = 0;
        const d = this.tmpA.length();
        if (d > 1e-3) this.tmpA.divideScalar(d);
        const hb: HitboxDef = { id: 'sup_strike_back', socket: SOCKET.CHEST, radius: 1, damage: 40, chakraGain: 0, reaction: HitReaction.LAUNCH, knockback: 10, launch: 8, hitstunFrames: 45, blockstunFrames: 8, guardDamage: 5, priority: 3, activeStart: 0, activeEnd: 0 };
        this.applyHit(enemy, support, hb, point, { hitstop: BALANCE.HITSTOP_HEAVY, direction: this.tmpA.clone() });
        this.events.emit('CLASH', { attackerId: support.id, defenderId: enemy.id, point, damage: 40, text: `${support.def.displayName}: STRIKE BACK`, color: 0xc084fc, shake: 0.25 });
      }
    }
  }

  // ------------------------------------------------------------------ helpers
  private applyFriction(f: Fighter, dt: number, decel: number): void {
    const v = f.velocity;
    const h = Math.hypot(v.x, v.z);
    if (h < 1e-4) {
      v.x = v.z = 0;
      return;
    }
    const nh = Math.max(0, h - decel * dt);
    v.x *= nh / h;
    v.z *= nh / h;
  }

  private faceTarget(f: Fighter, rate = 1): void {
    if (!f.target) return;
    const want = f.yawToTarget();
    f.yaw = rate >= 1 ? want : lerpAngle(f.yaw, want, rate);
  }

  private dirToTarget(f: Fighter, out: THREE.Vector3): THREE.Vector3 {
    if (!f.target) return f.forward(out);
    out.subVectors(f.target.position, f.position);
    out.y = 0;
    if (out.lengthSq() < 1e-6) return f.forward(out);
    return out.normalize();
  }

  /**
   * Shared neutral action resolution. Returns true if a transition happened.
   * Priority: GUARD (hold) > JUTSU > DASH > ATTACK > JUMP.
   */
  private tryNeutralActions(f: Fighter, mag: number): boolean {
    const buf = f.input.buffer;
    buf.flush(InputFlag.SUB); // subs are only meaningful in hitstun
    if (buf.isHeld(InputFlag.GUARD)) {
      f.enterState(CombatState.GUARDING);
      return true;
    }
    if (buf.consume(InputFlag.ULTIMATE)) {
      if (f.stats.chakra >= ULTIMATE_MIN_CHAKRA && f.target) {
        this.startUltimate(f);
        return true;
      }
    }
    if (buf.consume(InputFlag.JUTSU)) {
      // Storm: with a (nearly) full gauge the jutsu input becomes the ultimate.
      if (f.stats.chakra >= ULTIMATE_MIN_CHAKRA && f.target && f.distanceToTarget() < 14) {
        this.startUltimate(f);
        return true;
      }
      if (f.stats.spendChakra(JUTSU_COST)) {
        this.startJutsu(f);
        return true;
      }
    }
    if (buf.consume(InputFlag.DASH)) {
      if (f.stats.canSpendChakra(CHAKRA_COST_DASH)) {
        this.startDash(f, 'STANDARD');
        return true;
      }
    }
    if (buf.consume(InputFlag.ATTACK)) {
      this.startCombo(f, this.branchFromHeld(f));
      return true;
    }
    if (buf.consume(InputFlag.THROW)) {
      f.enterState(CombatState.THROW);
      f.throwDir = null;
      this.faceTarget(f);
      return true;
    }
    if (buf.isHeld(InputFlag.CHARGE) && mag <= 0.15 && buf.heldFrames(InputFlag.CHARGE) >= 3) {
      f.enterState(CombatState.CHAKRA_CHARGE);
      return true;
    }
    if (buf.consume(InputFlag.JUMP)) {
      if (mag > 0.15) {
        f.enterState(CombatState.NINJA_MOVE);
        this.beginNinjaMove(f);
      } else {
        f.enterState(CombatState.JUMPING);
        f.velocity.y = JUMP_VELOCITY;
        f.grounded = false;
      }
      return true;
    }
    return false;
  }

  private branchFromHeld(f: Fighter): ComboBranch {
    const buf = f.input.buffer;
    if (buf.isHeld(InputFlag.UP)) return 'UP';
    if (buf.isHeld(InputFlag.DOWN)) return 'DOWN';
    return 'NEUTRAL';
  }

  private stringFor(f: Fighter, branch: ComboBranch): MoveDef[] {
    const d = f.def;
    return branch === 'UP' ? d.upString.moves : branch === 'DOWN' ? d.downString.moves : branch === 'AIR' ? (d.airString?.moves ?? d.neutralString.moves) : d.neutralString.moves;
  }

  // ------------------------------------------------------------- starters
  startCombo(f: Fighter, branch: ComboBranch): void {
    const moves = this.stringFor(f, branch);
    f.enterState(CombatState.COMBO_STRING);
    f.beginMove(moves[0], branch, 0);
    this.faceTarget(f);
  }

  startJutsu(f: Fighter): void {
    f.enterState(CombatState.JUTSU);
    f.jutsuDemoDone = false;
    f.cinematic = false;
    f.beginMove(f.def.jutsu, 'NEUTRAL', 0);
    this.faceTarget(f);
    f.velocity.set(0, 0, 0);
    this.events.emit('HIT', { attackerId: f.id, defenderId: -1, damage: 0, text: `${f.def.displayName}: ${f.def.code === '2nrt' ? 'RASENGAN' : 'CHIDORI'}!`, color: 0x7dd3ff });
  }

  startDash(f: Fighter, kind: DashKind): void {
    const cost = kind === 'TURBO' ? CHAKRA_COST_TURBO_DASH : CHAKRA_COST_DASH;
    if (!f.stats.spendChakra(cost)) return;
    f.dashKind = kind;
    f.dashStartupFrames = kind === 'TURBO' ? DASH_STARTUP_TURBO : DASH_STARTUP_STANDARD;
    f.dashChargeFrames = 0;
    f.enterState(CombatState.DASH_STARTUP);
    this.faceTarget(f);
  }

  startSparkDash(f: Fighter): void {
    if (!f.stats.spendChakra(CHAKRA_COST_SPARK_DASH)) return;
    f.dashKind = 'SPARK';
    f.dashStartupFrames = DASH_STARTUP_SPARK;
    f.enterState(CombatState.SPARK_DASH);
    f.dashElapsed = -DASH_STARTUP_SPARK; // negative = startup frames remaining
    this.faceTarget(f);
    // Spark resets hit scaling on the victim so the extended route deals full damage
    if (f.target) f.target.stats.comboHits = 0;
    const p = f.position.clone();
    p.y += 1.0;
    this.effects.sparkDash(p);
    this.events.emit('SPARK', { attackerId: f.id, defenderId: f.target?.id ?? -1, damage: 0, text: `${f.def.displayName}: SPARK DASH`, color: 0xffee33 });
  }

  private launchDash(f: Fighter): void {
    const speed = this.dashSpeed(f);
    this.dirToTarget(f, this.tmpA);
    // Aim slightly toward the target's current altitude for aerial pursuit
    const dy = f.target ? f.target.position.y - f.position.y : 0;
    f.velocity.copy(this.tmpA).multiplyScalar(speed);
    f.velocity.y = Math.max(-speed * 0.5, Math.min(speed * 0.5, dy * 4));
    f.dashElapsed = 0;
    if (f.state !== CombatState.SPARK_DASH) f.enterState(CombatState.DASH_HOMING);
    this.faceTarget(f);
  }

  private dashSpeed(f: Fighter): number {
    const base = f.dashKind === 'SPARK' ? DASH_SPEED_SPARK : f.dashKind === 'CHARGED' ? DASH_SPEED_CHARGED : DASH_SPEED_STANDARD;
    return base * f.def.dashSpeedMultiplier;
  }

  private beginNinjaMove(f: Fighter): void {
    // Lateral hop around the target: project the stick onto the tangent of the lock-on circle.
    this.dirToTarget(f, this.tmpA);
    this.tmpB.set(-this.tmpA.z, 0, this.tmpA.x); // tangent
    const s = this.moveDir.dot(this.tmpB) >= 0 ? 1 : -1;
    // Blend tangent with radial intent so the hop can also close/open distance.
    const radial = this.moveDir.dot(this.tmpA);
    this.tmpC.copy(this.tmpB).multiplyScalar(s).addScaledVector(this.tmpA, radial * 0.6).normalize();
    f.velocity.x = this.tmpC.x * NINJA_MOVE_SPEED;
    f.velocity.z = this.tmpC.z * NINJA_MOVE_SPEED;
    f.velocity.y = 5.0; // ~0.3 s of air time: the whole side-step clip plays out
    f.grounded = false;
    f.position.y += 0.02;
    this.faceTarget(f);
  }

  // ------------------------------------------------------------ neutral
  private updateIdle(f: Fighter, dt: number, mag: number): void {
    this.applyFriction(f, dt, RUN_DECEL);
    this.faceTarget(f, 0.25);
    if (this.tryNeutralActions(f, mag)) return;
    if (mag > 0.15) f.enterState(CombatState.RUNNING);
  }

  private updateRunning(f: Fighter, dt: number, mag: number): void {
    if (mag <= 0.15) {
      f.enterState(CombatState.IDLE_NEUTRAL);
      return;
    }
    const speed = f.def.runSpeed * mag * (f.awakened ? 1.15 : 1);
    this.tmpA.copy(this.moveDir).multiplyScalar(speed);
    this.tmpB.set(f.velocity.x, 0, f.velocity.z);
    this.tmpC.subVectors(this.tmpA, this.tmpB);
    clampMagnitude(this.tmpC, RUN_ACCEL * dt);
    f.velocity.x += this.tmpC.x;
    f.velocity.z += this.tmpC.z;
    // Smooth rotation toward movement angle
    const want = Math.atan2(this.moveDir.x, this.moveDir.z);
    f.yaw = lerpAngle(f.yaw, want, 0.3);
    this.tryNeutralActions(f, mag);
  }

  private updateNinjaMove(f: Fighter, dt: number, mag: number): void {
    this.faceTarget(f);
    const buf = f.input.buffer;
    // Airborne part: hold the hop speed (no friction, no steering); landing kills the momentum.
    if (!f.grounded) {
      const sp = Math.hypot(f.velocity.x, f.velocity.z);
      if (sp > 1e-3 && sp < NINJA_MOVE_SPEED * 0.9) { f.velocity.x *= NINJA_MOVE_SPEED * 0.9 / sp; f.velocity.z *= NINJA_MOVE_SPEED * 0.9 / sp; }
    } else if (f.stateFrame > 2) {
      this.applyFriction(f, dt, 90);
    }
    if (buf.consume(InputFlag.THROW) && f.stateFrame > 2) {
      // Shuriken cancels the side step (momentum kept, the throw clip takes over). The clip is the
      // directional one (itl0 / itr0) chosen from which way the hop is travelling around the target.
      this.dirToTarget(f, this.tmpA);
      const right = f.velocity.x * this.tmpA.z - f.velocity.z * this.tmpA.x;
      f.enterState(CombatState.THROW);
      f.throwDir = Math.hypot(f.velocity.x, f.velocity.z) > 1 ? (right >= 0 ? 'L' : 'R') : null;
      return;
    }
    if (f.stateFrame > 5) {
      if (buf.consume(InputFlag.DASH) && f.stats.canSpendChakra(CHAKRA_COST_DASH)) {
        this.startDash(f, 'STANDARD');
        return;
      }
      if (buf.isHeld(InputFlag.GUARD)) {
        f.enterState(CombatState.GUARDING);
        return;
      }
      if (buf.consume(InputFlag.ATTACK)) {
        this.startCombo(f, this.branchFromHeld(f));
        return;
      }
    }
    if (f.grounded && f.stateFrame >= 6) {
      // Landed: chain only on a fresh press (a held pad button looped the hop = "slide lock").
      if (mag > 0.15 && buf.wasPressedWithin(InputFlag.JUMP, 6)) {
        buf.consume(InputFlag.JUMP);
        f.enterState(CombatState.NINJA_MOVE);
        this.beginNinjaMove(f);
        return;
      }
      if (f.stateFrame >= 10) f.enterState(mag > 0.15 ? CombatState.RUNNING : CombatState.IDLE_NEUTRAL);
    } else if (f.stateFrame >= 50) {
      // Hopped off a ledge / slope: hand over to the jump state instead of hanging in the hop.
      f.enterState(CombatState.JUMPING);
    }
  }

  private updateHollowStep(f: Fighter, dt: number, mag: number): void {
    this.faceTarget(f, 0.5);
    const buf = f.input.buffer;
    if (f.stateFrame <= 8) {
      f.velocity.x = this.tmpA.x = f.velocity.x; // keep
    } else {
      this.applyFriction(f, dt, 40);
    }
    if (f.stateFrame > 3) {
      if (buf.isHeld(InputFlag.GUARD)) {
        f.enterState(CombatState.GUARDING);
        return;
      }
      if (buf.consume(InputFlag.DASH) && f.stats.canSpendChakra(CHAKRA_COST_DASH)) {
        this.startDash(f, 'STANDARD');
        return;
      }
      if (buf.consume(InputFlag.ATTACK)) {
        this.startCombo(f, this.branchFromHeld(f));
        return;
      }
    }
    if (f.stateFrame >= HOLLOW_STEP_FRAMES && f.grounded) {
      f.enterState(mag > 0.15 ? CombatState.RUNNING : CombatState.IDLE_NEUTRAL);
    }
  }

  private startHollowStep(f: Fighter): void {
    f.enterState(CombatState.HOLLOW_STEP);
    f.velocity.x = this.moveDir.x * HOLLOW_STEP_SPEED;
    f.velocity.z = this.moveDir.z * HOLLOW_STEP_SPEED;
    f.velocity.y = 2.6;
    f.grounded = false;
    const p = f.position.clone();
    p.y += 0.2;
    this.effects.smokePuff(p, 0xffffff, 4);
  }

  private updateJumping(f: Fighter, dt: number, mag: number): void {
    this.faceTarget(f, 0.3);
    const buf = f.input.buffer;
    // Air drift
    f.velocity.x += this.moveDir.x * 18 * dt;
    f.velocity.z += this.moveDir.z * 18 * dt;
    if (buf.consume(InputFlag.DASH) && f.stats.canSpendChakra(CHAKRA_COST_DASH)) {
      this.startDash(f, 'STANDARD');
      return;
    }
    if (buf.consume(InputFlag.ATTACK)) {
      this.startCombo(f, 'AIR');
      return;
    }
    if (buf.consume(InputFlag.THROW)) {
      f.enterState(CombatState.THROW);
      f.throwDir = null; // air shuriken (PRJ_AIR), momentum kept
      return;
    }
    if (buf.consume(InputFlag.JUMP)) {
      if (mag > 0.15 && !f.airDashed) {
        // Air ninja move: a sideways burst (PL_ACT_NMOVE_SIDE in the air), once per jump.
        f.airDashed = true;
        f.airDashFrames = 12;
        f.velocity.x = this.moveDir.x * 12;
        f.velocity.z = this.moveDir.z * 12;
        f.velocity.y = Math.max(f.velocity.y, 2.5);
        const p = f.position.clone(); p.y += 0.6;
        this.effects.smokePuff(p, 0xe8e8ff, 6);
        this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: 'dash' });
      } else if (!f.doubleJumped) {
        // Double jump (JMP1): resets the arc and replays the jump clip.
        f.doubleJumped = true;
        f.jumpCount++;
        f.velocity.y = JUMP_VELOCITY * 0.92;
        f.stateFrame = 0;
        const p = f.position.clone(); p.y += 0.2;
        this.effects.smokePuff(p, 0xffffff, 5);
        this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: 'jump2' });
      }
    }
    if (f.airDashFrames > 0) {
      f.airDashFrames--;
      if (f.velocity.y < -1) f.velocity.y = -1; // glide through the burst
    }
    if (f.grounded && f.stateFrame > 2) {
      f.enterState(mag > 0.15 ? CombatState.RUNNING : CombatState.IDLE_NEUTRAL);
    }
  }

  // --------------------------------------------------------------- intro / ultimate / awakening
  private updateIntro(f: Fighter): void {
    f.velocity.set(0, 0, 0);
    f.invulnFrames = 2;
    this.faceTarget(f, 1);
    f.input.buffer.clear();
    if (f.stateFrame >= INTRO_FRAMES) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  private ultimateMove(f: Fighter): MoveDef {
    const d = f.def;
    return {
      name: `${d.code}_ultimate`,
      clip: d.ultimateClip ?? `${d.code}spl1`,
      totalFrames: ULTIMATE_TOTAL,
      cancelStart: 999, cancelEnd: 999, sparkCancelStart: 999, sparkCancelEnd: 999,
      forwardStep: 0,
      hitboxes: [{
        id: `${d.code}_ult`, socket: SOCKET.CHEST, radius: 1.5, activeStart: ULTIMATE_CUTIN + 6, activeEnd: ULTIMATE_CUTIN + 40,
        damage: 380, chakraGain: 0, reaction: HitReaction.TUMBLE, knockback: 26, launch: 7, hitstunFrames: 70, blockstunFrames: 30, guardDamage: 100,
        priority: HitPriority.ARMORED_JUTSU, armored: true,
      }],
    };
  }

  private startUltimate(f: Fighter): void {
    f.cinematic = false;
    f.stats.chakra = 0;
    f.enterState(CombatState.ULTIMATE);
    f.beginMove(this.ultimateMove(f), 'NEUTRAL', 0);
    f.ultimatePhase = 0;
    f.ultimateLanded = false;
    f.velocity.set(0, 0, 0);
    this.faceTarget(f, 1);
    const t = f.target;
    if (t) t.hitstopFrames = Math.max(t.hitstopFrames, ULTIMATE_CUTIN);
    f.hitstopFrames = 0;
    this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: t?.id ?? -1, damage: 0, text: `${f.def.displayName}: ${f.def.ultimateName ?? 'ULTIMATE JUTSU'}`, color: 0xffd166, shake: 0.35 });
  }

  private updateUltimate(f: Fighter, dt: number): void {
    const move = f.currentMove;
    const t = f.target;
    if (!move) { f.enterState(CombatState.IDLE_NEUTRAL); return; }
    f.moveFrame++;
    f.invulnFrames = 2; // armored through the whole sequence
    if (f.moveFrame <= ULTIMATE_CUTIN) {
      // Cut-in: both fighters hold while the portrait slides in; chakra flares off the body.
      f.velocity.set(0, 0, 0);
      if (f.moveFrame % 3 === 0) { const p = f.position.clone(); p.y += 0.9; this.effects.chargeAura(p, f.def.color as number); }
      this.faceTarget(f, 1);
      if (t) t.hitstopFrames = Math.max(t.hitstopFrames, 1);
      f.ultimatePhase = 0;
      return;
    }
    const landed = f.landedHitIds.size > 0;
    if (landed && !f.ultimateLanded) {
      // Finisher connected. With a cinematic clip (spl1_atk + exported camera) the demo plays out
      // with the victim held in frame; otherwise a long freeze and a camera slam.
      f.ultimateLanded = true;
      f.ultimatePhase = 2;
      f.velocity.set(0, 0, 0);
      const p = f.position.clone(); p.y += 1;
      this.effects.clashBurst(p);
      const atkClip = `${f.def.code}spl1_atk`;
      if (t && f.rig.hasClip(atkClip)) {
        const frames = Math.max(60, Math.round(f.rig.clipDuration(atkClip) * 60));
        f.beginMove({ ...move, clip: atkClip, totalFrames: frames, hitboxes: [] }, 'NEUTRAL', 0);
        f.moveFrame = 0;
        f.cinematic = true;
        f.hitstopFrames = 0;
        // Hold the victim at the demo's contact spot, facing the attacker, frozen in the hit pose.
        f.forward(this.tmpA);
        t.position.copy(f.position).addScaledVector(this.tmpA, 1.7);
        t.position.y = t.groundY;
        t.velocity.set(0, 0, 0);
        t.yaw = Math.atan2(-this.tmpA.x, -this.tmpA.z);
        t.enterState(CombatState.HITSTUN);
        t.stunFrames = frames + 10;
        this.victimDemoClip(t, `${f.def.code}spl1_dmg`, frames);
        this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: t.id, damage: 0, text: `${f.def.displayName}: ${f.def.ultimateName ?? 'ULTIMATE'} — demo`, color: 0xffffff });
      } else {
        f.hitstopFrames = 22;
        if (t) t.hitstopFrames = 22;
        this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: t?.id ?? -1, damage: 380, text: `${f.def.displayName}: ${f.def.ultimateName ?? 'ULTIMATE'} HIT!`, color: 0xffffff, shake: 0.8 });
      }
      return;
    }
    if (f.cinematic) {
      // Demo: attacker rooted, victim frozen and invulnerable, launched hard on the last frame.
      f.velocity.set(0, 0, 0);
      // Cinematic VFX: chakra aura on the body, periodic flashes, a big burst near the climax.
      const col = f.def.color as number;
      if (f.moveFrame % 3 === 0) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.spriteBurst('magic', this.tmpB, { color: col, count: 2, size: 0.9, life: 0.35, speed: 1.2, up: 1.2, additive: true, spin: 4, spread: 0.5, fadeIn: 0.15 }); }
      if (f.moveFrame % 10 === 0) { f.rig.socketWorld(SOCKET.R_HAND, this.tmpB); this.effects.flash('light', this.tmpB, 1.4, 0xffffff, 0.16); }
      if (f.moveFrame === Math.floor(move.totalFrames * 0.7)) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.clashBurst(this.tmpB); this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: f.def.ultimateSfx ?? 'exp2' }); }
      if (f.moveFrame >= move.totalFrames - 30 && f.moveFrame % 2 === 0 && t) { this.effects.spriteBurst('spark', t.position.clone().setY(t.position.y + 1), { color: 0xfff1a8, count: 3, size: 0.5, life: 0.3, speed: 5, additive: true, gravity: -8 }); }
      if (t) {
        t.hitstopFrames = Math.max(t.hitstopFrames, 2);
        t.invulnFrames = 2;
        t.velocity.set(0, 0, 0);
        t.flashTimer = 0; // hitstop skips the tick that fades the hit flash
        if (t.currentMove) t.moveFrame = f.moveFrame;
      }
      if (f.moveFrame >= move.totalFrames) {
        f.cinematic = false;
        if (t) {
          f.forward(this.tmpA);
          t.hitstopFrames = 0;
          t.velocity.set(this.tmpA.x * 26, 9, this.tmpA.z * 26);
          t.grounded = false;
          t.stunFrames = 60;
          t.lastHitBy = f.id;
          t.enterState(CombatState.TUMBLE);
          t.bounceOnLand = true;
        }
        this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: t?.id ?? -1, damage: 380, text: `${f.def.displayName}: ${f.def.ultimateName ?? 'ULTIMATE'} FINISH!`, color: 0xffffff, shake: 0.9 });
        f.enterState(CombatState.IDLE_NEUTRAL);
      }
      return;
    }
    if (!f.ultimateLanded) {
      // Homing rush toward the enemy until contact or the active window closes.
      f.ultimatePhase = 1;
      const hb = move.hitboxes[0];
      if (f.moveFrame <= hb.activeEnd && t) {
        this.faceTarget(f, 1);
        if (f.moveFrame % 2 === 0) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.spriteBurst('light', this.tmpB, { color: f.def.color as number, count: 1, size: 1.6, life: 0.25, speed: 0, up: 0, additive: true, grow: 2 }); }
        f.forward(this.tmpA);
        const dist = f.distanceToTarget();
        const speed = dist > 2.2 ? 26 : 0;
        f.velocity.x = this.tmpA.x * speed;
        f.velocity.z = this.tmpA.z * speed;
        if (!f.grounded) f.velocity.y = Math.max(f.velocity.y, -2);
        if (f.moveFrame % 3 === 0) { const p = f.position.clone(); p.y += 0.8; this.effects.dashTrail(p, f.def.color as number); }
      } else {
        this.applyFriction(f, dt, 60);
        if (f.moveFrame >= hb.activeEnd + 24) f.enterState(f.grounded ? CombatState.IDLE_NEUTRAL : CombatState.JUMPING); // whiffed
      }
      return;
    }
    this.applyFriction(f, dt, 60);
    if (f.moveFrame >= move.totalFrames) f.enterState(f.grounded ? CombatState.IDLE_NEUTRAL : CombatState.JUMPING);
  }

  private startAwaken(f: Fighter): void {
    f.enterState(CombatState.AWAKEN);
    f.velocity.set(0, 0, 0);
    f.invulnFrames = AWAKEN_FRAMES;
    this.events.emit('AWAKEN', { attackerId: f.id, defenderId: -1, damage: 0, text: `${f.def.displayName}: AWAKENING`, color: 0xff9a3c, shake: 0.4 });
  }

  private updateAwaken(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 80);
    f.invulnFrames = 2;
    if (f.stateFrame % 4 === 0) { const p = f.position.clone(); p.y += 0.9; this.effects.chargeAura(p, 0xff7a1a); }
    if (f.stateFrame >= AWAKEN_FRAMES) {
      f.awakened = true;
      f.awakenTimer = AWAKEN_DURATION;
      f.setAwakenedForm(true);
      f.stats.chakra = Math.max(f.stats.chakra, 40);
      f.rig.setAwakened(true, (f.def.color as number) === 0x1a1a1a ? 0xff7a1a : 0xff7a1a);
      const p = f.position.clone(); p.y += 1;
      this.effects.clashBurst(p);
      f.enterState(CombatState.IDLE_NEUTRAL);
    }
  }

  // --------------------------------------------------------------- dashes
  private updateDashStartup(f: Fighter, dt: number, mag: number): void {
    this.applyFriction(f, dt, 60);
    this.faceTarget(f);
    const buf = f.input.buffer;
    // Hollow step cancel during dash startup
    if (mag > 0.15 && buf.consume(InputFlag.JUMP)) {
      this.startHollowStep(f);
      return;
    }
    if (f.stateFrame >= f.dashStartupFrames) {
      if (f.dashKind === 'STANDARD' && buf.isHeld(InputFlag.DASH) && f.stats.canSpendChakra(CHAKRA_COST_CHARGED_DASH - CHAKRA_COST_DASH)) {
        f.enterState(CombatState.DASH_CHARGING);
        f.dashChargeFrames = 0;
        return;
      }
      this.launchDash(f);
    }
  }

  private updateDashCharging(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 60);
    this.faceTarget(f);
    f.dashChargeFrames++;
    const buf = f.input.buffer;
    if (f.chargeVfxTick++ % 2 === 0) this.effects.chargeAura(f.position, f.def.code === '2nrt' ? 0xffb347 : 0x9fb7ff);
    const released = !buf.isHeld(InputFlag.DASH);
    if (released || f.dashChargeFrames >= DASH_CHARGE_MAX_FRAMES) {
      if (f.dashChargeFrames >= DASH_CHARGE_MIN_FRAMES && f.stats.spendChakra(CHAKRA_COST_CHARGED_DASH - CHAKRA_COST_DASH)) {
        f.dashKind = 'CHARGED';
        this.events.emit('HIT', { attackerId: f.id, defenderId: -1, damage: 0, text: `${f.def.displayName}: CHARGED DASH`, color: 0xffb347 });
      }
      this.launchDash(f);
    }
  }

  private updateDashHoming(f: Fighter, dt: number): void {
    // Spark dash startup (dashElapsed negative)
    if (f.dashElapsed < 0) {
      f.dashElapsed++;
      this.applyFriction(f, dt, 80);
      if (f.dashElapsed === 0) this.launchDash(f);
      return;
    }
    f.dashElapsed++;
    const t = f.target;
    if (!t) {
      f.enterState(CombatState.IDLE_NEUTRAL);
      return;
    }
    const speed = this.dashSpeed(f);

    // Predictive interception
    const toEnemy = this.tmpA.subVectors(t.position, f.position);
    const dist = toEnemy.length();
    const tau = dist / speed;
    const pred = this.tmpB.copy(t.position).addScaledVector(t.velocity, tau);
    if (pred.y < 0) pred.y = 0;
    const desired = this.tmpC.subVectors(pred, f.position);
    if (desired.lengthSq() > 1e-6) desired.normalize().multiplyScalar(speed);
    // a_steer = clamp_mag((v_desired - v) / dt, F_turn_max)
    const steer = desired.sub(f.velocity).divideScalar(dt);
    clampMagnitude(steer, DASH_TURN_FORCE_MAX);
    f.velocity.addScaledVector(steer, dt);
    // Hold speed constant along the flight
    const vl = f.velocity.length();
    if (vl > 1e-4) f.velocity.multiplyScalar(speed / vl);

    this.faceTarget(f);
    if (f.dashElapsed % 2 === 0) {
      const p = f.position.clone();
      p.y += 0.9;
      this.effects.dashTrail(p, f.dashKind === 'SPARK' ? 0xffee33 : f.dashKind === 'CHARGED' ? 0xffb347 : 0x7dd3ff);
    }

    if (f.dashElapsed > DASH_MAX_FRAMES) {
      f.velocity.multiplyScalar(0.2);
      f.enterState(CombatState.IDLE_NEUTRAL);
    }
  }

  private updateDashImpact(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 90);
    this.faceTarget(f);
    const buf = f.input.buffer;
    if (buf.consume(InputFlag.ATTACK)) {
      this.startCombo(f, this.branchFromHeld(f));
      return;
    }
    if (buf.consume(InputFlag.DASH) && f.stats.canSpendChakra(CHAKRA_COST_DASH)) {
      this.startDash(f, 'STANDARD');
      return;
    }
    if (f.stateFrame >= DASH_IMPACT_FRAMES) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  private updateTimedRecovery(f: Fighter, dt: number, frames: number): void {
    this.applyFriction(f, dt, 40);
    this.faceTarget(f, 0.2);
    if (f.stateFrame >= frames && f.grounded) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  // -------------------------------------------------------------- strings
  private updateComboString(f: Fighter, dt: number, mag: number): void {
    const move = f.currentMove;
    if (!move) {
      f.enterState(CombatState.IDLE_NEUTRAL);
      return;
    }
    f.moveFrame++;
    const buf = f.input.buffer;
    const first = move.hitboxes[0];
    const activeStart = first ? first.activeStart : Math.floor(move.totalFrames * 0.3);
    const activeEnd = first ? first.activeEnd : activeStart + 4;

    // Track the target during startup, lock during active frames
    if (f.moveFrame < activeStart) this.faceTarget(f, 0.5);

    if (f.comboBranch === 'AIR') {
      // Aerial string: hang in the air through the swing, drop with the last (spike) hit.
      const last = f.comboIndex >= this.stringFor(f, 'AIR').length - 1;
      if (!last && f.moveFrame <= activeEnd + 4) f.velocity.y = Math.max(f.velocity.y, -1.5);
      if (f.grounded && f.moveFrame > 4) { f.enterState(CombatState.IDLE_NEUTRAL); return; }
    }

    // Forward step during the strike, halted when already in contact range
    const dist = f.distanceToTarget();
    if (f.moveFrame >= activeStart - 3 && f.moveFrame <= activeEnd && dist > 1.1) {
      f.forward(this.tmpA);
      f.velocity.x = this.tmpA.x * move.forwardStep;
      f.velocity.z = this.tmpA.z * move.forwardStep;
    } else {
      this.applyFriction(f, dt, 70);
    }

    // Turbo dash: single strike buffered into a dash during its first frames
    if (f.comboIndex === 0 && f.comboBranch === 'NEUTRAL' && f.moveFrame <= 4 && buf.wasPressedWithin(InputFlag.DASH, 8)) {
      if (f.stats.canSpendChakra(CHAKRA_COST_TURBO_DASH)) {
        buf.consume(InputFlag.DASH);
        this.startDash(f, 'TURBO');
        this.events.emit('HIT', { attackerId: f.id, defenderId: -1, damage: 0, text: `${f.def.displayName}: TURBO DASH`, color: 0x7dd3ff });
        return;
      }
    }
    // Spark dash cancel
    if (f.moveFrame >= move.sparkCancelStart && f.moveFrame <= move.sparkCancelEnd && buf.consume(InputFlag.DASH)) {
      if (f.stats.canSpendChakra(CHAKRA_COST_SPARK_DASH)) {
        this.startSparkDash(f);
        return;
      }
    }
    // Hollow step: directional jump-cancel out of recovery
    if (mag > 0.15 && f.moveFrame > activeEnd && buf.consume(InputFlag.JUMP)) {
      this.startHollowStep(f);
      return;
    }
    // Buffer follow-up
    if (buf.consume(InputFlag.ATTACK)) {
      f.pendingBranch = this.branchFromHeld(f);
      if (f.pendingBranch === 'NEUTRAL') f.pendingBranch = f.comboBranch;
    }
    if (f.pendingBranch && f.moveFrame >= move.cancelStart && f.moveFrame <= move.cancelEnd) {
      const nextBranch = f.pendingBranch;
      let nextIndex: number;
      let moves: MoveDef[];
      if (nextBranch !== f.comboBranch && f.comboBranch === 'NEUTRAL') {
        moves = this.stringFor(f, nextBranch);
        nextIndex = 0;
      } else {
        moves = this.stringFor(f, f.comboBranch);
        nextIndex = f.comboIndex + 1;
      }
      if (nextIndex < moves.length) {
        f.beginMove(moves[nextIndex], nextBranch !== f.comboBranch && f.comboBranch === 'NEUTRAL' ? nextBranch : f.comboBranch, nextIndex);
        f.stateFrame = 0;
        this.faceTarget(f);
        return;
      }
      f.pendingBranch = null;
    }
    if (f.moveFrame >= move.totalFrames) {
      f.enterState(f.grounded ? CombatState.IDLE_NEUTRAL : CombatState.JUMPING);
    }
  }

  /** Set by the game: does an exported cinematic camera exist for this clip? */
  hasCinematicCam: (clip: string) => boolean = () => false;

  /** Play the attacker's victim clip on the held target when it was retargeted onto their rig. */
  private victimDemoClip(t: Fighter, clip: string, frames: number): void {
    if (!t.rig.hasClip(clip)) return;
    t.beginMove({ ...t.def.jutsu, name: 'demo_dmg', clip, totalFrames: frames, hitboxes: [] }, 'NEUTRAL', 0);
    t.moveFrame = 0;
  }

  /** Jutsu demo: attacker rooted on the demo clip, victim frozen in frame, launched on the last frame. */
  private updateJutsuDemo(f: Fighter, move: MoveDef): void {
    const t = f.target;
    f.velocity.set(0, 0, 0);
    f.invulnFrames = 2;
    const col = f.def.color as number;
    if (f.moveFrame % 4 === 0) { f.rig.socketWorld(SOCKET.R_HAND, this.tmpB); this.effects.spriteBurst('magic', this.tmpB, { color: col, count: 2, size: 0.7, life: 0.3, speed: 1.0, up: 0.8, additive: true, spin: 5, spread: 0.4, fadeIn: 0.1 }); }
    if (f.moveFrame >= move.totalFrames - 24 && f.moveFrame % 2 === 0 && t) { this.effects.spriteBurst('spark', t.position.clone().setY(t.position.y + 1), { color: 0xfff1a8, count: 2, size: 0.45, life: 0.28, speed: 4, additive: true, gravity: -8 }); }
    if (f.moveFrame === Math.floor(move.totalFrames * 0.75)) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.clashBurst(this.tmpB); this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: f.def.jutsuSfx ?? 'rasen' }); }
    if (t) {
      t.hitstopFrames = Math.max(t.hitstopFrames, 2);
      t.invulnFrames = 2;
      t.velocity.set(0, 0, 0);
      t.flashTimer = 0;
      if (t.currentMove) t.moveFrame = f.moveFrame;
    }
    if (f.moveFrame >= move.totalFrames) {
      f.cinematic = false;
      if (t) {
        f.forward(this.tmpA);
        t.hitstopFrames = 0;
        const dmg = t.stats.applyDamage(JUTSU_DEMO_DAMAGE * (f.awakened ? AWAKEN_DAMAGE_MULT : 1));
        t.velocity.set(this.tmpA.x * 20, 8, this.tmpA.z * 20);
        t.grounded = false;
        t.stunFrames = 50;
        t.lastHitBy = f.id;
        t.enterState(CombatState.TUMBLE);
        t.bounceOnLand = true;
        this.events.emit('JUTSU', { attackerId: f.id, defenderId: t.id, damage: dmg, text: `${f.def.displayName}: ${f.def.jutsuName ?? 'JUTSU'} HIT!`, color: 0xbfe8ff, shake: 0.6 });
      }
      f.enterState(CombatState.IDLE_NEUTRAL);
    }
  }

  private updateJutsu(f: Fighter, dt: number): void {
    const move = f.currentMove;
    if (!move) {
      f.enterState(CombatState.IDLE_NEUTRAL);
      return;
    }
    f.moveFrame++;
    if (f.cinematic) { this.updateJutsuDemo(f, move); return; }
    const t = f.target;
    // Jutsu demo (Storm: the real `skl1_atk` clip + its camera once the jutsu connects).
    if (t && f.landedHitIds.size > 0 && !f.jutsuDemoDone) {
      const demoClip = `${f.def.code}skl1_atk1`;
      if (f.rig.hasClip(demoClip) && this.hasCinematicCam(demoClip)) {
        f.jutsuDemoDone = true;
        const frames = Math.max(40, Math.round(f.rig.clipDuration(demoClip) * 60));
        f.beginMove({ ...move, clip: demoClip, totalFrames: frames, hitboxes: [] }, 'NEUTRAL', 0);
        f.moveFrame = 0;
        f.cinematic = true;
        f.hitstopFrames = 0;
        f.velocity.set(0, 0, 0);
        f.forward(this.tmpA);
        t.position.copy(f.position).addScaledVector(this.tmpA, 1.5);
        t.position.y = t.groundY;
        t.velocity.set(0, 0, 0);
        t.yaw = Math.atan2(-this.tmpA.x, -this.tmpA.z);
        t.enterState(CombatState.HITSTUN);
        t.stunFrames = frames + 10;
        t.hitstopFrames = 0;
        this.victimDemoClip(t, `${f.def.code}skl1_dmg1`, frames);
        this.events.emit('JUTSU', { attackerId: f.id, defenderId: t.id, damage: 0, text: `${f.def.displayName}: ${f.def.jutsuName ?? 'JUTSU'} — demo`, color: 0xbfe8ff });
        return;
      }
    }
    const hb = move.hitboxes[0];
    if (f.moveFrame < hb.activeStart) this.faceTarget(f, 0.6);
    const dist = f.distanceToTarget();
    if (f.moveFrame >= hb.activeStart && f.moveFrame <= hb.activeEnd && dist > 1.2) {
      f.forward(this.tmpA);
      f.velocity.x = this.tmpA.x * move.forwardStep;
      f.velocity.z = this.tmpA.z * move.forwardStep;
    } else {
      this.applyFriction(f, dt, 80);
    }
    // Projectile jutsu (fireball / clay / sand): launch once at the active frame, no palm hitbox.
    const pj = f.def.jutsuProjectile;
    if (pj && this.projectiles) {
      if (f.moveFrame === hb.activeStart) {
        this.projectiles.launch(f, f.target, pj);
        this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: pj.launchSfx ?? 'goukakyu' });
      }
      if (f.moveFrame >= hb.activeStart - 10 && f.moveFrame <= hb.activeStart) {
        f.rig.socketWorld(hb.socket, this.tmpB);
        this.effects.spriteBurst(pj.sprite ?? 'flame', this.tmpB, { color: pj.color, count: 2, size: 0.6, life: 0.2, speed: 1, additive: true, spin: 6 });
      }
      if (f.moveFrame >= move.totalFrames) f.enterState(CombatState.IDLE_NEUTRAL);
      return;
    }
    // Jutsu VFX on the bound dummy socket
    if (f.moveFrame >= hb.activeStart - 8 && f.moveFrame <= hb.activeEnd) {
      f.rig.socketWorld(hb.socket, this.tmpB);
      if (f.def.code === '2nrt') this.effects.rasenganTick(this.tmpB);
      else this.effects.chidoriTick(this.tmpB);
    }
    if (f.moveFrame >= move.totalFrames) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  // ---------------------------------------------------------------- guard
  private updateGuarding(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 50);
    this.faceTarget(f, 0.4);
    const buf = f.input.buffer;
    if (buf.consume(InputFlag.ATTACK)) {
      if (f.stats.canGuardCounter()) {
        f.stats.applyGuardCounterPenalty();
        f.enterState(CombatState.GUARD_COUNTER);
        f.parryActive = false;
        return;
      }
    }
    if (!buf.isHeld(InputFlag.GUARD)) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  private updateGuardCounter(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 50);
    this.faceTarget(f);
    // Active parry window frames 2..7 (6 frames)
    f.parryActive = f.stateFrame >= 2 && f.stateFrame <= 7;
    if (f.stateFrame >= GUARD_COUNTER_TOTAL) {
      f.parryActive = false;
      f.enterState(f.input.buffer.isHeld(InputFlag.GUARD) ? CombatState.GUARDING : CombatState.IDLE_NEUTRAL);
    }
  }

  private updateGuardBreak(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 30);
    if (f.stateFrame >= GUARD_BREAK_STUN_FRAMES) {
      f.stats.guardHealth = BALANCE.GUARDBREAK_RECOVER_SCORE;
      f.enterState(CombatState.IDLE_NEUTRAL);
    }
  }

  private updateBlockstun(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 30);
    f.stunFrames--;
    if (f.stunFrames <= 0) f.enterState(f.input.buffer.isHeld(InputFlag.GUARD) ? CombatState.GUARDING : CombatState.IDLE_NEUTRAL);
  }

  // ---------------------------------------------------------------- stun
  private trySubstitute(f: Fighter): boolean {
    if (f.subLockFrames > 0) return false;
    if (!f.input.buffer.consume(InputFlag.SUB)) return false;
    return this.substitute(f);
  }

  /** Tethered victim upkeep: returns true while the attacker's string still holds them. */
  private applyTether(f: Fighter): boolean {
    if (!f.tetherBy || f.tetherFrames <= 0) return false;
    const a = f.target && f.target.id === f.tetherBy ? f.target : null;
    if (!a || a.state !== CombatState.COMBO_STRING || a.hitstopFrames > 0 && f.hitstopFrames > 0) {
      if (!a || a.state !== CombatState.COMBO_STRING) { f.tetherBy = 0; f.tetherFrames = 0; return false; }
    }
    f.tetherFrames--;
    // Hold at striking distance in front of the attacker, facing them; no gravity while held in the air.
    a.forward(this.tmpA);
    this.tmpB.copy(a.position).addScaledVector(this.tmpA, 1.35);
    f.position.x += (this.tmpB.x - f.position.x) * 0.3;
    f.position.z += (this.tmpB.z - f.position.z) * 0.3;
    f.velocity.x *= 0.5; f.velocity.z *= 0.5;
    if (!f.grounded || !a.grounded) {
      const want = a.position.y + (a.grounded ? 0 : 0.2);
      f.position.y += (Math.max(f.groundY, want) - f.position.y) * 0.25;
      f.velocity.y = 0;
      f.grounded = f.position.y <= f.groundY + 0.001;
    }
    f.yaw = Math.atan2(-this.tmpA.x, -this.tmpA.z);
    if (f.stunFrames < 2) f.stunFrames = 2;
    return true;
  }

  private updateHitstun(f: Fighter, dt: number): void {
    if (this.trySubstitute(f)) return;
    if (this.applyTether(f)) return;
    this.applyFriction(f, dt, 40);
    f.stunFrames--;
    if (f.stunFrames <= 0 && f.grounded) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  private updateLaunched(f: Fighter, dt: number): void {
    if (this.trySubstitute(f)) return;
    if (this.applyTether(f)) return;
    // Light air drag
    f.velocity.x *= 1 - 0.6 * dt;
    f.velocity.z *= 1 - 0.6 * dt;
    if (f.grounded && f.stateFrame > 3 && f.velocity.y <= 0) {
      f.enterState(CombatState.KNOCKDOWN);
      f.velocity.set(0, 0, 0);
    }
  }

  private updateTumble(f: Fighter, dt: number): void {
    if (this.trySubstitute(f)) return;
    f.velocity.x *= 1 - 0.9 * dt;
    f.velocity.z *= 1 - 0.9 * dt;
    if (f.grounded && f.stateFrame > 3) {
      if (f.bounceOnLand) {
        f.bounceOnLand = false;
        f.velocity.y = 9.0;
        f.velocity.x *= 0.5;
        f.velocity.z *= 0.5;
        f.grounded = false;
        f.stateFrame = 1;
        const p = f.position.clone();
        this.effects.smokePuff(p, 0xd9d2b8, 6);
        this.events.emit('HIT', { attackerId: f.lastHitBy, defenderId: f.id, damage: 0, text: `${f.def.displayName}: GROUND BOUNCE`, color: 0xffffff, shake: 0.15 });
        return;
      }
      f.enterState(CombatState.KNOCKDOWN);
      f.velocity.set(0, 0, 0);
    }
  }

  private updateCrumple(f: Fighter, dt: number): void {
    if (this.trySubstitute(f)) return;
    this.applyFriction(f, dt, 30);
    f.stunFrames--;
    if (f.stunFrames <= 0) {
      f.enterState(CombatState.KNOCKDOWN);
      f.stateFrame = KNOCKDOWN_OTG_WINDOW; // crumple already spent the OTG window
    }
  }

  private updateKnockdown(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 30);
    f.bounceOnLand = false;
    if (f.stateFrame > KNOCKDOWN_OTG_WINDOW) f.invulnFrames = 2;
    if (f.stateFrame >= KNOCKDOWN_FRAMES) {
      f.enterState(CombatState.IDLE_NEUTRAL);
      f.invulnFrames = 6;
      f.stats.resetCombo();
    }
  }

  private updateWallSplat(f: Fighter, dt: number): void {
    if (this.trySubstitute(f)) return;
    f.velocity.set(0, 0, 0);
    if (f.stateFrame >= WALL_SPLAT_FRAMES) {
      // Slide down into a knockdown
      f.velocity.copy(f.wallSplatNormal).multiplyScalar(2.0);
      f.velocity.y = -2.0;
      f.grounded = false;
      f.enterState(CombatState.TUMBLE);
      f.stateFrame = 4;
      f.bounceOnLand = false;
    }
  }

  private updateSubstituted(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 40);
    this.faceTarget(f);
    if (f.stateFrame >= SUBSTITUTED_FRAMES) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  // =========================================================================
  // Resolvers used by the collision pass
  // =========================================================================

  /** Substitution Jutsu: consume a stock, drop a log, teleport behind the opponent. */
  substitute(f: Fighter): boolean {
    const t = f.target;
    if (!t) return false;
    if (!f.stats.consumeSub()) return false;
    this.effects.substitutionLog(f.position.clone());
    // PL_ACT_DODGE_WARP_ENEMY: -2.5 m along the opponent's back-vector; PL_ACT_DODGE_WARP_UPPER
    // when the victim was airborne: reappear above and slightly behind instead.
    t.forward(this.tmpA);
    const upper = !f.grounded && f.position.y > 1.0;
    f.position.copy(t.position).addScaledVector(this.tmpA, upper ? -1.2 : -SUB_TELEPORT_DISTANCE);
    f.position.y = upper ? t.position.y + 2.6 : t.grounded ? t.groundY : t.position.y;
    f.velocity.set(0, 0, 0);
    f.groundY = t.groundY;
    f.grounded = f.position.y <= f.groundY + 0.001;
    f.yaw = f.yawToTarget();
    f.stunFrames = 0;
    f.bounceOnLand = false;
    f.enterState(CombatState.SUBSTITUTED);
    f.invulnFrames = 14;
    f.stats.resetCombo();
    const p = f.position.clone();
    p.y += 0.5;
    this.effects.smokePuff(p, 0xffffff, 8);
    this.events.emit('SUB', { attackerId: t.id, defenderId: f.id, damage: 0, text: `${f.def.displayName}: SUBSTITUTION (${f.stats.subStocks} left)`, color: 0xffffff });
    return true;
  }

  /** Apply a clean hit to `defender`. Returns the damage dealt. */
  applyHit(defender: Fighter, attacker: Fighter, hb: HitboxDef, point: THREE.Vector3, opts: { hitstop?: number; direction?: THREE.Vector3 } = {}): number {
    if (defender.state === CombatState.DEAD) return 0;
    const dmg = defender.stats.applyDamage(hb.damage * (attacker.awakened ? AWAKEN_DAMAGE_MULT : 1));
    attacker.stats.gainChakra(hb.chakraGain);
    // RATE_DAMAGE_LIFE_TO_CHAKRA: taking damage feeds the victim's chakra a little
    defender.stats.gainChakra(dmg * BALANCE.RATE_DAMAGE_LIFE_TO_CHAKRA);

    // Knockback along attacker->defender (or an explicit direction)
    if (opts.direction) this.tmpA.copy(opts.direction);
    else this.tmpA.subVectors(defender.position, attacker.position);
    this.tmpA.y = 0;
    if (this.tmpA.lengthSq() < 1e-6) attacker.forward(this.tmpA);
    this.tmpA.normalize();
    const wasAirborne = !defender.grounded;

    // Hit direction relative to the victim's facing → directional CC2 damage clip
    defender.forward(this.tmpB);
    const fwdDot = -this.tmpA.dot(this.tmpB); // hit coming from the front if the knockback points backward
    const rightDot = -(this.tmpA.x * this.tmpB.z - this.tmpA.z * this.tmpB.x);
    defender.lastHitDir = Math.abs(fwdDot) >= Math.abs(rightDot) ? (fwdDot >= 0 ? 'F' : 'B') : rightDot >= 0 ? 'L' : 'R';

    // Hitstop (HITSTOP_*): both fighters freeze for a few frames
    const stop = opts.hitstop ?? (hb.priority >= 5 ? BALANCE.HITSTOP_HEAVY : hb.reaction === HitReaction.STAGGER ? BALANCE.HITSTOP_NORMAL : BALANCE.HITSTOP_HEAVY - 1);
    defender.hitstopFrames = Math.max(defender.hitstopFrames, stop);
    attacker.hitstopFrames = Math.max(attacker.hitstopFrames, stop);

    defender.velocity.set(this.tmpA.x * hb.knockback, hb.launch, this.tmpA.z * hb.knockback);
    defender.stunFrames = hb.hitstunFrames;
    // Combo tether (Storm "juggle lock"): while the attacker is inside a string that still has
    // follow-ups, the victim stays attached — hitstun cannot run out, they hover in air strings and
    // are held at striking distance — so a string that starts, lands.
    if ((attacker.state === CombatState.COMBO_STRING || attacker.state === CombatState.SUPPORT_ACT) && attacker.currentMove) {
      const moves = this.stringFor(attacker, attacker.comboBranch);
      const last = attacker.comboIndex >= moves.length - 1;
      if (!last) {
        defender.tetherBy = attacker.id;
        defender.tetherFrames = attacker.currentMove.totalFrames - attacker.moveFrame + 16;
        // keep them close: cap the knockback so the next hit reaches
        defender.velocity.x *= 0.35; defender.velocity.z *= 0.35;
      } else {
        defender.tetherBy = 0; defender.tetherFrames = 0;
      }
    } else {
      defender.tetherBy = 0; defender.tetherFrames = 0;
    }
    defender.lastHitBy = attacker.id;
    defender.flashTimer = 0.08;
    defender.yaw = Math.atan2(-this.tmpA.x, -this.tmpA.z);
    defender.bounceOnLand = false;

    switch (hb.reaction) {
      case HitReaction.STAGGER:
        if (wasAirborne) {
          defender.velocity.y = Math.max(hb.launch, 4.0);
          defender.enterState(CombatState.LAUNCHED);
        } else {
          defender.velocity.y = 0;
          defender.enterState(CombatState.HITSTUN);
        }
        break;
      case HitReaction.LAUNCH:
        defender.grounded = false;
        defender.enterState(CombatState.LAUNCHED);
        break;
      case HitReaction.SPIKE:
        if (wasAirborne) {
          defender.bounceOnLand = true;
          defender.enterState(CombatState.TUMBLE);
        } else {
          defender.velocity.y = 0;
          defender.enterState(CombatState.HITSTUN);
        }
        break;
      case HitReaction.KNOCKBACK:
      case HitReaction.TUMBLE:
        defender.grounded = false;
        if (defender.velocity.y < 2) defender.velocity.y = Math.max(defender.velocity.y, 2.5);
        defender.enterState(CombatState.TUMBLE);
        break;
      case HitReaction.CRUMPLE:
        defender.velocity.set(0, 0, 0);
        defender.enterState(CombatState.CRUMPLE);
        break;
    }

    this.effects.hitSpark(point, hb.priority >= 5 ? 0x7dd3ff : 0xffe066, hb.priority >= 5 ? 22 : 10, hb.priority >= 5 ? 12 : 6);
    this.events.emit('HIT', {
      attackerId: attacker.id,
      defenderId: defender.id,
      hitbox: hb,
      point,
      damage: dmg,
      text: `${attacker.def.displayName} hit ${defender.def.displayName} (${hb.id}) -${dmg}`,
      color: 0xffe066,
      shake: hb.priority >= 5 ? 0.35 : hb.reaction === HitReaction.STAGGER ? 0.06 : 0.16,
    });
    if (defender.stats.isDead) {
      defender.enterState(CombatState.DEAD);
      defender.velocity.set(this.tmpA.x * 6, 5, this.tmpA.z * 6);
    }
    return dmg;
  }

  /** A strike absorbed by the guard sphere. */
  applyGuardHit(defender: Fighter, attacker: Fighter, hb: HitboxDef, point: THREE.Vector3): void {
    this.tmpA.subVectors(defender.position, attacker.position);
    this.tmpA.y = 0;
    if (this.tmpA.lengthSq() < 1e-6) attacker.forward(this.tmpA);
    this.tmpA.normalize();
    const broke = defender.stats.applyGuardDamage(hb.guardDamage);
    const push = hb.knockback * 0.35 + 2.0;
    defender.velocity.set(this.tmpA.x * push, 0, this.tmpA.z * push);
    attacker.stats.gainChakra(hb.chakraGain * 0.5);
    if (broke) {
      defender.enterState(CombatState.GUARD_BREAK);
      defender.velocity.multiplyScalar(0.5);
      defender.hitstopFrames = attacker.hitstopFrames = BALANCE.HITSTOP_GUARD_BREAK;
      this.effects.guardSpark(point, 0xff3f3f);
      this.effects.clashBurst(point);
      this.events.emit('GUARD_BREAK', { attackerId: attacker.id, defenderId: defender.id, point, damage: 0, text: `${defender.def.displayName}: GUARD BREAK!`, color: 0xff3f3f, shake: 0.3 });
    } else {
      defender.stunFrames = hb.blockstunFrames;
      defender.enterState(CombatState.BLOCKSTUN);
      this.effects.guardSpark(point, defender.stats.guardColor);
      this.events.emit('GUARD_HIT', { attackerId: attacker.id, defenderId: defender.id, point, damage: 0, text: `${defender.def.displayName} blocked ${hb.id} (guard ${Math.round(defender.stats.guardHealth)})`, color: 0x3fa9ff, shake: 0.04 });
    }
  }

  /** Guard Break Counter success: attacker crumples for 16 frames with sub disabled. */
  applyParry(parrier: Fighter, attacker: Fighter, point: THREE.Vector3): void {
    this.tmpA.subVectors(attacker.position, parrier.position);
    this.tmpA.y = 0;
    if (this.tmpA.lengthSq() < 1e-6) parrier.forward(this.tmpA);
    this.tmpA.normalize();
    attacker.velocity.set(this.tmpA.x * 4, 0, this.tmpA.z * 4);
    attacker.stunFrames = GUARD_COUNTER_CRUMPLE_FRAMES;
    attacker.subLockFrames = GUARD_COUNTER_CRUMPLE_FRAMES + 4;
    attacker.enterState(CombatState.CRUMPLE);
    attacker.flashTimer = 0.1;
    attacker.stats.resetCombo(); // unscaled punish for the defender
    parrier.parryActive = false;
    parrier.enterState(CombatState.IDLE_NEUTRAL);
    parrier.input.buffer.clear();
    this.effects.parryFlash(point);
    this.events.emit('PARRY', { attackerId: parrier.id, defenderId: attacker.id, point, damage: 0, text: `${parrier.def.displayName}: GUARD BREAK COUNTER!`, color: 0x9be7ff, shake: 0.25 });
  }

  /** Dash reached its target (target is not dashing). */
  resolveDashImpact(attacker: Fighter, defender: Fighter): void {
    if (defender.invulnFrames > 0 || defender.state === CombatState.DEAD) return;
    if (defender.state === CombatState.KNOCKDOWN && defender.stateFrame > KNOCKDOWN_OTG_WINDOW) return;
    const point = defender.position.clone();
    point.y += 1.0;

    if (defender.parryActive) {
      this.applyParry(defender, attacker, point);
      return;
    }
    if (defender.armorActive() && defender.currentMove) {
      // Jutsu override: dashing player absorbs the jutsu, trajectory halts.
      const hb = defender.currentMove.hitboxes[0];
      attacker.velocity.set(0, 0, 0);
      this.applyHit(attacker, defender, hb, attacker.position.clone().setY(attacker.position.y + 1));
      defender.landedHitIds.add(hb.id);
      this.events.emit('ARMOR', { attackerId: defender.id, defenderId: attacker.id, point, damage: 0, text: `${defender.def.displayName}: JUTSU OVERRIDES DASH`, color: 0x7dd3ff, shake: 0.3 });
      return;
    }
    const dir = this.dirToTarget(attacker, this.tmpA).clone();
    const guarding = defender.state === CombatState.GUARDING || defender.state === CombatState.BLOCKSTUN || defender.state === CombatState.GUARD_COUNTER;
    const charged = attacker.dashKind === 'CHARGED';
    if (guarding) {
      // Attacker deflected backward; defender takes blockstun + shield pushback
      attacker.velocity.copy(dir).multiplyScalar(DASH_REBOUND_SPEED);
      attacker.velocity.y = 2.0;
      attacker.grounded = false;
      attacker.enterState(CombatState.DASH_REBOUND);
      const broke = defender.stats.applyGuardDamage(charged ? 32 : 10);
      defender.velocity.copy(dir).multiplyScalar(charged ? 10 : 3);
      if (broke) {
        defender.enterState(CombatState.GUARD_BREAK);
        this.events.emit('GUARD_BREAK', { attackerId: attacker.id, defenderId: defender.id, point, damage: 0, text: `${defender.def.displayName}: GUARD BREAK!`, color: 0xff3f3f, shake: 0.3 });
      } else {
        defender.stunFrames = charged ? 22 : 12;
        defender.enterState(CombatState.BLOCKSTUN);
        this.events.emit('GUARD_HIT', { attackerId: attacker.id, defenderId: defender.id, point, damage: 0, text: `${defender.def.displayName} blocked ${attacker.dashKind} dash`, color: 0x3fa9ff, shake: charged ? 0.2 : 0.06 });
      }
      this.effects.guardSpark(point, defender.stats.guardColor);
      return;
    }
    // Clean dash hit
    const dmg = charged ? 60 : attacker.dashKind === 'SPARK' ? 30 : 25;
    const hb: HitboxDef = {
      id: `${attacker.dashKind.toLowerCase()}_dash`,
      socket: SOCKET.CHEST,
      radius: 1,
      damage: dmg,
      chakraGain: 3,
      reaction: charged ? HitReaction.TUMBLE : HitReaction.STAGGER,
      knockback: charged ? 14 : 3,
      launch: charged ? 6 : 0,
      hitstunFrames: charged ? 40 : 16,
      blockstunFrames: 12,
      guardDamage: 10,
      priority: 1,
      activeStart: 0,
      activeEnd: 0,
    };
    this.applyHit(defender, attacker, hb, point);
    attacker.velocity.multiplyScalar(0.15);
    attacker.velocity.y = 0;
    attacker.enterState(CombatState.DASH_IMPACT);
  }

  /** Two dashes collide within the clash radius. */
  resolveClash(a: Fighter, b: Fighter): void {
    const ra = DASH_RANK[a.dashKind];
    const rb = DASH_RANK[b.dashKind];
    const mid = a.position.clone().add(b.position).multiplyScalar(0.5);
    mid.y += 1.0;
    this.tmpA.subVectors(b.position, a.position);
    this.tmpA.y = 0;
    if (this.tmpA.lengthSq() < 1e-6) a.forward(this.tmpA);
    this.tmpA.normalize();
    const dirAB = this.tmpA.clone();

    if (ra === rb) {
      // Symmetric clash: both rebound at -12 m/s with 18 frames recovery
      a.velocity.copy(dirAB).multiplyScalar(CLASH_REBOUND_SPEED);
      b.velocity.copy(dirAB).multiplyScalar(-CLASH_REBOUND_SPEED);
      a.velocity.y = b.velocity.y = 3.0;
      a.grounded = b.grounded = false;
      a.enterState(CombatState.DASH_CLASH);
      b.enterState(CombatState.DASH_CLASH);
      this.effects.clashBurst(mid);
      this.events.emit('CLASH', { attackerId: a.id, defenderId: b.id, point: mid, damage: 0, text: 'DASH CLASH!', color: 0xcfe9ff, shake: 0.3 });
      return;
    }
    const winner = ra > rb ? a : b;
    const loser = winner === a ? b : a;
    const dirWL = winner === a ? dirAB : dirAB.clone().negate();
    if (winner.dashKind === 'CHARGED') {
      // Priority override: charged crushes standard; loser enters airborne tumble
      loser.stats.applyDamage(55);
      loser.velocity.copy(dirWL).multiplyScalar(14);
      loser.velocity.y = 7;
      loser.grounded = false;
      loser.stunFrames = 40;
      loser.lastHitBy = winner.id;
      loser.flashTimer = 0.08;
      loser.enterState(CombatState.TUMBLE);
      this.events.emit('CLASH', { attackerId: winner.id, defenderId: loser.id, point: mid, damage: 55, text: `${winner.def.displayName}: CHARGED DASH CRUSHES`, color: 0xffb347, shake: 0.3 });
    } else {
      // Velocity advantage: spark dash active frames dominate; standard user takes hitstun
      loser.stats.applyDamage(30);
      loser.velocity.copy(dirWL).multiplyScalar(4);
      loser.velocity.y = 0;
      loser.stunFrames = 22;
      loser.lastHitBy = winner.id;
      loser.flashTimer = 0.08;
      loser.enterState(CombatState.HITSTUN);
      this.events.emit('CLASH', { attackerId: winner.id, defenderId: loser.id, point: mid, damage: 30, text: `${winner.def.displayName}: SPARK DASH WINS`, color: 0xffee33, shake: 0.2 });
    }
    winner.velocity.multiplyScalar(0.15);
    winner.velocity.y = 0;
    winner.enterState(CombatState.DASH_IMPACT);
    this.effects.hitSpark(mid, 0xffffff, 16, 10);
    if (loser.stats.isDead) loser.enterState(CombatState.DEAD);
  }

  /** Wall impact qualified for a splat: pin for 20 frames. */
  wallSplat(f: Fighter, inwardNormal: THREE.Vector3): void {
    f.wallSplatNormal.copy(inwardNormal);
    f.velocity.set(0, 0, 0);
    f.enterState(CombatState.WALL_SPLAT);
    f.flashTimer = 0.06;
    // Face out from the wall (back against it)
    f.yaw = Math.atan2(inwardNormal.x, inwardNormal.z);
    const p = f.position.clone();
    p.y += 1.0;
    this.effects.wallDust(p, inwardNormal);
    this.events.emit('WALL_SPLAT', { attackerId: f.lastHitBy, defenderId: f.id, point: p, damage: 0, text: `${f.def.displayName}: WALL SPLAT`, color: 0xffffff, shake: 0.3 });
  }
}
