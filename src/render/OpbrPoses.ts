/**
 * OpbrPoses.ts — the shared locomotion and reaction animation set for the One Piece fighters.
 *
 * Every clip is keyframed in the rig-agnostic pose space set up by OpbrRig: limbs start pointing
 * straight down, `limb(forward, outward, twist, side)` rotates them, and the body offsets
 * (rootY / rootPitch / …) move the whole fighter. Frames are 60 Hz.
 */
import { CombatState } from '../core/Types';
import type { PoseContext } from './FighterRig';
import { BoneKey, Pose, PoseClip, Vec3, limb, registerClips } from './OpbrRig';

type Bones = Partial<Record<BoneKey, Vec3>>;
/** Pose literal: bone rotations plus optional body offsets. */
export function P(bones: Bones, root: Omit<Pose, 'bones'> = {}): Pose {
  return { bones, ...root };
}
const L = 1 as const;
const R = -1 as const;

/** Relaxed fighting stance, the base every locomotion clip is built from. */
export const STANCE: Pose = P({
  hips: [0, 0.14, 0],
  spine: [0.03, -0.06, 0],
  chest: [0.04, -0.08, 0],
  neck: [-0.03, 0.04, 0],
  head: [0, 0.06, 0],
  shoulderL: [0, 0, -0.06],
  shoulderR: [0, 0, 0.06],
  armL: limb(0.18, 0.2, 0, L), foreL: limb(1.0, 0, 0.2, L), handL: limb(0.15, 0, 0, L),
  armR: limb(0.3, 0.16, 0, R), foreR: limb(1.15, 0, 0.25, R), handR: limb(0.2, 0, 0, R),
  thighL: limb(0.06, 0.13, 0, L), calfL: limb(-0.3, 0, 0, L), footL: limb(0.24, 0, 0, L),
  thighR: limb(-0.04, 0.12, 0, R), calfR: limb(-0.26, 0, 0, R), footR: limb(0.2, 0, 0, R),
}, { rootY: -0.035 });

/** Merge pose fragments (later ones win per bone). */
export function blend(...poses: Pose[]): Pose {
  const bones: Bones = {};
  const root: Omit<Pose, 'bones'> = {};
  for (const p of poses) {
    Object.assign(bones, p.bones);
    for (const k of ['rootY', 'rootZ', 'rootX', 'rootPitch', 'rootRoll', 'rootYaw'] as const) {
      if (p[k] !== undefined) (root as Record<string, number>)[k] = p[k]!;
    }
  }
  return { bones, ...root };
}

// ---------------------------------------------------------------------------- locomotion
/**
 * Run cycle, built the way a hand-keyed one is: a *contact* pose with the lead heel down and the
 * support leg nearly straight, and a *pass* pose where the support leg carries the body up and the
 * swing leg folds through. `s` = +1 leads with the left leg.
 */
function contact(s: 1 | -1): Pose {
  const lead = s > 0 ? 1 : -1;
  const fwdL = lead > 0 ? 0.62 : -0.5;
  const fwdR = lead > 0 ? -0.5 : 0.62;
  return blend(STANCE, P({
    hips: [0, 0.12 * lead, 0],
    spine: [0.05, -0.08 * lead, 0],
    chest: [0.1, -0.18 * lead, 0],
    head: [-0.12, 0.1 * lead, 0],
    armL: limb(lead > 0 ? -0.65 : 0.75, 0.16, 0, L), foreL: limb(1.25, 0, 0.3, L),
    armR: limb(lead > 0 ? 0.75 : -0.65, 0.16, 0, R), foreR: limb(1.25, 0, 0.3, R),
    thighL: limb(fwdL, 0.08, 0, L), calfL: limb(lead > 0 ? -0.22 : -0.62, 0, 0, L), footL: limb(lead > 0 ? 0.12 : -0.32, 0, 0, L),
    thighR: limb(fwdR, 0.08, 0, R), calfR: limb(lead > 0 ? -0.62 : -0.22, 0, 0, R), footR: limb(lead > 0 ? -0.32 : 0.12, 0, 0, R),
  }, { rootY: -0.01, rootPitch: 0.22 }));
}

