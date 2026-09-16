/**
 * Fighter.ts — Fighter entity data + Team (leader/support) container.
 *
 * A Fighter is pure simulation state plus a visual rig. Behaviour lives in
 * CombatStateMachine (transitions) and PlayerController (kinematics). Both fighters on a
 * team share one CombatStats pool (health, chakra, subs, guard, support gauge).
 */
import * as THREE from 'three';
import { InputManager, InputSource, ScriptedInputSource } from '../core/InputManager';
import { CharacterDef, ComboBranch, CombatEvent, CombatEventKind, CombatState, HitDir, HitboxDef, MoveDef, OpbrSkill, SupportType } from '../core/Types';
import { CombatStats } from './CombatStats';
import { FighterRig } from '../render/FighterRig';

export type DashKind = 'STANDARD' | 'CHARGED' | 'SPARK' | 'TURBO';

export interface EventSink {
  emit(kind: CombatEventKind, data: Partial<CombatEvent> & { text?: string; color?: number; shake?: number }): void;
}

let nextFighterId = 1;

export class Fighter {
  readonly id = nextFighterId++;
  rig: FighterRig;

  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  yaw = 0;
  grounded = true;
  /** Transform at the start of the current simulation tick (render interpolation). */
  prevPosition = new THREE.Vector3();
  prevYaw = 0;
  /** Stage floor height under the fighter (terrain following). */
  groundY = 0;
  // --- aerial mobility
  doubleJumped = false;
  airDashed = false;
  airDashFrames = 0;
  jumpCount = 0;
  // --- awakening / ultimate
  awakened = false;
  awakenTimer = 0;
  ultimatePhase = 0;
  ultimateLanded = false;
  /** Cinematic finisher clip in progress (camera path + held victim). */
  cinematic = false;
  /** The jutsu demo already played this activation (one per jutsu). */
  jutsuDemoDone = false;
  /** Combo tether: held in the attacker's string until it ends (id of the attacker, frames left). */
  tetherBy = 0;
  tetherFrames = 0;

  state: CombatState = CombatState.IDLE_NEUTRAL;
  prevState: CombatState = CombatState.IDLE_NEUTRAL;
  stateFrame = 0;

  // --- move execution
  currentMove: MoveDef | null = null;
  comboBranch: ComboBranch = 'NEUTRAL';
  comboIndex = 0;
  moveFrame = 0;
  /** Hitbox ids that already connected during the current move (no double hits). */
  landedHitIds = new Set<string>();
  /** Set when an attack input is buffered during the cancel window. */
  pendingBranch: ComboBranch | null = null;

  // --- dash
  dashKind: DashKind = 'STANDARD';
  dashStartupFrames = 7;
  dashChargeFrames = 0;
  dashElapsed = 0;

  // --- stun / timers
  stunFrames = 0;
  /** Sub is disabled while > 0 (parry crumple). */
  subLockFrames = 0;
  /** Frames of intangibility (substitution, get-up). */
  invulnFrames = 0;
  parryActive = false;
  bounceOnLand = false;
  /** Frame advantage granted after a parry — attacker can't act. */
  wallSplatNormal = new THREE.Vector3();

  // --- team
  team: Team | null = null;
  target: Fighter | null = null;
  /** True when this fighter is completing an action after being switched out. */
  autonomous = false;
  /** Visual-only: white flash timer on hit. */
  flashTimer = 0;
  chargeVfxTick = 0;

  switchRequested = false;
  lastHitBy = -1;
  /** Frames both fighters freeze after a hit (HITSTOP_*). Decremented by the controller. */
  hitstopFrames = 0;
  /** Direction the last hit came from, relative to facing — picks the CC2 directional damage clip. */
  lastHitDir: HitDir = 'F';
  /** Current stick direction relative to facing (dash-step clip selection). */
  moveDirLocal: HitDir = 'F';
  /** Support role when this fighter is on the bench. */
  supportType: SupportType = 'ATTACK';
  /** Seconds until this support may intervene again (SUPPORT_INJURED_WAIT_SEC). */
  supportCooldown = 0;
  /** Frames left in a support intervention. */
  supportFrames = 0;
  supportRequested = false;
  /** Set on the throw's release frame; the game loop spawns the shuriken. */
  throwRequested = false;
  /** Side of a throw started out of a ninja move (PRJ_DL / PRJ_DR clips); null = neutral throw. */
  throwDir: HitDir | null = null;
  /** Direction of the current jump / roll relative to the target (clip choice). */
  jumpDirLocal: HitDir | null = null;
  /** True while the jump in progress was launched from the ground or the air (not a fall). */
  jumpLaunch = false;
  /** Id of the fighter whose cinematic is holding this one (0 = free). */
  heldBy = 0;
  /** Frames the opening strike spent closing distance. */
  approachFrames = 0;
  /** Stick magnitude on the previous tick (flick detection). */
  prevStickMag = 0;
  /** Round intro: frames before this fighter's entry clip starts (the camera visits 1P first). */
  introDelay = 0;
  /** Consecutive ticks spent frozen in hitstop (watchdog). */
  frozenTicks = 0;

