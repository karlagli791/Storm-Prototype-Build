/**
 * AIBrain.ts — Scripted dummy for Player 2. Cycles between BLOCK, DASH and COMBO modes,
 * approaches when far, occasionally throws a jutsu, substitutes out of hitstun, and attempts a
 * Guard Break Counter when it sees an incoming dash while blocking.
 */
import * as THREE from 'three';
import { ScriptedInputSource } from '../core/InputManager';
import { CombatState, InputFlag, SUBSTITUTABLE_STATES } from '../core/Types';
import { Team } from './Fighter';
import { CameraBasis } from './CombatStateMachine';

export type AIMode = 'BLOCK' | 'DASH' | 'COMBO' | 'APPROACH' | 'IDLE';

const CYCLE: AIMode[] = ['BLOCK', 'DASH', 'COMBO', 'APPROACH', 'COMBO', 'DASH', 'BLOCK', 'IDLE'];

export class AIBrain {
  mode: AIMode = 'APPROACH';
  private cycleIndex = 0;
  private modeTimer = 1.0;
  private tapTimer = 0;
  private subDecided = false;
  private subWants = false;
  private tmp = new THREE.Vector3();
  private rng: () => number;
  /** Difficulty: scales every reaction roll (0.55 easy … 2.4 ultimate). */
  skill = 1;
  enabled = true;

  constructor(public readonly source: ScriptedInputSource, private team: Team, seed = 7) {
    const base = mulberry32(seed);
    this.rng = () => base() / this.skill;
  }

  private tap(flag: InputFlag): void {
    this.source.press(flag);
    this.pendingRelease |= flag;
  }
  private pendingRelease = 0;

