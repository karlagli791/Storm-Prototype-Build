/**
 * OpbrRoster.ts — the One Piece: Fighting Path fighters.
 *
 * These characters are deliberately *not* folded into the Storm mechanics. They keep their own
 * rig (no CC2 skeleton, no chakra clips), their own animation set (src/render/OpbrMoves.ts) and
 * their own control layout: a four-skill palette on L1 + the face buttons, a finisher on R1 + ○,
 * Armament Haki on R1 + △ and an Observation step on R1 — the Fighting Path scheme rather than
 * the Storm one. Skills carry a Haki cost *and* an individual cooldown, exactly like the mobile
 * game's skill bar.
 *
 * Move data is authored against the pose clips, so every hit window lines up with the animation.
 */
import {
  CharacterDef, ComboStringDef, HitPriority, HitReaction, HitboxDef, MoveDef, OpbrFxEvent,
  OpbrProfile, OpbrSkill, OpbrTravel, JutsuProjectile,
} from '../core/Types';
import { SOCKET } from './CharacterDefs';
import { OPBR_CLIPS } from '../render/OpbrMoves';

const RH = SOCKET.R_HAND;
const LH = SOCKET.L_HAND;
const RF = SOCKET.R_FOOT;
const HEAD = SOCKET.HEAD;
const BLADE = SOCKET.BLADE_BASE;

function hb(p: Partial<HitboxDef> & Pick<HitboxDef, 'id' | 'socket' | 'activeStart' | 'activeEnd'>): HitboxDef {
  return {
    radius: 0.6, damage: 40, chakraGain: 2, reaction: HitReaction.STAGGER, knockback: 3.0, launch: 0,
    hitstunFrames: 18, blockstunFrames: 10, guardDamage: 8, priority: HitPriority.MELEE, ...p,
  };
}
function move(p: Partial<MoveDef> & Pick<MoveDef, 'name' | 'totalFrames' | 'hitboxes' | 'clip'>): MoveDef {
  const total = p.totalFrames;
  return {
    cancelStart: Math.floor(total * 0.42), cancelEnd: total - 2,
    sparkCancelStart: Math.floor(total * 0.35), sparkCancelEnd: total - 1,
    forwardStep: 3.2, ...p,
  };
}

// --------------------------------------------------------------------- strike vocabulary
/** Hit window and contact socket for each pose clip in OpbrMoves. */
interface Strike { clip: string; frames: number; hit: [number, number]; socket: string; radius?: number; step?: number }
const V: Record<string, Strike> = {
  jab_r: { clip: 'op_jab_r', frames: 18, hit: [8, 11], socket: RH },
  jab_l: { clip: 'op_jab_l', frames: 18, hit: [8, 11], socket: LH },
  hook_r: { clip: 'op_hook_r', frames: 22, hit: [10, 13], socket: RH, radius: 0.7 },
  upper_r: { clip: 'op_upper_r', frames: 24, hit: [11, 14], socket: RH, radius: 0.7 },
  elbow_r: { clip: 'op_elbow_r', frames: 20, hit: [9, 12], socket: RH, radius: 0.65 },
  kick_front: { clip: 'op_kick_front', frames: 24, hit: [11, 14], socket: RF, radius: 0.7 },
  kick_round: { clip: 'op_kick_round', frames: 26, hit: [12, 15], socket: RF, radius: 0.75 },
  kick_axe: { clip: 'op_kick_axe', frames: 28, hit: [13, 16], socket: RF, radius: 0.75 },
  kick_spin: { clip: 'op_kick_spin', frames: 30, hit: [16, 20], socket: RF, radius: 0.85 },
  smash_down: { clip: 'op_smash_down', frames: 32, hit: [14, 18], socket: RH, radius: 0.9 },
  palm_r: { clip: 'op_palm_r', frames: 20, hit: [9, 12], socket: RH, radius: 0.7 },
  double_palm: { clip: 'op_double_palm', frames: 26, hit: [12, 16], socket: RH, radius: 0.9 },
  backhand: { clip: 'op_backhand', frames: 20, hit: [9, 12], socket: RH, radius: 0.7 },
  headbutt: { clip: 'op_headbutt', frames: 22, hit: [10, 13], socket: HEAD, radius: 0.6 },
  lariat: { clip: 'op_lariat', frames: 30, hit: [16, 22], socket: RH, radius: 0.95, step: 5 },
  stomp: { clip: 'op_stomp', frames: 26, hit: [12, 16], socket: RF, radius: 0.8 },
  slash_diag: { clip: 'op_slash_diag', frames: 24, hit: [11, 14], socket: BLADE, radius: 0.8 },
  slash_rise: { clip: 'op_slash_rise', frames: 26, hit: [12, 15], socket: BLADE, radius: 0.8 },
  slash_spin: { clip: 'op_slash_spin', frames: 34, hit: [18, 24], socket: BLADE, radius: 1.0 },
  thrust: { clip: 'op_thrust', frames: 22, hit: [10, 13], socket: BLADE, radius: 0.7, step: 4.5 },
  spear_thrust: { clip: 'op_spear_thrust', frames: 28, hit: [13, 17], socket: BLADE, radius: 0.8, step: 5 },
  claw: { clip: 'op_claw', frames: 22, hit: [10, 13], socket: RH, radius: 0.75 },
};

type ReactionTag = 'hit' | 'launch' | 'spike' | 'blow' | 'crumple' | 'tumble';
const REACT: Record<ReactionTag, Partial<HitboxDef>> = {
  hit: { reaction: HitReaction.STAGGER, knockback: 3.2, launch: 0, hitstunFrames: 18 },
  launch: { reaction: HitReaction.LAUNCH, knockback: 2.5, launch: 12.5, hitstunFrames: 45, blockstunFrames: 16, guardDamage: 16 },
  spike: { reaction: HitReaction.SPIKE, knockback: 3.0, launch: -16, hitstunFrames: 40, blockstunFrames: 16, guardDamage: 16 },
  blow: { reaction: HitReaction.KNOCKBACK, knockback: 17, launch: 5.5, hitstunFrames: 42, blockstunFrames: 18, guardDamage: 20 },
  crumple: { reaction: HitReaction.CRUMPLE, knockback: 1.0, launch: 0, hitstunFrames: 50, blockstunFrames: 20, guardDamage: 22 },
  tumble: { reaction: HitReaction.TUMBLE, knockback: 22, launch: 6, hitstunFrames: 55, blockstunFrames: 22, guardDamage: 30 },
};

/** One string entry from the vocabulary. */
function strike(code: string, id: string, v: Strike, dmg: number, tag: ReactionTag = 'hit'): MoveDef {
  return move({
    name: `${code}_${id}`, clip: `op:${v.clip}`, totalFrames: v.frames, forwardStep: v.step ?? 3.2,
    hitboxes: [hb({ id: `${code}_${id}`, socket: v.socket, activeStart: v.hit[0], activeEnd: v.hit[1], damage: dmg, radius: v.radius ?? 0.6, ...REACT[tag] })],
  });
}

function stringOf(code: string, branch: ComboStringDef['branch'], keys: Array<[keyof typeof V, number, ReactionTag?]>): ComboStringDef {
  return {
    branch,
    moves: keys.map(([k, dmg, tag], i) => strike(code, `${branch.toLowerCase()}${i}`, V[k], dmg, tag)),
  };
}

