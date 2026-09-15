"""Session 9, main.ts: modes, teams of three, menus, results, pause, post effects, stage lighting,
21 stages with music, smear frames, ground VFX hooks, two controllers."""
import os, re
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'src', 'main.ts'); s = open(p, encoding='utf-8').read()
if 'runResults' in s:
    print('already'); raise SystemExit
def rep(old, new, count=1):
    global s
    assert old in s, old[:120]; s = s.replace(old, new, count)

# ---------------------------------------------------------------- imports
rep("import { InputManager, KeyboardInputSource, P1_BINDINGS, ScriptedInputSource } from './core/InputManager';",
    "import { InputManager, KeyboardInputSource, P1_BINDINGS, P1_BINDINGS_WASD, P2_BINDINGS, ScriptedInputSource, InputSource } from './core/InputManager';")
rep("import { CharacterSelect, Selection, showVsSplash } from './ui/CharacterSelect';",
    """import { CharacterSelect, showVsSplash } from './ui/CharacterSelect';
import { Selection, StageOption, GameMode, selectionFromParams, selectionToParams } from './core/Selection';
import { runTitle, runMainMenu, runOptions, runMoveList, runCredits, runPause, runResults } from './ui/Screens';
import { SETTINGS } from './core/Settings';
import { PostFX } from './render/PostFX';""")

