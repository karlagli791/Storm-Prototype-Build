"""One-off refactor of CombatStateMachine.ts for the prototype-informed overhaul:
hitstop, hit direction, life->chakra, chakra charge, shuriken throw, support interrupts,
autonomous SUPPORT_ACT, and moveDirLocal tracking."""
import re, sys
p = r'C:\Users\ysoyo\OneDrive\Desktop\wan\storm4-proto\src\combat\CombatStateMachine.ts'
s = open(p, encoding='utf-8').read()

def rep(old, new, count=1):
    global s
    assert old in s, old[:80]
    s = s.replace(old, new, count)

# imports
rep("import { DashKind, EventSink, Fighter } from './Fighter';",
    "import { DashKind, EventSink, Fighter } from './Fighter';\nimport { BALANCE } from './StormStates';\nimport { HitDir } from '../core/Types';")

# --- update(): moveDirLocal + charge/throw/support states dispatch
rep("""    // Leader switch is available from a broad set of states
    if (!f.autonomous && SWITCHABLE_STATES.has(f.state) && buf.consume(InputFlag.SWITCH)) {
      if (f.stats.canLeaderSwitch(LEADER_SWITCH_COST)) f.switchRequested = true;
    }
""", """    // Stick direction relative to facing (dash-step clip selection)
    if (mag > 0.15) {
      f.forward(this.tmpA);
      const fwd = this.moveDir.dot(this.tmpA);
      const right = this.moveDir.x * this.tmpA.z - this.moveDir.z * this.tmpA.x;
      f.moveDirLocal = Math.abs(fwd) >= Math.abs(right) ? (fwd >= 0 ? 'F' : 'B') : right >= 0 ? 'L' : 'R';
    }

    // Leader switch is available from a broad set of states
    if (!f.autonomous && SWITCHABLE_STATES.has(f.state) && buf.consume(InputFlag.SWITCH)) {
      if (f.stats.canLeaderSwitch(LEADER_SWITCH_COST)) f.switchRequested = true;
    }
""")
rep("""      case CombatState.DEAD: this.applyFriction(f, dt, 30); break;
    }
  }""", """      case CombatState.DEAD: this.applyFriction(f, dt, 30); break;
      case CombatState.CHAKRA_CHARGE: this.updateChakraCharge(f, dt, mag); break;
      case CombatState.THROW: this.updateThrow(f, dt); break;
      case CombatState.SUPPORT_ACT: this.updateSupportAct(f, dt); break;
    }
  }

  // ------------------------------------------------------------ prototype-informed states
  /** PL_ACT_CHAKRA_CHARGE: hold the chakra button with no direction to regenerate quickly. */
  private updateChakraCharge(f: Fighter, dt: number, mag: number): void {
    this.applyFriction(f, dt, 50);
    this.faceTarget(f, 0.3);
    const buf = f.input.buffer;
    f.stats.gainChakra(BALANCE.CHAKRA_RECOVER_AT_CHARGE * dt);
    if (f.stateFrame % 4 === 0) this.effects.chargeAura(f.position, f.def.code === '2nrt' ? 0x7dd3ff : 0x9fb7ff);
    if (buf.consume(InputFlag.DASH) && f.stats.canSpendChakra(CHAKRA_COST_DASH)) { this.startDash(f, 'STANDARD'); return; }
    if (buf.consume(InputFlag.JUTSU) && f.stats.spendChakra(JUTSU_COST)) { this.startJutsu(f); return; }
    if (buf.consume(InputFlag.ATTACK)) { this.startCombo(f, this.branchFromHeld(f)); return; }
    if (!buf.isHeld(InputFlag.CHARGE) || mag > 0.15 || buf.isHeld(InputFlag.GUARD)) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  /** PL_ACT_PRJ_LAND: shuriken throw. The projectile is spawned by the game loop at the release frame. */
  private updateThrow(f: Fighter, dt: number): void {
    this.applyFriction(f, dt, 60);
    if (f.stateFrame < 6) this.faceTarget(f, 0.6);
    if (f.stateFrame === THROW_RELEASE_FRAME) f.throwRequested = true;
    if (f.stateFrame >= THROW_TOTAL_FRAMES) f.enterState(f.grounded ? CombatState.IDLE_NEUTRAL : CombatState.JUMPING);
  }

  /** PL_ACT_SUP_*: the support runs its move like a combo string but ignores input and never chains. */
  private updateSupportAct(f: Fighter, dt: number): void {
    const move = f.currentMove;
    if (!move) {
      this.applyFriction(f, dt, 40);
      this.faceTarget(f, 0.5);
      if (f.stateFrame > 30) f.enterState(CombatState.IDLE_NEUTRAL);
      return;
    }
    f.moveFrame++;
    const first = move.hitboxes[0];
    const activeStart = first ? first.activeStart : 6;
    const activeEnd = first ? first.activeEnd : 12;
    if (f.moveFrame < activeStart) this.faceTarget(f, 0.5);
    const dist = f.distanceToTarget();
    if (f.moveFrame >= activeStart - 6 && f.moveFrame <= activeEnd && dist > 1.1) {
      f.forward(this.tmpA);
      f.velocity.x = this.tmpA.x * Math.max(move.forwardStep, 6);
      f.velocity.z = this.tmpA.z * Math.max(move.forwardStep, 6);
    } else {
      this.applyFriction(f, dt, 70);
    }
    if (f.moveFrame >= move.totalFrames) f.enterState(CombatState.IDLE_NEUTRAL);
  }

  /** A support character interrupts the enemy: DASH_CUT knocks a dasher out of its dash, STRIKE_BACK bounces a launched enemy back toward the leader. */
  supportInterrupt(enemy: Fighter, support: Fighter, kind: 'DASH_CUT' | 'STRIKE_BACK'): void {
    const point = enemy.position.clone();
    point.y += 1.0;
    if (kind === 'DASH_CUT') {
      const hb: HitboxDef = { id: 'sup_dash_cut', socket: SOCKET.CHEST, radius: 1, damage: 30, chakraGain: 0, reaction: HitReaction.STAGGER, knockback: 6, launch: 0, hitstunFrames: 22, blockstunFrames: 8, guardDamage: 5, priority: 3, activeStart: 0, activeEnd: 0 };
      this.applyHit(enemy, support, hb, point, { hitstop: BALANCE.HITSTOP_NORMAL });
      enemy.velocity.y = 0;
      this.events.emit('CLASH', { attackerId: support.id, defenderId: enemy.id, point, damage: 30, text: `${support.def.displayName}: DASH CUT`, color: 0xc084fc, shake: 0.2 });
    } else {
      // Reverse the flight back toward our leader (PL_ACT_DMG_BOUND_STRIKESUPPORT)
      const leader = support.team?.active;
      if (leader) {
        this.tmpA.subVectors(leader.position, enemy.position);
        this.tmpA.y = 0;
        const d = this.tmpA.length();
        if (d > 1e-3) this.tmpA.divideScalar(d);
        const hb: HitboxDef = { id: 'sup_strike_back', socket: SOCKET.CHEST, radius: 1, damage: 40, chakraGain: 0, reaction: HitReaction.LAUNCH, knockback: 10, launch: 8, hitstunFrames: 45, blockstunFrames: 8, guardDamage: 5, priority: 3, activeStart: 0, activeEnd: 0 };
        this.applyHit(enemy, support, hb, point, { hitstop: BALANCE.HITSTOP_HEAVY, direction: this.tmpA.clone() });
        this.events.emit('CLASH', { attackerId: support.id, defenderId: enemy.id, point, damage: 40, text: `${support.def.displayName}: STRIKE BACK`, color: 0xc084fc, shake: 0.25 });
      }
    }
  }""")

