"""Session 8 docs: combo tether, ninja-move hop, side throws, combo/dash/KO/jutsu cameras, BGM,
voices, weapon-bone hits, prototype container carve."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'CONTINUER.md'); s = open(p, encoding='utf-8').read()
rows = {
"| Combat |": "| Combat | 60 Hz FSM on the prototype's PL_ACT vocabulary. **Movesets come from the real Storm 4 parameter tables** (`src/combat/PrmData.ts`, generated from `raw/s4/prm/<code>prm.bin.xfbin` by `tools/scripts/prm_dump.py` + `gen_prm_ts.cjs`; hit records are found by their DAMAGE_ID so weapon-bone hits — Sasuke's `ksng_*`, Mifune's sword — count): ground string = ATK00-02 (+ first SMASH finisher, `cmb` clips), launchers (RISE, `cmb12/13`) = up string, tilts = down string, air string = ATK_AIR (`cma`). **Combo tether**: a landed string holds the victim in front of the attacker until the string ends (also in the air). Movement: run, **ninja move = real hop** (velocity.y 5, constant speed, landing recovery, no slide), double jump, air ninja move, chakra dashes, terrain following. Shuriken from the ground (`itmg0`), the air (`itma0`) and out of a side hop (`itl0`/`itr0`, cancels the hop). Jutsu: melee (palm) or projectile; **a connecting melee jutsu plays the game's `skl1_atk` demo with its exported camera** (Naruto, Kakashi, Minato, Mifune). **Ultimate**: cut-in → armored rush → `spl1_atk` demo with the exported camera, letterbox and VFX. Awakening, round intro, throws, guard/counter/substitution, hitstop, supports |",
"| Camera |": "| Camera | Storm behind-the-shoulder camera (BACK_MIN 2.15, fov 40–54), **combo camera** (side view that pushes in while a string connects, eases out after), **dash push-in** (tucks behind the dasher, lens widens), **KO camera** (2.6 s slow-motion orbit on the loser), cinematic overrides for ultimate and jutsu demos (`DualTargetCamera.override`) |",
"| Audio |": "| Audio | Storm 2's own sound effects (`public/assets/sfx`, nus3bank → vgmstream), **character voice lines** (`public/assets/voice/<code>/*.wav` from `sound.cpk/PC/US/PL_<code>E.xfbin`: attacks, damage, jump, ninja move, dash, charge, jutsu, ultimate, throw, guard break, KO), **BGM** (`public/assets/bgm/title.ogg`, the Storm 2 title theme from `adx2/PC/BGM_TITLE.awb`, looped from 2.7 s; louder on the select screen, ducked in battle, under ultimates and after a KO) |",
}
lines = s.split('\n')
for i, l in enumerate(lines):
    for k, v in rows.items():
        if l.startswith(k): lines[i] = v
s = '\n'.join(lines)
decisions = """- **Prototype disc, third attempt (xfbin carve, session 8)**: `storm2proto\\carve_xfbin.py` looks for xfbin chunk tables in the guest dump (10 u32 counts + the `nuccChunk*` type strings, 28 bytes after the header), walks the chunks and validates with the add-on's `xfbin_lib`. Only **one** file image survives in RAM (`1efadv_aura00`, an effect, and only its first two pages); the other ~140 tables belong to parsed heap objects whose chunk data was consumed. Rebuilding the prototype's models/animations from memory is therefore not viable without re-implementing the runtime layouts — the Storm 4 containers stay the source of truth.
- **Source containers**: `raw/<code>bod1{c,l}.xfbin` (vanilla Storm 4) are supersets of the trimmed `raw/s4/` copies — Naruto's launcher clips (`cmb12/13/14`) and the side-throw clips (`itl0/itr0`) only exist there. `export_batch2.sh` picks the larger copy per part.
- **Hit-record detection**: the prm dumper now anchors on the `DAMAGE_ID_*` / `DMG_*` string (@128 of the 288-byte record) instead of a `<code>00t0` bone pattern, so hits on weapon bones (`ksng_under`, `trall`, `sword`) and effect dummies (`1efc_dmy01_*`) are kept; Sasuke's and Mifune's strings became complete.
- **Jutsu demo cameras**: `export_ultimate_camera.py` takes `CAM_ACTIONS` (regex) and `export_skl_cams.sh` writes `public/assets/ult/<code>_skl.json`; the engine plays `skl1_atk1` on a connecting jutsu when both the clip and the camera exist (`CombatStateMachine.hasCinematicCam`).
"""
if "xfbin carve, session 8" not in s:
    s = s.replace("- **Resources are shared per team**", decisions + "- **Resources are shared per team**")
milestones = """### 2026-09-15 — Session 8: tether, hop, cameras, music, demos
36. Playtest round 2: combo tether (victim locked to the string, air included), ninja move as a real hop with landing recovery (no more uncontrolled slides), touchdown kills momentum, shuriken from jumps and side hops with the directional `itl0/itr0` clips, ultimate cinematic VFX.
37. Cameras: closer shoulder framing, combo camera (semi-2D side view with slow push-in), dash push-in, KO slow-motion orbit, jutsu demo cinematics with the exported `skl1_atk` cameras (Naruto, Kakashi, Minato, Mifune).
38. Audio: Storm 2 voice lines for every fighter, title BGM loop (select screen + battle, ducked for ultimates/KO).
39. Frame data: DAMAGE_ID-anchored hit detection (weapon bones), launcher/side-throw clips from the vanilla containers, all eight characters re-exported.
40. Prototype disc: xfbin carve from the Xenia RAM dump (`carve_xfbin.py`) — one partial effect container recovered, the route is documented as a dead end for models/animations.

"""
if "Session 8: tether" not in s:
    s = s.replace("---\n\n## 5. How this file updates itself", milestones + "---\n\n## 5. How this file updates itself")
open(p, 'w', encoding='utf-8').write(s)
p = os.path.join(root, 'README.md'); r = open(p, encoding='utf-8').read()
if "KO camera" not in r:
    r = r.replace("## Audio and VFX", """## Cameras

Behind-the-shoulder Storm framing, a combo camera that swings to a side view and pushes in while a
string connects, a dash push-in, a KO slow-motion orbit, and cinematic overrides that play the
game's own camera paths for ultimates (`spl1_atk`) and connecting jutsu (`skl1_atk`), exported by
`tools/scripts/export_ult_cams.sh` / `export_skl_cams.sh`.

## Audio and VFX""")
    r = r.replace("| H | Square / X | **Shuriken** throw (3% chakra, guardable, parryable, dashes pierce it) |",
                  "| H | Square / X | **Shuriken** throw (3% chakra, guardable, parryable, dashes pierce it); also in the air and out of a ninja-move hop (cancels the hop) |")
open(p, 'w', encoding='utf-8').write(r)
print('docs updated')
