/**
 * OpbrMoves.ts — attack and skill animation for the One Piece fighters.
 *
 * Two layers: a shared strike vocabulary (jabs, hooks, kicks, sword swings, grapples) the combo
 * strings are built from, and the signature skill clips (Gum-Gum, ROOM, Fire Fist, Kamusari,
 * mochi, gravity, paw, crows, Rokushiki…). All of it is keyframed in the rig-agnostic pose space
 * from OpbrRig, so one animation set fits every rip.
 */
import { Pose, PoseClip, PoseKey, limb, registerClips } from './OpbrRig';
import { P, STANCE, blend } from './OpbrPoses';

const L = 1 as const;
const R = -1 as const;
type Key = [number, Pose] | [number, Pose, PoseKey['ease']];

function mk(frames: number, keys: Key[], blendFrames = 4): PoseClip {
  return { frames, blend: blendFrames, keys: keys.map(([t, pose, ease]) => ({ t, pose, ease: ease ?? 'inout' })) };
}
/** Wind-up → strike → hold → recover, the shape almost every attack uses. */
function swing(frames: number, wind: Pose, hit: Pose, windT = 0.3, hitT = 0.45): PoseClip {
  return mk(frames, [
    [0, STANCE],
    [Math.round(frames * windT), wind, 'out'],
    [Math.round(frames * hitT), hit, 'in'],
    [Math.round(frames * hitT) + 3, hit, 'linear'],
    [frames, STANCE, 'inout'],
  ]);
}

// --------------------------------------------------------------------------- strike vocabulary
const s = (b: Parameters<typeof P>[0], r: Parameters<typeof P>[1] = {}) => blend(STANCE, P(b, r));

const JAB_R = swing(18,
  s({ chest: [0.05, -0.35, 0], armR: limb(-0.35, 0.3, 0, R), foreR: limb(2.0, 0, 0.4, R) }, { rootPitch: 0.1 }),
  s({ chest: [0.08, 0.45, 0], armR: limb(1.62, 0.12, 0, R), foreR: limb(0.12, 0, 0.5, R), armL: limb(-0.5, 0.35, 0, L), foreL: limb(1.7, 0, 0, L), hips: [0, 0.3, 0] }, { rootZ: 0.12, rootPitch: 0.12 }));

const JAB_L = swing(18,
  s({ chest: [0.05, 0.35, 0], armL: limb(-0.35, 0.3, 0, L), foreL: limb(2.0, 0, 0.4, L) }, { rootPitch: 0.1 }),
  s({ chest: [0.08, -0.45, 0], armL: limb(1.62, 0.12, 0, L), foreL: limb(0.12, 0, 0.5, L), armR: limb(-0.5, 0.35, 0, R), foreR: limb(1.7, 0, 0, R), hips: [0, -0.3, 0] }, { rootZ: 0.12, rootPitch: 0.12 }));

const HOOK_R = swing(22,
  s({ chest: [0.05, -0.55, 0], armR: limb(0.2, 1.1, 0, R), foreR: limb(1.6, 0, 0, R) }, { rootPitch: 0.12, rootYaw: -0.2 }),
  s({ chest: [0.1, 0.6, 0], hips: [0, 0.45, 0], armR: limb(1.1, 1.25, 0, R), foreR: limb(0.9, 0, 0, R), armL: limb(-0.4, 0.4, 0, L) }, { rootZ: 0.1, rootYaw: 0.35 }));

const UPPER_R = swing(24,
  s({ chest: [0.3, -0.3, 0], armR: limb(-0.7, 0.3, 0, R), foreR: limb(1.2, 0, 0, R), thighR: limb(0.35, 0.16, 0, R), calfR: limb(-0.8, 0, 0, R) }, { rootY: -0.18, rootPitch: 0.3 }),
  s({ chest: [-0.35, 0.3, 0], head: [-0.2, 0, 0], armR: limb(2.6, 0.2, 0, R), foreR: limb(0.5, 0, 0, R), armL: limb(-0.3, 0.4, 0, L) }, { rootY: 0.12, rootPitch: -0.2, rootZ: 0.08 }));

const ELBOW_R = swing(20,
  s({ chest: [0.06, -0.5, 0], armR: limb(0.4, 1.3, 0, R), foreR: limb(2.4, 0, 0, R) }),
  s({ chest: [0.1, 0.55, 0], hips: [0, 0.4, 0], armR: limb(0.9, 1.35, 0, R), foreR: limb(2.4, 0, 0, R) }, { rootZ: 0.14 }));

const KICK_FRONT = swing(24,
  s({ chest: [0.12, 0, 0], thighR: limb(1.0, 0.16, 0, R), calfR: limb(-1.7, 0, 0, R), armL: limb(0.5, 0.6, 0, L), armR: limb(-0.4, 0.5, 0, R) }, { rootY: -0.06 }),
  s({ chest: [-0.2, 0, 0], thighR: limb(1.55, 0.14, 0, R), calfR: limb(-0.25, 0, 0, R), footR: limb(-0.4, 0, 0, R), armL: limb(0.8, 0.8, 0, L), armR: limb(-0.7, 0.7, 0, R) }, { rootY: 0.02, rootPitch: -0.16, rootZ: 0.1 }));

const KICK_ROUND = swing(26,
  s({ chest: [0.1, -0.5, 0], thighR: limb(0.6, 0.9, 0, R), calfR: limb(-1.7, 0, 0, R), armR: limb(0.3, 0.9, 0, R), armL: limb(0.4, 0.8, 0, L) }, { rootYaw: -0.25, rootY: -0.05 }),
  s({ chest: [0.05, 0.75, 0], hips: [0, 0.5, 0], thighR: limb(0.95, 1.25, 0, R), calfR: limb(-0.35, 0, 0, R), armR: limb(0.6, 1.2, 0, R), armL: limb(0.9, 1.0, 0, L) }, { rootYaw: 0.45, rootRoll: -0.25, rootY: 0.04 }));

const KICK_AXE = swing(28,
  s({ chest: [-0.15, 0, 0], thighR: limb(1.7, 0.2, 0, R), calfR: limb(-0.4, 0, 0, R), armL: limb(1.6, 0.6, 0, L), armR: limb(1.5, 0.6, 0, R) }, { rootY: 0.18, rootPitch: -0.2 }),
  s({ chest: [0.4, 0, 0], thighR: limb(0.5, 0.18, 0, R), calfR: limb(-0.1, 0, 0, R), footR: limb(0.4, 0, 0, R), armL: limb(-0.3, 0.5, 0, L), armR: limb(-0.35, 0.5, 0, R) }, { rootY: -0.12, rootPitch: 0.35 }));

const KICK_SPIN = mk(30, [
  [0, STANCE],
  [8, s({ chest: [0.08, -0.8, 0], armR: limb(0.3, 1.1, 0, R), armL: limb(0.4, 1.0, 0, L) }, { rootYaw: -0.8, rootY: -0.08 }), 'out'],
  [16, s({ chest: [0.05, 0.6, 0], thighR: limb(0.8, 1.3, 0, R), calfR: limb(-0.3, 0, 0, R), armR: limb(0.5, 1.3, 0, R), armL: limb(0.8, 1.2, 0, L) }, { rootYaw: 1.9, rootRoll: -0.3, rootY: 0.06 }), 'in'],
  [20, s({ chest: [0.05, 0.6, 0], thighR: limb(0.85, 1.3, 0, R), calfR: limb(-0.3, 0, 0, R), armR: limb(0.5, 1.3, 0, R) }, { rootYaw: 2.6, rootRoll: -0.25 }), 'linear'],
  [30, STANCE, 'inout'],
]);

