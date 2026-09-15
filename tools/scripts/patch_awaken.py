"""Session 9: awakened forms (second body + moveset from the parameter table's awakening entries)
and victim demo clips (the attacker's skl1_dmg / spl1_dmg retargeted onto the victim)."""
import os, re
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:120]; return s.replace(old, new, count)

# ---------------------------------------------------------------- types
rw('src/core/Types.ts', lambda s: rep(s, "  /** Awakened form description for the HUD / move list. */\n  awakenedName?: string;",
  "  /** Awakened form description for the HUD / move list. */\n  awakenedName?: string;\n  /** Full awakened definition (body, strings) swapped in while awakened. */\n  awakenedDef?: CharacterDef;\n  /** Voice bank to use when the code differs (awakened bodies keep the base voice). */\n  voiceCode?: string;"), 'awakenedDef')

# ---------------------------------------------------------------- roster: strings from an awakening prefix
def roster(s):
    s = rep(s, "export function stringsFromPrm(code: string, blade: boolean): { neutral: ComboStringDef; up: ComboStringDef; down: ComboStringDef; air: ComboStringDef | null } | null {\n  const table = PRM[code];\n  if (!table) return null;\n  const by = new Map(table.entries.map((e) => [e.anm, e]));",
    """export function stringsFromPrm(code: string, blade: boolean, clipPrefix?: string): { neutral: ComboStringDef; up: ComboStringDef; down: ComboStringDef; air: ComboStringDef | null } | null {
  const raw = PRM[code];
  if (!raw) return null;
  // Base moveset = entries whose clip carries the character code without an awakening infix;
  // an awakened moveset = entries whose clip starts with the awakening prefix (2nrvawa…, 2garaws…).
  const table = { entries: raw.entries.filter((e) => (clipPrefix ? e.clip.startsWith(clipPrefix) : !/^.{4}aw[as]/.test(e.clip))) };
  const by = new Map(table.entries.map((e) => [e.anm, e]));""")
    # awakened def builder + wiring for the roster
    s = rep(s, "\nconst art = (code: string) =>", """
/** Awakened form: a second body (`awCode`.glb, may equal the base) with the awakening moveset. */
export function awakenedFor(def: CharacterDef, awCode: string, prefix: string, name: string): CharacterDef {
  const st = stringsFromPrm(def.code, def.hasBlade, prefix);
  const aw: CharacterDef = {
    ...def, code: awCode, glbPath: `assets/${awCode}.glb`, voiceCode: def.voiceCode ?? def.code, awakenedDef: undefined, awakenedCode: undefined, animBank: undefined,
    displayName: def.displayName, title: name,
    neutralString: st?.neutral ?? def.neutralString, upString: st?.up ?? def.upString, downString: st?.down ?? def.downString, airString: st?.air ?? def.airString,
  };
  return aw;
}
function withAwakening(def: CharacterDef, awCode: string, prefix: string, name: string): CharacterDef {
  return { ...def, awakenedCode: awCode, awakenedName: name, awakenedDef: awakenedFor(def, awCode, prefix, name) };
}

const art = (code: string) =>""")
    s = rep(s, "export const ROSTER: CharacterDef[] = [NARUTO_SEL, SASUKE_SEL,", "export const ROSTER: CharacterDef[] = [withAwakening(NARUTO_SEL, '2nrv', '2nrvawa', 'Nine-Tails Chakra Mode'), withAwakening(SASUKE_SEL, '2ssv', '2ssvawa', 'Curse Mark: Second State'),")
    s = s.replace("GAARA_DEF, LEE_DEF,", "withAwakening(GAARA_DEF, '2gar', '2garaws', 'Shukaku Arms'), LEE_DEF,")
    s = s.replace("ITACHI_DEF, KISAME_DEF, DEIDARA_DEF,", "withAwakening(ITACHI_DEF, '2itc', '2itcaws', 'Susano\\'o'), KISAME_DEF, withAwakening(DEIDARA_DEF, '2ddr', '2ddrawa', 'C4 Karura'),")
    return s
rw('src/combat/Roster.ts', roster, 'awakenedFor')

