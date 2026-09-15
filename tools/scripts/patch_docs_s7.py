"""Session 7 docs: playtest fixes, cinematics, prm frame data, memory findings, shadows."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'CONTINUER.md'); s = open(p, encoding='utf-8').read()
rows = {
"| Combat |": "| Combat | 60 Hz FSM on the prototype's PL_ACT vocabulary. **Movesets come from the real Storm 4 parameter tables** (`src/combat/PrmData.ts`, generated from `data/spc/<code>prm.bin.xfbin` by `tools/scripts/prm_dump.py` + `gen_prm_ts.cjs`): ground string = ATK00-02 (+ first SMASH finisher, `cmb` clips), launchers (RISE) = up string, tilts = down string, air string = ATK_AIR (`cma` clips, last hit spikes), each hit with the table's bone, active frame, damage, radius and DAMAGE_ID reaction. Movement: run, ninja move (chains only on a fresh press), double jump, air ninja move, chakra dashes, terrain following. Jutsu: melee (palm) or **projectile** (Itachi fireball, Deidara clay, Gaara sand). **Ultimate**: cut-in → armored rush → on contact the real `spl1_atk` demo plays with the **exported Storm 4 camera path** (`public/assets/ult/<code>.json`, letterbox, victim held then launched). Awakening, round intro, shuriken, throws, guard/counter/substitution, hitstop, supports |",
"| Camera |": "| Camera | Storm behind-the-shoulder camera, closer (BACK_MIN 2.6, fov 42–56), player ≈ 20 % of the frame; cinematic override during ultimates (`DualTargetCamera.override`) |",
"| Stages |": "| Stages | 8 Storm 2 stages (Hidden Leaf Forest, Forest of Quiet Movement, Forest of Death, Orochimaru's Hideout, Hidden Sand Gate, Five-Seal Barrier Cliff, Mount Myoboku, The Final Valley); the playable radius is derived from the floor mesh (up to 75 m) so the whole map is walkable; fighters follow the floor height |",
"| Rendering |": "| Rendering | Cel shader on the game's ramp, inverted-hull outlines, render interpolation, per-frame animation, sprite VFX (Kenney), **projected character shadows** (sun shadow map onto per-fighter shadow-catcher planes + soft contact blob), stage cel lighting with a real sun term, normal jump/fall clips (`jmp0`→`jmp1`; the common bank's `fal0/1` are damage falls) |",
}
lines = s.split('\n')
for i, l in enumerate(lines):
    for k, v in rows.items():
        if l.startswith(k): lines[i] = v
s = '\n'.join(lines)
decisions = """- **Storm 4 `prm.bin` format (decoded, session 7)**: little-endian tables per character — `_awa`, `_etc`, `_hit`, `_load`, `_mot`, `_skl`, `_sklslot`, `_spl`. The motion table is a sequence of 212-byte animation records (`PL_ANM_*` name @0, clip name @32, u16 fields @80, cancel target @116) each followed by 288-byte sub-records; hit records carry the bone name @64, `DAMAGE_ID_*` @128, u16 @32 (hand-over/order), u16 @96 = active start frame (30 fps), u16 @100 = damage, f32 @200 = box radius, f32 @208 = knockback power. Awakened forms (`2nrv…`) precede the base table. `cmb` = ground string, `cma` = air string, `cmr` = ranged (ATK_FAR).
- **Prototype disc, second attempt (memory)**: in a live battle Xenia's guest RAM (host 0x140000000+) holds ~145 parsed containers as heap objects — chunk-name tables, `NDP3` meshes, `NTP3` textures, anm names and `<code>prm` tables — but the `NUCC` headers are gone: chunks live as `{vtable, dataPtr, ptr, size}` objects. Rebuilding whole xfbins would need an xfbin writer over carved chunks (feasible with the add-on's xfbin_lib; not done). Launcher keys: A = VK 0xBA (`key.ps1 0xBA`), not `';'`. Flow used: RB (English) → Free Battle → P1 vs CPU → picks → stage → battle. Dumps in `C:\\Users\\ysoyo\\storm2proto\\guestdump\\`.
- **Cinematic camera export**: `tools/scripts/export_ultimate_camera.py` evaluates the `spl1_*` actions' camera object (`camera01` or `<clip>_cam`) per frame in glTF axes; the engine transforms it by the rig's GLB root matrix (scale included). `spl1_atk/cut` clips keep their root motion so the body lands where the camera expects.
- **Ninja-move slide lock** was the held jump button on a pad re-chaining the hop every 16 frames; chaining now needs a fresh press and the state times out into JUMPING if it never lands.
"""
if "Storm 4 `prm.bin` format" not in s:
    s = s.replace("- **Resources are shared per team**", decisions + "- **Resources are shared per team**")
milestones = """### 2026-09-15 — Session 7: playtest fixes, cinematics, real frame data
32. Playtest fixes: ninja-move slide lock, hurt-looking falls, closer camera, full-map traversal (radius from the floor mesh), projected shadows + terrain sun shading, Itachi/Deidara/Gaara projectile jutsu.
33. Ultimate cinematics: exported the Storm 4 `spl1` camera paths from Blender and play the real demo clips with letterbox and a held victim.
34. Decoded the Storm 4 `prm.bin` motion/hit tables and generated every character's strings, hit frames, damage and reactions from them (`PrmData.ts`); corrected the string/clip mapping (`cmb` ground, `cma` air).
35. Prototype disc, memory route: drove the Xenia prototype into a battle by key injection, scanned guest RAM (parsed heap chunks, no intact containers), documented the layout.

"""
if "Session 7: playtest" not in s:
    s = s.replace("---\n\n## 5. How this file updates itself", milestones + "---\n\n## 5. How this file updates itself")
open(p, 'w', encoding='utf-8').write(s)
p = os.path.join(root, 'README.md'); r = open(p, encoding='utf-8').read()
if "## Frame data" not in r:
    r = r.replace("## Audio and VFX", """## Frame data

Every string, hit window, damage value and reaction now comes from the Storm 4 character parameter
tables (`data/spc/<code>prm.bin.xfbin`), decoded by `tools/scripts/prm_dump.py` and baked into
`src/combat/PrmData.ts` by `tools/scripts/gen_prm_ts.cjs`. Ultimates play the game's own `spl1`
demo clips with their exported camera paths (`public/assets/ult`).

## Audio and VFX""")
open(p, 'w', encoding='utf-8').write(r)
print('docs updated')