const SMASH_DOWN = swing(32,
  s({ chest: [-0.4, 0, 0], head: [-0.3, 0, 0], armL: limb(2.6, 0.5, 0, L), foreL: limb(0.4, 0, 0, L), armR: limb(2.65, 0.45, 0, R), foreR: limb(0.4, 0, 0, R) }, { rootY: 0.14, rootPitch: -0.3 }),
  s({ chest: [0.55, 0, 0], head: [0.3, 0, 0], armL: limb(0.6, 0.3, 0, L), foreL: limb(0.5, 0, 0, L), armR: limb(0.62, 0.28, 0, R), foreR: limb(0.5, 0, 0, R), thighL: limb(0.5, 0.2, 0, L), calfL: limb(-1.0, 0, 0, L), thighR: limb(0.45, 0.2, 0, R), calfR: limb(-0.95, 0, 0, R) }, { rootY: -0.3, rootPitch: 0.5, rootZ: 0.12 }));

const PALM_R = swing(20,
  s({ chest: [0.05, -0.3, 0], armR: limb(-0.2, 0.5, 0, R), foreR: limb(2.1, 0, 1.0, R) }),
  s({ chest: [0.06, 0.3, 0], armR: limb(1.55, 0.2, 0, R), foreR: limb(0.2, 0, 1.2, R), handR: limb(-0.6, 0, 0, R) }, { rootZ: 0.1 }));

const DOUBLE_PALM = swing(26,
  s({ chest: [0.18, 0, 0], armL: limb(-0.3, 0.55, 0, L), foreL: limb(2.2, 0, 1.0, L), armR: limb(-0.3, 0.55, 0, R), foreR: limb(2.2, 0, 1.0, R) }, { rootY: -0.12, rootPitch: 0.2 }),
  s({ chest: [-0.1, 0, 0], armL: limb(1.5, 0.3, 0, L), foreL: limb(0.15, 0, 1.2, L), handL: limb(-0.6, 0, 0, L), armR: limb(1.5, 0.3, 0, R), foreR: limb(0.15, 0, 1.2, R), handR: limb(-0.6, 0, 0, R) }, { rootZ: 0.16, rootPitch: -0.08 }));

const BACKHAND = swing(20,
  s({ chest: [0.05, 0.5, 0], armR: limb(0.5, 0.4, 0, R), foreR: limb(2.2, 0, 0, R) }, { rootYaw: 0.25 }),
  s({ chest: [0.05, -0.6, 0], hips: [0, -0.35, 0], armR: limb(1.0, 1.4, 0, R), foreR: limb(0.5, 0, 0, R) }, { rootYaw: -0.4 }));

const HEADBUTT = swing(22,
  s({ chest: [-0.35, 0, 0], head: [-0.45, 0, 0], armL: limb(-0.4, 0.7, 0, L), armR: limb(-0.4, 0.7, 0, R) }, { rootY: -0.1, rootPitch: -0.2 }),
  s({ chest: [0.45, 0, 0], head: [0.4, 0, 0], armL: limb(-0.6, 0.9, 0, L), armR: limb(-0.6, 0.9, 0, R) }, { rootPitch: 0.4, rootZ: 0.2 }));

const LARIAT = mk(30, [
  [0, STANCE],
  [8, s({ chest: [0.06, -0.7, 0], armR: limb(0.1, 1.5, 0, R), foreR: limb(0.2, 0, 0, R), armL: limb(0.2, 1.0, 0, L) }, { rootYaw: -0.4, rootPitch: 0.15 }), 'out'],
  [16, s({ chest: [0.08, 0.8, 0], hips: [0, 0.5, 0], armR: limb(1.35, 1.45, 0, R), foreR: limb(0.1, 0, 0, R), armL: limb(0.4, 0.8, 0, L) }, { rootYaw: 0.5, rootZ: 0.3, rootPitch: 0.2 }), 'in'],
  [22, s({ chest: [0.08, 0.9, 0], armR: limb(1.4, 1.45, 0, R), armL: limb(0.45, 0.8, 0, L) }, { rootYaw: 0.7, rootZ: 0.45 }), 'linear'],
  [30, STANCE, 'inout'],
]);

const STOMP = swing(26,
  s({ chest: [-0.2, 0, 0], thighR: limb(1.5, 0.25, 0, R), calfR: limb(-1.3, 0, 0, R), armL: limb(1.4, 0.6, 0, L), armR: limb(1.35, 0.6, 0, R) }, { rootY: 0.16, rootPitch: -0.15 }),
  s({ chest: [0.3, 0, 0], thighR: limb(0.35, 0.2, 0, R), calfR: limb(-0.15, 0, 0, R), footR: limb(0.6, 0, 0, R), armL: limb(-0.4, 0.5, 0, L), armR: limb(-0.45, 0.5, 0, R) }, { rootY: -0.22, rootPitch: 0.28 }));

// --- weapon swings (sword, cane, spear) -----------------------------------------------------
const SLASH_DIAG = swing(24,
  s({ chest: [-0.12, -0.6, 0], armR: limb(0.2, 1.5, 0, R), foreR: limb(1.5, 0, 1.4, R), armL: limb(0.2, 0.8, 0, L) }, { rootYaw: -0.3, rootPitch: -0.08 }),
  s({ chest: [0.25, 0.7, 0], hips: [0, 0.45, 0], armR: limb(1.5, 0.35, 0, R), foreR: limb(0.3, 0, 0.2, R), armL: limb(0.3, 0.5, 0, L) }, { rootYaw: 0.4, rootZ: 0.18, rootPitch: 0.2 }));

const SLASH_RISE = swing(26,
  s({ chest: [0.3, 0.4, 0], armR: limb(-0.6, 0.6, 0, R), foreR: limb(1.4, 0, 0.6, R) }, { rootY: -0.16, rootPitch: 0.28 }),
  s({ chest: [-0.35, -0.3, 0], armR: limb(2.75, 0.3, 0, R), foreR: limb(0.3, 0, 0.5, R) }, { rootY: 0.14, rootPitch: -0.25 }));

const SLASH_SPIN = mk(34, [
  [0, STANCE],
  [8, s({ chest: [0, -0.8, 0], armR: limb(0.3, 1.5, 0, R), foreR: limb(1.2, 0, 0.8, R) }, { rootYaw: -0.9 }), 'out'],
  [18, s({ chest: [0, 0.6, 0], armR: limb(1.3, 1.5, 0, R), foreR: limb(0.2, 0, 0.2, R) }, { rootYaw: 2.4, rootRoll: -0.2 }), 'linear'],
  [24, s({ chest: [0, 0.4, 0], armR: limb(1.2, 1.5, 0, R), foreR: limb(0.2, 0, 0.2, R) }, { rootYaw: 4.5, rootRoll: -0.1 }), 'linear'],
  [34, STANCE, 'inout'],
]);

