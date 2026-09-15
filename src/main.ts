/**
 * main.ts — Entry point. Builds the arena, lighting, dual-target camera, two teams
 * (P1: Naruto 2nrt leader / Sasuke support, P2: Sasuke 2ssk AI leader / Naruto support),
 * and runs a deterministic 60 Hz fixed-step simulation with a decoupled render loop.
 */
import * as THREE from 'three';
import { FIXED_DT, CombatState, CombatEvent, CombatEventKind, LEADER_SWITCH_COST, NEUTRAL_STATES } from './core/Types';
import { InputManager, KeyboardInputSource, P1_BINDINGS, ScriptedInputSource } from './core/InputManager';
import { PAD } from './core/GamepadState';
import { NARUTO_DEF, SASUKE_DEF } from './combat/CharacterDefs';
import { ROSTER, findCharacter } from './combat/Roster';
import { CharacterSelect, Selection } from './ui/CharacterSelect';
import { CharacterDef } from './core/Types';
import { Fighter, Team, EventSink } from './combat/Fighter';
import { CombatStateMachine } from './combat/CombatStateMachine';
import { HitboxManager } from './combat/HitboxManager';
import { PlayerController } from './combat/PlayerController';
import { AIBrain } from './combat/AIBrain';
import { DualTargetCamera } from './systems/DualTargetCamera';
import { ArenaEnvironment } from './systems/ArenaEnvironment';
import { Effects, GuardSphere } from './render/Effects';
import { UIOverlay, HudFighterData } from './ui/UIOverlay';
import { Projectiles } from './combat/Projectiles';
import { SupportSystem } from './combat/SupportSystem';
import { RIG_RAMP } from './render/FighterRig';
import { setRamp } from './render/Shaders';
import { BALANCE, bindingFor } from './combat/StormStates';

/** Stages exported from the Storm 2 data (docs/proto: sd03a Hidden Leaf Forest, sd05a Forest of Quiet Movement, sd01d Forest of Death). */
export const STAGES = [
  { id: 'sd03a', name: 'HIDDEN LEAF FOREST' },
  { id: 'sd05a', name: 'FOREST OF QUIET MOVEMENT' },
  { id: 'sd01d', name: 'FOREST OF DEATH' },
];

const ROUND_SECONDS = 99;

class Game implements EventSink {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: DualTargetCamera;
  arena = new ArenaEnvironment();
  effects = new Effects();
  hud: UIOverlay;
  fsm: CombatStateMachine;
  hitboxes: HitboxManager;
  projectiles: Projectiles;
  support: SupportSystem;
  stageIndex = 0;
  stageLoading = false;

  team1!: Team;
  team2!: Team;
  controllers = new Map<Fighter, PlayerController>();
  allFighters: Fighter[] = [];
  ai!: AIBrain;
  p1Source!: KeyboardInputSource;
  guardSpheres = new Map<Team, GuardSphere>();

  tick = 0;
  accumulator = 0;
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
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(20, 40, 15);
    this.scene.add(sun);
    this.buildSky();

    this.camera = new DualTargetCamera(window.innerWidth / window.innerHeight);
    this.hud = new UIOverlay(hudCanvas);
    this.fsm = new CombatStateMachine(this, this.effects);
    this.hitboxes = new HitboxManager(this.fsm);
    this.scene.add(this.hitboxes.debugGroup);
    this.projectiles = new Projectiles(this.fsm, this.effects);
    this.scene.add(this.projectiles.group);
    this.support = new SupportSystem(this.fsm, this.projectiles, this.effects, this);

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
    // Player 1: human. Leader Naruto, support Sasuke.
    const kb = new KeyboardInputSource(P1_BINDINGS);
    this.p1Source = kb;
    const sel = this.selection;
    const p1Lead = new Fighter(sel.p1.leader, new InputManager(kb));
    const p1Sup = new Fighter(sel.p1.support, new InputManager(new ScriptedInputSource()));
    this.team1 = new Team('P1', 1, p1Lead, p1Sup, kb);

    // Player 2: AI / training dummy with the chosen pair.
    const aiSrc = new ScriptedInputSource();
    const p2Lead = new Fighter(sel.p2.leader, new InputManager(aiSrc));
    const p2Sup = new Fighter(sel.p2.support, new InputManager(new ScriptedInputSource()));
    this.team2 = new Team('P2', 2, p2Lead, p2Sup, aiSrc);
    this.ai = new AIBrain(aiSrc, this.team2);
    // Training dummy by default: the enemy stands still until F4 (or ?ai=1) enables the AI.
    this.ai.enabled = new URLSearchParams(location.search).get('ai') === '1';