# ---------------------------------------------------------------- stages + lighting
a = s.index("export const STAGES = ["); b = s.index("];", a) + 2
s = s[:a] + """/** Stage lighting presets: sun / ambient / rim colours for the cel materials, sky + ground for the
 *  hemisphere light, fog colour, and the sun direction. */
export const LIGHTS: Record<string, { sun: number; ambient: number; rim: number; sky: number; ground: number; fog: number; dir: [number, number, number]; intensity: number }> = {
  day:    { sun: 0xfff2dc, ambient: 0x9fb4c8, rim: 0xffffff, sky: 0xbfe0ff, ground: 0x6e7a5a, fog: 0x9fc7e8, dir: [20, 40, 15], intensity: 1.0 },
  forest: { sun: 0xf4ffd8, ambient: 0x7fa080, rim: 0xe8ffe0, sky: 0xa8d8c0, ground: 0x3a4a30, fog: 0x86b49a, dir: [12, 40, 22], intensity: 0.95 },
  dusk:   { sun: 0xffb070, ambient: 0x8a7a98, rim: 0xffd0a0, sky: 0xffc08a, ground: 0x4a3a44, fog: 0xd8a080, dir: [30, 18, -10], intensity: 1.05 },
  night:  { sun: 0x8090ff, ambient: 0x2a3050, rim: 0xa0b8ff, sky: 0x1a2040, ground: 0x101018, fog: 0x141a30, dir: [-15, 35, 10], intensity: 0.75 },
  cave:   { sun: 0xc0b8ff, ambient: 0x3a3450, rim: 0x9080ff, sky: 0x2a2438, ground: 0x0a0a10, fog: 0x1a1626, dir: [0, 40, 10], intensity: 0.8 },
  desert: { sun: 0xfff0c0, ambient: 0xb0a080, rim: 0xffffff, sky: 0xffe8b0, ground: 0x8a7050, fog: 0xe8d8b0, dir: [25, 45, 5], intensity: 1.1 },
  rain:   { sun: 0x9aa8b8, ambient: 0x5a6470, rim: 0xc0d0e0, sky: 0x6a7a8a, ground: 0x30383e, fog: 0x7a8894, dir: [10, 40, 20], intensity: 0.7 },
  ruin:   { sun: 0xf0e0d0, ambient: 0x7a7080, rim: 0xffe0d0, sky: 0xc8b8b0, ground: 0x504840, fog: 0xb0a0a0, dir: [15, 35, -20], intensity: 0.9 },
  void:   { sun: 0xd0c0ff, ambient: 0x403860, rim: 0xc0a0ff, sky: 0x2a1a40, ground: 0x100818, fog: 0x1a1030, dir: [0, 40, 0], intensity: 0.85 },
};

/** Storm 4 battle music streams (BGM.awb) that were decoded: track id → [loop start s]. */
export const BGM_TRACKS: Record<number, number> = { 1: 9.06, 2: 3.18, 3: 3.0, 4: 4.13, 5: 7.8, 6: 12.04, 7: 4.34, 8: 22.25, 9: 8.03, 10: 10.49, 11: 4.13, 12: 3.84, 14: 8.06, 16: 6.86, 18: 20.59, 20: 12.01 };
export const BGM_LIST = Object.keys(BGM_TRACKS).map(Number);

export const STAGES: StageOption[] = [
  { id: 'sd03a', name: 'HIDDEN LEAF FOREST', bgm: 1, light: 'forest' },
  { id: 'sd00b01', name: 'HIDDEN LEAF VILLAGE', bgm: 2, light: 'day' },
  { id: 'sd00b02', name: 'HIDDEN LEAF VILLAGE · DUSK', bgm: 3, light: 'dusk' },
  { id: 'si00a', name: 'TRAINING FIELD', bgm: 4, light: 'day' },
  { id: 'sd05a', name: 'FOREST OF QUIET MOVEMENT · EVENING', bgm: 5, light: 'dusk' },
  { id: 'sd05c', name: 'FOREST OF QUIET MOVEMENT · DAY', bgm: 6, light: 'forest' },
  { id: 'sd05d', name: 'FOREST OF QUIET MOVEMENT · NIGHT', bgm: 7, light: 'night' },
  { id: 'sd01d', name: 'FOREST OF DEATH', bgm: 8, light: 'forest' },
  { id: 'sd03d', name: 'HIDDEN LEAF FOREST · NIGHT', bgm: 9, light: 'night' },
  { id: 'si06a', name: 'FOREST OF DEAD TREES', bgm: 10, light: 'ruin' },
  { id: 'sd04b', name: 'GRASSY WAVES PRAIRIE', bgm: 11, light: 'day' },
  { id: 'sd07a', name: "OROCHIMARU'S HIDEOUT", bgm: 12, light: 'cave' },
  { id: 'si02a', name: 'AKATSUKI HIDEOUT', bgm: 14, light: 'cave' },
  { id: 'si08a', name: 'UCHIHA HIDEOUT', bgm: 16, light: 'cave' },
  { id: 'sd08a', name: 'HIDDEN SAND GATE', bgm: 18, light: 'desert' },
  { id: 'si01a', name: 'HIDDEN SAND VILLAGE', bgm: 20, light: 'desert' },
  { id: 'sd06a', name: 'FIVE-SEAL BARRIER CLIFF', bgm: 3, light: 'dusk' },
  { id: 'sd11a', name: 'MOUNT MYOBOKU', bgm: 6, light: 'forest' },
  { id: 'sd12a', name: 'HIDDEN LEAF VILLAGE · DESTROYED', bgm: 8, light: 'ruin' },
  { id: 'si10b', name: 'SITE OF PLANETARY DEVASTATION', bgm: 9, light: 'void' },
  { id: 'sd05b', name: 'THE FINAL VALLEY', bgm: 10, light: 'rain' },
];""" + s[b:]
rep("const ROUND_SECONDS = 99;", "const ROUND_SECONDS = 99;\nconst ZERO3 = new THREE.Vector3();")

# ---------------------------------------------------------------- fields
rep("  ai!: AIBrain;", """  ai!: AIBrain;
  /** Second brain for the attract demo (drives P1). */
  ai1: AIBrain | null = null;
  mode: GameMode;
  postfx!: PostFX;
  private hemi!: THREE.HemisphereLight;
  private resultsShown = false;
  private pauseOpen = false;
  private maxCombo = [0, 0];
  private dmgDealt = [0, 0];
  private smearTmp = new THREE.Vector3();
  private lightDir = new THREE.Vector3(20, 40, 15);""")
