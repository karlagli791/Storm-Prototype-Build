# CONTINUER — Storm Prototype Build

Master log of everything done on this project, kept so any session (human or Claude) can pick up
exactly where the last one stopped. **Newest entries are appended at the bottom of "Milestone log".**
Every git commit appends its subject line automatically (see "How this file updates itself").

- Repo: https://github.com/karlagli791/Storm-Prototype-Build
- Local: `C:\Users\ysoyo\OneDrive\Desktop\wan\storm4-proto`
- Run: `npm run dev` → http://localhost:5173 (dev-server launch config `storm4-proto` in `wan/.claude/launch.json`)
- Blueprint: `Downloads/Storm 4 Prototype Master Plan.docx` (the spec everything is built from)
- Asset source: Google Drive "Naruto Data Files & More" (moerustorm), root folder id `1pMJ2xjHA1_PTnbKoDuJC0snDusjiUL_u`
- Prototype work area (not synced, not in git): `C:\Users\ysoyo\storm2proto\` (Xenia + disc image)

---

## 1. Current state (read this first)

**Working:** a TypeScript + Three.js arena fighter that implements the blueprint's mechanics and
runs on the real CyberConnect2 assets.

| Area | State |
| --- | --- |
| Combat | 60 Hz deterministic FSM mapped onto the prototype's own state vocabulary (`src/combat/StormStates.ts`: every state → PL_ACT/PL_ANM name + CC2 clip candidates). Idle/run/ninja move/hollow step, chakra dashes (standard/charged/spark/turbo), 4-hit string + up/down branches, jutsu, guard + guard break + counter, 4-stock substitution (warps above an airborne enemy), hitstun/launch/tumble/crumple/knockdown, wall splat, leader switch, **hitstop** (3/6/10 f), **chakra charge** (Triangle / N), **shuriken projectiles** (Square / H, guardable, parryable, dash-piercing), **support system** (manual R1 / Y call = combo join; automatic Cover Fire (Balance), Dash Cut + Charge Guard (Guard), Strike Back (Attack)), directional damage clips (dmf/dmb/dml/dmr). Balance keys from the XEX (`BALANCE` in StormStates) |
| Camera | Dual-target midpoint orbital camera; constants nudged to the prototype's framing (closer/lower at neutral: D_MIN 5.2, H_MIN 1.45, fov 43–58) |
| Rendering | Cel shader samples the game's own `celshade.tex` ramp (row 8, 3 bands: `public/assets/ui/celshade_ramp.png`) + hard specular + fresnel rim, inverted-hull outlines; stages: alpha test / blend / additive / multiply sheets, unlit sky. Blender cel study: `tools/scripts/blender_toon.py` → `docs/render/2nrt_toon.png` + `.blend` ("CC2 Toon" node group, Solidify inverted hull) |
| Characters | `public/assets/2nrt.glb` (Naruto, 50 clips) and `2ssk.glb` (Sasuke, 57 clips) from Storm 4 xfbin data, Storm 2 versions as `*_s2.glb`. **Common bank** `cmn_anims.glb` (70 clips from Storm 4 `1cmnbod1`: damage, stagger, knockdown, wall, dodge, guard-break…) retargeted onto each rig at load |
| Stages | `stage_sd03a.glb` Hidden Leaf Forest (default), `stage_sd05a.glb` Forest of Quiet Movement, `stage_sd01d.glb` Forest of Death. F5 cycles, `?stage=` overrides. Floor height found by raycast at the origin |
| HUD | Storm 2 duel layout: portrait medallions (`ui/player_2nrt.png`, `player_2ssk.png`), name + current PL_ACT, life/chakra bars, support medallion (R1 / AI) with type + gauge, sub pips, guard bar, combo counter; brush timer digits, Go!/Time Up/Won plates |
| Input | Keyboard + polled gamepad. Authentic Storm pad layout: Circle attack, Cross jump, Triangle alone = chakra charge, Triangle+Cross = chakra dash, Triangle+Circle = jutsu, R2 dash, Square throw, L2 guard/sub, L1/R1 support, R3 switch. Keyboard extras: H throw, N charge, Y support |
| AI | P2 dummy cycles block / dash / combo / approach; throws shuriken at range, calls its support, subs and parries sometimes; F4 freezes it |
| Verification | JS harness checks (run in the page console): neutral string via real hand sockets, homing vs runner, substitution, wall splat 20 f, guard counter 16 f crumple + chakra cap 80, Rasengan clip + hit |

**Known gaps / next candidates**
- Rasengan/Chidori palm dummy (`eff dmy01`) is in the `eff1` container (not imported); hitbox binds to the hand bone.
- Storm 4 Naruto has a 3-clip neutral string; 4th hit and branches reuse `cmb` clips. Combo digits sprite sheet was not cut (rects failed), text fallback is used.
- Support interventions are heuristic (distance / velocity triggers), not the prototype's exact trigger windows; `prm` frame-data tables are still locked in the wrapped disc files.
- The three NUCC blobs found in the memory dump are not identified yet.
- Prototype disc files are wrapped/encrypted in a format the retail CPK decryptor does not handle (see §3a); their assets are not extractable yet.

### 3a. Storm 2 prototype (Jul 26 2010) — what was learned by running it

Runs in Xenia Canary 02d2cb5 on this machine (`C:\Users\ysoyo\storm2proto\run_proto.cmd`).
Screens saved in `docs/proto/`.

- Boots to a **debug launcher** ("STORM2 for Xbox360", version Jul 26 2010 18:08:42): Free Battle,
  Boss Battle, Adventure, Network Battle, Usually Boot, IA Viewer, Model Viewer; RB toggles
  language to English, RT region, LB BGM.
- **Free Battle flow**: match type (P1 vs P2 / P1 vs CPU / CPU vs CPU) → debug character select
  (full Storm 2 roster incl. unreleased "*" entries: Part 1 Naruto/Sasuke, Sage Naruto no cloak,
  Sage Naruto black) with leader + 2 supports and the support-type table → stage select (all sd
  stages by Japanese name) → battle with the final HUD (support LB/RB portraits, item wheel).
- **In-game debug menu** (LS click): tabs Game / Rendering / System / Debug-menu settings. Game
  tab: Player, Support chara, **Battle balance adjust**, Battle settings, **Camera**, Display
  objects, Background, CPU, Save data, Game data, Task manager (CPU load display), **Hit** (hit
  display submenu: hit display, hit-check count, **dummy point display**, area info, disable bg
  draw, lens flare off), Interactive action, ADV, ADV aging, **Lua**, Photo mode, XFBIN app memory
  usage, Low demo, Sound, Reset test. Dummy-point display toggled on did not produce visible
  markers under Xenia (debug line draws likely not emitted); the menu itself is fully usable.
- Xenia keyboard mapping (must set `keyboard_mode = 1`): A `;`, B `'`, X `L`, Y `P`, Start `X`,
  Back `Z`, LB `1`, RB `3`, LT `Q`, RT `E`, LS click `F`, RS click `K`, D-pad Shift+WASD, left
  stick WASD, right stick arrows. Helper scripts in `C:\Users\ysoyo\storm2proto\`: `focus.ps1`
  (restore + verify foreground), `key.ps1 <key> [hold] [repeat] [gap] [shift]`, `shotwin.ps1`.
- **Disc layout**: XGD1 ISO (2048-byte sectors, magic at 0x10000), 12,859 files, no CPK layer —
  `\data\{spc,stage,ui,pt,rpg,ia,sound,skill,effect,boss,movie,system}` plus a full `data_dummy`
  mirror, `default.xex`, and **4,534 Lua scripts** (cutscenes `pt\script`, adventure `rpg\script`,
  IA). `spc` holds `2nrtbod1/bod1c/bod1l/bod1s/eff1/skl1/spl1/spl2/prm/basprm`.
- **Every data file is wrapped**: header `0F F5 12 ED 01 00 00 00 <hash> …`, high entropy,
  ~4.8× smaller than the retail decrypted equivalent (2nrtbod1: 1.01 MB vs 4.88 MB) → compressed
  and encrypted. The community `CC2_CPK_Decrypter.bms` (xorshift keystream keyed on retail CPK
  headers 8FCF3140 / F0A20061 / 45CD364B / 82C83B4F) does not match this header, so prototype
  assets and the `prm` frame-data tables stay locked for now. The retail Storm 2 data on the Drive
  is already decrypted and covers the same files.
- Extracted tree: `C:\Users\ysoyo\storm2proto\image\disc\proto\` (5.8 GB); copies of the 2nrt/2ssk
  spc files, skill, system, cmn in `raw/proto/` (git-ignored).

---

## 2. How to continue

```bash
cd C:\Users\ysoyo\OneDrive\Desktop\wan\storm4-proto
npm install
npm run dev          # http://localhost:5173
npx tsc --noEmit     # type-check
npm run build        # production bundle
```

Regenerate assets (Blender 4.5 + XFBIN add-on already installed for this Windows user):

```bash
# characters: <code> <out> <bod1> [acc1] <bod1c> <bod1l> [skl1]     (Storm 4 xfbins in raw/s4)
"/c/Program Files/Blender Foundation/Blender 4.5/blender.exe" -b --python tools/scripts/export_character.py -- 2nrt public/assets/2nrt.glb raw/s4/2nrtbod1.xfbin raw/s4/2nrtbod1c.xfbin raw/s4/2nrtbod1l.xfbin raw/s4/2nrtskl1.xfbin
# stages: <out> <scale> <stage.xfbin>
"/c/Program Files/Blender Foundation/Blender 4.5/blender.exe" -b --python tools/scripts/export_stage.py -- public/assets/stage_sd03a.glb 1.68 raw/stage/sd03a.xfbin
# list a Drive folder / download a file
python tools/scripts/drive_ls.py <folderId> [regex]
curl -L -o raw/x.xfbin "https://drive.google.com/uc?export=download&id=<fileId>"
```

Drive folder ids that matter: Storm 4 `spc` = `1bvdXXQ5JAlnpT2IoN7my1YTW1rP627aK` (subfolders bod1 `1VNDItYKRhhC72M4VuOyHHzC77HmnnQXf`, bod1c `1wRgC45C8hjfOuhKGAVx6WJcGqPGGfqd6`, bod1l `1mRQakbsNfvDPi6GpoBz5XUOQ9gxiTMkL`, acc1 `16n0DdpqL6ZC4NYxJHF-uzu_p9zdBbGAo`, skl1 `1ha-ZKkWxC0cNWmd_gmmQC1CKfXeICBlW`, eff1 `1M3LfquXD49NvAETC3crRXFbIwrFdvkgs`); Storm 2 `stage` = `1keOckcb3dIavGB0G11oOV0wYfYeKQUoB`; Storm 2 `ui/duel` = `16N0X898eqe-B_iXQ1MEg4qIK-Mqct05h`; Tools & Resources = `1uefNNK6VfFNu1hMkkNJY1vtFm3gadiYd`.

Stage ids: `tools/Stage_IDs.pdf` (sd03a Hidden Leaf Forest, sd05a Forest of Quiet Movement, sd01d Forest of Death, sd10a Hidden Rain Village, sd05b Final Valley …).

---

## 3. Decisions and lessons (why things are the way they are)

- **TS/Three.js over Godot**: the blueprint allowed either; the browser lets mechanics be verified by driving `window.storm.step()` from page JS.
- **Storm 4 data for the characters** even though the blueprint names Storm 2's `2nrt`/`2ssk`: identical codes, cleaner containers, and the add-on targets Storm 4. Storm 2 containers also import fine.
- **Tilted bodies were stale pose bones**, not a format issue. The add-on's Play operator resets every pose bone to identity before assigning a clip; `export_character.py` does the same. Without it unkeyed bones keep import poses and the spine leans 30–60°.
- **glTF turns bone-name spaces into underscores** (`2nrt00t0 r hand` → `2nrt00t0_r_hand`); socket regexes accept both.
- **Slotted actions (Blender 4.4+)**: `action.fcurves` is empty; data lives in `action.layers[0].strips[0].channelbags[slot]`. The glTF exporter needs `animation_data` to exist on the armature and exports one animation per slot, so slots for LOD rigs are removed first.
- **Stage collision hulls** (`hit_*`, modelhit chunk) render as white boxes; import with `import_modelhit=False` and filter names.
- **Bone-placed stage props** (trees `ki*`, branch clusters `eda*`) collapse onto the origin in a static export; the loader hides tall meshes rooted inside the fighting circle. `*_batch*` meshes are runtime instancing templates and are hidden.
- **Stage alpha**: per-material alpha is detected from the texture pixels in Blender; foliage uses alpha-test, ground overlays alpha-blend, `light*` sheets are additive and `shadow*` multiplicative.
- **Two local add-on patches** (Blender-XFBIN-Importer 2.5.2 in `%APPDATA%\Blender Foundation\Blender\4.5\scripts\addons`): `materials/shaders.py` guards `bpy.context.space_data` for background mode; `importer.py` sets `group_name = 'default'` before the per-anm loop (crashed on `2nrtskl1`).
- **Google Drive**: the web folder list is virtualised (scraping is unreliable, and JS-heavy scrolls froze the tab); the embedded folder view (`embeddedfolderview?id=`) is static and complete; public files download with `uc?export=download`.
- **Hidden Palace** blocks curl (Cloudflare 403); the Internet Archive mirror does not.
- **Reverse engineering went through memory, not the file wrapper**: the prototype's disc files stay encrypted, but the decrypted `default.xex` is resident in Xenia's guest RAM. `C:\Users\ysoyo\storm2proto\memdump.py` dumps guest 0x82000000+, `xex_report.py` extracts the strings (`docs/proto/xex_vocabulary.md`): the full PL_ACT_*/PL_ANM_* state list, the battle-balance parameter names (GUARD_POW_MAX, HITSTOP_*, CHAKRA_RECOVER_AT_CHARGE, SUPPORT_GAUGE_USE_*, PRJ_*, …), the Lua `cc*` API and the hit-sphere names. The engine's FSM was then re-mapped onto that vocabulary (`StormStates.ts`) instead of guessing.
- **Common animation bank**: damage/stagger/knockdown/wall/dodge clips live in Storm 4's `1cmnbod1` bank, not in the character files. `export_cmn_anims.py` exports them once; `FighterRig.loadCommonBank()` retargets track names `1cmn00t0…` → `<code>00t0…` at runtime and drops missing-bone / root position tracks.
- **Cel ramp comes from the game**: `system/celshade.tex` is a 64×64 atlas of lighting ramps; row 8 is the 3-band ramp. The engine samples it as `uRamp` instead of hard-coded thresholds, and the Blender toon group samples the same PNG (note Blender's V axis is bottom-up: row 8 from the top is V = 55.5/64).
- **Background watchdog**: browsers stop requestAnimationFrame for hidden tabs (the Claude Browser pane is hidden most of the time), which froze the sim. A 60 Hz timer steps the simulation whenever no frame was drawn for 120 ms; rendering still only happens in rAF.
- **Stage floor by raycast**: sd01d has no mesh literally named "floor" and its lowest point is a river bed 39 m down; taking the scene's min.y lifted the whole stage. The loader now raycasts down at the origin against meshes whose mesh/material/texture name matches `flo`, falling back to y = 0.
- **Resources are shared per team** (health, chakra, subs, guard, support) so leader switch keeps one pool.

---

## 4. Milestone log

### 2026-09-12 — Session 1: engine from the blueprint
1. Read the master plan docx; chose TypeScript + Three.js + Vite.
2. Wrote all modules: Types, InputManager (8-frame ring buffer), CombatStats, CharacterDefs (2nrt/2ssk movesets), Fighter/Team, CombatStateMachine, HitboxManager, PlayerController, AIBrain, DualTargetCamera, ArenaEnvironment, Shaders (cel + inverted hull), FighterRig (procedural mannequin + GLB backend), Effects, UIOverlay, main.
3. Verified the blueprint's four runtime checks by driving the simulation from page JS (homing intercept, substitution 2.5 m, wall splat 20 f, guard break counter 16 f + chakra cap 80) plus spark/charged/turbo dash, hollow step, ninja move, clash, leader switch.
4. Controller support: polled Gamepad API with radial deadzone, Storm-style PS5 layout, on-screen badge, Options/Create buttons. Opened the game in the user's Chrome for pad play.

### 2026-09-12 — Session 2: real assets
5. Located the shared Drive folder, read the modding notes (bod/spc/stage nomenclature), the DeviantArt ripping guide (same Drive + same add-on), and the Stage IDs PDF.
6. Installed Blender-XFBIN-Importer 2.5.2 into Blender 4.5; wrote headless probe scripts; found and fixed headless material crash and the stale-pose tilt.
7. Exported 2nrt/2ssk GLBs (Storm 2 first, then Storm 4 with skl1 jutsu clips); bound CC2 bone names as sockets; mapped combat states to CC2 clip codes.
8. Exported sd05a then sd03a stages; fixed collision hulls, origin-collapsed props, alpha layers, light sheets; stage loader with `?stage=` override.
9. Pulled Storm 2 duel HUD textures, converted DDS→PNG, measured sprite rects; HUD uses brush timer digits and Go!/Time Up/Won plates.
10. Re-ran all combat checks on the real rigs; production build passes; README rewritten.

### 2026-09-12 — Session 3: prototype + repo
11. Git repo initialised and pushed to GitHub as `Storm-Prototype-Build` (this file added; commit hook appends future commit subjects below).
12. Xenia Canary (02d2cb5, 2026-03-24) installed to `C:\Users\ysoyo\storm2proto\xenia`. Prototype 7z (5.18 GB) downloaded from the Internet Archive mirror (Hidden Palace itself returns 403 to curl) and extracted to `proto.iso`.
13. Prototype booted in Xenia (devkit `assertlog.txt`/`dbglog.txt` created after first run; `portable.txt`; `keyboard_mode = 1`). Driven with PowerShell key injection: language → English, Free Battle → P1 vs CPU → Naruto + supports vs CPU → Hidden Leaf Forest → battle running; in-game debug menu opened (LS click) and its Game/Hit pages captured. Screens in `docs/proto/`, findings in §3a.
14. ISO extracted with extract-xiso (12,859 files). Discovered every file is wrapped/encrypted (`0FF512ED` header, compressed); the retail CPK decryptor script does not apply. Documented, not cracked.
15. Engine fix from soak test: CC2 root-motion position tracks stripped on load so meshes stay on their colliders (6,000-frame random-input soak: no exceptions, no NaN, 24 states exercised).

### 2026-09-12 — Session 4: reverse engineering + overhaul
16. Memory-dumped the running prototype's decrypted XEX from Xenia (`memdump.py`), extracted the engine vocabulary (`docs/proto/xex_vocabulary.md`): 300+ PL_ACT/PL_ANM states, balance keys, Lua API, hit spheres, celshade atlas.
17. Combat overhaul on that vocabulary: `StormStates.ts` state→clip bindings, hitstop, chakra charge, shuriken projectiles, support system (manual call + three automatic intervention types), directional damage clips, clip chains, substitution warp-above.
18. Storm 4 common animation bank (`1cmnbod1`, 70 clips) exported and retargeted at runtime: real stagger / knockdown / wall / dodge / guard-break animations on both fighters.
19. Camera re-tuned to the prototype's framing; celshade ramp texture drives the cel shader; unlit sky; third stage `sd01d` Forest of Death + F5 stage cycling; Storm 2 duel HUD with portraits, current-act label, support medallion/gauge, combo counter.
20. Authentic Storm pad layout (Triangle = chakra button) + keyboard H/N/Y; AI throws and calls support.
21. Blender cel-shading study: `blender_toon.py` builds a "CC2 Toon" node group (Shader-to-RGB → celshade ramp × albedo, fresnel rim, stepped specular) and a Solidify inverted-hull ink outline; render + .blend in `docs/render/`.
22. Soak test (25 s random input vs AI, 2,000+ ticks): no exceptions, 16 states exercised incl. THROW / CHAKRA_CHARGE / SUPPORT; fixed the hidden-tab sim freeze (background watchdog) and the sd01d floor offset (raycast floor).

---

## 5. How this file updates itself

- A `commit-msg` git hook (`tools/hooks/commit-msg`, installed by `npm run hooks`) appends every
  commit's subject line under "Auto log" below and stages this file, so the log travels with the commit.
- `python tools/scripts/milestone.py "text"` appends a dated milestone paragraph (use it for
  anything bigger than a commit message) and commits it.
- Claude sessions: keep section 1 ("Current state") and section 3 ("Decisions") edited by hand when
  something meaningful changes; the auto log is the raw trail.

## 6. Auto log
- 2026-09-12 16:37 — Add CONTINUER.md master log, commit-msg auto-log hook and milestone script
- 2026-09-12 16:38 — Strip CC2 root-motion position tracks so meshes stay on their colliders
- 2026-09-12 17:00 — Storm 2 prototype run in Xenia: debug launcher, battle, debug menu captured; findings + screenshots
- 2026-09-12 18:44 — Prototype-informed overhaul: XEX vocabulary, hitstop/charge/shuriken/support, common anim bank, Storm 2 HUD, sd01d stage, celshade ramp, Blender toon study
