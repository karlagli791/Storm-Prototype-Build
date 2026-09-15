/**
 * Types.ts — Core data schemas for the STORM prototype engine.
 * Combat states, input flags, hit/hurtbox data, and shared constants.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Simulation constants
// ---------------------------------------------------------------------------
export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;

export const ARENA_RADIUS = 32.0;
export const ARENA_CEILING = 18.0;
export const PLAYER_COLLIDER_RADIUS = 0.6;
export const WALL_SPLAT_IMPACT_VN = -8.5; // m/s along inward wall normal
export const WALL_SPLAT_FRAMES = 20;

export const DASH_SPEED_STANDARD = 28.0;
export const DASH_SPEED_SPARK = 36.0;
export const DASH_SPEED_CHARGED = 30.0;
export const DASH_TURN_FORCE_MAX = 65.0;
export const DASH_CLASH_RADIUS = 1.2;
export const DASH_IMPACT_DISTANCE = 1.2;
export const DASH_REBOUND_SPEED = -8.0;
export const CLASH_REBOUND_SPEED = -12.0;
export const CLASH_RECOVERY_FRAMES = 18;

export const CHAKRA_COST_DASH = 15;
export const CHAKRA_COST_CHARGED_DASH = 25;
export const CHAKRA_COST_SPARK_DASH = 20;
export const CHAKRA_COST_TURBO_DASH = 15;
export const GUARD_COUNTER_MAX_CHAKRA_PENALTY = 20;
export const GUARD_COUNTER_PENALTY_SECONDS = 20.0;

export const SUB_STOCK_MAX = 4;
export const SUB_RECHARGE_SECONDS = 14.0;
export const SUB_TELEPORT_DISTANCE = 2.5;
export const SUPPORT_GAUGE_RECHARGE_SECONDS = 8.0;
export const LEADER_SWITCH_COST = 50;

export const GUARD_HEALTH_MAX = 100;
export const GUARD_BREAK_STUN_FRAMES = 25;
export const GUARD_COUNTER_PARRY_FRAMES = 6;
export const GUARD_COUNTER_CRUMPLE_FRAMES = 16;
export const GUARD_COUNTER_ADVANTAGE_FRAMES = 16;

export const HEALTH_MAX = 1000;
export const CHAKRA_MAX = 100;

export const RUN_SPEED = 9.0;
export const RUN_ACCEL = 60.0;
export const RUN_DECEL = 45.0;
export const NINJA_MOVE_SPEED = 11.0;
export const HOLLOW_STEP_SPEED = 7.5;
export const HOLLOW_STEP_FRAMES = 12;
export const GRAVITY = -32.0;
export const JUMP_VELOCITY = 12.0;

// ---------------------------------------------------------------------------
// Combat state enum
// ---------------------------------------------------------------------------
export enum CombatState {
  IDLE_NEUTRAL = 'IDLE_NEUTRAL',
  RUNNING = 'RUNNING',
  NINJA_MOVE = 'NINJA_MOVE',
  HOLLOW_STEP = 'HOLLOW_STEP',
  JUMPING = 'JUMPING',
  DASH_STARTUP = 'DASH_STARTUP',
  DASH_CHARGING = 'DASH_CHARGING',
  DASH_HOMING = 'DASH_HOMING',
  DASH_IMPACT = 'DASH_IMPACT',
  DASH_REBOUND = 'DASH_REBOUND',
  DASH_CLASH = 'DASH_CLASH',
  COMBO_STRING = 'COMBO_STRING',
  SPARK_DASH = 'SPARK_DASH',
  JUTSU = 'JUTSU',
  GUARDING = 'GUARDING',
  GUARD_COUNTER = 'GUARD_COUNTER',
  GUARD_BREAK = 'GUARD_BREAK',
  HITSTUN = 'HITSTUN',
  LAUNCHED = 'LAUNCHED',
  TUMBLE = 'TUMBLE',
  CRUMPLE = 'CRUMPLE',
  KNOCKDOWN = 'KNOCKDOWN',
  WALL_SPLAT = 'WALL_SPLAT',
  SUBSTITUTED = 'SUBSTITUTED',
  BLOCKSTUN = 'BLOCKSTUN',
  DEAD = 'DEAD',
  /** PL_ACT_CHAKRA_CHARGE — stand still and regenerate chakra (interruptible). */
  CHAKRA_CHARGE = 'CHAKRA_CHARGE',
  /** PL_ACT_PRJ_LAND / PRJ_AIR — shuriken throw. */
  THROW = 'THROW',
  /** PL_ACT_SUP_* — a support character performing an intervention (autonomous). */
  SUPPORT_ACT = 'SUPPORT_ACT',
  /** PL_ACT_BTL_BEFORE_LEADER — round intro (entry clip), no input. */
  INTRO = 'INTRO',
  /** PL_ACT_SPSKILL_* — ultimate jutsu: cut-in, armored homing rush, finisher. */
  ULTIMATE = 'ULTIMATE',
  /** PL_ACT_AWAKE_BEGIN — awakening transformation. */
  AWAKEN = 'AWAKEN',
}

