/**
 * StormStates.ts — The engine's states mapped onto the vocabulary mined from the Storm 2 prototype
 * executable (see docs/proto/xex_vocabulary.md): PL_ACT_* player actions, PL_ANM_* animation
 * slots, CC2 clip codes, and the ccBattleAdjustParam balance keys.
 *
 * Clip code conventions ({c} = character code such as 2nrt, 1cmn = shared animation bank):
 *   nut0 idle, nxi0/rxn0/ixn0 idle variants, run1 run, jmp0/jmp1 jump, lan0 land,
 *   dsf0/dsb0/dsl0/dsr0 dash-steps (PL_ANM_DSH_FWD/BK/L/R = Ninja Move),
 *   dsh0s chakra dash begin, dsh1l chakra dash loop, grd0 guard pose, ghf0/ghl0/ghr0 guard hits,
 *   gda0 guard damage, cmaNN / cmbNN combo strings, sklN_s/l/n skill start/loop/no-direction,
 *   common bank: dmg0/dmf0/dmb0/dml0/dmr0 damage (front/back/left/right), sta0-2 stagger,
 *   kno0 knockback, dmr0 rise, sdg0-2 side/smash damage, fal0/fal1 fall, dwn0/dwn1 down loop,
 *   dxn0/dxn1 down-to-neutral (DWN2NUT / _ROLL), gbr0 guard break, piy0-2 dizzy (PIYORI),
 *   wall wall splat (DMG_CLASH_WALL), col0-4 collision/clash, ddg0 dodge (substitution warp).
 */
import { CombatState, HitDir } from '../core/Types';

export interface ClipSpec {
  /** Clip code; `{c}` is replaced by the character code, `1cmn` names the shared bank. */
  clip: string;
  loop?: boolean;
  /** Clip to chain into when a one-shot clip finishes (e.g. skill start → loop). */
  next?: string;
}

export interface StateBinding {
  /** Engine-internal PL_ACT_* name (documentation / debug HUD). */
  act: string;
  anm: string;
  clips: ClipSpec[];
}

export interface ClipContext {
  moveClip: string | null;
  moveDir: HitDir;
  hitDir: HitDir;
  airborne: boolean;
  airDash?: boolean;
  /** Side throw out of a ninja move: 'L' | 'R' picks the PRJ_DL / PRJ_DR clip. */
  throwDir?: HitDir | null;
  awakened?: boolean;
  falling: boolean;
  stateFrame: number;
  /** Frames left in the state, when known (knockdown getup timing). */
  framesLeft: number;
}

const L = (clip: string): ClipSpec => ({ clip, loop: true });
const O = (clip: string, next?: string): ClipSpec => ({ clip, loop: false, next });

/** Directional clip helper: dash-steps and directional damage. */
function dirClip(prefix: string, dir: HitDir, map: Record<HitDir, string>): string {
  return prefix + map[dir];
}

