/**
 * main.ts — Entry point. Builds the arena, lighting, dual-target camera, two teams
 * (P1: Naruto 2nrt leader / Sasuke support, P2: Sasuke 2ssk AI leader / Naruto support),
 * and runs a deterministic 60 Hz fixed-step simulation with a decoupled render loop.
 */
import * as THREE from 'three';
import { FIXED_DT, CombatState, CombatEvent, CombatEventKind, LEADER_SWITCH_COST, NEUTRAL_STATES } from './core/Types';
import { InputManager, KeyboardInputSource, P1_BINDINGS, P1_BINDINGS_WASD, P2_BINDINGS, ScriptedInputSource, InputSource } from './core/InputManager';
import { PAD } from './core/GamepadState';
import { NARUTO_DEF, SASUKE_DEF } from './combat/CharacterDefs';
import { ROSTER, findCharacter } from './combat/Roster';
import { CharacterSelect, showVsSplash } from './ui/CharacterSelect';
import { Selection, StageOption, GameMode, selectionFromParams, selectionToParams } from './core/Selection';
import { runTitle, runMainMenu, runOptions, runMoveList, runCredits, runPause, runResults } from './ui/Screens';
import { SETTINGS } from './core/Settings';
import { PostFX } from './render/PostFX';
import { showUltimateCutIn, screenFlash, showAwakenBanner } from './ui/CutIn';
import { AudioManager } from './audio/AudioManager';
import { CharacterDef } from './core/Types';
import { Fighter, Team, EventSink } from './combat/Fighter';
import { CombatStateMachine } from './combat/CombatStateMachine';
import { HitboxManager } from './combat/HitboxManager';
import { PlayerController } from './combat/PlayerController';
import { AIBrain } from './combat/AIBrain';
import { DualTargetCamera } from './systems/DualTargetCamera';
import { ArenaEnvironment } from './systems/ArenaEnvironment';
import { Effects, GuardSphere } from './render/Effects';
import { OpbrFX } from './render/OpbrFX';
import { UIOverlay, HudFighterData } from './ui/UIOverlay';
import { Projectiles } from './combat/Projectiles';
import { SupportSystem } from './combat/SupportSystem';
import { RIG_RAMP } from './render/FighterRig';
import { setRamp } from './render/Shaders';
import { BALANCE, bindingFor } from './combat/StormStates';

