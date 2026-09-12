"""One-shot doc update for session 4 (reverse engineering + overhaul). Safe to re-run: idempotent."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'CONTINUER.md'); s = open(p, encoding='utf-8').read()
rows = {
"| Combat |": "| Combat | 60 Hz deterministic FSM mapped onto the prototype's own state vocabulary (`src/combat/StormStates.ts`: every state → PL_ACT/PL_ANM name + CC2 clip candidates). Idle/run/ninja move/hollow step, chakra dashes (standard/charged/spark/turbo), 4-hit string + up/down branches, jutsu, guard + guard break + counter, 4-stock substitution (warps above an airborne enemy), hitstun/launch/tumble/crumple/knockdown, wall splat, leader switch, **hitstop** (3/6/10 f), **chakra charge** (Triangle / N), **shuriken projectiles** (Square / H, guardable, parryable, dash-piercing), **support system** (manual R1 / Y call = combo join; automatic Cover Fire (Balance), Dash Cut + Charge Guard (Guard), Strike Back (Attack)), directional damage clips (dmf/dmb/dml/dmr). Balance keys from the XEX (`BALANCE` in StormStates) |",
"| Camera |": "| Camera | Dual-target midpoint orbital camera; constants nudged to the prototype's framing (closer/lower at neutral: D_MIN 5.2, H_MIN 1.45, fov 43–58) |",
"| Rendering |": "| Rendering | Cel shader samples the game's own `celshade.tex` ramp (row 8, 3 bands: `public/assets/ui/celshade_ramp.png`) + hard specular + fresnel rim, inverted-hull outlines; stages: alpha test / blend / additive / multiply sheets, unlit sky. Blender cel study: `tools/scripts/blender_toon.py` → `docs/render/2nrt_toon.png` + `.blend` (\"CC2 Toon\" node group, Solidify inverted hull) |",
"| Characters |": "| Characters | `public/assets/2nrt.glb` (Naruto, 50 clips) and `2ssk.glb` (Sasuke, 57 clips) from Storm 4 xfbin data, Storm 2 versions as `*_s2.glb`. **Common bank** `cmn_anims.glb` (70 clips from Storm 4 `1cmnbod1`: damage, stagger, knockdown, wall, dodge, guard-break…) retargeted onto each rig at load |",
"| Stages |": "| Stages | `stage_sd03a.glb` Hidden Leaf Forest (default), `stage_sd05a.glb` Forest of Quiet Movement, `stage_sd01d.glb` Forest of Death. F5 cycles, `?stage=` overrides. Floor height found by raycast at the origin |",
"| HUD |": "| HUD | Storm 2 duel layout: portrait medallions (`ui/player_2nrt.png`, `player_2ssk.png`), name + current PL_ACT, life/chakra bars, support medallion (R1 / AI) with type + gauge, sub pips, guard bar, combo counter; brush timer digits, Go!/Time Up/Won plates |",
"| Input |": "| Input | Keyboard + polled gamepad. Authentic Storm pad layout: Circle attack, Cross jump, Triangle alone = chakra charge, Triangle+Cross = chakra dash, Triangle+Circle = jutsu, R2 dash, Square throw, L2 guard/sub, L1/R1 support, R3 switch. Keyboard extras: H throw, N charge, Y support |",
"| AI |": "| AI | P2 dummy cycles block / dash / combo / approach; throws shuriken at range, calls its support, subs and parries sometimes; F4 freezes it |",
}
lines = s.split('\n')
for i, l in enumerate(lines):
    for k, v in rows.items():
        if l.startswith(k): lines[i] = v
s = '\n'.join(lines)
old_gap = "- Support \"Cover Fire / Dash Cut / Strike Back\" interventions from the blueprint are not implemented (the prototype's debug select confirms the three support types: Attack = combo join + strike back, Guard = dash cut + charge guard, Balance = cover fire).\n"
new_gap = "- Support interventions are heuristic (distance / velocity triggers), not the prototype's exact trigger windows; `prm` frame-data tables are still locked in the wrapped disc files.\n- The three NUCC blobs found in the memory dump are not identified yet.\n"
s = s.replace(old_gap, new_gap)
decisions = """- **Reverse engineering went through memory, not the file wrapper**: the prototype's disc files stay encrypted, but the decrypted `default.xex` is resident in Xenia's guest RAM. `C:\\Users\\ysoyo\\storm2proto\\memdump.py` dumps guest 0x82000000+, `xex_report.py` extracts the strings (`docs/proto/xex_vocabulary.md`): the full PL_ACT_*/PL_ANM_* state list, the battle-balance parameter names (GUARD_POW_MAX, HITSTOP_*, CHAKRA_RECOVER_AT_CHARGE, SUPPORT_GAUGE_USE_*, PRJ_*, …), the Lua `cc*` API and the hit-sphere names. The engine's FSM was then re-mapped onto that vocabulary (`StormStates.ts`) instead of guessing.
- **Common animation bank**: damage/stagger/knockdown/wall/dodge clips live in Storm 4's `1cmnbod1` bank, not in the character files. `export_cmn_anims.py` exports them once; `FighterRig.loadCommonBank()` retargets track names `1cmn00t0…` → `<code>00t0…` at runtime and drops missing-bone / root position tracks.
- **Cel ramp comes from the game**: `system/celshade.tex` is a 64×64 atlas of lighting ramps; row 8 is the 3-band ramp. The engine samples it as `uRamp` instead of hard-coded thresholds, and the Blender toon group samples the same PNG (note Blender's V axis is bottom-up: row 8 from the top is V = 55.5/64).
- **Background watchdog**: browsers stop requestAnimationFrame for hidden tabs (the Claude Browser pane is hidden most of the time), which froze the sim. A 60 Hz timer steps the simulation whenever no frame was drawn for 120 ms; rendering still only happens in rAF.
- **Stage floor by raycast**: sd01d has no mesh literally named "floor" and its lowest point is a river bed 39 m down; taking the scene's min.y lifted the whole stage. The loader now raycasts down at the origin against meshes whose mesh/material/texture name matches `flo`, falling back to y = 0.
"""
if "Reverse engineering went through memory" not in s:
    s = s.replace("- **Resources are shared per team**", decisions + "- **Resources are shared per team**")
milestones = """### 2026-09-12 — Session 4: reverse engineering + overhaul
16. Memory-dumped the running prototype's decrypted XEX from Xenia (`memdump.py`), extracted the engine vocabulary (`docs/proto/xex_vocabulary.md`): 300+ PL_ACT/PL_ANM states, balance keys, Lua API, hit spheres, celshade atlas.
17. Combat overhaul on that vocabulary: `StormStates.ts` state→clip bindings, hitstop, chakra charge, shuriken projectiles, support system (manual call + three automatic intervention types), directional damage clips, clip chains, substitution warp-above.
18. Storm 4 common animation bank (`1cmnbod1`, 70 clips) exported and retargeted at runtime: real stagger / knockdown / wall / dodge / guard-break animations on both fighters.
19. Camera re-tuned to the prototype's framing; celshade ramp texture drives the cel shader; unlit sky; third stage `sd01d` Forest of Death + F5 stage cycling; Storm 2 duel HUD with portraits, current-act label, support medallion/gauge, combo counter.
20. Authentic Storm pad layout (Triangle = chakra button) + keyboard H/N/Y; AI throws and calls support.
21. Blender cel-shading study: `blender_toon.py` builds a "CC2 Toon" node group (Shader-to-RGB → celshade ramp × albedo, fresnel rim, stepped specular) and a Solidify inverted-hull ink outline; render + .blend in `docs/render/`.
22. Soak test (25 s random input vs AI, 2,000+ ticks): no exceptions, 16 states exercised incl. THROW / CHAKRA_CHARGE / SUPPORT; fixed the hidden-tab sim freeze (background watchdog) and the sd01d floor offset (raycast floor).

"""
if "Session 4: reverse engineering" not in s:
    s = s.replace("---\n\n## 5. How this file updates itself", milestones + "---\n\n## 5. How this file updates itself")
open(p, 'w', encoding='utf-8').write(s)

p = os.path.join(root, 'README.md'); r = open(p, encoding='utf-8').read()
r = r.replace("| K | Triangle / Y (or R2) | **Chakra Dash** 15%. Hold = **Charged** 25%. Mid-string = **Spark Dash** 20%. Attack then dash within 4 frames = **Turbo Dash** |",
"| K | Triangle + Cross (or R2) | **Chakra Dash** 15%. Hold = **Charged** 25%. Mid-string = **Spark Dash** 20%. Attack then dash within 4 frames = **Turbo Dash** |\n| N | Triangle (alone) | **Chakra Charge** (45 %/s, cancels into dash / jutsu / attack) |\n| H | Square / X | **Shuriken** throw (3% chakra, guardable, parryable, dashes pierce it) |\n| Y | L1 / R1 | **Support call** (50% support gauge): the bench fighter runs in for a combo join. Automatic interventions: Balance = Cover Fire, Guard = Dash Cut / Charge Guard, Attack = Strike Back |")
r = r.replace("| U | Square / X | Jutsu: Rasengan / Chidori (30% chakra, armored, real `skl1` clips) |", "| U | Triangle + Circle | Jutsu: Rasengan / Chidori (30% chakra, armored, real `skl1` clips) |")
r = r.replace("| O | R1 / R3 | **Leader Switch**", "| O | R3 | **Leader Switch**")
r = r.replace("| F3 / F4 | | Hitbox visualiser / freeze the AI (training dummy) |", "| F3 / F4 / F5 | | Hitbox visualiser / freeze the AI (training dummy) / next stage |")
section = """## Reverse-engineered vocabulary (Storm 2 prototype)

`docs/proto/xex_vocabulary.md` lists what the decrypted executable (memory-dumped from Xenia)
exposes: PL_ACT / PL_ANM state names, battle-balance keys, the Lua `cc*` API and hit-sphere names.
`src/combat/StormStates.ts` maps every engine state to those names and to CC2 clip codes, and
`BALANCE` carries the balance constants the engine uses.

## Blender cel shading

```bash
"/c/Program Files/Blender Foundation/Blender 4.5/blender.exe" -b --python tools/scripts/blender_toon.py -- 2nrt docs/render/2nrt_toon.png docs/render/2nrt_toon.blend raw/s4/2nrtbod1.xfbin raw/s4/2nrtbod1c.xfbin raw/s4/2nrtbod1l.xfbin
```

Builds the "CC2 Toon" node group (diffuse → Shader to RGB → `celshade_ramp.png` row 8 × albedo,
fresnel rim, stepped specular) and a Solidify inverted-hull outline, renders with EEVEE and saves
the .blend for hand tuning.

## Deviations from the blueprint"""
if "## Blender cel shading" not in r:
    r = r.replace("## Deviations from the blueprint", section)
open(p, 'w', encoding='utf-8').write(r)
print("docs updated")