function passing(s: 1 | -1): Pose {
  const lead = s > 0 ? 1 : -1; // the leg that was forward is now the support leg
  return blend(STANCE, P({
    hips: [0, 0.05 * lead, 0],
    chest: [0.12, -0.08 * lead, 0],
    head: [-0.14, 0.05 * lead, 0],
    armL: limb(lead > 0 ? -0.2 : 0.25, 0.14, 0, L), foreL: limb(1.35, 0, 0.3, L),
    armR: limb(lead > 0 ? 0.25 : -0.2, 0.14, 0, R), foreR: limb(1.35, 0, 0.3, R),
    thighL: limb(lead > 0 ? 0.04 : 0.8, 0.07, 0, L), calfL: limb(lead > 0 ? -0.2 : -1.5, 0, 0, L), footL: limb(lead > 0 ? 0.08 : -0.15, 0, 0, L),
    thighR: limb(lead > 0 ? 0.8 : 0.04, 0.07, 0, R), calfR: limb(lead > 0 ? -1.5 : -0.2, 0, 0, R), footR: limb(lead > 0 ? -0.15 : 0.08, 0, 0, R),
  }, { rootY: 0.07, rootPitch: 0.2 }));
}

const RUN: PoseClip = {
  frames: 22, loop: true, blend: 4,
  keys: [
    { t: 0, pose: contact(1) },
    { t: 5, pose: passing(1), ease: 'out' },
    { t: 11, pose: contact(-1), ease: 'inout' },
    { t: 16, pose: passing(-1), ease: 'out' },
  ],
};

/** The walk is the same cycle with smaller steps, less lean and no float. */
function soften(p: Pose, k: number): Pose {
  const bones: Record<string, Vec3> = {};
  for (const [key, v] of Object.entries(p.bones ?? {})) bones[key] = [v[0] * k, v[1] * k, v[2] * k] as Vec3;
  return { bones: bones as Pose['bones'], rootY: (p.rootY ?? 0) * k * 0.6, rootPitch: (p.rootPitch ?? 0) * 0.5 };
}

const WALK: PoseClip = {
  frames: 36, loop: true, blend: 5,
  keys: [
    { t: 0, pose: blend(STANCE, soften(contact(1), 0.55)) },
    { t: 9, pose: blend(STANCE, soften(passing(1), 0.55)), ease: 'inout' },
    { t: 18, pose: blend(STANCE, soften(contact(-1), 0.55)), ease: 'inout' },
    { t: 27, pose: blend(STANCE, soften(passing(-1), 0.55)), ease: 'inout' },
  ],
};

const IDLE: PoseClip = {
  frames: 96, loop: true, blend: 8,
  keys: [
    { t: 0, pose: STANCE },
    { t: 32, pose: blend(STANCE, P({ chest: [0.07, -0.1, 0], armR: limb(0.36, 0.18, 0, R) }, { rootY: -0.055 })), ease: 'inout' },
    { t: 64, pose: blend(STANCE, P({ chest: [0.02, -0.06, 0.02], head: [0.02, 0.1, 0] })), ease: 'inout' },
  ],
};

const GUARD: PoseClip = {
  frames: 60, loop: true, blend: 4,
  keys: [
    {
      t: 0,
      pose: blend(STANCE, P({
        hips: [0, 0.3, 0], chest: [0.16, -0.2, 0], head: [0.08, 0.16, 0],
        armL: limb(0.95, 0.5, 0, L), foreL: limb(1.9, 0, 0.5, L),
        armR: limb(1.05, 0.45, 0, R), foreR: limb(2.0, 0, 0.5, R),
        thighL: limb(0.2, 0.2, 0, L), calfL: limb(-0.6, 0, 0, L),
        thighR: limb(0.05, 0.18, 0, R), calfR: limb(-0.5, 0, 0, R),
      }, { rootY: -0.1, rootPitch: 0.12 })),
    },
    { t: 30, pose: blend(STANCE, P({
      hips: [0, 0.3, 0], chest: [0.18, -0.2, 0], head: [0.08, 0.16, 0],
      armL: limb(0.98, 0.52, 0, L), foreL: limb(1.95, 0, 0.5, L),
      armR: limb(1.08, 0.47, 0, R), foreR: limb(2.05, 0, 0.5, R),
      thighL: limb(0.22, 0.2, 0, L), calfL: limb(-0.62, 0, 0, L),
      thighR: limb(0.07, 0.18, 0, R), calfR: limb(-0.52, 0, 0, R),
    }, { rootY: -0.12, rootPitch: 0.13 })), ease: 'inout' },
  ],
};