  update(dt: number, cam: CameraBasis): void {
    // Release last frame's taps first so presses register as edges
    if (this.pendingRelease) {
      this.source.release(this.pendingRelease);
      this.pendingRelease = 0;
    }
    if (!this.enabled) {
      this.source.releaseAll();
      return;
    }
    const f = this.team.active;
    const t = f.target;
    if (!t) return;
    const dist = f.distanceToTarget();

    // Reactive layer -------------------------------------------------------
    if (SUBSTITUTABLE_STATES.has(f.state) || f.state === CombatState.CRUMPLE) {
      if (!this.subDecided) {
        this.subDecided = true;
        this.subWants = this.rng() < 0.55 && f.stats.subStocks > 0;
      }
      if (this.subWants && f.stateFrame > 4 && f.subLockFrames === 0) {
        this.source.releaseAll();
        this.tap(InputFlag.SUB);
        this.subWants = false;
      }
      return;
    }
    this.subDecided = false;

    // Mode cycling ---------------------------------------------------------
    this.modeTimer -= dt;
    if (this.modeTimer <= 0) {
      this.cycleIndex = (this.cycleIndex + 1) % CYCLE.length;
      this.mode = CYCLE[this.cycleIndex];
      this.modeTimer = 1.2 + this.rng() * 1.6;
      this.source.releaseAll();
    }
    this.tapTimer -= dt;

    // Camera-relative stick toward the target
    this.tmp.subVectors(t.position, f.position);
    this.tmp.y = 0;
    if (this.tmp.lengthSq() > 1e-6) this.tmp.normalize();
    const towardX = this.tmp.dot(cam.right);
    const towardY = this.tmp.dot(cam.forward);

    // One Piece fighters fight from their skill palette instead of the jutsu button: pick a skill
    // that is off cooldown, affordable and sensible at this range, plus the Haki coat and the
    // finisher when the gauge is full.
    if (f.def.opbr && this.tapTimer <= 0 && (f.state === CombatState.IDLE_NEUTRAL || f.state === CombatState.RUNNING || f.state === CombatState.COMBO_STRING)) {
      const prof = f.def.opbr;
      if (f.hakiFrames <= 0 && f.stats.chakra >= 55 && this.rng() < 0.03) {
        this.tap(InputFlag.HAKI);
        this.tapTimer = 1.4;
      } else if (f.stats.chakra >= prof.ultimate.cost && dist < 8 && this.rng() < 0.05) {
        this.tap(InputFlag.ULTIMATE);
        this.tapTimer = 2.4;
      } else if (dist < 9 && this.rng() < 0.16) {
        const usable: number[] = [];
        for (let i = 0; i < prof.skills.length; i++) {
          const sk = prof.skills[i];
          if (f.skillCooldowns[i] > 0 || f.stats.chakra < sk.cost) continue;
          // Projectile and counter skills are fine at range; the rest need to be close.
          const far = !!sk.projectile;
          if (far ? dist > 4 : dist < 5.5) usable.push(i);
        }
        if (usable.length) {
          const idx = usable[Math.floor(Math.abs(this.rng() * this.skill) * usable.length) % usable.length];
          this.tap([InputFlag.SKILL1, InputFlag.SKILL2, InputFlag.SKILL3, InputFlag.SKILL4][idx]);
          this.tapTimer = 1.1;
        }
      }
    }

    switch (this.mode) {
      case 'IDLE': {
        this.source.releaseAll();
        // Small lateral shuffle
        this.source.moveX = -towardY * 0.5;
        this.source.moveY = towardX * 0.5;
        break;
      }
      case 'APPROACH': {
        this.source.releaseAll();
        // Ultimate when the gauge is full and the enemy is in range; awakening when hurt (hold chakra).
        if (f.stats.chakra >= 90 && dist < 9 && this.tapTimer <= 0 && this.rng() < 0.04 && (f.state === CombatState.IDLE_NEUTRAL || f.state === CombatState.RUNNING)) {
          this.tap(InputFlag.ULTIMATE);
          this.tapTimer = 2.0;
          break;
        }
        if (!f.awakened && f.stats.health <= f.stats.healthMax * 0.5 && dist > 6 && this.chargeHold <= 0 && this.rng() < 0.02) {
          this.source.press(InputFlag.CHARGE);
          this.chargeHold = 1.1;
        }
        if (this.chargeHold > 0) {
          this.chargeHold -= dt;
          this.source.moveX = 0; this.source.moveY = 0;
          this.source.press(InputFlag.CHARGE);
          if (this.chargeHold <= 0) this.source.release(InputFlag.CHARGE);
          break;
        }
        if (dist > 2.5) {
          this.source.moveX = towardX;
          this.source.moveY = towardY;
          // Shuriken at range, support call when the gauge is up (PL_ACT_PRJ_LAND / SUP_COMBO_JOIN)
          if (dist > 8 && this.tapTimer <= 0 && this.rng() < 0.12) {
            this.tap(InputFlag.THROW);
            this.tapTimer = 0.7;
          } else if (dist < 6 && f.stats.supportGauge >= 50 && this.tapTimer <= 0 && this.rng() < 0.06) {
            this.tap(InputFlag.SUPPORT);
            this.tapTimer = 1.0;
          }
        } else {
          this.mode = 'COMBO';
        }
        // Ninja-move hop occasionally to show lateral drift
        if (dist > 6 && this.tapTimer <= 0 && this.rng() < 0.15) {
          this.tap(InputFlag.JUMP);
          this.tapTimer = 0.6;
        }
        break;
      }
      case 'BLOCK': {
        this.source.moveX = 0;
        this.source.moveY = 0;
        this.source.press(InputFlag.GUARD);
        // Guard break counter attempt when a dash is incoming and close
        const incomingDash = t.state === CombatState.DASH_HOMING || t.state === CombatState.SPARK_DASH;
        if (incomingDash && dist < 5.5 && f.state === CombatState.GUARDING && this.tapTimer <= 0 && this.rng() < 0.5) {
          this.tap(InputFlag.ATTACK);
          this.tapTimer = 0.9;
        }
        break;
      }
      case 'DASH': {
        this.source.release(InputFlag.GUARD);
        this.source.moveX = 0;
        this.source.moveY = 0;
        if (f.state === CombatState.DASH_IMPACT) {
          if (this.tapTimer <= 0) {
            this.tap(InputFlag.ATTACK);
            this.tapTimer = 0.1;
          }
        } else if (f.state === CombatState.COMBO_STRING) {
          if (this.tapTimer <= 0) {
            this.tap(InputFlag.ATTACK);
            this.tapTimer = 0.12;
          }
        } else if (dist > 3.0 && f.stats.chakra >= 15 && this.tapTimer <= 0 && (f.state === CombatState.IDLE_NEUTRAL || f.state === CombatState.RUNNING)) {
          if (this.rng() < 0.25) {
            // Charged dash: hold
            this.source.press(InputFlag.DASH);
            this.tapTimer = 0.42;
            this.chargeHold = 0.36;
          } else {
            this.tap(InputFlag.DASH);
            this.tapTimer = 0.5;
          }
        }
        if (this.chargeHold > 0) {
          this.chargeHold -= dt;
          if (this.chargeHold <= 0) this.source.release(InputFlag.DASH);
        }
        break;
      }
      case 'COMBO': {
        this.source.release(InputFlag.GUARD);
        // Air string: when already airborne near the enemy, keep swinging; occasionally jump in.
        if (!f.grounded && dist < 3.5 && this.tapTimer <= 0) {
          this.tap(InputFlag.ATTACK);
          this.tapTimer = 0.14;
          break;
        }
        if (f.grounded && dist < 3 && t.position.y > 1.2 && this.tapTimer <= 0 && this.rng() < 0.3) {
          this.tap(InputFlag.JUMP);
          this.tapTimer = 0.25;
          break;
        }
        if (dist > 2.3 && f.state !== CombatState.COMBO_STRING) {
          this.source.moveX = towardX;
          this.source.moveY = towardY;
          if (dist > 7 && f.stats.chakra >= 30 && this.tapTimer <= 0 && this.rng() < 0.08) {
            this.tap(InputFlag.JUTSU);
            this.tapTimer = 1.5;
          }
        } else {
          this.source.moveX = 0;
          this.source.moveY = 0;
          if (this.tapTimer <= 0) {
            // Occasionally branch into the up/down string on the 3rd hit
            if (f.state === CombatState.COMBO_STRING && f.comboIndex >= 1 && this.rng() < 0.3) {
              this.source.press(this.rng() < 0.5 ? InputFlag.UP : InputFlag.DOWN);
              this.pendingRelease |= InputFlag.UP | InputFlag.DOWN;
            }
            this.tap(InputFlag.ATTACK);
            this.tapTimer = 0.11;
          }
          // Spark cancel at the end of a string sometimes
          if (f.state === CombatState.COMBO_STRING && f.comboIndex === 2 && f.moveFrame > 12 && f.stats.chakra >= 20 && this.rng() < 0.04) {
            this.tap(InputFlag.DASH);
          }
        }
        break;
      }
    }
  }
  private chargeHold = 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
