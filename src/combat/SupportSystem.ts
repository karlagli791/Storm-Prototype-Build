/**
 * SupportSystem.ts — Support characters (PL_ACT_SUP_*): two supports per team, each with a
 * chosen assist type. Manual calls (L1 = support 1, R1 = support 2: combo join) plus the three
 * automatic intervention types confirmed by the prototype's debug select:
 *   ATTACK  = combo join + strike back (PL_ACT_SUP_COMBO_JOIN / DMG_BOUND_STRIKESUPPORT)
 *   GUARD   = dash cut + charge guard (PL_ACT_SUP_DASH_CUT / SUP_CHARGE_GUARD)
 *   BALANCE = cover fire (DAMAGERATE_SUPPORT_COVERING_FIRE)
 * A support physically enters the arena (PL_ACT_SUP_ENTRY), acts autonomously for a few dozen
 * frames, and exits (PL_ACT_SUP_EXIT). While present it can hit but cannot be hit.
 */
import * as THREE from 'three';
import { CombatState, InputFlag, SupportType } from '../core/Types';
import { Fighter, Team, EventSink } from './Fighter';
import { CombatStateMachine } from './CombatStateMachine';
import { Projectiles } from './Projectiles';
import { Effects } from '../render/Effects';
import { BALANCE } from './StormStates';

export type SupportAction = 'COMBO_JOIN' | 'STRIKE_BACK' | 'DASH_CUT' | 'CHARGE_GUARD' | 'COVER_FIRE';

const LAUNCH_STATES: ReadonlySet<CombatState> = new Set([CombatState.LAUNCHED, CombatState.TUMBLE]);
const VULNERABLE_TO_DASH: ReadonlySet<CombatState> = new Set([
  CombatState.COMBO_STRING,
  CombatState.HITSTUN,
  CombatState.CRUMPLE,
  CombatState.THROW,
  CombatState.CHAKRA_CHARGE,
  CombatState.JUTSU,
]);

interface ActiveSupport {
  team: Team;
  fighter: Fighter;
  action: SupportAction;
  frames: number;
  fired: number;
}

export class SupportSystem {
  private active: ActiveSupport[] = [];
  private tmp = new THREE.Vector3();

  constructor(private fsm: CombatStateMachine, private projectiles: Projectiles, private effects: Effects, private events: EventSink) {}

  /** Assist type of a support (chosen on the select screen, defaults to the character's own). */
  typeOf(s: Fighter): SupportType {
    return s.supportType ?? s.def.supportType;
  }

  private ready(team: Team, s: Fighter): boolean {
    if (s.autonomous || s.rig.root.visible) return false;
    if (s.supportCooldown > 0) return false;
    if (team.active.state === CombatState.DEAD) return false;
    return team.stats.supportGauge >= BALANCE.SUPPORT_GAUGE_USE_NORMAL;
  }

  /** Any support of the team that can come out right now. */
  isReady(team: Team, index: number): boolean {
    const s = team.supports[index];
    return !!s && this.ready(team, s);
  }

  /** Manual call: L1 / R1 (Y / T). The support runs in and fires its jutsu (combo join). */
  requestCall(team: Team, index: number): boolean {
    const s = team.supports[index];
    if (!s || !this.ready(team, s)) return false;
    const lead = team.active;
    if (!lead.target) return false;
    team.stats.spendSupport(BALANCE.SUPPORT_GAUGE_USE_NORMAL);
    this.enter(team, 'COMBO_JOIN', s);
    return true;
  }