    this.allFighters = [p1Lead, p1Sup, p2Lead, p2Sup];
    for (const f of this.allFighters) {
      this.scene.add(f.rig.root);
      this.controllers.set(f, new PlayerController(f, this.fsm, this.arena));
      f.rig.tryLoadGlb().then((ok) => {
        if (ok) this.log(`${f.def.code}: GLB rig bound`);
      });
    }
    for (const team of [this.team1, this.team2]) {
      const gs = new GuardSphere();
      this.scene.add(gs.mesh);
      this.guardSpheres.set(team, gs);
    }
    this.resetRound();
  }

  private resetRound(): void {
    for (const team of [this.team1, this.team2]) {
      // Ensure leaders are the original ones and benches are hidden
      for (const f of [...team.present]) if (f !== team.active) team.retire(f);
      team.stats.health = team.stats.healthMax;
      team.stats.chakra = 100;
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
    this.team1.bench.rig.root.visible = false;
    this.team2.bench.rig.root.visible = false;
    this.relinkTargets();
    this.team1.active.yaw = this.team1.active.yawToTarget();
    this.team2.active.yaw = this.team2.active.yawToTarget();
    this.projectiles.clear();
    this.support.reset();
    this.roundTime = ROUND_SECONDS;
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
  }

  private relinkTargets(): void {
    for (const f of this.team1.present) f.target = this.team2.active;
    for (const f of this.team2.present) f.target = this.team1.active;
    this.team1.bench.target = this.team2.active;
    this.team2.bench.target = this.team1.active;
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
        this.paused = !this.paused;
      } else if (e.code === 'F5') {
        e.preventDefault();
        this.loadStage(this.stageIndex + 1);
      } else if (e.code === 'F4') {
        e.preventDefault();
        this.ai.enabled = !this.ai.enabled;
        this.log(`AI ${this.ai.enabled ? 'enabled' : 'disabled (training dummy)'}`);
      } else if (e.code === 'Escape') {
        returnToSelect();
      }
    });
  }

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.resize(window.innerWidth / window.innerHeight);
    this.hud.resize();
  }

  // ---------------------------------------------------------------- events
  emit(kind: CombatEventKind, data: Partial<CombatEvent> & { text?: string; color?: number; shake?: number }): void {
    if (data.text) this.log(data.text);
    if (data.shake) this.camera.addShake(data.shake);
    if (kind === 'PARRY') this.hud.showToast('COUNTER!', '#9be7ff', 0.7);
    if (kind === 'GUARD_BREAK') this.hud.showToast('GUARD BREAK', '#ff3f3f', 0.7);
    if (kind === 'WALL_SPLAT') this.hud.showToast('WALL SPLAT', '#ffffff', 0.6);
    if (kind === 'CLASH' && data.text === 'DASH CLASH!') this.hud.showToast('CLASH', '#cfe9ff', 0.5);
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

    for (const team of [this.team1, this.team2]) team.stats.tick(dt);

    // Fighters present in the arena this tick
    const present = [...this.team1.present, ...this.team2.present];
    for (const f of present) this.controllers.get(f)!.tick(this.tick, dt, this.camBasis);

    // Leader switch requests
    for (const team of [this.team1, this.team2]) {
      const lead = team.active;
      if (lead.switchRequested) {
        lead.switchRequested = false;
        if (team.stats.spendSupport(LEADER_SWITCH_COST)) {
          const p = lead.position.clone();
          p.y += 0.5;
          this.effects.switchFlash(p, team.bench.def.color as number);
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
      this.roundTime = Math.max(0, this.roundTime - dt);
      if (this.team1.stats.isDead) this.winner = this.team2.active.def.displayName;
      else if (this.team2.stats.isDead) this.winner = this.team1.active.def.displayName;
      else if (this.roundTime <= 0) {
        this.winner = this.team1.stats.health >= this.team2.stats.health ? this.team1.active.def.displayName : this.team2.active.def.displayName;
      }
      if (this.winner) this.log(`${this.winner} WINS`);
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
    if (pad.justPressed(PAD.OPTIONS)) this.paused = !this.paused;
    if (pad.justPressed(PAD.CREATE)) {
      this.resetRound();
      this.hud.showToast('REMATCH', '#ffffff', 0.8);
    }

    if (!this.paused) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 6) {
        this.step(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps++;
      }
    }

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
      if (!this.paused) f.rig.advance(dt);
    }
    this.effects.update(dt);
    this.camera.update(this.team1.active.rig.root.position, this.team2.active.rig.root.position, dt);
    if (background) return;
    this.renderer.render(this.scene, this.camera.camera);
    this.hud.draw(this.hudData(), dt);
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
      partnerName: team.bench.def.displayName,
      portrait: f.def.portrait ?? null,
      supportPortrait: team.bench.def.portrait ?? null,
      supportType: team.bench.def.supportType,
      supportReady: s.supportGauge >= BALANCE.SUPPORT_GAUGE_USE_NORMAL && team.bench.supportCooldown <= 0 && !team.bench.rig.root.visible,
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
function selectionFromUrl(): Selection | null {
  const q = new URLSearchParams(location.search);
  const pair = (v: string | null) => {
    const [a, b] = (v ?? '').split(',');
    const lead = findCharacter(a), sup = findCharacter(b);
    return lead && sup ? { leader: lead, support: sup } : null;
  };
  const p1 = pair(q.get('p1')), p2 = pair(q.get('p2'));
  const stage = STAGES.find((st) => st.id === q.get('stage')) ?? STAGES[0];
  if (p1 && p2) return { p1, p2, stage };
  return null;
}

function returnToSelect(): void {
  const q = new URLSearchParams(location.search);
  q.delete('p1'); q.delete('p2'); q.delete('stage');
  location.href = `${location.pathname}${q.toString() ? '?' + q.toString() : ''}`;
}

async function boot(): Promise<void> {
  let sel = selectionFromUrl();
  if (!sel) {
    const boot = document.getElementById('boot');
    if (boot) boot.remove();
    sel = await new CharacterSelect(ROSTER, STAGES).run();
    const q = new URLSearchParams(location.search);
    q.set('p1', `${sel.p1.leader.code},${sel.p1.support.code}`);
    q.set('p2', `${sel.p2.leader.code},${sel.p2.support.code}`);
    q.set('stage', sel.stage.id);
    history.replaceState(null, '', `${location.pathname}?${q.toString()}`);
  }
  window.storm = new Game(sel);
}
void NARUTO_DEF; void SASUKE_DEF; void (null as unknown as CharacterDef);
boot();