rep("    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.6));", "    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.6);\n    this.scene.add(this.hemi);\n    this.mode = selection.mode;")
rep("    this.hud = new UIOverlay(hudCanvas);", """    this.hud = new UIOverlay(hudCanvas);
    if (selection.mode === 'demo') hudCanvas.style.display = 'none';
    this.postfx = new PostFX(this.renderer, this.scene, this.camera.camera);
    this.applySettings();""")
rep("    this.hud.resize();", "    this.hud.resize();\n    this.postfx.resize(window.innerWidth, window.innerHeight);")

# ---------------------------------------------------------------- teams
a = s.index("  private setupTeams(): void {"); b = s.index("    this.resetRound();\n  }", a) + len("    this.resetRound();\n  }")
s = s[:a] + """  private setupTeams(): void {
    const sel = this.selection;
    const mode = sel.mode;
    // Player 1: keyboard + first pad (the attract demo hands the leader to a second AI brain).
    const kb = new KeyboardInputSource(mode === '2p' && SETTINGS.p2Device === 'KEYBOARD' ? P1_BINDINGS_WASD : P1_BINDINGS, window, 0);
    this.p1Source = kb;
    const p1Src: InputSource = mode === 'demo' ? new ScriptedInputSource() : kb;
    const mk = (def: CharacterDef, src: InputSource) => new Fighter(def, new InputManager(src));
    const p1Lead = mk(sel.p1.leader, p1Src);
    const p1Sups = sel.p1.supports.map((d, i) => { const f = mk(d, new ScriptedInputSource()); f.supportType = sel.p1.types[i] ?? d.supportType; return f; });
    this.team1 = new Team('P1', 1, p1Lead, p1Sups, p1Src);

    // Player 2: second pad / keyboard cluster in VS PLAYER, otherwise the AI brain (or a dummy).
    const p2Src: InputSource = mode === '2p' ? new KeyboardInputSource(P2_BINDINGS, window, SETTINGS.p2Device === 'KEYBOARD' ? 99 : 1) : new ScriptedInputSource();
    const p2Lead = mk(sel.p2.leader, p2Src);
    const p2Sups = sel.p2.supports.map((d, i) => { const f = mk(d, new ScriptedInputSource()); f.supportType = sel.p2.types[i] ?? d.supportType; return f; });
    this.team2 = new Team('P2', 2, p2Lead, p2Sups, p2Src);
    const aiSrc = p2Src instanceof ScriptedInputSource ? p2Src : new ScriptedInputSource();
    this.ai = new AIBrain(aiSrc, this.team2);
    this.ai.enabled = mode === 'cpu' || mode === 'demo' || new URLSearchParams(location.search).get('ai') === '1';
    if (mode === 'demo') { this.ai1 = new AIBrain(p1Src as ScriptedInputSource, this.team1, 3); this.ai1.enabled = true; }

    this.allFighters = [p1Lead, ...p1Sups, p2Lead, ...p2Sups];
    for (const f of this.allFighters) {
      this.scene.add(f.rig.root);
      this.controllers.set(f, new PlayerController(f, this.fsm, this.arena));
      f.rig.tryLoadGlb().then((ok) => {
        if (ok) { this.log(`${f.def.code}: GLB rig bound`); this.applyStageLight(f); }
      });
    }
    for (const team of [this.team1, this.team2]) {
      const gs = new GuardSphere();
      this.scene.add(gs.mesh);
      this.guardSpheres.set(team, gs);
    }
    this.resetRound();
  }

  /** Push the current stage's light preset into a rig's cel materials. */
  private applyStageLight(f: Fighter): void {
    const L = LIGHTS[STAGES[this.stageIndex]?.light ?? 'day'] ?? LIGHTS.day;
    f.rig.setLighting(L.sun, L.ambient, L.rim, this.lightDir);
  }

  /** Stage lighting preset: sun, hemisphere, fog, clear colour and every rig. */
  private applyLighting(name: string): void {
    const L = LIGHTS[name] ?? LIGHTS.day;
    this.sun.color.set(L.sun);
    this.sun.intensity = L.intensity;
    this.lightDir.set(L.dir[0], L.dir[1], L.dir[2]);
    this.hemi.color.set(L.sky);
    this.hemi.groundColor.set(L.ground);
    (this.scene.fog as THREE.Fog).color.set(L.fog);
    this.renderer.setClearColor(L.fog);
    for (const f of this.allFighters ?? []) this.applyStageLight(f);
  }

  /** Re-read the player options (volume, camera, effects, shadows). */
  applySettings(): void {
    this.postfx.enabled = SETTINGS.postFx;
    this.camera.distanceScale = SETTINGS.cameraScale;
    this.renderer.shadowMap.enabled = SETTINGS.shadows;
    this.audio.setVolume(SETTINGS.master * SETTINGS.sfx);
    bgm.setMusicVolume(musicVol(musicBase));
  }""" + s[b:]

