"""Session 10 movement: uniform directional jumps (forward / back / side / diagonal) with ~1 s of air,
double jump as a real jump, no substitution smoke on jumps, correct chakra-dash clips, guard roll,
win pose state, intro stagger fields."""
import os, re
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:120]; return s.replace(old, new, count)
def between(s, start, end, new):
    a = s.index(start); b = s.index(end, a)
    return s[:a] + new + s[b:]

# ------------------------------------------------------------------------------------ Types
def types(s):
    s = rep(s, "export const JUMP_VELOCITY = 12.0;", """export const JUMP_VELOCITY = 13.0;
/** Horizontal speed of a directional jump — identical for every direction. */
export const JUMP_H_SPEED = 7.2;
export const DOUBLE_JUMP_VELOCITY = 12.0;
/** Ninja jumps fall slower than knockback: about one second of air per jump. */
export const JUMP_GRAVITY_SCALE = 0.8;
/** Guard roll speed. */
export const DODGE_SPEED = 11.0;""")
    s = rep(s, "  AWAKEN = 'AWAKEN',\n}", "  AWAKEN = 'AWAKEN',\n  /** Guard roll (a stick flick while guarding). */\n  DODGE = 'DODGE',\n  /** Victory pose after the round (win10 / win11). */\n  WIN = 'WIN',\n}")
    s = rep(s, "export type ComboBranch = 'NEUTRAL' | 'UP' | 'DOWN' | 'AIR';",
        "export type ComboBranch = 'NEUTRAL' | 'UP' | 'DOWN' | 'AIR' | 'FAR';\n/** Chakra nature of a character's jutsu — drives the procedural effects (ElementFX). */\nexport type ElementKind = 'wind' | 'lightning' | 'fire' | 'water' | 'sand' | 'explosion' | 'gentle' | 'strength' | 'taijutsu' | 'poison' | 'push' | 'blade' | 'scalpel' | 'dark';")
    s = rep(s, "  airString?: ComboStringDef;", """  airString?: ComboStringDef;
  /** Ranged lunge string (ATK_FAR / cmr clips): a fresh forward tilt + ○, or ○ while running in. */
  farString?: ComboStringDef;
  /** Effect style for jutsu / charge / impacts, and for the ultimate when it differs. */
  element?: ElementKind;
  ultElement?: ElementKind;
  /** Chakra colour used by auras and jutsu effects. */
  chakraColor?: number;""")
    return s
rw('src/core/Types.ts', types, 'JUMP_H_SPEED')

# ------------------------------------------------------------------------------------ Fighter
def fighter(s):
    s = rep(s, "  throwDir: HitDir | null = null;", """  throwDir: HitDir | null = null;
  /** Direction of the current jump / roll relative to the target (clip choice). */
  jumpDirLocal: HitDir | null = null;
  /** True while the jump in progress was launched from the ground or the air (not a fall). */
  jumpLaunch = false;
  /** Id of the fighter whose cinematic is holding this one (0 = free). */
  heldBy = 0;
  /** Frames the opening strike spent closing distance. */
  approachFrames = 0;
  /** Stick magnitude on the previous tick (flick detection). */
  prevStickMag = 0;
  /** Round intro: frames before this fighter's entry clip starts (the camera visits 1P first). */
  introDelay = 0;
  /** Consecutive ticks spent frozen in hitstop (watchdog). */
  frozenTicks = 0;""")
    s = rep(s, "    this.state = next;\n    this.stateFrame = 0;\n", "    this.state = next;\n    this.stateFrame = 0;\n    if (next !== CombatState.JUMPING) this.jumpLaunch = false;\n")
    return s
rw('src/combat/Fighter.ts', fighter, 'jumpLaunch')