// ------------------------------------------------------------------------------ skills
interface SkillOpts {
  id: string;
  name: string;
  desc: string;
  input: OpbrSkill['input'];
  clip: string;
  frames: number;
  cost: number;
  cooldown: number;
  hits?: Array<{ t: [number, number]; dmg: number; socket?: string; radius?: number; tag?: ReactionTag; unblockable?: boolean }>;
  fx?: OpbrFxEvent[];
  travel?: OpbrTravel;
  projectile?: JutsuProjectile & { t: number };
  armor?: boolean;
  cinematic?: boolean;
  counter?: boolean;
  teleport?: boolean;
  step?: number;
}
function skill(code: string, o: SkillOpts): OpbrSkill {
  const boxes = (o.hits ?? []).map((h, i) => hb({
    id: `${code}_${o.id}_${i}`, socket: h.socket ?? RH, activeStart: h.t[0], activeEnd: h.t[1],
    damage: h.dmg, radius: h.radius ?? 0.9, unblockable: h.unblockable,
    priority: HitPriority.JUTSU, chakraGain: 0, ...REACT[h.tag ?? 'blow'],
  }));
  return {
    id: o.id, name: o.name, desc: o.desc, input: o.input, cost: o.cost, cooldown: o.cooldown,
    fx: o.fx, travel: o.travel, projectile: o.projectile, armor: o.armor, cinematic: o.cinematic,
    counter: o.counter, teleport: o.teleport,
    move: move({
      name: `${code}_${o.id}`, clip: `op:${o.clip}`, totalFrames: o.frames, forwardStep: o.step ?? 2.0,
      cancelStart: 9999, cancelEnd: 9999, sparkCancelStart: 9999, sparkCancelEnd: 9999,
      hitboxes: boxes,
    }),
  };
}

// ------------------------------------------------------------------------------ builder
interface OpbrOpts {
  key: string;
  name: string;
  title: string;
  color: number;
  accent?: number;
  height: number;
  health?: number;
  runSpeed?: number;
  float?: boolean;
  hakiColor?: number;
  gaugeName?: string;
  style: string;
  altMesh?: string;
  altMode?: 'haki' | 'skill';
  weapon?: 'keep' | 'hand' | 'hide';
  string: Array<[keyof typeof V, number, ReactionTag?]>;
  up: Array<[keyof typeof V, number, ReactionTag?]>;
  down: Array<[keyof typeof V, number, ReactionTag?]>;
  air?: Array<[keyof typeof V, number, ReactionTag?]>;
  skills: SkillOpts[];
  ultimate: SkillOpts;
  supportType?: CharacterDef['supportType'];
}

function opbrChar(o: OpbrOpts): CharacterDef {
  const code = `op_${o.key}`;
  const skills = o.skills.map((s) => skill(code, s));
  const ult = skill(code, o.ultimate);
  const profile: OpbrProfile = {
    key: o.key, height: o.height, float: o.float, hakiColor: o.hakiColor ?? 0x2a2a3a,
    gaugeName: o.gaugeName ?? 'HAKI', skills, ultimate: ult, style: o.style,
    altMesh: o.altMesh, altMode: o.altMode, weapon: o.weapon,
  };
  return {
    code,
    displayName: o.name,
    title: o.title,
    jutsuName: skills[0]?.name ?? '',
    ultimateName: ult.name,
    color: o.color,
    accentColor: o.accent ?? 0x1b1b24,
    skinColor: 0xf3c9a0,
    hairColor: o.color,
    runSpeed: o.runSpeed ?? 9.2,
    dashSpeedMultiplier: 1.0,
    health: o.health ?? 1000,
    neutralString: stringOf(code, 'NEUTRAL', o.string),
    upString: stringOf(code, 'UP', o.up),
    downString: stringOf(code, 'DOWN', o.down),
    airString: stringOf(code, 'AIR', o.air ?? [['jab_r', 34], ['kick_round', 38], ['kick_axe', 70, 'spike']]),
    // The skill palette replaces the jutsu button; this entry keeps shared code (AI, HUD) happy.
    jutsu: skills[0].move,
    hurtboxes: [
      { socket: SOCKET.CHEST, radius: 0.58 },
      { socket: SOCKET.HEAD, radius: 0.36 },
      { socket: SOCKET.ROOT, radius: 0.52 },
    ],
    hasBlade: false,
    glbPath: `assets/op_${o.key}.glb`,
    supportType: o.supportType ?? 'ATTACK',
    portrait: `assets/ui/player_op_${o.key}.png`,
    icon: `assets/ui/sel/icon_op_${o.key}.png`,
    stand: `assets/ui/sel/stand_op_${o.key}.png`,
    vsFace: `assets/ui/sel/vs_op_${o.key}.png`,
    opbr: profile,
  };
}

const fx = (t: number, kind: OpbrFxEvent['kind'], extra: Partial<OpbrFxEvent> = {}): OpbrFxEvent => ({ t, kind, ...extra });