rep("""    this.team1.bench.rig.root.visible = false;
    this.team2.bench.rig.root.visible = false;""", """    for (const t of [this.team1, this.team2]) for (const sp of t.supports) sp.rig.root.visible = false;
    this.resultsShown = false;
    this.maxCombo = [0, 0];
    this.dmgDealt = [0, 0];""")
rep("""    this.team1.bench.target = this.team2.active;
    this.team2.bench.target = this.team1.active;""", """    for (const sp of this.team1.supports) sp.target = this.team2.active;
    for (const sp of this.team2.supports) sp.target = this.team1.active;""")
rep("    this.camera.arenaRadius = this.arena.radius;\n  }", "    this.camera.arenaRadius = this.arena.radius;\n    this.applyLighting(st.light ?? 'day');\n  }")
rep("          this.effects.switchFlash(p, team.bench.def.color as number);", "          this.effects.switchFlash(p, team.supports[0].def.color as number);")
rep("    this.ai.update(dt, this.camBasis);", "    this.ai.update(dt, this.camBasis);\n    this.ai1?.update(dt, this.camBasis);")

# ---------------------------------------------------------------- HUD data
rep("""      partnerName: team.bench.def.displayName,
      portrait: f.def.portrait ?? null,
      supportPortrait: team.bench.def.portrait ?? null,
      supportType: team.bench.def.supportType,
      supportReady: s.supportGauge >= BALANCE.SUPPORT_GAUGE_USE_NORMAL && team.bench.supportCooldown <= 0 && !team.bench.rig.root.visible,""",
"""      portrait: f.def.portrait ?? null,
      supports: team.supports.map((sp) => ({ name: sp.def.displayName, portrait: sp.def.portrait ?? null, type: sp.supportType, ready: s.supportGauge >= BALANCE.SUPPORT_GAUGE_USE_NORMAL && sp.supportCooldown <= 0 && !sp.rig.root.visible })),
      human: team === this.team1 ? this.mode !== 'demo' : this.mode === '2p',""")

# ---------------------------------------------------------------- events → post fx
rep("""        if (heavy) this.audio.play('hit_S', { volume: 0.6 });
        const victim = this.allFighters.find((f) => f.id === data.defenderId);""",
"""        if (heavy) this.audio.play('hit_S', { volume: 0.6 });
        const victim = this.allFighters.find((f) => f.id === data.defenderId);
        if (who) this.dmgDealt[who.team === this.team1 ? 0 : 1] += data.damage ?? 0;
        if (heavy) {
          this.postfx.aberration(0.9);
          if (victim && victim.grounded) this.effects.groundCrack(victim.position.clone().setY(victim.groundY), 1.3);
        } else if (victim) this.effects.gust(victim.position.clone().setY(victim.groundY), 1.4);""")
