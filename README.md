# STORM Prototype Engine

A runnable 3D anime arena-fighter prototype built from the *Storm 4 Prototype Master Plan*
blueprint. TypeScript + Three.js (WebGL2) + Vite. Deterministic 60 Hz fixed-step simulation,
8-frame input ring buffer, full combat FSM, dual-target orbital camera, cylindrical arena with
wall splats, two-pass cel shading with inverted-hull outlines, and a canvas HUD.

It now runs on the **real CyberConnect2 assets**: Naruto (`2nrt`) and Sasuke (`2ssk`) rigs with
their in-game animation clips, the Hidden Leaf Forest (`sd03a`) and Forest of Quiet Movement
(`sd05a`) stages, and the Storm 2 duel HUD sprites. Player 1 is Naruto (support Sasuke). Player 2
is an AI dummy Sasuke (support Naruto) that cycles between block, dash, combo and approach.

## Run

```bash
npm install
npm run dev        # http://localhost:5173   (?stage=sd05a picks the other stage)
npm run build      # type-check + production bundle in dist/
```

## Game modes

Title → main menu → **Free Battle (VS COM / VS PLAYER)**, **Training**, **Move List**, **Options**,
**Credits**. Each side picks a leader and two supports with an assist type (Attack / Guard /
Balance); 24 fighters, 21 stages. Player 2 uses the second controller or the arrow keys + numpad
(`Options → 2P device`). Pause with Options / P; results offer rematch, character select or title.

## Controls

| Keyboard | PS5 / Xbox pad | Action |
| --- | --- | --- |
| W A S D | Left stick / D-pad | Move (camera-relative) |
| Space | Cross / A | Jump. With a direction while running: **Ninja Move** lateral hop |
| J | Circle / B | Attack. Stick up/down (or D-pad) on a follow-up = **Up / Down** branch |
| K | Triangle + Cross (or R2) | **Chakra Dash** 15%. Hold = **Charged** 25%. Mid-string = **Spark Dash** 20%. Attack then dash within 4 frames = **Turbo Dash** |
| N | Triangle (alone) | **Chakra Charge** (45 %/s, cancels into dash / jutsu / attack). Hold it at ≤50% health to **Awaken** (20 s, +30% damage, aura) |
| M, or U with ≥90% chakra | Triangle + Circle with a full gauge | **Ultimate Jutsu**: cut-in, armored homing rush, big finisher (empties the gauge) |
| Space in the air | Cross in the air | **Double jump**; with a direction = **air ninja move** |
| J in the air | Circle in the air | **Air string** (3 hits, the last spikes the enemy down) |
| H | Square / X | **Shuriken** throw (3% chakra, guardable, parryable, dashes pierce it); also in the air and out of a ninja-move hop (cancels the hop) |
| Y / T | L1 / R1 | **Support call** (50% support gauge): support 1 / support 2 runs in for a combo join. Automatic interventions: Balance = Cover Fire, Guard = Dash Cut / Charge Guard, Attack = Strike Back |
| L / Shift | L2 / L1 | Guard (guard sphere, durability 100, blue → yellow → red) |
| L + J | L2 + Circle | **Guard Break Counter** (frames 2–7 parry, costs 20% of max chakra for 20 s) |
| I | L2 during hitstun | **Substitution** (1 of 4 stocks, 14 s sequential recharge) |
| U | Triangle + Circle | Jutsu: Rasengan / Chidori (30% chakra, armored, real `skl1` clips) |
| O | R3 | **Leader Switch** (50% support gauge); the outgoing fighter finishes its action |
| Dir + Space in a string / dash startup | | **Hollow Step** jump-cancel |
| P / R | Options / Create | Pause / rematch |
| 2P keyboard | (Options → 2P device) | Arrows move · Numpad 1 attack · 2 dash · 0 jump · 3 guard · 4 jutsu · 5 shuriken · 6 charge · 7 / 9 supports · 8 switch · . substitution · Enter ultimate |
| F3 / F4 / F5 | | Hitbox visualiser / toggle the AI (the enemy starts as a standing training dummy; `?ai=1` starts it on) / next stage |

The controller is polled every tick with a radial deadzone; the on-screen badge turns green when
Chrome sees the pad (click the page and press any button first).

## Module map

