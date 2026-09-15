"""Session 10 presentation: per-character chakra effects (ElementFX) everywhere the generic auras /
chidori / rasengan were used, muted attract match, smear only on attacks and specials, slower and
smoother combo camera, round intro camera with staggered entries, victory pose outro, watchdog."""
import os, re
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:120]; return s.replace(old, new, count)

# ------------------------------------------------------------------------------------ Effects hosts ElementFX
def effects(s):
    s = rep(s, "import * as THREE from 'three';", "import * as THREE from 'three';\nimport { ElementFX } from './ElementFX';")
    s = rep(s, "export class Effects {\n  readonly group = new THREE.Group();", "export class Effects {\n  readonly group = new THREE.Group();\n  /** Character-specific chakra effects (procedural shaders). */\n  readonly el: ElementFX = new ElementFX(this);")
    s = rep(s, "  update(dt: number): void {\n    this.updateGround(dt);", "  update(dt: number): void {\n    this.updateGround(dt);\n    this.el.update(dt);")
    return s
rw('src/render/Effects.ts', effects, 'new ElementFX(this)')

# ------------------------------------------------------------------------------------ Roster: who each character is
def roster(s):
    s = rep(s, "import { CharacterDef, ComboStringDef,", "import { CharacterDef, ElementKind, ComboStringDef,")
    s = rep(s, "\nexport function findCharacter(", """
/**
 * Chakra nature per character (what their jutsu actually are in the series), used by ElementFX:
 * Naruto / Minato / Jiraiya — Rasengan (wind-swirl chakra); Sasuke / Kakashi — Chidori / Lightning
 * Blade; Itachi / Tobi — Fire Style (Itachi's ultimate: Amaterasu); Gaara — sand; Deidara —
 * explosive clay; Kisame / Suigetsu — water; Neji / Hinata — Gentle Fist; Tsunade / Sakura —
 * chakra-enhanced strength; Lee / Guy — pure taijutsu (Guy's Morning Peacock burns); Orochimaru —
 * snakes / poison; Pain — Almighty Push; Hidan / Mifune / Killer Bee — blades (Bee's lariat is
 * raw strength); Kabuto — chakra scalpel; Indra — dark Susano'o lightning.
 */
const CHAKRA: Record<string, { element: ElementKind; chakraColor: number; ultElement?: ElementKind }> = {
  '2nrt': { element: 'wind', chakraColor: 0x6fd0ff },
  '2nrv': { element: 'wind', chakraColor: 0xff8a2a },
  '2ssk': { element: 'lightning', chakraColor: 0x9cc4ff },
  '2ssv': { element: 'dark', chakraColor: 0x8a5cff, ultElement: 'lightning' },
  '2skr': { element: 'strength', chakraColor: 0xff8ac8 },
  '2kks': { element: 'lightning', chakraColor: 0xd8f0ff },
  '2fou': { element: 'wind', chakraColor: 0x7dd3ff, ultElement: 'lightning' },
  '2jry': { element: 'wind', chakraColor: 0x8ad8ff, ultElement: 'fire' },
  '2tnd': { element: 'strength', chakraColor: 0x8affb4 },
  '2orc': { element: 'poison', chakraColor: 0x9a5cff },
  '2gar': { element: 'sand', chakraColor: 0xd9c48a },
  '2roc': { element: 'taijutsu', chakraColor: 0x9dff70 },
  '2nej': { element: 'gentle', chakraColor: 0x9fd8ff },
  '2hnt': { element: 'gentle', chakraColor: 0xa8b0ff },
  '2guy': { element: 'taijutsu', chakraColor: 0xff6a3c, ultElement: 'fire' },
  '2itc': { element: 'fire', chakraColor: 0xff4a2a, ultElement: 'dark' },
  '2ksm': { element: 'water', chakraColor: 0x4cc8e8, ultElement: 'water' },
  '2ddr': { element: 'explosion', chakraColor: 0xf2e6b0 },
  '2hdn': { element: 'blade', chakraColor: 0xd02030 },
  '2tob': { element: 'fire', chakraColor: 0xff8c1a },
  '2pea': { element: 'push', chakraColor: 0xffc890 },
  '2klb': { element: 'strength', chakraColor: 0xffd040, ultElement: 'blade' },
  '2kbt': { element: 'scalpel', chakraColor: 0x7dffb0 },
  '2sgt': { element: 'water', chakraColor: 0x6ad8ff },
  '3mfn': { element: 'blade', chakraColor: 0xe8f4ff, ultElement: 'lightning' },
  '9ind': { element: 'dark', chakraColor: 0x9a6aff },
};
for (const d of ROSTER) {
  Object.assign(d, CHAKRA[d.code] ?? {});
  if (d.awakenedDef) Object.assign(d.awakenedDef, CHAKRA[d.awakenedDef.code] ?? CHAKRA[d.code] ?? {});
}

export function findCharacter(""")
    return s