const THRUST = swing(22,
  s({ chest: [0.05, -0.55, 0], armR: limb(-0.25, 0.35, 0, R), foreR: limb(2.0, 0, -0.6, R) }, { rootY: -0.1 }),
  s({ chest: [0.06, 0.35, 0], armR: limb(1.6, 0.1, 0, R), foreR: limb(0.05, 0, -0.5, R) }, { rootZ: 0.3, rootPitch: 0.1 }));

const SPEAR_THRUST = swing(28,
  s({ chest: [0.05, -0.7, 0], armR: limb(-0.4, 0.5, 0, R), foreR: limb(2.2, 0, -0.4, R), armL: limb(0.6, 0.7, 0, L), foreL: limb(1.3, 0, 0, L) }, { rootY: -0.14, rootYaw: -0.3 }),
  s({ chest: [0.08, 0.4, 0], armR: limb(1.62, 0.08, 0, R), foreR: limb(0.05, 0, -0.4, R), armL: limb(1.2, 0.3, 0, L), foreL: limb(0.6, 0, 0, L) }, { rootZ: 0.45, rootYaw: 0.2 }));

const CLAW_SWIPE = swing(22,
  s({ chest: [0.05, -0.6, 0], armR: limb(0.1, 1.2, 0, R), foreR: limb(1.7, 0, 0.9, R), handR: limb(0.5, 0, 0, R) }, { rootYaw: -0.3 }),
  s({ chest: [0.08, 0.7, 0], hips: [0, 0.4, 0], armR: limb(1.2, 0.9, 0, R), foreR: limb(0.5, 0, 0.6, R), handR: limb(0.3, 0, 0, R) }, { rootYaw: 0.45, rootZ: 0.14 }));

registerClips({
  op_jab_r: JAB_R, op_jab_l: JAB_L, op_hook_r: HOOK_R, op_upper_r: UPPER_R, op_elbow_r: ELBOW_R,
  op_kick_front: KICK_FRONT, op_kick_round: KICK_ROUND, op_kick_axe: KICK_AXE, op_kick_spin: KICK_SPIN,
  op_smash_down: SMASH_DOWN, op_palm_r: PALM_R, op_double_palm: DOUBLE_PALM, op_backhand: BACKHAND,
  op_headbutt: HEADBUTT, op_lariat: LARIAT, op_stomp: STOMP,
  op_slash_diag: SLASH_DIAG, op_slash_rise: SLASH_RISE, op_slash_spin: SLASH_SPIN,
  op_thrust: THRUST, op_spear_thrust: SPEAR_THRUST, op_claw: CLAW_SWIPE,
});

// --------------------------------------------------------------------------- signature skills
/** Luffy: the arm winds far back, then the whole body follows the stretched punch. */
const GUM_PISTOL = mk(34, [
  [0, STANCE],
  [10, s({ chest: [0.05, -0.85, 0], armR: limb(-0.9, 0.5, 0, R), foreR: limb(2.3, 0, 0.4, R), armL: limb(0.9, 0.5, 0, L), foreL: limb(1.2, 0, 0, L) }, { rootY: -0.12, rootYaw: -0.45 }), 'out'],
  [16, s({ chest: [0.1, 0.6, 0], hips: [0, 0.45, 0], armR: limb(1.62, 0.1, 0, R), foreR: limb(0.05, 0, 0.6, R), armL: limb(-0.5, 0.4, 0, L), foreL: limb(1.8, 0, 0, L) }, { rootYaw: 0.3, rootZ: 0.25, rootPitch: 0.12 }), 'in'],
  [24, s({ chest: [0.1, 0.55, 0], armR: limb(1.6, 0.12, 0, R), foreR: limb(0.05, 0, 0.6, R), armL: limb(-0.45, 0.4, 0, L) }, { rootYaw: 0.28, rootZ: 0.2 }), 'linear'],
  [34, STANCE, 'inout'],
]);

const GUM_GATLING = mk(54, [
  [0, STANCE],
  [8, s({ chest: [0.1, -0.4, 0], armR: limb(-0.4, 0.4, 0, R), foreR: limb(2.2, 0, 0, R), armL: limb(-0.4, 0.4, 0, L), foreL: limb(2.2, 0, 0, L) }, { rootPitch: 0.2 }), 'out'],
  [14, s({ chest: [0.1, 0.35, 0], armR: limb(1.65, 0.1, 0, R), foreR: limb(0.1, 0, 0, R), armL: limb(-0.4, 0.4, 0, L), foreL: limb(2.2, 0, 0, L) }, { rootZ: 0.1, rootPitch: 0.18 }), 'in'],
  [20, s({ chest: [0.1, -0.35, 0], armL: limb(1.65, 0.1, 0, L), foreL: limb(0.1, 0, 0, L), armR: limb(-0.4, 0.4, 0, R), foreR: limb(2.2, 0, 0, R) }, { rootZ: 0.14, rootPitch: 0.18 }), 'in'],
  [26, s({ chest: [0.1, 0.35, 0], armR: limb(1.7, 0.12, 0, R), foreR: limb(0.08, 0, 0, R), armL: limb(-0.4, 0.4, 0, L), foreL: limb(2.2, 0, 0, L) }, { rootZ: 0.2, rootPitch: 0.18 }), 'in'],
  [32, s({ chest: [0.1, -0.35, 0], armL: limb(1.7, 0.12, 0, L), foreL: limb(0.08, 0, 0, L), armR: limb(-0.4, 0.4, 0, R), foreR: limb(2.2, 0, 0, R) }, { rootZ: 0.26, rootPitch: 0.18 }), 'in'],
  [38, s({ chest: [0.1, 0.4, 0], armR: limb(1.75, 0.1, 0, R), foreR: limb(0.05, 0, 0, R), armL: limb(1.2, 0.3, 0, L), foreL: limb(0.6, 0, 0, L) }, { rootZ: 0.34, rootPitch: 0.2 }), 'in'],
  [54, STANCE, 'inout'],
]);

const GUM_ELEPHANT = mk(46, [
  [0, STANCE],
  [14, s({ chest: [-0.45, -0.3, 0], head: [-0.35, 0, 0], armR: limb(2.8, 0.7, 0, R), foreR: limb(0.3, 0, 0, R), armL: limb(1.2, 0.8, 0, L), thighR: limb(0.4, 0.2, 0, R), calfR: limb(-0.8, 0, 0, R) }, { rootY: 0.2, rootPitch: -0.35 }), 'out'],
  [22, s({ chest: [0.6, 0.2, 0], head: [0.35, 0, 0], armR: limb(0.5, 0.4, 0, R), foreR: limb(0.2, 0, 0, R), armL: limb(-0.3, 0.5, 0, L), thighL: limb(0.6, 0.2, 0, L), calfL: limb(-1.2, 0, 0, L), thighR: limb(0.55, 0.2, 0, R), calfR: limb(-1.15, 0, 0, R) }, { rootY: -0.34, rootPitch: 0.55, rootZ: 0.2 }), 'in'],
  [30, s({ chest: [0.5, 0.15, 0], armR: limb(0.45, 0.4, 0, R), thighL: limb(0.55, 0.2, 0, L), calfL: limb(-1.1, 0, 0, L) }, { rootY: -0.3, rootPitch: 0.5, rootZ: 0.18 }), 'linear'],
  [46, STANCE, 'inout'],
]);