| File | Blueprint module |
| --- | --- |
| `src/core/Types.ts` | Core schemas, `CombatState` enum, `InputFlag`, hit/hurtbox defs, constants |
| `src/core/InputManager.ts`, `src/core/GamepadState.ts` | 8-frame ring buffer, priority resolution, keyboard + gamepad + scripted sources |
| `src/combat/CombatStats.ts` | Health 1000, chakra 100 (with cap penalty), 4 sub pips, guard 100, support gauge |
| `src/combat/CharacterDefs.ts` | `2nrt` / `2ssk` movesets, socket names, CC2 clip codes per move |
| `src/combat/Fighter.ts` | Fighter entity + `Team` (leader/bench, switch tech, sync-frame snapshot) |
| `src/combat/CombatStateMachine.ts` | Every state transition, hit reactions, clash table, dash impact, parry, sub, wall splat |
| `src/combat/HitboxManager.ts` | Dash arbitration, swept-capsule socket hitboxes vs hurtbox spheres, debug draw |
| `src/combat/PlayerController.ts` | Input → FSM → integration → gravity → arena clamp → rig |
| `src/combat/AIBrain.ts` | P2 dummy cycling block / dash / combo / approach, subs and counters |
| `src/systems/DualTargetCamera.ts` | Midpoint camera: `D(d)`, `H(d)`, azimuth bias 0.26 rad, `exp(-10.5 dt)` smoothing |
| `src/systems/ArenaEnvironment.ts` | 32 m cylinder clamp, wall splat, procedural fallback arena, CC2 stage GLB binding |
| `src/render/Shaders.ts` | 3-band cel diffuse, hard specular, fresnel rim, inverted hull, alpha test / blend |
| `src/render/FighterRig.ts` | GLB rig (CC2 bone sockets, clip selection per state) with procedural mannequin fallback |
| `src/render/Effects.ts` | Hit sparks, spark-dash flash, sub log + smoke, guard sphere, jutsu emitters |
| `src/ui/UIOverlay.ts` | Health / chakra / sub pips / support / guard bars, Storm 2 sprite timer + banners |
| `src/main.ts` | Scene, teams, fixed-step loop, switch handling, stage selection, win condition |

## Asset pipeline (what was actually done)

Source: the community "Naruto Data Files & More" Google Drive (shared by moerustorm), which already
holds the games' CPKs unpacked into `.xfbin` containers, plus the modding notes. The DeviantArt
guide by ChakraWarrior2012 points at the same Drive and the same Blender add-on.

1. **Files** — `tools/scripts/drive_ls.py <folderId>` lists a public Drive folder through the
   static embedded view (the normal web list is virtualised and unreliable). Files download with
   `https://drive.google.com/uc?export=download&id=<id>`. Used: Storm 4 `spc/bod1|bod1c|bod1l|acc1|skl1`
   for `2nrt` and `2ssk`; Storm 2 `stage/sd03a.xfbin`, `sd05a.xfbin`; Storm 2 `ui/duel/*.dds`.
   Storm 2's own character containers also import (kept as `2nrt_s2.glb` / `2ssk_s2.glb`).
2. **Blender** — Blender 4.5 + Blender-XFBIN-Importer 2.5.2 installed to the user add-ons folder.
   Two local patches were needed for headless use: `materials/shaders.py` guards
   `bpy.context.space_data` (None in background mode) and `importer.py` initialises `group_name`
   before the per-animation loop (crashed on `2nrtskl1`).
3. **Characters** — `tools/scripts/export_character.py <code> <out.glb> <bod1> [acc1] <bod1c> <bod1l> [skl1]`
   imports the model + accessory + clip containers, drops LOD / bod2 / bod3 meshes, rebuilds every
   material as Principled BSDF + diffuse texture, **resets all pose bones to identity** (the add-on's
   own Play operator does this; without it unkeyed bones keep stale import poses and the body tilts),
   prunes action slots that target the LOD rigs, keeps gameplay clips, and exports a GLB with
   animations. Result: `2nrt.glb` (50 clips, 9.7 MB), `2ssk.glb` (57 clips, 13.8 MB, Kusanagi merged).