rw('src/combat/Roster.ts', roster, 'const CHAKRA:')

# ------------------------------------------------------------------------------------ FSM visuals
def fsm(s):
    s = rep(s, "    if (f.stateFrame % 4 === 0) this.effects.chargeAura(f.position, f.def.code === '2nrt' ? 0x7dd3ff : 0x9fb7ff);",
               "    if (f.stateFrame % 6 === 0) this.effects.el.aura(f.def.element ?? 'wind', f.position.clone().setY(f.groundY), f.def.chakraColor ?? 0x7dd3ff, 0.8);")
    s = rep(s, "    if (f.chargeVfxTick++ % 2 === 0) this.effects.chargeAura(f.position, f.def.code === '2nrt' ? 0xffb347 : 0x9fb7ff);",
               "    if (f.chargeVfxTick++ % 5 === 0) this.effects.el.aura(f.def.element ?? 'wind', f.position.clone().setY(f.groundY), f.def.chakraColor ?? 0x7dd3ff, 0.6);")
    s = rep(s, "      if (f.moveFrame % 3 === 0) { const p = f.position.clone(); p.y += 0.9; this.effects.chargeAura(p, f.def.color as number); }",
               "      if (f.moveFrame % 5 === 0) this.effects.el.aura(f.def.ultElement ?? f.def.element ?? 'wind', f.position.clone().setY(f.groundY), f.def.chakraColor ?? (f.def.color as number), 1.2);")
    s = rep(s, "      if (f.moveFrame % 3 === 0) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.spriteBurst('magic', this.tmpB, { color: col, count: 2, size: 0.9, life: 0.35, speed: 1.2, up: 1.2, additive: true, spin: 4, spread: 0.5, fadeIn: 0.15 }); }",
               "      { const ue = f.def.ultElement ?? f.def.element ?? 'wind'; f.rig.socketWorld(SOCKET.R_HAND, this.tmpB); this.effects.el.hold(`${f.id}:ult`, ue, this.tmpB, f.def.chakraColor ?? col, 1.6); if (f.moveFrame % 8 === 0) this.effects.el.aura(ue, f.position.clone().setY(f.groundY), f.def.chakraColor ?? col, 1.4); }")
    s = rep(s, "this.effects.clashBurst(this.tmpB); this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: f.def.ultimateSfx ?? 'exp2' }); }",
               "this.effects.clashBurst(this.tmpB); this.effects.el.impact(f.def.ultElement ?? f.def.element ?? 'wind', t ? t.position.clone().setY(t.position.y + 1) : this.tmpB.clone(), f.def.chakraColor ?? col, 2.4, t?.groundY ?? f.groundY); this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: f.def.ultimateSfx ?? 'exp2' }); }")
    s = rep(s, "this.effects.spriteBurst('light', this.tmpB, { color: f.def.color as number, count: 1, size: 1.6, life: 0.25, speed: 0, up: 0, additive: true, grow: 2 });",
               "this.effects.el.hold(`${f.id}:rush`, f.def.ultElement ?? f.def.element ?? 'wind', this.tmpB, f.def.chakraColor ?? (f.def.color as number), 1.3);")
    s = s.replace("if (f.moveFrame % 2 === 0) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.el.hold(", "{ f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.el.hold(")
    s = rep(s, "{ const p = f.position.clone(); p.y += 0.9; this.effects.chargeAura(p, 0xff7a1a); }",
               "this.effects.el.aura(f.def.element ?? 'wind', f.position.clone().setY(f.groundY), f.def.awakenedDef?.chakraColor ?? f.def.chakraColor ?? 0xff7a1a, 1.5);")
    s = rep(s, "f.rig.setAwakened(true, (f.def.color as number) === 0x1a1a1a ? 0xff7a1a : 0xff7a1a);", "f.rig.setAwakened(true, f.def.chakraColor ?? 0xff7a1a);")
    s = re.sub(r"    if \(f\.moveFrame % 4 === 0\) \{ f\.rig\.socketWorld\(SOCKET\.R_HAND, this\.tmpB\); this\.effects\.spriteBurst\('magic', this\.tmpB, \{ color: col, [^\n]*\}\); \}",
               "    f.rig.socketWorld(SOCKET.R_HAND, this.tmpB); this.effects.el.hold(`${f.id}:demo`, f.def.element ?? 'wind', this.tmpB, f.def.chakraColor ?? col, 1.2);", s)
    s = rep(s, "if (f.moveFrame === Math.floor(move.totalFrames * 0.75)) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.clashBurst(this.tmpB);",
               "if (f.moveFrame === Math.floor(move.totalFrames * 0.75)) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.clashBurst(this.tmpB); this.effects.el.impact(f.def.element ?? 'wind', t ? t.position.clone().setY(t.position.y + 1) : this.tmpB.clone(), f.def.chakraColor ?? col, 1.8, t?.groundY ?? f.groundY);")
    s = rep(s, "      if (f.def.code === '2nrt') this.effects.rasenganTick(this.tmpB);\n      else this.effects.chidoriTick(this.tmpB);",
               "      this.effects.el.hold(`${f.id}:jutsu`, f.def.element ?? 'wind', this.tmpB, f.def.chakraColor ?? (f.def.color as number), 1);")
    s = rep(s, "        this.effects.spriteBurst(pj.sprite ?? 'flame', this.tmpB, { color: pj.color, count: 2, size: 0.6, life: 0.2, speed: 1, additive: true, spin: 6 });",
               "        this.effects.spriteBurst(pj.sprite ?? 'flame', this.tmpB, { color: pj.color, count: 2, size: 0.6, life: 0.2, speed: 1, additive: true, spin: 6 });\n        this.effects.el.hold(`${f.id}:jutsu`, f.def.element ?? 'fire', this.tmpB, f.def.chakraColor ?? pj.color, 0.9);")
    s = rep(s, "`${f.def.displayName}: ${f.def.code === '2nrt' ? 'RASENGAN' : 'CHIDORI'}!`", "`${f.def.displayName}: ${(f.def.jutsuName ?? 'JUTSU').toUpperCase()}!`")
    return s
