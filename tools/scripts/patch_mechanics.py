"""Session 6 mechanics patch: double jump, air ninja move, air combos, ultimate jutsu, awakening,
round intro, terrain following, behind-the-shoulder camera, root scale strip, combo clip switching."""
import os, re
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s:
        print('already', rel); return
    s2 = fn(s)
    assert s2 != s, rel; open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:100]; return s.replace(old, new, count)

# ------------------------------------------------------------------ Types
def types(s):
    s = rep(s, """  /** PL_ACT_SUP_* — a support character performing an intervention (autonomous). */
  SUPPORT_ACT = 'SUPPORT_ACT',
}""", """  /** PL_ACT_SUP_* — a support character performing an intervention (autonomous). */
  SUPPORT_ACT = 'SUPPORT_ACT',
  /** PL_ACT_BTL_BEFORE_LEADER — round intro (entry clip), no input. */
  INTRO = 'INTRO',
  /** PL_ACT_SPSKILL_* — ultimate jutsu: cut-in, armored homing rush, finisher. */
  ULTIMATE = 'ULTIMATE',
  /** PL_ACT_AWAKE_BEGIN — awakening transformation. */
  AWAKEN = 'AWAKEN',
}""")
    s = rep(s, "export type ComboBranch = 'NEUTRAL' | 'UP' | 'DOWN';", "export type ComboBranch = 'NEUTRAL' | 'UP' | 'DOWN' | 'AIR';")
    s = rep(s, """  /** Borrow another character's clip set (same CC2 body skeleton); tracks are retargeted by bone prefix. */
  animBank?: string;
}""", """  /** Borrow another character's clip set (same CC2 body skeleton); tracks are retargeted by bone prefix. */
  animBank?: string;
  /** Aerial string (○ while airborne); the last hit spikes the enemy down. */
  airString?: ComboStringDef;
  /** Ultimate jutsu (SPSKILL): name, clip prefix (spl1) and sound cue. */
  ultimateName?: string;
  ultimateClip?: string;
  jutsuSfx?: string;
  ultimateSfx?: string;
}""")
    # input flag
    m = re.search(r"  SUPPORT = 1 << 12,\n", s)
    assert m
    s = s.replace("  SUPPORT = 1 << 12,\n", "  SUPPORT = 1 << 12,\n  ULTIMATE = 1 << 13,\n", 1)
    s = rep(s, "export type CombatEventKind = 'HIT' | 'GUARD_HIT' | 'CLASH' | 'PARRY' | 'GUARD_BREAK' | 'ARMOR' | 'SUB' | 'WALL_SPLAT' | 'SWITCH' | 'SPARK';",
               "export type CombatEventKind = 'HIT' | 'GUARD_HIT' | 'CLASH' | 'PARRY' | 'GUARD_BREAK' | 'ARMOR' | 'SUB' | 'WALL_SPLAT' | 'SWITCH' | 'SPARK' | 'ULTIMATE' | 'AWAKEN' | 'SFX';")
    return s
rw('src/core/Types.ts', types, 'ULTIMATE = 1 << 13')

# ------------------------------------------------------------------ Input
def inp(s):
    s = rep(s, "  support: string[];\n", "  support: string[];\n  ultimate: string[];\n")
    s = rep(s, "  support: ['KeyY'],\n", "  support: ['KeyY'],\n  ultimate: ['KeyM'],\n")
    s = rep(s, "    if (this.any(b.support)) held |= InputFlag.SUPPORT;\n", "    if (this.any(b.support)) held |= InputFlag.SUPPORT;\n    if (this.any(b.ultimate)) held |= InputFlag.ULTIMATE;\n")
    return s
rw('src/core/InputManager.ts', inp, 'InputFlag.ULTIMATE')

# ------------------------------------------------------------------ Fighter
def fighter(s):
    s = rep(s, """  /** Transform at the start of the current simulation tick (render interpolation). */
  prevPosition = new THREE.Vector3();
  prevYaw = 0;
""", """  /** Transform at the start of the current simulation tick (render interpolation). */
  prevPosition = new THREE.Vector3();
  prevYaw = 0;
  /** Stage floor height under the fighter (terrain following). */
  groundY = 0;
  // --- aerial mobility
  doubleJumped = false;
  airDashed = false;
  airDashFrames = 0;
  jumpCount = 0;
  // --- awakening / ultimate
  awakened = false;
  awakenTimer = 0;
  ultimatePhase = 0;
  ultimateLanded = false;
""")
    return s