const GUM_KONG = mk(90, [
  [0, STANCE],
  [18, s({ chest: [0.2, -0.6, 0], armR: limb(-0.8, 0.6, 0, R), foreR: limb(2.4, 0, 0, R), armL: limb(-0.7, 0.6, 0, L), foreL: limb(2.3, 0, 0, L), thighL: limb(0.4, 0.3, 0, L), calfL: limb(-0.9, 0, 0, L) }, { rootY: -0.22, rootPitch: 0.3, rootYaw: -0.3 }), 'out'],
  [34, s({ chest: [0.25, -0.7, 0], armR: limb(-1.0, 0.7, 0, R), foreR: limb(2.5, 0, 0, R), armL: limb(-0.8, 0.65, 0, L) }, { rootY: -0.28, rootPitch: 0.34, rootYaw: -0.4 }), 'inout'],
  [44, s({ chest: [0.1, 0.7, 0], hips: [0, 0.5, 0], armR: limb(1.62, 0.08, 0, R), foreR: limb(0.05, 0, 0.5, R), armL: limb(-0.4, 0.4, 0, L) }, { rootYaw: 0.4, rootZ: 0.5, rootPitch: 0.15 }), 'in'],
  [62, s({ chest: [0.1, 0.65, 0], armR: limb(1.6, 0.1, 0, R), foreR: limb(0.05, 0, 0.5, R) }, { rootYaw: 0.38, rootZ: 0.45 }), 'linear'],
  [90, STANCE, 'inout'],
]);

/** Law: both hands open, the ROOM sphere blooms around him. */
const ROOM_CAST = mk(30, [
  [0, STANCE],
  [10, s({ chest: [-0.1, 0, 0], armR: limb(1.2, 0.9, 0, R), foreR: limb(0.9, 0, 1.2, R), handR: limb(-0.5, 0, 0, R), armL: limb(1.1, 0.85, 0, L), foreL: limb(0.9, 0, 1.2, L), handL: limb(-0.5, 0, 0, L) }, { rootY: 0.03, rootPitch: -0.12 }), 'out'],
  [20, s({ chest: [-0.14, 0, 0], armR: limb(1.35, 1.0, 0, R), foreR: limb(0.8, 0, 1.3, R), armL: limb(1.3, 0.95, 0, L), foreL: limb(0.8, 0, 1.3, L) }, { rootY: 0.05, rootPitch: -0.14 }), 'inout'],
  [30, STANCE, 'inout'],
]);

const SHAMBLES = mk(26, [
  [0, STANCE],
  [6, s({ chest: [0, -0.5, 0], armR: limb(0.9, 0.6, 0, R), foreR: limb(1.4, 0, 1.0, R) }, { rootY: 0.06, rootYaw: -0.5 }), 'out'],
  [12, s({ chest: [0, 0.4, 0], armR: limb(1.0, 0.4, 0, R), foreR: limb(1.2, 0, 0.8, R) }, { rootYaw: 2.2, rootY: 0.04 }), 'linear'],
  [26, STANCE, 'inout'],
]);

const GAMMA_KNIFE = mk(40, [
  [0, STANCE],
  [12, s({ chest: [0.08, -0.5, 0], armR: limb(-0.3, 0.45, 0, R), foreR: limb(2.1, 0, -0.5, R), handR: limb(0, 0, 0, R) }, { rootY: -0.08 }), 'out'],
  [20, s({ chest: [0.06, 0.4, 0], armR: limb(1.6, 0.08, 0, R), foreR: limb(0.05, 0, -0.5, R) }, { rootZ: 0.38, rootPitch: 0.12 }), 'in'],
  [30, s({ chest: [0.06, 0.4, 0], armR: limb(1.58, 0.1, 0, R), foreR: limb(0.08, 0, -0.5, R) }, { rootZ: 0.36 }), 'linear'],
  [40, STANCE, 'inout'],
]);

const TAKT = mk(44, [
  [0, STANCE],
  [12, s({ chest: [-0.2, 0, 0], armR: limb(2.4, 0.5, 0, R), foreR: limb(0.6, 0, 1.0, R), handR: limb(-0.4, 0, 0, R) }, { rootPitch: -0.2 }), 'out'],
  [24, s({ chest: [-0.28, 0, 0], armR: limb(2.9, 0.45, 0, R), foreR: limb(0.3, 0, 1.0, R) }, { rootY: 0.06, rootPitch: -0.28 }), 'inout'],
  [32, s({ chest: [0.4, 0, 0], armR: limb(0.4, 0.4, 0, R), foreR: limb(0.6, 0, 0.6, R) }, { rootY: -0.1, rootPitch: 0.3 }), 'in'],
  [44, STANCE, 'inout'],
]);

/** Sabo / Ace style fire fist: a straight punch that keeps the arm out while the flame runs. */
const FIRE_FIST = mk(40, [
  [0, STANCE],
  [12, s({ chest: [0.06, -0.7, 0], armR: limb(-0.7, 0.45, 0, R), foreR: limb(2.2, 0, 0.3, R), armL: limb(0.7, 0.6, 0, L), foreL: limb(1.4, 0, 0, L), thighR: limb(0.3, 0.2, 0, R), calfR: limb(-0.7, 0, 0, R) }, { rootY: -0.14, rootYaw: -0.4, rootPitch: 0.18 }), 'out'],
  [19, s({ chest: [0.1, 0.55, 0], hips: [0, 0.45, 0], armR: limb(1.62, 0.1, 0, R), foreR: limb(0.05, 0, 0.5, R), armL: limb(-0.45, 0.4, 0, L), foreL: limb(1.7, 0, 0, L) }, { rootYaw: 0.35, rootZ: 0.3, rootPitch: 0.1 }), 'in'],
  [30, s({ chest: [0.1, 0.5, 0], armR: limb(1.6, 0.12, 0, R), foreR: limb(0.08, 0, 0.5, R) }, { rootYaw: 0.3, rootZ: 0.26 }), 'linear'],
  [40, STANCE, 'inout'],
]);

const DRAGON_CLAW = mk(36, [
  [0, STANCE],
  [10, s({ chest: [0.1, -0.7, 0], armR: limb(0.2, 1.3, 0, R), foreR: limb(1.6, 0, 1.0, R), handR: limb(0.6, 0, 0, R), thighL: limb(0.45, 0.25, 0, L), calfL: limb(-0.9, 0, 0, L) }, { rootY: -0.16, rootYaw: -0.35 }), 'out'],
  [17, s({ chest: [0.12, 0.75, 0], hips: [0, 0.5, 0], armR: limb(1.35, 0.8, 0, R), foreR: limb(0.4, 0, 0.7, R), handR: limb(0.4, 0, 0, R) }, { rootYaw: 0.45, rootZ: 0.3 }), 'in'],
  [24, s({ chest: [0.1, 0.5, 0], armR: limb(1.2, 0.7, 0, R), foreR: limb(0.5, 0, 0.6, R) }, { rootYaw: 0.3, rootZ: 0.26 }), 'linear'],
  [36, STANCE, 'inout'],
]);

