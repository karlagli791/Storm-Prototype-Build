/**
 * Roster.ts — every selectable character. Naruto and Sasuke keep their hand-tuned movesets in
 * CharacterDefs.ts; the rest are built from a template that follows the CC2 clip naming shared by
 * every Storm 4 character container (`<code>cma00..03` neutral string, `<code>cmb..` branches,
 * `<code>skl1_s*` jutsu). The template's frame data is the engine's own; the real per-character
 * `prm` tables are still locked in the prototype disc.
 *
 * Select-screen art: Storm 2 chara_sel / vs / duel textures (see tools/scripts/build_select_assets.py).
 * Mifune's icon is from Storm 3; Indra (a Storm Connections rip) borrows Sasuke's moveset via
 * `animBank` and has its portraits rendered from the model (tools/scripts/render_portraits.py).
 */
import { CharacterDef, ComboStringDef, HitPriority, HitReaction, HitboxDef, MoveDef, SupportType } from '../core/Types';
import { NARUTO_DEF, SASUKE_DEF, SOCKET } from './CharacterDefs';

interface TemplateOpts {
  code: string;
  displayName: string;
  title: string;
  jutsuName: string;
  supportType: SupportType;
  color: number;
  accent?: number;
  runSpeed?: number;
  health?: number;
  /** Fourth neutral hit clip (cma03 when the character has one, otherwise a cmb finisher). */
  finisher?: string;
  /** Weapon user: hitboxes sweep from blade base to tip. */
  blade?: boolean;
  /** Ranged jutsu: hitbox on the palm, fires further forward. */
  jutsuRange?: number;
  jutsuArmored?: boolean;
  /** Borrow another character's animation set (same skeleton family). */
  animBank?: string;
  portrait?: string;
}

function hb(p: Partial<HitboxDef> & Pick<HitboxDef, 'id' | 'socket' | 'activeStart' | 'activeEnd'>): HitboxDef {
  return {
    radius: 0.55, damage: 40, chakraGain: 2, reaction: HitReaction.STAGGER, knockback: 3.0, launch: 0,
    hitstunFrames: 18, blockstunFrames: 10, guardDamage: 8, priority: HitPriority.MELEE, ...p,
  };
}

function move(p: Partial<MoveDef> & Pick<MoveDef, 'name' | 'totalFrames' | 'hitboxes'>): MoveDef {
  const total = p.totalFrames;
  return {
    cancelStart: Math.floor(total * 0.45), cancelEnd: total - 2,
    sparkCancelStart: Math.floor(total * 0.35), sparkCancelEnd: total - 1,
    forwardStep: 3.0, clip: p.name, ...p,
  };
}