  /** Automatic interventions, evaluated every tick for both teams. */
  update(dt: number, teams: Team[]): void {
    for (const team of teams) {
      for (const s of team.supports) if (s.supportCooldown > 0) s.supportCooldown -= dt;
      // Support gauge recovers at the best of the two types' rates (SUP_GAUGE_RECOVER_RATE_*TYPE)
      const rateOf = (t: SupportType) => (t === 'ATTACK' ? BALANCE.SUP_GAUGE_RECOVER_RATE_ATTACKTYPE : t === 'GUARD' ? BALANCE.SUP_GAUGE_RECOVER_RATE_GUARDTYPE : BALANCE.SUP_GAUGE_RECOVER_RATE_BALANCETYPE);
      const rate = Math.max(...team.supports.map((s) => rateOf(this.typeOf(s))));
      team.stats.supportGauge = Math.min(100, team.stats.supportGauge + BALANCE.SUPPORT_GAUGE_RECOVER_SPD * (rate - 1) * dt);

      const lead = team.active;
      const enemy = lead.target;
      if (!enemy || lead.state === CombatState.DEAD) continue;
      const dist = lead.distanceToTarget();
      for (const s of team.supports) {
        if (!this.ready(team, s)) continue;
        const type = this.typeOf(s);
        let action: SupportAction | null = null;
        switch (type) {
          case 'BALANCE':
            // Cover fire: enemy far away and closing or dashing.
            if (dist > 9 && (enemy.state === CombatState.RUNNING || enemy.state === CombatState.DASH_HOMING || enemy.state === CombatState.SPARK_DASH)) action = 'COVER_FIRE';
            break;
          case 'GUARD':
            // Dash cut: an incoming enemy chakra dash while the leader is not able to answer.
            if ((enemy.state === CombatState.DASH_HOMING || enemy.state === CombatState.SPARK_DASH) && dist < 7 && VULNERABLE_TO_DASH.has(lead.state)) action = 'DASH_CUT';
            else if (lead.state === CombatState.GUARD_BREAK && lead.stateFrame < 4) action = 'CHARGE_GUARD';
            break;
          case 'ATTACK':
            // Strike back: the enemy is flying away from our leader after a launch — bounce them back.
            if (LAUNCH_STATES.has(enemy.state) && enemy.lastHitBy === lead.id && enemy.stateFrame > 6 && enemy.stateFrame < 20) {
              this.tmp.subVectors(enemy.position, lead.position);
              const away = this.tmp.dot(enemy.velocity) > 0 && Math.hypot(enemy.velocity.x, enemy.velocity.z) > 6;
              if (away) action = 'STRIKE_BACK';
            }
            break;
        }
        if (action) {
          team.stats.spendSupport(BALANCE.SUPPORT_GAUGE_USE_NORMAL);
          this.enter(team, action, s);
          break; // one intervention at a time
        }
      }
    }

    // Drive active supports
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.frames--;
      const s = a.fighter;
      const enemy = a.team.active.target;
      switch (a.action) {
        case 'COVER_FIRE':
          if (a.frames % 8 === 0 && a.fired < 3 && enemy) {
            this.projectiles.throw(s, enemy, { rate: BALANCE.DAMAGERATE_SUPPORT_COVERING_FIRE, spread: 0.12 });
            a.fired++;
          }
          break;
        case 'DASH_CUT':
          if (enemy && (enemy.state === CombatState.DASH_HOMING || enemy.state === CombatState.SPARK_DASH) && enemy.position.distanceTo(s.position) < 2.2) {
            this.fsm.supportInterrupt(enemy, s, 'DASH_CUT');
          }
          break;
        case 'STRIKE_BACK':
          if (enemy && LAUNCH_STATES.has(enemy.state) && enemy.position.distanceTo(s.position) < 3.0 && a.fired === 0) {
            this.fsm.supportInterrupt(enemy, s, 'STRIKE_BACK');
            a.fired = 1;
          }
          break;
        case 'CHARGE_GUARD':
          break;
        case 'COMBO_JOIN':
          break;
      }
      if (a.frames <= 0 || s.state === CombatState.IDLE_NEUTRAL) this.exit(a, i);
    }
  }

  private enter(team: Team, action: SupportAction, s: Fighter): void {
    const lead = team.active;
    const enemy = lead.target;
    // Spawn beside the leader, facing the enemy
    lead.forward(this.tmp);
    const side = new THREE.Vector3(-this.tmp.z, 0, this.tmp.x).multiplyScalar(action === 'CHARGE_GUARD' ? 0 : team.supports.indexOf(s) === 0 ? 1.6 : -1.6);
    s.position.copy(lead.position).add(side);
    if (action === 'DASH_CUT' && enemy) {
      s.position.copy(lead.position).lerp(enemy.position, 0.35);
    } else if (action === 'CHARGE_GUARD' && enemy) {
      s.position.copy(lead.position).addScaledVector(this.tmp, 1.2);
    } else if (action === 'STRIKE_BACK' && enemy) {
      s.position.copy(enemy.position).addScaledVector(enemy.velocity, 0.25);
      s.position.y = 0;
    } else if (action === 'COMBO_JOIN' && enemy) {
      // Jutsu range decides the spawn distance so the palm hitbox lands on the enemy.
      const reach = Math.max(2.2, Math.min(6, s.def.jutsu.forwardStep * 0.55));
      s.position.copy(enemy.position).addScaledVector(this.tmp, -reach);
      s.position.y = 0;
    }
    s.position.y = Math.max(s.position.y, lead.groundY);
    s.velocity.set(0, 0, 0);
    s.grounded = true;
    s.target = enemy;
    s.yaw = s.yawToTarget();
    s.autonomous = true;
    s.invulnFrames = 9999;
    s.rig.root.visible = true;
    s.input.buffer.clear();
    if (!team.present.includes(s)) team.present.push(s);
    const frames = action === 'COVER_FIRE' ? 40 : action === 'CHARGE_GUARD' ? 45 : action === 'COMBO_JOIN' ? s.def.jutsu.totalFrames + 12 : 50;
    if (action === 'COMBO_JOIN') {
      s.enterState(CombatState.SUPPORT_ACT);
      s.beginMove(s.def.jutsu, 'NEUTRAL', 0);
    } else if (action === 'STRIKE_BACK' || action === 'DASH_CUT') {
      s.enterState(CombatState.SUPPORT_ACT);
      s.beginMove(s.def.neutralString.moves[Math.min(2, s.def.neutralString.moves.length - 1)], 'NEUTRAL', 0);
    } else if (action === 'CHARGE_GUARD') {
      s.enterState(CombatState.GUARDING);
    } else {
      s.enterState(CombatState.SUPPORT_ACT);
      s.currentMove = null;
    }
    const p = s.position.clone();
    p.y += 0.6;
    this.effects.switchFlash(p, s.def.color as number);
    this.active.push({ team, fighter: s, action, frames, fired: 0 });
    this.events.emit('SWITCH', { attackerId: s.id, defenderId: enemy?.id ?? -1, damage: 0, text: `${s.def.displayName}: SUPPORT ${action.replace('_', ' ')}`, color: 0xc084fc });
  }

  private exit(a: ActiveSupport, index: number): void {
    const s = a.fighter;
    const p = s.position.clone();
    p.y += 0.5;
    this.effects.smokePuff(p, 0xffffff, 6);
    s.invulnFrames = 0;
    s.supportCooldown = BALANCE.SUPPORT_INJURED_WAIT_SEC;
    a.team.retire(s);
    this.active.splice(index, 1);
  }

  /** True while `f` is out as a support. */
  isSupporting(f: Fighter): boolean {
    return this.active.some((a) => a.fighter === f);
  }

  /** Consume buffered support-call inputs for a team (L1 → support 1, R1 → support 2). */
  pollInput(team: Team): void {
    const lead = team.active;
    if (lead.autonomous) return;
    const buf = lead.input.buffer;
    if (buf.consume(InputFlag.SUPPORT)) { if (!this.requestCall(team, 0)) buf.flush(InputFlag.SUPPORT); }
    if (buf.consume(InputFlag.SUPPORT2)) { if (!this.requestCall(team, 1)) buf.flush(InputFlag.SUPPORT2); }
  }

  reset(): void {
    for (let i = this.active.length - 1; i >= 0; i--) this.exit(this.active[i], i);
  }
}