const JUMP_UP: PoseClip = {
  frames: 26, blend: 3,
  keys: [
    { t: 0, pose: blend(STANCE, P({ thighL: limb(0.7, 0.14, 0, L), calfL: limb(-1.3, 0, 0, L), thighR: limb(0.6, 0.12, 0, R), calfR: limb(-1.2, 0, 0, R), armL: limb(-0.5, 0.2, 0, L), armR: limb(-0.5, 0.2, 0, R) }, { rootY: -0.22, rootPitch: 0.3 })) },
    { t: 6, pose: blend(STANCE, P({ thighL: limb(0.25, 0.1, 0, L), calfL: limb(-0.3, 0, 0, L), thighR: limb(0.15, 0.1, 0, R), calfR: limb(-0.25, 0, 0, R), armL: limb(1.9, 0.45, 0, L), foreL: limb(0.5, 0, 0, L), armR: limb(1.9, 0.4, 0, R), foreR: limb(0.5, 0, 0, R) }, { rootY: 0.04, rootPitch: -0.06 })), ease: 'out' },
    { t: 26, pose: blend(STANCE, P({ thighL: limb(0.85, 0.16, 0, L), calfL: limb(-1.5, 0, 0, L), thighR: limb(0.2, 0.12, 0, R), calfR: limb(-0.5, 0, 0, R), armL: limb(1.1, 0.7, 0, L), foreL: limb(0.9, 0, 0, L), armR: limb(0.6, 0.6, 0, R), foreR: limb(0.8, 0, 0, R) }, { rootPitch: 0.05 })), ease: 'inout' },
  ],
};

const FALL: PoseClip = {
  frames: 40, loop: true, blend: 6,
  keys: [
    { t: 0, pose: blend(STANCE, P({ thighL: limb(0.55, 0.18, 0, L), calfL: limb(-0.9, 0, 0, L), thighR: limb(0.1, 0.16, 0, R), calfR: limb(-0.7, 0, 0, R), armL: limb(0.6, 0.85, 0, L), foreL: limb(0.7, 0, 0, L), armR: limb(0.5, 0.8, 0, R), foreR: limb(0.7, 0, 0, R), chest: [-0.08, 0, 0] }, { rootPitch: -0.05 })) },
    { t: 20, pose: blend(STANCE, P({ thighL: limb(0.6, 0.2, 0, L), calfL: limb(-1.0, 0, 0, L), thighR: limb(0.16, 0.18, 0, R), calfR: limb(-0.75, 0, 0, R), armL: limb(0.7, 0.9, 0, L), foreL: limb(0.75, 0, 0, L), armR: limb(0.6, 0.85, 0, R), foreR: limb(0.75, 0, 0, R), chest: [-0.1, 0, 0] }, { rootPitch: -0.03 })), ease: 'inout' },
  ],
};

const LAND: PoseClip = {
  frames: 16, blend: 3,
  keys: [
    { t: 0, pose: blend(STANCE, P({ thighL: limb(0.85, 0.2, 0, L), calfL: limb(-1.5, 0, 0, L), thighR: limb(0.8, 0.2, 0, R), calfR: limb(-1.45, 0, 0, R), armL: limb(-0.3, 0.6, 0, L), armR: limb(-0.3, 0.55, 0, R), chest: [0.3, 0, 0] }, { rootY: -0.3, rootPitch: 0.35 })) },
    { t: 16, pose: STANCE, ease: 'out' },
  ],
};

const DASH: PoseClip = {
  frames: 30, loop: true, blend: 4,
  keys: [
    { t: 0, pose: P({
      hips: [0, 0.05, 0], chest: [0.1, 0, 0], head: [-0.5, 0, 0],
      armL: limb(2.5, 0.25, 0, L), foreL: limb(0.25, 0, 0, L),
      armR: limb(2.4, 0.25, 0, R), foreR: limb(0.3, 0, 0, R),
      thighL: limb(-0.25, 0.1, 0, L), calfL: limb(-0.4, 0, 0, L), footL: limb(-0.3, 0, 0, L),
      thighR: limb(-0.15, 0.1, 0, R), calfR: limb(-0.8, 0, 0, R), footR: limb(-0.3, 0, 0, R),
    }, { rootPitch: 1.1, rootY: 0.22 }) },
    { t: 15, pose: P({
      hips: [0, -0.05, 0], chest: [0.1, 0, 0], head: [-0.5, 0, 0],
      armL: limb(2.45, 0.3, 0, L), foreL: limb(0.3, 0, 0, L),
      armR: limb(2.5, 0.2, 0, R), foreR: limb(0.25, 0, 0, R),
      thighL: limb(-0.15, 0.1, 0, L), calfL: limb(-0.8, 0, 0, L), footL: limb(-0.3, 0, 0, L),
      thighR: limb(-0.25, 0.1, 0, R), calfR: limb(-0.4, 0, 0, R), footR: limb(-0.3, 0, 0, R),
    }, { rootPitch: 1.1, rootY: 0.22 }), ease: 'inout' },
  ],
};