# --- neutral actions: charge, throw
rep("""    if (buf.consume(InputFlag.ATTACK)) {
      this.startCombo(f, this.branchFromHeld(f));
      return true;
    }
    if (buf.consume(InputFlag.JUMP)) {""", """    if (buf.consume(InputFlag.ATTACK)) {
      this.startCombo(f, this.branchFromHeld(f));
      return true;
    }
    if (buf.consume(InputFlag.THROW)) {
      f.enterState(CombatState.THROW);
      this.faceTarget(f);
      return true;
    }
    if (buf.isHeld(InputFlag.CHARGE) && mag <= 0.15 && buf.heldFrames(InputFlag.CHARGE) >= 3) {
      f.enterState(CombatState.CHAKRA_CHARGE);
      return true;
    }
    if (buf.consume(InputFlag.JUMP)) {""")

# --- applyHit: options (hitstop, direction override), hit direction, life->chakra
rep("""  /** Apply a clean hit to `defender`. Returns the damage dealt. */
  applyHit(defender: Fighter, attacker: Fighter, hb: HitboxDef, point: THREE.Vector3): number {
    if (defender.state === CombatState.DEAD) return 0;
    const dmg = defender.stats.applyDamage(hb.damage);
    attacker.stats.gainChakra(hb.chakraGain);

    // Knockback along attacker->defender
    this.tmpA.subVectors(defender.position, attacker.position);
    this.tmpA.y = 0;
    if (this.tmpA.lengthSq() < 1e-6) attacker.forward(this.tmpA);
    this.tmpA.normalize();
    const wasAirborne = !defender.grounded;
""", """  /** Apply a clean hit to `defender`. Returns the damage dealt. */
  applyHit(defender: Fighter, attacker: Fighter, hb: HitboxDef, point: THREE.Vector3, opts: { hitstop?: number; direction?: THREE.Vector3 } = {}): number {
    if (defender.state === CombatState.DEAD) return 0;
    const dmg = defender.stats.applyDamage(hb.damage);
    attacker.stats.gainChakra(hb.chakraGain);
    // RATE_DAMAGE_LIFE_TO_CHAKRA: taking damage feeds the victim's chakra a little
    defender.stats.gainChakra(dmg * BALANCE.RATE_DAMAGE_LIFE_TO_CHAKRA);

    // Knockback along attacker->defender (or an explicit direction)
    if (opts.direction) this.tmpA.copy(opts.direction);
    else this.tmpA.subVectors(defender.position, attacker.position);
    this.tmpA.y = 0;
    if (this.tmpA.lengthSq() < 1e-6) attacker.forward(this.tmpA);
    this.tmpA.normalize();
    const wasAirborne = !defender.grounded;

    // Hit direction relative to the victim's facing → directional CC2 damage clip
    defender.forward(this.tmpB);
    const fwdDot = -this.tmpA.dot(this.tmpB); // hit coming from the front if the knockback points backward
    const rightDot = -(this.tmpA.x * this.tmpB.z - this.tmpA.z * this.tmpB.x);
    defender.lastHitDir = Math.abs(fwdDot) >= Math.abs(rightDot) ? (fwdDot >= 0 ? 'F' : 'B') : rightDot >= 0 ? 'L' : 'R';

    // Hitstop (HITSTOP_*): both fighters freeze for a few frames
    const stop = opts.hitstop ?? (hb.priority >= 5 ? BALANCE.HITSTOP_HEAVY : hb.reaction === HitReaction.STAGGER ? BALANCE.HITSTOP_NORMAL : BALANCE.HITSTOP_HEAVY - 1);
    defender.hitstopFrames = Math.max(defender.hitstopFrames, stop);
    attacker.hitstopFrames = Math.max(attacker.hitstopFrames, stop);
""")

