"""Playtest round 2: combo tethering, proper air time / no sliding, air throws and throw-cancels,
ultimate VFX, closer camera + Storm combo camera, character voices."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:100]; return s.replace(old, new, count)

# ------------------------------------------------------------------ Types: friction
def types(s):
    s = rep(s, "export const RUN_DECEL = 45.0;", "export const RUN_DECEL = 70.0;")
    return s
rw('src/core/Types.ts', types, 'RUN_DECEL = 70.0')

# ------------------------------------------------------------------ Fighter: tether fields
def fighter(s):
    s = rep(s, "  /** Cinematic finisher clip in progress (camera path + held victim). */\n  cinematic = false;\n",
               "  /** Cinematic finisher clip in progress (camera path + held victim). */\n  cinematic = false;\n  /** Combo tether: held in the attacker's string until it ends (id of the attacker, frames left). */\n  tetherBy = 0;\n  tetherFrames = 0;\n")
    return s
rw('src/combat/Fighter.ts', fighter, 'tetherBy = 0')

# ------------------------------------------------------------------ StormStates: throw / air dash clips
def states(s):
    s = rep(s, """      if (ctx.airDash)
        return { act: 'PL_ACT_NMOVE_SIDE', anm: 'PL_ANM_DSH_' + ctx.moveDir, clips: [O(dirClip('{c}', ctx.moveDir, { F: 'dsf0', B: 'dsb0', L: 'dsl0', R: 'dsr0' })), L('{c}jmp1')] };""",
               """      if (ctx.airDash)
        return { act: 'PL_ACT_NMOVE_SIDE', anm: 'PL_ANM_DSH_' + ctx.moveDir, clips: [O(dirClip('{c}', ctx.moveDir, { F: 'dsf0', B: 'dsb0', L: 'dsl0', R: 'dsr0' }), '{c}jmp1'), L('{c}jmp1')] };""")
    s = rep(s, """    case CombatState.THROW:
      return { act: 'PL_ACT_PRJ_LAND', anm: 'PL_ANM_PRJ_LAND', clips: [O('{c}cma00'), O('{c}nut0')] };""",
               """    case CombatState.THROW:
      return ctx.airborne
        ? { act: 'PL_ACT_PRJ_AIR', anm: 'PL_ANM_PRJ_AIR', clips: [O('{c}itma0', '{c}jmp1'), O('{c}itmg0', '{c}jmp1'), L('{c}jmp1')] }
        : { act: 'PL_ACT_PRJ_LAND', anm: 'PL_ANM_PRJ_LAND', clips: [O('{c}itmg0', '{c}nut0'), O('{c}cmr00', '{c}nut0'), O('{c}nut0')] };""")
    return s
rw('src/combat/StormStates.ts', states, "itma0")

# ------------------------------------------------------------------ PlayerController: kill landing slide
def pc(s):
    s = rep(s, """    if (f.position.y <= gy + 0.001) {
      f.position.y = gy;
      if (f.velocity.y < 0) f.velocity.y = 0;
      f.grounded = true;""", """    if (f.position.y <= gy + 0.001) {
      f.position.y = gy;
      if (f.velocity.y < 0) f.velocity.y = 0;
      if (!f.grounded && (f.state === CombatState.JUMPING || f.state === CombatState.NINJA_MOVE || f.state === CombatState.THROW)) {
        // Touchdown: no carried momentum — the run state rebuilds speed from the stick.
        f.velocity.x *= 0.15;
        f.velocity.z *= 0.15;
      }
      f.grounded = true;""")
    s = rep(s, "        airDash: f.airDashFrames > 0,", "        airDash: f.airDashed && !f.grounded,")
    return s
rw('src/combat/PlayerController.ts', pc, 'Touchdown')

# ------------------------------------------------------------------ FSM
def fsm(s):
    # ninja move: real hop, constant speed, no chain loop, lands cleanly
    s = rep(s, """    f.velocity.x = this.tmpC.x * NINJA_MOVE_SPEED;
    f.velocity.z = this.tmpC.z * NINJA_MOVE_SPEED;
    f.velocity.y = 3.2;
    f.grounded = false;
    this.faceTarget(f);
  }""", """    f.velocity.x = this.tmpC.x * NINJA_MOVE_SPEED;
    f.velocity.z = this.tmpC.z * NINJA_MOVE_SPEED;
    f.velocity.y = 5.0; // ~0.3 s of air time: the whole side-step clip plays out
    f.grounded = false;
    f.position.y += 0.02;
    this.faceTarget(f);
  }""")
    s = rep(s, """  private updateNinjaMove(f: Fighter, dt: number, mag: number): void {
    this.faceTarget(f);
    const buf = f.input.buffer;
    if (f.stateFrame > 5) {""", """  private updateNinjaMove(f: Fighter, dt: number, mag: number): void {
    this.faceTarget(f);
    const buf = f.input.buffer;
    // Airborne part: hold the hop speed (no friction, no steering); landing kills the momentum.
    if (!f.grounded) {
      const sp = Math.hypot(f.velocity.x, f.velocity.z);
      if (sp > 1e-3 && sp < NINJA_MOVE_SPEED * 0.9) { f.velocity.x *= NINJA_MOVE_SPEED * 0.9 / sp; f.velocity.z *= NINJA_MOVE_SPEED * 0.9 / sp; }
    } else if (f.stateFrame > 2) {
      this.applyFriction(f, dt, 90);
    }
    if (buf.consume(InputFlag.THROW) && f.stateFrame > 2) {
      // Shuriken cancels the side step (momentum kept, the throw clip takes over).
      f.enterState(CombatState.THROW);
      return;
    }
    if (f.stateFrame > 5) {""")
    s = rep(s, """    if (f.stateFrame >= NINJA_MOVE_FRAMES && f.grounded) {
      // Chain only on a fresh press: a held jump button (pad) used to loop the hop forever and
      // read as a "slide lock".
      if (mag > 0.15 && buf.wasPressedWithin(InputFlag.JUMP, 6)) {
        buf.consume(InputFlag.JUMP);
        f.enterState(CombatState.NINJA_MOVE);
        this.beginNinjaMove(f);
        return;
      }
      f.enterState(mag > 0.15 ? CombatState.RUNNING : CombatState.IDLE_NEUTRAL);
    } else if (f.stateFrame >= NINJA_MOVE_FRAMES + 24) {
      // Hopped off a ledge / slope: hand over to the jump state instead of hanging in the hop.
      f.enterState(CombatState.JUMPING);
    }
  }""", """    if (f.grounded && f.stateFrame >= 6) {
      // Landed: chain only on a fresh press (a held pad button looped the hop = "slide lock").
      if (mag > 0.15 && buf.wasPressedWithin(InputFlag.JUMP, 6)) {
        buf.consume(InputFlag.JUMP);
        f.enterState(CombatState.NINJA_MOVE);
        this.beginNinjaMove(f);
        return;
      }
      if (f.stateFrame >= 10) f.enterState(mag > 0.15 ? CombatState.RUNNING : CombatState.IDLE_NEUTRAL);
    } else if (f.stateFrame >= 50) {
      // Hopped off a ledge / slope: hand over to the jump state instead of hanging in the hop.
      f.enterState(CombatState.JUMPING);
    }
  }""")
    # jumping: air throw, air dash with full clip, glide window
    s = rep(s, """    if (buf.consume(InputFlag.ATTACK)) {
      this.startCombo(f, 'AIR');
      return;
    }
    if (buf.consume(InputFlag.JUMP)) {
      if (mag > 0.15 && !f.airDashed) {
        // Air ninja move: a sideways burst (PL_ACT_NMOVE_SIDE in the air), once per jump.
        f.airDashed = true;
        f.airDashFrames = 14;
        f.velocity.x = this.moveDir.x * 13;
        f.velocity.z = this.moveDir.z * 13;
        f.velocity.y = Math.max(f.velocity.y, 3.0);""", """    if (buf.consume(InputFlag.ATTACK)) {
      this.startCombo(f, 'AIR');
      return;
    }
    if (buf.consume(InputFlag.THROW)) {
      f.enterState(CombatState.THROW); // air shuriken (PRJ_AIR), momentum kept
      return;
    }
    if (buf.consume(InputFlag.JUMP)) {
      if (mag > 0.15 && !f.airDashed) {
        // Air ninja move: a sideways burst (PL_ACT_NMOVE_SIDE in the air), once per jump.
        f.airDashed = true;
        f.airDashFrames = 12;
        f.velocity.x = this.moveDir.x * 12;
        f.velocity.z = this.moveDir.z * 12;
        f.velocity.y = Math.max(f.velocity.y, 2.5);""")
    # throw in the air keeps falling, exits to JUMPING
    s = rep(s, """  private updateThrow(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 60);
    if (f.stateFrame < 6) this.faceTarget(f, 0.6);""", """  private updateThrow(f: Fighter, dt: number): void {
    if (f.grounded) this.applyFriction(f, dt, 60);
    else { f.velocity.x *= 1 - 1.5 * dt; f.velocity.z *= 1 - 1.5 * dt; }
    if (f.stateFrame < 6) this.faceTarget(f, 0.6);""")
    # combo tether: victims stay attached to a string until it ends
    s = rep(s, """    defender.velocity.set(this.tmpA.x * hb.knockback, hb.launch, this.tmpA.z * hb.knockback);
    defender.stunFrames = hb.hitstunFrames;""", """    defender.velocity.set(this.tmpA.x * hb.knockback, hb.launch, this.tmpA.z * hb.knockback);
    defender.stunFrames = hb.hitstunFrames;
    // Combo tether (Storm "juggle lock"): while the attacker is inside a string that still has
    // follow-ups, the victim stays attached — hitstun cannot run out, they hover in air strings and
    // are held at striking distance — so a string that starts, lands.
    if ((attacker.state === CombatState.COMBO_STRING || attacker.state === CombatState.SUPPORT_ACT) && attacker.currentMove) {
      const moves = this.stringFor(attacker, attacker.comboBranch);
      const last = attacker.comboIndex >= moves.length - 1;
      if (!last) {
        defender.tetherBy = attacker.id;
        defender.tetherFrames = attacker.currentMove.totalFrames - attacker.moveFrame + 16;
        // keep them close: cap the knockback so the next hit reaches
        defender.velocity.x *= 0.35; defender.velocity.z *= 0.35;
      } else {
        defender.tetherBy = 0; defender.tetherFrames = 0;
      }
    } else {
      defender.tetherBy = 0; defender.tetherFrames = 0;
    }""")
    s = rep(s, """  private updateHitstun(f: Fighter, dt: number): void {
    if (this.trySubstitute(f)) return;
    this.applyFriction(f, dt, 26);
    f.stunFrames--;
    if (f.stunFrames <= 0 && f.grounded) f.enterState(CombatState.IDLE_NEUTRAL);
  }""", """  /** Tethered victim upkeep: returns true while the attacker's string still holds them. */
  private applyTether(f: Fighter): boolean {
    if (!f.tetherBy || f.tetherFrames <= 0) return false;
    const a = f.target && f.target.id === f.tetherBy ? f.target : null;
    if (!a || a.state !== CombatState.COMBO_STRING || a.hitstopFrames > 0 && f.hitstopFrames > 0) {
      if (!a || a.state !== CombatState.COMBO_STRING) { f.tetherBy = 0; f.tetherFrames = 0; return false; }
    }
    f.tetherFrames--;
    // Hold at striking distance in front of the attacker, facing them; no gravity while held in the air.
    a.forward(this.tmpA);
    this.tmpB.copy(a.position).addScaledVector(this.tmpA, 1.35);
    f.position.x += (this.tmpB.x - f.position.x) * 0.3;
    f.position.z += (this.tmpB.z - f.position.z) * 0.3;
    f.velocity.x *= 0.5; f.velocity.z *= 0.5;
    if (!f.grounded || !a.grounded) {
      const want = a.position.y + (a.grounded ? 0 : 0.2);
      f.position.y += (Math.max(f.groundY, want) - f.position.y) * 0.25;
      f.velocity.y = 0;
      f.grounded = f.position.y <= f.groundY + 0.001;
    }
    f.yaw = Math.atan2(-this.tmpA.x, -this.tmpA.z);
    if (f.stunFrames < 2) f.stunFrames = 2;
    return true;
  }

  private updateHitstun(f: Fighter, dt: number): void {
    if (this.trySubstitute(f)) return;
    if (this.applyTether(f)) return;
    this.applyFriction(f, dt, 40);
    f.stunFrames--;
    if (f.stunFrames <= 0 && f.grounded) f.enterState(CombatState.IDLE_NEUTRAL);
  }""")
    s = rep(s, """  private updateLaunched(f: Fighter, dt: number): void {
    if (this.trySubstitute(f)) return;
    // Light air drag""", """  private updateLaunched(f: Fighter, dt: number): void {
    if (this.trySubstitute(f)) return;
    if (this.applyTether(f)) return;
    // Light air drag""")
    # ultimate VFX during the cinematic + rush
    s = rep(s, """    if (f.cinematic) {
      // Demo: attacker rooted, victim frozen and invulnerable, launched hard on the last frame.
      f.velocity.set(0, 0, 0);""", """    if (f.cinematic) {
      // Demo: attacker rooted, victim frozen and invulnerable, launched hard on the last frame.
      f.velocity.set(0, 0, 0);
      // Cinematic VFX: chakra aura on the body, periodic flashes, a big burst near the climax.
      const col = f.def.color as number;
      if (f.moveFrame % 3 === 0) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.spriteBurst('magic', this.tmpB, { color: col, count: 2, size: 0.9, life: 0.35, speed: 1.2, up: 1.2, additive: true, spin: 4, spread: 0.5, fadeIn: 0.15 }); }
      if (f.moveFrame % 10 === 0) { f.rig.socketWorld(SOCKET.R_HAND, this.tmpB); this.effects.flash('light', this.tmpB, 1.4, 0xffffff, 0.16); }
      if (f.moveFrame === Math.floor(move.totalFrames * 0.7)) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.clashBurst(this.tmpB); this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: f.def.ultimateSfx ?? 'exp2' }); }
      if (f.moveFrame >= move.totalFrames - 30 && f.moveFrame % 2 === 0 && t) { this.effects.spriteBurst('spark', t.position.clone().setY(t.position.y + 1), { color: 0xfff1a8, count: 3, size: 0.5, life: 0.3, speed: 5, additive: true, gravity: -8 }); }""")
    s = rep(s, """      if (f.moveFrame <= hb.activeEnd && t) {
        this.faceTarget(f, 1);
        f.forward(this.tmpA);""", """      if (f.moveFrame <= hb.activeEnd && t) {
        this.faceTarget(f, 1);
        if (f.moveFrame % 2 === 0) { f.rig.socketWorld(SOCKET.CHEST, this.tmpB); this.effects.spriteBurst('light', this.tmpB, { color: f.def.color as number, count: 1, size: 1.6, life: 0.25, speed: 0, up: 0, additive: true, grow: 2 }); }
        f.forward(this.tmpA);""")
    s = rep(s, """    if (f.moveFrame <= ULTIMATE_CUTIN) {
      // Cut-in: both fighters hold while the portrait slides in.
      f.velocity.set(0, 0, 0);""", """    if (f.moveFrame <= ULTIMATE_CUTIN) {
      // Cut-in: both fighters hold while the portrait slides in; chakra flares off the body.
      f.velocity.set(0, 0, 0);
      if (f.moveFrame % 3 === 0) { const p = f.position.clone(); p.y += 0.9; this.effects.chargeAura(p, f.def.color as number); }""")
    return s
rw('src/combat/CombatStateMachine.ts', fsm, 'applyTether(')

# ------------------------------------------------------------------ Camera: closer + combo camera
def cam(s):
    s = rep(s, """  BACK_MIN: 2.6,
  BACK_K: 0.2,
  BACK_MAX: 7.0,
  SIDE: 1.15,
  UP_MIN: 1.45,
  UP_K: 0.09,
  UP_MAX: 3.0,
  LOOK_MIX: 0.34,
  LOOK_UP: 1.0,
  FOV_MIN: 42,
  FOV_MAX: 56,""", """  BACK_MIN: 2.15,
  BACK_K: 0.18,
  BACK_MAX: 6.5,
  SIDE: 1.0,
  UP_MIN: 1.3,
  UP_K: 0.08,
  UP_MAX: 2.8,
  LOOK_MIX: 0.36,
  LOOK_UP: 1.0,
  FOV_MIN: 40,
  FOV_MAX: 54,
  // Combo camera: while a string connects the view swings to the side (2D-fighter framing) and
  // pushes in slowly; it eases back out when the exchange ends.
  COMBO_DIST: 4.4,
  COMBO_PUSH: 0.35,
  COMBO_MIN_DIST: 3.2,
  COMBO_UP: 1.25,
  COMBO_FOV: 44,""")
    s = rep(s, """  /** Playable radius of the current stage (set by the game after a stage loads). */
  arenaRadius = ARENA_RADIUS;""", """  /** Playable radius of the current stage (set by the game after a stage loads). */
  arenaRadius = ARENA_RADIUS;
  /** Combo camera weight target (0 = normal orbit, 1 = side view), smoothed in update(). */
  comboTarget = 0;
  private comboWeight = 0;
  private comboTime = 0;
  private comboSide = 1;
  private cCombo = new THREE.Vector3();
  private lookCombo = new THREE.Vector3();""")
    s = rep(s, """    this.cTarget.copy(p1).addScaledVector(this.uSep, -back).addScaledVector(this.nLat, P.SIDE);
    this.cTarget.y = Math.max(p1.y, p2.y) * 0.35 + Math.min(p1.y, p2.y) * 0.65 + up;
    this.pMid.copy(p1).lerp(p2, P.LOOK_MIX);
    this.pMid.y += P.LOOK_UP;
""", """    this.cTarget.copy(p1).addScaledVector(this.uSep, -back).addScaledVector(this.nLat, P.SIDE);
    this.cTarget.y = Math.max(p1.y, p2.y) * 0.35 + Math.min(p1.y, p2.y) * 0.65 + up;
    this.pMid.copy(p1).lerp(p2, P.LOOK_MIX);
    this.pMid.y += P.LOOK_UP;

    // Combo camera blend
    const rateIn = 5.0, rateOut = 2.2;
    const wPrev = this.comboWeight;
    this.comboWeight += (this.comboTarget - this.comboWeight) * Math.min(1, (this.comboTarget > this.comboWeight ? rateIn : rateOut) * dt);
    if (this.comboTarget > 0.5) this.comboTime += dt; else this.comboTime = Math.max(0, this.comboTime - dt * 2);
    if (wPrev < 0.02 && this.comboWeight >= 0.02) {
      // pick the side that keeps the camera closest to where it already is
      this.comboSide = this.nLat.dot(this.tmp.subVectors(this.position, this.pMid)) >= 0 ? 1 : -1;
    }
    if (this.comboWeight > 0.001) {
      const dist = Math.max(P.COMBO_MIN_DIST, P.COMBO_DIST - P.COMBO_PUSH * this.comboTime + d * 0.35);
      this.lookCombo.addVectors(p1, p2).multiplyScalar(0.5);
      this.lookCombo.y = Math.max(p1.y, p2.y) * 0.5 + Math.min(p1.y, p2.y) * 0.5 + P.COMBO_UP * 0.8;
      this.cCombo.copy(this.lookCombo).addScaledVector(this.nLat, dist * this.comboSide / this.side);
      this.cCombo.y = this.lookCombo.y + P.COMBO_UP * 0.5;
      const w = this.comboWeight * this.comboWeight * (3 - 2 * this.comboWeight);
      this.cTarget.lerp(this.cCombo, w);
      this.pMid.lerp(this.lookCombo, w);
    }
""")
    s = rep(s, """    const fov = clamp(P.FOV_MIN + d * 0.5, P.FOV_MIN, P.FOV_MAX);""", """    const fovN = clamp(P.FOV_MIN + d * 0.5, P.FOV_MIN, P.FOV_MAX);
    const fov = fovN + (P.COMBO_FOV - fovN) * this.comboWeight;""")
    return s
rw('src/systems/DualTargetCamera.ts', cam, 'COMBO_DIST')

# ------------------------------------------------------------------ Audio: voices
def audio(s):
    s = rep(s, """  setVolume(v: number): void {""", """  private lastVoice = new Map<string, number>();
  /** Character voice line: assets/voice/<code>/<cue>.wav, one per character every 250 ms. */
  voice(code: string, cue: string, opts: SfxOptions = {}): void {
    const now = performance.now();
    if (now - (this.lastVoice.get(code) ?? -1e9) < 250) return;
    this.lastVoice.set(code, now);
    this.play(`../voice/${code}/${cue}`, { volume: 0.9, ...opts });
  }

  setVolume(v: number): void {""")
    return s
rw('src/audio/AudioManager.ts', audio, 'voice(code: string')

def main(s):
    # combo camera target + voices
    s = rep(s, """    // Shadow window follows the fighters""", """    // Combo camera: a landed string on either side swings the view to the side and pushes in.
    const hitStates = new Set([CombatState.HITSTUN, CombatState.LAUNCHED, CombatState.TUMBLE, CombatState.CRUMPLE, CombatState.BLOCKSTUN]);
    const a1 = this.team1.active, a2 = this.team2.active;
    const stringOn = (a: Fighter, v: Fighter) => (a.state === CombatState.COMBO_STRING || a.state === CombatState.JUTSU) && (hitStates.has(v.state) || v.tetherFrames > 0);
    this.camera.comboTarget = stringOn(a1, a2) || stringOn(a2, a1) ? 1 : 0;
    // Shadow window follows the fighters""")
    s = rep(s, """      switch (f.state) {
        case CombatState.DASH_STARTUP: this.audio.play('dash', { volume: 0.7 }); break;""", """      const code = f.def.animBank && !f.def.jutsuSfx ? f.def.animBank : f.def.code;
      const v = (cue: string) => this.audio.voice(code === '9ind' ? '2ssk' : code, cue, { volume: 0.85 });
      switch (f.state) {
        case CombatState.DASH_STARTUP: this.audio.play('dash', { volume: 0.7 }); v('ckrDash_01'); break;""")
    s = rep(s, """        case CombatState.NINJA_MOVE:
        case CombatState.HOLLOW_STEP: this.audio.play('jump2', { volume: 0.5 }); break;""", """        case CombatState.NINJA_MOVE:
        case CombatState.HOLLOW_STEP: this.audio.play('jump2', { volume: 0.5 }); if (Math.random() < 0.35) v('ninjaMove_02'); break;""")
    s = rep(s, """        case CombatState.JUTSU: this.audio.play(f.def.jutsuSfx ?? 'rasen', { volume: 0.9 }); break;
        case CombatState.THROW: this.audio.play('shuriken', { volume: 0.7 }); break;
        case CombatState.CHAKRA_CHARGE: this.audio.play('charge', { volume: 0.6 }); break;
        case CombatState.COMBO_STRING: this.audio.play(f.def.hasBlade ? 'sword_swing' : 'punch_swing', { volume: 0.45, pitchVar: 0.08 }); break;
        case CombatState.KNOCKDOWN: this.audio.play('down', { volume: 0.6 }); break;
        case CombatState.DEAD: this.audio.play('ko'); break;""", """        case CombatState.JUTSU: this.audio.play(f.def.jutsuSfx ?? 'rasen', { volume: 0.9 }); v('skill01_01'); break;
        case CombatState.THROW: this.audio.play('shuriken', { volume: 0.7 }); if (Math.random() < 0.5) v('throw'); break;
        case CombatState.CHAKRA_CHARGE: this.audio.play('charge', { volume: 0.6 }); v('ckrCharge_01'); break;
        case CombatState.COMBO_STRING: this.audio.play(f.def.hasBlade ? 'sword_swing' : 'punch_swing', { volume: 0.45, pitchVar: 0.08 }); v(f.comboBranch === 'AIR' ? 'atkM_02' : 'atkS_02'); break;
        case CombatState.ULTIMATE: v('ougi_01_01'); break;
        case CombatState.AWAKEN: v('powerUP'); break;
        case CombatState.SUBSTITUTED: v('change_02'); break;
        case CombatState.KNOCKDOWN: this.audio.play('down', { volume: 0.6 }); break;
        case CombatState.DEAD: this.audio.play('ko'); v('dmgLose'); break;""")
    # victim voices on hits
    s = rep(s, """      case 'GUARD_HIT': this.audio.play('guard', { pitchVar: 0.05 }); break;""", """      case 'GUARD_HIT': this.audio.play('guard', { pitchVar: 0.05 }); break;""")
    s = rep(s, """        if (heavy) this.audio.play('hit_S', { volume: 0.6 });
        break;
      }""", """        if (heavy) this.audio.play('hit_S', { volume: 0.6 });
        const victim = this.allFighters.find((f) => f.id === data.defenderId);
        if (victim) this.audio.voice(victim.def.code === '9ind' ? '2ssk' : victim.def.code, (data.damage ?? 0) >= 150 ? 'dmgL_02' : heavy ? 'dmgM_02' : 'dmgS_02', { volume: 0.8 });
        break;
      }""")
    s = rep(s, """      case 'GUARD_BREAK': this.audio.play('exp1', { volume: 0.9 }); break;""", """      case 'GUARD_BREAK': { this.audio.play('exp1', { volume: 0.9 }); const vv = this.allFighters.find((f) => f.id === data.defenderId); if (vv) this.audio.voice(vv.def.code, 'grdBrk_02'); break; }""")
    return s
rw('src/main.ts', main, 'comboTarget = stringOn')
print('ok')
