/**
 * CombatStats.ts — Resource manager: Health (1000), Chakra (100%), Substitution Stocks
 * (4 pips, 14s sequential cycle), Guard Durability (100), Support/Storm Gauge, and the
 * Guard Break Counter max-chakra penalty timer.
 */
import {
  CHAKRA_MAX,
  GUARD_COUNTER_MAX_CHAKRA_PENALTY,
  GUARD_COUNTER_PENALTY_SECONDS,
  GUARD_HEALTH_MAX,
  HEALTH_MAX,
  SUB_RECHARGE_SECONDS,
  SUB_STOCK_MAX,
  SUPPORT_GAUGE_RECHARGE_SECONDS,
  clamp,
} from '../core/Types';

export class CombatStats {
  health: number;
  readonly healthMax: number;

  chakra = CHAKRA_MAX;
  /** Current cap; reduced by 20 while the Guard Break Counter penalty is active. */
  chakraMax = CHAKRA_MAX;
  private chakraPenaltyTimer = 0;
  /** Passive chakra regen per second (percent). */
  chakraRegenPerSecond = 3.0;

  subStocks = SUB_STOCK_MAX;
  /** Seconds accumulated toward the next stock (sequential recharge). */
  subRechargeProgress = 0;
  /** Multiplier applied to sub recharge; bumps up briefly after taking unblocked damage. */
  private subRechargeBoost = 1.0;
  private subBoostTimer = 0;

  guardHealth = GUARD_HEALTH_MAX;
  guardRegenPerSecond = 7.0;
  /** Guard cannot regen for a moment after absorbing a hit. */
  private guardRegenLockout = 0;

  /** 0..100, fills over ~8 s. Leader switch costs 50. */
  supportGauge = 0;

  /** Frames of hit scaling applied to subsequent hits in a combo. Reset on Spark Dash. */
  comboHits = 0;
  comboDamage = 0;
  comboTimer = 0;

  constructor(healthMax: number = HEALTH_MAX) {
    this.healthMax = healthMax;
    this.health = healthMax;
  }

  get isDead(): boolean {
    return this.health <= 0;
  }

  /** Current hit-scaling multiplier: each combo hit reduces subsequent damage by 7%, floor 0.35. */
  get hitScale(): number {
    return Math.max(0.35, 1 - this.comboHits * 0.07);
  }

  // ---------------------------------------------------------------------- tick
  tick(dt: number): void {
    // Chakra penalty timer
    if (this.chakraPenaltyTimer > 0) {
      this.chakraPenaltyTimer -= dt;
      if (this.chakraPenaltyTimer <= 0) {
        this.chakraPenaltyTimer = 0;
        this.chakraMax = CHAKRA_MAX;
      }
    }
    // Passive chakra regeneration
    this.chakra = clamp(this.chakra + this.chakraRegenPerSecond * dt, 0, this.chakraMax);

    // Substitution recharge (sequential, one stock at a time)
    if (this.subBoostTimer > 0) {
      this.subBoostTimer -= dt;
      if (this.subBoostTimer <= 0) this.subRechargeBoost = 1.0;
    }
    if (this.subStocks < SUB_STOCK_MAX) {
      this.subRechargeProgress += dt * this.subRechargeBoost;
      while (this.subRechargeProgress >= SUB_RECHARGE_SECONDS && this.subStocks < SUB_STOCK_MAX) {
        this.subRechargeProgress -= SUB_RECHARGE_SECONDS;
        this.subStocks++;
      }
      if (this.subStocks >= SUB_STOCK_MAX) this.subRechargeProgress = 0;
    }

    // Guard durability regen
    if (this.guardRegenLockout > 0) this.guardRegenLockout -= dt;
    else this.guardHealth = clamp(this.guardHealth + this.guardRegenPerSecond * dt, 0, GUARD_HEALTH_MAX);

    // Support gauge
    this.supportGauge = clamp(this.supportGauge + (100 / SUPPORT_GAUGE_RECHARGE_SECONDS) * dt, 0, 100);

    // Combo bookkeeping
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.resetCombo();
    }
  }

  // ------------------------------------------------------------------- chakra
  canSpendChakra(percent: number): boolean {
    return this.chakra >= percent;
  }

  spendChakra(percent: number): boolean {
    if (this.chakra < percent) return false;
    this.chakra -= percent;
    return true;
  }

  gainChakra(percent: number): void {
    this.chakra = clamp(this.chakra + percent, 0, this.chakraMax);
  }

  /** Guard Break Counter: needs 20% of *max* pool available; permanently (for a timer) reduces the cap. */
  canGuardCounter(): boolean {
    return this.chakraMax >= GUARD_COUNTER_MAX_CHAKRA_PENALTY + 20;
  }

  applyGuardCounterPenalty(): void {
    this.chakraMax = Math.max(20, this.chakraMax - GUARD_COUNTER_MAX_CHAKRA_PENALTY);
    this.chakra = Math.min(this.chakra, this.chakraMax);
    this.chakraPenaltyTimer = GUARD_COUNTER_PENALTY_SECONDS;
  }

  get penaltyActive(): boolean {
    return this.chakraPenaltyTimer > 0;
  }

  // ----------------------------------------------------------------- health
  applyDamage(raw: number, options: { scaled?: boolean; unblocked?: boolean } = {}): number {
    const scaled = options.scaled !== false;
    const dmg = Math.round(scaled ? raw * this.hitScale : raw);
    this.health = Math.max(0, this.health - dmg);
    if (scaled) {
      this.comboHits++;
      this.comboDamage += dmg;
      this.comboTimer = 1.2;
    }
    if (options.unblocked !== false) {
      // Sustaining unblocked damage marginally accelerates sub recovery.
      this.subRechargeBoost = 1.35;
      this.subBoostTimer = 2.0;
    }
    return dmg;
  }

  resetCombo(): void {
    this.comboHits = 0;
    this.comboDamage = 0;
    this.comboTimer = 0;
  }

  // ------------------------------------------------------------------- guard
  applyGuardDamage(amount: number): boolean {
    this.guardHealth = Math.max(0, this.guardHealth - amount);
    this.guardRegenLockout = 0.8;
    return this.guardHealth <= 0;
  }

  /** Blue -> Yellow -> Red as durability falls. */
  get guardColor(): number {
    const t = this.guardHealth / GUARD_HEALTH_MAX;
    if (t > 0.6) return 0x3fa9ff;
    if (t > 0.3) return 0xffd23f;
    return 0xff3f3f;
  }

  restoreGuard(): void {
    this.guardHealth = GUARD_HEALTH_MAX;
  }

  // ------------------------------------------------------------------- subs
  canSubstitute(): boolean {
    return this.subStocks >= 1;
  }

  consumeSub(): boolean {
    if (this.subStocks < 1) return false;
    this.subStocks--;
    return true;
  }

  // ---------------------------------------------------------------- support
  canLeaderSwitch(cost: number): boolean {
    return this.supportGauge >= cost;
  }

  spendSupport(cost: number): boolean {
    if (this.supportGauge < cost) return false;
    this.supportGauge -= cost;
    return true;
  }
}