export function makeTemplateDef(o: TemplateOpts): CharacterDef {
  const c = o.code;
  const bank = o.animBank ?? c;
  const clip = (suffix: string) => `${bank}${suffix}`;
  const sock = (s: string, extra: Partial<HitboxDef> = {}) =>
    o.blade
      ? { socket: SOCKET.BLADE_BASE, socketEnd: SOCKET.BLADE_TIP, radius: 0.35, ...extra }
      : { socket: s, ...extra };
  const neutral: ComboStringDef = {
    branch: 'NEUTRAL',
    moves: [
      move({ name: `${c}_atk1`, clip: clip('cma00'), totalFrames: 19, hitboxes: [hb({ id: `${c}1`, activeStart: 5, activeEnd: 9, damage: 36, ...sock(SOCKET.R_HAND) })] }),
      move({ name: `${c}_atk2`, clip: clip('cma01'), totalFrames: 19, hitboxes: [hb({ id: `${c}2`, activeStart: 5, activeEnd: 9, damage: 36, ...sock(SOCKET.L_HAND) })] }),
      move({ name: `${c}_atk3`, clip: clip('cma02'), totalFrames: 22, hitboxes: [hb({ id: `${c}3`, activeStart: 6, activeEnd: 11, damage: 46, radius: 0.65, ...sock(SOCKET.R_FOOT) })] }),
      move({
        name: `${c}_atk4`, clip: clip(o.finisher ?? 'cmb02'), totalFrames: 34, forwardStep: 4.5,
        hitboxes: [hb({ id: `${c}4`, activeStart: 9, activeEnd: 14, damage: 92, radius: 0.7, reaction: HitReaction.KNOCKBACK, knockback: 16.0, launch: 5.5, hitstunFrames: 40, blockstunFrames: 16, guardDamage: 18, ...sock(SOCKET.R_HAND, { radius: o.blade ? 0.4 : 0.7 }) })],
      }),
    ],
  };
  const up: ComboStringDef = {
    branch: 'UP',
    moves: [
      move({ name: `${c}_up1`, clip: clip('cmb00'), totalFrames: 26, hitboxes: [hb({ id: `${c}u1`, activeStart: 7, activeEnd: 12, damage: 55, reaction: HitReaction.LAUNCH, knockback: 2.0, launch: 13.0, hitstunFrames: 45, ...sock(SOCKET.R_FOOT) })] }),
      move({ name: `${c}_up2`, clip: clip('cmb01'), totalFrames: 30, hitboxes: [hb({ id: `${c}u2`, activeStart: 8, activeEnd: 13, damage: 65, reaction: HitReaction.LAUNCH, knockback: 3.0, launch: 11.0, hitstunFrames: 40, ...sock(SOCKET.L_FOOT) })] }),
    ],
  };
  const down: ComboStringDef = {
    branch: 'DOWN',
    moves: [
      move({ name: `${c}_dn1`, clip: clip('cmb01'), totalFrames: 28, hitboxes: [hb({ id: `${c}d1`, activeStart: 8, activeEnd: 13, damage: 60, reaction: HitReaction.SPIKE, knockback: 4.0, launch: -14.0, hitstunFrames: 38, ...sock(SOCKET.R_HAND) })] }),
      move({ name: `${c}_dn2`, clip: clip('cmb02'), totalFrames: 34, hitboxes: [hb({ id: `${c}d2`, activeStart: 10, activeEnd: 15, damage: 80, reaction: HitReaction.CRUMPLE, knockback: 1.0, launch: 0, hitstunFrames: 50, ...sock(SOCKET.R_FOOT) })] }),
    ],
  };
  const jutsu: MoveDef = move({
    name: `${c}_jutsu`, clip: clip('skl1_s'), totalFrames: 58, forwardStep: o.jutsuRange ?? 8.0,
    cancelStart: 999, cancelEnd: 999, sparkCancelStart: 999, sparkCancelEnd: 999,
    hitboxes: [
      hb({
        id: `${c}_skl`, socket: SOCKET.R_PALM_EFF, activeStart: 18, activeEnd: 40, radius: o.jutsuRange && o.jutsuRange > 10 ? 1.3 : 0.9,
        damage: 210, chakraGain: 0, reaction: HitReaction.TUMBLE, knockback: 24.0, launch: 6.0, hitstunFrames: 60, blockstunFrames: 24, guardDamage: 45,
        priority: HitPriority.ARMORED_JUTSU, armored: o.jutsuArmored ?? true,
      }),
    ],
  });
  return {
    code: c,
    displayName: o.displayName,
    title: o.title,
    jutsuName: o.jutsuName,
    color: o.color,
    accentColor: o.accent ?? 0x1a1a1a,
    skinColor: 0xf3c9a0,
    hairColor: o.color,
    runSpeed: o.runSpeed ?? 9.3,
    dashSpeedMultiplier: 1.0,
    health: o.health ?? 1000,
    neutralString: neutral,
    upString: up,
    downString: down,
    jutsu,
    hurtboxes: [
      { socket: SOCKET.CHEST, radius: 0.55 },
      { socket: SOCKET.HEAD, radius: 0.35 },
      { socket: SOCKET.ROOT, radius: 0.5 },
    ],
    hasBlade: !!o.blade,
    glbPath: `assets/${c}.glb`,
    animBank: o.animBank,
    supportType: o.supportType,
    portrait: o.portrait ?? `assets/ui/player_${c}.png`,
    icon: `assets/ui/sel/icon_${c}.png`,
    stand: `assets/ui/sel/stand_${c}.png`,
    vsFace: `assets/ui/sel/vs_${c}.png`,
  };
}