rw('src/combat/Fighter.ts', fighter, 'ultimateLanded')

# ------------------------------------------------------------------ StormStates bindings
def states(s):
    s = rep(s, "  airborne: boolean;\n", "  airborne: boolean;\n  airDash?: boolean;\n  awakened?: boolean;\n")
    s = rep(s, """    case CombatState.JUMPING:
      return ctx.falling""", """    case CombatState.JUMPING:
      if (ctx.airDash)
        return { act: 'PL_ACT_NMOVE_SIDE', anm: 'PL_ANM_DSH_' + ctx.moveDir, clips: [O(dirClip('{c}', ctx.moveDir, { F: 'dsf0', B: 'dsb0', L: 'dsl0', R: 'dsr0' })), L('{c}jmp1')] };
      return ctx.falling""")
    s = rep(s, """    case CombatState.DEAD:""", """    case CombatState.INTRO:
      return { act: 'PL_ACT_BTL_BEFORE_LEADER', anm: 'PL_ANM_ENT0', clips: [O('{c}ent0', '{c}nut0'), L('{c}nut0')] };
    case CombatState.ULTIMATE:
      return { act: 'PL_ACT_SPSKILL_DEMO_ATK', anm: 'PL_ANM_SPSKILL_1', clips: ctx.moveClip ? [O(ctx.moveClip), O('{c}skl1_s1', '{c}skl1_l1'), O('{c}skl1_s')] : [O('{c}skl1_s')] };
    case CombatState.AWAKEN:
      return { act: 'PL_ACT_AWAKE_BEGIN', anm: 'PL_ANM_AWAKE_S', clips: [O('{c}sklchg_s', '{c}sklchg_l'), L('{c}hola0'), L('{c}nut0')] };
    case CombatState.DEAD:""")
    return s
rw('src/combat/StormStates.ts', states, 'PL_ACT_SPSKILL_DEMO_ATK')

# ------------------------------------------------------------------ FighterRig
def rig(s):
    # PoseContext extra fields
    s = rep(s, "  falling: boolean;\n", "  falling: boolean;\n  airDash?: boolean;\n  jumpCount?: number;\n  awakened?: boolean;\n")
    # clip re-pick key: clip changes inside a state (combo strings, jump → double jump) must restart
    s = rep(s, """    const stateKey = ctx.state;
    const spec = this.pickSpec(ctx);""", """    const stateKey = `${ctx.state}|${ctx.moveClip ?? ''}|${ctx.jumpCount ?? 0}|${ctx.airDash ? 1 : 0}|${ctx.hitDir}|${ctx.falling ? 1 : 0}`;
    const spec = this.pickSpec(ctx);""")
    s = rep(s, """      airborne: !ctx.grounded,
      falling: ctx.falling,""", """      airborne: !ctx.grounded,
      airDash: ctx.airDash,
      awakened: ctx.awakened,
      falling: ctx.falling,""")
    # strip root scale tracks (CC2 root scale keys pop the whole body between clips)
    s = rep(s, """          const prop = t.name.slice(dot + 1);
          return !(prop === 'position' && rootNames.has(node));""", """          const prop = t.name.slice(dot + 1);
          if (prop === 'scale' && rootNames.has(node)) return false;
          return !(prop === 'position' && rootNames.has(node));""")
    s = rep(s, """            if (prop === 'position' && (/trall$/i.test(node) || /^\\w{4}00t0$/i.test(node))) continue;
            const nt = t.clone();""", """            if ((prop === 'position' || prop === 'scale') && (/trall$/i.test(node) || /^\\w{4}00t0$/i.test(node))) continue;
            const nt = t.clone();""")
    # awakening aura: rim colour + threshold on every cel material
    s = rep(s, """  /**
   * Advance the skeletal animation by render time.""", """  private awakenedVisual = false;
  /** Awakening look: hot rim light on every cel material (restored when it ends). */
  setAwakened(on: boolean, color = 0xff7a1a): void {
    if (this.awakenedVisual === on) return;
    this.awakenedVisual = on;
    this.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (!m || !(m as THREE.ShaderMaterial).uniforms) return;
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u.uRimColor) (u.uRimColor.value as THREE.Color).set(on ? color : 0xffffff);
      if (u.uRimThreshold) u.uRimThreshold.value = on ? 0.45 : 0.7;
    });
  }

  /**
   * Advance the skeletal animation by render time.""")
    return s