  // --- One Piece fighters (def.opbr) -------------------------------------------------------
  /** Skill currently running (SKILL state). */
  skill: OpbrSkill | null = null;
  /** Remaining cooldown per palette slot, in seconds (index 0-3 = S1-S4, 4 = finisher). */
  skillCooldowns: number[] = [0, 0, 0, 0, 0];
  /** Frames left on Law's ROOM (extends his skills) / frames left of a counter read. */
  roomFrames = 0;
  counterFrames = 0;
  /** Frames the Armament-Haki coat stays on. */
  hakiFrames = 0;

  /** The definition in force (swapped to `awakenedDef` while awakened). */
  def: CharacterDef;
  readonly baseDef: CharacterDef;
  /** Second body for awakened forms with their own model (Naruto → 2nrv); swapped with `rig`. */
  awRig: FighterRig | null = null;
  constructor(def: CharacterDef, public input: InputManager) {
    this.def = def;
    this.baseDef = def;
    this.rig = new FighterRig(def);
    if (def.awakenedDef && def.awakenedDef.code !== def.code) {
      this.awRig = new FighterRig(def.awakenedDef);
      this.awRig.root.visible = false;
    }
  }

  /** Swap body + moveset for the awakened form (and back). */
  setAwakenedForm(on: boolean): void {
    const target = on ? this.baseDef.awakenedDef : this.baseDef;
    if (!target || target === this.def) return;
    this.def = target;
    if (this.awRig) {
      const from = this.rig, to = this.awRig;
      to.root.position.copy(from.root.position);
      to.root.rotation.copy(from.root.rotation);
      to.root.visible = from.root.visible;
      from.root.visible = false;
      this.rig = to;
      this.awRig = from;
    }
  }

  get stats(): CombatStats {
    return this.team!.stats;
  }

  get isLeader(): boolean {
    return this.team?.active === this;
  }

  get airborne(): boolean {
    return !this.grounded;
  }

  /** Unit forward vector on the ground plane from yaw. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Horizontal distance to target. */
  distanceToTarget(): number {
    if (!this.target) return Infinity;
    const dx = this.target.position.x - this.position.x;
    const dz = this.target.position.z - this.position.z;
    return Math.hypot(dx, dz);
  }

  /** Yaw that faces the target. */
  yawToTarget(): number {
    if (!this.target) return this.yaw;
    return Math.atan2(this.target.position.x - this.position.x, this.target.position.z - this.position.z);
  }

  enterState(next: CombatState): void {
    if (this.state === next) {
      this.stateFrame = 0;
      return;
    }
    this.prevState = this.state;
    this.state = next;
    this.stateFrame = 0;
    if (next !== CombatState.JUMPING) this.jumpLaunch = false;
    if (next !== CombatState.COMBO_STRING && next !== CombatState.JUTSU && next !== CombatState.SKILL) {
      this.currentMove = null;
      this.moveFrame = 0;
      this.landedHitIds.clear();
      this.pendingBranch = null;
    }
    if (next !== CombatState.GUARD_COUNTER) this.parryActive = false;
  }

  beginMove(move: MoveDef, branch: ComboBranch, index: number): void {
    this.currentMove = move;
    this.comboBranch = branch;
    this.comboIndex = index;
    this.moveFrame = 0;
    this.landedHitIds.clear();
    this.pendingBranch = null;
  }

  /** Active hitboxes for the current move frame. */
  activeHitboxes(): HitboxDef[] {
    const m = this.currentMove;
    if (!m) return [];
    const f = this.moveFrame;
    const out: HitboxDef[] = [];
    for (const hb of m.hitboxes) {
      if (f >= hb.activeStart && f <= hb.activeEnd && !this.landedHitIds.has(hb.id)) out.push(hb);
    }
    return out;
  }