rep("      case 'GUARD_BREAK': { this.audio.play('exp1', { volume: 0.9 }); const vv = this.allFighters.find((f) => f.id === data.defenderId); if (vv) this.audio.voice(vv.def.code, 'grdBrk_02'); break; }",
    "      case 'GUARD_BREAK': { this.audio.play('exp1', { volume: 0.9 }); const vv = this.allFighters.find((f) => f.id === data.defenderId); if (vv) { this.audio.voice(vv.def.code, 'grdBrk_02'); this.postfx.shockwave(vv.position.clone().setY(vv.position.y + 1), this.camera.camera, 0.7, 0.4); this.postfx.impactFrame(0.7, 0xcfe8ff); } break; }")
rep("      case 'WALL_SPLAT': this.audio.play('groundHit2'); break;",
    "      case 'WALL_SPLAT': { this.audio.play('groundHit2'); const vv = this.allFighters.find((f) => f.id === data.defenderId); if (vv) { this.effects.groundCrack(vv.position.clone().setY(vv.groundY), 2.0); this.postfx.aberration(1.2); } break; }")
rep("        if ((data.damage ?? 0) > 0) { screenFlash(); this.audio.play('exp1', { volume: 0.8 }); this.audio.play(who?.def.jutsuSfx ?? 'rasen', { volume: 0.8 }); }",
    "        if ((data.damage ?? 0) > 0) { screenFlash(); this.audio.play('exp1', { volume: 0.8 }); this.audio.play(who?.def.jutsuSfx ?? 'rasen', { volume: 0.8 }); const vv = this.allFighters.find((f) => f.id === data.defenderId); if (vv) { this.postfx.shockwave(vv.position.clone().setY(vv.position.y + 1), this.camera.camera, 1.2, 0.55); this.postfx.impactFrame(0.9); this.effects.groundCrack(vv.position.clone().setY(vv.groundY), 2.6, true); } }")
rep("          bgm.setMusicVolume(0.08); setTimeout(() => bgm.setMusicVolume(0.22), 6500);\n          this.audio.play('exp2');",
    "          bgm.setMusicVolume(musicVol(0.08)); setTimeout(() => bgm.setMusicVolume(musicVol(musicBase)), 6500);\n          this.audio.play('exp2');\n          { const vv = this.allFighters.find((f) => f.id === data.defenderId); const at = (vv ?? who)?.position.clone(); if (at) { at.y += 1; this.postfx.shockwave(at, this.camera.camera, 1.8, 0.8); this.postfx.impactFrame(1, 0xfff0c0); this.effects.groundCrack(at.clone().setY(at.y - 1), 3.4, true); } }")
rep("        case CombatState.DEAD: this.audio.play('ko'); v('dmgLose'); bgm.setMusicVolume(0.1); break;",
    "        case CombatState.DEAD: this.audio.play('ko'); v('dmgLose'); bgm.setMusicVolume(musicVol(0.1)); break;")
