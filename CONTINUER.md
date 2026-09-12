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
| Combat | 60 Hz deterministic FSM: idle/run/ninja move/hollow step, standard/charged/spark/turbo chakra dash with predictive homing, 4-hit string + up/down branches, jutsu (armored), guard sphere + durability + guard break, guard break counter (parry), 4-stock substitution, hitstun/launch/tumble/crumple/knockdown, wall splat on the 32 m cylinder, leader switch with autonomous outgoing fighter |
| Camera | Dual-target midpoint orbital camera with the blueprint's exact constants |
| Rendering | 3-band cel shader + hard specular + fresnel rim, inverted-hull outlines, alpha test / alpha blend / additive sheets for stages |
| Characters | `public/assets/2nrt.glb` (Naruto, 50 clips) and `2ssk.glb` (Sasuke, 57 clips, Kusanagi merged) exported from Storm 4 xfbin data. Storm 2 versions kept as `*_s2.glb` |
| Stages | `stage_sd03a.glb` Hidden Leaf Forest (default) and `stage_sd05a.glb` Forest of Quiet Movement, from Storm 2 data. `?stage=sd05a` switches |
| HUD | Health/chakra/subs/support/guard bars; Storm 2 brush digits for the timer; "Go!", "Time Up", "1P/2P Won" sprites |
| Input | Keyboard + polled gamepad (PS5 DualSense tested layout: Circle attack, Cross jump, Triangle dash, L2 guard/sub, R1 switch, Options pause, Create rematch) |
| AI | P2 dummy cycles block / dash / combo / approach; subs and parries sometimes; F4 freezes it |
| Verification | JS harness checks (run in the page console): neutral string via real hand sockets, homing vs runner, substitution, wall splat 20 f, guard counter 16 f crumple + chakra cap 80, Rasengan clip + hit |

**Known gaps / next candidates**
- Rasengan/Chidori palm dummy (`eff dmy01`) is in the `eff1` container (not imported); hitbox binds to the hand bone.
- Storm 4 Naruto has a 3-clip neutral string; 4th hit and branches reuse `cmb` clips. Combo digits sprite sheet was not cut (rects failed), text fallback is used.
- Support "Cover Fire / Dash Cut / Strike Back" interventions from the blueprint are not implemented.
- Storm 2 prototype in Xenia: in progress (see log).

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
12. Xenia Canary (02d2cb5, 2026-03-24) installed to `C:\Users\ysoyo\storm2proto\xenia`. Prototype 7z (5.18 GB) downloading from the Internet Archive mirror to `C:\Users\ysoyo\storm2proto\image\proto.7z`.

---

## 5. How this file updates itself

- A `commit-msg` git hook (`tools/hooks/commit-msg`, installed by `npm run hooks`) appends every
  commit's subject line under "Auto log" below and stages this file, so the log travels with the commit.
- `python tools/scripts/milestone.py "text"` appends a dated milestone paragraph (use it for
  anything bigger than a commit message) and commits it.
- Claude sessions: keep section 1 ("Current state") and section 3 ("Decisions") edited by hand when
  something meaningful changes; the auto log is the raw trail.

## 6. Auto log