// ------------------------------------------------------------------------------ roster
export const LUFFY_DEF = opbrChar({
  key: 'luffy', name: 'MONKEY D. LUFFY', title: 'Straw Hat Crew · Gum-Gum Fruit', color: 0xd94b3a, accent: 0xf2d24a,
  height: 1.74, health: 1050, runSpeed: 10.0, hakiColor: 0x1a1a22, gaugeName: 'HAKI',
  style: 'Rubber rushdown — every skill stretches, Haki turns the fists black and heavy.',
  // The rip ships Gear-4 balloon limbs as "weapon" meshes, but they are skinned to their own
  // stretch chains and do not follow the arms, so Gear 4 is shown through the Haki coat and the
  // effects instead and those meshes stay hidden.
  weapon: 'hide',
  string: [['jab_r', 36], ['jab_l', 36], ['hook_r', 44], ['upper_r', 92, 'blow']],
  up: [['upper_r', 60, 'launch'], ['kick_round', 70, 'launch']],
  down: [['kick_axe', 62, 'spike'], ['smash_down', 84, 'crumple']],
  skills: [
    { id: 's1', name: 'Gum-Gum Pistol', desc: 'The arm stretches across the screen for a single heavy punch.', input: 'S1', clip: 'op_gum_pistol', frames: 34, cost: 18, cooldown: 3,
      hits: [{ t: [16, 24], dmg: 150, radius: 2.0, tag: 'blow' }], fx: [fx(12, 'gum'), fx(16, 'haki'), fx(17, 'impact', { ahead: 2.2, color: 0xfff0d0 })], step: 6 },
    { id: 's2', name: 'Gum-Gum Hawk Gatling', desc: 'A storm of stretched punches that pins the opponent in place.', input: 'S2', clip: 'op_gum_gatling', frames: 54, cost: 28, cooldown: 6,
      hits: [{ t: [14, 17], dmg: 40, radius: 1.5, tag: 'hit' }, { t: [20, 23], dmg: 40, socket: LH, radius: 1.5, tag: 'hit' }, { t: [26, 29], dmg: 40, radius: 1.5, tag: 'hit' }, { t: [32, 35], dmg: 40, socket: LH, radius: 1.5, tag: 'hit' }, { t: [38, 43], dmg: 90, radius: 1.7, tag: 'blow' }],
      fx: [fx(14, 'gum'), fx(20, 'gum'), fx(26, 'gum'), fx(32, 'gum'), fx(38, 'haki'), fx(39, 'shock', { ahead: 2, color: 0xffe0b0 })], step: 4 },
    { id: 's3', name: 'Gum-Gum Elephant Gun', desc: 'A giant Haki-hardened fist slams straight down.', input: 'S3', clip: 'op_gum_elephant', frames: 46, cost: 34, cooldown: 8,
      hits: [{ t: [22, 29], dmg: 210, radius: 2.4, tag: 'crumple' }], armor: true,
      fx: [fx(14, 'haki'), fx(22, 'quake', { scale: 1.4, color: 0x1a1a22 }), fx(22, 'impact', { ahead: 1.6, scale: 1.6, color: 0xffffff })], step: 5 },
    { id: 's4', name: 'Red Roc', desc: 'A Haki fist wrapped in friction heat — it burns on contact.', input: 'S4', clip: 'op_fire_fist', frames: 40, cost: 30, cooldown: 7,
      hits: [{ t: [19, 27], dmg: 190, radius: 1.9, tag: 'tumble' }],
      fx: [fx(12, 'haki'), fx(16, 'fire_trail'), fx(19, 'fire', { scale: 1.3 }), fx(20, 'shock', { ahead: 2, color: 0xff8a3a })], step: 7 },
  ],
  ultimate: { id: 'ult', name: 'King Kong Gun', desc: 'Gear Fourth: the arm inflates and the whole arena shakes.', input: 'ULT', clip: 'op_gum_kong', frames: 90, cost: 100, cooldown: 0, cinematic: true, armor: true,
    hits: [{ t: [44, 62], dmg: 430, radius: 3.2, tag: 'tumble' }],
    fx: [fx(18, 'haki_burst', { color: 0xd94b3a, scale: 1.2 }), fx(34, 'haki'), fx(44, 'quake', { scale: 2.0, color: 0x1a1a22 }), fx(45, 'impact', { ahead: 2.4, scale: 2.4, color: 0xffffff }), fx(48, 'shock', { ahead: 3, scale: 2, color: 0xffd0a0 })], step: 8 },
});

export const LAW_DEF = opbrChar({
  key: 'law', weapon: 'hand', name: 'TRAFALGAR LAW', title: 'Heart Pirates · Op-Op Fruit', color: 0x2e6fa8, accent: 0xf0f0f0,
  height: 1.91, health: 930, runSpeed: 9.4, hakiColor: 0x2a3a5a, gaugeName: 'ROOM',
  style: 'Space control — ROOM turns positioning into a weapon; Shambles swaps you behind them.',
  string: [['slash_diag', 34], ['slash_rise', 36], ['thrust', 42], ['slash_spin', 88, 'blow']],
  up: [['slash_rise', 58, 'launch'], ['kick_round', 66, 'launch']],
  down: [['thrust', 56, 'spike'], ['slash_diag', 80, 'crumple']],
  skills: [
    { id: 's1', name: 'ROOM', desc: 'A sphere of control — Law\'s other skills gain range and bite inside it.', input: 'S1', clip: 'op_room', frames: 30, cost: 15, cooldown: 5,
      fx: [fx(10, 'room', { color: 0x6ad8ff, scale: 1 })] },
    { id: 's2', name: 'Shambles', desc: 'Swap places with the opponent and strike their back.', input: 'S2', clip: 'op_shambles', frames: 26, cost: 20, cooldown: 6, teleport: true,
      hits: [{ t: [14, 19], dmg: 70, radius: 1.2, tag: 'hit' }], fx: [fx(6, 'shambles'), fx(12, 'shambles')] },
    { id: 's3', name: 'Gamma Knife', desc: 'A blade of pure ROOM driven through the guard — unblockable.', input: 'S3', clip: 'op_gamma', frames: 40, cost: 34, cooldown: 9,
      hits: [{ t: [20, 30], dmg: 200, radius: 1.2, tag: 'crumple', unblockable: true }],
      fx: [fx(12, 'shambles'), fx(20, 'gamma', { scale: 1.2 }), fx(24, 'gamma', { scale: 0.8 })], step: 6 },
    { id: 's4', name: 'Takt', desc: 'Rips a slab of the stage out of the ground and drops it on them.', input: 'S4', clip: 'op_takt', frames: 44, cost: 28, cooldown: 8,
      hits: [{ t: [32, 42], dmg: 170, radius: 2.2, tag: 'launch' }],
      fx: [fx(12, 'room', { color: 0x6ad8ff, scale: 0.7 }), fx(24, 'gravity', { ahead: 2.5, color: 0x6ad8ff }), fx(32, 'quake', { scale: 1.2, color: 0x8adfff })] },
  ],
  ultimate: { id: 'ult', name: 'Puncture Wille', desc: 'A ROOM the size of the arena, then one enormous piercing thrust.', input: 'ULT', clip: 'op_meteor', frames: 96, cost: 100, cooldown: 0, cinematic: true, armor: true,
    hits: [{ t: [60, 78], dmg: 420, radius: 3.0, tag: 'tumble', unblockable: true }],
    fx: [fx(18, 'room', { color: 0x6ad8ff, scale: 1.6 }), fx(46, 'gamma', { scale: 1.6 }), fx(60, 'gamma', { ahead: 2, scale: 2.2 }), fx(62, 'quake', { scale: 1.8, color: 0x8adfff })] },
});

