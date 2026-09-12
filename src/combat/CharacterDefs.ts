/**
 * CharacterDefs.ts — Movesets for the two test fighters:
 *   2nrt (Naruto Uzumaki): balanced rushdown, Rasengan on the right palm dummy socket.
 *   2ssk (Sasuke Uchiha): Kusanagi blade swept-volume hitboxes, linear Chidori pierce.
 *
 * Socket naming follows CC2 dummy-bone conventions where practical. When a GLB is bound,
 * the rig binder resolves these socket names to actual bones; the procedural rig exposes
 * the same names.
 */
import { CharacterDef, ComboStringDef, HitPriority, HitReaction, HitboxDef, MoveDef, SupportType } from '../core/Types';

// Socket names shared by both rigs
export const SOCKET = {
  ROOT: 'root',
  CHEST: 'chest',
  HEAD: 'head',
  R_HAND: 'r_hand',
  L_HAND: 'l_hand',
  R_FOOT: 'r_foot',
  L_FOOT: 'l_foot',
  R_PALM_EFF: 'dmy01_rpalm', // 2nrt00t0 eff dmy01 — Rasengan anchor
  BLADE_BASE: 'blade_base', // 2ssk Kusanagi
  BLADE_TIP: 'blade_tip',
} as const;

function hb(partial: Partial<HitboxDef> & Pick<HitboxDef, 'id' | 'socket' | 'activeStart' | 'activeEnd'>): HitboxDef {
  return {
    radius: 0.55,
    damage: 40,
    chakraGain: 2,
    reaction: HitReaction.STAGGER,
    knockback: 3.0,
    launch: 0,
    hitstunFrames: 18,
    blockstunFrames: 10,
    guardDamage: 8,
    priority: HitPriority.MELEE,
    ...partial,
  };
}