rw('src/render/FighterRig.ts', rig, 'setAwakened(')

# ------------------------------------------------------------------ Arena: terrain height
def arena(s):
    s = rep(s, """      const floorMeshes: THREE.Mesh[] = [];
      scene.updateMatrixWorld(true);""", """      const floorMeshes: THREE.Mesh[] = [];
      this.floorMeshes = floorMeshes;
      this.heightCache.clear();
      scene.updateMatrixWorld(true);""")
    s = rep(s, """      scene.position.y -= floorY;
""", """      scene.position.y -= floorY;
      scene.updateMatrixWorld(true);
""")
    s = rep(s, """  async tryLoadStage(path: string): Promise<boolean> {""", """  private floorMeshes: THREE.Mesh[] = [];
  private heightCache = new Map<number, number>();
  private heightRay = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 400);

  /**
   * Floor height under (x, z) so fighters follow uneven ground instead of floating or sinking.
   * Raycast against the stage's floor meshes, cached on a 0.5 m grid (the ray only fires for cells
   * nobody has visited yet). Flat 0 when no stage floor is loaded.
   */
  groundY(x: number, z: number): number {
    if (!this.floorMeshes.length) return 0;
    const gx = Math.round(x * 2), gz = Math.round(z * 2);
    const key = (gx + 4096) * 8192 + (gz + 4096);
    const hit = this.heightCache.get(key);
    if (hit !== undefined) return hit;
    this.heightRay.ray.origin.set(gx * 0.5, 120, gz * 0.5);
    const res = this.heightRay.intersectObjects(this.floorMeshes, false);
    let y = 0;
    if (res.length) {
      // Take the first hit at or below +4 m (canopy / bridge decks above the arena are skipped).
      const h = res.find((r) => r.point.y <= 4.0) ?? res[res.length - 1];
      y = h.point.y;
    }
    this.heightCache.set(key, y);
    return y;
  }

  async tryLoadStage(path: string): Promise<boolean> {""")
    s = rep(s, """      this.stageRoot = scene;""", """      this.stageRoot = scene;
      this.heightCache.clear();""")
    return s
rw('src/systems/ArenaEnvironment.ts', arena)

# ------------------------------------------------------------------ PlayerController: terrain + aerial state resets
def pc(s):
    s = rep(s, """    f.position.addScaledVector(f.velocity, dt);

    if (f.position.y <= 0) {
      f.position.y = 0;
      if (f.velocity.y < 0) f.velocity.y = 0;
      f.grounded = true;
    } else {
      f.grounded = false;
    }""", """    f.position.addScaledVector(f.velocity, dt);

    // Terrain following: the floor under the fighter is the stage mesh height, not y = 0.
    const gy = this.arena.groundY(f.position.x, f.position.z);
    f.groundY = gy;
    if (f.position.y <= gy + 0.001) {
      f.position.y = gy;
      if (f.velocity.y < 0) f.velocity.y = 0;
      f.grounded = true;
      f.doubleJumped = false;
      f.airDashed = false;
      f.airDashFrames = 0;
      f.jumpCount = 0;
    } else {
      f.grounded = false;
    }""")
    s = rep(s, """    if (f.state === CombatState.DASH_STARTUP || f.state === CombatState.DASH_CHARGING) {
      // Hover in place vertically while winding up (keeps aerial dashes possible)
      if (f.position.y > 0) f.velocity.y = 0;
    }""", """    if (f.state === CombatState.DASH_STARTUP || f.state === CombatState.DASH_CHARGING) {
      // Hover in place vertically while winding up (keeps aerial dashes possible)
      if (f.position.y > f.groundY + 0.02) f.velocity.y = 0;
    }""")
    s = rep(s, """    if (f.position.y <= 0) f.grounded = true;
""", """    if (f.position.y <= f.groundY + 0.001) f.grounded = true;
""")
    s = rep(s, """        moveName: f.currentMove?.name ?? null,""", """        moveName: f.currentMove?.name ?? null,
        airDash: f.airDashFrames > 0,
        jumpCount: f.jumpCount,
        awakened: f.awakened,""")
    return s