# state VFX hook next to the sounds
rep("  log(text: string): void {", """  /** State-transition visuals: dust, gusts, ground rings, cracks, impact frames. */
  private stateVfx(f: Fighter, prev: CombatState): void {
    const p = f.position.clone(); p.y = f.groundY + 0.02;
    const col = f.def.color as number;
    switch (f.state) {
      case CombatState.DASH_STARTUP: this.effects.gust(p, 3.2, col); this.effects.dustKick(p, 8); break;
      case CombatState.DASH_HOMING: case CombatState.SPARK_DASH: this.effects.groundRing(p, 2.8, 0xffffff, 0.3); break;
      case CombatState.JUMPING: if (prev !== CombatState.COMBO_STRING && prev !== CombatState.JUTSU && prev !== CombatState.JUMPING && f.grounded !== false) this.effects.dustKick(p, 5, 0.5); break;
      case CombatState.NINJA_MOVE: this.effects.dustKick(p, 6, 0.6); this.effects.gust(p, 2.2); break;
      case CombatState.HOLLOW_STEP: this.effects.gust(p, 2.0); break;
      case CombatState.IDLE_NEUTRAL: case CombatState.RUNNING:
        if (prev === CombatState.JUMPING || prev === CombatState.NINJA_MOVE || prev === CombatState.HOLLOW_STEP) this.effects.dustKick(p, 6, 0.6);
        break;
      case CombatState.KNOCKDOWN: this.effects.groundCrack(p, 1.9); this.postfx.shockwave(p, this.camera.camera, 0.5, 0.35); break;
      case CombatState.CRUMPLE: this.effects.dustKick(p, 6, 0.7); break;
      case CombatState.DEAD: this.effects.groundCrack(p, 2.6); this.postfx.impactFrame(1, 0xffe9c0); this.postfx.shockwave(p, this.camera.camera, 1.3, 0.6); break;
      case CombatState.ULTIMATE: this.effects.gust(p, 4.5, col); this.effects.dustKick(p, 12, 1.0, 1.3); break;
      case CombatState.AWAKEN: this.effects.gust(p, 5, col); this.effects.groundCrack(p, 3.0, true); this.postfx.shockwave(p, this.camera.camera, 1.0, 0.6); break;
      case CombatState.CHAKRA_CHARGE: this.effects.groundRing(p, 1.6, col, 0.5); break;
      case CombatState.JUTSU: this.effects.gust(p, 3.0, col); break;
    }
  }

  log(text: string): void {""")
rep("      const v = (cue: string) => this.audio.voice(code === '9ind' ? '2ssk' : code, cue, { volume: 0.85 });",
    "      const v = (cue: string) => this.audio.voice(code === '9ind' ? '2ssk' : code, cue, { volume: 0.85 * SETTINGS.voice });\n      this.stateVfx(f, prev);")

# ---------------------------------------------------------------- pause / round / results
rep("""    const pad = this.p1Source.pad;
    if (this.paused) pad.poll();
    if (pad.justPressed(PAD.OPTIONS)) this.paused = !this.paused;
    if (pad.justPressed(PAD.CREATE)) {
      this.resetRound();
      this.hud.showToast('REMATCH', '#ffffff', 0.8);
    }""", """    const pad = this.p1Source.pad;
    if (this.paused) pad.poll();
    const pad2 = this.team2.humanSource instanceof KeyboardInputSource ? this.team2.humanSource.pad : null;
    if (pad2 && this.paused) pad2.poll();
    if (this.mode !== 'demo' && (pad.justPressed(PAD.OPTIONS) || pad2?.justPressed(PAD.OPTIONS))) void this.openPause();
    if (this.mode !== 'demo' && !this.pauseOpen && pad.justPressed(PAD.CREATE)) {
      this.resetRound();
      this.hud.showToast('REMATCH', '#ffffff', 0.8);
    }
    // Training: health and chakra refill while both sides stand idle.
    if (this.mode === 'training' && !this.winner) {
      for (const t of [this.team1, this.team2]) if (NEUTRAL_STATES.has(t.active.state) && t.active.stateFrame > 90) {
        t.stats.health = Math.min(t.stats.healthMax, t.stats.health + 400 * dt);
      }
    }
    if (this.winner && this.koTimer <= 0 && !this.resultsShown) void this.showResults();
    for (let i = 0; i < 2; i++) this.maxCombo[i] = Math.max(this.maxCombo[i], (i === 0 ? this.team2 : this.team1).stats.comboHits);""")