const FLAME_EMPEROR = mk(80, [
  [0, STANCE],
  [16, s({ chest: [0.3, 0, 0], armR: limb(-0.6, 0.5, 0, R), foreR: limb(1.9, 0, 0.4, R), armL: limb(-0.55, 0.5, 0, L), foreL: limb(1.9, 0, 0.4, L), thighL: limb(0.5, 0.3, 0, L), calfL: limb(-1.0, 0, 0, L), thighR: limb(0.45, 0.28, 0, R), calfR: limb(-0.95, 0, 0, R) }, { rootY: -0.26, rootPitch: 0.3 }), 'out'],
  [32, s({ chest: [-0.3, 0, 0], head: [-0.25, 0, 0], armR: limb(2.7, 0.55, 0, R), foreR: limb(0.35, 0, 0.4, R), armL: limb(2.65, 0.5, 0, L), foreL: limb(0.35, 0, 0.4, L) }, { rootY: 0.22, rootPitch: -0.3 }), 'in'],
  [50, s({ chest: [0.5, 0, 0], armR: limb(0.5, 0.35, 0, R), foreR: limb(0.3, 0, 0.4, R), armL: limb(0.5, 0.35, 0, L), foreL: limb(0.3, 0, 0.4, L) }, { rootY: -0.2, rootPitch: 0.45, rootZ: 0.2 }), 'in'],
  [80, STANCE, 'inout'],
]);

/** Shanks: a single drawn slash — the sword rises high, then falls in one frame. */
const KAMUSARI = mk(70, [
  [0, STANCE],
  [18, s({ chest: [-0.2, -0.5, 0], armR: limb(2.5, 0.8, 0, R), foreR: limb(0.6, 0, 1.2, R), armL: limb(0.6, 0.6, 0, L) }, { rootY: 0.06, rootYaw: -0.35, rootPitch: -0.2 }), 'out'],
  [34, s({ chest: [-0.25, -0.55, 0], armR: limb(2.8, 0.85, 0, R), foreR: limb(0.5, 0, 1.3, R) }, { rootY: 0.1, rootYaw: -0.4, rootPitch: -0.25 }), 'inout'],
  [40, s({ chest: [0.5, 0.5, 0], hips: [0, 0.35, 0], armR: limb(0.35, 0.3, 0, R), foreR: limb(0.35, 0, 0.3, R), armL: limb(-0.2, 0.4, 0, L), thighL: limb(0.6, 0.25, 0, L), calfL: limb(-1.1, 0, 0, L) }, { rootY: -0.28, rootYaw: 0.3, rootPitch: 0.45, rootZ: 0.25 }), 'in'],
  [52, s({ chest: [0.45, 0.45, 0], armR: limb(0.3, 0.3, 0, R), thighL: limb(0.55, 0.25, 0, L), calfL: limb(-1.05, 0, 0, L) }, { rootY: -0.26, rootYaw: 0.28, rootPitch: 0.4, rootZ: 0.22 }), 'linear'],
  [70, STANCE, 'inout'],
]);

const CONQUEROR: PoseClip = mk(50, [
  [0, STANCE],
  [14, s({ chest: [-0.15, 0, 0], head: [-0.3, 0, 0], armR: limb(-0.5, 0.55, 0, R), foreR: limb(1.5, 0, 0.7, R), armL: limb(-0.5, 0.55, 0, L), foreL: limb(1.5, 0, 0.7, L) }, { rootY: -0.06, rootPitch: -0.12 }), 'out'],
  [22, s({ chest: [0.3, 0, 0], head: [0.15, 0, 0], armR: limb(-0.2, 1.1, 0, R), foreR: limb(0.6, 0, 0.3, R), armL: limb(-0.2, 1.1, 0, L), foreL: limb(0.6, 0, 0.3, L), thighL: limb(0.4, 0.3, 0, L), calfL: limb(-0.8, 0, 0, L), thighR: limb(0.38, 0.3, 0, R), calfR: limb(-0.78, 0, 0, R) }, { rootY: -0.2, rootPitch: 0.3 }), 'in'],
  [34, s({ chest: [0.2, 0, 0], armR: limb(-0.15, 1.0, 0, R), armL: limb(-0.15, 1.0, 0, L) }, { rootY: -0.14, rootPitch: 0.2 }), 'linear'],
  [50, STANCE, 'inout'],
]);

/** Katakuri: the arm turns into a mochi spear and shoots forward. */
const MOCHI_TRIDENT = mk(38, [
  [0, STANCE],
  [12, s({ chest: [0.05, -0.6, 0], armR: limb(-0.5, 0.4, 0, R), foreR: limb(2.2, 0, -0.5, R) }, { rootY: -0.1, rootYaw: -0.3 }), 'out'],
  [19, s({ chest: [0.06, 0.4, 0], armR: limb(1.6, 0.06, 0, R), foreR: limb(0.05, 0, -0.5, R) }, { rootZ: 0.4, rootYaw: 0.2, rootPitch: 0.1 }), 'in'],
  [28, s({ chest: [0.06, 0.38, 0], armR: limb(1.58, 0.08, 0, R), foreR: limb(0.06, 0, -0.5, R) }, { rootZ: 0.36 }), 'linear'],
  [38, STANCE, 'inout'],
]);

const MOCHI_RAIN = mk(56, [
  [0, STANCE],
  [14, s({ chest: [-0.25, 0, 0], armR: limb(2.6, 0.6, 0, R), foreR: limb(0.5, 0, 0.6, R), armL: limb(2.55, 0.55, 0, L), foreL: limb(0.5, 0, 0.6, L) }, { rootPitch: -0.22, rootY: 0.05 }), 'out'],
  [26, s({ chest: [-0.3, 0, 0], armR: limb(2.85, 0.5, 0, R), foreR: limb(0.3, 0, 0.6, R), armL: limb(2.8, 0.48, 0, L), foreL: limb(0.3, 0, 0.6, L) }, { rootPitch: -0.26, rootY: 0.08 }), 'inout'],
  [40, s({ chest: [0.25, 0, 0], armR: limb(1.4, 0.3, 0, R), foreR: limb(0.3, 0, 0.6, R), armL: limb(1.35, 0.3, 0, L), foreL: limb(0.3, 0, 0.6, L) }, { rootPitch: 0.2, rootY: -0.08 }), 'in'],
  [56, STANCE, 'inout'],
]);

const FUTURE_SIGHT = mk(34, [
  [0, STANCE],
  [7, s({ chest: [-0.3, 0.3, 0.2], head: [-0.35, 0.2, 0], armL: limb(0.3, 0.9, 0, L), armR: limb(0.2, 0.8, 0, R), thighR: limb(0.3, 0.3, 0, R), calfR: limb(-0.7, 0, 0, R) }, { rootPitch: -0.35, rootRoll: 0.25, rootY: -0.05 }), 'out'],
  [16, s({ chest: [0.15, -0.5, 0], armR: limb(1.6, 0.15, 0, R), foreR: limb(0.15, 0, -0.4, R), armL: limb(-0.3, 0.4, 0, L) }, { rootZ: 0.28, rootYaw: 0.3, rootPitch: 0.15 }), 'in'],
  [24, s({ chest: [0.12, -0.45, 0], armR: limb(1.55, 0.18, 0, R) }, { rootZ: 0.24 }), 'linear'],
  [34, STANCE, 'inout'],
]);

