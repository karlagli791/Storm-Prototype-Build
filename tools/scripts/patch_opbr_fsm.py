"""Session 11: wire the One Piece skill palette into the combat state machine.

Adds the SKILL state (four palette skills + finisher, each with its own Haki cost and cooldown),
Armament Haki, the Observation step, ROOM, counters, teleports, skill travel and the FX hooks.
Idempotent.
"""
import io, os

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'src', 'combat', 'CombatStateMachine.ts')
s = io.open(p, encoding='utf-8').read()
if 'updateSkill' in s:
    print('already patched')
    raise SystemExit

# --- imports ---------------------------------------------------------------------------------
s = s.replace("""import { Effects } from '../render/Effects';
import { SOCKET } from './CharacterDefs';""",
"""import { Effects } from '../render/Effects';
import { OpbrFX } from '../render/OpbrFX';
import { OpbrFxEvent, OpbrSkill } from '../core/Types';
import { SOCKET } from './CharacterDefs';""")

s = s.replace("""const THROW_RELEASE_FRAME = 7;""",
"""/** One Piece: a Haki coat lasts 12 s and hardens every strike. */
const HAKI_DURATION_FRAMES = 720;
const HAKI_COST = 25;
const HAKI_DAMAGE_MULT = 1.25;
/** Law's ROOM stays up for 10 s. */
const ROOM_FRAMES = 600;
const THROW_RELEASE_FRAME = 7;""")

# --- fx sink ---------------------------------------------------------------------------------
s = s.replace("""  /** Set by the game so jutsu can launch projectiles. */
  projectiles: import('./Projectiles').Projectiles | null = null;""",
"""  /** Set by the game so jutsu can launch projectiles. */
  projectiles: import('./Projectiles').Projectiles | null = null;
  /** Set by the game: effects for the One Piece skills. */
  opbrFx: OpbrFX | null = null;""")

# --- per-tick bookkeeping + state case --------------------------------------------------------
s = s.replace("""    f.stateFrame++;
    if (f.subLockFrames > 0) f.subLockFrames--;""",
"""    f.stateFrame++;
    if (f.subLockFrames > 0) f.subLockFrames--;
    // One Piece fighters: skill cooldowns, ROOM and the Haki coat run on their own timers.
    if (f.def.opbr) {
      for (let i = 0; i < f.skillCooldowns.length; i++) if (f.skillCooldowns[i] > 0) f.skillCooldowns[i] = Math.max(0, f.skillCooldowns[i] - dt);
      if (f.roomFrames > 0) f.roomFrames--;
      if (f.counterFrames > 0) f.counterFrames--;
      if (f.hakiFrames > 0) {
        f.hakiFrames--;
        if (f.hakiFrames === 0) {
          f.rig.setAwakened(false);
          this.events.emit('AWAKEN', { attackerId: f.id, defenderId: -1, damage: 0, text: `${f.def.displayName}: HAKI OFF`, color: 0x9a9ab0 });
        } else if (f.stateFrame % 10 === 0) {
          this.tmpB.copy(f.position).setY(f.position.y + 1.0);
          this.opbrFx?.play('haki', this.tmpB, f.forward(this.tmpA), f.def.opbr.hakiColor ?? 0x2a2a3a, 0.5, f.groundY);
        }
      }
    }""")

s = s.replace("""      case CombatState.JUTSU: this.updateJutsu(f, dt); break;""",
"""      case CombatState.JUTSU: this.updateJutsu(f, dt); break;
      case CombatState.SKILL: this.updateSkill(f, dt); break;""")

# --- neutral actions: the palette comes first -------------------------------------------------
s = s.replace("""  private tryNeutralActions(f: Fighter, mag: number): boolean {
    const buf = f.input.buffer;
    buf.flush(InputFlag.SUB); // subs are only meaningful in hitstun""",
"""  private tryNeutralActions(f: Fighter, mag: number): boolean {
    const buf = f.input.buffer;
    buf.flush(InputFlag.SUB); // subs are only meaningful in hitstun
    if (f.def.opbr && this.tryOpbrActions(f)) return true;""")

# --- combo cancels into skills ---------------------------------------------------------------
s = s.replace("""    // Cancels once the strike is out: ultimate, jutsu, jump (ground or air), shuriken.
    if (f.moveFrame >= activeStart) {""",
"""    // Cancels once the strike is out: ultimate, jutsu, jump (ground or air), shuriken.
    if (f.moveFrame >= activeStart) {
      if (f.def.opbr && this.tryOpbrActions(f)) return;""")

