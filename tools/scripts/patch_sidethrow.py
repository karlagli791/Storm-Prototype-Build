"""Session 8: shuriken thrown out of a side ninja move plays the game's PRJ_DL / PRJ_DR clips
(itl0 / itr0, the prototype's PL_ANM_PRJ_DL/DR bindings) instead of the neutral air throw."""
import os, re
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def rw(rel, fn, marker=None):
    p = os.path.join(root, rel); s = open(p, encoding='utf-8').read()
    if marker and marker in s: print('already', rel); return
    s2 = fn(s); assert s2 != s, rel
    open(p, 'w', encoding='utf-8').write(s2); print('patched', rel)
def rep(s, old, new, count=1):
    assert old in s, old[:100]; return s.replace(old, new, count)

rw('src/combat/Fighter.ts', lambda s: rep(s, "  throwRequested = false;", "  throwRequested = false;\n  /** Side of a throw started out of a ninja move (PRJ_DL / PRJ_DR clips); null = neutral throw. */\n  throwDir: HitDir | null = null;"), 'throwDir')

def fsm(s):
    s = rep(s, """    if (buf.consume(InputFlag.THROW) && f.stateFrame > 2) {
      // Shuriken cancels the side step (momentum kept, the throw clip takes over).
      f.enterState(CombatState.THROW);
      return;
    }""", """    if (buf.consume(InputFlag.THROW) && f.stateFrame > 2) {
      // Shuriken cancels the side step (momentum kept, the throw clip takes over). The clip is the
      // directional one (itl0 / itr0) chosen from which way the hop is travelling around the target.
      this.dirToTarget(f, this.tmpA);
      const right = f.velocity.x * this.tmpA.z - f.velocity.z * this.tmpA.x;
      f.enterState(CombatState.THROW);
      f.throwDir = Math.hypot(f.velocity.x, f.velocity.z) > 1 ? (right >= 0 ? 'L' : 'R') : null;
      return;
    }""")
    # every other THROW entry is a neutral throw
    s = re.sub(r"(\n(\s+))f\.enterState\(CombatState\.THROW\);(?!\n\2f\.throwDir)", lambda m: f"{m.group(1)}f.enterState(CombatState.THROW);{m.group(1)}f.throwDir = null;", s)
    return s
rw('src/combat/CombatStateMachine.ts', fsm, 'f.throwDir')

rw('src/combat/PlayerController.ts', lambda s: rep(s, "        hitDir: f.lastHitDir,", "        hitDir: f.lastHitDir,\n        throwDir: f.throwDir,"), 'throwDir')

def states(s):
    s = rep(s, "  airDash?: boolean;\n", "  airDash?: boolean;\n  /** Side throw out of a ninja move: 'L' | 'R' picks the PRJ_DL / PRJ_DR clip. */\n  throwDir?: HitDir | null;\n")
    s = rep(s, """    case CombatState.THROW:
      return ctx.airborne
        ? { act: 'PL_ACT_PRJ_AIR', anm: 'PL_ANM_PRJ_AIR', clips: [O('{c}itma0', '{c}jmp1'), O('{c}itmg0', '{c}jmp1'), L('{c}jmp1')] }""",
"""    case CombatState.THROW:
      if (ctx.throwDir === 'L' || ctx.throwDir === 'R')
        return { act: 'PL_ACT_PRJ_D' + ctx.throwDir, anm: 'PL_ANM_PRJ_D' + ctx.throwDir, clips: [O(ctx.throwDir === 'L' ? '{c}itl0' : '{c}itr0', '{c}jmp1'), O('{c}itma0', '{c}jmp1'), O('{c}itmg0', '{c}jmp1'), L('{c}jmp1')] };
      return ctx.airborne
        ? { act: 'PL_ACT_PRJ_AIR', anm: 'PL_ANM_PRJ_AIR', clips: [O('{c}itma0', '{c}jmp1'), O('{c}itmg0', '{c}jmp1'), L('{c}jmp1')] }""")
    return s
rw('src/combat/StormStates.ts', states, 'throwDir')

rw('src/render/FighterRig.ts', lambda s: rep(s, "${ctx.hitDir}|${ctx.falling ? 1 : 0}`;", "${ctx.hitDir}|${ctx.falling ? 1 : 0}|${ctx.throwDir ?? ''}`;"), 'ctx.throwDir')
print('ok')