export const SABO_DEF = opbrChar({
  key: 'sabo', weapon: 'hand', name: 'SABO', title: 'Revolutionary Army · Flame-Flame Fruit', color: 0x2b6cd9, accent: 0xff7a1a,
  height: 1.87, health: 1000, runSpeed: 9.8, hakiColor: 0xff6a1a, gaugeName: 'FLAME',
  style: 'Fire and Ryusoken — burning straight lines, every skill leaves the floor scorched.',
  string: [['jab_r', 34], ['claw', 38], ['kick_round', 46], ['hook_r', 90, 'blow']],
  up: [['upper_r', 58, 'launch'], ['kick_round', 68, 'launch']],
  down: [['kick_axe', 60, 'spike'], ['claw', 82, 'crumple']],
  skills: [
    { id: 's1', name: 'Fire Fist', desc: 'A column of flame punched straight down the lane.', input: 'S1', clip: 'op_fire_fist', frames: 40, cost: 24, cooldown: 5,
      hits: [{ t: [19, 30], dmg: 175, radius: 2.1, tag: 'tumble' }],
      fx: [fx(14, 'fire_trail'), fx(19, 'fire', { scale: 1.5 }), fx(22, 'fire', { ahead: 3, scale: 1.2 }), fx(24, 'shock', { ahead: 3.4, color: 0xff8a3a })], step: 6 },
    { id: 's2', name: "Dragon's Claw Fist", desc: 'Ryusoken: a clawed strike that tears through guard.', input: 'S2', clip: 'op_dragon_claw', frames: 36, cost: 22, cooldown: 5,
      hits: [{ t: [17, 24], dmg: 140, radius: 1.4, tag: 'blow' }],
      fx: [fx(10, 'wind', { color: 0xffb070 }), fx(17, 'slash', { color: 0xff9a40, scale: 1.2 }), fx(18, 'impact', { ahead: 1.6, color: 0xffb060 })], step: 5 },
    { id: 's3', name: 'Flame Dragon King', desc: 'A sweeping kick that drags a wall of fire around him.', input: 'S3', clip: 'op_kick_spin', frames: 30, cost: 26, cooldown: 7,
      hits: [{ t: [16, 24], dmg: 160, radius: 2.3, socket: RF, tag: 'blow' }],
      fx: [fx(10, 'fire_trail'), fx(16, 'fire', { scale: 1.4 }), fx(18, 'quake', { scale: 1.0, color: 0xff8a3a })] },
    { id: 's4', name: 'Hiken Barrage', desc: 'Rapid fire punches, each one a small explosion.', input: 'S4', clip: 'op_gum_gatling', frames: 54, cost: 30, cooldown: 8,
      hits: [{ t: [14, 17], dmg: 38 }, { t: [20, 23], dmg: 38, socket: LH }, { t: [26, 29], dmg: 38 }, { t: [32, 35], dmg: 38, socket: LH }, { t: [38, 44], dmg: 100, tag: 'blow' }],
      fx: [fx(14, 'fire', { scale: 0.6 }), fx(20, 'fire', { scale: 0.6 }), fx(26, 'fire', { scale: 0.6 }), fx(32, 'fire', { scale: 0.6 }), fx(38, 'fire', { scale: 1.5 })], step: 4 },
  ],
  ultimate: { id: 'ult', name: 'Flame Emperor', desc: 'Both fists ignite and the fire comes down as a pillar.', input: 'ULT', clip: 'op_flame_emperor', frames: 80, cost: 100, cooldown: 0, cinematic: true, armor: true,
    hits: [{ t: [50, 68], dmg: 410, radius: 3.0, tag: 'tumble' }],
    fx: [fx(16, 'fire_trail', { scale: 1.4 }), fx(32, 'haki_burst', { color: 0xff7a1a, scale: 1.3 }), fx(50, 'fire', { ahead: 1.6, scale: 2.4 }), fx(52, 'quake', { scale: 1.8, color: 0xff8a3a }), fx(56, 'fire', { ahead: 3.4, scale: 1.8 })] },
});

export const SHANKS_DEF = opbrChar({
  key: 'shanks', weapon: 'hand', name: 'SHANKS', title: 'Red-Hair Pirates · Yonko', color: 0xb03030, accent: 0x1a1a22,
  height: 1.99, health: 1050, runSpeed: 9.6, hakiColor: 0x7a2a2a, gaugeName: 'HAKI',
  style: 'One sword, all three Haki. Slow to start, and every skill ends the exchange.',
  string: [['slash_diag', 40], ['slash_rise', 42], ['slash_spin', 52], ['thrust', 96, 'blow']],
  up: [['slash_rise', 66, 'launch'], ['slash_diag', 72, 'launch']],
  down: [['slash_diag', 64, 'spike'], ['slash_spin', 92, 'crumple']],
  skills: [
    { id: 's1', name: 'Haki Draw', desc: 'A black-coated slash from the draw — fast and long.', input: 'S1', clip: 'op_slash_diag', frames: 24, cost: 16, cooldown: 3,
      hits: [{ t: [11, 16], dmg: 130, radius: 1.8, socket: BLADE, tag: 'blow' }],
      fx: [fx(8, 'haki'), fx(11, 'blade_arc', { color: 0x9a3a3a, scale: 1.6 })], step: 7 },
    { id: 's2', name: "Conqueror's Haki", desc: 'Raw will: the air cracks, weak-willed opponents crumple.', input: 'S2', clip: 'op_conqueror', frames: 50, cost: 30, cooldown: 10,
      hits: [{ t: [22, 34], dmg: 120, radius: 4.5, tag: 'crumple', unblockable: true }], armor: true,
      fx: [fx(14, 'haki'), fx(22, 'conqueror', { scale: 1.3 })] },
    { id: 's3', name: 'Sweeping Slash', desc: 'A full turn of the blade that catches everything around him.', input: 'S3', clip: 'op_slash_spin', frames: 34, cost: 24, cooldown: 6,
      hits: [{ t: [18, 26], dmg: 165, radius: 2.4, socket: BLADE, tag: 'blow' }],
      fx: [fx(16, 'blade_arc', { color: 0xd04040, scale: 2.0 }), fx(20, 'wind', { color: 0xffd0d0 })] },
    { id: 's4', name: 'Observation Parry', desc: 'Reads the next attack and answers it with a counter cut.', input: 'S4', clip: 'op_future_sight', frames: 34, cost: 20, cooldown: 8, counter: true,
      hits: [{ t: [16, 24], dmg: 180, radius: 1.8, socket: BLADE, tag: 'tumble' }],
      fx: [fx(7, 'haki'), fx(16, 'blade_arc', { color: 0xff6060, scale: 1.7 })] },
  ],
  ultimate: { id: 'ult', name: 'Kamusari', desc: 'Divine Departure: one descending cut that splits the ground.', input: 'ULT', clip: 'op_kamusari', frames: 70, cost: 100, cooldown: 0, cinematic: true, armor: true,
    hits: [{ t: [40, 56], dmg: 450, radius: 3.2, socket: BLADE, tag: 'tumble', unblockable: true }],
    fx: [fx(18, 'haki'), fx(34, 'conqueror', { scale: 0.9 }), fx(40, 'blade_arc', { color: 0xff3030, scale: 3.0 }), fx(41, 'quake', { scale: 2.0, color: 0xd04040 }), fx(44, 'wind', { color: 0xffb0b0, scale: 1.6 })] },
});