/** States in which an incoming hit can be substituted out of. */
export const SUBSTITUTABLE_STATES: ReadonlySet<CombatState> = new Set([
  CombatState.HITSTUN,
  CombatState.LAUNCHED,
  CombatState.TUMBLE,
  CombatState.WALL_SPLAT,
]);

/** States considered knockback for wall-splat purposes. */
export const KNOCKBACK_STATES: ReadonlySet<CombatState> = new Set([
  CombatState.LAUNCHED,
  CombatState.TUMBLE,
  CombatState.HITSTUN,
]);

/** States where the character is actionable from neutral. */
export const NEUTRAL_STATES: ReadonlySet<CombatState> = new Set([
  CombatState.IDLE_NEUTRAL,
  CombatState.RUNNING,
  CombatState.NINJA_MOVE,
]);

/** States that can be interrupted by a Leader Switch. */
export const SWITCHABLE_STATES: ReadonlySet<CombatState> = new Set([
  CombatState.IDLE_NEUTRAL,
  CombatState.RUNNING,
  CombatState.NINJA_MOVE,
  CombatState.DASH_HOMING,
  CombatState.COMBO_STRING,
  CombatState.JUTSU,
  CombatState.GUARDING,
]);

/** States in which the character is "open" (can be hit). */
export const VULNERABLE_STATES: ReadonlySet<CombatState> = new Set([
  CombatState.IDLE_NEUTRAL,
  CombatState.RUNNING,
  CombatState.NINJA_MOVE,
  CombatState.HOLLOW_STEP,
  CombatState.JUMPING,
  CombatState.DASH_STARTUP,
  CombatState.DASH_CHARGING,
  CombatState.DASH_HOMING,
  CombatState.DASH_IMPACT,
  CombatState.DASH_REBOUND,
  CombatState.DASH_CLASH,
  CombatState.COMBO_STRING,
  CombatState.SPARK_DASH,
  CombatState.JUTSU,
  CombatState.GUARD_BREAK,
  CombatState.HITSTUN,
  CombatState.LAUNCHED,
  CombatState.TUMBLE,
  CombatState.CRUMPLE,
  CombatState.WALL_SPLAT,
  CombatState.BLOCKSTUN,
  CombatState.CHAKRA_CHARGE,
  CombatState.THROW,
]);

/** Hit direction relative to the victim's facing (selects the CC2 directional damage clip). */
export type HitDir = 'F' | 'B' | 'L' | 'R';

/** Support character behaviour types (from the prototype's debug character select). */
export type SupportType = 'ATTACK' | 'GUARD' | 'BALANCE';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export enum InputFlag {
  NONE = 0,
  ATTACK = 1 << 0,
  DASH = 1 << 1,
  JUMP = 1 << 2,
  GUARD = 1 << 3,
  SUB = 1 << 4,
  JUTSU = 1 << 5,
  SWITCH = 1 << 6,
  CHAKRA = 1 << 7,
  UP = 1 << 8,
  DOWN = 1 << 9,
  /** Shuriken throw (PL_ACT_PRJ_*). */
  THROW = 1 << 10,
  /** Hold to charge chakra (PL_ACT_CHAKRA_CHARGE). */
  CHARGE = 1 << 11,
  /** Call the support character (PL_ACT_SUP_ENTRY → combo join). */
  SUPPORT = 1 << 12,
  ULTIMATE = 1 << 13,
}

export interface InputFrame {
  /** Simulation tick this frame was sampled on. */
  tick: number;
  /** Buttons held down on this frame. */
  held: number;
  /** Buttons that transitioned up->down on this frame. */
  pressed: number;
  /** Buttons that transitioned down->up on this frame. */
  released: number;
  /** Camera-relative movement vector (x = lateral, y = forward), magnitude clamped to [0,1]. */
  moveX: number;
  moveY: number;
  /** Raw stick magnitude. */
  magnitude: number;
}

// ---------------------------------------------------------------------------
// Hit / hurt volumes
// ---------------------------------------------------------------------------
export enum HitPriority {
  NONE = 0,
  STANDARD_DASH = 1,
  SPARK_DASH = 2,
  MELEE = 3,
  CHARGED_DASH = 4,
  JUTSU = 5,
  ARMORED_JUTSU = 6,
}

export enum HitReaction {
  STAGGER = 'STAGGER',
  LAUNCH = 'LAUNCH',
  SPIKE = 'SPIKE',
  KNOCKBACK = 'KNOCKBACK',
  CRUMPLE = 'CRUMPLE',
  TUMBLE = 'TUMBLE',
}

