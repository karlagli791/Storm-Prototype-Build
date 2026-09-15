"""Playtest fixes: ninja-move chain lock, jump fall clips, closer camera, per-stage arena radius,
blob drop shadows, projectile jutsu (Itachi fireball / Deidara clay / Gaara sand), terrain shading."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:100]; return s.replace(old, new, count)

# ---------------------------------------------------------------- FSM
def fsm(s):
    s = rep(s, """    if (f.stateFrame >= NINJA_MOVE_FRAMES && f.grounded) {
      if (mag > 0.15 && buf.isHeld(InputFlag.JUMP)) {
        // chained ninja moves while holding jump
        f.enterState(CombatState.NINJA_MOVE);
        this.beginNinjaMove(f);
        return;
      }
      f.enterState(mag > 0.15 ? CombatState.RUNNING : CombatState.IDLE_NEUTRAL);
    }
  }""", """    if (f.stateFrame >= NINJA_MOVE_FRAMES && f.grounded) {
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
  }""")
    # projectile jutsu: fire instead of a palm hitbox
    s = rep(s, """    // Jutsu VFX on the bound dummy socket
    if (f.moveFrame >= hb.activeStart - 8 && f.moveFrame <= hb.activeEnd) {""", """    // Projectile jutsu (fireball / clay / sand): launch once at the active frame, no palm hitbox.
    const pj = f.def.jutsuProjectile;
    if (pj && this.projectiles) {
      if (f.moveFrame === hb.activeStart) {
        this.projectiles.launch(f, f.target, pj);
        this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: pj.launchSfx ?? 'goukakyu' });
      }
      if (f.moveFrame >= hb.activeStart - 10 && f.moveFrame <= hb.activeStart) {
        f.rig.socketWorld(hb.socket, this.tmpB);
        this.effects.spriteBurst(pj.sprite ?? 'flame', this.tmpB, { color: pj.color, count: 2, size: 0.6, life: 0.2, speed: 1, additive: true, spin: 6 });
      }
      if (f.moveFrame >= move.totalFrames) f.enterState(CombatState.IDLE_NEUTRAL);
      return;
    }
    // Jutsu VFX on the bound dummy socket
    if (f.moveFrame >= hb.activeStart - 8 && f.moveFrame <= hb.activeEnd) {""")
    s = rep(s, """  update(f: Fighter, dt: number, cam: CameraBasis): void {
    if (f.awakened) {""", """  /** Set by the game so jutsu can launch projectiles. */
  projectiles: import('./Projectiles').Projectiles | null = null;

  update(f: Fighter, dt: number, cam: CameraBasis): void {
    if (f.awakened) {""")
    return s
rw('src/combat/CombatStateMachine.ts', fsm, 'wasPressedWithin(InputFlag.JUMP, 6)')

# ---------------------------------------------------------------- HitboxManager: skip palm hitbox for projectile jutsu
def hbm(s):
    s = rep(s, """      const boxes = attacker.activeHitboxes();""", """      const boxes = attacker.state === CombatState.JUTSU && attacker.def.jutsuProjectile ? [] : attacker.activeHitboxes();""")
    return s
rw('src/combat/HitboxManager.ts', hbm, 'attacker.def.jutsuProjectile')

# ---------------------------------------------------------------- Types
def types(s):
    s = rep(s, """  jutsuSfx?: string;
  ultimateSfx?: string;
}""", """  jutsuSfx?: string;
  ultimateSfx?: string;
  /** Ranged jutsu: the skill launches a projectile instead of a palm hitbox. */
  jutsuProjectile?: JutsuProjectile;
}

export interface JutsuProjectile {
  color: number;
  sprite?: string;
  speed: number;
  damage: number;
  radius: number;
  /** Travel height above the ground (sand waves hug the floor, fireballs fly chest-high). */
  height: number;
  launchSfx?: string;
  hitSfx?: string;
  life?: number;
}""")
    return s
rw('src/core/Types.ts', types, 'interface JutsuProjectile')

# ---------------------------------------------------------------- StormStates: normal fall clips
def states(s):
    s = rep(s, """      return ctx.falling
        ? { act: 'PL_ACT_FALL', anm: 'PL_ANM_FALL0', clips: [L('1cmnfal0'), L('{c}jmp1'), L('{c}jmp0')] }
        : { act: 'PL_ACT_JMP_V', anm: 'PL_ANM_JMP0', clips: [O('{c}jmp0', '1cmnfal0'), L('{c}jmp1')] };""",
        """      // jmp0 = take-off (one shot) → jmp1 = airborne loop. The common bank's fal0/fal1 are
      // *damage* falls (arms flailing) and are only used by LAUNCHED.
      return ctx.falling
        ? { act: 'PL_ACT_FALL', anm: 'PL_ANM_FALL0', clips: [L('{c}jmp1'), L('{c}jmp0'), L('{c}nut0')] }
        : { act: 'PL_ACT_JMP_V', anm: 'PL_ANM_JMP0', clips: [O('{c}jmp0', '{c}jmp1'), L('{c}jmp1')] };""")
    return s
rw('src/combat/StormStates.ts', states, "L('{c}jmp1'), L('{c}jmp0'), L('{c}nut0')")

# ---------------------------------------------------------------- Camera: closer + arena radius
def cam(s):
    s = rep(s, """  BACK_MIN: 3.4,
  BACK_K: 0.28,
  BACK_MAX: 9.0,
  SIDE: 1.35,
  UP_MIN: 1.75,
  UP_K: 0.12,
  UP_MAX: 3.6,
  LOOK_MIX: 0.38,
  LOOK_UP: 1.05,
  FOV_MIN: 44,
  FOV_MAX: 60,""", """  BACK_MIN: 2.6,
  BACK_K: 0.2,
  BACK_MAX: 7.0,
  SIDE: 1.15,
  UP_MIN: 1.45,
  UP_K: 0.09,
  UP_MAX: 3.0,
  LOOK_MIX: 0.34,
  LOOK_UP: 1.0,
  FOV_MIN: 42,
  FOV_MAX: 56,""")
    s = rep(s, "import { ARENA_RADIUS, clamp } from '../core/Types';", "import { ARENA_RADIUS, clamp } from '../core/Types';\n")
    s = rep(s, """  /** Screen shake state. */""", """  /** Playable radius of the current stage (set by the game after a stage loads). */
  arenaRadius = ARENA_RADIUS;

  /** Screen shake state. */""")
    s = rep(s, "    const maxR = ARENA_RADIUS + 6.0;", "    const maxR = this.arenaRadius + 6.0;")
    return s
rw('src/systems/DualTargetCamera.ts', cam, 'arenaRadius = ARENA_RADIUS')

# ---------------------------------------------------------------- Arena: radius from the floor, terrain shading
def arena(s):
    s = rep(s, "  readonly radius = ARENA_RADIUS;", "  radius = ARENA_RADIUS;")
    s = rep(s, """      let floorY = 0;
      if (floorMeshes.length) {""", """      let floorY = 0;
      // Playable radius: as much of the floor mesh as exists (capped), so the whole map is walkable.
      if (floorMeshes.length) {
        const fb = new THREE.Box3();
        for (const m of floorMeshes) fb.expandByObject(m);
        const ext = Math.min(fb.max.x, -fb.min.x, fb.max.z, -fb.min.z);
        this.radius = Number.isFinite(ext) && ext > 10 ? Math.min(60, Math.max(ARENA_RADIUS, ext * 0.9)) : ARENA_RADIUS;
      } else this.radius = ARENA_RADIUS;
      if (floorMeshes.length) {""")
    s = rep(s, """  unloadStage(): void {""", """  unloadStage(): void {
    this.radius = ARENA_RADIUS;""")
    # terrain shading: stronger directional term so ground and rocks band like the characters
    s = rep(s, """        mat.uniforms.uRimThreshold.value = 2.0;
        mat.uniforms.uSpecThreshold.value = 2.0;""", """        mat.uniforms.uRimThreshold.value = 2.0;
        mat.uniforms.uSpecThreshold.value = 2.0;
        // Stage lighting: a real sun term (shadow band at 62 %) instead of the flat look.
        mat.uniforms.uLightColor.value = new THREE.Color(0.55, 0.53, 0.5);
        mat.uniforms.uAmbient.value = new THREE.Color(0.62, 0.63, 0.66);""")
    return s
rw('src/systems/ArenaEnvironment.ts', arena, 'Playable radius')

# ---------------------------------------------------------------- Projectiles: jutsu projectiles
def proj(s):
    s = rep(s, "import { ARENA_RADIUS, CombatState, HitPriority, HitReaction, HitboxDef } from '../core/Types';",
               "import { ARENA_RADIUS, CombatState, HitPriority, HitReaction, HitboxDef, JutsuProjectile } from '../core/Types';")
    s = rep(s, """  damage: number;""", """  damage: number;
  /** Jutsu projectile spec (fireball etc.); undefined for shuriken. */
  jutsu?: JutsuProjectile;
  age?: number;""")
    s = rep(s, "      let dead = p.life <= 0 || p.pos.y < -0.2 || Math.hypot(p.pos.x, p.pos.z) > ARENA_RADIUS + 1;",
               "      p.age = (p.age ?? 0) + dt;\n      if (p.jutsu && p.age % 0.05 < dt) this.effects.spriteBurst(p.jutsu.sprite ?? 'flame', p.pos, { color: p.jutsu.color, count: 2, size: p.jutsu.radius * 1.6, life: 0.25, speed: 0.8, additive: true, spin: 8, spread: p.jutsu.radius * 0.4 });\n      let dead = p.life <= 0 || p.pos.y < -0.5 || Math.hypot(p.pos.x, p.pos.z) > ARENA_RADIUS * 2;")
    s = rep(s, """          if (this.tmp.distanceTo(p.pos) < 0.75) {
            const hb: HitboxDef = {
              id: 'shuriken',
              socket: SOCKET.CHEST,
              radius: 0.3,
              damage: Math.round(p.damage * p.rate),
              chakraGain: 1,
              reaction: HitReaction.STAGGER,
              knockback: 2.0,
              launch: 0,
              hitstunFrames: BALANCE.PRJ_HITSTUN,
              blockstunFrames: 6,
              guardDamage: 3,
              priority: HitPriority.NONE,
              activeStart: 0,
              activeEnd: 0,
            };""", """          if (this.tmp.distanceTo(p.pos) < (p.jutsu ? p.jutsu.radius + 0.6 : 0.75)) {
            const hb: HitboxDef = p.jutsu
              ? {
                  id: 'jutsu_prj', socket: SOCKET.CHEST, radius: p.jutsu.radius, damage: Math.round(p.damage * p.rate), chakraGain: 0,
                  reaction: HitReaction.TUMBLE, knockback: 18, launch: 5, hitstunFrames: 50, blockstunFrames: 20, guardDamage: 35,
                  priority: HitPriority.ARMORED_JUTSU, activeStart: 0, activeEnd: 0,
                }
              : {
                  id: 'shuriken',
                  socket: SOCKET.CHEST,
                  radius: 0.3,
                  damage: Math.round(p.damage * p.rate),
                  chakraGain: 1,
                  reaction: HitReaction.STAGGER,
                  knockback: 2.0,
                  launch: 0,
                  hitstunFrames: BALANCE.PRJ_HITSTUN,
                  blockstunFrames: 6,
                  guardDamage: 3,
                  priority: HitPriority.NONE,
                  activeStart: 0,
                  activeEnd: 0,
                };
            if (p.jutsu) {
              this.effects.clashBurst(p.pos);
              this.effects.spriteBurst(p.jutsu.sprite ?? 'flame', p.pos, { color: p.jutsu.color, count: 10, size: p.jutsu.radius * 2, life: 0.45, speed: 5, additive: true, spin: 6, gravity: -4 });
              this.fsm.events.emit('SFX', { attackerId: p.owner.id, defenderId: f.id, damage: 0, text: p.jutsu.hitSfx ?? 'exp1' });
            }""")
    # the shuriken armor-pierce rule must not apply to jutsu projectiles hitting armored enemies? keep: armor pierces
    s = rep(s, """          if (DASH_STATES.has(f.state) || f.armorActive()) continue;""", """          if (!p.jutsu && (DASH_STATES.has(f.state) || f.armorActive())) continue;""")
    s = rep(s, """  update(dt: number, fighters: Fighter[]): void {""", """  /** Jutsu projectile (fireball / clay / sand): slow, big, tumbles the enemy, guardable. */
  launch(owner: Fighter, target: Fighter | null, spec: JutsuProjectile): Projectile {
    const start = new THREE.Vector3();
    owner.rig.socketWorld(SOCKET.R_HAND, start);
    if (!Number.isFinite(start.x)) start.copy(owner.position).setY(owner.position.y + 1.2);
    start.y = owner.groundY + spec.height;
    const dir = new THREE.Vector3();
    if (target) dir.copy(target.position).setY(target.groundY + spec.height).sub(start);
    else owner.forward(dir);
    dir.normalize();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(spec.radius * 0.6, 12, 8), new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.85 }));
    mesh.position.copy(start);
    this.group.add(mesh);
    const p: Projectile = { mesh, pos: start.clone(), vel: dir.multiplyScalar(spec.speed), owner, target, life: spec.life ?? 2.2, damage: spec.damage, rate: 1, spin: 0, jutsu: spec, age: 0 };
    this.list.push(p);
    this.effects.flash('flare', start, 2.0, spec.color, 0.2);
    return p;
  }

  update(dt: number, fighters: Fighter[]): void {""")
    # jutsu projectiles keep their height (no gravity) and skip the shuriken look-at spin
    s = rep(s, """      p.mesh.rotation.y += p.spin * dt;
      p.mesh.lookAt(this.tmp.copy(p.pos).add(p.vel));
      p.mesh.rotateX(Math.PI / 2);""", """      if (!p.jutsu) {
        p.mesh.rotation.y += p.spin * dt;
        p.mesh.lookAt(this.tmp.copy(p.pos).add(p.vel));
        p.mesh.rotateX(Math.PI / 2);
      }""")
    return s
rw('src/combat/Projectiles.ts', proj, 'launch(owner: Fighter')

# ---------------------------------------------------------------- Roster: projectile jutsu for Itachi / Deidara / Gaara
def roster(s):
    s = rep(s, """  ultimateName?: string;
  jutsuSfx?: string;
  ultimateSfx?: string;
}""", """  ultimateName?: string;
  jutsuSfx?: string;
  ultimateSfx?: string;
  projectile?: JutsuProjectile;
}""")
    s = rep(s, "import { CharacterDef, ComboStringDef, HitPriority, HitReaction, HitboxDef, MoveDef, SupportType } from '../core/Types';",
               "import { CharacterDef, ComboStringDef, HitPriority, HitReaction, HitboxDef, JutsuProjectile, MoveDef, SupportType } from '../core/Types';")
    s = rep(s, """    jutsuSfx: o.jutsuSfx,
    ultimateSfx: o.ultimateSfx,
    hurtboxes: [""", """    jutsuSfx: o.jutsuSfx,
    ultimateSfx: o.ultimateSfx,
    jutsuProjectile: o.projectile,
    hurtboxes: [""")
    s = rep(s, """  ultimateName: 'C2: Dragon', jutsuSfx: 'exp1', ultimateSfx: 'exp2',
});""", """  ultimateName: 'C2: Dragon', jutsuSfx: 'senko', ultimateSfx: 'exp2',
  projectile: { color: 0xf4f0d8, sprite: 'magic', speed: 17, damage: 190, radius: 0.8, height: 1.4, launchSfx: 'shuriken', hitSfx: 'exp2', life: 2.6 },
});""")
    s = rep(s, """  ultimateName: 'Amaterasu', jutsuSfx: 'goukakyu', ultimateSfx: 'exp2',
});""", """  ultimateName: 'Amaterasu', jutsuSfx: 'goukakyu', ultimateSfx: 'exp2',
  projectile: { color: 0xff7a1a, sprite: 'flame', speed: 20, damage: 210, radius: 1.1, height: 1.2, launchSfx: 'goukakyu', hitSfx: 'fireHit' },
});""")
    s = rep(s, """  ultimateName: 'Sand Tsunami', jutsuSfx: 'gar_sand2', ultimateSfx: 'gar_sandHit',
});""", """  ultimateName: 'Sand Tsunami', jutsuSfx: 'gar_sand2', ultimateSfx: 'gar_sandHit',
  projectile: { color: 0xd9c48a, sprite: 'dirt', speed: 14, damage: 200, radius: 1.3, height: 0.5, launchSfx: 'gar_sand2', hitSfx: 'gar_sandHit', life: 2.4 },
});""")
    return s
rw('src/combat/Roster.ts', roster, 'projectile: { color: 0xff7a1a')

# ---------------------------------------------------------------- FighterRig: blob shadow
def rig(s):
    s = rep(s, """  private awakenedVisual = false;""", """  /** Blob drop shadow that stays on the floor while the body is in the air. */
  readonly shadow: THREE.Mesh;
  private static shadowTex: THREE.Texture | null = null;
  private static makeShadowTex(): THREE.Texture {
    if (FighterRig.shadowTex) return FighterRig.shadowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    FighterRig.shadowTex = t;
    return t;
  }

  /** Keep the shadow on the ground: `height` is the body's height above the floor. */
  updateShadow(height: number): void {
    const h = Math.max(0, height);
    this.shadow.position.y = -h + 0.02;
    const k = 1 - Math.min(0.55, h * 0.12);
    this.shadow.scale.setScalar(k);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.9 * k;
  }

  private awakenedVisual = false;""")
    # construct the shadow in the constructor: find "this.root.add(this.mannequin)" or similar
    s = rep(s, """    this.root.add(this.mannequin);""", """    this.root.add(this.mannequin);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: FighterRig.makeShadowTex(), transparent: true, depthWrite: false, opacity: 0.9 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.renderOrder = 3;
    this.root.add(this.shadow);""")
    return s
rw('src/render/FighterRig.ts', rig, 'updateShadow(')

# ---------------------------------------------------------------- main: wire projectiles into the FSM, shadows, camera radius
def main(s):
    s = rep(s, """    this.support = new SupportSystem(this.fsm, this.projectiles, this.effects, this);""", """    this.support = new SupportSystem(this.fsm, this.projectiles, this.effects, this);
    this.fsm.projectiles = this.projectiles;""")
    s = rep(s, """      f.rig.root.rotation.y = f.prevYaw + dy * alpha;
      if (!this.paused) f.rig.advance(dt);""", """      f.rig.root.rotation.y = f.prevYaw + dy * alpha;
      f.rig.updateShadow(f.rig.root.position.y - f.groundY);
      if (!this.paused) f.rig.advance(dt);""")
    # after stage load: propagate radius to the camera (find the "stage bound" log)
    s = rep(s, """    this.stageLoading = false;""", """    this.stageLoading = false;
    this.camera.arenaRadius = this.arena.radius;""")
    return s
rw('src/main.ts', main, 'this.fsm.projectiles = this.projectiles')
print('ok')