export function bindingFor(state: CombatState, ctx: ClipContext): StateBinding {
  switch (state) {
    case CombatState.IDLE_NEUTRAL:
      return { act: 'PL_ACT_NUT', anm: 'PL_ANM_NUT', clips: [L('{c}nut0'), L('{c}nxi0'), L('1cmnnut0')] };
    case CombatState.RUNNING:
      return { act: 'PL_ACT_RUN', anm: 'PL_ANM_RUN1', clips: [L('{c}run1')] };
    case CombatState.NINJA_MOVE:
    case CombatState.HOLLOW_STEP:
      return {
        act: ctx.moveDir === 'F' ? 'PL_ACT_NMOVE_FWD' : ctx.moveDir === 'B' ? 'PL_ACT_NMOVE_BACK' : 'PL_ACT_NMOVE_SIDE',
        anm: 'PL_ANM_DSH_' + ctx.moveDir,
        clips: [O(dirClip('{c}', ctx.moveDir, { F: 'dsf0', B: 'dsb0', L: 'dsl0', R: 'dsr0' })), L('{c}jmp0')],
      };
    case CombatState.JUMPING:
      if (ctx.airDash)
        return { act: 'PL_ACT_NMOVE_SIDE', anm: 'PL_ANM_DSH_' + ctx.moveDir, clips: [O(dirClip('{c}', ctx.moveDir, { F: 'dsf0', B: 'dsb0', L: 'dsl0', R: 'dsr0' }), '{c}jmp1'), L('{c}jmp1')] };
      // jmp0 = take-off (one shot) → jmp1 = airborne loop. The common bank's fal0/fal1 are
      // *damage* falls (arms flailing) and are only used by LAUNCHED.
      return ctx.falling
        ? { act: 'PL_ACT_FALL', anm: 'PL_ANM_FALL0', clips: [L('{c}jmp1'), L('{c}jmp0'), L('{c}nut0')] }
        : { act: 'PL_ACT_JMP_V', anm: 'PL_ANM_JMP0', clips: [O('{c}jmp0', '{c}jmp1'), L('{c}jmp1')] };
    case CombatState.DASH_STARTUP:
    case CombatState.DASH_CHARGING:
      return { act: 'PL_ACT_NINJA_DASH', anm: 'PL_ANM_CHADASH_BEGIN', clips: [O('{c}dsh0s', '{c}dsh1l'), L('{c}dsf0')] };
    case CombatState.DASH_HOMING:
    case CombatState.SPARK_DASH:
      return { act: 'PL_ACT_CHAKRA_DASH', anm: 'PL_ANM_CHADASH_LOOP', clips: [L('{c}dsh1l'), L('1cmndsh0l'), L('{c}dsf0')] };
    case CombatState.DASH_IMPACT:
      return { act: 'PL_ACT_CHAKRA_DASH_END_HIT', anm: 'PL_ANM_LAN', clips: [O('{c}dsh0l'), O('{c}lan0')] };
    case CombatState.DASH_REBOUND:
      return { act: 'PL_ACT_CHAKRA_DASH_END_GUARDED', anm: 'PL_ANM_DMG_STAGGER_BACK', clips: [O('1cmnkno0'), O('1cmnsta1'), O('{c}ghf0')] };
    case CombatState.DASH_CLASH:
      return { act: 'PL_ACT_OFFSET_KNOCKBACK', anm: 'PL_ANM_DMG_STAGGER_BACK', clips: [O('1cmncol0'), O('1cmnkno0')] };
    case CombatState.COMBO_STRING:
      return { act: 'PL_ACT_ATK', anm: 'PL_ANM_CMB', clips: ctx.moveClip ? [O(ctx.moveClip), O('{c}cma00')] : [O('{c}cma00')] };
    case CombatState.JUTSU:
      return {
        act: 'PL_ACT_SKILL',
        anm: 'PL_ANM_SKILL_1_START',
        clips: ctx.moveClip ? [O(ctx.moveClip, ctx.moveClip.replace(/_s(\d?)$/, '_l$1')), O('{c}skl1_s1', '{c}skl1_l1'), O('{c}skl1_s', '{c}sklchg_l')] : [O('{c}skl1_s1', '{c}skl1_l1')],
      };
    case CombatState.THROW:
      if (ctx.throwDir === 'L' || ctx.throwDir === 'R')
        return { act: 'PL_ACT_PRJ_D' + ctx.throwDir, anm: 'PL_ANM_PRJ_D' + ctx.throwDir, clips: [O(ctx.throwDir === 'L' ? '{c}itl0' : '{c}itr0', '{c}jmp1'), O('{c}itma0', '{c}jmp1'), O('{c}itmg0', '{c}jmp1'), L('{c}jmp1')] };
      return ctx.airborne
        ? { act: 'PL_ACT_PRJ_AIR', anm: 'PL_ANM_PRJ_AIR', clips: [O('{c}itma0', '{c}jmp1'), O('{c}itmg0', '{c}jmp1'), L('{c}jmp1')] }
        : { act: 'PL_ACT_PRJ_LAND', anm: 'PL_ANM_PRJ_LAND', clips: [O('{c}itmg0', '{c}nut0'), O('{c}cmr00', '{c}nut0'), O('{c}nut0')] };
    case CombatState.CHAKRA_CHARGE:
      return { act: 'PL_ACT_CHAKRA_CHARGE', anm: 'PL_ANM_SKILL_CHARGE_LOOP', clips: [O('{c}sklchg_s', '{c}sklchg_l'), L('{c}sklchg_l'), L('{c}hola0'), L('{c}nut0')] };
    case CombatState.GUARDING:
      return { act: 'PL_ACT_GUARD', anm: 'PL_ANM_GUARDPOSE_0', clips: [L('{c}grd0')] };
    case CombatState.GUARD_COUNTER:
      return { act: 'PL_ACT_GUARD', anm: 'PL_ANM_GUARDHIT_A0', clips: [O('{c}gda0'), O('{c}ght1'), L('{c}grd0')] };
    case CombatState.BLOCKSTUN:
      return {
        act: 'PL_ACT_GUARDHIT',
        anm: 'PL_ANM_GUARDHIT_' + ctx.hitDir + '0',
        clips: [O(dirClip('{c}', ctx.hitDir, { F: 'ghf0', B: 'ghf0', L: 'ghl0', R: 'ghr0' })), O('{c}ghf0'), L('{c}grd0')],
      };
    case CombatState.GUARD_BREAK:
      return { act: 'PL_ACT_DMG_GUARDBREAK', anm: 'PL_ANM_DMG_GBR', clips: [O('1cmngbr0'), O('1cmnpiy0'), O('{c}gda0')] };
    case CombatState.HITSTUN:
      if (ctx.moveClip && /(skl1|spl1)_dmg/.test(ctx.moveClip))
        return { act: 'PL_ACT_DMG_DEMO', anm: 'PL_ANM_SKILL_1_DEMO_DMG1', clips: [O(ctx.moveClip), O('1cmndmg0'), O('{c}dmg0f')] };
      return {
        act: 'PL_ACT_DMG_NORMAL',
        anm: 'PL_ANM_DMG_CMN',
        clips: [O(dirClip('1cmn', ctx.hitDir, { F: 'dmf0', B: 'dmb0', L: 'dml0', R: 'dmr0' })), O('1cmndmg0'), O('1cmnsta0'), O('{c}dmg0f')],
      };
    case CombatState.LAUNCHED:
      return ctx.falling
        ? { act: 'PL_ACT_DMG_AIR_TO_FALL', anm: 'PL_ANM_DMG_AIR_L_TO_FALL', clips: [L('1cmnfal1'), L('1cmnfal0'), O('{c}dow0')] }
        : { act: 'PL_ACT_DMG_RISE', anm: 'PL_ANM_DMG_RISE', clips: [O('1cmndma0', '1cmnfal1'), O('1cmnsdg1', '1cmnfal1'), O('{c}dow0')] };
    case CombatState.TUMBLE:
      return { act: 'PL_ACT_DMG_SMASH_SIDE', anm: 'PL_ANM_DMG_SMASH_SIDE0', clips: [O('1cmnsdg0', '1cmnfal1'), O('1cmnkno0', '1cmnfal1'), O('{c}dow1')] };
    case CombatState.CRUMPLE:
      return { act: 'PL_ACT_DMG_NUMB', anm: 'PL_ANM_DMG_PIYORI', clips: [O('1cmnpiy0', '1cmnpiy1'), L('1cmnpiy1'), O('{c}dow0')] };
    case CombatState.KNOCKDOWN:
      return ctx.framesLeft <= 14
        ? { act: 'PL_ACT_DMG_DOWN2NUT', anm: 'PL_ANM_DWN2NUT', clips: [O('1cmndxn0'), O('1cmndxn1'), O('{c}nut0')] }
        : ctx.stateFrame < 12
          ? { act: 'PL_ACT_DMG_TO_DOWN', anm: 'PL_ANM_DMG_TO_DOWN_FAST', clips: [O('{c}dow0', '1cmndwn0'), O('1cmndwn1')] }
          : { act: 'PL_ACT_DMG_DOWN_LP', anm: 'PL_ANM_DWNLP', clips: [L('1cmndwn0'), L('{c}dow0')] };
    case CombatState.WALL_SPLAT:
      return { act: 'PL_ACT_DMG_CRASH_WALL', anm: 'PL_ANM_DMG_CLASH_WALL', clips: [O('1cmnwall'), O('1cmndmb0'), O('{c}dmg0f')] };
    case CombatState.SUBSTITUTED:
      return { act: 'PL_ACT_DODGE_WARP_ENEMY', anm: 'PL_ANM_NUT', clips: [O('1cmnddg0'), O('{c}lan0'), L('{c}nut0')] };
    case CombatState.SUPPORT_ACT:
      return { act: 'PL_ACT_SUP_COMBO_JOIN', anm: 'PL_ANM_S_ATK00', clips: ctx.moveClip ? [O(ctx.moveClip), O('{c}cma00')] : [O('{c}cma00')] };
    case CombatState.INTRO:
      return { act: 'PL_ACT_BTL_BEFORE_LEADER', anm: 'PL_ANM_ENT0', clips: [O('{c}ent0', '{c}nut0'), L('{c}nut0')] };
    case CombatState.ULTIMATE:
      return { act: 'PL_ACT_SPSKILL_DEMO_ATK', anm: 'PL_ANM_SPSKILL_1', clips: ctx.moveClip ? [O(ctx.moveClip), O('{c}skl1_s1', '{c}skl1_l1'), O('{c}skl1_s')] : [O('{c}skl1_s')] };
    case CombatState.AWAKEN:
      return { act: 'PL_ACT_AWAKE_BEGIN', anm: 'PL_ANM_AWAKE_S', clips: [O('{c}sklchg_s', '{c}sklchg_l'), L('{c}hola0'), L('{c}nut0')] };
    case CombatState.DEAD:
      return { act: 'PL_ACT_DEAD_DUEL', anm: 'PL_ANM_LOSE_L', clips: [O('{c}dow1', '1cmndwn0'), O('{c}dow0', '1cmndwn0'), L('1cmndwn0')] };
  }
  return { act: 'PL_ACT_NONE', anm: 'PL_ANM_NUT', clips: [L('{c}nut0')] };
}

