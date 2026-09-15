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
import { CharacterDef, ComboStringDef, HitPriority, HitReaction, HitboxDef, JutsuProjectile, MoveDef, SupportType } from '../core/Types';
import { NARUTO_DEF, SASUKE_DEF, SOCKET } from './CharacterDefs';
import { PRM, PrmEntry, PrmHit } from './PrmData';

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
  ultimateName?: string;
  jutsuSfx?: string;
  ultimateSfx?: string;
  projectile?: JutsuProjectile;
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

// ---------------------------------------------------------------------------------------------
// Storm 4 parameter tables → engine moves. Bone → socket, DAMAGE_ID → reaction, 30 fps → 60 Hz.
// ---------------------------------------------------------------------------------------------
function socketForBone(bone: string, blade: boolean): { socket: string; socketEnd?: string; radius?: number } {
  const b = bone.toLowerCase();
  if (blade && /r hand|r arm|weapon|sword|ksng|trall|blade|katana|saber/.test(b)) return { socket: SOCKET.BLADE_BASE, socketEnd: SOCKET.BLADE_TIP, radius: 0.35 };
  if (/l hand|l forearm|l arm/.test(b)) return { socket: SOCKET.L_HAND };
  if (/r hand|r forearm|r arm/.test(b)) return { socket: SOCKET.R_HAND };
  if (/l foot|l toe|l leg|l calf/.test(b)) return { socket: SOCKET.L_FOOT };
  if (/r foot|r toe|r leg|r calf/.test(b)) return { socket: SOCKET.R_FOOT };
  if (/head/.test(b)) return { socket: SOCKET.HEAD };
  return { socket: SOCKET.CHEST };
}

function reactionFor(dmg: string): { reaction: HitReaction; launch: number; knockback: number; hitstun: number } {
  if (/SMASH_DOWN/.test(dmg)) return { reaction: HitReaction.SPIKE, launch: -16, knockback: 3, hitstun: 40 };
  if (/SMASH_UP|RISE|LOWER_TO_UPPER_LAUNCH/.test(dmg)) return { reaction: HitReaction.LAUNCH, launch: 12.5, knockback: 2.5, hitstun: 45 };
  if (/SMASH_SIDE|BOUND|LARGE|ROT/.test(dmg)) return { reaction: HitReaction.KNOCKBACK, launch: 5.5, knockback: 16, hitstun: 42 };
  if (/GUARDBREAK/.test(dmg)) return { reaction: HitReaction.STAGGER, launch: 0, knockback: 4, hitstun: 24 };
  return { reaction: HitReaction.STAGGER, launch: 0, knockback: 3, hitstun: 18 };
}

/** One engine move from a parameter entry: hit windows from the records, length from the clip. */
function moveFromPrm(code: string, e: PrmEntry, blade: boolean, name: string, extra: Partial<MoveDef> = {}): MoveDef {
  const hits = [...e.hits].sort((a, b) => a.start - b.start);
  const last = e.hits.some((h) => /SMASH|RISE/.test(h.dmg));
  const boxes: HitboxDef[] = hits.map((h: PrmHit, i) => {
    const next = hits[i + 1];
    const end = next ? Math.max(h.start + 2, Math.min(next.start - 1, h.start + 8)) : Math.min(e.frames - 2, h.start + 6);
    const r = reactionFor(h.dmg);
    const sock = socketForBone(h.bone, blade);
    return hb({
      id: `${code}_${e.anm.toLowerCase()}_${i}`,
      activeStart: Math.max(1, h.start), activeEnd: Math.max(h.start + 1, end),
      damage: Math.max(10, h.damage || 40),
      radius: sock.radius ?? Math.min(1.3, Math.max(0.45, h.radius * 0.7)),
      reaction: r.reaction, launch: r.launch, knockback: r.knockback * Math.max(0.6, Math.min(1.6, h.power / 3)), hitstunFrames: r.hitstun,
      blockstunFrames: r.reaction === HitReaction.STAGGER ? 10 : 16, guardDamage: r.reaction === HitReaction.STAGGER ? 8 : 18,
      ...sock,
    });
  });
  const total = Math.max(14, e.frames);
  const firstStart = boxes.length ? boxes[0].activeStart : Math.floor(total * 0.3);
  return move({
    name, clip: e.clip, totalFrames: total,
    // Follow-ups accept input from the first hit's start; the string cancels out near the end.
    cancelStart: Math.max(4, Math.floor(firstStart * 0.9)), cancelEnd: total - 2,
    sparkCancelStart: Math.max(3, firstStart - 2), sparkCancelEnd: total - 1,
    forwardStep: last ? 4.5 : 3.0,
    hitboxes: boxes,
    ...extra,
  });
}