rep("      } else if (e.code === 'KeyP') {\n        this.paused = !this.paused;", "      } else if (e.code === 'KeyP') {\n        if (this.mode !== 'demo') void this.openPause();")
rep("      } else if (e.code === 'Escape') {\n        returnToSelect();", "      } else if (e.code === 'Escape') {\n        if (this.mode !== 'demo') void this.openPause();")
rep("      this.roundTime = Math.max(0, this.roundTime - dt);", "      if (SETTINGS.roundTime !== 0 && this.mode !== 'training' && this.mode !== 'demo') this.roundTime = Math.max(0, this.roundTime - dt);")
rep("    this.roundTime = ROUND_SECONDS;", "    this.roundTime = SETTINGS.roundTime || ROUND_SECONDS;")
rep("  private setLetterbox(on: boolean): void {", """  private async openPause(): Promise<void> {
    if (this.pauseOpen || this.winner) return;
    this.pauseOpen = true;
    this.paused = true;
    const idx = Math.max(0, ROSTER.indexOf(this.team1.active.def));
    const c = await runPause(ROSTER, idx);
    this.pauseOpen = false;
    this.applySettings();
    if (c === 'resume') this.paused = false;
    else if (c === 'select') goToSelect(this.mode);
    else if (c === 'title') goToTitle();
    else this.paused = false;
  }

  private async showResults(): Promise<void> {
    this.resultsShown = true;
    if (this.mode === 'demo' || this.mode === 'training') { setTimeout(() => this.resetRound(), this.mode === 'demo' ? 2500 : 1200); return; }
    const winTeam = this.team2.stats.isDead ? this.team1 : this.team1.stats.isDead ? this.team2 : this.team1.stats.health >= this.team2.stats.health ? this.team1 : this.team2;
    const loseTeam = winTeam === this.team1 ? this.team2 : this.team1;
    const wi = winTeam === this.team1 ? 0 : 1;
    this.paused = true;
    const c = await runResults({
      winner: `${winTeam === this.team1 ? '1P' : this.mode === '2p' ? '2P' : 'COM'} · ${winTeam.active.def.displayName}`,
      loser: loseTeam.active.def.displayName, winnerPortrait: winTeam.active.def.portrait ?? null,
      time: SETTINGS.roundTime ? SETTINGS.roundTime - this.roundTime : this.tick / 60, maxCombo: this.maxCombo[wi], damage: this.dmgDealt[wi],
      perfect: winTeam.stats.health >= winTeam.stats.healthMax,
    });
    if (c === 'rematch') { this.resetRound(); this.paused = false; bgm.setMusicVolume(musicVol(musicBase)); }
    else if (c === 'select') goToSelect(this.mode);
    else goToTitle();
  }

  private setLetterbox(on: boolean): void {""")

# ---------------------------------------------------------------- render: smear, blur, heat, post pass
rep("""    if (background) return;
    this.renderer.render(this.scene, this.camera.camera);
    this.hud.draw(this.hudData(), dt);""", """    if (background) return;
    // Smear frames on fast travel, radial blur while P1 dashes, chakra heat around jutsu.
    for (const f of [...this.team1.present, ...this.team2.present]) {
      const sp = Math.hypot(f.velocity.x, f.velocity.z);
      const streak = (f.state === CombatState.DASH_HOMING || f.state === CombatState.SPARK_DASH || f.state === CombatState.NINJA_MOVE || f.state === CombatState.LAUNCHED || f.state === CombatState.TUMBLE || (f.state === CombatState.ULTIMATE && f.ultimatePhase === 1)) && sp > 9 && SETTINGS.postFx;
      if (streak) { this.smearTmp.set(f.velocity.x, f.velocity.y * 0.3, f.velocity.z).multiplyScalar(0.035); if (this.smearTmp.length() > 0.9) this.smearTmp.setLength(0.9); f.rig.setSmear(this.smearTmp); }
      else f.rig.setSmear(ZERO3);
    }
    const p1Dash = a1.state === CombatState.DASH_HOMING || a1.state === CombatState.SPARK_DASH || (a1.state === CombatState.ULTIMATE && a1.ultimatePhase === 1);
    this.postfx.blurTarget = p1Dash ? 0.6 : 0;
    if (p1Dash) this.postfx.blurAt(a2.rig.root.position.clone().setY(a2.rig.root.position.y + 1), this.camera.camera);
    for (const f of [a1, a2]) {
      if ((f.state === CombatState.JUTSU && !f.def.jutsuProjectile) || (f.state === CombatState.ULTIMATE && f.cinematic) || f.state === CombatState.CHAKRA_CHARGE || f.awakened) {
        this.postfx.heatAt(f.rig.root.position.clone().setY(f.rig.root.position.y + 1), this.camera.camera, f.awakened ? 0.35 : 0.8);
      }
    }
    this.postfx.render(dt, this.scene, this.camera.camera);
    if (this.mode !== 'demo') this.hud.draw(this.hudData(), dt);""")