/** Fujitora: the cane comes down and gravity follows it. */
const GRAVITY_PRESS = mk(48, [
  [0, STANCE],
  [16, s({ chest: [-0.3, -0.2, 0], armR: limb(2.7, 0.5, 0, R), foreR: limb(0.5, 0, 1.0, R), armL: limb(1.4, 0.6, 0, L) }, { rootY: 0.1, rootPitch: -0.28 }), 'out'],
  [26, s({ chest: [0.5, 0.15, 0], armR: limb(0.3, 0.35, 0, R), foreR: limb(0.35, 0, 0.4, R), armL: limb(-0.2, 0.4, 0, L), thighL: limb(0.5, 0.25, 0, L), calfL: limb(-1.0, 0, 0, L), thighR: limb(0.48, 0.25, 0, R), calfR: limb(-0.98, 0, 0, R) }, { rootY: -0.3, rootPitch: 0.5 }), 'in'],
  [36, s({ chest: [0.45, 0.12, 0], armR: limb(0.28, 0.35, 0, R), thighL: limb(0.48, 0.25, 0, L), calfL: limb(-0.95, 0, 0, L) }, { rootY: -0.28, rootPitch: 0.45 }), 'linear'],
  [48, STANCE, 'inout'],
]);

const GRAVITY_BLADE = mk(44, [
  [0, STANCE],
  [14, s({ chest: [0.25, 0.4, 0], armR: limb(-0.5, 0.5, 0, R), foreR: limb(1.6, 0, 0.8, R) }, { rootY: -0.12, rootPitch: 0.24 }), 'out'],
  [22, s({ chest: [-0.35, -0.35, 0], armR: limb(2.8, 0.35, 0, R), foreR: limb(0.25, 0, 0.5, R), armL: limb(0.6, 0.5, 0, L) }, { rootY: 0.16, rootPitch: -0.3 }), 'in'],
  [32, s({ chest: [-0.3, -0.3, 0], armR: limb(2.75, 0.35, 0, R) }, { rootY: 0.12, rootPitch: -0.26 }), 'linear'],
  [44, STANCE, 'inout'],
]);

const METEOR_CALL = mk(96, [
  [0, STANCE],
  [18, s({ chest: [-0.3, 0, 0], head: [-0.4, 0, 0], armR: limb(2.8, 0.4, 0, R), foreR: limb(0.3, 0, 0.8, R), armL: limb(2.2, 0.7, 0, L), foreL: limb(0.6, 0, 0.6, L) }, { rootY: 0.1, rootPitch: -0.3 }), 'out'],
  [46, s({ chest: [-0.35, 0, 0], head: [-0.45, 0, 0], armR: limb(3.0, 0.35, 0, R), foreR: limb(0.2, 0, 0.8, R), armL: limb(2.4, 0.65, 0, L) }, { rootY: 0.14, rootPitch: -0.34 }), 'inout'],
  [60, s({ chest: [0.55, 0, 0], armR: limb(0.3, 0.3, 0, R), foreR: limb(0.3, 0, 0.5, R), armL: limb(-0.2, 0.4, 0, L), thighL: limb(0.55, 0.25, 0, L), calfL: limb(-1.1, 0, 0, L) }, { rootY: -0.32, rootPitch: 0.5 }), 'in'],
  [96, STANCE, 'inout'],
]);

/** Kuma: the paw pad presses the air and the shockwave leaves the palm. */
const PAW_PUSH = mk(38, [
  [0, STANCE],
  [12, s({ chest: [0.2, -0.3, 0], armR: limb(-0.3, 0.6, 0, R), foreR: limb(2.2, 0, 1.2, R), handR: limb(-0.5, 0, 0, R) }, { rootY: -0.1, rootPitch: 0.2 }), 'out'],
  [20, s({ chest: [-0.1, 0.2, 0], armR: limb(1.5, 0.25, 0, R), foreR: limb(0.1, 0, 1.3, R), handR: limb(-0.7, 0, 0, R), armL: limb(0.9, 0.4, 0, L), foreL: limb(1.0, 0, 0, L) }, { rootZ: 0.2, rootPitch: -0.06 }), 'in'],
  [30, s({ chest: [-0.08, 0.18, 0], armR: limb(1.48, 0.26, 0, R) }, { rootZ: 0.18 }), 'linear'],
  [38, STANCE, 'inout'],
]);

const URSUS_SHOCK = mk(86, [
  [0, STANCE],
  [20, s({ chest: [-0.2, 0, 0], armR: limb(2.3, 0.9, 0, R), foreR: limb(0.8, 0, 1.2, R), armL: limb(2.3, 0.9, 0, L), foreL: limb(0.8, 0, 1.2, L) }, { rootPitch: -0.18, rootY: 0.04 }), 'out'],
  [42, s({ chest: [-0.24, 0, 0], armR: limb(2.6, 1.0, 0, R), foreR: limb(0.7, 0, 1.3, R), armL: limb(2.6, 1.0, 0, L), foreL: limb(0.7, 0, 1.3, L) }, { rootPitch: -0.2, rootY: 0.06 }), 'inout'],
  [54, s({ chest: [0.35, 0, 0], armR: limb(1.5, 0.15, 0, R), foreR: limb(0.15, 0, 1.3, R), armL: limb(1.5, 0.15, 0, L), foreL: limb(0.15, 0, 1.3, L) }, { rootPitch: 0.22, rootZ: 0.2, rootY: -0.1 }), 'in'],
  [86, STANCE, 'inout'],
]);

/** Burgess: the champion's flying press. */
const POWERBOMB = mk(56, [
  [0, STANCE],
  [12, s({ chest: [0.3, 0, 0], armR: limb(0.9, 0.7, 0, R), foreR: limb(1.6, 0, 0, R), armL: limb(0.9, 0.7, 0, L), foreL: limb(1.6, 0, 0, L), thighL: limb(0.5, 0.3, 0, L), calfL: limb(-1.0, 0, 0, L) }, { rootY: -0.2, rootPitch: 0.3 }), 'out'],
  [24, s({ chest: [-0.3, 0, 0], armR: limb(2.6, 0.7, 0, R), foreR: limb(0.6, 0, 0, R), armL: limb(2.6, 0.7, 0, L), foreL: limb(0.6, 0, 0, L) }, { rootY: 0.25, rootPitch: -0.25 }), 'in'],
  [36, s({ chest: [0.6, 0, 0], armR: limb(0.4, 0.5, 0, R), foreR: limb(0.5, 0, 0, R), armL: limb(0.4, 0.5, 0, L), foreL: limb(0.5, 0, 0, L), thighL: limb(0.7, 0.3, 0, L), calfL: limb(-1.3, 0, 0, L), thighR: limb(0.65, 0.3, 0, R), calfR: limb(-1.25, 0, 0, R) }, { rootY: -0.4, rootPitch: 0.6 }), 'in'],
  [56, STANCE, 'inout'],
]);

