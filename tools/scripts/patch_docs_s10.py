"""Session 10 docs: playtest round 3 — jumps, hits, cancels, lunge, guard roll, stage outlines,
per-character chakra effects, intro / outro cameras, watchdog, soak test."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'CONTINUER.md'); s = open(p, encoding='utf-8').read()
decisions = """- **Jumps (session 10)**: every jump is a `JUMPING` launch through `beginJump` — fixed horizontal speed (`JUMP_H_SPEED` 7.2) along the stick, `JUMP_VELOCITY` 13 with `JUMP_GRAVITY_SCALE` 0.8 (≈1.2 s air, 3.2 m apex, identical in all directions), the direction is taken relative to the *target* so the directional hop clips (`dsf0/dsb0/dsl0/dsr0`) match the travel. The air press is a second full jump (`DOUBLE_JUMP_VELOCITY`). The old bug where jumps "cancelled early" was the fall binding replacing the take-off clip at the apex (`falling` is now only for falls, via `Fighter.jumpLaunch`). The ninja-move hop projected the stick onto the lock-on tangent, which turned forward jumps sideways; it is no longer used for ground jumps.
- **Hit registration**: opening strikes home in (up to 7 m, 11 m for the ranged lunge; the wind-up holds up to 16 frames while closing), and `HitboxManager.testHitbox` has a body-column fallback (attacker facing the defender within 1.3 m + box radius during active frames). Table moves that open with a frame-1 chest marker are skipped when picking the first real strike.
- **String inputs**: fresh forward tilt (≤ 6 frames) + ○, or ○ while running in from > 4.5 m → `FAR` string (the table's `ATK_FAR` / `cmr` moves); up / down held → launcher / tilt strings. Once a strike is out it cancels into ultimate, jutsu (full gauge = ultimate), jump / double jump, or shuriken.
- **Guard roll**: a stick flick while guarding → `DODGE` (11 m/s, 12 invulnerable frames, 24 frames, back to guard if held).
- **Chakra dash clips**: `dsh0s → dsh0l` (begin / loop); `dsh1l` is the *back* dash loop and was the "rolling" look.
- **Stage outlines**: `ArenaEnvironment.computeBounds` marches 72 rays over the named floor (fallback: any solid stage geometry; fallback: flat ground), stops at ledges > 1.6 m, then casts waist-height rays against visible walls / cliffs / tree lines / buildings (hits under 12 m ignored), capped at 42 m. `constrain` clamps to that outline and kills walking momentum at the edge (no sliding). `groundY(x, z, refY)` returns the highest surface at or below the feet (+0.6 m), ignores pits below −4 m, and the old y ≥ 0 clamp is gone — that clamp plus the first-hit-under-4 m rule caused the levitation. The game's own `*hit*` collision meshes export as 1–12-triangle placeholders and `StageInfo.bin` holds per-object placement records, so neither gives a usable battle radius.
- **ElementFX** (`src/render/ElementFX.ts`): per-character chakra effects in code, layered as polygon (swirl ball / shock dome / arc) + edge (lightning ribbons, wind ribbons, slash arcs) + vertex (sparks, gravel, droplets, flames) + low-opacity airflow (ground wave + rising wind), following the Storm-4-inspired Unity breakdown on realtimevfx.com. `Roster.ts` assigns each fighter an `element`, `ultElement` and `chakraColor` from who they are (Rasengan wind, Chidori lightning, Fire Style, sand, clay, water, Gentle Fist, strength, taijutsu, poison, Almighty Push, blades, chakra scalpel, dark lightning).
- **NSC Toolbox** is a GUI-only Windows editor for Storm Connections / Storm 4 files (no CLI); nothing in it replaces the export pipeline here.
"""
if "Jumps (session 10)" not in s:
    s = s.replace("- **Resources are shared per team**", decisions + "- **Resources are shared per team**")
milestones = """### 2026-09-16 — Session 10: playtest round 3
46. Movement: uniform directional jumps and double jump, correct directional clips, no substitution smoke on jumps, smear frames only on attacks / specials, guard roll, chakra dash clips fixed.
47. Combat: homing opening strikes + body-column hit fallback (hits land in and out of combos), ranged lunge string, cancels into jutsu / ultimate / jump / shuriken, release of fighters held by an interrupted cinematic, frozen-state watchdog.
48. Stages: walkable outlines from floor + wall geometry (42 m cap), no sliding at the edge, no levitation (feet-relative ground height, pit guard, no y ≥ 0 clamp); all 21 stages swept.
49. Presentation: ElementFX chakra effects per character (jutsu in hand, impacts, auras, ultimate cinematics), slower smootherstep combo camera with hold, staggered round-intro camera, victory pose outro, muted attract match behind the menus.
50. Tooling: `tools/scripts/soak_test.js` (stuck / frozen / levitate / sink / outside / slide / NaN detector).

"""
if "Session 10: playtest round 3" not in s:
    s = s.replace("---\n\n## 5. How this file updates itself", milestones + "---\n\n## 5. How this file updates itself")
open(p, 'w', encoding='utf-8').write(s)
p = os.path.join(root, 'README.md'); r = open(p, encoding='utf-8').read()
r = r.replace("| Space | Cross / A | Jump. With a direction while running: **Ninja Move** lateral hop |",
              "| Space | Cross / A | Jump — with a direction it leaps that way (forward / back / side / diagonal, same distance and air time); again in the air = double jump |")
if "Forward tilt + ○" not in r:
    r = r.replace("| J | Circle / B | Attack.", "| W/↑ tap + J | Forward tilt + ○ | **Ranged lunge** (the character's ATK_FAR moves); ○ while running in from range does the same |\n| L + direction | L2 + stick flick | **Guard roll** (brief invulnerability) |\n| J | Circle / B | Attack.")
    r = r.replace("| Dir + Space in a string / dash startup | | **Hollow Step** jump-cancel |", "| Space / U / M / H during a string | | **Cancels**: jump or double jump, jutsu, ultimate, shuriken |")
open(p, 'w', encoding='utf-8').write(r)
print('docs s10 updated')
