"""Ultimate cinematics: after the rush connects, the attacker plays the real `spl1_atk` clip while
the exported Storm 4 camera path (public/assets/ult/<code>.json) drives the engine camera; the
victim is held in frame and launched at the end. Letterbox bars, HUD hidden."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:100]; return s.replace(old, new, count)

def fighter(s):
    s = rep(s, "  ultimatePhase = 0;\n  ultimateLanded = false;\n", "  ultimatePhase = 0;\n  ultimateLanded = false;\n  /** Cinematic finisher clip in progress (camera path + held victim). */\n  cinematic = false;\n")
    return s
rw('src/combat/Fighter.ts', fighter, 'cinematic = false')

def rig(s):
    s = rep(s, """  /** Keep the shadow on the ground""", """  hasClip(name: string): boolean { return this.clips.has(name); }
  clipDuration(name: string): number { return this.clips.get(name)?.duration ?? 0; }

  /** Keep the shadow on the ground""")
    return s
rw('src/render/FighterRig.ts', rig, 'clipDuration(name')

def fsm(s):
    s = rep(s, """    const landed = f.landedHitIds.size > 0;
    if (landed && !f.ultimateLanded) {
      // Finisher connected: long freeze, camera slam, the enemy is sent flying by the hitbox.
      f.ultimateLanded = true;
      f.ultimatePhase = 2;
      f.velocity.set(0, 0, 0);
      f.hitstopFrames = 22;
      if (t) t.hitstopFrames = 22;
      const p = f.position.clone(); p.y += 1;
      this.effects.clashBurst(p);
      this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: t?.id ?? -1, damage: 380, text: `${f.def.displayName}: ${f.def.ultimateName ?? 'ULTIMATE'} HIT!`, color: 0xffffff, shake: 0.8 });
      return;
    }""", """    const landed = f.landedHitIds.size > 0;
    if (landed && !f.ultimateLanded) {
      // Finisher connected. With a cinematic clip (spl1_atk + exported camera) the demo plays out
      // with the victim held in frame; otherwise a long freeze and a camera slam.
      f.ultimateLanded = true;
      f.ultimatePhase = 2;
      f.velocity.set(0, 0, 0);
      const p = f.position.clone(); p.y += 1;
      this.effects.clashBurst(p);
      const atkClip = `${f.def.code}spl1_atk`;
      if (t && f.rig.hasClip(atkClip)) {
        const frames = Math.max(60, Math.round(f.rig.clipDuration(atkClip) * 60));
        f.beginMove({ ...move, clip: atkClip, totalFrames: frames, hitboxes: [] }, 'NEUTRAL', 0);
        f.moveFrame = 0;
        f.cinematic = true;
        f.hitstopFrames = 0;
        // Hold the victim at the demo's contact spot, facing the attacker, frozen in the hit pose.
        f.forward(this.tmpA);
        t.position.copy(f.position).addScaledVector(this.tmpA, 1.7);
        t.position.y = t.groundY;
        t.velocity.set(0, 0, 0);
        t.yaw = Math.atan2(-this.tmpA.x, -this.tmpA.z);
        t.enterState(CombatState.HITSTUN);
        t.stunFrames = frames + 10;
        this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: t.id, damage: 0, text: `${f.def.displayName}: ${f.def.ultimateName ?? 'ULTIMATE'} — demo`, color: 0xffffff });
      } else {
        f.hitstopFrames = 22;
        if (t) t.hitstopFrames = 22;
        this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: t?.id ?? -1, damage: 380, text: `${f.def.displayName}: ${f.def.ultimateName ?? 'ULTIMATE'} HIT!`, color: 0xffffff, shake: 0.8 });
      }
      return;
    }
    if (f.cinematic) {
      // Demo: attacker rooted, victim frozen and invulnerable, launched hard on the last frame.
      f.velocity.set(0, 0, 0);
      if (t) {
        t.hitstopFrames = Math.max(t.hitstopFrames, 2);
        t.invulnFrames = 2;
        t.velocity.set(0, 0, 0);
      }
      if (f.moveFrame >= move.totalFrames) {
        f.cinematic = false;
        if (t) {
          f.forward(this.tmpA);
          t.hitstopFrames = 0;
          t.velocity.set(this.tmpA.x * 26, 9, this.tmpA.z * 26);
          t.grounded = false;
          t.stunFrames = 60;
          t.lastHitBy = f.id;
          t.enterState(CombatState.TUMBLE);
          t.bounceOnLand = true;
        }
        this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: t?.id ?? -1, damage: 380, text: `${f.def.displayName}: ${f.def.ultimateName ?? 'ULTIMATE'} FINISH!`, color: 0xffffff, shake: 0.9 });
        f.enterState(CombatState.IDLE_NEUTRAL);
      }
      return;
    }""")
    # the ultimate hitbox connects → 380 damage at contact already; keep. Also leaving the state must clear cinematic.
    s = rep(s, """  private startUltimate(f: Fighter): void {
    f.stats.chakra = 0;""", """  private startUltimate(f: Fighter): void {
    f.cinematic = false;
    f.stats.chakra = 0;""")
    return s
rw('src/combat/CombatStateMachine.ts', fsm, 'f.cinematic = true')

def cam(s):
    s = rep(s, """  /** Force the camera to snap to the target on the next update (used on round start / sub). */""", """  /** Cinematic override: place the camera directly and keep the smoothing state in sync so the
   *  return to gameplay blends instead of popping. */
  override(pos: THREE.Vector3, quat: THREE.Quaternion, fov: number): void {
    this.position.copy(pos);
    this.camera.position.copy(pos);
    this.camera.quaternion.copy(quat);
    this.tmp.set(0, 0, -1).applyQuaternion(quat);
    this.lookAt.copy(pos).addScaledVector(this.tmp, 4);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.initialized = true;
  }

  /** Force the camera to snap to the target on the next update (used on round start / sub). */""")
    return s
rw('src/systems/DualTargetCamera.ts', cam, 'override(pos')

def main(s):
    s = rep(s, """  audio = new AudioManager();""", """  audio = new AudioManager();
  /** Exported Storm 4 ultimate camera paths, per clip name (assets/ult/<code>.json). */
  private ultCams = new Map<string, { frames: { p: number[]; q: number[]; fov: number }[] }>();
  private ultCamLoads = new Set<string>();
  private letterbox: HTMLDivElement | null = null;
  private camQ = new THREE.Quaternion();
  private camP = new THREE.Vector3();
  private camGQ = new THREE.Quaternion();""")
    s = rep(s, """    // Render interpolation: the sim runs at a fixed 60 Hz, the display may not.""", """    this.loadUltCams();
    // Render interpolation: the sim runs at a fixed 60 Hz, the display may not.""")
    s = rep(s, """    this.effects.update(dt);
    this.camera.update(this.team1.active.rig.root.position, this.team2.active.rig.root.position, dt);
    if (background) return;""", """    this.effects.update(dt);
    if (!this.applyCinematicCamera()) this.camera.update(this.team1.active.rig.root.position, this.team2.active.rig.root.position, dt);
    if (background) return;""")
    s = rep(s, """  /** State-transition sounds (dash, jump, landing, jutsu, throw, charge, KO). */""", """  private loadUltCams(): void {
    for (const f of this.allFighters) {
      const bank = f.def.animBank ?? f.def.code;
      if (this.ultCamLoads.has(bank)) continue;
      this.ultCamLoads.add(bank);
      fetch(`assets/ult/${bank}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => {
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
    const f = [this.team1.active, this.team2.active].find((x) => x.state === CombatState.ULTIMATE && x.cinematic && x.currentMove);
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

  /** State-transition sounds (dash, jump, landing, jutsu, throw, charge, KO). */""")
    # keep the victim's rig frozen visually: hitstop already skips rig updates
    return s
rw('src/main.ts', main, 'applyCinematicCamera')
print('ok')