rw('src/combat/CombatStateMachine.ts', fsm, 'el.aura(f.def.element')

# ------------------------------------------------------------------------------------ camera: slower, smoother 2D pan
def cam(s):
    s = rep(s, "    const rateIn = 5.0, rateOut = 2.2;", "    // Slow, eased swing into the side view and a slower return (Storm's combo camera).\n    const rateIn = 1.35, rateOut = 0.9;")
    s = rep(s, "      const w = this.comboWeight * this.comboWeight * (3 - 2 * this.comboWeight);", "      const cw = this.comboWeight;\n      const w = cw * cw * cw * (cw * (cw * 6 - 15) + 10); // smootherstep")
    s = rep(s, "  COMBO_PUSH: 0.35,", "  COMBO_PUSH: 0.2,")
    return s
rw('src/systems/DualTargetCamera.ts', cam, 'smootherstep')

# ------------------------------------------------------------------------------------ main
def main(s):
    s = rep(s, "    const demo = new Game(randomSelection('demo'));", "    const demo = new Game(randomSelection('demo'));\n    demo.audio.muted = true; // the attract match behind the menus is visual only")
    s = rep(s, "      case CombatState.JUMPING: if (prev !== CombatState.COMBO_STRING && prev !== CombatState.JUTSU && prev !== CombatState.JUMPING && f.grounded !== false) this.effects.dustKick(p, 5, 0.5); break;\n", "")
    s = rep(s, "      case CombatState.JUTSU: this.effects.gust(p, 3.0, col); break;", "      case CombatState.JUTSU: this.effects.el.aura(f.def.element ?? 'wind', p, f.def.chakraColor ?? col, 1.0); break;\n      case CombatState.DODGE: this.effects.gust(p, 1.8); break;")
    s = rep(s, "      case CombatState.AWAKEN: this.effects.gust(p, 5, col);", "      case CombatState.AWAKEN: this.effects.el.aura(f.def.element ?? 'wind', p, f.def.chakraColor ?? col, 2.0); this.effects.gust(p, 5, col);")
    s = rep(s, "      case CombatState.ULTIMATE: this.effects.gust(p, 4.5, col);", "      case CombatState.ULTIMATE: this.effects.el.aura(f.def.ultElement ?? f.def.element ?? 'wind', p, f.def.chakraColor ?? col, 1.6); this.effects.gust(p, 4.5, col);")
    # smear frames only on attacks, specials, dashes and heavy launches — never on jumps
    a = s.index("      const streak = ")
    b = s.index("\n", a)
    s = s[:a] + "      const streak = SETTINGS.postFx && sp > 9 && (f.state === CombatState.COMBO_STRING || f.state === CombatState.JUTSU || f.state === CombatState.SPARK_DASH || f.state === CombatState.DASH_HOMING || f.state === CombatState.TUMBLE || (f.state === CombatState.ULTIMATE && f.ultimatePhase === 1));" + s[b:]
    s = rep(s, "this.smearTmp.set(f.velocity.x, f.velocity.y * 0.3, f.velocity.z).multiplyScalar(0.035); if (this.smearTmp.length() > 0.9) this.smearTmp.setLength(0.9);",
               "this.smearTmp.set(f.velocity.x, f.velocity.y * 0.3, f.velocity.z).multiplyScalar(0.022); if (this.smearTmp.length() > 0.55) this.smearTmp.setLength(0.55);")
    # combo camera: hold the side view briefly between strings so it does not flicker
    s = rep(s, "    this.camera.comboTarget = stringOn(a1, a2) || stringOn(a2, a1) ? 1 : 0;",
               "    this.comboHold = stringOn(a1, a2) || stringOn(a2, a1) ? 0.7 : Math.max(0, this.comboHold - dt);\n    this.camera.comboTarget = this.comboHold > 0 ? 1 : 0;")
    s = rep(s, "  private koM = new THREE.Matrix4();", """  private koM = new THREE.Matrix4();
  private comboHold = 0;
  /** Round outro: victory pose + camera before the results screen. */
  private outroStarted = false;
  private outroTimer = 0;
  private outroFighter: Fighter | null = null;
  private outroAngle = 0;
  private introFx = 0;""")
    s = rep(s, "    this.resultsShown = false;\n", "    this.resultsShown = false;\n    this.outroStarted = false;\n    this.outroTimer = 0;\n    this.outroFighter = null;\n    this.koTimer = 0;\n    this.introFx = 0;\n")
    s = rep(s, "    this.team1.active.enterState(CombatState.INTRO);\n    this.team2.active.enterState(CombatState.INTRO);",
               "    this.team1.active.enterState(CombatState.INTRO);\n    this.team2.active.enterState(CombatState.INTRO);\n    this.team1.active.introDelay = 0;\n    this.team2.active.introDelay = 70; // 2P's entry starts when the camera reaches them")
    s = rep(s, "    if (this.winner && this.koTimer <= 0 && !this.resultsShown) void this.showResults();",
               "    if (this.winner && this.koTimer <= 0 && !this.outroStarted) this.startOutro();\n    if (this.outroStarted && !this.resultsShown) { this.outroTimer -= dt; if (this.outroTimer <= 0) void this.showResults(); }")
    s = rep(s, "    if (!this.applyKoCamera(dt) && !this.applyCinematicCamera()) this.camera.update(",
               "    if (!this.applyIntroCamera() && !this.applyKoCamera(dt) && !this.applyWinCamera(dt) && !this.applyCinematicCamera()) this.camera.update(")
    s = rep(s, "  private setLetterbox(on: boolean): void {", """  /** Round intro: the camera visits 1P's entry pose, then 2P's (whose entry starts on arrival). */
  private applyIntroCamera(): boolean {
    const a = this.team1.active, b = this.team2.active;
    const fa = a.state === CombatState.INTRO ? a.stateFrame : -1;
    const fb = b.state === CombatState.INTRO ? b.stateFrame : -1;
    const fr = Math.max(fa, fb);
    if (fr < 0 || fr > 140 || this.mode === 'demo' && fr > 139) return false;
    const second = fr >= 70;
    const who = second ? b : a;
    const k = (second ? fr - 70 : fr) / 70;
    const c = who.rig.root.position;
    const side = second ? -1 : 1;
    const ang = who.yaw + side * (0.62 - 0.32 * k);
    const dist = 4.3 - 1.4 * k;
    this.camP.set(c.x + Math.sin(ang) * dist, c.y + 1.25 + 0.3 * (1 - k), c.z + Math.cos(ang) * dist);
    this.koM.lookAt(this.camP, new THREE.Vector3(c.x, c.y + 1.05, c.z), new THREE.Vector3(0, 1, 0));
    this.camQ.setFromRotationMatrix(this.koM);
    this.camera.override(this.camP, this.camQ, 38 - 5 * k);
    this.setLetterbox(true);
    const bit = second ? 2 : 1;
    if (!(this.introFx & bit)) {
      this.introFx |= bit;
      this.effects.el.aura(who.def.element ?? 'wind', c.clone().setY(who.groundY), who.def.chakraColor ?? (who.def.color as number), 1.4);
    }
    return true;
  }

  /** Victory: the winner plays their win pose while the camera circles in from the front. */
  private startOutro(): void {
    this.outroStarted = true;
    this.outroTimer = this.mode === 'demo' ? 2.6 : 3.6;
    const winTeam = this.team2.stats.isDead ? this.team1 : this.team1.stats.isDead ? this.team2 : this.team1.stats.health >= this.team2.stats.health ? this.team1 : this.team2;
    const w = winTeam.active;
    this.outroFighter = w;
    this.outroAngle = 0;
    if (w.state !== CombatState.DEAD) {
      w.enterState(CombatState.WIN);
      w.velocity.x = 0;
      w.velocity.z = 0;
    }
    this.effects.el.aura(w.def.element ?? 'wind', w.position.clone().setY(w.groundY), w.def.chakraColor ?? (w.def.color as number), 1.6);
    this.audio.voice(w.def.voiceCode ?? w.def.code, 'powerUP', { volume: 0.8 * SETTINGS.voice });
  }

  private applyWinCamera(dt: number): boolean {
    const w = this.outroFighter;
    if (!this.outroStarted || !w || this.resultsShown) return false;
    this.outroAngle += dt * 0.2;
    const k = Math.min(1, Math.max(0, 1 - this.outroTimer / 3.6));
    const c = w.rig.root.position;
    const yaw = w.yaw + 0.45 - this.outroAngle;
    const dist = 4.8 - 1.8 * k;
    this.camP.set(c.x + Math.sin(yaw) * dist, c.y + 1.55 - 0.35 * k, c.z + Math.cos(yaw) * dist);
    this.koM.lookAt(this.camP, new THREE.Vector3(c.x, c.y + 1.1, c.z), new THREE.Vector3(0, 1, 0));
    this.camQ.setFromRotationMatrix(this.koM);
    this.camera.override(this.camP, this.camQ, 40 - 6 * k);
    this.setLetterbox(true);
    return true;
  }

  private setLetterbox(on: boolean): void {""")
    # watchdog: nothing stays frozen or locked in a reaction
    s = rep(s, "    for (const f of present) this.controllers.get(f)!.tick(this.tick, dt, this.camBasis);",
               """    for (const f of present) this.controllers.get(f)!.tick(this.tick, dt, this.camBasis);
    // Watchdog: no fighter stays frozen in hitstop or locked in a reaction for long.
    for (const f of present) {
      f.frozenTicks = f.hitstopFrames > 0 ? f.frozenTicks + 1 : 0;
      if (f.frozenTicks > 720) { f.hitstopFrames = 0; f.heldBy = 0; f.frozenTicks = 0; this.log(`${f.def.code}: watchdog released hitstop`); }
      if (WATCH_STATES.has(f.state) && f.stateFrame > 480 && !f.heldBy) {
        f.tetherFrames = 0; f.tetherBy = 0;
        f.enterState(f.grounded ? CombatState.IDLE_NEUTRAL : CombatState.LAUNCHED);
        this.log(`${f.def.code}: watchdog released ${f.state}`);
      }
    }""")
    s = rep(s, "const ZERO3 = new THREE.Vector3();", """const ZERO3 = new THREE.Vector3();
const WATCH_STATES: ReadonlySet<CombatState> = new Set([CombatState.HITSTUN, CombatState.LAUNCHED, CombatState.TUMBLE, CombatState.CRUMPLE, CombatState.KNOCKDOWN, CombatState.WALL_SPLAT, CombatState.BLOCKSTUN, CombatState.GUARD_BREAK, CombatState.SUBSTITUTED, CombatState.DODGE, CombatState.DASH_IMPACT, CombatState.THROW]);""")
    return s
rw('src/main.ts', main, 'applyIntroCamera')
print('present ok')