rw('src/combat/PlayerController.ts', pc)

# ------------------------------------------------------------------ HitboxManager: ultimates hit
def hbm(s):
    s = rep(s, "if (attacker.state !== CombatState.COMBO_STRING && attacker.state !== CombatState.JUTSU && attacker.state !== CombatState.SUPPORT_ACT) continue;",
               "if (attacker.state !== CombatState.COMBO_STRING && attacker.state !== CombatState.JUTSU && attacker.state !== CombatState.SUPPORT_ACT && attacker.state !== CombatState.ULTIMATE) continue;")
    return s
rw('src/combat/HitboxManager.ts', hbm)

# ------------------------------------------------------------------ CombatStateMachine
def fsm(s):
    s = rep(s, "const JUTSU_COST = 30;", """const JUTSU_COST = 30;
/** SPSKILL: needs a nearly full gauge (retail: 2nd ultimate consumes 66) and empties it. */
const ULTIMATE_MIN_CHAKRA = 90;
const ULTIMATE_TOTAL = 150;
const ULTIMATE_CUTIN = 26;
const INTRO_FRAMES = 100;
const AWAKEN_FRAMES = 42;
const AWAKEN_DURATION = 20;
const AWAKEN_HP_RATIO = 0.5;
const AWAKEN_DAMAGE_MULT = 1.3;""")
    # dispatch
    s = rep(s, "      case CombatState.JUMPING: this.updateJumping(f, dt, mag); break;",
               """      case CombatState.JUMPING: this.updateJumping(f, dt, mag); break;
      case CombatState.INTRO: this.updateIntro(f); break;
      case CombatState.ULTIMATE: this.updateUltimate(f, dt); break;
      case CombatState.AWAKEN: this.updateAwaken(f, dt); break;""")
    # awakening upkeep at the top of update()
    s = rep(s, """  update(f: Fighter, dt: number, cam: CameraBasis): void {""", """  update(f: Fighter, dt: number, cam: CameraBasis): void {
    if (f.awakened) {
      f.awakenTimer -= dt;
      f.stats.chakra = Math.max(0, f.stats.chakra - 2.5 * dt);
      if (f.awakenTimer <= 0 || (f.stats.chakra <= 0 && f.state !== CombatState.ULTIMATE)) {
        f.awakened = false;
        f.rig.setAwakened(false);
        this.events.emit('AWAKEN', { attackerId: f.id, defenderId: -1, damage: 0, text: `${f.def.displayName}: awakening ended`, color: 0xffb27a });
      }
    }""")
    # neutral: ultimate before jutsu
    s = rep(s, "    if (buf.consume(InputFlag.JUTSU) && f.stats.spendChakra(JUTSU_COST)) { this.startJutsu(f); return; }",
               """    if (buf.consume(InputFlag.ULTIMATE)) {
      if (f.stats.chakra >= ULTIMATE_MIN_CHAKRA) { this.startUltimate(f); return; }
      buf.flush(InputFlag.ULTIMATE);
    }
    if (buf.consume(InputFlag.JUTSU)) {
      if (f.stats.chakra >= ULTIMATE_MIN_CHAKRA && f.target && f.distanceToTarget() < 14) { this.startUltimate(f); return; }
      if (f.stats.spendChakra(JUTSU_COST)) { this.startJutsu(f); return; }
    }""")
    # awakening trigger inside chakra charge
    s = rep(s, "  private updateChakraCharge(f: Fighter, dt: number, mag: number): void {",
               """  private updateChakraCharge(f: Fighter, dt: number, mag: number): void {
    // Awakening: keep the chakra button held with half health or less (AWAKE_BEGIN).
    if (!f.awakened && f.stats.health <= f.stats.healthMax * AWAKEN_HP_RATIO && f.input.buffer.heldFrames(InputFlag.CHARGE) >= 45) {
      this.startAwaken(f);
      return;
    }""")
    # jumping: double jump, air ninja move, air string
    s = rep(s, """    if (buf.consume(InputFlag.ATTACK)) {
      this.startCombo(f, 'NEUTRAL');
      return;
    }
    if (f.grounded && f.stateFrame > 2) {
      f.enterState(mag > 0.15 ? CombatState.RUNNING : CombatState.IDLE_NEUTRAL);
    }
  }""", """    if (buf.consume(InputFlag.ATTACK)) {
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
        f.velocity.y = Math.max(f.velocity.y, 3.0);
        const p = f.position.clone(); p.y += 0.6;
        this.effects.smokePuff(p, 0xe8e8ff, 6);
        this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: 'dash' });
      } else if (!f.doubleJumped) {
        // Double jump (JMP1): resets the arc and replays the jump clip.
        f.doubleJumped = true;
        f.jumpCount++;
        f.velocity.y = JUMP_VELOCITY * 0.92;
        f.stateFrame = 0;
        const p = f.position.clone(); p.y += 0.2;
        this.effects.smokePuff(p, 0xffffff, 5);
        this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: 'jump2' });
      }
    }
    if (f.airDashFrames > 0) {
      f.airDashFrames--;
      if (f.velocity.y < -1) f.velocity.y = -1; // glide through the burst
    }
    if (f.grounded && f.stateFrame > 2) {
      f.enterState(mag > 0.15 ? CombatState.RUNNING : CombatState.IDLE_NEUTRAL);
    }
  }

  // --------------------------------------------------------------- intro / ultimate / awakening
  private updateIntro(f: Fighter): void {
    f.velocity.set(0, 0, 0);
    f.invulnFrames = 2;
    this.faceTarget(f, 1);
    f.input.buffer.clear();
    if (f.stateFrame >= INTRO_FRAMES) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  private ultimateMove(f: Fighter): MoveDef {
    const d = f.def;
    return {
      name: `${d.code}_ultimate`,
      clip: d.ultimateClip ?? `${d.code}spl1`,
      totalFrames: ULTIMATE_TOTAL,
      cancelStart: 999, cancelEnd: 999, sparkCancelStart: 999, sparkCancelEnd: 999,
      forwardStep: 0,
      hitboxes: [{
        id: `${d.code}_ult`, socket: SOCKET.CHEST, radius: 1.5, activeStart: ULTIMATE_CUTIN + 6, activeEnd: ULTIMATE_CUTIN + 40,
        damage: 380, chakraGain: 0, reaction: HitReaction.TUMBLE, knockback: 26, launch: 7, hitstunFrames: 70, blockstunFrames: 30, guardDamage: 100,
        priority: HitPriority.ARMORED_JUTSU, armored: true,
      }],
    };
  }

  private startUltimate(f: Fighter): void {
    f.stats.chakra = 0;
    f.enterState(CombatState.ULTIMATE);
    f.beginMove(this.ultimateMove(f), 'NEUTRAL', 0);
    f.ultimatePhase = 0;
    f.ultimateLanded = false;
    f.velocity.set(0, 0, 0);
    this.faceTarget(f, 1);
    const t = f.target;
    if (t) t.hitstopFrames = Math.max(t.hitstopFrames, ULTIMATE_CUTIN);
    f.hitstopFrames = 0;
    this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: t?.id ?? -1, damage: 0, text: `${f.def.displayName}: ${f.def.ultimateName ?? 'ULTIMATE JUTSU'}`, color: 0xffd166, shake: 0.35 });
  }

  private updateUltimate(f: Fighter, dt: number): void {
    const move = f.currentMove;
    const t = f.target;
    if (!move) { f.enterState(CombatState.IDLE_NEUTRAL); return; }
    f.moveFrame++;
    f.invulnFrames = 2; // armored through the whole sequence
    if (f.moveFrame <= ULTIMATE_CUTIN) {
      // Cut-in: both fighters hold while the portrait slides in.
      f.velocity.set(0, 0, 0);
      this.faceTarget(f, 1);
      if (t) t.hitstopFrames = Math.max(t.hitstopFrames, 1);
      f.ultimatePhase = 0;
      return;
    }
    const landed = f.landedHitIds.size > 0;
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
    }
    if (!f.ultimateLanded) {
      // Homing rush toward the enemy until contact or the active window closes.
      f.ultimatePhase = 1;
      const hb = move.hitboxes[0];
      if (f.moveFrame <= hb.activeEnd && t) {
        this.faceTarget(f, 1);
        f.forward(this.tmpA);
        const dist = f.distanceToTarget();
        const speed = dist > 2.2 ? 26 : 0;
        f.velocity.x = this.tmpA.x * speed;
        f.velocity.z = this.tmpA.z * speed;
        if (!f.grounded) f.velocity.y = Math.max(f.velocity.y, -2);
        if (f.moveFrame % 3 === 0) { const p = f.position.clone(); p.y += 0.8; this.effects.dashTrail(p, f.def.color as number); }
      } else {
        this.applyFriction(f, dt, 60);
        if (f.moveFrame >= hb.activeEnd + 24) f.enterState(f.grounded ? CombatState.IDLE_NEUTRAL : CombatState.JUMPING); // whiffed
      }
      return;
    }
    this.applyFriction(f, dt, 60);
    if (f.moveFrame >= move.totalFrames) f.enterState(f.grounded ? CombatState.IDLE_NEUTRAL : CombatState.JUMPING);
  }

  private startAwaken(f: Fighter): void {
    f.enterState(CombatState.AWAKEN);
    f.velocity.set(0, 0, 0);
    f.invulnFrames = AWAKEN_FRAMES;
    this.events.emit('AWAKEN', { attackerId: f.id, defenderId: -1, damage: 0, text: `${f.def.displayName}: AWAKENING`, color: 0xff9a3c, shake: 0.4 });
  }

  private updateAwaken(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 80);
    f.invulnFrames = 2;
    if (f.stateFrame % 4 === 0) { const p = f.position.clone(); p.y += 0.9; this.effects.chargeAura(p, 0xff7a1a); }
    if (f.stateFrame >= AWAKEN_FRAMES) {
      f.awakened = true;
      f.awakenTimer = AWAKEN_DURATION;
      f.stats.chakra = Math.max(f.stats.chakra, 40);
      f.rig.setAwakened(true, (f.def.color as number) === 0x1a1a1a ? 0xff7a1a : 0xff7a1a);
      const p = f.position.clone(); p.y += 1;
      this.effects.clashBurst(p);
      f.enterState(CombatState.IDLE_NEUTRAL);
    }
  }""")
    # strings: AIR branch
    s = rep(s, """    return branch === 'UP' ? d.upString.moves : branch === 'DOWN' ? d.downString.moves : d.neutralString.moves;""",
               """    return branch === 'UP' ? d.upString.moves : branch === 'DOWN' ? d.downString.moves : branch === 'AIR' ? (d.airString?.moves ?? d.neutralString.moves) : d.neutralString.moves;""")
    # air string physics + landing
    s = rep(s, """    // Track the target during startup, lock during active frames
    if (f.moveFrame < activeStart) this.faceTarget(f, 0.5);
""", """    // Track the target during startup, lock during active frames
    if (f.moveFrame < activeStart) this.faceTarget(f, 0.5);

    if (f.comboBranch === 'AIR') {
      // Aerial string: hang in the air through the swing, drop with the last (spike) hit.
      const last = f.comboIndex >= this.stringFor(f, 'AIR').length - 1;
      if (!last && f.moveFrame <= activeEnd + 4) f.velocity.y = Math.max(f.velocity.y, -1.5);
      if (f.grounded && f.moveFrame > 4) { f.enterState(CombatState.IDLE_NEUTRAL); return; }
    }
""")
    # awakened damage / speed
    s = rep(s, "    const dmg = defender.stats.applyDamage(hb.damage);", "    const dmg = defender.stats.applyDamage(hb.damage * (attacker.awakened ? AWAKEN_DAMAGE_MULT : 1));")
    s = rep(s, "    const speed = f.def.runSpeed * mag;", "    const speed = f.def.runSpeed * mag * (f.awakened ? 1.15 : 1);")
    # substitution ground refs
    s = rep(s, "    f.position.y = upper ? t.position.y + 2.6 : t.grounded ? 0 : t.position.y;", "    f.position.y = upper ? t.position.y + 2.6 : t.grounded ? t.groundY : t.position.y;")
    s = rep(s, "    f.grounded = f.position.y <= 0.001;", "    f.groundY = t.groundY;\n    f.grounded = f.position.y <= f.groundY + 0.001;")
    # imports: SOCKET, HitPriority, HitReaction, MoveDef may already be imported; add SOCKET import if missing
    if "SOCKET" not in s.split("export class")[0]:
        s = s.replace("import { Fighter", "import { SOCKET } from './CharacterDefs';\nimport { Fighter", 1)
    return s
