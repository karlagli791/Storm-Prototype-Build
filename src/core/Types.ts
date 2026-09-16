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
export const RUN_DECEL = 70.0;
export const NINJA_MOVE_SPEED = 11.0;
export const HOLLOW_STEP_SPEED = 7.5;
export const HOLLOW_STEP_FRAMES = 12;
export const GRAVITY = -32.0;
export const JUMP_VELOCITY = 13.0;
/** Horizontal speed of a directional jump — identical for every direction. */
export const JUMP_H_SPEED = 7.2;
export const DOUBLE_JUMP_VELOCITY = 12.0;
/** Ninja jumps fall slower than knockback: about one second of air per jump. */
export const JUMP_GRAVITY_SCALE = 0.8;
/** Guard roll speed. */
export const DODGE_SPEED = 11.0;

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
  /** Guard roll (a stick flick while guarding). */
  DODGE = 'DODGE',
  /** Victory pose after the round (win10 / win11). */
  WIN = 'WIN',
  /** One Piece fighters: a skill from the L1 palette (their jutsu equivalent). */
  SKILL = 'SKILL',
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
  CombatState.SKILL,
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
  /** Second support (R1 / T). */
  SUPPORT2 = 1 << 14,
  /** One Piece skill palette (L1 + face buttons / keys 1-4). */
  SKILL1 = 1 << 15,
  SKILL2 = 1 << 16,
  SKILL3 = 1 << 17,
  SKILL4 = 1 << 18,
  /** Armament Haki coat (R1 + Triangle / R). */
  HAKI = 1 << 19,
  /** Observation-Haki step (R1 tap / F). */
  STEP = 1 << 20,
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

export type ComboBranch = 'NEUTRAL' | 'UP' | 'DOWN' | 'AIR' | 'FAR';
/** Chakra nature of a character's jutsu — drives the procedural effects (ElementFX). */
export type ElementKind = 'wind' | 'lightning' | 'fire' | 'water' | 'sand' | 'explosion' | 'gentle' | 'strength' | 'taijutsu' | 'poison' | 'push' | 'blade' | 'scalpel' | 'dark';

export interface ComboStringDef {
  branch: ComboBranch;
  moves: MoveDef[];
}

/** Effects the One Piece skills trigger, played by OpbrFX. */
export type OpbrFxKind =
  | 'haki' | 'haki_burst' | 'conqueror' | 'slash' | 'impact' | 'shock' | 'dust'
  | 'fire' | 'fire_trail' | 'gum' | 'room' | 'shambles' | 'gamma' | 'gravity' | 'meteor'
  | 'mochi' | 'paw' | 'pawprint' | 'crow' | 'lion' | 'blade_arc' | 'wind' | 'quake';

export interface OpbrFxEvent {
  /** Move frame the effect fires on. */
  t: number;
  kind: OpbrFxKind;
  /** Socket the effect is anchored to (defaults to the right hand). */
  socket?: string;
  scale?: number;
  color?: number;
  /** Metres in front of the fighter (instead of a socket). */
  ahead?: number;
  sfx?: string;
}

/** Movement applied during a skill (a lunge, a hop, a slide). */
export interface OpbrTravel {
  t: number;
  frames: number;
  speed: number;
  up?: number;
}

export interface OpbrSkill {
  id: string;
  name: string;
  desc: string;
  /** Which palette button fires it. */
  input: 'S1' | 'S2' | 'S3' | 'S4' | 'ULT';
  /** Haki cost and cooldown in seconds (Fighting Path style per-skill cooldowns). */
  cost: number;
  cooldown: number;
  move: MoveDef;
  fx?: OpbrFxEvent[];
  travel?: OpbrTravel;
  projectile?: JutsuProjectile & { t: number };
  /** Super armour through the active frames. */
  armor?: boolean;
  /** Cinematic finish: camera push-in, slow motion and a full-screen flash. */
  cinematic?: boolean;
  /** Counter stance: absorbs one hit during the active window and answers it. */
  counter?: boolean;
  /** Teleport behind the target instead of travelling (Law's Shambles). */
  teleport?: boolean;
}

/** A One Piece: Fighting Path fighter — own rig, own animation set, own control layout. */
export interface OpbrProfile {
  /** Model key (public/assets/op_<key>.glb). */
  key: string;
  /** Standing height in metres — these fighters differ wildly (Chopper 0.9 m, Kuma 2.9 m). */
  height: number;
  /** Never touches the ground (Shiki and Karasu fly). */
  float?: boolean;
  /** Armament-Haki coat colour and the gauge name shown in the HUD. */
  hakiColor?: number;
  gaugeName?: string;
  /** The four palette skills plus the finisher. */
  skills: OpbrSkill[];
  ultimate: OpbrSkill;
  /** Fighting-style blurb for the move list. */
  style?: string;
  /** Extra body swapped in for a transformation (Karasu's crow form). */
  altGlb?: string;
  /**
   * Meshes the rip ships for a transformed state (Luffy's Gear-4 balloon limbs, Katakuri's mochi
   * weapons). Hidden at rest and shown while the matching state is active.
   */
  altMesh?: string;
  altMode?: 'haki' | 'skill';
  /** Weapon handling: leave it where the rip parked it, carry it in the right hand, or hide it. */
  weapon?: 'keep' | 'hand' | 'hide';
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
  /** Awakened form: a second body/clip set (`<code>.glb`) with its own strings from the parameter table. */
  awakenedCode?: string;
  /** Awakened form description for the HUD / move list. */
  awakenedName?: string;
  /** Full awakened definition (body, strings) swapped in while awakened. */
  awakenedDef?: CharacterDef;
  /** Voice bank to use when the code differs (awakened bodies keep the base voice). */
  voiceCode?: string;
  /** Awakened clip infix: state bindings try `<code><infix>…` before `<code>…` ('awa' / 'aws'). */
  awClipInfix?: string;
  /** Aerial string (○ while airborne); the last hit spikes the enemy down. */
  airString?: ComboStringDef;
  /** Ranged lunge string (ATK_FAR / cmr clips): a fresh forward tilt + ○, or ○ while running in. */
  farString?: ComboStringDef;
  /** Effect style for jutsu / charge / impacts, and for the ultimate when it differs. */
  element?: ElementKind;
  ultElement?: ElementKind;
  /** Chakra colour used by auras and jutsu effects. */
  chakraColor?: number;
  /** Ultimate jutsu (SPSKILL): name, clip prefix (spl1) and sound cue. */
  ultimateName?: string;
  ultimateClip?: string;
  jutsuSfx?: string;
  ultimateSfx?: string;
  /** Ranged jutsu: the skill launches a projectile instead of a palm hitbox. */
  jutsuProjectile?: JutsuProjectile;
  /** One Piece fighter: procedural rig, skill palette and its own control layout. */
  opbr?: OpbrProfile;
}

export interface JutsuProjectile {
  color: number;
  sprite?: string;
  speed: number;
  damage: number;
  radius: number;
  /** Travel height above the ground (sand waves hug the floor, fireballs fly chest-high). */
  height: number;
  launchSfx?: string;
  hitSfx?: string;
  life?: number;
}

// ---------------------------------------------------------------------------
// Events emitted by the collision pass
// ---------------------------------------------------------------------------
export type CombatEventKind = 'HIT' | 'GUARD_HIT' | 'CLASH' | 'PARRY' | 'GUARD_BREAK' | 'ARMOR' | 'SUB' | 'WALL_SPLAT' | 'SWITCH' | 'SPARK' | 'ULTIMATE' | 'JUTSU' | 'AWAKEN' | 'SFX';

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