export const KATAKURI_DEF = opbrChar({
  key: 'katakuri', weapon: 'hand', name: 'CHARLOTTE KATAKURI', title: 'Big Mom Pirates · Mochi-Mochi Fruit', color: 0x9a3a5a, accent: 0xf5d8e0,
  height: 2.75, health: 1150, runSpeed: 8.8, hakiColor: 0x3a1a2a, gaugeName: 'MOCHI',
  style: 'Reach and reads — mochi limbs hit from outside your range, Future Sight punishes guesses.',
  // The mochi trident / spear meshes only exist while a skill is out.
  altMesh: '^15025_0[345]_Weapon', altMode: 'skill',
  string: [['jab_r', 38], ['spear_thrust', 42], ['kick_front', 48], ['smash_down', 98, 'blow']],
  up: [['upper_r', 62, 'launch'], ['kick_round', 72, 'launch']],
  down: [['stomp', 64, 'spike'], ['smash_down', 92, 'crumple']],
  skills: [
    { id: 's1', name: 'Mochi Trident', desc: 'The arm becomes a trident and spears forward.', input: 'S1', clip: 'op_mochi_trident', frames: 38, cost: 20, cooldown: 4,
      hits: [{ t: [19, 28], dmg: 155, radius: 1.5, tag: 'blow' }],
      fx: [fx(12, 'mochi', { scale: 0.7 }), fx(19, 'mochi', { scale: 1.2 }), fx(20, 'impact', { ahead: 2.6, color: 0xf5d8e0 })], step: 6 },
    { id: 's2', name: 'Power Mochi', desc: 'A Haki-hardened mochi fist — heavy and slow.', input: 'S2', clip: 'op_gum_pistol', frames: 34, cost: 26, cooldown: 6,
      hits: [{ t: [16, 24], dmg: 185, radius: 2.0, tag: 'tumble' }], armor: true,
      fx: [fx(10, 'haki'), fx(16, 'mochi', { scale: 1.3 }), fx(17, 'impact', { ahead: 2.2, scale: 1.4, color: 0xffffff })], step: 5 },
    { id: 's3', name: 'Mochi Spear Rain', desc: 'Spikes of mochi rain down over a wide area.', input: 'S3', clip: 'op_mochi_rain', frames: 56, cost: 32, cooldown: 9,
      hits: [{ t: [40, 50], dmg: 190, radius: 2.8, tag: 'launch' }],
      fx: [fx(26, 'mochi', { scale: 0.8 }), fx(40, 'mochi', { ahead: 2.5, scale: 1.6 }), fx(42, 'quake', { scale: 1.1, color: 0xf0c8d8 })] },
    { id: 's4', name: 'Future Sight', desc: 'Sees the attack coming, slips it and answers.', input: 'S4', clip: 'op_future_sight', frames: 34, cost: 22, cooldown: 8, counter: true,
      hits: [{ t: [16, 24], dmg: 175, radius: 1.7, tag: 'tumble' }],
      fx: [fx(7, 'shambles'), fx(16, 'mochi', { scale: 1.2 }), fx(17, 'impact', { ahead: 1.8, color: 0xffd0e0 })] },
  ],
  ultimate: { id: 'ult', name: 'Zangiri Mochi', desc: 'A rush of mochi strikes ending in one cutting slam.', input: 'ULT', clip: 'op_finish_rush', frames: 96, cost: 100, cooldown: 0, cinematic: true, armor: true,
    hits: [{ t: [30, 34], dmg: 60 }, { t: [44, 48], dmg: 60, socket: LH }, { t: [70, 84], dmg: 330, radius: 3.0, tag: 'tumble' }],
    fx: [fx(30, 'mochi', { scale: 0.9 }), fx(44, 'mochi', { scale: 0.9 }), fx(58, 'haki_burst', { color: 0xf5a8c0, scale: 1.1 }), fx(70, 'mochi', { ahead: 2, scale: 2.2 }), fx(72, 'quake', { scale: 1.8, color: 0xf0c8d8 })] },
});

export const FUJITORA_DEF = opbrChar({
  key: 'fujitora', weapon: 'hand', name: 'ISSHO', title: 'Marine Admiral Fujitora · Press-Press Fruit', color: 0x6a4a8a, accent: 0xe8e0d0,
  height: 2.4, health: 1100, runSpeed: 8.6, hakiColor: 0x4a2a6a, gaugeName: 'GRAVITY',
  style: 'Gravity control — he pulls the sky down on you and never needs to see you coming.',
  string: [['slash_diag', 40], ['thrust', 40], ['slash_rise', 48], ['smash_down', 94, 'blow']],
  up: [['slash_rise', 64, 'launch'], ['upper_r', 70, 'launch']],
  down: [['smash_down', 66, 'spike'], ['slash_diag', 88, 'crumple']],
  skills: [
    { id: 's1', name: 'Gravity Blade: Rising', desc: 'An upward cut that rips the ground into the air with it.', input: 'S1', clip: 'op_gravity_blade', frames: 44, cost: 22, cooldown: 5,
      hits: [{ t: [22, 32], dmg: 160, radius: 2.0, socket: BLADE, tag: 'launch' }],
      fx: [fx(14, 'gravity', { color: 0x7a5ad0, scale: 0.8 }), fx(22, 'blade_arc', { color: 0xb090ff, scale: 1.8 }), fx(23, 'quake', { scale: 1.2, color: 0x8a6ad0 })] },
    { id: 's2', name: 'Gravity Press', desc: 'Doubles the weight of everything in front of him.', input: 'S2', clip: 'op_gravity_press', frames: 48, cost: 28, cooldown: 7,
      hits: [{ t: [26, 38], dmg: 190, radius: 2.8, tag: 'spike' }], armor: true,
      fx: [fx(16, 'gravity', { ahead: 2.4, color: 0x5a3aa8, scale: 1.3 }), fx(26, 'quake', { scale: 1.6, color: 0x7a5ad0 }), fx(28, 'shock', { ahead: 2.4, color: 0xb090ff })] },
    { id: 's3', name: 'Blind Cut', desc: 'He does not need eyes — a clean cut through the guard.', input: 'S3', clip: 'op_slash_diag', frames: 24, cost: 18, cooldown: 4,
      hits: [{ t: [11, 16], dmg: 140, radius: 1.7, socket: BLADE, tag: 'blow', unblockable: true }],
      fx: [fx(11, 'blade_arc', { color: 0xc0a0ff, scale: 1.5 })], step: 6 },
    { id: 's4', name: 'Meteor Pull', desc: 'Drags a burning rock out of the sky onto their head.', input: 'S4', clip: 'op_takt', frames: 44, cost: 32, cooldown: 9,
      hits: [{ t: [34, 42], dmg: 200, radius: 2.4, tag: 'crumple' }],
      fx: [fx(14, 'gravity', { color: 0x5a3aa8 }), fx(20, 'meteor', { ahead: 3.0, scale: 1.1 }), fx(36, 'quake', { scale: 1.4, color: 0xff9a60 })] },
  ],
  ultimate: { id: 'ult', name: 'Raging Tiger', desc: 'A meteor shower pulled down on the whole stage.', input: 'ULT', clip: 'op_meteor', frames: 96, cost: 100, cooldown: 0, cinematic: true, armor: true,
    hits: [{ t: [60, 80], dmg: 440, radius: 3.4, tag: 'tumble' }],
    fx: [fx(18, 'gravity', { color: 0x5a3aa8, scale: 1.6 }), fx(30, 'meteor', { ahead: 2.0, scale: 1.4 }), fx(40, 'meteor', { ahead: 4.0, scale: 1.2 }), fx(50, 'meteor', { ahead: 1.0, scale: 1.6 }), fx(62, 'quake', { scale: 2.2, color: 0xffa060 })] },
});

