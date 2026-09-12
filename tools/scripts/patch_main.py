"""Wire the overhaul into main.ts: projectiles, support system, celshade ramp, stage cycling,
shuriken spawning, HUD portrait/support fields."""
p = r'C:\Users\ysoyo\OneDrive\Desktop\wan\storm4-proto\src\main.ts'
s = open(p, encoding='utf-8').read()

def rep(old, new):
    global s
    assert old in s, old[:90]
    s = s.replace(old, new, 1)

rep("import { UIOverlay, HudFighterData } from './ui/UIOverlay';",
    """import { UIOverlay, HudFighterData } from './ui/UIOverlay';
import { Projectiles } from './combat/Projectiles';
import { SupportSystem } from './combat/SupportSystem';
import { RIG_RAMP } from './render/FighterRig';
import { setRamp } from './render/Shaders';
import { BALANCE, bindingFor } from './combat/StormStates';

/** Stages exported from the Storm 2 data (docs/proto: sd03a Hidden Leaf Forest, sd05a Forest of Quiet Movement, sd01d Forest of Death). */
const STAGES = [
  { id: 'sd03a', name: 'HIDDEN LEAF FOREST' },
  { id: 'sd05a', name: 'FOREST OF QUIET MOVEMENT' },
  { id: 'sd01d', name: 'FOREST OF DEATH' },
];""")

rep("""  fsm: CombatStateMachine;
  hitboxes: HitboxManager;
""", """  fsm: CombatStateMachine;
  hitboxes: HitboxManager;
  projectiles: Projectiles;
  support: SupportSystem;
  stageIndex = 0;
  stageLoading = false;
""")

rep("""    this.fsm = new CombatStateMachine(this, this.effects);
    this.hitboxes = new HitboxManager(this.fsm);
    this.scene.add(this.hitboxes.debugGroup);
""", """    this.fsm = new CombatStateMachine(this, this.effects);
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
      RIG_RAMP.texture = tex;
      for (const f of this.allFighters) setRamp(f.rig.visual, tex, RIG_RAMP.row);
      this.log('celshade ramp bound (row 8)');
    });
""")

# stage selection: replace the candidate loop with stage index logic
rep("""    const wanted = new URLSearchParams(location.search).get('stage');
    const candidates = wanted ? [`assets/stage_${wanted}.glb`] : ['assets/stage_sd03a.glb', 'assets/stage_sd05a.glb'];
    (async () => {
      for (const path of candidates) {
        if (await this.arena.tryLoadStage(path)) {
          this.log(`stage bound: ${this.arena.stageName}`);
          break;
        }
      }
    })();""", """    const wanted = new URLSearchParams(location.search).get('stage');
    const idx = STAGES.findIndex((st) => st.id === wanted);
    this.stageIndex = idx >= 0 ? idx : 0;
    this.loadStage(this.stageIndex);""")

rep("""  private relinkTargets(): void {""", """  /** Load a stage by index (F5 cycles). Falls back to the procedural arena when the GLB is missing. */
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

  private relinkTargets(): void {""")

# hotkeys: F5 cycles stage
rep("""      } else if (e.code === 'F4') {""", """      } else if (e.code === 'F5') {
        e.preventDefault();
        this.loadStage(this.stageIndex + 1);
      } else if (e.code === 'F4') {""")

# reset: clear projectiles + supports
rep("""    this.roundTime = ROUND_SECONDS;
    this.winner = null;""", """    this.projectiles.clear();
    this.support.reset();
    this.roundTime = ROUND_SECONDS;
    this.winner = null;""")

# step: support input + update, shuriken spawn, projectile update (after collision pass)
rep("""    // 4. Collision pass
    this.hitboxes.update([...this.team1.present, ...this.team2.present]);""", """    // Support calls (R1 / Y) and automatic interventions
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
    this.hitboxes.update([...this.team1.present, ...this.team2.present]);""")

# HUD fields
rep("""      isLeader: true,
      partnerName: team.bench.def.displayName,
    };""", """      isLeader: true,
      partnerName: team.bench.def.displayName,
      portrait: f.def.portrait ?? null,
      supportPortrait: team.bench.def.portrait ?? null,
      supportType: team.bench.def.supportType,
      supportReady: s.supportGauge >= BALANCE.SUPPORT_GAUGE_USE_NORMAL && team.bench.supportCooldown <= 0 && !team.bench.rig.root.visible,
      act: bindingFor(f.state, { moveClip: null, moveDir: f.moveDirLocal, hitDir: f.lastHitDir, airborne: !f.grounded, falling: f.velocity.y < -0.5, stateFrame: f.stateFrame, framesLeft: f.stunFrames }).act,
    };""")

# autonomous retire: do not retire fighters that the support system is driving
rep("""        if (f.autonomous && NEUTRAL_STATES.has(f.state) && f.stateFrame > 8) {""", """        if (f.autonomous && !this.support.isSupporting(f) && NEUTRAL_STATES.has(f.state) && f.stateFrame > 8) {""")

open(p, 'w', encoding='utf-8').write(s)
print('main patched')