/** Stages exported from the Storm 2 data (docs/proto: sd03a Hidden Leaf Forest, sd05a Forest of Quiet Movement, sd01d Forest of Death). */
/** Stage lighting presets: sun / ambient / rim colours for the cel materials, sky + ground for the
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
];

const ROUND_SECONDS = 99;
const ZERO3 = new THREE.Vector3();
const WATCH_STATES: ReadonlySet<CombatState> = new Set([CombatState.HITSTUN, CombatState.LAUNCHED, CombatState.TUMBLE, CombatState.CRUMPLE, CombatState.KNOCKDOWN, CombatState.WALL_SPLAT, CombatState.BLOCKSTUN, CombatState.GUARD_BREAK, CombatState.SUBSTITUTED, CombatState.DODGE, CombatState.DASH_IMPACT, CombatState.THROW, CombatState.SKILL]);

class Game implements EventSink {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: DualTargetCamera;
  arena = new ArenaEnvironment();
  effects = new Effects();
  /** Effects for the One Piece skills (Devil Fruits, Haki, crows, gravity). */
  opbrFx = new OpbrFX(this.effects);
  hud: UIOverlay;
  fsm: CombatStateMachine;
  hitboxes: HitboxManager;
  projectiles: Projectiles;
  support: SupportSystem;
  audio = new AudioManager();
  private sun!: THREE.DirectionalLight;
  /** Exported Storm 4 ultimate camera paths, per clip name (assets/ult/<code>.json). */
  private ultCams = new Map<string, { frames: { p: number[]; q: number[]; fov: number }[] }>();
  private ultCamLoads = new Set<string>();
  private letterbox: HTMLDivElement | null = null;
  private camQ = new THREE.Quaternion();
  private camP = new THREE.Vector3();
  private camGQ = new THREE.Quaternion();
  private prevStates = new Map<number, CombatState>();
  stageIndex = 0;
  stageLoading = false;

  team1!: Team;
  team2!: Team;
  controllers = new Map<Fighter, PlayerController>();
  allFighters: Fighter[] = [];
  ai!: AIBrain;
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
  private lightDir = new THREE.Vector3(20, 40, 15);
  p1Source!: KeyboardInputSource;
  guardSpheres = new Map<Team, GuardSphere>();

  tick = 0;
  accumulator = 0;
  /** KO camera: seconds left of the slow-motion orbit on the loser. */
  koTimer = 0;
  private koAngle = 0;
  private koLoser: Fighter | null = null;
  private koM = new THREE.Matrix4();
  private comboHold = 0;
  /** Round outro: victory pose + camera before the results screen. */
  private outroStarted = false;
  private outroTimer = 0;
  private outroFighter: Fighter | null = null;
  private outroAngle = 0;
  private introFx = 0;
  lastTime = performance.now();
  roundTime = ROUND_SECONDS;
  paused = false;
  winner: string | null = null;
  debug = false;
  eventLog: string[] = [];
  fps = 60;
  camBasis = { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) };
  syncLog: import('./core/Types').PlayerSyncFrame[] = [];

  constructor(private readonly selection: Selection) {
    const glCanvas = document.getElementById('gl') as HTMLCanvasElement;
    const hudCanvas = document.getElementById('hud') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x9fc7e8);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.fog = new THREE.Fog(0x9fc7e8, 90, 220);
    this.scene.add(this.arena.group, this.effects.group);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.6);
    this.scene.add(this.hemi);
    this.mode = selection.mode;
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(20, 40, 15);
    // Projected character shadows: the sun renders a 2048 px shadow map over a 40 m window that
    // follows the fighters; only the shadow-catcher planes receive it (the cel stage keeps its look).
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.buildSky();

    this.camera = new DualTargetCamera(window.innerWidth / window.innerHeight);
    this.hud = new UIOverlay(hudCanvas);
    if (selection.mode === 'demo') hudCanvas.style.display = 'none';
    this.postfx = new PostFX(this.renderer, this.scene, this.camera.camera);
    this.applySettings();
    this.fsm = new CombatStateMachine(this, this.effects);
    this.hitboxes = new HitboxManager(this.fsm);
    this.scene.add(this.hitboxes.debugGroup);
    this.projectiles = new Projectiles(this.fsm, this.effects);
    this.scene.add(this.projectiles.group);
    this.support = new SupportSystem(this.fsm, this.projectiles, this.effects, this);
    this.fsm.projectiles = this.projectiles;
    this.fsm.opbrFx = this.opbrFx;
    this.scene.add(this.opbrFx.group);
    this.fsm.hasCinematicCam = (clip) => this.ultCams.has(clip);

    // CC2 celshade ramp (system/celshade.tex, row 8 = three-band character ramp)
    new THREE.TextureLoader().load('assets/ui/celshade_ramp.png', (tex) => {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.NoColorSpace;
      tex.flipY = false; // ramp rows are indexed from the top of celshade.tex, like the game
      RIG_RAMP.texture = tex;
      for (const f of this.allFighters) setRamp(f.rig.visual, tex, RIG_RAMP.row);
      this.log(`celshade ramp bound (row ${RIG_RAMP.row})`);
    });

    this.setupTeams();
    this.bindHotkeys();
    // Stage preference: Hidden Leaf Forest (sd03a, the blueprint's tournament stage), then the
    // Forest of Quiet Movement (sd05a). Override with ?stage=sd05a in the URL.
    const wanted = this.selection.stage.id;
    const idx = STAGES.findIndex((st) => st.id === wanted);
    this.stageIndex = idx >= 0 ? idx : 0;
    this.loadStage(this.stageIndex);
    window.addEventListener('resize', () => this.onResize());
    const boot = document.getElementById('boot');
    if (boot) boot.remove();
    requestAnimationFrame((t) => this.frame(t));
    // Background watchdog: browsers stop requestAnimationFrame for hidden/occluded tabs, which
    // would freeze the simulation (and any headless soak test). Keep the fixed-step sim running
    // from a timer when no frame has been drawn for a while; rendering resumes with the next rAF.
    window.setInterval(() => {
      const now = performance.now();
      if (now - this.lastTime > 120) this.frame(now, true);
    }, 1000 / 60);
    // Round start is announced by the Storm 2 "Go!" banner (see hudData.banner).
  }

  private buildSky(): void {
    const geo = new THREE.SphereGeometry(300, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(0.35,0.58,0.9); vec3 hor = vec3(0.78,0.86,0.94); vec3 c = mix(hor, top, smoothstep(0.0, 0.5, h)); gl_FragColor = vec4(c,1.0); }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
  }

  private setupTeams(): void {
    const sel = this.selection;
    const mode = sel.mode;
    // Player 1: keyboard + first pad (the attract demo hands the leader to a second AI brain).
    const kb = new KeyboardInputSource(mode === '2p' && SETTINGS.p2Device === 'KEYBOARD' ? P1_BINDINGS_WASD : P1_BINDINGS, window, 0);
    this.p1Source = kb;
    // A One Piece leader switches that pad to the Fighting Path layout (L1 skill palette).
    kb.opbrMode = !!sel.p1.leader.opbr;
    const p1Src: InputSource = mode === 'demo' ? new ScriptedInputSource() : kb;
    const mk = (def: CharacterDef, src: InputSource) => new Fighter(def, new InputManager(src));
    const p1Lead = mk(sel.p1.leader, p1Src);
    const p1Sups = sel.p1.supports.map((d, i) => { const f = mk(d, new ScriptedInputSource()); f.supportType = sel.p1.types[i] ?? d.supportType; return f; });
    this.team1 = new Team('P1', 1, p1Lead, p1Sups, p1Src);

    // Player 2: second pad / keyboard cluster in VS PLAYER, otherwise the AI brain (or a dummy).
    const p2Src: InputSource = mode === '2p' ? new KeyboardInputSource(P2_BINDINGS, window, SETTINGS.p2Device === 'KEYBOARD' ? 99 : 1) : new ScriptedInputSource();
    if (p2Src instanceof KeyboardInputSource) p2Src.opbrMode = !!sel.p2.leader.opbr;
    const p2Lead = mk(sel.p2.leader, p2Src);
    const p2Sups = sel.p2.supports.map((d, i) => { const f = mk(d, new ScriptedInputSource()); f.supportType = sel.p2.types[i] ?? d.supportType; return f; });
    this.team2 = new Team('P2', 2, p2Lead, p2Sups, p2Src);
    const aiSrc = p2Src instanceof ScriptedInputSource ? p2Src : new ScriptedInputSource();
    this.ai = new AIBrain(aiSrc, this.team2);
    this.ai.enabled = mode === 'cpu' || mode === 'demo' || new URLSearchParams(location.search).get('ai') === '1';
    if (mode === 'demo') { this.ai1 = new AIBrain(p1Src as ScriptedInputSource, this.team1, 3); this.ai1.enabled = true; }
    this.applySettings();

    this.allFighters = [p1Lead, ...p1Sups, p2Lead, ...p2Sups];
    for (const f of this.allFighters) {
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
    for (const f of this.allFighters) for (const o of this.allFighters) if (o.team !== f.team) f.rig.importDemoClips(o.def.animBank ?? o.def.code);
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
    const skill = { EASY: 0.55, NORMAL: 1, HARD: 1.6, ULTIMATE: 2.4 }[SETTINGS.difficulty] ?? 1;
    if (this.ai) this.ai.skill = skill;
    if (this.ai1) this.ai1.skill = skill;
    this.camera.distanceScale = SETTINGS.cameraScale;
    this.renderer.shadowMap.enabled = SETTINGS.shadows;
    this.audio.setVolume(SETTINGS.master * SETTINGS.sfx);
    bgm.setMusicVolume(musicVol(musicBase));
  }

  private resetRound(): void {
    for (const team of [this.team1, this.team2]) {
      // Ensure leaders are the original ones and benches are hidden
      for (const f of [...team.present]) if (f !== team.active) team.retire(f);
      team.stats.health = team.stats.healthMax;
      team.stats.chakra = 60; // Storm pacing: the ultimate has to be charged for
      team.stats.chakraMax = 100;
      team.stats.subStocks = 4;
      team.stats.subRechargeProgress = 0;
      team.stats.guardHealth = 100;
      team.stats.supportGauge = 0;
      team.stats.resetCombo();
    }
    const place = (f: Fighter, x: number, z: number) => {
      f.position.set(x, 0, z);
      f.velocity.set(0, 0, 0);
      f.grounded = true;
      f.stunFrames = 0;
      f.invulnFrames = 0;
      f.subLockFrames = 0;
      f.bounceOnLand = false;
      f.parryActive = false;
      f.autonomous = false;
      f.switchRequested = false;
      f.enterState(CombatState.IDLE_NEUTRAL);
      f.input.buffer.clear();
      f.rig.root.visible = true;
    };
    place(this.team1.active, -6, 0);
    place(this.team2.active, 6, 0);
    for (const t of [this.team1, this.team2]) for (const sp of t.supports) sp.rig.root.visible = false;
    this.resultsShown = false;
    this.outroStarted = false;
    this.outroTimer = 0;
    this.outroFighter = null;
    this.koTimer = 0;
    this.introFx = 0;
    this.maxCombo = [0, 0];
    this.dmgDealt = [0, 0];
    this.relinkTargets();
    this.team1.active.yaw = this.team1.active.yawToTarget();
    this.team2.active.yaw = this.team2.active.yawToTarget();
    // Round intro: both leaders play their entry clip (PL_ACT_BTL_BEFORE_LEADER) before "Go!".
    this.team1.active.enterState(CombatState.INTRO);
    this.team2.active.enterState(CombatState.INTRO);
    this.team1.active.introDelay = 0;
    this.team2.active.introDelay = 70; // 2P's entry starts when the camera reaches them
    for (const f of this.allFighters) { f.awakened = false; f.awakenTimer = 0; f.rig.setAwakened(false); }
    this.prevStates.clear();
    this.projectiles.clear();
    this.support.reset();
    this.roundTime = SETTINGS.roundTime || ROUND_SECONDS;
    this.winner = null;
    this.tick = 0;
    this.eventLog.length = 0;
    this.syncLog.length = 0;
    this.camera.snap();
  }

  /** Load a stage by index (F5 cycles). Falls back to the procedural arena when the GLB is missing. */
  private async loadStage(index: number): Promise<void> {
    if (this.stageLoading) return;
    this.stageLoading = true;
    this.stageIndex = ((index % STAGES.length) + STAGES.length) % STAGES.length;
    const st = STAGES[this.stageIndex];
    this.arena.unloadStage();
    const ok = await this.arena.tryLoadStage(`assets/stage_${st.id}.glb`);
    this.log(ok ? `stage bound: ${st.id} ${st.name}` : `stage ${st.id} missing, procedural arena`);
    this.hud.showToast(st.name, '#ffffff', 1.4);
    this.stageLoading = false;
    this.camera.arenaRadius = this.arena.radius;
    this.camera.limitFn = (a) => this.arena.limitAt(a);
    this.applyLighting(st.light ?? 'day');
  }

  private relinkTargets(): void {
    for (const f of this.team1.present) f.target = this.team2.active;
    for (const f of this.team2.present) f.target = this.team1.active;
    for (const sp of this.team1.supports) sp.target = this.team2.active;
    for (const sp of this.team2.supports) sp.target = this.team1.active;
  }

  private bindHotkeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.debug = !this.debug;
        this.hitboxes.debug = this.debug;
      } else if (e.code === 'KeyR') {
        this.resetRound();
        this.hud.showToast('REMATCH', '#ffffff', 0.8);
      } else if (e.code === 'KeyP') {
        if (this.mode !== 'demo') void this.openPause();
      } else if (e.code === 'F5') {
        e.preventDefault();
        this.loadStage(this.stageIndex + 1);
      } else if (e.code === 'F4') {
        e.preventDefault();
        this.ai.enabled = !this.ai.enabled;
        this.log(`AI ${this.ai.enabled ? 'enabled' : 'disabled (training dummy)'}`);
      } else if (e.code === 'Escape') {
        if (this.mode !== 'demo') void this.openPause();
      }
    });
  }

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.resize(window.innerWidth / window.innerHeight);
    this.hud.resize();
    this.postfx.resize(window.innerWidth, window.innerHeight);
  }

  // ---------------------------------------------------------------- events
  emit(kind: CombatEventKind, data: Partial<CombatEvent> & { text?: string; color?: number; shake?: number }): void {
    if (data.text) this.log(data.text);
    if (data.shake) this.camera.addShake(data.shake);
    if (kind === 'PARRY') this.hud.showToast('COUNTER!', '#9be7ff', 0.7);
    if (kind === 'GUARD_BREAK') this.hud.showToast('GUARD BREAK', '#ff3f3f', 0.7);
    if (kind === 'WALL_SPLAT') this.hud.showToast('WALL SPLAT', '#ffffff', 0.6);
    if (kind === 'CLASH' && data.text === 'DASH CLASH!') this.hud.showToast('CLASH', '#cfe9ff', 0.5);
    const who = this.allFighters.find((f) => f.id === data.attackerId);
    switch (kind) {
      case 'HIT': {
        if ((data.damage ?? 0) <= 0) break;
        const heavy = (data.damage ?? 0) >= 80;
        const blade = who?.def.hasBlade;
        this.audio.play(blade ? 'sword_hit' : heavy ? (Math.random() < 0.5 ? 'kick_hit2' : 'punch_hit2') : Math.random() < 0.5 ? 'punch_hit1' : 'kick_hit1', { pitchVar: 0.06 });
        if (heavy) this.audio.play('hit_S', { volume: 0.6 });
        const victim = this.allFighters.find((f) => f.id === data.defenderId);
        if (who) this.dmgDealt[who.team === this.team1 ? 0 : 1] += data.damage ?? 0;
        if (heavy) {
          this.postfx.aberration(0.9);
          if (victim && victim.grounded) this.effects.groundCrack(victim.position.clone().setY(victim.groundY), 1.3);
        } else if (victim) this.effects.gust(victim.position.clone().setY(victim.groundY), 1.4);
        // The One Piece fighters have no CC2 voice bank; their hits stay on the SFX layer.
        if (victim && !victim.def.opbr) this.audio.voice(victim.def.voiceCode ?? (victim.def.code === '9ind' ? '2ssk' : victim.def.code), (data.damage ?? 0) >= 150 ? 'dmgL_02' : heavy ? 'dmgM_02' : 'dmgS_02', { volume: 0.8 });
        break;
      }
      case 'GUARD_HIT': this.audio.play('guard', { pitchVar: 0.05 }); break;
      case 'GUARD_BREAK': { this.audio.play('exp1', { volume: 0.9 }); const vv = this.allFighters.find((f) => f.id === data.defenderId); if (vv) { if (!vv.def.opbr) this.audio.voice(vv.def.code, 'grdBrk_02'); this.postfx.shockwave(vv.position.clone().setY(vv.position.y + 1), this.camera.camera, 0.7, 0.4); this.postfx.impactFrame(0.7, 0xcfe8ff); } break; }
      case 'PARRY': this.audio.play('flash2'); break;
      case 'CLASH': this.audio.play('chakHit'); break;
      case 'SUB': this.audio.play('change'); break;
      case 'SPARK': this.audio.play('dash2', { volume: 0.8 }); break;
      case 'WALL_SPLAT': { this.audio.play('groundHit2'); const vv = this.allFighters.find((f) => f.id === data.defenderId); if (vv) { this.effects.groundCrack(vv.position.clone().setY(vv.groundY), 2.0); this.postfx.aberration(1.2); } break; }
      case 'SWITCH': this.audio.play(data.text?.includes('SUPPORT') ? 'cutin_support' : 'change'); break;
      case 'SFX': if (data.text) this.audio.play(data.text, { volume: 0.7, pitchVar: 0.05 }); break;
      case 'JUTSU': {
        // Jutsu demo: name toast on the way in, flash + jutsu sound on the finishing blow.
        if ((data.damage ?? 0) > 0) { screenFlash(); this.audio.play('exp1', { volume: 0.8 }); this.audio.play(who?.def.jutsuSfx ?? 'rasen', { volume: 0.8 }); const vv = this.allFighters.find((f) => f.id === data.defenderId); if (vv) { this.postfx.shockwave(vv.position.clone().setY(vv.position.y + 1), this.camera.camera, 1.2, 0.55); this.postfx.impactFrame(0.9); this.effects.groundCrack(vv.position.clone().setY(vv.groundY), 2.6, true); } }
        else { this.hud.showToast(who?.def.jutsuName ?? 'JUTSU', '#bfe8ff', 1.0); this.audio.play('flash', { volume: 0.6 }); }
        break;
      }
      case 'ULTIMATE': {
        if ((data.damage ?? 0) > 0) {
          screenFlash();
          bgm.setMusicVolume(musicVol(0.08)); setTimeout(() => bgm.setMusicVolume(musicVol(musicBase)), 6500);
          this.audio.play('exp2');
          { const vv = this.allFighters.find((f) => f.id === data.defenderId); const at = (vv ?? who)?.position.clone(); if (at) { at.y += 1; this.postfx.shockwave(at, this.camera.camera, 1.8, 0.8); this.postfx.impactFrame(1, 0xfff0c0); this.effects.groundCrack(at.clone().setY(at.y - 1), 3.4, true); } }
          this.audio.play(who?.def.ultimateSfx ?? 'raikiriHit', { volume: 0.9 });
          this.hud.showToast(who?.def.ultimateName ?? 'ULTIMATE', '#ffd166', 1.2);
        } else if (who) {
          showUltimateCutIn(who.def, who.team === this.team1 ? 1 : 2);
          this.audio.play('flash');
          this.audio.play('cutin_support', { volume: 0.5 });
        }
        break;
      }
      case 'AWAKEN': {
        if (who && data.text?.includes('AWAKENING') && !data.text.includes('ended')) {
          showAwakenBanner(who.def);
          this.audio.play('awake_open');
          this.audio.play('awakeFlash', { volume: 0.8 });
        } else this.audio.play('awake_off', { volume: 0.6 });
        break;
      }
    }
  }

  private loadUltCams(): void {
    for (const f of this.allFighters) {
      const bank = f.def.animBank ?? f.def.code;
      if (this.ultCamLoads.has(bank)) continue;
      this.ultCamLoads.add(bank);
      for (const file of [`assets/ult/${bank}.json`, `assets/ult/${bank}_skl.json`]) fetch(file).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!j) return;
        for (const [clip, data] of Object.entries(j as Record<string, { frames: { p: number[]; q: number[]; fov: number }[] }>)) {
          // Indra borrows Sasuke's clips under his own code
          this.ultCams.set(clip, data);
          if (bank !== f.def.code) this.ultCams.set(clip.replace(bank, f.def.code), data);
        }
      }).catch(() => {});
    }
  }

  /** While a cinematic finisher plays, drive the camera from the exported path (30 fps data). */
  private applyCinematicCamera(): boolean {
    const f = [this.team1.active, this.team2.active].find((x) => (x.state === CombatState.ULTIMATE || x.state === CombatState.JUTSU) && x.cinematic && x.currentMove);
    if (!f) { this.setLetterbox(false); return false; }
    const data = this.ultCams.get(f.currentMove!.clip);
    const glb = f.rig.glbRoot;
    if (!data || !glb || !data.frames.length) { this.setLetterbox(false); return false; }
    const idx = Math.min(data.frames.length - 1, Math.floor(f.moveFrame / 2));
    const k = data.frames[idx];
    glb.updateWorldMatrix(true, false);
    this.camP.set(k.p[0], k.p[1], k.p[2]).applyMatrix4(glb.matrixWorld);
    glb.getWorldQuaternion(this.camGQ);
    this.camQ.set(k.q[0], k.q[1], k.q[2], k.q[3]).premultiply(this.camGQ);
    this.camera.override(this.camP, this.camQ, k.fov);
    this.setLetterbox(true);
    return true;
  }

  /** KO camera: a slow orbit that pushes in on the loser while the sim runs in slow motion. */
  private applyKoCamera(dt: number): boolean {
    const l = this.koLoser;
    if (this.koTimer <= 0 || !l) return false;
    const t = 1 - Math.max(0, this.koTimer) / 2.6;
    this.koAngle += dt * 0.55;
    const r = 3.6 - 1.2 * t;
    const c = l.rig.root.position;
    this.camP.set(c.x + Math.sin(this.koAngle) * r, c.y + 1.7 - 0.5 * t, c.z + Math.cos(this.koAngle) * r);
    this.koM.lookAt(this.camP, new THREE.Vector3(c.x, c.y + 0.9, c.z), new THREE.Vector3(0, 1, 0));
    this.camQ.setFromRotationMatrix(this.koM);
    this.camera.override(this.camP, this.camQ, 36 - 4 * t);
    return true;
  }

  private async openPause(): Promise<void> {
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

  /** Round intro: the camera visits 1P's entry pose, then 2P's (whose entry starts on arrival). */
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
    if (!w.def.opbr) this.audio.voice(w.def.voiceCode ?? w.def.code, 'powerUP', { volume: 0.8 * SETTINGS.voice });
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

  private setLetterbox(on: boolean): void {
    const hud = document.getElementById('hud');
    if (on && !this.letterbox) {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;inset:0;z-index:16;pointer-events:none;';
      el.innerHTML = '<div style="position:absolute;left:0;right:0;top:0;height:11vh;background:#000"></div><div style="position:absolute;left:0;right:0;bottom:0;height:11vh;background:#000"></div>';
      document.body.appendChild(el);
      this.letterbox = el;
      if (hud) hud.style.opacity = '0';
    } else if (!on && this.letterbox) {
      this.letterbox.remove();
      this.letterbox = null;
      if (hud) hud.style.opacity = '1';
    }
  }

  /** State-transition sounds (dash, jump, landing, jutsu, throw, charge, KO). */
  private stateSounds(present: Fighter[]): void {
    for (const f of present) {
      const prev = this.prevStates.get(f.id);
      if (prev === f.state) continue;
      this.prevStates.set(f.id, f.state);
      const code = f.def.voiceCode ?? (f.def.animBank && !f.def.jutsuSfx ? f.def.animBank : f.def.code);
      // One Piece fighters have no CC2 voice bank — they stay silent on the voice layer.
      const v = (cue: string) => { if (!f.def.opbr) this.audio.voice(code === '9ind' ? '2ssk' : code, cue, { volume: 0.85 * SETTINGS.voice }); };
      this.stateVfx(f, prev ?? CombatState.IDLE_NEUTRAL);
      switch (f.state) {
        case CombatState.DASH_STARTUP: this.audio.play('dash', { volume: 0.7 }); v('ckrDash_01'); break;
        case CombatState.JUMPING: if (prev !== CombatState.COMBO_STRING && prev !== CombatState.JUTSU) this.audio.play('jump1', { volume: 0.6 }); break;
        case CombatState.NINJA_MOVE:
        case CombatState.HOLLOW_STEP: this.audio.play('jump2', { volume: 0.5 }); if (Math.random() < 0.35) v('ninjaMove_02'); break;
        case CombatState.IDLE_NEUTRAL:
        case CombatState.RUNNING: if (prev === CombatState.JUMPING || prev === CombatState.NINJA_MOVE) this.audio.play('landing', { volume: 0.5 }); break;
        case CombatState.JUTSU: this.audio.play(f.def.jutsuSfx ?? 'rasen', { volume: 0.9 }); v('skill01_01'); break;
        // One Piece skill: a heavy whoosh on start-up, the effects carry the rest.
        case CombatState.SKILL: this.audio.play(f.skill?.cinematic ? 'awakeFlash' : 'flash', { volume: 0.7 }); break;
        case CombatState.THROW: this.audio.play('shuriken', { volume: 0.7 }); if (Math.random() < 0.5) v('throw'); break;
        case CombatState.CHAKRA_CHARGE: this.audio.play('charge', { volume: 0.6 }); v('ckrCharge_01'); break;
        case CombatState.COMBO_STRING: this.audio.play(f.def.hasBlade ? 'sword_swing' : 'punch_swing', { volume: 0.45, pitchVar: 0.08 }); v(f.comboBranch === 'AIR' ? 'atkM_02' : 'atkS_02'); break;
        case CombatState.ULTIMATE: v('ougi_01_01'); break;
        case CombatState.AWAKEN: v('powerUP'); break;
        case CombatState.SUBSTITUTED: v('change_02'); break;
        case CombatState.KNOCKDOWN: this.audio.play('down', { volume: 0.6 }); break;
        case CombatState.DEAD: this.audio.play('ko'); v('dmgLose'); bgm.setMusicVolume(musicVol(0.1)); break;
        case CombatState.INTRO: if (f.team === this.team1) this.audio.play('battleStart'); break;
      }
    }
  }

  /** State-transition visuals: dust, gusts, ground rings, cracks, impact frames. */
  private stateVfx(f: Fighter, prev: CombatState): void {
    const p = f.position.clone(); p.y = f.groundY + 0.02;
    const col = f.def.color as number;
    switch (f.state) {
      case CombatState.DASH_STARTUP: this.effects.gust(p, 3.2, col); this.effects.dustKick(p, 8); break;
      case CombatState.DASH_HOMING: case CombatState.SPARK_DASH: this.effects.groundRing(p, 2.8, 0xffffff, 0.3); break;
      case CombatState.NINJA_MOVE: this.effects.dustKick(p, 6, 0.6); this.effects.gust(p, 2.2); break;
      case CombatState.HOLLOW_STEP: this.effects.gust(p, 2.0); break;
      case CombatState.IDLE_NEUTRAL: case CombatState.RUNNING:
        if (prev === CombatState.JUMPING || prev === CombatState.NINJA_MOVE || prev === CombatState.HOLLOW_STEP) this.effects.dustKick(p, 6, 0.6);
        break;
      case CombatState.KNOCKDOWN: this.effects.groundCrack(p, 1.9); this.postfx.shockwave(p, this.camera.camera, 0.5, 0.35); break;
      case CombatState.CRUMPLE: this.effects.dustKick(p, 6, 0.7); break;
      case CombatState.DEAD: this.effects.groundCrack(p, 2.6); this.postfx.impactFrame(1, 0xffe9c0); this.postfx.shockwave(p, this.camera.camera, 1.3, 0.6); break;
      case CombatState.ULTIMATE: this.effects.el.aura(f.def.ultElement ?? f.def.element ?? 'wind', p, f.def.chakraColor ?? col, 1.6); this.effects.gust(p, 4.5, col); this.effects.dustKick(p, 12, 1.0, 1.3); break;
      case CombatState.AWAKEN: this.effects.el.aura(f.def.element ?? 'wind', p, f.def.chakraColor ?? col, 2.0); this.effects.gust(p, 5, col); this.effects.groundCrack(p, 3.0, true); this.postfx.shockwave(p, this.camera.camera, 1.0, 0.6); break;
      case CombatState.CHAKRA_CHARGE: this.effects.groundRing(p, 1.6, col, 0.5); break;
      case CombatState.JUTSU: this.effects.el.aura(f.def.element ?? 'wind', p, f.def.chakraColor ?? col, 1.0); break;
      case CombatState.DODGE: this.effects.gust(p, 1.8); break;
    }
  }

  log(text: string): void {
    this.eventLog.push(`[${this.tick}] ${text}`);
    if (this.eventLog.length > 200) this.eventLog.shift();
  }

  // ------------------------------------------------------------ simulation
  private step(dt: number): void {
    this.tick++;
    // 7. Camera basis for camera-relative input
    this.camera.groundForward(this.camBasis.forward);
    this.camera.groundRight(this.camBasis.right);

    this.ai.update(dt, this.camBasis);
    this.ai1?.update(dt, this.camBasis);

    for (const team of [this.team1, this.team2]) team.stats.tick(dt);

    // Fighters present in the arena this tick
    const present = [...this.team1.present, ...this.team2.present];
    for (const f of present) this.controllers.get(f)!.tick(this.tick, dt, this.camBasis);
    // Watchdog: no fighter stays frozen in hitstop or locked in a reaction for long.
    for (const f of present) {
      f.frozenTicks = f.hitstopFrames > 0 ? f.frozenTicks + 1 : 0;
      if (f.frozenTicks > 720) { f.hitstopFrames = 0; f.heldBy = 0; f.frozenTicks = 0; this.log(`${f.def.code}: watchdog released hitstop`); }
      if (WATCH_STATES.has(f.state) && f.stateFrame > 480 && !f.heldBy) {
        f.tetherFrames = 0; f.tetherBy = 0;
        f.enterState(f.grounded ? CombatState.IDLE_NEUTRAL : CombatState.LAUNCHED);
        this.log(`${f.def.code}: watchdog released ${f.state}`);
      }
    }

    // Leader switch requests
    for (const team of [this.team1, this.team2]) {
      const lead = team.active;
      if (lead.switchRequested) {
        lead.switchRequested = false;
        if (team.stats.spendSupport(LEADER_SWITCH_COST)) {
          const p = lead.position.clone();
          p.y += 0.5;
          this.effects.switchFlash(p, team.supports[0].def.color as number);
          const inc = team.performSwitch();
          this.controllers.get(inc)!.tick(this.tick, dt, this.camBasis);
          this.relinkTargets();
          this.log(`${team.name}: LEADER SWITCH -> ${inc.def.displayName}`);
          this.hud.showToast('SWITCH', '#c084fc', 0.5);
        }
      }
    }

    // Support calls (R1 / Y) and automatic interventions
    for (const team of [this.team1, this.team2]) this.support.pollInput(team);
    this.support.update(dt, [this.team1, this.team2]);

    // Shuriken release frames → projectiles
    for (const f of [...this.team1.present, ...this.team2.present]) {
      if (f.throwRequested) {
        f.throwRequested = false;
        if (f.stats.spendChakra(BALANCE.CHAKRA_USE_AT_CHAKRA_PROJ * 0.3)) this.projectiles.throw(f, f.target);
      }
    }
    this.projectiles.update(dt, [...this.team1.present, ...this.team2.present]);

    // 4. Collision pass
    this.hitboxes.update([...this.team1.present, ...this.team2.present]);
    this.stateSounds(present);

    // Retire autonomous outgoing fighters once their action completes
    for (const team of [this.team1, this.team2]) {
      for (const f of [...team.present]) {
        if (f.autonomous && !this.support.isSupporting(f) && NEUTRAL_STATES.has(f.state) && f.stateFrame > 8) {
          const p = f.position.clone();
          p.y += 0.5;
          this.effects.smokePuff(p, 0xffffff, 6);
          team.retire(f);
        }
      }
    }

    // Guard spheres
    for (const team of [this.team1, this.team2]) {
      const f = team.active;
      const show = f.state === CombatState.GUARDING || f.state === CombatState.GUARD_COUNTER || f.state === CombatState.BLOCKSTUN;
      this.guardSpheres.get(team)!.update(f.position, show, team.stats.guardColor, f.state === CombatState.BLOCKSTUN ? 1 : 0);
    }

    // Round clock / win check
    if (!this.winner) {
      if (SETTINGS.roundTime !== 0 && this.mode !== 'training' && this.mode !== 'demo') this.roundTime = Math.max(0, this.roundTime - dt);
      if (this.team1.stats.isDead) this.winner = this.team2.active.def.displayName;
      else if (this.team2.stats.isDead) this.winner = this.team1.active.def.displayName;
      else if (this.roundTime <= 0) {
        this.winner = this.team1.stats.health >= this.team2.stats.health ? this.team1.active.def.displayName : this.team2.active.def.displayName;
      }
      if (this.winner) {
        this.log(`${this.winner} WINS`);
        const loserTeam = this.team1.stats.isDead ? this.team1 : this.team2.stats.isDead ? this.team2 : null;
        if (loserTeam) { this.koLoser = loserTeam.active; this.koTimer = 2.6; this.koAngle = this.koLoser.yaw + Math.PI * 0.75; }
      }
    }

    // StormRevival-style sync frames (ring of the last 120 ticks)
    this.syncLog.push(this.team1.active.snapshot(this.tick), this.team2.active.snapshot(this.tick));
    if (this.syncLog.length > 240) this.syncLog.splice(0, this.syncLog.length - 240);
  }

  private frame(now: number, background = false): void {
    if (!background) requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.25) dt = 0.25;
    this.fps = this.fps * 0.9 + (1 / Math.max(dt, 1e-3)) * 0.1;

    // Controller system buttons: Options = pause, Create = rematch. While paused the sim is not
    // stepping (so the pad is not sampled), poll it here.
    const pad = this.p1Source.pad;
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
    if (this.winner && this.koTimer <= 0 && !this.outroStarted) this.startOutro();
    if (this.outroStarted && !this.resultsShown) { this.outroTimer -= dt; if (this.outroTimer <= 0) void this.showResults(); }
    for (let i = 0; i < 2; i++) this.maxCombo[i] = Math.max(this.maxCombo[i], (i === 0 ? this.team2 : this.team1).stats.comboHits);

    // KO: the last blow plays out in slow motion while the camera circles the loser.
    const timeScale = this.koTimer > 0 ? 0.32 : 1;
    if (this.koTimer > 0) this.koTimer -= dt;
    if (!this.paused) {
      this.accumulator += dt * timeScale;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 6) {
        this.step(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
      }
    }

    this.loadUltCams();
    // Render interpolation: the sim runs at a fixed 60 Hz, the display may not. Place every rig
    // between its previous and current tick transform by the accumulator fraction so motion is
    // smooth at any refresh rate, and advance skeletal animation by render time (frozen in hitstop).
    const alpha = this.paused ? 1 : Math.min(1, this.accumulator / FIXED_DT);
    for (const f of [...this.team1.present, ...this.team2.present]) {
      if (f.hitstopFrames > 0 || !f.rig.root.visible) continue;
      f.rig.root.position.lerpVectors(f.prevPosition, f.position, alpha);
      let dy = f.yaw - f.prevYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      f.rig.root.rotation.y = f.prevYaw + dy * alpha;
      f.rig.updateShadow(f.rig.root.position.y - f.groundY);
      if (!this.paused) f.rig.advance(dt * timeScale);
    }
    // Combo camera: a landed string on either side swings the view to the side and pushes in.
    const hitStates = new Set([CombatState.HITSTUN, CombatState.LAUNCHED, CombatState.TUMBLE, CombatState.CRUMPLE, CombatState.BLOCKSTUN]);
    const a1 = this.team1.active, a2 = this.team2.active;
    const stringOn = (a: Fighter, v: Fighter) => (a.state === CombatState.COMBO_STRING || a.state === CombatState.JUTSU) && (hitStates.has(v.state) || v.tetherFrames > 0);
    this.comboHold = stringOn(a1, a2) || stringOn(a2, a1) ? 0.7 : Math.max(0, this.comboHold - dt);
    this.camera.comboTarget = this.comboHold > 0 ? 1 : 0;
    // Shadow window follows the fighters
    const mid = this.team1.active.rig.root.position.clone().lerp(this.team2.active.rig.root.position, 0.5);
    this.sun.target.position.copy(mid);
    this.sun.position.copy(mid).add(new THREE.Vector3(20, 40, 15));
    this.effects.update(dt);
    this.opbrFx.update(dt);
    this.camera.dashTarget = a1.state === CombatState.DASH_HOMING || a1.state === CombatState.DASH_STARTUP || a1.state === CombatState.SPARK_DASH ? 1 : 0;
    // Frame for the taller of the two leaders (the One Piece roster ranges 1.4 m to 3 m).
    const tall = Math.max(this.team1.active.def.opbr?.height ?? 1.85, this.team2.active.def.opbr?.height ?? 1.85);
    this.camera.sizeScale = 1 + Math.max(0, tall - 1.95) * 0.34;
    if (!this.applyIntroCamera() && !this.applyKoCamera(dt) && !this.applyWinCamera(dt) && !this.applyCinematicCamera()) this.camera.update(this.team1.active.rig.root.position, this.team2.active.rig.root.position, dt);
    if (background) return;
    // Smear frames on fast travel, radial blur while P1 dashes, chakra heat around jutsu.
    for (const f of [...this.team1.present, ...this.team2.present]) {
      const sp = Math.hypot(f.velocity.x, f.velocity.z);
      const streak = SETTINGS.postFx && sp > 9 && (f.state === CombatState.COMBO_STRING || f.state === CombatState.JUTSU || f.state === CombatState.SKILL || f.state === CombatState.SPARK_DASH || f.state === CombatState.DASH_HOMING || f.state === CombatState.TUMBLE || (f.state === CombatState.ULTIMATE && f.ultimatePhase === 1));
      if (streak) { this.smearTmp.set(f.velocity.x, f.velocity.y * 0.3, f.velocity.z).multiplyScalar(0.022); if (this.smearTmp.length() > 0.55) this.smearTmp.setLength(0.55); f.rig.setSmear(this.smearTmp); }
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
    if (this.mode !== 'demo') this.hud.draw(this.hudData(), dt);
  }

  private hudFighter(team: Team, other: Team): HudFighterData {
    const f = team.active;
    const s = team.stats;
    return {
      name: f.def.displayName,
      code: f.def.code,
      color: `#${new THREE.Color(f.def.color).getHexString()}`,
      health: s.health,
      healthMax: s.healthMax,
      chakra: s.chakra,
      chakraMax: s.chakraMax,
      penaltyActive: s.penaltyActive,
      subStocks: s.subStocks,
      subProgress: s.subRechargeProgress,
      guardHealth: s.guardHealth,
      supportGauge: s.supportGauge,
      state: f.state,
      stateFrame: f.stateFrame,
      comboHits: other.stats.comboHits,
      comboDamage: other.stats.comboDamage,
      isLeader: true,
      portrait: f.def.portrait ?? null,
      supports: team.supports.map((sp) => ({ name: sp.def.displayName, portrait: sp.def.portrait ?? null, type: sp.supportType, ready: s.supportGauge >= BALANCE.SUPPORT_GAUGE_USE_NORMAL && sp.supportCooldown <= 0 && !sp.rig.root.visible })),
      human: team === this.team1 ? this.mode !== 'demo' : this.mode === '2p',
      awakened: f.awakened,
      ultimateReady: s.chakra >= 90,
      gaugeName: f.def.opbr?.gaugeName,
      haki: f.hakiFrames > 0,
      skills: f.def.opbr
        ? [...f.def.opbr.skills.map((sk, i) => ({
            name: sk.name,
            button: ['L1+O', 'L1+/\\', 'L1+[]', 'L1+X'][i] ?? `S${i + 1}`,
            cooldown: f.skillCooldowns[i],
            max: sk.cooldown,
            cost: sk.cost,
            ready: f.skillCooldowns[i] <= 0 && s.chakra >= sk.cost,
          })), {
            name: f.def.opbr.ultimate.name,
            button: 'R1+O',
            cooldown: 0,
            max: 0,
            cost: f.def.opbr.ultimate.cost,
            ready: s.chakra >= f.def.opbr.ultimate.cost,
          }]
        : undefined,
      act: bindingFor(f.state, { moveClip: null, moveDir: f.moveDirLocal, hitDir: f.lastHitDir, airborne: !f.grounded, falling: f.velocity.y < -0.5, stateFrame: f.stateFrame, framesLeft: f.stunFrames }).act,
    };
  }

  private hudData() {
    return {
      p1: this.hudFighter(this.team1, this.team2),
      p2: this.hudFighter(this.team2, this.team1),
      roundTime: this.roundTime,
      fps: this.fps,
      tick: this.tick,
      debug: this.debug,
      events: this.eventLog,
      winner: this.winner,
      paused: this.paused,
      controller: this.p1Source.pad.snap.connected ? this.p1Source.pad.label : null,
      banner: this.winner ? (this.roundTime <= 0 ? ('timeup' as const) : null) : this.tick < 100 ? ('go' as const) : null,
      winnerSide: this.winner ? (this.winner === this.team1.active.def.displayName && !this.team1.stats.isDead ? (1 as const) : (2 as const)) : (0 as const),
    };
  }
}

declare global {
  interface Window {
    storm: Game;
  }
}

/** Battle setup lives in the URL (?p1=2nrt,2ssk&p2=2kks,2gar&stage=sd03a) so a reload rematches. */
function goToSelect(mode: GameMode): void {
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
    demo.audio.muted = true; // the attract match behind the menus is visual only
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