# --- the OPBR block --------------------------------------------------------------------------
block = '''
  // =========================================================================
  // One Piece fighters — skill palette, Haki, ROOM
  // =========================================================================
  /** L1 + face buttons (skills), R1 + ○ (finisher), R1 + △ (Haki), R1 (Observation step). */
  private tryOpbrActions(f: Fighter): boolean {
    const prof = f.def.opbr;
    if (!prof) return false;
    const buf = f.input.buffer;
    if (buf.consume(InputFlag.HAKI)) {
      if (this.startHaki(f)) return true;
    }
    if (buf.consume(InputFlag.STEP)) {
      this.startDodge(f);
      return true;
    }
    const slots: Array<[number, number]> = [[InputFlag.SKILL1, 0], [InputFlag.SKILL2, 1], [InputFlag.SKILL3, 2], [InputFlag.SKILL4, 3]];
    for (const [flag, idx] of slots) {
      if (buf.consume(flag) && this.startSkill(f, idx)) return true;
    }
    if (buf.consume(InputFlag.ULTIMATE) && this.startSkill(f, 4)) return true;
    return false;
  }

  /** Armament Haki: the body blackens, strikes hit harder and skills gain armour. */
  private startHaki(f: Fighter): boolean {
    const prof = f.def.opbr;
    if (!prof || f.hakiFrames > 0) return false;
    if (!f.stats.spendChakra(HAKI_COST)) return false;
    f.hakiFrames = HAKI_DURATION_FRAMES;
    f.rig.setAwakened(true, prof.hakiColor ?? 0x2a2a3a);
    this.tmpB.copy(f.position).setY(f.position.y + 1.0);
    this.opbrFx?.play('haki_burst', this.tmpB, f.forward(this.tmpA), (f.def.color as number) ?? 0xffffff, 1.1, f.groundY);
    this.events.emit('AWAKEN', { attackerId: f.id, defenderId: -1, damage: 0, text: `${f.def.displayName}: ARMAMENT HAKI`, color: 0xc8a8ff, shake: 0.25 });
    return true;
  }

  /** Start a palette skill. Slot 4 is the finisher and needs a full gauge. */
  startSkill(f: Fighter, idx: number): boolean {
    const prof = f.def.opbr;
    if (!prof) return false;
    const sk: OpbrSkill | undefined = idx === 4 ? prof.ultimate : prof.skills[idx];
    if (!sk) return false;
    if (f.skillCooldowns[idx] > 0) {
      this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: 'guard_hit' });
      return false;
    }
    if (idx === 4) {
      if (f.stats.chakra < sk.cost || !f.target) return false;
      f.stats.chakra = 0;
    } else if (!f.stats.spendChakra(sk.cost)) {
      return false;
    }
    f.skillCooldowns[idx] = sk.cooldown;
    f.skill = sk;
    f.enterState(CombatState.SKILL);
    f.beginMove(sk.move, 'NEUTRAL', idx);
    f.velocity.set(0, 0, 0);
    this.faceTarget(f);
    if (sk.cinematic) {
      f.hitstopFrames = 0;
      this.events.emit('ULTIMATE', { attackerId: f.id, defenderId: f.target?.id ?? -1, damage: 0, text: `${f.def.displayName}: ${sk.name.toUpperCase()}!`, color: (f.def.color as number) ?? 0xffffff, shake: 0.5 });
    } else {
      this.events.emit('JUTSU', { attackerId: f.id, defenderId: -1, damage: 0, text: `${f.def.displayName}: ${sk.name}`, color: (f.def.color as number) ?? 0x8adfff });
    }
    return true;
  }

  private playOpbrFx(f: Fighter, e: OpbrFxEvent): void {
    const dir = f.forward(this.tmpA);
    if (e.ahead !== undefined) {
      this.tmpB.copy(f.position).addScaledVector(dir, e.ahead).setY(f.position.y + 1.1);
    } else if (e.socket) {
      f.rig.socketWorld(e.socket, this.tmpB);
    } else {
      f.rig.socketWorld(SOCKET.R_HAND, this.tmpB);
    }
    const color = e.color ?? f.def.opbr?.hakiColor ?? (f.def.color as number);
    if (e.kind === 'room') f.roomFrames = ROOM_FRAMES;
    this.opbrFx?.play(e.kind, this.tmpB, dir, color, e.scale ?? 1, f.groundY);
    if (e.kind === 'quake' || e.kind === 'conqueror' || e.kind === 'haki_burst') {
      this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: e.sfx ?? 'exp1', shake: e.kind === 'quake' ? 0.45 : 0.3 });
    }
  }

  private updateSkill(f: Fighter, dt: number): void {
    const move = f.currentMove;
    const sk = f.skill;
    if (!move || !sk) {
      f.enterState(CombatState.IDLE_NEUTRAL);
      return;
    }
    f.moveFrame++;
    const first = move.hitboxes[0];
    const start = first?.activeStart ?? Math.floor(move.totalFrames * 0.4);
    const end = move.hitboxes.length ? move.hitboxes[move.hitboxes.length - 1].activeEnd : start;

    // Counter stance: he reads the attack — invulnerable until his own strike comes out.
    if (sk.counter && f.moveFrame < start) {
      f.invulnFrames = Math.max(f.invulnFrames, 2);
      f.counterFrames = 2;
    }
    // Shambles: swap behind the opponent partway through.
    if (sk.teleport && f.moveFrame === 10 && f.target) {
      const t = f.target;
      t.forward(this.tmpA);
      f.position.copy(t.position).addScaledVector(this.tmpA, -1.6);
      f.position.y = t.position.y;
      f.yaw = t.yaw;
      this.opbrFx?.play('shambles', f.position.clone().setY(f.position.y + 1.0), this.tmpA, 0x8adfff, 1.2, f.groundY);
    }
    // Movement: an explicit travel window, a step through the active frames, otherwise friction.
    if (sk.travel && f.moveFrame >= sk.travel.t && f.moveFrame < sk.travel.t + sk.travel.frames) {
      f.forward(this.tmpA);
      f.velocity.x = this.tmpA.x * sk.travel.speed;
      f.velocity.z = this.tmpA.z * sk.travel.speed;
      if (sk.travel.up && f.moveFrame === sk.travel.t) f.velocity.y = sk.travel.up;
    } else if (f.moveFrame < start) {
      this.faceTarget(f, 0.5);
      const dist = f.distanceToTarget();
      // Close a little ground so skills connect from where they look like they should.
      if (dist > 2.2 && dist < 9 && move.forwardStep > 0) {
        f.forward(this.tmpA);
        const sp = Math.min(move.forwardStep * 2.6, ((dist - 1.8) / Math.max(1, start - f.moveFrame)) * 60);
        f.velocity.x = this.tmpA.x * sp;
        f.velocity.z = this.tmpA.z * sp;
      } else {
        this.applyFriction(f, dt, 60);
      }
    } else if (f.moveFrame <= end && f.distanceToTarget() > 1.3) {
      f.forward(this.tmpA);
      f.velocity.x = this.tmpA.x * move.forwardStep;
      f.velocity.z = this.tmpA.z * move.forwardStep;
    } else {
      this.applyFriction(f, dt, 70);
    }

    for (const e of sk.fx ?? []) if (f.moveFrame === e.t) this.playOpbrFx(f, e);
    const pj = sk.projectile;
    if (pj && this.projectiles && f.moveFrame === pj.t) {
      this.projectiles.launch(f, f.target, pj);
      this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: pj.launchSfx ?? 'shuriken' });
    }
    if (sk.cinematic && f.moveFrame === Math.floor(move.totalFrames * 0.5)) {
      this.events.emit('SFX', { attackerId: f.id, defenderId: -1, damage: 0, text: 'exp2', shake: 0.4 });
    }
    if (f.moveFrame >= move.totalFrames) {
      f.skill = null;
      f.enterState(f.grounded ? CombatState.IDLE_NEUTRAL : CombatState.JUMPING);
    }
  }
'''
s = s.replace("""  // ---------------------------------------------------------------- guard
  private updateGuarding""", block + """
  // ---------------------------------------------------------------- guard
  private updateGuarding""")

# --- Haki damage bonus -------------------------------------------------------------------------
s = s.replace("""  applyHit(defender: Fighter, attacker: Fighter, hb: HitboxDef, point: THREE.Vector3, opts: { hitstop?: number; direction?: THREE.Vector3 } = {}): number {""",
"""  applyHit(defender: Fighter, attacker: Fighter, hb: HitboxDef, point: THREE.Vector3, opts: { hitstop?: number; direction?: THREE.Vector3 } = {}): number {
    // Armament Haki hardens every strike while the coat is on.
    if (attacker.hakiFrames > 0) hb = { ...hb, damage: Math.round(hb.damage * HAKI_DAMAGE_MULT) };""")

io.open(p, 'w', encoding='utf-8').write(s)
print('fsm patched')