const TACKLE = mk(36, [
  [0, STANCE],
  [8, s({ chest: [0.4, 0, 0], head: [-0.3, 0, 0], armR: limb(-0.5, 0.8, 0, R), armL: limb(-0.5, 0.8, 0, L), thighL: limb(0.6, 0.3, 0, L), calfL: limb(-1.2, 0, 0, L) }, { rootY: -0.22, rootPitch: 0.5 }), 'out'],
  [16, s({ chest: [0.5, 0, 0], head: [-0.4, 0, 0], armR: limb(-0.7, 0.9, 0, R), armL: limb(-0.7, 0.9, 0, L), thighR: limb(0.5, 0.25, 0, R), calfR: limb(-0.9, 0, 0, R) }, { rootY: -0.1, rootPitch: 0.75, rootZ: 0.3 }), 'in'],
  [24, s({ chest: [0.45, 0, 0], armR: limb(-0.6, 0.85, 0, R), armL: limb(-0.6, 0.85, 0, L) }, { rootPitch: 0.6, rootZ: 0.2 }), 'linear'],
  [36, STANCE, 'inout'],
]);

/** Shiki: he never lands — the legs sweep, the body floats. */
const SHISHI = mk(40, [
  [0, STANCE],
  [12, s({ chest: [0.1, -0.7, 0], thighR: limb(0.5, 1.1, 0, R), calfR: limb(-1.2, 0, 0, R), armR: limb(0.3, 1.1, 0, R), armL: limb(0.4, 1.0, 0, L) }, { rootY: 0.4, rootYaw: -0.5, rootPitch: 0.2 }), 'out'],
  [20, s({ chest: [0.1, 0.8, 0], thighR: limb(0.9, 1.4, 0, R), calfR: limb(-0.3, 0, 0, R), armR: limb(0.5, 1.3, 0, R), armL: limb(0.9, 1.2, 0, L) }, { rootY: 0.45, rootYaw: 0.7, rootRoll: -0.3 }), 'in'],
  [28, s({ chest: [0.08, 0.6, 0], thighR: limb(0.8, 1.3, 0, R), calfR: limb(-0.4, 0, 0, R) }, { rootY: 0.42, rootYaw: 0.5, rootRoll: -0.2 }), 'linear'],
  [40, s({}, { rootY: 0.34 }), 'inout'],
]);

const LION_THREAT = mk(58, [
  [0, STANCE],
  [16, s({ chest: [-0.2, -0.3, 0], armR: limb(2.5, 0.6, 0, R), foreR: limb(0.5, 0, 1.0, R), handR: limb(-0.4, 0, 0, R), armL: limb(1.0, 0.7, 0, L) }, { rootY: 0.45, rootPitch: -0.2 }), 'out'],
  [30, s({ chest: [-0.25, -0.3, 0], armR: limb(2.85, 0.5, 0, R), foreR: limb(0.35, 0, 1.0, R) }, { rootY: 0.55, rootPitch: -0.24 }), 'inout'],
  [40, s({ chest: [0.35, 0.5, 0], armR: limb(0.8, 0.4, 0, R), foreR: limb(0.5, 0, 0.6, R), armL: limb(0.3, 0.5, 0, L) }, { rootY: 0.4, rootPitch: 0.25, rootYaw: 0.35 }), 'in'],
  [58, s({}, { rootY: 0.34 }), 'inout'],
]);

const AMUDAI = mk(100, [
  [0, STANCE],
  [22, s({ chest: [-0.3, 0, 0], head: [-0.45, 0, 0], armR: limb(2.8, 0.7, 0, R), foreR: limb(0.4, 0, 1.0, R), armL: limb(2.75, 0.7, 0, L), foreL: limb(0.4, 0, 1.0, L) }, { rootY: 0.7, rootPitch: -0.3 }), 'out'],
  [56, s({ chest: [-0.34, 0, 0], head: [-0.5, 0, 0], armR: limb(3.0, 0.65, 0, R), armL: limb(2.95, 0.65, 0, L) }, { rootY: 0.95, rootPitch: -0.34 }), 'inout'],
  [70, s({ chest: [0.5, 0, 0], armR: limb(0.5, 0.4, 0, R), foreR: limb(0.4, 0, 0.6, R), armL: limb(0.5, 0.4, 0, L), foreL: limb(0.4, 0, 0.6, L) }, { rootY: 0.5, rootPitch: 0.4 }), 'in'],
  [100, s({}, { rootY: 0.34 }), 'inout'],
]);

/** Karasu: the body bursts into crows and re-forms. */
const CROW_BURST = mk(40, [
  [0, STANCE],
  [10, s({ chest: [-0.15, 0, 0], armR: limb(1.0, 1.3, 0, R), foreR: limb(0.5, 0, 0.6, R), armL: limb(1.0, 1.3, 0, L), foreL: limb(0.5, 0, 0.6, L) }, { rootY: 0.34, rootPitch: -0.12 }), 'out'],
  [18, s({ chest: [-0.2, 0, 0], armR: limb(1.6, 1.5, 0, R), foreR: limb(0.3, 0, 0.6, R), armL: limb(1.6, 1.5, 0, L), foreL: limb(0.3, 0, 0.6, L) }, { rootY: 0.5, rootPitch: -0.16 }), 'in'],
  [28, s({ chest: [0.2, 0, 0], armR: limb(0.9, 0.8, 0, R), armL: limb(0.9, 0.8, 0, L) }, { rootY: 0.36, rootPitch: 0.1 }), 'inout'],
  [40, s({}, { rootY: 0.3 }), 'inout'],
]);

const CROW_LANCE = mk(34, [
  [0, STANCE],
  [10, s({ chest: [0.05, -0.6, 0], armR: limb(-0.4, 0.5, 0, R), foreR: limb(2.1, 0, 0.4, R) }, { rootY: 0.32, rootYaw: -0.3 }), 'out'],
  [17, s({ chest: [0.06, 0.45, 0], armR: limb(1.6, 0.15, 0, R), foreR: limb(0.1, 0, 0.5, R), armL: limb(-0.3, 0.5, 0, L) }, { rootY: 0.34, rootYaw: 0.3, rootZ: 0.18 }), 'in'],
  [24, s({ chest: [0.06, 0.4, 0], armR: limb(1.58, 0.16, 0, R) }, { rootY: 0.34, rootZ: 0.16 }), 'linear'],
  [34, s({}, { rootY: 0.3 }), 'inout'],
]);

const BLACK_STORM = mk(96, [
  [0, STANCE],
  [22, s({ chest: [-0.2, 0, 0], armR: limb(1.4, 1.4, 0, R), foreR: limb(0.4, 0, 0.6, R), armL: limb(1.4, 1.4, 0, L), foreL: limb(0.4, 0, 0.6, L) }, { rootY: 0.6, rootPitch: -0.18 }), 'out'],
  [52, s({ chest: [-0.24, 0, 0], armR: limb(1.9, 1.5, 0, R), armL: limb(1.9, 1.5, 0, L) }, { rootY: 0.85, rootPitch: -0.2 }), 'inout'],
  [66, s({ chest: [0.3, 0, 0], armR: limb(1.55, 0.2, 0, R), foreR: limb(0.1, 0, 0.5, R), armL: limb(1.55, 0.2, 0, L), foreL: limb(0.1, 0, 0.5, L) }, { rootY: 0.5, rootPitch: 0.2, rootZ: 0.25 }), 'in'],
  [96, s({}, { rootY: 0.3 }), 'inout'],
]);

