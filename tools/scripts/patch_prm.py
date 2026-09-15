"""Drive every moveset from the Storm 4 parameter tables (PrmData.ts): ground string from the ATK
entries (cmb clips), air string from ATK_AIR (cma clips), up/down branches from the launcher /
tilt entries, hit frames / damage / radius / reaction per hit record."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:100]; return s.replace(old, new, count)

def roster(s):
    s = rep(s, "import { NARUTO_DEF, SASUKE_DEF, SOCKET } from './CharacterDefs';",
               "import { NARUTO_DEF, SASUKE_DEF, SOCKET } from './CharacterDefs';\nimport { PRM, PrmEntry, PrmHit } from './PrmData';")
    s = rep(s, """export function makeTemplateDef(o: TemplateOpts): CharacterDef {
  const c = o.code;
  const bank = o.animBank ?? c;
  const clip = (suffix: string) => `${bank}${suffix}`;""", """// ---------------------------------------------------------------------------------------------
// Storm 4 parameter tables → engine moves. Bone → socket, DAMAGE_ID → reaction, 30 fps → 60 Hz.
// ---------------------------------------------------------------------------------------------
function socketForBone(bone: string, blade: boolean): { socket: string; socketEnd?: string; radius?: number } {
  const b = bone.toLowerCase();
  if (blade && /r hand|r arm|weapon|sword/.test(b)) return { socket: SOCKET.BLADE_BASE, socketEnd: SOCKET.BLADE_TIP, radius: 0.35 };
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
  const clip = (suffix: string) => `${bank}${suffix}`;""")
    # use prm strings when available
    s = rep(s, """  return {
    code: c,
    displayName: o.displayName,
    title: o.title,
    jutsuName: o.jutsuName,""", """  const fromPrm = stringsFromPrm(bank, !!o.blade);
  if (fromPrm && bank !== c) {
    // Borrowed bank (Indra ← Sasuke): the retargeted clips carry this character's code.
    for (const st of [fromPrm.neutral, fromPrm.up, fromPrm.down, fromPrm.air]) if (st) for (const m of st.moves) { m.clip = m.clip.replace(bank, c); m.name = m.name.replace(bank, c); }
  }
  return {
    code: c,
    displayName: o.displayName,
    title: o.title,
    jutsuName: o.jutsuName,""")
    s = rep(s, """    neutralString: neutral,
    upString: up,
    downString: down,
    jutsu,
    airString: air,""", """    neutralString: fromPrm?.neutral ?? neutral,
    upString: fromPrm?.up ?? up,
    downString: fromPrm?.down ?? down,
    jutsu,
    airString: fromPrm?.air ?? air,""")
    # Naruto / Sasuke: use the table too
    s = rep(s, """export const NARUTO_SEL: CharacterDef = { ...NARUTO_DEF, title: 'Hidden Leaf · Jinchuriki of the Nine-Tails', jutsuName: 'Rasengan', ...art('2nrt'), airString: airFor('2nrt'), ultimateName: 'Giant Rasengan', ultimateClip: '2nrtspl1_s', jutsuSfx: 'rasen', ultimateSfx: 'rasen2' };
export const SASUKE_SEL: CharacterDef = { ...SASUKE_DEF, title: 'Taka · Sharingan', jutsuName: 'Chidori', ...art('2ssk'), airString: airFor('2ssk'), ultimateName: 'Kirin', ultimateClip: '2sskspl1_s', jutsuSfx: 'adv_chidori', ultimateSfx: 'raikiriHit' };""",
"""const nrtPrm = stringsFromPrm('2nrt', false);
const sskPrm = stringsFromPrm('2ssk', true);
export const NARUTO_SEL: CharacterDef = { ...NARUTO_DEF, title: 'Hidden Leaf · Jinchuriki of the Nine-Tails', jutsuName: 'Rasengan', ...art('2nrt'), airString: nrtPrm?.air ?? airFor('2nrt'), ...(nrtPrm ? { neutralString: nrtPrm.neutral, upString: nrtPrm.up, downString: nrtPrm.down } : {}), ultimateName: 'Giant Rasengan', ultimateClip: '2nrtspl1_s', jutsuSfx: 'rasen', ultimateSfx: 'rasen2' };
export const SASUKE_SEL: CharacterDef = { ...SASUKE_DEF, title: 'Taka · Sharingan', jutsuName: 'Chidori', ...art('2ssk'), airString: sskPrm?.air ?? airFor('2ssk'), ...(sskPrm ? { neutralString: sskPrm.neutral, upString: sskPrm.up, downString: sskPrm.down } : {}), ultimateName: 'Kirin', ultimateClip: '2sskspl1_s', jutsuSfx: 'adv_chidori', ultimateSfx: 'raikiriHit' };""")
    return s
rw('src/combat/Roster.ts', roster, 'stringsFromPrm')
print('ok')