export const DEIDARA_DEF = makeTemplateDef({
  code: '2ddr', displayName: 'DEIDARA', title: 'Akatsuki · Explosion Release', jutsuName: 'C1: Explosive Clay',
  supportType: 'BALANCE', color: 0xf2d24a, runSpeed: 9.0, jutsuRange: 12, jutsuArmored: false,
});
export const MIFUNE_DEF = makeTemplateDef({
  code: '3mfn', displayName: 'MIFUNE', title: 'Land of Iron · Samurai General', jutsuName: 'Iai: Lightning-Speed Slash',
  supportType: 'ATTACK', color: 0xd8d0c0, runSpeed: 9.4, blade: true, finisher: 'cmb03',
});
export const ITACHI_DEF = makeTemplateDef({
  code: '2itc', displayName: 'ITACHI UCHIHA', title: 'Akatsuki · Sharingan', jutsuName: 'Fire Style: Great Fireball',
  supportType: 'ATTACK', color: 0x2a2a3a, runSpeed: 9.2, finisher: 'cma03', jutsuRange: 11,
});
export const GAARA_DEF = makeTemplateDef({
  code: '2gar', displayName: 'GAARA', title: 'Fifth Kazekage', jutsuName: 'Sand Coffin',
  supportType: 'GUARD', color: 0xb03a2e, runSpeed: 8.6, health: 1050, finisher: 'cma03', jutsuRange: 10,
});
export const KAKASHI_DEF = makeTemplateDef({
  code: '2kks', displayName: 'KAKASHI HATAKE', title: 'Copy Ninja', jutsuName: 'Lightning Blade',
  supportType: 'BALANCE', color: 0xc9c9c9, runSpeed: 9.6, finisher: 'cma03',
});
export const MINATO_DEF = makeTemplateDef({
  code: '2fou', displayName: 'MINATO NAMIKAZE', title: 'Fourth Hokage · Yellow Flash', jutsuName: 'Rasengan',
  supportType: 'ATTACK', color: 0xf5c542, runSpeed: 10.2, health: 950,
});
export const INDRA_DEF = makeTemplateDef({
  code: '9ind', displayName: 'INDRA OTSUTSUKI', title: 'Son of the Sage · Progenitor', jutsuName: 'Susano\'o Blade',
  supportType: 'ATTACK', color: 0x4b2e5a, runSpeed: 9.4, health: 1050, animBank: '2ssk', blade: false,
  portrait: 'assets/ui/player_9ind.png',
});

const art = (code: string) => ({ icon: `assets/ui/sel/icon_${code}.png`, stand: `assets/ui/sel/stand_${code}.png`, vsFace: `assets/ui/sel/vs_${code}.png` });
export const NARUTO_SEL: CharacterDef = { ...NARUTO_DEF, title: 'Hidden Leaf · Jinchuriki of the Nine-Tails', jutsuName: 'Rasengan', ...art('2nrt') };
export const SASUKE_SEL: CharacterDef = { ...SASUKE_DEF, title: 'Taka · Sharingan', jutsuName: 'Chidori', ...art('2ssk') };

/** Select-screen order (Storm 2 layout: heroes first, then the Shippuden roster). */
export const ROSTER: CharacterDef[] = [NARUTO_SEL, SASUKE_SEL, KAKASHI_DEF, MINATO_DEF, GAARA_DEF, ITACHI_DEF, DEIDARA_DEF, MIFUNE_DEF, INDRA_DEF];

export function findCharacter(code: string | null | undefined): CharacterDef | undefined {
  return ROSTER.find((d) => d.code === code);
}
