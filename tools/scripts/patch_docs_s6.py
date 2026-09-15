"""Session 6 doc update: mechanics, audio, VFX, stages, camera, terrain."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'CONTINUER.md'); s = open(p, encoding='utf-8').read()
rows = {
"| Combat |": "| Combat | 60 Hz FSM on the prototype's PL_ACT vocabulary (`StormStates.ts`). Movement: run, ninja move, hollow step, **double jump**, **air ninja move** (sideways burst), chakra dashes (standard/charged/spark/turbo), terrain following. Offense: 4-hit string + up/down branches, **air string** (cmr clips, spike finisher), jutsu (skl1), **ultimate jutsu** (SPSKILL: needs ≥90 chakra, ○+△ or M — cut-in, armored homing rush, 380 dmg finisher with hitstop/flash, real `spl1_s` clips), shuriken, throws. Defense: guard/guard break/counter, substitution (warp above when airborne), hitstop. **Awakening** (hold chakra button at ≤50% HP: 20 s, ×1.3 damage, ×1.15 speed, chakra drain, rim-light aura). Supports: manual jutsu assist + Balance/Guard/Attack interventions. **Round intro** plays each fighter's `ent0` entry clip |",
"| Camera |": "| Camera | Storm behind-the-shoulder camera (`DualTargetCamera`): sits behind and to the right of the player, pulls back and rises with distance, looks at a point weighted toward the enemy; fov 44–60; side hysteresis + shake kept |",
"| Stages |": "| Stages | 9 Storm 2 stages: Hidden Leaf Forest sd03a, Forest of Quiet Movement sd05a, Forest of Death sd01d, Orochimaru's Hideout sd07a, Hidden Sand Gate sd08a, Five-Seal Barrier Cliff sd06a, Mount Myoboku sd11a, The Final Valley sd05b, Hidden Rain Village sd10a (names from `tools/Stage_IDs.pdf`). Fighters follow the floor mesh (`ArenaEnvironment.groundY`, cached raycast grid). Exporter downsizes textures to 1024 px to stay under GitHub's 100 MB file limit |",
"| Rendering |": "| Rendering | Cel shader on the game's celshade ramp (row 44, flipY off), inverted-hull outlines, render interpolation, per-frame animation. **Sprite VFX** from Kenney's CC0 particle pack (`public/assets/vfx`): hit flashes/sparks, guard rings, smoke, dust, jutsu glows, clash bursts, dash trails. DOM overlays: VS splash, ultimate cut-in, awakening banner, screen flash |",
"| Audio |": None,
}
lines = s.split('\n')
for i, l in enumerate(lines):
    for k, v in rows.items():
        if v and l.startswith(k): lines[i] = v
s = '\n'.join(lines)
if '| Audio |' not in s:
    s = s.replace("| Input |", "| Audio | Storm 2's own sound effects (`public/assets/sfx`, 53 cues decoded from `battle.xfbin` / `commse0.xfbin` nus3banks with vgmstream): hits by weight, sword, guard, dash, jumps, landing, jutsu per character, shuriken, charge, substitution, KO, battle start, awakening, cut-in, menu cursor/confirm/cancel. `AudioManager` (Web Audio, unlocked on first input). No BGM yet (Storm 2 bgm.awb is a 2 KB stub) |\n| Input |", 1)
decisions = """- **Storm 2 audio is nus3bank inside xfbin**: find the `NUS3` magic, slice to the end, and vgmstream (`C:\\Users\\ysoyo\\storm2proto\\tools\\vgmstream`) lists/extracts named streams (`-S 0 -o "se/?n.wav"`). Voice banks (`US/<code>1E.xfbin`) only hold two lines each.
- **Ultimate clips live in `spl1.xfbin`**; the exporter's clip whitelist needed `spl1_(s|l|e|atk)`. The rest of the container is cutscene camera/effect rigs that are dropped.
- **Root scale tracks** on `trall`/`00t0` are stripped like the position tracks: they made Minato pop in size between clips.
- **Combo clip switching**: the rig re-picks a clip when the state key changes, and that key now includes the move clip, jump count, air-dash flag, hit direction and fall flag (strings previously played only their first clip).
- **Key taps are latched** in `KeyboardInputSource` so a press shorter than one sim step still registers (the hidden Browser pane steps the sim in bursts).
- **Blender pose retargeting between characters does not work** with the add-on's baked rest-pose rotations; engine captures replace it.
"""
if "Storm 2 audio is nus3bank" not in s:
    s = s.replace("- **Resources are shared per team**", decisions + "- **Resources are shared per team**")
milestones = """### 2026-09-15 — Session 6: mechanics, audio, VFX, stages
28. Fixed the Minato size pop (root scale keys), combo clips not switching mid-string, dropped short taps; fighters now follow the stage floor (raycast height grid) and the camera is the Storm behind-the-shoulder view.
29. New mechanics: double jump, air ninja move, air strings with spike finisher, ultimate jutsu with cut-in and real `spl1` clips, awakening, round-intro entry clips; AI uses all of them.
30. Audio: Storm 2 SFX decoded with vgmstream and wired to hits, guard, dashes, jumps, jutsu, ultimates, KO, menus. VFX: Kenney CC0 particle sprites layered on every effect cue; DOM cut-in, flash and awakening banner.
31. Six more Storm 2 stages exported (Orochimaru's Hideout, Hidden Sand Gate, Five-Seal Barrier Cliff, Mount Myoboku, The Final Valley, Hidden Rain Village) with texture downsizing.

"""
if "Session 6: mechanics" not in s:
    s = s.replace("---\n\n## 5. How this file updates itself", milestones + "---\n\n## 5. How this file updates itself")
open(p, 'w', encoding='utf-8').write(s)

p = os.path.join(root, 'README.md'); r = open(p, encoding='utf-8').read()
r = r.replace("| N | Triangle (alone) | **Chakra Charge** (45 %/s, cancels into dash / jutsu / attack) |",
"| N | Triangle (alone) | **Chakra Charge** (45 %/s, cancels into dash / jutsu / attack). Hold it at ≤50% health to **Awaken** (20 s, +30% damage, aura) |\n| M, or U with ≥90% chakra | Triangle + Circle with a full gauge | **Ultimate Jutsu**: cut-in, armored homing rush, big finisher (empties the gauge) |\n| Space in the air | Cross in the air | **Double jump**; with a direction = **air ninja move** |\n| J in the air | Circle in the air | **Air string** (3 hits, the last spikes the enemy down) |")
if "## Audio and VFX" not in r:
    r = r.replace("## Deviations from the blueprint", """## Audio and VFX

Sound effects are Storm 2's own, decoded from the game's nus3bank files with vgmstream
(`public/assets/sfx`, see CONTINUER §3). Particle sprites are Kenney's CC0 particle pack
(`public/assets/vfx`). There is no music yet.

## Deviations from the blueprint""")
open(p, 'w', encoding='utf-8').write(r)
print('docs updated')