  /** Is any armored hitbox currently active (used for jutsu-vs-dash override)? */
  armorActive(): boolean {
    const m = this.currentMove;
    if (this.state === CombatState.SKILL) {
      if (!m || !this.skill?.armor) return false;
      for (const hb of m.hitboxes) if (this.moveFrame >= hb.activeStart - 6 && this.moveFrame <= hb.activeEnd) return true;
      return this.counterFrames > 0;
    }
    if (!m || this.state !== CombatState.JUTSU) return false;
    for (const hb of m.hitboxes) if (hb.armored && this.moveFrame >= hb.activeStart - 4 && this.moveFrame <= hb.activeEnd) return true;
    return false;
  }

  snapshot(tick: number): import('../core/Types').PlayerSyncFrame {
    const s = this.stats;
    return {
      tick,
      playerId: this.id,
      characterCode: this.def.code,
      state: this.state,
      stateFrame: this.stateFrame,
      position: [this.position.x, this.position.y, this.position.z],
      velocity: [this.velocity.x, this.velocity.y, this.velocity.z],
      yaw: this.yaw,
      health: s.health,
      chakra: s.chakra,
      chakraMax: s.chakraMax,
      subStocks: s.subStocks,
      guardHealth: s.guardHealth,
      supportGauge: s.supportGauge,
      inputHeld: this.input.buffer.latest.held,
    };
  }
}

/** A team: one active leader and one benched support who share a resource pool. */
export class Team {
  readonly stats: CombatStats;
  active: Fighter;
  /** The two supports (Storm 3/4 team of three). Leader switch rotates a support in. */
  supports: Fighter[];
  /** Fighters currently present in the arena (leader + any autonomous outgoing fighter). */
  readonly present: Fighter[] = [];

  constructor(public readonly name: string, public readonly slot: number, leader: Fighter, supports: Fighter[], public humanSource: InputSource) {
    this.stats = new CombatStats(leader.def.health);
    this.active = leader;
    this.supports = supports;
    leader.team = this;
    for (const s of supports) { s.team = this; s.rig.root.visible = false; }
    this.present.push(leader);
    leader.rig.root.visible = true;
  }

  /** First support (legacy accessor). */
  get bench(): Fighter { return this.supports[0]; }
  /** Every member: leader first. */
  get members(): Fighter[] { return [this.active, ...this.supports]; }

  get opponentTarget(): Fighter | null {
    return this.active.target;
  }

  /**
   * Leader Switch: bench fighter appears at the leader's position inheriting translation
   * vectors; the outgoing leader finishes its current action autonomously, then retreats.
   */
  performSwitch(index = 0): Fighter {
    const out = this.active;
    const inc = this.supports[index] ?? this.supports[0];
    inc.position.copy(out.position);
    inc.velocity.copy(out.velocity);
    inc.yaw = out.yaw;
    inc.grounded = out.grounded;
    inc.target = out.target;
    inc.enterState(out.grounded ? CombatState.IDLE_NEUTRAL : CombatState.JUMPING);
    inc.invulnFrames = 6;
    inc.autonomous = false;
    inc.rig.root.visible = true;
    // Small lateral offset so the two bodies do not overlap
    const fwd = new THREE.Vector3(Math.sin(out.yaw), 0, Math.cos(out.yaw));
    inc.position.addScaledVector(fwd, -0.9);

    // Control transfer: incoming takes the human/AI input, outgoing gets a dead input source
    inc.input.source = this.humanSource;
    inc.input.buffer.clear();
    out.input.source = new ScriptedInputSource();
    out.input.buffer.clear();
    out.autonomous = true;

    this.active = inc;
    this.supports[this.supports.indexOf(inc)] = out;
    if (!this.present.includes(inc)) this.present.push(inc);
    return inc;
  }

  /** Retire an autonomous fighter once its action is finished. */
  retire(f: Fighter): void {
    f.rig.root.visible = false;
    f.autonomous = false;
    f.enterState(CombatState.IDLE_NEUTRAL);
    f.velocity.set(0, 0, 0);
    const i = this.present.indexOf(f);
    if (i >= 0) this.present.splice(i, 1);
  }
}