const DASH_START: PoseClip = {
  frames: 10, blend: 2,
  keys: [
    { t: 0, pose: blend(STANCE, P({ thighL: limb(0.7, 0.16, 0, L), calfL: limb(-1.35, 0, 0, L), thighR: limb(0.55, 0.15, 0, R), calfR: limb(-1.2, 0, 0, R), armL: limb(-0.6, 0.3, 0, L), foreL: limb(1.4, 0, 0, L), armR: limb(-0.55, 0.28, 0, R), foreR: limb(1.4, 0, 0, R) }, { rootY: -0.26, rootPitch: 0.5 })) },
    { t: 10, pose: blend(STANCE, P({ thighL: limb(0.4, 0.14, 0, L), calfL: limb(-0.9, 0, 0, L), armL: limb(1.2, 0.3, 0, L), armR: limb(1.1, 0.3, 0, R) }, { rootY: -0.1, rootPitch: 0.7 })), ease: 'in' },
  ],
};

/** Struck from the front: head snaps back, body folds. */
function hitPose(dirX: number, dirZ: number, k: number): Pose {
  return blend(STANCE, P({
    hips: [0.25 * k * dirZ, 0.2 * dirX * k, 0.25 * dirX * k],
    chest: [0.35 * k * dirZ, 0.1 * dirX * k, 0.2 * dirX * k],
    head: [0.4 * k * dirZ, 0.2 * dirX * k, 0],
    armL: limb(-0.5 * k, 0.55 * k + 0.2, 0, L), foreL: limb(1.1, 0, 0, L),
    armR: limb(-0.45 * k, 0.5 * k + 0.16, 0, R), foreR: limb(1.2, 0, 0, R),
    thighL: limb(0.25 * k, 0.16, 0, L), calfL: limb(-0.5, 0, 0, L),
    thighR: limb(-0.1 * k, 0.14, 0, R), calfR: limb(-0.4, 0, 0, R),
  }, { rootY: -0.08 * k, rootPitch: 0.3 * k * dirZ, rootRoll: 0.12 * dirX * k }));
}

const hitClip = (dirX: number, dirZ: number): PoseClip => ({
  frames: 26, blend: 2,
  keys: [
    { t: 0, pose: hitPose(dirX, dirZ, 1) },
    { t: 8, pose: hitPose(dirX, dirZ, 0.75), ease: 'out' },
    { t: 26, pose: STANCE, ease: 'inout' },
  ],
});

const LAUNCH: PoseClip = {
  frames: 40, loop: true, blend: 3,
  keys: [
    { t: 0, pose: P({
      chest: [-0.3, 0, 0], head: [-0.25, 0, 0],
      armL: limb(-1.1, 1.0, 0, L), armR: limb(-1.05, 0.95, 0, R),
      thighL: limb(0.55, 0.2, 0, L), calfL: limb(-0.7, 0, 0, L),
      thighR: limb(0.2, 0.18, 0, R), calfR: limb(-0.4, 0, 0, R),
    }, { rootPitch: -0.5, rootY: 0.05 }) },
    { t: 20, pose: P({
      chest: [-0.35, 0, 0], head: [-0.3, 0, 0],
      armL: limb(-1.2, 1.1, 0, L), armR: limb(-1.15, 1.0, 0, R),
      thighL: limb(0.7, 0.2, 0, L), calfL: limb(-0.9, 0, 0, L),
      thighR: limb(0.3, 0.18, 0, R), calfR: limb(-0.55, 0, 0, R),
    }, { rootPitch: -0.62, rootY: 0.05 }), ease: 'inout' },
  ],
};

