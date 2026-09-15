"""Session 5 doc update: roster, character select, assists, desktop build, reverse-engineering sources."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'CONTINUER.md'); s = open(p, encoding='utf-8').read()

rows = {
"| Characters |": "| Characters | Roster of 9 in `src/combat/Roster.ts`: Naruto `2nrt`, Sasuke `2ssk` (hand-tuned movesets), Kakashi `2kks`, Minato `2fou`, Gaara `2gar`, Itachi `2itc`, Deidara `2ddr`, Mifune `3mfn` (Storm 4 containers via `tools/scripts/export_batch.sh`, template moveset from the shared CC2 clip names) and Indra `9ind` (LorisC93's Storm Connections Blender rip → `export_blend_character.py`; borrows Sasuke's clips through `animBank`). Common bank `cmn_anims.glb` retargeted onto every rig |",
"| Stages |": "| Stages | `stage_sd03a.glb` Hidden Leaf Forest, `stage_sd05a.glb` Forest of Quiet Movement, `stage_sd01d.glb` Forest of Death; chosen on the select screen (thumbnails `ui/sel/stage_*.jpg` captured from the engine), F5 cycles. Floor by raycast; environment rings/domes kept; `backlight` placeholder sheets hidden; shadow sheets drawn before the fighters |",
"| HUD |": "| HUD | Storm 2 duel layout (portraits for all 9: Storm 2 `face_le`, Storm 3 `duel_player` for Mifune, engine render for Indra), Storm-style VS splash before every battle, Storm 2 character select (`src/ui/CharacterSelect.ts`: sky backdrop, brush title, framed icons, full-body stand art, name plates, stage pick) |",
"| Input |": "| Input | Keyboard + polled gamepad in battle and on the select screen (stick/D-pad, Cross confirm, Circle back). Authentic Storm pad layout; ESC returns to the select screen; the match is encoded in the URL (`?p1=2nrt,2ssk&p2=2kks,2gar&stage=sd03a`) so a reload rematches |",
"| Rendering |": "| Rendering | Cel shader samples the game's `celshade.tex` ramp (row 44 two-band, texture `flipY=false` so rows count from the top like the game), hard specular, fresnel rim, inverted-hull outlines; render interpolation between 60 Hz sim ticks and per-frame skeletal animation (`FighterRig.advance`) so motion is smooth at any refresh rate; Blender toon study in `docs/render/` |",
}
lines = s.split('\n')
for i, l in enumerate(lines):
    for k, v in rows.items():
        if l.startswith(k): lines[i] = v
s = '\n'.join(lines)

decisions = """- **Reference repos (session 5)**: `hardkiller2565123123/StormRevivalClientSource` is a Steam-API proxy / hook scaffold for the PC Storm games; it holds no Storm 2 battle internals but gives Storm 4's ordered `PL_ANM_*` (1009), `PL_ACT_*` (325), `ME_*` motion events (289), `DAMAGE_ID_*` (70), the 30 fps authoring rule, the gauge block and the 3×9 select grid (report: `C:\\Users\\ysoyo\\storm2proto\\ref\\stormrevival_report.md`). `zealottormunds/unsme` is only an NDP3 mesh editor (report `unsme_report.md`). GameBanana 523773 is a Storm 1 restoration pack (param files + 9 stage xfbins, no music/VFX). DeviantArt (LorisC93) rips are Blender files with the model and a win pose only; the Drive's Storm 4 containers were used for Mifune/Deidara because they include the full clip sets.
- **Character codes**: `2fou` is Minato (Fourth Hokage), `2kks` Kakashi, `3mfn` Mifune, `3mnt` is *not* Minato (exported but unused). `characode.bin.xfbin` (Storm 4 `ParamFiles`) lists every code; `messageInfo.bin.xfbin` (eng) has the display names.
- **UI textures**: Storm 2 (PS3-era) textures are NTP3 blocks → `tools/scripts/ntp3_tex2png.py`; Storm 4 PC textures are raw DDS → `xfbin_tex2png.py`. Storm 2 `chara_sel/sel1.xfbin` has the icon atlas (11×5, 135 px pitch), `sel1_stand_2all.xfbin` the 46 stand images in face_vs code order minus `2nrb/2nrz/2peb`, `vs/face_vs` the 1052×1112 versus art, `duel/face_le` the HUD medallions (`.dds`). Storm 4 UI is Scaleform GFx (icons packed by symbol, not extracted).
- **Portraits for characters without Storm 2 art** are captured from the engine itself (`?p1=<code>` + green clear colour + `key_captures.py` + `build_rendered_assets.py`); Blender retargeting of another character's idle failed because the add-on bakes rotations against each rig's rest pose.
- **Assists**: the manual call spawns the support beside the enemy, fires its jutsu (hitbox active) and leaves; automatic types stay (Balance cover fire, Guard dash cut / charge guard, Attack strike back).
- **Desktop build**: Electron shell in `electron/` (`npm run desktop`, `npm run dist:win` → `release/`), Vite `base './'`, `signAndEditExecutable=false` (winCodeSign extraction needs symlink privileges), electron-updater against the GitHub releases of this repo.
"""
if "Reference repos (session 5)" not in s:
    s = s.replace("- **Resources are shared per team**", decisions + "- **Resources are shared per team**")

milestones = """### 2026-09-15 — Session 5: roster, select screen, desktop
23. Analyzed StormRevivalClientSource, unsme and GameBanana 523773 (reports in `C:\\Users\\ysoyo\\storm2proto\\ref\\`); lifted the Storm 4 vocabularies and UI facts.
24. Seven new fighters exported from the Drive's Storm 4 containers plus Indra from the DeviantArt Blender rip; `animBank` retargeting lets Indra use Sasuke's clip set; add-on patched for multi-light anms (`insert_keyframes_fc` skips existing curves).
25. Storm 2 character select rebuilt from the real UI textures (icons, stand art, versus faces, plates, sky), keyboard + pad driven, with a VS splash and stage pick; match state lives in the URL, ESC returns to the select.
26. Assist rework (support jutsu spawn), render interpolation + per-frame animation advance (no 60 Hz stepping), ramp orientation fix (fighters were sampling an empty ramp row), stage fixes (environment rings, backlight sheets, shadow ordering).
27. Electron desktop shell with portable/NSIS packaging and GitHub auto-update wiring.