# ------------------------------------------------------------------------------------ PlayerController
def pc(s):
    s = rep(s, "import { CombatState, GRAVITY, KNOCKBACK_STATES } from '../core/Types';", "import { CombatState, GRAVITY, JUMP_GRAVITY_SCALE, KNOCKBACK_STATES } from '../core/Types';")
    s = rep(s, "    if (!flight) f.velocity.y += GRAVITY * dt;", "    if (!flight) f.velocity.y += GRAVITY * dt * (f.state === CombatState.JUMPING ? JUMP_GRAVITY_SCALE : 1);")
    s = rep(s, "    const gy = this.arena.groundY(f.position.x, f.position.z);", "    const gy = this.arena.groundY(f.position.x, f.position.z, f.position.y);")
    s = rep(s, "        state: f.state,\n", "        state: f.state === CombatState.INTRO && f.stateFrame < f.introDelay ? CombatState.IDLE_NEUTRAL : f.state,\n")
    s = rep(s, "        falling: !f.grounded && f.velocity.y < -0.5,", "        // A launched jump keeps its take-off clip through the apex; only falls use the fall loop.\n        falling: f.state === CombatState.JUMPING ? !f.jumpLaunch : !f.grounded && f.velocity.y < -0.5,")
    s = rep(s, "        throwDir: f.throwDir,", "        throwDir: f.throwDir,\n        jumpDir: f.state === CombatState.DODGE || (f.state === CombatState.JUMPING && f.jumpLaunch) ? f.jumpDirLocal : null,")
    return s
rw('src/combat/PlayerController.ts', pc, 'JUMP_GRAVITY_SCALE')

# ------------------------------------------------------------------------------------ Rig
def rig(s):
    m = re.search(r'export interface PoseContext \{[^}]*?\n(\s+)throwDir\?: HitDir \| null;', s); assert m
    s = s.replace(m.group(0), m.group(0) + f"\n{m.group(1)}/** Jump / roll direction relative to the target. */\n{m.group(1)}jumpDir?: HitDir | null;")
    s = rep(s, "|${ctx.awInfix ?? ''}`;", "|${ctx.awInfix ?? ''}|${ctx.jumpDir ?? ''}`;")
    s = rep(s, "      throwDir: ctx.throwDir,", "      throwDir: ctx.throwDir,\n      jumpDir: ctx.jumpDir,")
    return s
rw('src/render/FighterRig.ts', rig, 'jumpDir?: HitDir | null')

# ------------------------------------------------------------------------------------ bindings
def states(s):
    s = rep(s, "  throwDir?: HitDir | null;\n", "  throwDir?: HitDir | null;\n  jumpDir?: HitDir | null;\n")
    s = between(s, "    case CombatState.JUMPING:\n", "    case CombatState.DASH_STARTUP:", """    case CombatState.JUMPING:
      // Directional jump: the game's directional hop clips (PL_ANM_DSH_FWD / BK / L / R), then the air loop.
      if (ctx.jumpDir)
        return { act: ctx.jumpDir === 'F' ? 'PL_ACT_JMP_F' : ctx.jumpDir === 'B' ? 'PL_ACT_JMP_B' : 'PL_ACT_JMP_SIDE', anm: 'PL_ANM_DSH_' + ctx.jumpDir, clips: [O(dirClip('{c}', ctx.jumpDir, { F: 'dsf0', B: 'dsb0', L: 'dsl0', R: 'dsr0' }), '{c}jmp1'), O('{c}jmp0', '{c}jmp1'), L('{c}jmp1')] };
      // jmp0 = take-off (one shot) → jmp1 = airborne loop. The common bank's fal0/fal1 are
      // *damage* falls (arms flailing) and are only used by LAUNCHED.
      return ctx.falling
        ? { act: 'PL_ACT_FALL', anm: 'PL_ANM_FALL0', clips: [L('{c}jmp1'), L('{c}jmp0'), L('{c}nut0')] }
        : { act: 'PL_ACT_JMP_V', anm: 'PL_ANM_JMP0', clips: [O('{c}jmp0', '{c}jmp1'), L('{c}jmp1')] };
""")
    # chakra dash: dsh0s (begin) → dsh0l (loop); dsh1l is the *back* dash loop (the rolling look)
    s = rep(s, "clips: [O('{c}dsh0s', '{c}dsh1l'), L('{c}dsf0')] };", "clips: [O('{c}dsh0s', '{c}dsh0l'), L('{c}dsh0l'), L('1cmndsh0l')] };")
    s = rep(s, "clips: [L('{c}dsh1l'), L('1cmndsh0l'), L('{c}dsf0')] };", "clips: [L('{c}dsh0l'), L('1cmndsh0l'), L('{c}run1')] };")
    s = rep(s, "clips: [O('{c}dsh0l'), O('{c}lan0')] };", "clips: [O('{c}lan0', '{c}nut0'), L('{c}nut0')] };")
    s = rep(s, "    case CombatState.DEAD:\n", """    case CombatState.DODGE:
      return { act: 'PL_ACT_GUARD_STEP', anm: 'PL_ANM_DSH_' + (ctx.jumpDir ?? 'B'), clips: [O(dirClip('{c}', ctx.jumpDir ?? 'B', { F: 'dsf0', B: 'dsb0', L: 'dsl0', R: 'dsr0' })), O('1cmnddg0'), L('{c}grd0')] };
    case CombatState.WIN:
      return { act: 'PL_ACT_WIN', anm: 'PL_ANM_WIN_S', clips: [O('{c}win10', '{c}win11'), L('{c}win11'), L('{c}nut0')] };
    case CombatState.DEAD:
""")
    return s
