"""Session 8 cameras: jutsu demo cinematics (skl1_atk clips with their exported cameras), KO
slow-motion orbit, chakra-dash push-in. Plus the jutsu demo damage."""
import os, re
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:100]; return s.replace(old, new, count)

# ---------------------------------------------------------------- FSM: jutsu demo
def fsm(s):
    s = rep(s, "  private updateJutsu(f: Fighter, dt: number): void {\n    const move = f.currentMove;\n    if (!move) {\n      f.enterState(CombatState.IDLE_NEUTRAL);\n      return;\n    }\n    f.moveFrame++;\n",
"""  /** Set by the game: does an exported cinematic camera exist for this clip? */
  hasCinematicCam: (clip: string) => boolean = () => false;

  private updateJutsu(f: Fighter, dt: number): void {
    const move = f.currentMove;
    if (!move) {
      f.enterState(CombatState.IDLE_NEUTRAL);
      return;
    }
    f.moveFrame++;
    if (f.cinematic) { this.updateJutsuDemo(f, move); return; }
    const t = f.target;
    // Jutsu demo (Storm: the real `skl1_atk` clip + its camera once the jutsu connects).
    if (t && f.landedHitIds.size > 0 && !f.jutsuDemoDone) {
      const demoClip = `${f.def.code}skl1_atk1`;
      if (f.rig.hasClip(demoClip) && this.hasCinematicCam(demoClip)) {
        f.jutsuDemoDone = true;
        const frames = Math.max(40, Math.round(f.rig.clipDuration(demoClip) * 60));
        f.beginMove({ ...move, clip: demoClip, totalFrames: frames, hitboxes: [] }, 'NEUTRAL', 0);
        f.moveFrame = 0;
        f.cinematic = true;
        f.hitstopFrames = 0;
        f.velocity.set(0, 0, 0);
        f.forward(this.tmpA);
        t.position.copy(f.position).addScaledVector(this.tmpA, 1.5);
        t.position.y = t.groundY;
        t.velocity.set(0, 0, 0);
        t.yaw = Math.atan2(-this.tmpA.x, -this.tmpA.z);
        t.enterState(CombatState.HITSTUN);
        t.stunFrames = frames + 10;
        t.hitstopFrames = 0;
        this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: t.id, damage: 0, text: `${f.def.displayName}: ${f.def.jutsuName ?? 'JUTSU'} — demo`, color: 0xbfe8ff });
        return;
      }
    }
""")
    s = rep(s, "  private updateJutsu(f: Fighter, dt: number): void {", """  /** Jutsu demo: attacker rooted on the demo clip, victim frozen in frame, launched on the last frame. */
  private updateJutsuDemo(f: Fighter, move: MoveDef): void {
    const t = f.target;
    f.velocity.set(0, 0, 0);
    f.invulnFrames = 2;
    const col = f.def.color as number;
    if (f.moveFrame % 4 === 0) { f.rig.socketWorld(SOCKET.R_HAND, this.tmpB); this.effects.spriteBurst('magic', this.tmpB, { color: col, count: 2, size: 0.7, life: 0.3, speed: 1.0, up: 0.8, additive: true, spin: 5, spread: 0.4, fadeIn: 0.1 }); }
    if (f.moveFrame >= move.totalFrames - 24 && f.moveFrame % 2 === 0 && t) { this.effects.spriteBurst('spark', t.position.clone().setY(t.position.y + 1), { color: 0xfff1a8, count: 2, size: 0.45, life: 0.28, speed: 4, additive: true, gravity: -8 }); }
    if (f.moveFrame === Math.floor(move.totalFrames * 0.75)) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.clashBurst(this.tmpB); this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: f.def.jutsuSfx ?? 'rasen' }); }
    if (t) {
      t.hitstopFrames = Math.max(t.hitstopFrames, 2);
      t.invulnFrames = 2;
      t.velocity.set(0, 0, 0);
      t.flashTimer = 0;
    }
    if (f.moveFrame >= move.totalFrames) {
      f.cinematic = false;
      if (t) {
        f.forward(this.tmpA);
        t.hitstopFrames = 0;
        const dmg = t.stats.applyDamage(JUTSU_DEMO_DAMAGE * (f.awakened ? AWAKEN_DAMAGE_MULT : 1));
        t.velocity.set(this.tmpA.x * 20, 8, this.tmpA.z * 20);
        t.grounded = false;
        t.stunFrames = 50;
        t.lastHitBy = f.id;
        t.enterState(CombatState.TUMBLE);
        t.bounceOnLand = true;
        this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: t.id, damage: dmg, text: `${f.def.displayName}: ${f.def.jutsuName ?? 'JUTSU'} HIT!`, color: 0xbfe8ff, shake: 0.6 });
      }
      f.enterState(CombatState.IDLE_NEUTRAL);
    }
  }

  private updateJutsu(f: Fighter, dt: number): void {""")
    s = rep(s, """  startJutsu(f: Fighter): void {
    f.enterState(CombatState.JUTSU);""", """  startJutsu(f: Fighter): void {
    f.enterState(CombatState.JUTSU);
    f.jutsuDemoDone = false;
    f.cinematic = false;""")
    s = rep(s, "const JUTSU_COST = 30;", "const JUTSU_COST = 30;\n/** Damage dealt by the jutsu demo finish (the palm hit that starts it deals its own). */\nconst JUTSU_DEMO_DAMAGE = 140;")
    return s