export const KUMA_DEF = opbrChar({
  key: 'kuma', name: 'BARTHOLOMEW KUMA', title: 'Warlord · Paw-Paw Fruit', color: 0x2a2a3a, accent: 0xff9ad0,
  height: 2.89, health: 1200, runSpeed: 8.2, hakiColor: 0x5a2a4a, gaugeName: 'PAW',
  style: 'Repulsion — the paw pads push anything away, including pain and air itself.',
  string: [['palm_r', 40], ['double_palm', 46], ['backhand', 50], ['double_palm', 100, 'blow']],
  up: [['upper_r', 66, 'launch'], ['palm_r', 74, 'launch']],
  down: [['stomp', 70, 'spike'], ['double_palm', 96, 'crumple']],
  skills: [
    { id: 's1', name: 'Pad Ho', desc: 'A paw-pad push that launches the air itself forward.', input: 'S1', clip: 'op_paw_push', frames: 38, cost: 20, cooldown: 4,
      hits: [{ t: [20, 30], dmg: 165, radius: 2.0, tag: 'tumble' }],
      fx: [fx(12, 'pawprint'), fx(20, 'paw', { scale: 1.3 }), fx(22, 'shock', { ahead: 3, color: 0xff9ad0 })], step: 4 },
    { id: 's2', name: 'Tsuppari Pad Ho', desc: 'A flurry of paw thrusts, each one a pressure blast.', input: 'S2', clip: 'op_gum_gatling', frames: 54, cost: 28, cooldown: 7,
      hits: [{ t: [14, 17], dmg: 42, radius: 1.4 }, { t: [20, 23], dmg: 42, socket: LH, radius: 1.4 }, { t: [26, 29], dmg: 42, radius: 1.4 }, { t: [32, 35], dmg: 42, socket: LH, radius: 1.4 }, { t: [38, 44], dmg: 110, radius: 1.8, tag: 'blow' }],
      fx: [fx(14, 'paw', { scale: 0.6 }), fx(20, 'paw', { scale: 0.6 }), fx(26, 'paw', { scale: 0.6 }), fx(32, 'paw', { scale: 0.6 }), fx(38, 'paw', { scale: 1.4 })], step: 3 },
    { id: 's3', name: 'Pad Cannon', desc: 'Compresses the air into a bullet and fires it across the stage.', input: 'S3', clip: 'op_palm_r', frames: 20, cost: 24, cooldown: 6,
      projectile: { t: 10, color: 0xff9ad0, sprite: 'circle', speed: 22, damage: 150, radius: 1.1, height: 1.3, life: 2.4, launchSfx: 'exp1', hitSfx: 'exp2' },
      fx: [fx(10, 'paw', { scale: 0.9 })] },
    { id: 's4', name: 'Paw Shield', desc: 'Braces behind the pads — attacks are pushed straight back off him.', input: 'S4', clip: 'op_tekkai', frames: 44, cost: 18, cooldown: 10, armor: true, counter: true,
      hits: [{ t: [20, 34], dmg: 120, radius: 2.2, tag: 'blow' }],
      fx: [fx(8, 'pawprint', { scale: 0.8 }), fx(20, 'shock', { scale: 1.6, color: 0xff9ad0 })] },
  ],
  ultimate: { id: 'ult', name: 'Ursus Shock', desc: 'A compressed ball of air the size of a house, and then it pops.', input: 'ULT', clip: 'op_ursus', frames: 86, cost: 100, cooldown: 0, cinematic: true, armor: true,
    hits: [{ t: [54, 74], dmg: 460, radius: 4.0, tag: 'tumble' }],
    fx: [fx(20, 'pawprint', { scale: 1.6 }), fx(42, 'gravity', { ahead: 2, color: 0xff9ad0, scale: 1.6 }), fx(54, 'paw', { ahead: 2, scale: 3.0 }), fx(55, 'quake', { scale: 2.4, color: 0xff9ad0 }), fx(58, 'shock', { ahead: 3, scale: 2.4, color: 0xffd0e8 })] },
});

export const BURGESS_DEF = opbrChar({
  key: 'burgess', name: 'JESUS BURGESS', title: 'Blackbeard Pirates · Champion', color: 0x8a5a2a, accent: 0xf0d090,
  height: 2.32, health: 1150, runSpeed: 9.0, hakiColor: 0x3a2a1a, gaugeName: 'MUSCLE',
  style: 'Pro wrestling — grabs, slams and a body that keeps coming through your hits.',
  string: [['jab_r', 40], ['elbow_r', 44], ['headbutt', 50], ['lariat', 102, 'blow']],
  up: [['upper_r', 68, 'launch'], ['headbutt', 74, 'launch']],
  down: [['stomp', 68, 'spike'], ['smash_down', 94, 'crumple']],
  skills: [
    { id: 's1', name: 'Champion Lariat', desc: 'Runs through the guard with an outstretched arm.', input: 'S1', clip: 'op_lariat', frames: 30, cost: 20, cooldown: 4,
      hits: [{ t: [16, 24], dmg: 170, radius: 1.6, tag: 'tumble' }], armor: true,
      fx: [fx(10, 'dust'), fx(16, 'impact', { ahead: 1.6, scale: 1.3, color: 0xffd090 })], step: 8, travel: { t: 6, frames: 12, speed: 14 } },
    { id: 's2', name: 'Flying Tackle', desc: 'Leaves the ground shoulder-first and buries them.', input: 'S2', clip: 'op_tackle', frames: 36, cost: 24, cooldown: 6,
      hits: [{ t: [16, 26], dmg: 160, radius: 1.7, tag: 'blow' }], armor: true,
      fx: [fx(8, 'dust', { scale: 1.2 }), fx(16, 'quake', { scale: 1.1, color: 0xd0b080 })], step: 9, travel: { t: 8, frames: 14, speed: 18 } },
    { id: 's3', name: 'Champion Powerbomb', desc: 'Lifts them overhead and folds them into the floor.', input: 'S3', clip: 'op_powerbomb', frames: 56, cost: 32, cooldown: 9,
      hits: [{ t: [36, 48], dmg: 230, radius: 1.8, tag: 'crumple' }],
      fx: [fx(24, 'haki'), fx(36, 'quake', { scale: 1.6, color: 0xc0a070 }), fx(37, 'impact', { ahead: 1.2, scale: 1.6, color: 0xffffff })] },
    { id: 's4', name: 'Earthquake Stomp', desc: 'A stomp that cracks the stage and trips anyone standing.', input: 'S4', clip: 'op_stomp', frames: 26, cost: 22, cooldown: 6,
      hits: [{ t: [12, 20], dmg: 150, radius: 2.6, socket: RF, tag: 'launch' }],
      fx: [fx(12, 'quake', { scale: 1.5, color: 0xd0b080 }), fx(13, 'dust', { scale: 1.6 })] },
  ],
  ultimate: { id: 'ult', name: 'Champion Press', desc: 'The full championship sequence, ending shoulder-first from the sky.', input: 'ULT', clip: 'op_finish_rush', frames: 96, cost: 100, cooldown: 0, cinematic: true, armor: true,
    hits: [{ t: [30, 34], dmg: 65 }, { t: [44, 48], dmg: 65, socket: LH }, { t: [70, 86], dmg: 340, radius: 3.0, tag: 'tumble' }],
    fx: [fx(16, 'dust', { scale: 1.4 }), fx(30, 'impact', { ahead: 1.4 }), fx(44, 'impact', { ahead: 1.4 }), fx(58, 'haki_burst', { color: 0xf0c070, scale: 1.2 }), fx(70, 'quake', { scale: 2.2, color: 0xd0b080 })] },
});