export interface HitboxDef {
  id: string;
  /** Bone socket name on the attacker rig (e.g. 'dmy_rpalm', 'blade_tip'). */
  socket: string;
  /** Optional second socket: creates a swept capsule between two sockets (blade base->tip). */
  socketEnd?: string;
  radius: number;
  damage: number;
  chakraGain: number;
  reaction: HitReaction;
  /** Knockback speed applied on hit, along attacker facing (m/s). */
  knockback: number;
  /** Vertical launch velocity (m/s). */
  launch: number;
  hitstunFrames: number;
  blockstunFrames: number;
  guardDamage: number;
  priority: HitPriority;
  /** Frame range [start, end] within the owning move where this box is active. */
  activeStart: number;
  activeEnd: number;
  /** Whether this box ignores guard (unblockable). */
  unblockable?: boolean;
  /** Armored moves ignore incoming dashes. */
  armored?: boolean;
}

export interface HurtboxDef {
  socket: string;
  radius: number;
}

export interface MoveDef {
  name: string;
  totalFrames: number;
  /** Frame range during which a follow-up attack input is accepted. */
  cancelStart: number;
  cancelEnd: number;
  /** Frames in which chakra dash / spark cancel is allowed. */
  sparkCancelStart: number;
  sparkCancelEnd: number;
  hitboxes: HitboxDef[];
  /** Forward step speed during the active window (m/s). */
  forwardStep: number;
  /** Animation clip name (if a GLB is bound). */
  clip: string;
}

export type ComboBranch = 'NEUTRAL' | 'UP' | 'DOWN' | 'AIR';

export interface ComboStringDef {
  branch: ComboBranch;
  moves: MoveDef[];
}

export interface CharacterDef {
  code: string; // 2nrt / 2ssk
  displayName: string;
  color: THREE.ColorRepresentation;
  accentColor: THREE.ColorRepresentation;
  skinColor: THREE.ColorRepresentation;
  hairColor: THREE.ColorRepresentation;
  runSpeed: number;
  dashSpeedMultiplier: number;
  health: number;
  neutralString: ComboStringDef;
  upString: ComboStringDef;
  downString: ComboStringDef;
  jutsu: MoveDef;
  hurtboxes: HurtboxDef[];
  /** Whether the character carries a blade (Sasuke's Kusanagi) — affects procedural rig. */
  hasBlade: boolean;
  /** Optional GLB asset path (public/assets/2nrt.glb). */
  glbPath?: string;
  /** Support behaviour when benched (prototype: Attack = combo join / strike back, Guard = dash cut / charge guard, Balance = cover fire). */
  supportType: SupportType;
  /** HUD portrait (Storm 2 face_le texture). */
  portrait?: string;
  /** Select screen: subtitle line, jutsu label, 128 px icon, full-body stand art, versus face. */
  title?: string;
  jutsuName?: string;
  icon?: string;
  stand?: string;
  vsFace?: string;
  /** Borrow another character's clip set (same CC2 body skeleton); tracks are retargeted by bone prefix. */
  animBank?: string;
  /** Aerial string (○ while airborne); the last hit spikes the enemy down. */
  airString?: ComboStringDef;
  /** Ultimate jutsu (SPSKILL): name, clip prefix (spl1) and sound cue. */
  ultimateName?: string;
  ultimateClip?: string;
  jutsuSfx?: string;
  ultimateSfx?: string;
}

// ---------------------------------------------------------------------------
// Events emitted by the collision pass
// ---------------------------------------------------------------------------
export type CombatEventKind = 'HIT' | 'GUARD_HIT' | 'CLASH' | 'PARRY' | 'GUARD_BREAK' | 'ARMOR' | 'SUB' | 'WALL_SPLAT' | 'SWITCH' | 'SPARK' | 'ULTIMATE' | 'AWAKEN' | 'SFX';

export interface CombatEvent {
  kind: CombatEventKind;
  attackerId: number;
  defenderId: number;
  hitbox?: HitboxDef;
  point: THREE.Vector3;
  damage: number;
}

// ---------------------------------------------------------------------------
// Player state snapshot (StormRevival-style sync structure)
// ---------------------------------------------------------------------------
export interface PlayerSyncFrame {
  tick: number;
  playerId: number;
  characterCode: string;
  state: CombatState;
  stateFrame: number;
  position: [number, number, number];
  velocity: [number, number, number];
  yaw: number;
  health: number;
  chakra: number;
  chakraMax: number;
  subStocks: number;
  guardHealth: number;
  supportGauge: number;
  inputHeld: number;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampMagnitude(v: THREE.Vector3, max: number): THREE.Vector3 {
  const len = v.length();
  if (len > max && len > 1e-8) v.multiplyScalar(max / len);
  return v;
}

export function framesToSeconds(f: number): number {
  return f / TICK_RATE;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