# ---------------------------------------------------------------- fighter: mutable def + second rig
def fighter(s):
    s = rep(s, "  constructor(public readonly def: CharacterDef, public input: InputManager) {\n    this.rig = new FighterRig(def);\n  }",
    """  /** The definition in force (swapped to `awakenedDef` while awakened). */
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
  }""")
    return s
rw('src/combat/Fighter.ts', fighter, 'setAwakenedForm')

# ---------------------------------------------------------------- FSM: swap on awaken / end, victim demo clips
def fsm(s):
    s = rep(s, "      f.awakened = true;\n      f.awakenTimer = AWAKEN_DURATION;", "      f.awakened = true;\n      f.awakenTimer = AWAKEN_DURATION;\n      f.setAwakenedForm(true);")
    s = rep(s, "        f.awakened = false;\n        f.rig.setAwakened(false);", "        f.awakened = false;\n        f.rig.setAwakened(false);\n        f.setAwakenedForm(false);")
    # jutsu demo victim clip
    s = rep(s, """        t.enterState(CombatState.HITSTUN);
        t.stunFrames = frames + 10;
        t.hitstopFrames = 0;
        this.events.emit('JUTSU',""", """        t.enterState(CombatState.HITSTUN);
        t.stunFrames = frames + 10;
        t.hitstopFrames = 0;
        this.victimDemoClip(t, `${f.def.code}skl1_dmg1`, frames);
        this.events.emit('JUTSU',""")
    s = rep(s, """        t.enterState(CombatState.HITSTUN);
        t.stunFrames = frames + 10;
        this.events.emit('ULTIMATE',""", """        t.enterState(CombatState.HITSTUN);
        t.stunFrames = frames + 10;
        this.victimDemoClip(t, `${f.def.code}spl1_dmg`, frames);
        this.events.emit('ULTIMATE',""")
    # keep the victim clip scrubbing with the attacker's demo
    s = rep(s, "    if (t) {\n      t.hitstopFrames = Math.max(t.hitstopFrames, 2);\n      t.invulnFrames = 2;\n      t.velocity.set(0, 0, 0);\n      t.flashTimer = 0;\n    }\n    if (f.moveFrame >= move.totalFrames) {\n      f.cinematic = false;",
               "    if (t) {\n      t.hitstopFrames = Math.max(t.hitstopFrames, 2);\n      t.invulnFrames = 2;\n      t.velocity.set(0, 0, 0);\n      t.flashTimer = 0;\n      if (t.currentMove) t.moveFrame = f.moveFrame;\n    }\n    if (f.moveFrame >= move.totalFrames) {\n      f.cinematic = false;")
    s = rep(s, "      if (t) {\n        t.hitstopFrames = Math.max(t.hitstopFrames, 2);\n        t.invulnFrames = 2;\n        t.velocity.set(0, 0, 0);\n        t.flashTimer = 0; // hitstop skips the tick that fades the hit flash\n      }",
               "      if (t) {\n        t.hitstopFrames = Math.max(t.hitstopFrames, 2);\n        t.invulnFrames = 2;\n        t.velocity.set(0, 0, 0);\n        t.flashTimer = 0; // hitstop skips the tick that fades the hit flash\n        if (t.currentMove) t.moveFrame = f.moveFrame;\n      }")
    s = rep(s, "  /** Jutsu demo: attacker rooted on the demo clip, victim frozen in frame, launched on the last frame. */",
    """  /** Play the attacker's victim clip on the held target when it was retargeted onto their rig. */
  private victimDemoClip(t: Fighter, clip: string, frames: number): void {
    if (!t.rig.hasClip(clip)) return;
    t.beginMove({ ...t.def.jutsu, name: 'demo_dmg', clip, totalFrames: frames, hitboxes: [] }, 'NEUTRAL', 0);
    t.moveFrame = 0;
  }

  /** Jutsu demo: attacker rooted on the demo clip, victim frozen in frame, launched on the last frame. */""")
    return s
rw('src/combat/CombatStateMachine.ts', fsm, 'victimDemoClip')