"""
if "Session 5: roster" not in s:
    s = s.replace("---\n\n## 5. How this file updates itself", milestones + "---\n\n## 5. How this file updates itself")
open(p, 'w', encoding='utf-8').write(s)

p = os.path.join(root, 'README.md'); r = open(p, encoding='utf-8').read()
section = """## Character select, roster and desktop build

The game opens on a Storm 2 style character select (icons, full-body art, versus faces and plates are
the real Storm 2 UI textures; Mifune's and Indra's are captured from the engine). Pick 1P leader and
support, the COM pair, then a stage. The match is encoded in the URL, so a reload rematches and ESC
goes back to the select.

Roster (`src/combat/Roster.ts`): Naruto, Sasuke, Kakashi, Minato, Gaara, Itachi, Deidara, Mifune,
Indra. Assists: press L1 / R1 (Y on keyboard) at 50% support gauge and the support runs in, fires its
jutsu and leaves; Balance / Guard / Attack types also intervene automatically.

Desktop app (Electron):

```bash
npm run desktop
```

```bash
npm run dist:win
```

The second command writes a portable `.exe` and an NSIS installer to `release/`; installed builds
check the GitHub releases of this repository for updates.

## Deviations from the blueprint"""
if "## Character select, roster and desktop build" not in r:
    r = r.replace("## Deviations from the blueprint", section)
open(p, 'w', encoding='utf-8').write(r)
print('docs updated')