/**
 * Battle balance values, named after the ccBattleAdjustParam keys found in the executable.
 * The prototype's table itself is encrypted, so the numbers are the blueprint's plus tuning
 * observed in the Xenia session; the names keep the mapping honest.
 */
export const BALANCE = {
  GUARD_POW_MAX: 100,
  GUARD_POW_MIN: 0,
  GUARD_POW_RECOVER_SPD: 7.0, // per second
  GUARDBREAK_AUTO_RECOVER_FRAME: 25,
  GUARDBREAK_RECOVER_SCORE: 45, // guard power restored after a break
  HITSTOP_NORMAL: 3, // frames both fighters freeze on a clean hit
  HITSTOP_HEAVY: 6,
  HITSTOP_GUARD_BREAK: 10,
  CHAKRA_RECOVER_AUTO: 3.0, // % per second
  CHAKRA_RECOVER_AT_CHARGE: 45.0, // % per second while charging
  CHAKRA_USE_AT_CHAKRA_DASH: 15,
  CHAKRA_USE_AT_CHAKRA_PROJ: 10, // chakra shuriken
  CHAKRA_USE_AT_DODGE: 0, // Storm 2 charged chakra for substitution; blueprint uses 4 stocks
  RATE_DAMAGE_LIFE_TO_CHAKRA: 0.02, // chakra gained per point of life lost
  MANY_DAMAGE_SAVING_RATE: 0.07, // combo damage scaling per hit
  COMBO_COUNTER_INTERVAL_MAX: 72, // frames before the combo counter drops
  DOWN_DAMAGE_COUNT_MAX: 2, // OTG hits allowed before forced getup
  SUPPORT_GAUGE_RECOVER_SPD: 100 / 8, // % per second
  SUP_GAUGE_RECOVER_RATE_ATTACKTYPE: 1.0,
  SUP_GAUGE_RECOVER_RATE_GUARDTYPE: 1.15,
  SUP_GAUGE_RECOVER_RATE_BALANCETYPE: 1.05,
  SUPPORT_GAUGE_USE_NORMAL: 50,
  SUPPORT_INJURED_WAIT_SEC: 6.0, // cooldown after a support gets hit / intervenes
  DAMAGERATE_SUPPORT_COMBO_JOIN: 0.8,
  DAMAGERATE_SUPPORT_COVERING_FIRE: 0.5,
  TEAM_POW_MAX_KEEP_FRAME: 180,
  PRJ_SPEED: 30.0, // shuriken m/s
  PRJ_DAMAGE: 18,
  PRJ_HITSTUN: 12,
} as const;