const TUMBLE: PoseClip = {
  frames: 30, loop: true, blend: 3,
  keys: [
    { t: 0, pose: P({ chest: [-0.2, 0, 0], armL: limb(-1.3, 1.2, 0, L), armR: limb(-1.25, 1.15, 0, R), thighL: limb(0.9, 0.2, 0, L), calfL: limb(-1.1, 0, 0, L), thighR: limb(0.5, 0.2, 0, R), calfR: limb(-0.8, 0, 0, R) }, { rootPitch: -0.9, rootY: 0.1 }) },
    { t: 15, pose: P({ chest: [-0.2, 0, 0], armL: limb(-1.3, 1.2, 0, L), armR: limb(-1.25, 1.15, 0, R), thighL: limb(0.9, 0.2, 0, L), calfL: limb(-1.1, 0, 0, L), thighR: limb(0.5, 0.2, 0, R), calfR: limb(-0.8, 0, 0, R) }, { rootPitch: -3.0, rootY: 0.1 }), ease: 'linear' },
  ],
};

const CRUMPLE: PoseClip = {
  frames: 30, blend: 3,
  keys: [
    { t: 0, pose: hitPose(0, 1, 1) },
    { t: 16, pose: P({
      hips: [0.4, 0, 0], chest: [0.6, 0, 0], head: [0.5, 0, 0],
      armL: limb(-0.2, 0.3, 0, L), foreL: limb(0.6, 0, 0, L),
      armR: limb(-0.15, 0.28, 0, R), foreR: limb(0.6, 0, 0, R),
      thighL: limb(1.5, 0.3, 0, L), calfL: limb(-2.3, 0, 0, L), footL: limb(0.5, 0, 0, L),
      thighR: limb(1.45, 0.28, 0, R), calfR: limb(-2.25, 0, 0, R), footR: limb(0.5, 0, 0, R),
    }, { rootY: -0.55, rootPitch: 0.5 }), ease: 'in' },
    { t: 30, pose: P({
      hips: [0.45, 0, 0], chest: [0.65, 0, 0], head: [0.55, 0, 0],
      armL: limb(-0.25, 0.32, 0, L), armR: limb(-0.2, 0.3, 0, R),
      thighL: limb(1.55, 0.3, 0, L), calfL: limb(-2.35, 0, 0, L),
      thighR: limb(1.5, 0.28, 0, R), calfR: limb(-2.3, 0, 0, R),
    }, { rootY: -0.6, rootPitch: 0.55 }), ease: 'inout' },
  ],
};

const KNOCKDOWN: PoseClip = {
  frames: 34, blend: 3,
  keys: [
    { t: 0, pose: P({ chest: [-0.2, 0, 0], armL: limb(-1.2, 1.1, 0, L), armR: limb(-1.15, 1.05, 0, R), thighL: limb(0.7, 0.2, 0, L), calfL: limb(-0.8, 0, 0, L), thighR: limb(0.4, 0.2, 0, R) }, { rootPitch: -0.9, rootY: 0.2 }) },
    { t: 10, pose: P({
      chest: [-0.1, 0, 0], head: [0.2, 0, 0],
      armL: limb(-0.9, 1.2, 0, L), armR: limb(-0.85, 1.15, 0, R),
      thighL: limb(0.35, 0.25, 0, L), calfL: limb(-0.45, 0, 0, L),
      thighR: limb(0.2, 0.22, 0, R), calfR: limb(-0.3, 0, 0, R),
    }, { rootPitch: -1.45, rootY: -0.62, rootZ: -0.25 }), ease: 'in' },
    { t: 34, pose: P({
      chest: [-0.05, 0, 0], head: [0.25, 0, 0],
      armL: limb(-0.8, 1.25, 0, L), armR: limb(-0.75, 1.2, 0, R),
      thighL: limb(0.3, 0.25, 0, L), thighR: limb(0.18, 0.22, 0, R),
    }, { rootPitch: -1.5, rootY: -0.66, rootZ: -0.3 }), ease: 'inout' },
  ],
};

const WALL: PoseClip = {
  frames: 24, blend: 2,
  keys: [
    { t: 0, pose: P({
      chest: [-0.35, 0, 0], head: [-0.4, 0, 0],
      armL: limb(-1.5, 1.35, 0, L), armR: limb(-1.45, 1.3, 0, R),
      thighL: limb(0.5, 0.35, 0, L), calfL: limb(-0.9, 0, 0, L),
      thighR: limb(0.35, 0.3, 0, R), calfR: limb(-0.75, 0, 0, R),
    }, { rootPitch: -0.35, rootY: 0.05 }) },
    { t: 24, pose: P({
      chest: [-0.3, 0, 0], head: [-0.3, 0, 0],
      armL: limb(-1.3, 1.25, 0, L), armR: limb(-1.25, 1.2, 0, R),
      thighL: limb(0.7, 0.3, 0, L), calfL: limb(-1.1, 0, 0, L),
      thighR: limb(0.5, 0.28, 0, R), calfR: limb(-0.9, 0, 0, R),
    }, { rootPitch: -0.2 }), ease: 'inout' },
  ],
};