export const SHIKI_DEF = opbrChar({
  key: 'shiki', name: 'SHIKI', title: 'The Golden Lion · Float-Float Fruit', color: 0xd8c070, accent: 0x2a2a3a,
  height: 3.0, health: 1050, runSpeed: 9.4, float: true, hakiColor: 0xd8c070, gaugeName: 'FLOAT',
  style: 'Never touches the ground — sword legs below, floating rubble above.',
  string: [['kick_round', 40], ['kick_spin', 44], ['slash_diag', 48], ['kick_axe', 96, 'blow']],
  up: [['kick_round', 66, 'launch'], ['slash_rise', 72, 'launch']],
  down: [['kick_axe', 66, 'spike'], ['kick_spin', 90, 'crumple']],
  skills: [
    { id: 's1', name: 'Shishi Odoshi', desc: 'The blades bolted to his legs sweep in a full circle.', input: 'S1', clip: 'op_shishi', frames: 40, cost: 20, cooldown: 4,
      hits: [{ t: [20, 28], dmg: 165, radius: 2.2, socket: RF, tag: 'blow' }],
      fx: [fx(12, 'wind', { color: 0xffe0a0 }), fx(20, 'blade_arc', { color: 0xffd070, scale: 2.0 })] },
    { id: 's2', name: "Lion's Threat", desc: 'Tears a chunk of the island loose and hurls it.', input: 'S2', clip: 'op_lion', frames: 58, cost: 30, cooldown: 8,
      hits: [{ t: [40, 52], dmg: 200, radius: 2.6, tag: 'launch' }],
      fx: [fx(16, 'lion', { scale: 0.9 }), fx(30, 'gravity', { ahead: 2.4, color: 0xd8c070 }), fx(40, 'quake', { scale: 1.6, color: 0xd8c070 })] },
    { id: 's3', name: 'Floating Debris', desc: 'Rubble hangs in the air, then drives itself down.', input: 'S3', clip: 'op_takt', frames: 44, cost: 26, cooldown: 7,
      hits: [{ t: [32, 42], dmg: 175, radius: 2.4, tag: 'spike' }],
      fx: [fx(14, 'gravity', { color: 0xd8c070, scale: 0.8 }), fx(24, 'meteor', { ahead: 2.2, scale: 0.9 }), fx(34, 'quake', { scale: 1.2, color: 0xd8c070 })] },
    { id: 's4', name: 'Sky Slice', desc: 'A spinning drop from above with both leg blades out.', input: 'S4', clip: 'op_slash_spin', frames: 34, cost: 24, cooldown: 6,
      hits: [{ t: [18, 26], dmg: 170, radius: 2.3, socket: RF, tag: 'tumble' }],
      fx: [fx(16, 'blade_arc', { color: 0xffe0a0, scale: 2.0 }), fx(18, 'wind', { color: 0xffe0a0 })], step: 6 },
  ],
  ultimate: { id: 'ult', name: 'Amudai', desc: 'A floating island drops out of the sky onto the arena.', input: 'ULT', clip: 'op_amudai', frames: 100, cost: 100, cooldown: 0, cinematic: true, armor: true,
    hits: [{ t: [70, 90], dmg: 440, radius: 3.6, tag: 'tumble' }],
    fx: [fx(22, 'lion', { scale: 1.4 }), fx(40, 'gravity', { ahead: 2, color: 0xd8c070, scale: 2.0 }), fx(56, 'meteor', { ahead: 2.4, scale: 2.2 }), fx(70, 'quake', { scale: 2.6, color: 0xd8c070 }), fx(74, 'shock', { ahead: 2, scale: 2.4, color: 0xffe0a0 })] },
});

export const KARASU_DEF = opbrChar({
  key: 'karasu', name: 'KARASU', title: 'Revolutionary Army · North Army Commander', color: 0x3a3a4a, accent: 0x9a6aff,
  height: 2.0, health: 950, runSpeed: 9.6, float: true, hakiColor: 0x1a1a22, gaugeName: 'FLOCK',
  style: 'A body made of crows — he hovers, splits apart and reassembles behind the hit.',
  string: [['claw', 34], ['jab_l', 36], ['kick_round', 44], ['claw', 88, 'blow']],
  up: [['upper_r', 58, 'launch'], ['claw', 66, 'launch']],
  down: [['kick_axe', 58, 'spike'], ['claw', 82, 'crumple']],
  skills: [
    { id: 's1', name: 'Crow Lance', desc: 'The arm scatters into birds and re-forms as a spear.', input: 'S1', clip: 'op_crow_lance', frames: 34, cost: 18, cooldown: 4,
      hits: [{ t: [17, 24], dmg: 145, radius: 1.6, tag: 'blow' }],
      fx: [fx(10, 'crow', { scale: 0.7 }), fx(17, 'crow', { ahead: 1.8, scale: 1.2 }), fx(18, 'impact', { ahead: 2.0, color: 0x9a6aff })], step: 6 },
    { id: 's2', name: 'Murder Burst', desc: 'The whole flock explodes outward at once.', input: 'S2', clip: 'op_crow_burst', frames: 40, cost: 26, cooldown: 7,
      hits: [{ t: [18, 28], dmg: 170, radius: 3.0, tag: 'blow' }], armor: true,
      fx: [fx(10, 'crow', { scale: 1.0 }), fx(18, 'crow', { scale: 2.0 }), fx(19, 'shock', { scale: 1.6, color: 0x6a4aaf })] },
    { id: 's3', name: 'Black Bind', desc: 'Crows wrap the opponent and drag them up.', input: 'S3', clip: 'op_takt', frames: 44, cost: 28, cooldown: 8,
      hits: [{ t: [32, 42], dmg: 165, radius: 2.2, tag: 'launch' }],
      fx: [fx(14, 'crow', { scale: 0.8 }), fx(24, 'crow', { ahead: 2.4, scale: 1.1 }), fx(32, 'crow', { ahead: 2.4, scale: 1.4 })] },
    { id: 's4', name: 'Feather Storm', desc: 'A spinning wall of feathers and beaks.', input: 'S4', clip: 'op_slash_spin', frames: 34, cost: 24, cooldown: 6,
      hits: [{ t: [18, 26], dmg: 160, radius: 2.4, tag: 'tumble' }],
      fx: [fx(14, 'crow', { scale: 1.2 }), fx(18, 'wind', { color: 0x6a4aaf })] },
  ],
  ultimate: { id: 'ult', name: 'Black Storm', desc: 'Every crow at once — the arena goes dark.', input: 'ULT', clip: 'op_black_storm', frames: 96, cost: 100, cooldown: 0, cinematic: true, armor: true,
    hits: [{ t: [66, 86], dmg: 420, radius: 3.6, tag: 'tumble' }],
    fx: [fx(22, 'crow', { scale: 1.6 }), fx(44, 'crow', { scale: 2.2 }), fx(52, 'haki_burst', { color: 0x6a4aaf, scale: 1.4 }), fx(66, 'crow', { ahead: 2, scale: 3.0 }), fx(68, 'shock', { ahead: 2, scale: 2.4, color: 0x9a6aff })] },
});