rw('src/combat/CombatStateMachine.ts', fsm)

# ------------------------------------------------------------------ Camera: Storm behind-the-shoulder
def cam(s):
    s = rep(s, """export const CAMERA_PARAMS = {
  H_OFFSET: 1.2,
  D_MIN: 5.2,
  D_MAX: 16.5,
  K_D: 0.6,
  H_MIN: 1.45,
  H_MAX: 5.4,
  K_H: 0.24,
  THETA_BIAS: 0.26,
  LAMBDA: 10.5,
  LOOK_LAMBDA: 14.0,
};""", """export const CAMERA_PARAMS = {
  H_OFFSET: 1.2,
  D_MIN: 5.2,
  D_MAX: 16.5,
  K_D: 0.6,
  H_MIN: 1.45,
  H_MAX: 5.4,
  K_H: 0.24,
  THETA_BIAS: 0.26,
  LAMBDA: 10.5,
  LOOK_LAMBDA: 14.0,
  // Storm behind-the-shoulder framing: the camera sits behind and slightly beside the player,
  // pulls back as the fighters separate, and looks at a point weighted toward the enemy.
  BACK_MIN: 3.4,
  BACK_K: 0.28,
  BACK_MAX: 9.0,
  SIDE: 1.35,
  UP_MIN: 1.75,
  UP_K: 0.12,
  UP_MAX: 3.6,
  LOOK_MIX: 0.38,
  LOOK_UP: 1.05,
  FOV_MIN: 44,
  FOV_MAX: 60,
};""")
    s = rep(s, """    const D = clamp(P.D_MIN + P.K_D * d, P.D_MIN, P.D_MAX);
    const H = clamp(P.H_MIN + P.K_H * d, P.H_MIN, P.H_MAX);

    // Lateral normal and azimuth-biased view direction
    this.nLat.crossVectors(this.uSep, UP).normalize().multiplyScalar(this.side);
    this.vDir
      .copy(this.nLat)
      .multiplyScalar(Math.cos(P.THETA_BIAS))
      .addScaledVector(this.uSep, -Math.sin(P.THETA_BIAS));

    this.cTarget.copy(this.pMid).addScaledVector(this.vDir, D);
    this.cTarget.y += H;
""", """    // Behind-the-shoulder: back along the P1→P2 axis, offset to P1's right so P1 reads on the
    // left of the frame, height rising with distance; look between the two, biased to the enemy.
    const back = clamp(P.BACK_MIN + P.BACK_K * d, P.BACK_MIN, P.BACK_MAX);
    const up = clamp(P.UP_MIN + P.UP_K * d, P.UP_MIN, P.UP_MAX);
    this.nLat.crossVectors(this.uSep, UP).normalize().multiplyScalar(this.side);
    this.cTarget.copy(p1).addScaledVector(this.uSep, -back).addScaledVector(this.nLat, P.SIDE);
    this.cTarget.y = Math.max(p1.y, p2.y) * 0.35 + Math.min(p1.y, p2.y) * 0.65 + up;
    this.pMid.copy(p1).lerp(p2, P.LOOK_MIX);
    this.pMid.y += P.LOOK_UP;
""")
    s = rep(s, """    const fov = clamp(43 + d * 0.4, 43, 58);""", """    const fov = clamp(P.FOV_MIN + d * 0.5, P.FOV_MIN, P.FOV_MAX);""")
    return s
rw('src/systems/DualTargetCamera.ts', cam)
print('ok')