/** Haki charge: fists clenched at the sides, body braced. */
const CHARGE: PoseClip = {
  frames: 40, loop: true, blend: 4,
  keys: [
    { t: 0, pose: blend(STANCE, P({
      hips: [0.05, 0, 0], chest: [0.12, 0, 0], head: [-0.12, 0, 0],
      armL: limb(-0.45, 0.5, 0, L), foreL: limb(1.5, 0, 0.6, L),
      armR: limb(-0.45, 0.5, 0, R), foreR: limb(1.5, 0, 0.6, R),
      thighL: limb(0.32, 0.26, 0, L), calfL: limb(-0.7, 0, 0, L),
      thighR: limb(0.3, 0.25, 0, R), calfR: limb(-0.68, 0, 0, R),
    }, { rootY: -0.16, rootPitch: 0.18 })) },
    { t: 20, pose: blend(STANCE, P({
      hips: [0.06, 0, 0], chest: [0.16, 0, 0], head: [-0.16, 0, 0],
      armL: limb(-0.5, 0.56, 0, L), foreL: limb(1.56, 0, 0.62, L),
      armR: limb(-0.5, 0.56, 0, R), foreR: limb(1.56, 0, 0.62, R),
      thighL: limb(0.36, 0.28, 0, L), calfL: limb(-0.76, 0, 0, L),
      thighR: limb(0.34, 0.27, 0, R), calfR: limb(-0.74, 0, 0, R),
    }, { rootY: -0.2, rootPitch: 0.2 })), ease: 'inout' },
  ],
};

/** Observation-Haki sidestep (their dodge). */
const DODGE: PoseClip = {
  frames: 24, blend: 2,
  keys: [
    { t: 0, pose: blend(STANCE, P({ chest: [0.2, 0.4, 0.3], armL: limb(0.4, 0.9, 0, L), armR: limb(0.2, 0.5, 0, R), thighL: limb(0.5, 0.5, 0, L), calfL: limb(-1.1, 0, 0, L) }, { rootY: -0.18, rootRoll: 0.35, rootYaw: 0.35 })) },
    { t: 9, pose: blend(STANCE, P({ chest: [0.28, 0.5, 0.45], armL: limb(0.7, 1.2, 0, L), armR: limb(0.35, 0.7, 0, R), thighL: limb(0.9, 0.7, 0, L), calfL: limb(-1.4, 0, 0, L), thighR: limb(-0.3, 0.3, 0, R) }, { rootY: -0.12, rootRoll: 0.5, rootYaw: 0.5 })), ease: 'out' },
    { t: 24, pose: STANCE, ease: 'inout' },
  ],
};

const THROW: PoseClip = {
  frames: 22, blend: 2,
  keys: [
    { t: 0, pose: blend(STANCE, P({ chest: [0, -0.4, 0], armR: limb(-0.8, 0.4, 0, R), foreR: limb(2.1, 0, 0, R) })) },
    { t: 7, pose: blend(STANCE, P({ chest: [0.1, 0.35, 0], armR: limb(1.9, 0.25, 0, R), foreR: limb(0.35, 0, 0, R), armL: limb(0.6, 0.4, 0, L) }, { rootPitch: 0.16 })), ease: 'out' },
    { t: 22, pose: STANCE, ease: 'inout' },
  ],
};

const WIN: PoseClip = {
  frames: 110, blend: 8,
  keys: [
    { t: 0, pose: STANCE },
    { t: 18, pose: blend(STANCE, P({ chest: [-0.1, 0.1, 0], head: [-0.18, 0, 0], armR: limb(2.6, 0.5, 0, R), foreR: limb(0.5, 0, 0, R), armL: limb(-0.3, 0.35, 0, L), foreL: limb(1.2, 0, 0, L) }, { rootY: 0.02 })), ease: 'out' },
    { t: 48, pose: blend(STANCE, P({ chest: [-0.05, 0.14, 0], head: [-0.1, 0.05, 0], armR: limb(2.45, 0.45, 0, R), foreR: limb(0.6, 0, 0, R), armL: limb(-0.25, 0.3, 0, L), foreL: limb(1.3, 0, 0, L) })), ease: 'inout' },
    { t: 110, pose: blend(STANCE, P({ chest: [-0.08, 0.12, 0], armR: limb(2.5, 0.48, 0, R), foreR: limb(0.55, 0, 0, R), armL: limb(-0.28, 0.32, 0, L), foreL: limb(1.25, 0, 0, L) })), ease: 'inout' },
  ],
};

