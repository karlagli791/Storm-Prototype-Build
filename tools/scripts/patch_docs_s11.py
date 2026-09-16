"""Session 11 docs: the One Piece: Fighting Path fighters — own rig, own animation set, own
control layout (skill palette, Haki, Observation step), plus the pose lab."""
import io, os

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

p = os.path.join(root, 'CONTINUER.md')
s = io.open(p, encoding='utf-8').read()
decisions = """- **One Piece fighters (session 11)**: the 12 *One Piece: Fighting Path* rips are added as their own fighter class rather than being folded into the Storm mechanics. They ship no animation data (skinned 3ds Max Biped models only), so `tools/scripts/opbr_import.py` keeps every bone, renames the humanoid ones to `OP_*`, normalises the model to head-height 1 and writes a manifest; `src/render/OpbrRig.ts` then animates them procedurally. Poses are authored once in a rig-agnostic space (limbs start pointing straight down, `limb(fwd, out, twist, side)`) and fit every rig. Several of those rigs drive limbs from *flat* deform chains (`BN_Arm_L01..07` all parented to the clavicle), so the animator composes limb transforms along a logical chain in character space and writes them back as local transforms — and the importer prefers the bones the skin is actually weighted to, because the Biped control chain is often unweighted.
- **Their controls are deliberately different**: ○ strings as usual, but the four signature skills sit on `L1 + ○ / △ / □ / ✕` (keys 1-4), the finisher on `R1 + ○` (key 5), Armament Haki on `R1 + △` (R) and the Observation step on a bare `R1` tap (F). Skills cost gauge *and* have individual cooldowns, like the mobile game's skill bar; the HUD shows the four slots with a cooldown sweep. `KeyboardInputSource.opbrMode` switches the pad layout when that player's leader is one of them.
- **Their extras**: Law's ROOM, Shambles teleport, counter stances (Katakuri's Future Sight, Shanks' parry, Tekkai), Kuma's air bullets and Koby's Rankyaku as projectiles, per-character Devil-Fruit effects in `src/render/OpbrFX.ts` (ROOM dome, gravity orbs and meteors, mochi blobs, paw prints, crow swarm, Conqueror's lightning). Shiki and Karasu have no leg bones in their rips — they are flagged `float` and use the hover clips. Transformation meshes the rips carry (Luffy's Gear-4 limbs, Katakuri's mochi weapons) are hidden and shown by state, and weapon bones are resolved from the weapon mesh's own weights so swords sit in the hand.
- **Pose lab** (`/opbr_lab.html`, `src/lab/opbrLab.ts`): loads any of them, lists every registered clip, scrubs frame by frame, front/side/back/turntable. This is the tool for tuning their animation; it never ships in the game build.
"""
if 'One Piece fighters (session 11)' not in s:
    s = s.replace('- **Resources are shared per team**', decisions + '- **Resources are shared per team**')
milestones = """### 2026-09-16 — Session 11: One Piece: Fighting Path fighters
51. Asset pipeline: `opbr_import.py` / `opbr_batch.sh` convert the rips (DAE/FBX) to `public/assets/op_*.glb` + manifest — canonical `OP_*` bones resolved from skin weights, head-height normalisation, secondary-motion chains kept, stray primitives dropped.
52. Procedural animation: `OpbrRig` (rig-agnostic pose space, canonical-chain transforms, cloth lag), `OpbrPoses` (idle, walk, run, jump, fall, land, guard, dash, dodge, charge, hit/launch/tumble/crumple/knockdown/wall, intro, win, hover) and `OpbrMoves` (strike vocabulary + 34 signature skill clips).
53. Fighters: Luffy, Law, Sabo, Shanks, Katakuri, Fujitora, Kuma, Burgess, Shiki, Karasu, Koby + Chopper, each with four skills, a finisher, strings, a Haki coat and their own stats.
54. Mechanics: `CombatState.SKILL` with cooldowns, armour, counters, teleports, travel windows and projectiles; Armament Haki (+25 % damage); Observation step; AI that uses the palette.
55. Presentation: `OpbrFX` Devil-Fruit effects, HUD skill palette with cooldown sweeps, move-list pages, and rendered select art (icon / stand / VS / medallion) for all 12.
56. Tooling: `/opbr_lab.html` pose lab, `glb_chain.cjs`, `glb_weights.cjs`, `glb_rest.cjs`, `opbr_portraits.sh`.

"""
if 'Session 11: One Piece' not in s:
    s = s.replace('---\n\n## 5. How this file updates itself', milestones + '---\n\n## 5. How this file updates itself')
io.open(p, 'w', encoding='utf-8').write(s)

p = os.path.join(root, 'README.md')
r = io.open(p, encoding='utf-8').read()
block = """
### One Piece fighters

Twelve *One Piece: Fighting Path* characters (Luffy, Law, Sabo, Shanks, Katakuri, Fujitora, Kuma,
Burgess, Shiki, Karasu, Koby, Chopper) share the roster but not the control scheme. Their models
carry no animation data, so the engine animates them procedurally (`src/render/OpbrRig.ts`); their
moves sit on a Fighting-Path style skill palette:

| Keyboard | Pad | Action |
| --- | --- | --- |
| 1 / 2 / 3 / 4 | L1 + ○ / △ / □ / ✕ | Skills 1-4 — each costs gauge and has its own cooldown |
| 5 | R1 + ○ | Finisher (full gauge) |
| R | R1 + △ | Armament Haki — 12 s, +25 % damage, super armour on skills |
| F | R1 (tap) | Observation step — short invulnerable sidestep |
| J | ○ | Combo string, launcher and tilt branches as usual |

Tuning their animation: `npm run dev`, then open `/opbr_lab.html` — every pose clip, frame by frame.
"""
if 'One Piece fighters' not in r:
    r = r.rstrip() + '\n' + block
io.open(p, 'w', encoding='utf-8').write(r)
print('docs s11 updated')