/** Strings derived from the table: ATK00-02 (+ the first SMASH finisher) = neutral, RISE entries = up,
 *  the tilt entries = down, ATK_AIR00.. = air. Returns null when the table has no usable ground string. */
export function stringsFromPrm(code: string, blade: boolean): { neutral: ComboStringDef; up: ComboStringDef; down: ComboStringDef; air: ComboStringDef | null } | null {
  const table = PRM[code];
  if (!table) return null;
  const by = new Map(table.entries.map((e) => [e.anm, e]));
  const get = (n: string) => by.get(n);
  const mk = (n: string, e: PrmEntry | undefined) => (e ? moveFromPrm(code, e, blade, `${code}_${n}`) : null);
  const base = [get('ATK00'), get('ATK01'), get('ATK02')].filter((e): e is PrmEntry => !!e && e.hits.length > 0);
  if (base.length < 2) return null;
  const finishers = table.entries.filter((e) => /^ATK(0[3-9]|1[0-9])$/.test(e.anm) && e.hits.some((h) => /SMASH_SIDE|SMASH_UP|BOUND/.test(h.dmg)));
  const launchers = table.entries.filter((e) => /^ATK(0[3-9]|1[0-9])$/.test(e.anm) && e.hits.some((h) => /RISE/.test(h.dmg)) && !finishers.includes(e));
  const tilts = table.entries.filter((e) => /^ATK(0[3-9]|1[0-9])$/.test(e.anm) && e.hits.length > 0 && !finishers.includes(e) && !launchers.includes(e));
  const neutralMoves = base.map((e, i) => mk(`n${i}`, e)!);
  if (finishers[0]) neutralMoves.push(mk('n3', finishers[0])!);
  const upMoves = launchers.slice(0, 2).map((e, i) => mk(`u${i}`, e)!);
  const downMoves = tilts.slice(0, 2).map((e, i) => mk(`d${i}`, e)!);
  const airEntries = ['ATK_AIR00', 'ATK_AIR01', 'ATK_AIR02', 'ATK_AIR03', 'ATK_AIR04'].map(get).filter((e): e is PrmEntry => !!e && e.hits.length > 0);
  const airMoves = airEntries.slice(0, 4).map((e, i) => mk(`a${i}`, e)!);
  const neutral: ComboStringDef = { branch: 'NEUTRAL', moves: neutralMoves };
  const up: ComboStringDef = { branch: 'UP', moves: upMoves.length ? upMoves : neutralMoves.slice(0, 2) };
  const down: ComboStringDef = { branch: 'DOWN', moves: downMoves.length ? downMoves : neutralMoves.slice(0, 2) };
  const air: ComboStringDef | null = airMoves.length ? { branch: 'AIR', moves: airMoves } : null;
  // Guarantee the up string launches and the air string spikes, as Storm does.
  const lastUp = up.moves[up.moves.length - 1]?.hitboxes[0];
  if (lastUp && lastUp.reaction === HitReaction.STAGGER) { lastUp.reaction = HitReaction.LAUNCH; lastUp.launch = 12.5; lastUp.hitstunFrames = 45; }
  if (air) { const la = air.moves[air.moves.length - 1].hitboxes; for (const h of la) { h.reaction = HitReaction.SPIKE; h.launch = -16; } }
  return { neutral, up, down, air };
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
  // Aerial string (○ in the air): cmr clips where the character has them, else the ground string's
  // first hits; the last hit spikes the enemy to the ground.
  const air: ComboStringDef = {
    branch: 'AIR',
    moves: [
      move({ name: `${c}_air1`, clip: clip('cmr00'), totalFrames: 20, forwardStep: 1.5, hitboxes: [hb({ id: `${c}a1`, activeStart: 5, activeEnd: 10, damage: 34, ...sock(SOCKET.R_HAND) })] }),
      move({ name: `${c}_air2`, clip: clip('cmr01'), totalFrames: 20, forwardStep: 1.5, hitboxes: [hb({ id: `${c}a2`, activeStart: 5, activeEnd: 10, damage: 34, ...sock(SOCKET.L_HAND) })] }),
      move({ name: `${c}_air3`, clip: clip('cmr02'), totalFrames: 26, forwardStep: 1.0, hitboxes: [hb({ id: `${c}a3`, activeStart: 7, activeEnd: 12, damage: 70, reaction: HitReaction.SPIKE, knockback: 3.0, launch: -16.0, hitstunFrames: 40, ...sock(SOCKET.R_FOOT) })] }),
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
  const fromPrm = stringsFromPrm(bank, !!o.blade);
  if (fromPrm && bank !== c) {
    // Borrowed bank (Indra ← Sasuke): the retargeted clips carry this character's code.
    for (const st of [fromPrm.neutral, fromPrm.up, fromPrm.down, fromPrm.air]) if (st) for (const m of st.moves) { m.clip = m.clip.replace(bank, c); m.name = m.name.replace(bank, c); }
  }
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
    neutralString: fromPrm?.neutral ?? neutral,
    upString: fromPrm?.up ?? up,
    downString: fromPrm?.down ?? down,
    jutsu,
    airString: fromPrm?.air ?? air,
    ultimateName: o.ultimateName,
    ultimateClip: `${bank}spl1_s`,
    jutsuSfx: o.jutsuSfx,
    ultimateSfx: o.ultimateSfx,
    jutsuProjectile: o.projectile,
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
  ultimateName: 'C2: Dragon', jutsuSfx: 'senko', ultimateSfx: 'exp2',
  projectile: { color: 0xf4f0d8, sprite: 'magic', speed: 17, damage: 190, radius: 0.8, height: 1.4, launchSfx: 'shuriken', hitSfx: 'exp2', life: 2.6 },
});
export const MIFUNE_DEF = makeTemplateDef({
  code: '3mfn', displayName: 'MIFUNE', title: 'Land of Iron · Samurai General', jutsuName: 'Iai: Lightning-Speed Slash',
  supportType: 'ATTACK', color: 0xd8d0c0, runSpeed: 9.4, blade: true, finisher: 'cmb03',
  ultimateName: 'Samurai Sabre Technique', jutsuSfx: 'sword_swing', ultimateSfx: 'sword_hit',
});
export const ITACHI_DEF = makeTemplateDef({
  code: '2itc', displayName: 'ITACHI UCHIHA', title: 'Akatsuki · Sharingan', jutsuName: 'Fire Style: Great Fireball',
  supportType: 'ATTACK', color: 0x2a2a3a, runSpeed: 9.2, finisher: 'cma03', jutsuRange: 11,
  ultimateName: 'Amaterasu', jutsuSfx: 'goukakyu', ultimateSfx: 'exp2',
  projectile: { color: 0xff7a1a, sprite: 'flame', speed: 20, damage: 210, radius: 1.1, height: 1.2, launchSfx: 'goukakyu', hitSfx: 'fireHit' },
});
export const GAARA_DEF = makeTemplateDef({
  code: '2gar', displayName: 'GAARA', title: 'Fifth Kazekage', jutsuName: 'Sand Coffin',
  supportType: 'GUARD', color: 0xb03a2e, runSpeed: 8.6, health: 1050, finisher: 'cma03', jutsuRange: 10,
  ultimateName: 'Sand Tsunami', jutsuSfx: 'gar_sand2', ultimateSfx: 'gar_sandHit',
  projectile: { color: 0xd9c48a, sprite: 'dirt', speed: 14, damage: 200, radius: 1.3, height: 0.5, launchSfx: 'gar_sand2', hitSfx: 'gar_sandHit', life: 2.4 },
});
export const KAKASHI_DEF = makeTemplateDef({
  code: '2kks', displayName: 'KAKASHI HATAKE', title: 'Copy Ninja', jutsuName: 'Lightning Blade',
  supportType: 'BALANCE', color: 0xc9c9c9, runSpeed: 9.6, finisher: 'cma03',
  ultimateName: 'Lightning Blade: Double', jutsuSfx: 'raikiri', ultimateSfx: 'raikiriHit',
});
export const MINATO_DEF = makeTemplateDef({
  code: '2fou', displayName: 'MINATO NAMIKAZE', title: 'Fourth Hokage · Yellow Flash', jutsuName: 'Rasengan',
  supportType: 'ATTACK', color: 0xf5c542, runSpeed: 10.2, health: 950,
  ultimateName: 'Flying Thunder God: Level 2', jutsuSfx: 'rasen', ultimateSfx: 'rasen2',
});
export const INDRA_DEF = makeTemplateDef({
  code: '9ind', displayName: 'INDRA OTSUTSUKI', title: 'Son of the Sage · Progenitor', jutsuName: 'Susano\'o Blade',
  supportType: 'ATTACK', color: 0x4b2e5a, runSpeed: 9.4, health: 1050, animBank: '2ssk', blade: false,
  portrait: 'assets/ui/player_9ind.png', ultimateName: "Susano'o: Sword of Indra", jutsuSfx: 'adv_chidori', ultimateSfx: 'raikiriHit',
});

const art = (code: string) => ({ icon: `assets/ui/sel/icon_${code}.png`, stand: `assets/ui/sel/stand_${code}.png`, vsFace: `assets/ui/sel/vs_${code}.png` });
const airFor = (code: string): ComboStringDef => makeTemplateDef({ code, displayName: code, title: '', jutsuName: '', supportType: 'BALANCE', color: 0xffffff }).airString!;
const nrtPrm = stringsFromPrm('2nrt', false);
const sskPrm = stringsFromPrm('2ssk', true);
export const NARUTO_SEL: CharacterDef = { ...NARUTO_DEF, title: 'Hidden Leaf · Jinchuriki of the Nine-Tails', jutsuName: 'Rasengan', ...art('2nrt'), airString: nrtPrm?.air ?? airFor('2nrt'), ...(nrtPrm ? { neutralString: nrtPrm.neutral, upString: nrtPrm.up, downString: nrtPrm.down } : {}), ultimateName: 'Giant Rasengan', ultimateClip: '2nrtspl1_s', jutsuSfx: 'rasen', ultimateSfx: 'rasen2' };
export const SASUKE_SEL: CharacterDef = { ...SASUKE_DEF, title: 'Taka · Sharingan', jutsuName: 'Chidori', ...art('2ssk'), airString: sskPrm?.air ?? airFor('2ssk'), ...(sskPrm ? { neutralString: sskPrm.neutral, upString: sskPrm.up, downString: sskPrm.down } : {}), ultimateName: 'Kirin', ultimateClip: '2sskspl1_s', jutsuSfx: 'adv_chidori', ultimateSfx: 'raikiriHit' };

/** Select-screen order (Storm 2 layout: heroes first, then the Shippuden roster). */
export const ROSTER: CharacterDef[] = [NARUTO_SEL, SASUKE_SEL, KAKASHI_DEF, MINATO_DEF, GAARA_DEF, ITACHI_DEF, DEIDARA_DEF, MIFUNE_DEF, INDRA_DEF];

export function findCharacter(code: string | null | undefined): CharacterDef | undefined {
  return ROSTER.find((d) => d.code === code);
}
