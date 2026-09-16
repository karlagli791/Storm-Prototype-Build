"""Session 11: plug the One Piece fighters into the game — roster, effects, controls, hitboxes.

Idempotent: every edit checks for its own marker first.
"""
import io, os

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def edit(rel, fn):
    p = os.path.join(root, rel)
    s = io.open(p, encoding='utf-8').read()
    out = fn(s)
    if out is None:
        print(f'   {rel}: already patched')
        return
    io.open(p, 'w', encoding='utf-8').write(out)
    print(f'   {rel}: patched')


# --------------------------------------------------------------------------- roster
def roster(s):
    if 'OPBR_ROSTER' in s:
        return None
    s = s.replace("""import { PRM, PrmEntry, PrmHit } from './PrmData';""",
                  """import { PRM, PrmEntry, PrmHit } from './PrmData';
import { OPBR_ROSTER, CHOPPER_SUPPORT } from './OpbrRoster';""")
    s = s.replace("""export function findCharacter(code: string | null | undefined): CharacterDef | undefined {""",
                  """// The One Piece: Fighting Path fighters join the same select screen but keep their own rig,
// animation set and control layout (see OpbrRoster.ts).
ROSTER.push(...OPBR_ROSTER, CHOPPER_SUPPORT);

export function findCharacter(code: string | null | undefined): CharacterDef | undefined {""")
    return s


# --------------------------------------------------------------------------- hitboxes
def hitboxes(s):
    if 'CombatState.SKILL' in s:
        return None
    return s.replace(
        "if (attacker.state !== CombatState.COMBO_STRING && attacker.state !== CombatState.JUTSU && attacker.state !== CombatState.SUPPORT_ACT && attacker.state !== CombatState.ULTIMATE) continue;",
        "if (attacker.state !== CombatState.COMBO_STRING && attacker.state !== CombatState.JUTSU && attacker.state !== CombatState.SUPPORT_ACT && attacker.state !== CombatState.ULTIMATE && attacker.state !== CombatState.SKILL) continue;")


# --------------------------------------------------------------------------- input
def inputs(s):
    if 'opbrMode' in s:
        return None
    s = s.replace("""  ultimate: string[];
  up: string[];""", """  ultimate: string[];
  /** One Piece palette: four skills, the finisher, Armament Haki and the Observation step. */
  skill1: string[];
  skill2: string[];
  skill3: string[];
  skill4: string[];
  haki: string[];
  step: string[];
  up: string[];""")
    s = s.replace("""  ultimate: ['KeyM'],
};""", """  ultimate: ['KeyM', 'Digit5'],
  skill1: ['Digit1'],
  skill2: ['Digit2'],
  skill3: ['Digit3'],
  skill4: ['Digit4'],
  haki: ['KeyR'],
  step: ['KeyF'],
};""")
    s = s.replace("""  ultimate: ['NumpadEnter', 'NumpadAdd'],
};""", """  ultimate: ['NumpadEnter', 'NumpadAdd', 'KeyB'],
  skill1: ['KeyZ'],
  skill2: ['KeyX'],
  skill3: ['KeyC'],
  skill4: ['KeyV'],
  haki: ['KeyG'],
  step: ['KeyQ'],
};""")
    s = s.replace("""    if (this.any(b.ultimate)) held |= InputFlag.ULTIMATE;""",
                  """    if (this.any(b.ultimate)) held |= InputFlag.ULTIMATE;
    if (this.any(b.skill1)) held |= InputFlag.SKILL1;
    if (this.any(b.skill2)) held |= InputFlag.SKILL2;
    if (this.any(b.skill3)) held |= InputFlag.SKILL3;
    if (this.any(b.skill4)) held |= InputFlag.SKILL4;
    if (this.any(b.haki)) held |= InputFlag.HAKI;
    if (this.any(b.step)) held |= InputFlag.STEP;""")
    s = s.replace("""  /** Shared gamepad poller; polled once per sample. */
  readonly pad: GamepadState;""",
                  """  /** Shared gamepad poller; polled once per sample. */
  readonly pad: GamepadState;
  /**
   * One Piece control layout. The Storm scheme keeps the face buttons for attack / jump /
   * chakra; these fighters instead read L1 + face button as their four skills, R1 + ○ as the
   * finisher, R1 + △ as Armament Haki and a bare R1 tap as the Observation step.
   */
  opbrMode = false;""")
    s = s.replace("""      if (b[PAD.DPAD_UP] || gp.ly > 0.6) held |= InputFlag.UP;""",
                  """      if (this.opbrMode && (b[PAD.L1] || b[PAD.R1])) {
        // The palette takes the face buttons over while a shoulder is held.
        const face = b[PAD.CIRCLE] || b[PAD.TRIANGLE] || b[PAD.SQUARE] || b[PAD.CROSS];
        held &= ~(InputFlag.ATTACK | InputFlag.JUMP | InputFlag.THROW | InputFlag.CHARGE | InputFlag.JUTSU | InputFlag.SUPPORT | InputFlag.SUPPORT2 | InputFlag.DASH | InputFlag.CHAKRA);
        if (b[PAD.L1]) {
          if (b[PAD.CIRCLE]) held |= InputFlag.SKILL1;
          if (b[PAD.TRIANGLE]) held |= InputFlag.SKILL2;
          if (b[PAD.SQUARE]) held |= InputFlag.SKILL3;
          if (b[PAD.CROSS]) held |= InputFlag.SKILL4;
        } else {
          if (b[PAD.CIRCLE]) held |= InputFlag.ULTIMATE;
          if (b[PAD.TRIANGLE]) held |= InputFlag.HAKI;
          if (!face) held |= InputFlag.STEP;
        }
      }
      if (b[PAD.DPAD_UP] || gp.ly > 0.6) held |= InputFlag.UP;""")
    return s


# --------------------------------------------------------------------------- game
def main_ts(s):
    if 'OpbrFX' in s:
        return None
    s = s.replace("""import { Effects, GuardSphere } from './render/Effects';""",
                  """import { Effects, GuardSphere } from './render/Effects';
import { OpbrFX } from './render/OpbrFX';""")
    s = s.replace("""  effects = new Effects();""",
                  """  effects = new Effects();
  /** Effects for the One Piece skills (Devil Fruits, Haki, crows, gravity). */
  opbrFx = new OpbrFX(this.effects);""")
    s = s.replace("""    this.fsm.projectiles = this.projectiles;""",
                  """    this.fsm.projectiles = this.projectiles;
    this.fsm.opbrFx = this.opbrFx;
    this.scene.add(this.opbrFx.group);
    // A One Piece leader switches that player's pad to the Fighting Path layout.
    for (const [src, def] of [[p1Source, selection.p1.leader], [p2Source, selection.p2.leader]] as const) {
      if (src instanceof KeyboardInputSource) src.opbrMode = !!def?.opbr;
    }""")
    s = s.replace("""    this.effects.update(dt);""",
                  """    this.effects.update(dt);
    this.opbrFx.update(dt);""")
    return s


print('patching:')
edit('src/combat/Roster.ts', roster)
edit('src/combat/HitboxManager.ts', hitboxes)
edit('src/core/InputManager.ts', inputs)
edit('src/main.ts', main_ts)