export const KOBY_DEF = opbrChar({
  key: 'koby', name: 'KOBY', title: 'Marine Captain · Rokushiki', color: 0xe8a0b0, accent: 0xf0f0f0,
  height: 1.8, health: 920, runSpeed: 10.2, hakiColor: 0x8a8a9a, gaugeName: 'HAKI',
  style: 'Marine Six Powers — the fastest fighter here, built on precision rather than weight.',
  string: [['jab_r', 32], ['jab_l', 32], ['kick_front', 40], ['kick_spin', 86, 'blow']],
  up: [['upper_r', 56, 'launch'], ['kick_round', 64, 'launch']],
  down: [['kick_axe', 56, 'spike'], ['elbow_r', 78, 'crumple']],
  skills: [
    { id: 's1', name: 'Shigan', desc: 'Finger Pistol: a fingertip driven through the guard.', input: 'S1', clip: 'op_shigan', frames: 26, cost: 16, cooldown: 3,
      hits: [{ t: [13, 19], dmg: 135, radius: 0.9, tag: 'blow', unblockable: true }],
      fx: [fx(13, 'impact', { ahead: 1.4, color: 0xffd0d8 }), fx(13, 'haki')], step: 5 },
    { id: 's2', name: 'Rankyaku', desc: 'Storm Leg: a blade of compressed air kicked across the stage.', input: 'S2', clip: 'op_rankyaku', frames: 32, cost: 22, cooldown: 5,
      projectile: { t: 17, color: 0xc8e8ff, sprite: 'slash', speed: 26, damage: 150, radius: 1.0, height: 1.2, life: 2.2, launchSfx: 'sword_swing', hitSfx: 'sword_hit' },
      fx: [fx(17, 'blade_arc', { color: 0xc8e8ff, scale: 1.4 })] },
    { id: 's3', name: 'Soru Strike', desc: 'Shave: ten kicks worth of speed into one punch.', input: 'S3', clip: 'op_soru', frames: 30, cost: 24, cooldown: 6,
      hits: [{ t: [12, 20], dmg: 160, radius: 1.4, tag: 'tumble' }],
      fx: [fx(6, 'dust'), fx(12, 'haki'), fx(13, 'impact', { ahead: 1.6, scale: 1.2, color: 0xffffff })], step: 10, travel: { t: 4, frames: 10, speed: 22 } },
    { id: 's4', name: 'Tekkai', desc: 'Iron Body: he takes the hit and does not move.', input: 'S4', clip: 'op_tekkai', frames: 44, cost: 18, cooldown: 9, armor: true, counter: true,
      hits: [{ t: [20, 34], dmg: 110, radius: 1.8, tag: 'blow' }],
      fx: [fx(8, 'haki'), fx(20, 'shock', { scale: 1.2, color: 0xd0d0e0 })] },
  ],
  ultimate: { id: 'ult', name: "Marine's Resolve", desc: 'Rokushiki chained end to end, finished with a Haki fist.', input: 'ULT', clip: 'op_finish_rush', frames: 96, cost: 100, cooldown: 0, cinematic: true, armor: true,
    hits: [{ t: [30, 34], dmg: 55 }, { t: [44, 48], dmg: 55, socket: LH }, { t: [70, 86], dmg: 330, radius: 2.8, tag: 'tumble' }],
    fx: [fx(16, 'haki'), fx(30, 'impact', { ahead: 1.4 }), fx(44, 'impact', { ahead: 1.4 }), fx(58, 'haki_burst', { color: 0xe8a0b0, scale: 1.1 }), fx(70, 'quake', { scale: 1.8, color: 0xd0d0e0 })] },
});

/** Playable One Piece fighters, in select-screen order. */
export const OPBR_ROSTER: CharacterDef[] = [
  LUFFY_DEF, LAW_DEF, SABO_DEF, SHANKS_DEF, KATAKURI_DEF,
  FUJITORA_DEF, KUMA_DEF, BURGESS_DEF, SHIKI_DEF, KARASU_DEF, KOBY_DEF,
];

/** Chopper joins as a support only — the rip is the game's own support model. */
export const CHOPPER_SUPPORT: CharacterDef = {
  ...opbrChar({
    key: 'chopper', name: 'TONY TONY CHOPPER', title: 'Straw Hat Crew · Support', color: 0xd06a4a, accent: 0xf0e0c0,
    height: 1.4, health: 800, runSpeed: 9.0, gaugeName: 'HAKI',
    style: 'Support only — Kung-Fu Point rushes in, Guard Point covers you.',
    string: [['jab_r', 30], ['jab_l', 30], ['headbutt', 46, 'blow']],
    up: [['upper_r', 50, 'launch']],
    down: [['kick_axe', 50, 'spike']],
    skills: [
      { id: 's1', name: 'Kung-Fu Point', desc: 'Rushes in with a flurry of small, fast strikes.', input: 'S1', clip: 'op_gum_gatling', frames: 54, cost: 20, cooldown: 6,
        hits: [{ t: [14, 17], dmg: 30 }, { t: [20, 23], dmg: 30, socket: LH }, { t: [26, 29], dmg: 30 }, { t: [38, 44], dmg: 70, tag: 'blow' }], fx: [fx(38, 'impact', { ahead: 1.2 })] },
      { id: 's2', name: 'Guard Point', desc: 'Puffs up into a ball of fur that absorbs the hit.', input: 'S2', clip: 'op_tekkai', frames: 44, cost: 16, cooldown: 8, armor: true, counter: true,
        hits: [{ t: [20, 32], dmg: 90, radius: 1.8, tag: 'blow' }], fx: [fx(20, 'shock', { scale: 1.2, color: 0xffd0a0 })] },
      { id: 's3', name: 'Heavy Point', desc: 'A single heavy swing in his fighting form.', input: 'S3', clip: 'op_smash_down', frames: 32, cost: 22, cooldown: 7,
        hits: [{ t: [14, 22], dmg: 150, radius: 1.6, tag: 'crumple' }], fx: [fx(14, 'quake', { scale: 1.0, color: 0xd0a070 })] },
      { id: 's4', name: 'Rumble Ball', desc: 'Chews a Rumble Ball and doubles his speed.', input: 'S4', clip: 'charge', frames: 30, cost: 14, cooldown: 12, fx: [fx(10, 'haki_burst', { color: 0xd06a4a, scale: 0.8 })] },
    ],
    ultimate: { id: 'ult', name: 'Monster Point', desc: 'The transformation nobody wants to be near.', input: 'ULT', clip: 'op_finish_rush', frames: 96, cost: 100, cooldown: 0, cinematic: true, armor: true,
      hits: [{ t: [70, 86], dmg: 300, radius: 2.8, tag: 'tumble' }], fx: [fx(58, 'haki_burst', { color: 0xd06a4a, scale: 1.2 }), fx(70, 'quake', { scale: 1.8 })] },
  }),
  supportType: 'GUARD',
};

export function isOpbr(def: CharacterDef | null | undefined): boolean {
  return !!def?.opbr;
}

// Development guard: every move must name a pose clip that actually exists, otherwise the
// fighter would silently fall back to the idle pose mid-combo.
if (typeof location !== 'undefined' && location.hostname === 'localhost') {
  const missing = new Set<string>();
  const check = (clip: string) => { const n = clip.replace(/^op:/, ''); if (!OPBR_CLIPS.has(n)) missing.add(n); };
  for (const d of [...OPBR_ROSTER, CHOPPER_SUPPORT]) {
    for (const st of [d.neutralString, d.upString, d.downString, d.airString]) for (const m of st?.moves ?? []) check(m.clip);
    for (const sk of [...(d.opbr?.skills ?? []), d.opbr!.ultimate]) check(sk.move.clip);
  }
  if (missing.size) console.warn('[OPBR] missing pose clips:', [...missing].join(', '));
}