const INTRO: PoseClip = {
  frames: 150, blend: 6,
  keys: [
    { t: 0, pose: blend(STANCE, P({ chest: [0.1, -0.5, 0], head: [0.05, -0.4, 0], armL: limb(-0.1, 0.1, 0, L), armR: limb(-0.1, 0.1, 0, R) }, { rootYaw: -0.7 })) },
    { t: 40, pose: blend(STANCE, P({ chest: [-0.05, 0.1, 0], head: [-0.1, 0.05, 0], armR: limb(-0.55, 0.45, 0, R), foreR: limb(1.8, 0, 0.8, R), armL: limb(-0.4, 0.4, 0, L), foreL: limb(1.6, 0, 0.7, L) }, { rootYaw: 0 })), ease: 'inout' },
    { t: 70, pose: blend(STANCE, P({ chest: [0.06, 0, 0], armR: limb(-0.5, 0.5, 0, R), foreR: limb(1.7, 0, 0.7, R), armL: limb(-0.35, 0.42, 0, L), foreL: limb(1.55, 0, 0.6, L) }, { rootY: -0.06 })), ease: 'out' },
    { t: 150, pose: STANCE, ease: 'inout' },
  ],
};

/** Flight stance for the fighters who never touch the ground (Shiki, Karasu). */
const FLOAT_IDLE: PoseClip = {
  frames: 120, loop: true, blend: 8,
  keys: [
    { t: 0, pose: P({
      hips: [0, 0.1, 0], chest: [-0.05, -0.08, 0], head: [0.05, 0.06, 0],
      armL: limb(0.15, 0.55, 0, L), foreL: limb(0.7, 0, 0.3, L),
      armR: limb(0.2, 0.5, 0, R), foreR: limb(0.8, 0, 0.3, R),
      thighL: limb(0.35, 0.22, 0, L), calfL: limb(-0.75, 0, 0, L), footL: limb(-0.35, 0, 0, L),
      thighR: limb(0.25, 0.2, 0, R), calfR: limb(-0.6, 0, 0, R), footR: limb(-0.3, 0, 0, R),
    }, { rootY: 0.28 }) },
    { t: 60, pose: P({
      hips: [0, 0.12, 0], chest: [-0.02, -0.06, 0], head: [0.02, 0.08, 0],
      armL: limb(0.2, 0.62, 0, L), foreL: limb(0.75, 0, 0.3, L),
      armR: limb(0.25, 0.56, 0, R), foreR: limb(0.85, 0, 0.3, R),
      thighL: limb(0.4, 0.24, 0, L), calfL: limb(-0.8, 0, 0, L), footL: limb(-0.4, 0, 0, L),
      thighR: limb(0.3, 0.22, 0, R), calfR: limb(-0.65, 0, 0, R), footR: limb(-0.35, 0, 0, R),
    }, { rootY: 0.42 }), ease: 'inout' },
  ],
};

const FLOAT_MOVE: PoseClip = {
  frames: 60, loop: true, blend: 6,
  keys: [
    { t: 0, pose: P({
      chest: [0.2, 0, 0], head: [-0.2, 0, 0],
      armL: limb(-0.4, 0.75, 0, L), foreL: limb(0.5, 0, 0, L),
      armR: limb(-0.35, 0.7, 0, R), foreR: limb(0.55, 0, 0, R),
      thighL: limb(0.15, 0.2, 0, L), calfL: limb(-0.5, 0, 0, L), footL: limb(-0.5, 0, 0, L),
      thighR: limb(0.05, 0.18, 0, R), calfR: limb(-0.4, 0, 0, R), footR: limb(-0.45, 0, 0, R),
    }, { rootY: 0.32, rootPitch: 0.28 }) },
    { t: 30, pose: P({
      chest: [0.24, 0, 0], head: [-0.22, 0, 0],
      armL: limb(-0.45, 0.8, 0, L), foreL: limb(0.55, 0, 0, L),
      armR: limb(-0.4, 0.74, 0, R), foreR: limb(0.6, 0, 0, R),
      thighL: limb(0.2, 0.2, 0, L), calfL: limb(-0.55, 0, 0, L), footL: limb(-0.5, 0, 0, L),
      thighR: limb(0.08, 0.18, 0, R), calfR: limb(-0.45, 0, 0, R), footR: limb(-0.45, 0, 0, R),
    }, { rootY: 0.4, rootPitch: 0.3 }), ease: 'inout' },
  ],
};