# ---------------------------------------------------------------- bindings: hitstun plays the demo clip when given
rw('src/combat/StormStates.ts', lambda s: rep(s, """    case CombatState.HITSTUN:
      return {""", """    case CombatState.HITSTUN:
      if (ctx.moveClip && /(skl1|spl1)_dmg/.test(ctx.moveClip))
        return { act: 'PL_ACT_DMG_DEMO', anm: 'PL_ANM_SKILL_1_DEMO_DMG1', clips: [O(ctx.moveClip), O('1cmndmg0'), O('{c}dmg0f')] };
      return {"""), 'PL_ACT_DMG_DEMO')

# ---------------------------------------------------------------- rig: import demo clips from another character
def rig(s):
    s = rep(s, "      if (RIG_RAMP.texture) setRamp(scene, RIG_RAMP.texture, RIG_RAMP.row);\n", """      this.retargetFn = retarget;
      for (const from of this.pendingDemoBanks) this.importDemoClips(from);
      this.pendingDemoBanks.length = 0;
      if (RIG_RAMP.texture) setRamp(scene, RIG_RAMP.texture, RIG_RAMP.row);
""")
    s = rep(s, "  private smearVec = new THREE.Vector3();", """  private retargetFn: ((bank: THREE.AnimationClip[], from: string, rename: (n: string) => string, overwrite: boolean) => void) | null = null;
  private pendingDemoBanks: string[] = [];
  /** Retarget another character's victim clips (skl1_dmg*, spl1_dmg) onto this rig, names kept. */
  importDemoClips(fromCode: string): void {
    if (fromCode === this.def.code) return;
    if (!this.retargetFn) { this.pendingDemoBanks.push(fromCode); return; }
    const fn = this.retargetFn;
    loadAnimBank(`assets/${fromCode}.glb`).then((bank) => fn(bank.filter((c) => /(skl1|spl1)_dmg/.test(c.name)), fromCode, (n) => n, false));
  }

  private smearVec = new THREE.Vector3();""")
    return s
rw('src/render/FighterRig.ts', rig, 'importDemoClips')

# ---------------------------------------------------------------- main: second rigs in the scene, demo banks, voice code
def main(s):
    s = rep(s, """    for (const f of this.allFighters) {
      this.scene.add(f.rig.root);
      this.controllers.set(f, new PlayerController(f, this.fsm, this.arena));
      f.rig.tryLoadGlb().then((ok) => {
        if (ok) { this.log(`${f.def.code}: GLB rig bound`); this.applyStageLight(f); }
      });
    }""", """    for (const f of this.allFighters) {
      this.scene.add(f.rig.root);
      this.controllers.set(f, new PlayerController(f, this.fsm, this.arena));
      f.rig.tryLoadGlb().then((ok) => {
        if (ok) { this.log(`${f.def.code}: GLB rig bound`); this.applyStageLight(f); }
      });
      if (f.awRig) {
        this.scene.add(f.awRig.root);
        f.awRig.tryLoadGlb().then((ok) => { if (ok) { this.log(`${f.def.awakenedCode}: awakened rig bound`); const L = LIGHTS[STAGES[this.stageIndex]?.light ?? 'day'] ?? LIGHTS.day; f.awRig?.setLighting(L.sun, L.ambient, L.rim, this.lightDir); } });
      }
    }
    // Victim demo clips: every fighter learns the opposing leaders' skl1_dmg / spl1_dmg clips.
    for (const f of this.allFighters) for (const o of this.allFighters) if (o.team !== f.team) f.rig.importDemoClips(o.def.animBank ?? o.def.code);""")
    s = rep(s, "      const code = f.def.animBank && !f.def.jutsuSfx ? f.def.animBank : f.def.code;", "      const code = f.def.voiceCode ?? (f.def.animBank && !f.def.jutsuSfx ? f.def.animBank : f.def.code);")
    s = rep(s, "        if (victim) this.audio.voice(victim.def.code === '9ind' ? '2ssk' : victim.def.code,", "        if (victim) this.audio.voice(victim.def.voiceCode ?? (victim.def.code === '9ind' ? '2ssk' : victim.def.code),")
    return s
rw('src/main.ts', main, 'importDemoClips')
print('ok')