4. **Stages** — `tools/scripts/export_stage.py <out.glb> <scale> <stage.xfbin>` imports without the
   collision chunk (`import_modelhit=False`, plus a `hit_*` filter), bakes bone-placed props to
   static meshes, detects real texture alpha per material, applies the 1.68 character scale, and
   exports. In the engine, `ArenaEnvironment.tryLoadStage` cel-shades everything, alpha-tests
   foliage, alpha-blends ground overlays, renders `light`/`shadow` sheets additively /
   multiplicatively, and hides prop templates (`*_batch*`) and bone-placed clusters that collapse
   onto the origin. The gameplay boundary stays the 32 m cylinder.
5. **HUD** — Storm 2 `xbattle_*.dds` converted to PNG with Pillow; `tools/scripts/measure_sprites.py`
   cuts the round-timer digits, "Go!", "Draw", "Time Up", "1P/2P", "Won", "Defeated" into
   `public/assets/ui/sprites.json`.

Clip codes used from the `bod1c` / `bod1l` / `skl1` containers: `nut0` idle, `run1`, `jmp0`, `lan0`,
`dsf0` dash, `dsh0s/0l/1l` dash startup/impact, `grd0` guard, `ghf0` guard hit, `gda0` guard break,
`dmg0f` damage, `dow0/1` knockdown, `cma00..02` neutral string, `cmb00..` branches, `skl1_s*` jutsu.

## Verification (run against the simulation with the real rigs)

| Check | Result |
| --- | --- |
| Neutral string through real hand sockets | 3 hits, 107 damage, target in hitstun |
| Homing dash vs a 9.8 m/s lateral runner | Impact at frame 72, predictive lead visible |
| Substitution during hitstun | Stock 4 → 3, log spawned, 2.5 m behind the opponent |
| Wall collision `v_n ≤ -8.5` | `WALL_SPLAT` for exactly 20 frames, then slides into knockdown |
| Guard Break Counter vs dash | Attacker crumples 16 frames, sub locked, defender max chakra 100 → 80 |
| Rasengan | `JUTSU` state plays `2nrtskl1_s1`, hits for 220 with the armored hitbox |
| Spark / charged / turbo dashes, clash, leader switch | As in the earlier prototype run |

## Storm 2 prototype (Hidden Palace, Jul 26 2010)

Run and inspected in Xenia Canary (see `CONTINUER.md` §3a and `docs/proto/`). Boots to CC2's
debug launcher; Free Battle works end to end with the debug character/stage select and the
in-game debug menu (Battle balance, Camera, Hit display, dummy points, Lua). The disc holds
loose files (no CPK) but every one is wrapped in a `0FF512ED` compressed+encrypted container that
the community CPK decryptor does not open, so its assets stay locked; the retail Storm 2 data on
the Drive covers the same content. Launch: `C:\Users\ysoyo\storm2proto\run_proto.cmd`.

## Reverse-engineered vocabulary (Storm 2 prototype)

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

## Character select, roster and desktop build

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

## Frame data

Every string, hit window, damage value and reaction now comes from the Storm 4 character parameter
tables (`data/spc/<code>prm.bin.xfbin`), decoded by `tools/scripts/prm_dump.py` and baked into
`src/combat/PrmData.ts` by `tools/scripts/gen_prm_ts.cjs`. Ultimates play the game's own `spl1`
demo clips with their exported camera paths (`public/assets/ult`).

## Cameras

Behind-the-shoulder Storm framing, a combo camera that swings to a side view and pushes in while a
string connects, a dash push-in, a KO slow-motion orbit, and cinematic overrides that play the
game's own camera paths for ultimates (`spl1_atk`) and connecting jutsu (`skl1_atk`), exported by
`tools/scripts/export_ult_cams.sh` / `export_skl_cams.sh`.

## Audio and VFX

Sound effects are Storm 2's own, decoded from the game's nus3bank files with vgmstream
(`public/assets/sfx`, see CONTINUER §3). Particle sprites are Kenney's CC0 particle pack
(`public/assets/vfx`). There is no music yet.

## Deviations from the blueprint

- Resources are **shared per team** so a leader switch keeps one coherent pool.
- The outgoing fighter after a switch cannot be hit.
- Hit scaling (7% per hit, floor 35%) is tracked on the defender and reset by Spark Dash, parry, or getup.
- Storm 4's `2nrt` has a 3-clip neutral string; the fourth hit and branch moves reuse `cmb` clips.
- The Rasengan / Chidori palm dummy (`eff dmy01`) lives in the `eff1` container, which is not
  imported; the hitbox binds to the right-hand bone instead.