# ---------------------------------------------------------------- boot
a = s.index("function selectionFromUrl()")
s = s[:a] + """function goToSelect(mode: GameMode): void {
  location.href = `${location.pathname}?screen=select&mode=${mode}`;
}
function goToTitle(): void {
  location.href = location.pathname;
}
function returnToSelect(): void { goToSelect(window.storm?.mode ?? 'cpu'); }
void returnToSelect;

/** Attract-mode match: six different fighters, random stage. */
function randomSelection(mode: GameMode): Selection {
  const pool = [...ROSTER].sort(() => Math.random() - 0.5);
  const types = (): ('ATTACK' | 'GUARD' | 'BALANCE')[] => [pool[1].supportType, pool[2].supportType];
  return { mode, p1: { leader: pool[0], supports: [pool[1], pool[2]], types: types() }, p2: { leader: pool[3], supports: [pool[4], pool[5]], types: [pool[4].supportType, pool[5].supportType] }, stage: STAGES[Math.floor(Math.random() * STAGES.length)] };
}

/** Music: Storm 2 title theme on the menus, a Storm 4 battle stream per stage in the fight. */
const bgm = new AudioManager();
let musicBase = 0.22;
function musicVol(v: number): number { return v * SETTINGS.music * SETTINGS.master; }

async function boot(): Promise<void> {
  const q = new URLSearchParams(location.search);
  let sel = selectionFromParams(q, findCharacter, STAGES);
  const bootEl = document.getElementById('boot');
  if (!sel) {
    bootEl?.remove();
    musicBase = 0.45;
    bgm.playLoop('title', musicVol(musicBase), 2.7);
    // Attract mode: a random COM vs COM match runs blurred behind the menus.
    const demo = new Game(randomSelection('demo'));
    window.storm = demo;
    const gl = document.getElementById('gl') as HTMLElement;
    gl.style.transition = 'filter .8s';
    gl.style.filter = 'blur(2.5px) brightness(.5) saturate(1.15)';
    let mode: GameMode = (q.get('mode') as GameMode) || 'cpu';
    if (q.get('screen') !== 'select') {
      await runTitle();
      for (;;) {
        const c = await runMainMenu();
        if (c === 'movelist') await runMoveList(ROSTER);
        else if (c === 'options') { await runOptions(); demo.applySettings(); }
        else if (c === 'credits') await runCredits();
        else { mode = c; break; }
      }
    }
    sel = await new CharacterSelect(ROSTER, STAGES, mode).run();
    location.href = `${location.pathname}?${selectionToParams(sel).toString()}`;
    return;
  }
  musicBase = 0.22;
  const track = SETTINGS.bgmTrack > 0 ? BGM_LIST[(SETTINGS.bgmTrack - 1) % BGM_LIST.length] : sel.stage.bgm ?? 1;
  bgm.playLoop(`battle_${track}`, musicVol(musicBase), BGM_TRACKS[track] ?? 0);
  // Storm-style VS splash covers the asset load; the round is held until it fades.
  const hideSplash = showVsSplash(sel);
  window.storm = new Game(sel);
  window.storm.audio.preload(['punch_hit1', 'punch_hit2', 'kick_hit1', 'kick_hit2', 'guard', 'dash', 'jump1', 'landing', 'punch_swing', 'battleStart', 'change', 'flash']);
  window.storm.paused = true;
  setTimeout(() => { hideSplash(); window.storm.paused = false; }, 2100);
}
void NARUTO_DEF; void SASUKE_DEF; void (null as unknown as CharacterDef);
boot();
"""
open(p, 'w', encoding='utf-8').write(s)
print('main patched')