registerClips({
  idle: IDLE, run: RUN, walk: WALK, guard: GUARD, jump_up: JUMP_UP, fall: FALL, land: LAND,
  dash: DASH, dash_start: DASH_START, charge: CHARGE, dodge: DODGE, throw: THROW, win: WIN, intro: INTRO,
  hit_f: hitClip(0, 1), hit_b: hitClip(0, -1), hit_l: hitClip(1, 0.4), hit_r: hitClip(-1, 0.4),
  launch: LAUNCH, tumble: TUMBLE, crumple: CRUMPLE, knockdown: KNOCKDOWN, wall: WALL,
  float_idle: FLOAT_IDLE, float_move: FLOAT_MOVE,
});

/** Which locomotion clip a fighter state maps to (move clips come from the move data). */
export function opbrClipFor(ctx: PoseContext, float: boolean): { name: string; frame?: number } {
  const st = ctx.state;
  if (ctx.moveClip && ctx.moveClip.startsWith('op:')) {
    return { name: ctx.moveClip.slice(3), frame: ctx.moveFrame };
  }
  switch (st) {
    case CombatState.RUNNING:
    case CombatState.NINJA_MOVE:
      if (float) return { name: 'float_move' };
      return { name: ctx.speed > 6 ? 'run' : 'walk' };
    case CombatState.HOLLOW_STEP:
      return { name: float ? 'float_move' : 'run' };
    case CombatState.JUMPING:
      if (float) return { name: 'float_move' };
      return { name: ctx.falling ? 'fall' : 'jump_up', frame: ctx.falling ? undefined : ctx.stateFrame };
    case CombatState.DASH_STARTUP:
    case CombatState.DASH_CHARGING:
      return { name: 'dash_start', frame: ctx.stateFrame };
    case CombatState.DASH_HOMING:
    case CombatState.SPARK_DASH:
      return { name: 'dash' };
    case CombatState.DASH_IMPACT:
    case CombatState.DASH_REBOUND:
    case CombatState.DASH_CLASH:
      return { name: 'land', frame: ctx.stateFrame };
    case CombatState.GUARDING:
    case CombatState.GUARD_COUNTER:
      return { name: 'guard' };
    case CombatState.BLOCKSTUN:
      return { name: 'guard' };
    case CombatState.GUARD_BREAK:
      return { name: 'hit_f', frame: Math.min(8, ctx.stateFrame) };
    case CombatState.HITSTUN:
      return { name: `hit_${ctx.hitDir.toLowerCase()}`, frame: ctx.stateFrame };
    case CombatState.LAUNCHED:
      return { name: 'launch' };
    case CombatState.TUMBLE:
      return { name: 'tumble' };
    case CombatState.CRUMPLE:
      return { name: 'crumple', frame: ctx.stateFrame };
    case CombatState.KNOCKDOWN:
    case CombatState.DEAD:
      return { name: 'knockdown', frame: ctx.stateFrame };
    case CombatState.WALL_SPLAT:
      return { name: 'wall', frame: ctx.stateFrame };
    case CombatState.CHAKRA_CHARGE:
    case CombatState.AWAKEN:
      return { name: 'charge' };
    case CombatState.DODGE:
      return { name: 'dodge', frame: ctx.stateFrame };
    case CombatState.THROW:
      return { name: 'throw', frame: ctx.stateFrame };
    case CombatState.SUPPORT_ACT:
      // Assists run in without their own clip data: a running strike reads correctly.
      return { name: ctx.stateFrame < 16 ? 'run' : 'op_jab_r', frame: ctx.stateFrame < 16 ? undefined : ctx.stateFrame - 16 };
    case CombatState.WIN:
      return { name: 'win', frame: ctx.stateFrame };
    case CombatState.INTRO:
      return { name: 'intro', frame: ctx.stateFrame };
    default:
      return { name: float ? 'float_idle' : 'idle' };
  }
}