rw('src/combat/CombatStateMachine.ts', fsm, 'updateJutsuDemo')
rw('src/combat/Fighter.ts', lambda s: rep(s, "  cinematic = false;", "  cinematic = false;\n  /** The jutsu demo already played this activation (one per jutsu). */\n  jutsuDemoDone = false;"), 'jutsuDemoDone')

# ---------------------------------------------------------------- camera: dash push-in
def cam(s):
    s = rep(s, "  COMBO_FOV: 44,\n};", "  COMBO_FOV: 44,\n  // Chakra dash: the camera tucks in behind the dasher and the lens widens for speed.\n  DASH_BACK: 0.5,\n  DASH_FOV: 9,\n};")
    s = rep(s, "  arenaRadius = ARENA_RADIUS;", "  arenaRadius = ARENA_RADIUS;\n  /** 1 while P1 is chakra-dashing (set by the game). */\n  dashTarget = 0;\n  private dashWeight = 0;")
    s = rep(s, "    // Combo camera blend\n", "    // Dash push-in\n    this.dashWeight += (this.dashTarget - this.dashWeight) * Math.min(1, (this.dashTarget > this.dashWeight ? 7 : 3) * dt);\n    this.cTarget.addScaledVector(this.uSep, P.DASH_BACK * this.dashWeight);\n\n    // Combo camera blend\n")
    s = rep(s, "    const fov = fovN + (P.COMBO_FOV - fovN) * this.comboWeight;", "    const fov = fovN + (P.COMBO_FOV - fovN) * this.comboWeight + P.DASH_FOV * this.dashWeight;")
    return s
rw('src/systems/DualTargetCamera.ts', cam, 'dashTarget')

# ---------------------------------------------------------------- main: hooks
def main(s):
    s = rep(s, "    this.fsm.projectiles = this.projectiles;", "    this.fsm.projectiles = this.projectiles;\n    this.fsm.hasCinematicCam = (clip) => this.ultCams.has(clip);")
    s = rep(s, """      fetch(`assets/ult/${bank}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!j) return;""", """      for (const file of [`assets/ult/${bank}.json`, `assets/ult/${bank}_skl.json`]) fetch(file).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!j) return;""")
    s = rep(s, "const f = [this.team1.active, this.team2.active].find((x) => x.state === CombatState.ULTIMATE && x.cinematic && x.currentMove);",
               "const f = [this.team1.active, this.team2.active].find((x) => (x.state === CombatState.ULTIMATE || x.state === CombatState.JUTSU) && x.cinematic && x.currentMove);")
    s = rep(s, "  accumulator = 0;", "  accumulator = 0;\n  /** KO camera: seconds left of the slow-motion orbit on the loser. */\n  koTimer = 0;\n  private koAngle = 0;\n  private koLoser: Fighter | null = null;\n  private koM = new THREE.Matrix4();")
    s = rep(s, "      if (this.winner) this.log(`${this.winner} WINS`);", """      if (this.winner) {
        this.log(`${this.winner} WINS`);
        const loserTeam = this.team1.stats.isDead ? this.team1 : this.team2.stats.isDead ? this.team2 : null;
        if (loserTeam) { this.koLoser = loserTeam.active; this.koTimer = 2.6; this.koAngle = this.koLoser.yaw + Math.PI * 0.75; }
      }""")
    s = rep(s, """    if (!this.paused) {
      this.accumulator += dt;""", """    // KO: the last blow plays out in slow motion while the camera circles the loser.
    const timeScale = this.koTimer > 0 ? 0.32 : 1;
    if (this.koTimer > 0) this.koTimer -= dt;
    if (!this.paused) {
      this.accumulator += dt * timeScale;""")
    s = rep(s, "      if (!this.paused) f.rig.advance(dt);", "      if (!this.paused) f.rig.advance(dt * timeScale);")
    s = rep(s, "    if (!this.applyCinematicCamera()) this.camera.update(this.team1.active.rig.root.position, this.team2.active.rig.root.position, dt);",
"""    this.camera.dashTarget = a1.state === CombatState.DASH_HOMING || a1.state === CombatState.DASH_STARTUP || a1.state === CombatState.SPARK_DASH ? 1 : 0;
    if (!this.applyKoCamera(dt) && !this.applyCinematicCamera()) this.camera.update(this.team1.active.rig.root.position, this.team2.active.rig.root.position, dt);""")
    s = rep(s, "  private setLetterbox(on: boolean): void {", """  /** KO camera: a slow orbit that pushes in on the loser while the sim runs in slow motion. */
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

  private setLetterbox(on: boolean): void {""")
    return s
rw('src/main.ts', main, 'applyKoCamera')
print('ok')