/** Koby: Marine Rokushiki — finger pistol, moon step, leg blade. */
const SHIGAN = mk(26, [
  [0, STANCE],
  [8, s({ chest: [0.05, -0.55, 0], armR: limb(-0.4, 0.4, 0, R), foreR: limb(2.1, 0, -0.6, R), handR: limb(0.3, 0, 0, R) }, { rootY: -0.08 }), 'out'],
  [13, s({ chest: [0.06, 0.4, 0], armR: limb(1.62, 0.06, 0, R), foreR: limb(0.05, 0, -0.5, R), handR: limb(0.1, 0, 0, R) }, { rootZ: 0.26, rootPitch: 0.1 }), 'in'],
  [18, s({ chest: [0.06, 0.38, 0], armR: limb(1.6, 0.08, 0, R) }, { rootZ: 0.24 }), 'linear'],
  [26, STANCE, 'inout'],
]);

const RANKYAKU = mk(32, [
  [0, STANCE],
  [10, s({ chest: [0.1, -0.4, 0], thighR: limb(1.3, 0.5, 0, R), calfR: limb(-1.4, 0, 0, R), armL: limb(0.8, 0.8, 0, L), armR: limb(-0.3, 0.6, 0, R) }, { rootY: -0.04, rootYaw: -0.2 }), 'out'],
  [17, s({ chest: [0.05, 0.5, 0], thighR: limb(1.75, 0.35, 0, R), calfR: limb(-0.2, 0, 0, R), footR: limb(-0.5, 0, 0, R), armL: limb(1.0, 0.9, 0, L), armR: limb(-0.5, 0.7, 0, R) }, { rootY: 0.08, rootYaw: 0.25, rootPitch: -0.12 }), 'in'],
  [24, s({ chest: [0.05, 0.4, 0], thighR: limb(1.6, 0.35, 0, R), calfR: limb(-0.3, 0, 0, R) }, { rootY: 0.04 }), 'linear'],
  [32, STANCE, 'inout'],
]);

const TEKKAI = mk(44, [
  [0, STANCE],
  [8, s({ chest: [0.1, 0, 0], armR: limb(-0.2, 0.9, 0, R), foreR: limb(1.9, 0, 0.8, R), armL: limb(-0.2, 0.9, 0, L), foreL: limb(1.9, 0, 0.8, L), thighL: limb(0.3, 0.35, 0, L), calfL: limb(-0.7, 0, 0, L), thighR: limb(0.3, 0.35, 0, R), calfR: limb(-0.7, 0, 0, R) }, { rootY: -0.16, rootPitch: 0.1 }), 'out'],
  [30, s({ chest: [0.12, 0, 0], armR: limb(-0.22, 0.92, 0, R), armL: limb(-0.22, 0.92, 0, L) }, { rootY: -0.18, rootPitch: 0.12 }), 'inout'],
  [44, STANCE, 'inout'],
]);

const SORU_STRIKE = mk(30, [
  [0, STANCE],
  [6, s({ chest: [0.3, 0, 0], armR: limb(-0.6, 0.4, 0, R), foreR: limb(2.0, 0, 0, R), thighL: limb(0.6, 0.3, 0, L), calfL: limb(-1.2, 0, 0, L) }, { rootY: -0.2, rootPitch: 0.4 }), 'out'],
  [12, s({ chest: [0.1, 0.5, 0], armR: limb(1.7, 0.1, 0, R), foreR: limb(0.08, 0, 0.3, R), armL: limb(-0.4, 0.4, 0, L) }, { rootZ: 0.4, rootPitch: 0.2, rootYaw: 0.3 }), 'in'],
  [20, s({ chest: [0.08, 0.4, 0], armR: limb(1.65, 0.12, 0, R) }, { rootZ: 0.34 }), 'linear'],
  [30, STANCE, 'inout'],
]);

/** Generic cinematic finisher for fighters whose ultimate is a rush (shared shape). */
const FINISH_RUSH = mk(96, [
  [0, STANCE],
  [16, s({ chest: [0.3, -0.5, 0], armR: limb(-0.8, 0.5, 0, R), foreR: limb(2.3, 0, 0.3, R), armL: limb(0.8, 0.6, 0, L), thighL: limb(0.55, 0.3, 0, L), calfL: limb(-1.1, 0, 0, L) }, { rootY: -0.24, rootPitch: 0.35 }), 'out'],
  [30, s({ chest: [0.1, 0.5, 0], armR: limb(1.65, 0.1, 0, R), foreR: limb(0.08, 0, 0.5, R), armL: limb(-0.4, 0.4, 0, L) }, { rootZ: 0.4, rootYaw: 0.35 }), 'in'],
  [44, s({ chest: [0.1, -0.5, 0], armL: limb(1.65, 0.1, 0, L), foreL: limb(0.08, 0, 0.5, L), armR: limb(-0.4, 0.4, 0, R) }, { rootZ: 0.5, rootYaw: -0.3 }), 'in'],
  [58, s({ chest: [-0.35, 0, 0], armR: limb(2.8, 0.4, 0, R), foreR: limb(0.3, 0, 0.4, R), armL: limb(2.75, 0.4, 0, L), foreL: limb(0.3, 0, 0.4, L) }, { rootY: 0.2, rootPitch: -0.3 }), 'out'],
  [70, s({ chest: [0.6, 0, 0], armR: limb(0.4, 0.35, 0, R), armL: limb(0.4, 0.35, 0, L), thighL: limb(0.6, 0.25, 0, L), calfL: limb(-1.2, 0, 0, L) }, { rootY: -0.34, rootPitch: 0.55, rootZ: 0.2 }), 'in'],
  [96, STANCE, 'inout'],
]);

registerClips({
  op_gum_pistol: GUM_PISTOL, op_gum_gatling: GUM_GATLING, op_gum_elephant: GUM_ELEPHANT, op_gum_kong: GUM_KONG,
  op_room: ROOM_CAST, op_shambles: SHAMBLES, op_gamma: GAMMA_KNIFE, op_takt: TAKT,
  op_fire_fist: FIRE_FIST, op_dragon_claw: DRAGON_CLAW, op_flame_emperor: FLAME_EMPEROR,
  op_kamusari: KAMUSARI, op_conqueror: CONQUEROR,
  op_mochi_trident: MOCHI_TRIDENT, op_mochi_rain: MOCHI_RAIN, op_future_sight: FUTURE_SIGHT,
  op_gravity_press: GRAVITY_PRESS, op_gravity_blade: GRAVITY_BLADE, op_meteor: METEOR_CALL,
  op_paw_push: PAW_PUSH, op_ursus: URSUS_SHOCK,
  op_powerbomb: POWERBOMB, op_tackle: TACKLE,
  op_shishi: SHISHI, op_lion: LION_THREAT, op_amudai: AMUDAI,
  op_crow_burst: CROW_BURST, op_crow_lance: CROW_LANCE, op_black_storm: BLACK_STORM,
  op_shigan: SHIGAN, op_rankyaku: RANKYAKU, op_tekkai: TEKKAI, op_soru: SORU_STRIKE,
  op_finish_rush: FINISH_RUSH,
});

/** Frames of a registered clip (the move data keeps its length in sync with the animation). */
export { OPBR_CLIPS } from './OpbrRig';