rw('src/combat/StormStates.ts', states, 'PL_ACT_GUARD_STEP')

# ------------------------------------------------------------------------------------ FSM
def fsm(s):
    s = rep(s, "  JUMP_VELOCITY,\n", "  JUMP_VELOCITY,\n  JUMP_H_SPEED,\n  DOUBLE_JUMP_VELOCITY,\n  DODGE_SPEED,\n")
    s = rep(s, "const INTRO_FRAMES = 100;", "const INTRO_FRAMES = 150;")
    s = rep(s, """    if (buf.consume(InputFlag.JUMP)) {
      if (mag > 0.15) {
        f.enterState(CombatState.NINJA_MOVE);
        this.beginNinjaMove(f);
      } else {
        f.enterState(CombatState.JUMPING);
        f.velocity.y = JUMP_VELOCITY;
        f.grounded = false;
      }
      return true;
    }""", """    if (buf.consume(InputFlag.JUMP)) {
      this.beginJump(f, mag, false);
      return true;
    }""")
    s = rep(s, "      case CombatState.JUMPING: this.updateJumping(f, dt, mag); break;",
               "      case CombatState.JUMPING: this.updateJumping(f, dt, mag); break;\n      case CombatState.DODGE: this.updateDodge(f, dt); break;\n      case CombatState.WIN: f.velocity.x = 0; f.velocity.z = 0; f.invulnFrames = 2; buf.clear(); break;")
    s = rep(s, "      case CombatState.GUARDING: this.updateGuarding(f, dt); break;", "      case CombatState.GUARDING: this.updateGuarding(f, dt, mag); break;")
    s = rep(s, "      case CombatState.SUPPORT_ACT: this.updateSupportAct(f, dt); break;\n    }\n  }", "      case CombatState.SUPPORT_ACT: this.updateSupportAct(f, dt); break;\n    }\n    f.prevStickMag = mag;\n  }")
    s = rep(s, "    this.effects.smokePuff(p, 0xffffff, 4);", "    this.effects.dustKick(p, 5, 0.5);")
    s = rep(s, """  private updateGuarding(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 50);
    this.faceTarget(f, 0.4);
    const buf = f.input.buffer;""", """  private updateGuarding(f: Fighter, dt: number, mag: number): void {
    this.applyFriction(f, dt, 50);
    this.faceTarget(f, 0.4);
    const buf = f.input.buffer;
    // Guard roll: flick the stick while guarding.
    if (mag > 0.6 && f.prevStickMag < 0.35 && f.stateFrame > 2) {
      this.startDodge(f);
      return;
    }""")
    s = between(s, "  private updateJumping(", "  // --------------------------------------------------------------- intro / ultimate / awakening", """  /** Direction of the stick relative to the target: F / B / L / R (diagonals lean to F / B). */
  private targetRelativeDir(f: Fighter): HitDir {
    this.dirToTarget(f, this.tmpA);
    const fwd = this.moveDir.dot(this.tmpA);
    const right = this.moveDir.x * this.tmpA.z - this.moveDir.z * this.tmpA.x;
    return Math.abs(fwd) >= Math.abs(right) * 0.8 ? (fwd >= 0 ? 'F' : 'B') : right >= 0 ? 'L' : 'R';
  }

  /**
   * Uniform ninja jump: the same launch speed and air time in every direction, travelling exactly
   * along the stick (forward goes forward, back goes back, diagonals go diagonal). In the air the
   * same button is a second, full jump.
   */
  beginJump(f: Fighter, mag: number, air: boolean): void {
    const directional = mag > 0.15;
    f.enterState(CombatState.JUMPING);
    f.jumpLaunch = true;
    f.velocity.y = air ? DOUBLE_JUMP_VELOCITY : JUMP_VELOCITY;
    if (directional) {
      f.velocity.x = this.moveDir.x * JUMP_H_SPEED;
      f.velocity.z = this.moveDir.z * JUMP_H_SPEED;
      f.jumpDirLocal = this.targetRelativeDir(f);
    } else {
      f.velocity.x = air ? f.velocity.x * 0.35 : 0;
      f.velocity.z = air ? f.velocity.z * 0.35 : 0;
      f.jumpDirLocal = null;
    }
    this.faceTarget(f, 1);
    if (air) { f.doubleJumped = true; f.jumpCount++; } else f.jumpCount = 0;
    f.grounded = false;
    f.position.y += 0.03;
    const p = f.position.clone();
    if (!air) p.y = f.groundY + 0.02;
    // plain dust — no substitution smoke on jumps
    this.effects.dustKick(p, air ? 3 : 6, air ? 0.4 : 0.6, air ? 0.5 : 0.8);
    if (!air) this.effects.groundRing(p, 1.6, 0xf4ead8, 0.3);
    else this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: 'jump2' });
  }

  private updateJumping(f: Fighter, dt: number, mag: number): void {
    this.faceTarget(f, 0.25);
    const buf = f.input.buffer;
    // The launch velocity is kept (no accumulating drift, so no sliding on landing); the stick only nudges it.
    if (mag > 0.15) {
      f.velocity.x += this.moveDir.x * 5 * dt;
      f.velocity.z += this.moveDir.z * 5 * dt;
      const sp = Math.hypot(f.velocity.x, f.velocity.z);
      if (sp > JUMP_H_SPEED) { f.velocity.x *= JUMP_H_SPEED / sp; f.velocity.z *= JUMP_H_SPEED / sp; }
    }
    if (buf.consume(InputFlag.DASH) && f.stats.canSpendChakra(CHAKRA_COST_DASH)) {
      this.startDash(f, 'STANDARD');
      return;
    }
    if (buf.consume(InputFlag.ATTACK)) {
      this.startCombo(f, 'AIR');
      return;
    }
    if (buf.consume(InputFlag.THROW)) {
      const side = f.jumpLaunch && (f.jumpDirLocal === 'L' || f.jumpDirLocal === 'R') ? f.jumpDirLocal : null;
      f.enterState(CombatState.THROW);
      f.throwDir = side; // side jump → PRJ_DL / PRJ_DR clip, otherwise the air throw
      return;
    }
    if (f.stateFrame > 3 && !f.doubleJumped && buf.consume(InputFlag.JUMP)) {
      this.beginJump(f, mag, true);
      return;
    }
    if (f.grounded && f.stateFrame > 2 && f.velocity.y <= 0) {
      f.jumpDirLocal = null;
      f.enterState(mag > 0.15 ? CombatState.RUNNING : CombatState.IDLE_NEUTRAL);
    }
  }

  /** Guard roll: short invulnerable roll in the stick direction, back to guard if still held. */
  private startDodge(f: Fighter): void {
    f.enterState(CombatState.DODGE);
    f.jumpDirLocal = this.targetRelativeDir(f);
    f.velocity.x = this.moveDir.x * DODGE_SPEED;
    f.velocity.z = this.moveDir.z * DODGE_SPEED;
    f.invulnFrames = 12;
    this.faceTarget(f, 1);
    const p = f.position.clone(); p.y = f.groundY + 0.02;
    this.effects.dustKick(p, 6, 0.55, 0.9);
    this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: 'jump2' });
  }

  private updateDodge(f: Fighter, dt: number): void {
    this.faceTarget(f, 0.5);
    if (f.stateFrame > 12) this.applyFriction(f, dt, 70);
    else if (f.stateFrame % 4 === 0) { const p = f.position.clone(); p.y = f.groundY + 0.02; this.effects.dustKick(p, 2, 0.4, 0.5); }
    if (f.stateFrame >= 24) f.enterState(f.input.buffer.isHeld(InputFlag.GUARD) ? CombatState.GUARDING : CombatState.IDLE_NEUTRAL);
  }

""")
    return s
rw('src/combat/CombatStateMachine.ts', fsm, 'beginJump(f: Fighter')
print('move ok')