# guard break hitstop
rep("""    if (broke) {
      defender.enterState(CombatState.GUARD_BREAK);
      defender.velocity.multiplyScalar(0.5);""", """    if (broke) {
      defender.enterState(CombatState.GUARD_BREAK);
      defender.velocity.multiplyScalar(0.5);
      defender.hitstopFrames = attacker.hitstopFrames = BALANCE.HITSTOP_GUARD_BREAK;""")

# guard break recovery uses BALANCE
rep("""    if (f.stateFrame >= GUARD_BREAK_STUN_FRAMES) {
      f.stats.guardHealth = 45;""", """    if (f.stateFrame >= GUARD_BREAK_STUN_FRAMES) {
      f.stats.guardHealth = BALANCE.GUARDBREAK_RECOVER_SCORE;""")

# substitution: DODGE_WARP_UPPER when hit in the air
rep("""    // -2.5 m along the opponent's back-vector
    t.forward(this.tmpA);
    f.position.copy(t.position).addScaledVector(this.tmpA, -SUB_TELEPORT_DISTANCE);
    f.position.y = t.grounded ? 0 : t.position.y;""", """    // PL_ACT_DODGE_WARP_ENEMY: -2.5 m along the opponent's back-vector; PL_ACT_DODGE_WARP_UPPER
    // when the victim was airborne: reappear above and slightly behind instead.
    t.forward(this.tmpA);
    const upper = !f.grounded && f.position.y > 1.0;
    f.position.copy(t.position).addScaledVector(this.tmpA, upper ? -1.2 : -SUB_TELEPORT_DISTANCE);
    f.position.y = upper ? t.position.y + 2.6 : t.grounded ? 0 : t.position.y;""")

# constants
rep("const SUBSTITUTED_FRAMES = 10;", "const SUBSTITUTED_FRAMES = 10;\nconst THROW_RELEASE_FRAME = 7;\nconst THROW_TOTAL_FRAMES = 20;")

open(p, 'w', encoding='utf-8').write(s)
print('fsm patched')

# Fighter: throwRequested
p2 = r'C:\Users\ysoyo\OneDrive\Desktop\wan\storm4-proto\src\combat\Fighter.ts'
s2 = open(p2, encoding='utf-8').read()
s2 = s2.replace("  supportRequested = false;\n", "  supportRequested = false;\n  /** Set on the throw's release frame; the game loop spawns the shuriken. */\n  throwRequested = false;\n")
open(p2, 'w', encoding='utf-8').write(s2)
print('fighter patched')
