"""Session 9 docs: full game package — title/menus/options/move list/pause/results, team of three,
assist types, VS PLAYER + training, 24 fighters, 21 stages, battle music, awakened forms, post FX."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'CONTINUER.md'); s = open(p, encoding='utf-8').read()
rows = {
"| Characters |": "| Characters | Roster of 24 in `src/combat/Roster.ts`: Naruto, Sasuke, Sakura, Kakashi, Minato, Jiraiya, Tsunade, Orochimaru, Gaara, Rock Lee, Neji, Hinata, Guy, Itachi, Kisame, Deidara, Hidan, Tobi, Pain, Killer Bee, Kabuto, Suigetsu, Mifune, Indra — Storm 4 bodies/movesets (`export_batch2.sh`), Storm 2 select art (`build_select_assets2.py`, icon grid mapped from `sel1_10`), HUD faces from `face_le`. **Awakened forms**: Naruto (2nrv Nine-Tails chakra body), Sasuke (2ssv Curse Mark) swap body + moveset from the table's awakening entries (`awakenedDef`, clip infix `awa`/`aws` resolved by the rig) |",
"| Stages |": "| Stages | 21 stages (Storm 2 `sd*`/`si*` containers): Hidden Leaf Forest (day/night), Hidden Leaf Village (day/dusk/destroyed), Training Field, Forest of Quiet Movement (day/evening/night), Forest of Death, Forest of Dead Trees, Grassy Waves Prairie, Orochimaru's / Akatsuki / Uchiha hideouts, Hidden Sand Gate + Village, Five-Seal Barrier Cliff, Mount Myoboku, Site of Planetary Devastation, The Final Valley — each with a **lighting preset** (`LIGHTS` in main.ts: sun/ambient/rim/hemisphere/fog) and a battle track; thumbnails captured in-engine (`save_server.py` + `__cap`) |",
"| HUD |": "| HUD | Storm 2 duel layout with **two support medallions** (L1 / R1 tags, assist-type colour, cooldown dim), leader portrait, combo counter; hidden in the attract demo |",
"| Input |": "| Input | Keyboard + polled gamepads; **two controllers** (`GamepadState(index)`), 2P keyboard cluster (arrows + numpad, `P2_BINDINGS`), L1 = support 1, R1 = support 2 (`InputFlag.SUPPORT2`); menus driven by `MenuInputPoller` (both pads + keyboard, stick repeat) |",
"| AI |": "| AI | `AIBrain` per COM side; the attract demo runs two brains; VS PLAYER runs none; TRAINING keeps the dummy idle with health regen |",
}
lines = s.split('\n')
for i, l in enumerate(lines):
    for k, v in rows.items():
        if l.startswith(k): lines[i] = v
s = '\n'.join(lines)
if "| Front end |" not in s:
    s = s.replace("| Audio |", "| Front end | `src/ui/Screens.ts` + `MenuKit.ts`: title (logo slam over a blurred attract match), main menu (VS COM / VS PLAYER / TRAINING / MOVE LIST / OPTIONS / CREDITS), options (`src/core/Settings.ts`, localStorage: volumes, difficulty, round time, camera distance, screen effects, outlines, shadows, battle music, 2P device, HUD size), move list per character, pause (resume / move list / options / select / title), results (WINNER / PERFECT, time, max combo, damage → rematch / select / title). `CharacterSelect.ts`: leader → support 1 → assist type → support 2 → assist type per side, random cell, 21-stage grid; `core/Selection.ts` encodes the match in the URL (`mode`, `p1=lead,sup:A,sup:G`) |\n| Audio |", 1)
if "| Post FX |" not in s:
    s = s.replace("| Rendering |", "| Post FX | `src/render/PostFX.ts` (EffectComposer pass): radial motion blur on dashes / the ultimate rush, refraction shockwaves on jutsu / ultimate contact, guard breaks and knockdowns, chromatic aberration on heavy hits, two-tone impact frames on KOs and finishers, chakra heat wobble around jutsu / awakened fighters, vignette + warm grade. **Smear frames** (cel + outline vertex shaders stretch away from the travel direction on dashes, hops, launches). Ground rings / gusts / dust kicks / persistent crack and scorch decals (`Effects.groundRing/gust/dustKick/groundCrack`) on dashes, jumps, landings, knockdowns, heavy hits, ultimates, awakenings |\n| Rendering |", 1)
decisions = """- **Game package (session 9)**: the battle is one page load; menus run on top of an attract-mode `Game` (`mode: 'demo'`, both sides AI, HUD hidden, canvas blurred by CSS) and hand off by navigating to the encoded match URL. Pause / results are async overlays that pause the fixed-step loop.
- **Team of three**: `Team.supports[]` (+ `bench` = supports[0] for legacy code), `performSwitch(index)` rotates a support in; `SupportSystem` evaluates both supports with their *chosen* `Fighter.supportType` (select-screen assist type), one intervention at a time, L1/R1 manual calls.
- **Awakened forms**: `awakenedFor(def, awCode, prefix)` builds a second `CharacterDef` from the table's awakening entries (clips `2nrvawa…`); `Fighter.setAwakenedForm` swaps `def` and the rig (a second `FighterRig` for different bodies). `gen_prm_ts.cjs` reads the awakened GLB too. Same-body awakenings (Gaara/Itachi/Deidara `aws`) need their moveset containers — the `aws` files only hold the transformation effects.
- **Victim demo clips** (`skl1_dmg*`, `spl1_dmg`) animate the common `1cmnbod1` armature in the game data, so they are not in the character GLBs; the plan is to export them into `cmn_anims.glb` (the rig's common-bank retarget then serves them to every character) — `FighterRig.importDemoClips` + the `PL_ACT_DMG_DEMO` hitstun binding are in place.
- **Screenshots from the browser tool** are scaled captures; a quarter-size frame there is not a viewport bug (the drawing buffer and viewport were verified).
"""
if "Game package (session 9)" not in s:
    s = s.replace("- **Resources are shared per team**", decisions + "- **Resources are shared per team**")
milestones = """### 2026-09-15 — Session 9: the full game
41. Front end: title, main menu, options, move list, credits, pause and results screens; attract-mode demo behind the menus; settings persisted.
42. Team of three with select-screen assist types, two support medallions, L1/R1 calls; VS COM / VS PLAYER (two pads or pad + keyboard) / TRAINING modes.
43. Roster 9 → 24 (Storm 4 containers, cameras, frame data, Storm 2 art), stages 8 → 21 with lighting presets and in-engine thumbnails, 16 Storm 4 battle tracks.
44. Presentation: post-processing pass (motion blur, shockwave refraction, aberration, impact frames, heat), smear frames, ground rings / gusts / dust / cracks, stage lighting on the cel materials.
45. Awakened forms: Naruto and Sasuke swap to their awakened bodies and movesets; victim demo-clip plumbing.

"""
if "Session 9: the full game" not in s:
    s = s.replace("---\n\n## 5. How this file updates itself", milestones + "---\n\n## 5. How this file updates itself")
open(p, 'w', encoding='utf-8').write(s)
p = os.path.join(root, 'README.md'); r = open(p, encoding='utf-8').read()
if "## Game modes" not in r:
    r = r.replace("## Controls", """## Game modes

Title → main menu → **Free Battle (VS COM / VS PLAYER)**, **Training**, **Move List**, **Options**,
**Credits**. Each side picks a leader and two supports with an assist type (Attack / Guard /
Balance); 24 fighters, 21 stages. Player 2 uses the second controller or the arrow keys + numpad
(`Options → 2P device`). Pause with Options / P; results offer rematch, character select or title.

## Controls""")
    r = r.replace("| Y | L1 / R1 | **Support call** (50% support gauge): the bench fighter runs in for a combo join.",
                  "| Y / T | L1 / R1 | **Support call** (50% support gauge): support 1 / support 2 runs in for a combo join.")
open(p, 'w', encoding='utf-8').write(r)
print('docs updated')