function move(partial: Partial<MoveDef> & Pick<MoveDef, 'name' | 'totalFrames' | 'hitboxes'>): MoveDef {
  const total = partial.totalFrames;
  return {
    cancelStart: Math.floor(total * 0.45),
    cancelEnd: total - 2,
    sparkCancelStart: Math.floor(total * 0.35),
    sparkCancelEnd: total - 1,
    forwardStep: 3.0,
    clip: partial.name,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Naruto (2nrt)
// ---------------------------------------------------------------------------
const NARUTO_NEUTRAL: ComboStringDef = {
  branch: 'NEUTRAL',
  moves: [
    move({ name: 'nrt_atk1', clip: '2nrtcma00', totalFrames: 20, hitboxes: [hb({ id: 'n1', socket: SOCKET.R_HAND, activeStart: 6, activeEnd: 10, damage: 35 })] }),
    move({ name: 'nrt_atk2', clip: '2nrtcma01', totalFrames: 20, hitboxes: [hb({ id: 'n2', socket: SOCKET.L_HAND, activeStart: 5, activeEnd: 9, damage: 35 })] }),
    move({ name: 'nrt_atk3', clip: '2nrtcma02', totalFrames: 22, hitboxes: [hb({ id: 'n3', socket: SOCKET.R_FOOT, activeStart: 7, activeEnd: 12, damage: 45, radius: 0.65 })] }),
    move({
      name: 'nrt_atk4', clip: '2nrtcmb02',
      totalFrames: 34,
      forwardStep: 4.5,
      hitboxes: [
        hb({
          id: 'n4',
          socket: SOCKET.R_HAND,
          activeStart: 9,
          activeEnd: 14,
          damage: 90,
          radius: 0.7,
          reaction: HitReaction.KNOCKBACK,
          knockback: 16.0,
          launch: 5.5,
          hitstunFrames: 40,
          blockstunFrames: 16,
          guardDamage: 18,
        }),
      ],
    }),
  ],
};

const NARUTO_UP: ComboStringDef = {
  branch: 'UP',
  moves: [
    move({
      name: 'nrt_up1', clip: '2nrtcmb00',
      totalFrames: 26,
      hitboxes: [
        hb({ id: 'nu1', socket: SOCKET.R_FOOT, activeStart: 7, activeEnd: 12, damage: 55, reaction: HitReaction.LAUNCH, knockback: 2.0, launch: 13.0, hitstunFrames: 45 }),
      ],
    }),
    move({
      name: 'nrt_up2', clip: '2nrtcmb01',
      totalFrames: 30,
      hitboxes: [
        hb({ id: 'nu2', socket: SOCKET.L_FOOT, activeStart: 8, activeEnd: 13, damage: 65, reaction: HitReaction.LAUNCH, knockback: 3.0, launch: 11.0, hitstunFrames: 40 }),
      ],
    }),
  ],
};

const NARUTO_DOWN: ComboStringDef = {
  branch: 'DOWN',
  moves: [
    move({
      name: 'nrt_dn1', clip: '2nrtcmb01',
      totalFrames: 28,
      hitboxes: [
        hb({ id: 'nd1', socket: SOCKET.R_HAND, activeStart: 8, activeEnd: 13, damage: 60, reaction: HitReaction.SPIKE, knockback: 4.0, launch: -14.0, hitstunFrames: 38 }),
      ],
    }),
    move({
      name: 'nrt_dn2', clip: '2nrtcmb02',
      totalFrames: 34,
      hitboxes: [
        hb({ id: 'nd2', socket: SOCKET.R_FOOT, activeStart: 10, activeEnd: 15, damage: 80, reaction: HitReaction.CRUMPLE, knockback: 1.0, launch: 0, hitstunFrames: 50 }),
      ],
    }),
  ],
};

const NARUTO_RASENGAN: MoveDef = move({
  name: 'nrt_rasengan', clip: '2nrtskl1_s',
  totalFrames: 58,
  forwardStep: 9.0,
  cancelStart: 999,
  cancelEnd: 999,
  sparkCancelStart: 999,
  sparkCancelEnd: 999,
  hitboxes: [
    hb({
      id: 'rasengan',
      socket: SOCKET.R_PALM_EFF,
      activeStart: 18,
      activeEnd: 40,
      radius: 0.9,
      damage: 220,
      chakraGain: 0,
      reaction: HitReaction.TUMBLE,
      knockback: 24.0,
      launch: 6.0,
      hitstunFrames: 60,
      blockstunFrames: 24,
      guardDamage: 45,
      priority: HitPriority.ARMORED_JUTSU,
      armored: true,
    }),
  ],
});

export const NARUTO_DEF: CharacterDef = {
  code: '2nrt',
  displayName: 'NARUTO UZUMAKI',
  color: 0xff8c1a,
  accentColor: 0x1a1a1a,
  skinColor: 0xf3c9a0,
  hairColor: 0xf7d41a,
  runSpeed: 9.5,
  dashSpeedMultiplier: 1.0,
  health: 1000,
  neutralString: NARUTO_NEUTRAL,
  upString: NARUTO_UP,
  downString: NARUTO_DOWN,
  jutsu: NARUTO_RASENGAN,
  hurtboxes: [
    { socket: SOCKET.CHEST, radius: 0.55 },
    { socket: SOCKET.HEAD, radius: 0.35 },
    { socket: SOCKET.ROOT, radius: 0.5 },
  ],
  hasBlade: false,
  glbPath: 'assets/2nrt.glb',
  supportType: 'BALANCE',
  portrait: 'assets/ui/player_2nrt.png',
};

// ---------------------------------------------------------------------------
// Sasuke (2ssk)
// ---------------------------------------------------------------------------
const bladeBox = (id: string, s: number, e: number, extra: Partial<HitboxDef> = {}) =>
  hb({ id, socket: SOCKET.BLADE_BASE, socketEnd: SOCKET.BLADE_TIP, radius: 0.35, activeStart: s, activeEnd: e, ...extra });

const SASUKE_NEUTRAL: ComboStringDef = {
  branch: 'NEUTRAL',
  moves: [
    move({ name: 'ssk_atk1', clip: '2sskcma00', totalFrames: 18, hitboxes: [bladeBox('s1', 5, 9, { damage: 38 })] }),
    move({ name: 'ssk_atk2', clip: '2sskcma01', totalFrames: 19, hitboxes: [bladeBox('s2', 5, 9, { damage: 38 })] }),
    move({ name: 'ssk_atk3', clip: '2sskcma02', totalFrames: 22, hitboxes: [bladeBox('s3', 6, 11, { damage: 48 })] }),
    move({
      name: 'ssk_atk4', clip: '2sskcmb03',
      totalFrames: 36,
      forwardStep: 5.0,
      hitboxes: [bladeBox('s4', 9, 15, { damage: 95, reaction: HitReaction.KNOCKBACK, knockback: 17.0, launch: 5.0, hitstunFrames: 42, blockstunFrames: 16, guardDamage: 20 })],
    }),
  ],
};

const SASUKE_UP: ComboStringDef = {
  branch: 'UP',
  moves: [
    move({ name: 'ssk_up1', clip: '2sskcmb00', totalFrames: 26, hitboxes: [bladeBox('su1', 7, 12, { damage: 55, reaction: HitReaction.LAUNCH, knockback: 2.0, launch: 13.5, hitstunFrames: 45 })] }),
    move({ name: 'ssk_up2', clip: '2sskcmb01', totalFrames: 30, hitboxes: [bladeBox('su2', 8, 13, { damage: 65, reaction: HitReaction.LAUNCH, knockback: 3.0, launch: 11.0, hitstunFrames: 40 })] }),
  ],
};

const SASUKE_DOWN: ComboStringDef = {
  branch: 'DOWN',
  moves: [
    move({ name: 'ssk_dn1', clip: '2sskcmb02', totalFrames: 28, hitboxes: [bladeBox('sd1', 8, 13, { damage: 60, reaction: HitReaction.SPIKE, knockback: 4.0, launch: -14.0, hitstunFrames: 38 })] }),
    move({ name: 'ssk_dn2', clip: '2sskcmb03', totalFrames: 34, hitboxes: [bladeBox('sd2', 10, 15, { damage: 85, reaction: HitReaction.CRUMPLE, knockback: 1.0, launch: 0, hitstunFrames: 50 })] }),
  ],
};

const SASUKE_CHIDORI: MoveDef = move({
  name: 'ssk_chidori', clip: '2sskskl1_s',
  totalFrames: 54,
  forwardStep: 14.0,
  cancelStart: 999,
  cancelEnd: 999,
  sparkCancelStart: 999,
  sparkCancelEnd: 999,
  hitboxes: [
    hb({
      id: 'chidori',
      socket: SOCKET.L_HAND,
      activeStart: 16,
      activeEnd: 38,
      radius: 0.8,
      damage: 210,
      chakraGain: 0,
      reaction: HitReaction.TUMBLE,
      knockback: 26.0,
      launch: 4.0,
      hitstunFrames: 60,
      blockstunFrames: 24,
      guardDamage: 45,
      priority: HitPriority.ARMORED_JUTSU,
      armored: true,
    }),
  ],
});

export const SASUKE_DEF: CharacterDef = {
  code: '2ssk',
  displayName: 'SASUKE UCHIHA',
  color: 0x2e3a8c,
  accentColor: 0xe8e8ee,
  skinColor: 0xf0d2b8,
  hairColor: 0x15151f,
  runSpeed: 9.8,
  dashSpeedMultiplier: 1.05,
  health: 1000,
  neutralString: SASUKE_NEUTRAL,
  upString: SASUKE_UP,
  downString: SASUKE_DOWN,
  jutsu: SASUKE_CHIDORI,
  hurtboxes: [
    { socket: SOCKET.CHEST, radius: 0.55 },
    { socket: SOCKET.HEAD, radius: 0.35 },
    { socket: SOCKET.ROOT, radius: 0.5 },
  ],
  hasBlade: true,
  glbPath: 'assets/2ssk.glb',
  supportType: 'ATTACK',
  portrait: 'assets/ui/player_2ssk.png',
};

export const CHARACTERS: Record<string, CharacterDef> = {
  '2nrt': NARUTO_DEF,
  '2ssk': SASUKE_DEF,
};
