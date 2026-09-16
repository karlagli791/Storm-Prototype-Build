/**
 * OpbrRig.ts — animation backend for the One Piece: Fighting Path fighters.
 *
 * Those rips are skinned models on a 3ds Max Biped skeleton and ship **no animation data**
 * (tools/scripts/opbr_import.py keeps every bone and renames the humanoid ones to `OP_*`), so
 * this module animates them procedurally instead of playing clips:
 *
 *   - `bind()` measures the rest skeleton and builds, per bone, the rotation that takes it from
 *     its own rest orientation into a shared "I-pose" space. Poses are therefore authored once
 *     (OpbrPoses.ts) and fit every rig, whatever its bone names or A-pose spread.
 *   - Poses are keyframed `PoseClip`s sampled at 60 Hz with quaternion interpolation and a short
 *     cross-fade between clips.
 *   - Cloth, hair, coat and ribbon chains the rip ships with are kept and driven by a lag/flutter
 *     layer, so the models keep the secondary motion their bones were built for.
 *
 * Character space: +Y up, +Z forward, +X the character's left (measured from the rips: the toe
 * bones point along +Z). Rotations are right-handed, so a negative X rotation swings a limb
 * forward and `limb()` hides the mirroring for the right side.
 */
import * as THREE from 'three';
import { CombatState } from '../core/Types';
import type { PoseContext } from './FighterRig';

export const OPBR_BONE_KEYS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'armL', 'foreL', 'handL',
  'shoulderR', 'armR', 'foreR', 'handR',
  'thighL', 'calfL', 'footL', 'toeL',
  'thighR', 'calfR', 'footR', 'toeR',
  'weapon',
] as const;
export type BoneKey = (typeof OPBR_BONE_KEYS)[number];

const CANON_NAME: Record<BoneKey, string> = {
  hips: 'OP_Hips', spine: 'OP_Spine', chest: 'OP_Chest', neck: 'OP_Neck', head: 'OP_Head',
  shoulderL: 'OP_L_Shoulder', armL: 'OP_L_Arm', foreL: 'OP_L_Fore', handL: 'OP_L_Hand',
  shoulderR: 'OP_R_Shoulder', armR: 'OP_R_Arm', foreR: 'OP_R_Fore', handR: 'OP_R_Hand',
  thighL: 'OP_L_Thigh', calfL: 'OP_L_Calf', footL: 'OP_L_Foot', toeL: 'OP_L_Toe',
  thighR: 'OP_R_Thigh', calfR: 'OP_R_Calf', footR: 'OP_R_Foot', toeR: 'OP_R_Toe',
  weapon: 'OP_Weapon',
};

/** Direction each bone points in the shared I-pose (character space). */
const CANON_DIR: Partial<Record<BoneKey, THREE.Vector3>> = {
  armL: new THREE.Vector3(0, -1, 0), foreL: new THREE.Vector3(0, -1, 0), handL: new THREE.Vector3(0, -1, 0),
  armR: new THREE.Vector3(0, -1, 0), foreR: new THREE.Vector3(0, -1, 0), handR: new THREE.Vector3(0, -1, 0),
  thighL: new THREE.Vector3(0, -1, 0), calfL: new THREE.Vector3(0, -1, 0),
  thighR: new THREE.Vector3(0, -1, 0), calfR: new THREE.Vector3(0, -1, 0),
  footL: new THREE.Vector3(0, -0.35, 1), footR: new THREE.Vector3(0, -0.35, 1),
  shoulderL: new THREE.Vector3(1, 0, 0), shoulderR: new THREE.Vector3(-1, 0, 0),
};

export type Vec3 = [number, number, number];

/** A pose: per-bone rotations in character space, plus whole-body root offsets. */
export interface Pose {
  bones?: Partial<Record<BoneKey, Vec3>>;
  /** Body offsets in metres / radians (rootY is added to the standing height). */
  rootY?: number;
  rootZ?: number;
  rootX?: number;
  rootPitch?: number;
  rootRoll?: number;
  rootYaw?: number;
}

export interface PoseKey {
  /** Frame inside the clip (60 Hz). */
  t: number;
  pose: Pose;
  /** Interpolation into this key: 'snap' holds the previous pose until `t`. */
  ease?: 'linear' | 'in' | 'out' | 'inout' | 'snap';
}

export interface PoseClip {
  frames: number;
  loop?: boolean;
  keys: PoseKey[];
  /** Cross-fade frames when this clip starts (default 5). */
  blend?: number;
}

/** Clip registry — locomotion (OpbrPoses.ts) and every character move (OpbrMoves.ts). */
export const OPBR_CLIPS = new Map<string, PoseClip>();
export function registerClips(clips: Record<string, PoseClip>): void {
  for (const [k, v] of Object.entries(clips)) OPBR_CLIPS.set(k, v);
}

/**
 * Limb rotation helper: `fwd` swings the limb forward, `out` away from the body, `twist` rotates
 * it about its own axis. `side` is +1 for the character's left, -1 for the right.
 */
export function limb(fwd: number, out: number, twist = 0, side: 1 | -1 = 1): Vec3 {
  return [-fwd, twist * side, out * side];
}
/** Mirror of a pose fragment (swaps L/R bones and flips their Y/Z rotations). */
export function mirrorPose(p: Pose): Pose {
  const out: Pose = { ...p, bones: {} };
  for (const [k, v] of Object.entries(p.bones ?? {})) {
    const key = k as BoneKey;
    const flipped = (key.endsWith('L') ? key.slice(0, -1) + 'R' : key.endsWith('R') ? key.slice(0, -1) + 'L' : key) as BoneKey;
    out.bones![flipped] = [v[0], -v[1], -v[2]];
  }
  if (out.rootYaw) out.rootYaw = -out.rootYaw;
  if (out.rootRoll) out.rootRoll = -out.rootRoll;
  if (out.rootX) out.rootX = -out.rootX;
  return out;
}

interface BoundBone {
  node: THREE.Object3D;
  /** Rest world rotation / position / scale of the bone, in character space. */
  worldRest: THREE.Quaternion;
  restPosW: THREE.Vector3;
  restScaleW: THREE.Vector3;
  /** Rotation from the rest orientation into the shared I-pose. */
  zero: THREE.Quaternion;
  /** Per-frame: accumulated authored rotation, the visible rotation and the target transform. */
  eff: THREE.Quaternion;
  vis: THREE.Quaternion;
  wRot: THREE.Quaternion;
  wPos: THREE.Vector3;
}

/**
 * Canonical skeleton used for posing. It is *not* the rip's node hierarchy: several Fighting Path
 * rigs drive their limbs from flat lists of deform bones (`BN_Arm_L01..07` all parented to the
 * clavicle), so the animator composes limb transforms along this logical chain and writes the
 * result back as world transforms.
 */
const CANON_PARENT: Record<BoneKey, BoneKey | null> = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', armL: 'shoulderL', foreL: 'armL', handL: 'foreL',
  shoulderR: 'chest', armR: 'shoulderR', foreR: 'armR', handR: 'foreR',
  thighL: 'hips', calfL: 'thighL', footL: 'calfL', toeL: 'footL',
  thighR: 'hips', calfR: 'thighR', footR: 'calfR', toeR: 'footR',
  weapon: 'handR',
};
/** Parents before children. */
const CANON_ORDER: BoneKey[] = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'armL', 'foreL', 'handL',
  'shoulderR', 'armR', 'foreR', 'handR',
  'thighL', 'calfL', 'footL', 'toeL',
  'thighR', 'calfR', 'footR', 'toeR', 'weapon',
];

interface DynBone {
  node: THREE.Object3D;
  rest: THREE.Quaternion;
  /** Depth inside its chain (0 = root), used for the falloff. */
  depth: number;
  /** Current and target sway, in the bone's parent space. */
  sway: THREE.Vector3;
  vel: THREE.Vector3;
  phase: number;
}

/** Canonical child of each limb bone, used to measure its rest direction. */
const LIMB_CHILD: Partial<Record<BoneKey, BoneKey>> = {
  shoulderL: 'armL', armL: 'foreL', foreL: 'handL',
  shoulderR: 'armR', armR: 'foreR', foreR: 'handR',
  thighL: 'calfL', calfL: 'footL', footL: 'toeL',
  thighR: 'calfR', calfR: 'footR', footR: 'toeR',
};
/** First real bone child, skipping cloth and accessory chains. */
function node_firstBone(o: THREE.Object3D): THREE.Object3D | undefined {
  return o.children.find((c) => (c as THREE.Bone).isBone && !DYN_RE.test(c.name) && !DYN_SKIP.test(c.name));
}

const DYN_RE = /toufa|pifeng|qunbai|piaodai|yixiu|bixiu|tuixiu|xiubai|yaodai|shengzi|huzi|hair|cloak|cloth|skirt|coat|maozi|weijin|feng\d/i;
const DYN_SKIP = /finger|thumb|face|eye|mouth|jaw|brow|weapon/i;

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const IDENTITY = new THREE.Quaternion();
const IDENTITY_MAT = new THREE.Matrix4();

function ease(kind: PoseKey['ease'], t: number): number {
  switch (kind) {
    case 'snap': return t >= 1 ? 1 : 0;
    case 'in': return t * t;
    case 'out': return 1 - (1 - t) * (1 - t);
    case 'inout': return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    default: return t;
  }
}

/** Live pose values, in character space, that the animator writes every frame. */
class PoseBuffer {
  rot = new Map<BoneKey, THREE.Quaternion>();
  rootY = 0; rootZ = 0; rootX = 0; rootPitch = 0; rootRoll = 0; rootYaw = 0;
  constructor() { for (const k of OPBR_BONE_KEYS) this.rot.set(k, new THREE.Quaternion()); }
  reset(): void {
    for (const q of this.rot.values()) q.identity();
    this.rootY = this.rootZ = this.rootX = this.rootPitch = this.rootRoll = this.rootYaw = 0;
  }
  fromPose(p: Pose): void {
    this.reset();
    this.add(p, 1);
  }
  add(p: Pose, w: number): void {
    for (const [k, v] of Object.entries(p.bones ?? {})) {
      const q = this.rot.get(k as BoneKey);
      if (!q) continue;
      _e.set(v[0], v[1], v[2], 'XYZ');
      _q.setFromEuler(_e);
      q.slerp(_q, w);
    }
    this.rootY += (p.rootY ?? 0) * w;
    this.rootZ += (p.rootZ ?? 0) * w;
    this.rootX += (p.rootX ?? 0) * w;
    this.rootPitch += (p.rootPitch ?? 0) * w;
    this.rootRoll += (p.rootRoll ?? 0) * w;
    this.rootYaw += (p.rootYaw ?? 0) * w;
  }
  lerpTo(other: PoseBuffer, t: number): void {
    for (const k of OPBR_BONE_KEYS) this.rot.get(k)!.slerp(other.rot.get(k)!, t);
    this.rootY += (other.rootY - this.rootY) * t;
    this.rootZ += (other.rootZ - this.rootZ) * t;
    this.rootX += (other.rootX - this.rootX) * t;
    this.rootPitch += (other.rootPitch - this.rootPitch) * t;
    this.rootRoll += (other.rootRoll - this.rootRoll) * t;
    this.rootYaw += (other.rootYaw - this.rootYaw) * t;
  }
  copy(other: PoseBuffer): void {
    for (const k of OPBR_BONE_KEYS) this.rot.get(k)!.copy(other.rot.get(k)!);
    this.rootY = other.rootY; this.rootZ = other.rootZ; this.rootX = other.rootX;
    this.rootPitch = other.rootPitch; this.rootRoll = other.rootRoll; this.rootYaw = other.rootYaw;
  }
}

export class OpbrRig {
  readonly bones = new Map<BoneKey, BoundBone>();
  readonly sockets = new Map<string, THREE.Object3D>();
  private dyn: DynBone[] = [];
  private pivot: THREE.Group | null = null;
  private model: THREE.Object3D | null = null;
  private byNode = new Map<THREE.Object3D, BoundBone>();
  private matPool: THREE.Matrix4[] = [];
  private matDepth = 0;
  /** How the weapon bone is handled: left where the rip put it, or carried in the right hand. */
  weaponMode: 'keep' | 'hand' = 'keep';
  /** The prop's other deform bones (`OP_Weapon_1`…): carried rigidly with the main weapon bone. */
  private weaponExtra: BoundBone[] = [];
  private target = new PoseBuffer();
  private current = new PoseBuffer();
  private fade = new PoseBuffer();
  private clipName = '';
  private clipFrame = 0;
  private fadeT = 1;
  private fadeFrames = 5;
  private time = 0;
  /** Set by the fighter each frame: world direction the body is travelling (for cloth lag). */
  readonly travel = new THREE.Vector3();
  bound = false;

  /** Reads the rest skeleton and prepares the pose space. Returns false if the rig is not OPBR. */
  bind(scene: THREE.Object3D, pivot: THREE.Group): boolean {
    this.pivot = pivot;
    scene.updateWorldMatrix(true, true);
    const byName = new Map<string, THREE.Object3D>();
    scene.traverse((o) => byName.set(o.name, o));
    const rootInv = new THREE.Quaternion();
    scene.getWorldQuaternion(rootInv).invert();
    const worldRot = (o: THREE.Object3D): THREE.Quaternion => {
      const q = new THREE.Quaternion();
      o.getWorldQuaternion(q);
      return q.premultiply(rootInv);
    };
    const worldPos = (o: THREE.Object3D): THREE.Vector3 => {
      const v = new THREE.Vector3();
      o.getWorldPosition(v);
      return scene.worldToLocal(v);
    };
    for (const key of OPBR_BONE_KEYS) {
      const node = byName.get(CANON_NAME[key]);
      if (!node) continue;
      const scl = new THREE.Vector3();
      node.getWorldScale(scl);
      const inv = new THREE.Vector3();
      scene.getWorldScale(inv);
      scl.divide(inv);
      this.bones.set(key, {
        node, worldRest: worldRot(node), restPosW: worldPos(node), restScaleW: scl,
        zero: new THREE.Quaternion(), eff: new THREE.Quaternion(), vis: new THREE.Quaternion(),
        wRot: new THREE.Quaternion(), wPos: new THREE.Vector3(),
      });
    }
    // Each limb bone is straightened into the I-pose by the rotation that takes the direction of
    // its *canonical* child (not the first child — that is usually a sleeve or cloth bone) onto
    // the canonical direction. Hands inherit the forearm's straightening.
    for (const [key, childKey] of Object.entries(LIMB_CHILD) as Array<[BoneKey, BoneKey]>) {
      const b = this.bones.get(key);
      const canon = CANON_DIR[key];
      if (!b || !canon) continue;
      let child: THREE.Object3D | undefined = this.bones.get(childKey)?.node;
      if (!child) child = node_firstBone(b.node);
      if (!child) continue;
      const dir = worldPos(child).sub(worldPos(b.node));
      if (dir.lengthSq() > 1e-8) b.zero.setFromUnitVectors(dir.normalize(), canon.clone().normalize());
    }
    for (const [hand, fore] of [['handL', 'foreL'], ['handR', 'foreR']] as Array<[BoneKey, BoneKey]>) {
      const h = this.bones.get(hand);
      const f = this.bones.get(fore);
      if (h && f) h.zero.copy(f.zero);
    }
    this.model = scene;
    for (const b of this.bones.values()) this.byNode.set(b.node, b);
    // A held weapon is skinned across several bones; they all ride with the main one.
    scene.traverse((o) => {
      if (!/^OP_Weapon_\d+$/.test(o.name)) return;
      const scl = new THREE.Vector3();
      o.getWorldScale(scl);
      const inv = new THREE.Vector3();
      scene.getWorldScale(inv);
      const b: BoundBone = {
        node: o, worldRest: worldRot(o), restPosW: worldPos(o), restScaleW: scl.divide(inv),
        zero: new THREE.Quaternion(), eff: new THREE.Quaternion(), vis: new THREE.Quaternion(),
        wRot: new THREE.Quaternion(), wPos: new THREE.Vector3(),
      };
      this.weaponExtra.push(b);
      this.byNode.set(o, b);
    });
    if (!this.bones.has('hips') || !this.bones.has('chest')) return false;

    // Facing: the toe bones point along the character's front. Every rip measured so far faces
    // +Z; a model that does not is flipped here so the engine's forward is always +Z.
    const toe = this.bones.get('toeL') ?? this.bones.get('toeR');
    const foot = this.bones.get('footL') ?? this.bones.get('footR');
    if (toe && foot) {
      const d = worldPos(toe.node).sub(worldPos(foot.node));
      if (d.z < -0.01) pivot.rotation.y = Math.PI;
    }

    // Sockets on the real bones (hitboxes and effects query these by name).
    const set = (name: string, key: BoneKey, fallback?: BoneKey) => {
      const b = this.bones.get(key) ?? (fallback ? this.bones.get(fallback) : undefined);
      if (b) this.sockets.set(name, b.node);
    };
    set('root', 'hips');
    set('chest', 'chest');
    set('head', 'head');
    set('r_hand', 'handR', 'foreR');
    set('l_hand', 'handL', 'foreL');
    set('r_foot', 'footR', 'calfR');
    set('l_foot', 'footL', 'calfL');
    const palmSrc = this.bones.get('handR') ?? this.bones.get('foreR');
    if (palmSrc) {
      const marker = new THREE.Object3D();
      marker.name = 'op_palm_eff';
      marker.position.set(0, -0.12, 0.05);
      palmSrc.node.add(marker);
      this.sockets.set('dmy01_rpalm', marker);
    }
    const weapon = this.bones.get('weapon') ?? this.bones.get('handR');
    if (weapon) {
      this.sockets.set('blade_base', weapon.node);
      const tip = new THREE.Object3D();
      tip.name = 'op_blade_tip';
      tip.position.set(0, -0.9, 0);
      weapon.node.add(tip);
      this.sockets.set('blade_tip', tip);
    }

    // Secondary-motion chains (hair, coat, ribbons) — kept from the rip, driven by lag + flutter.
    const canonNodes = new Set([...this.bones.values()].map((b) => b.node));
    scene.traverse((o) => {
      if (!(o as THREE.Bone).isBone || canonNodes.has(o)) return;
      if (!DYN_RE.test(o.name) || DYN_SKIP.test(o.name)) return;
      let depth = 0;
      for (let p = o.parent; p && depth < 8; p = p.parent) {
        if (DYN_RE.test(p.name)) depth++;
        else break;
      }
      if (this.dyn.length < 64) {
        this.dyn.push({ node: o, rest: o.quaternion.clone(), depth, sway: new THREE.Vector3(), vel: new THREE.Vector3(), phase: Math.random() * Math.PI * 2 });
      }
    });
    this.bound = true;
    return true;
  }

  hasClip(name: string): boolean { return OPBR_CLIPS.has(name); }

  /** Frames in a clip (used by the FSM to time moves against their animation). */
  clipFrames(name: string): number { return OPBR_CLIPS.get(name)?.frames ?? 0; }

  // ------------------------------------------------------------------ playback
  private sample(clip: PoseClip, frame: number, out: PoseBuffer): void {
    const keys = clip.keys;
    if (!keys.length) { out.reset(); return; }
    let f = frame;
    if (clip.loop) f = ((f % clip.frames) + clip.frames) % clip.frames;
    else f = Math.min(f, clip.frames);
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= f) i++;
    const a = keys[i];
    const b = keys[i + 1] ?? (clip.loop ? { ...keys[0], t: clip.frames } : a);
    const span = Math.max(1e-3, b.t - a.t);
    const t = b === a ? 1 : ease(b.ease, Math.min(1, Math.max(0, (f - a.t) / span)));
    out.fromPose(a.pose);
    if (b !== a) {
      const tmp = OpbrRig.scratch;
      tmp.fromPose(b.pose);
      out.lerpTo(tmp, t);
    }
  }
  private static scratch = new PoseBuffer();

  play(name: string, restart = false): void {
    if (name === this.clipName && !restart) return;
    const clip = OPBR_CLIPS.get(name);
    if (!clip) return;
    this.fade.copy(this.current);
    this.fadeT = 0;
    this.fadeFrames = clip.blend ?? 5;
    this.clipName = name;
    this.clipFrame = 0;
  }

  /** Force the playhead (the FSM drives move clips from its own move frame). */
  setFrame(f: number): void { this.clipFrame = f; }

  // --------------------------------------------------------------------- apply
  update(ctx: PoseContext, dt: number): void {
    if (!this.bound || !this.pivot) return;
    this.time += dt;
    const clip = OPBR_CLIPS.get(this.clipName) ?? OPBR_CLIPS.get('idle');
    if (!clip) return;
    this.sample(clip, this.clipFrame, this.target);
    this.clipFrame += dt * 60;
    if (this.fadeT < 1) {
      this.fadeT = Math.min(1, this.fadeT + (dt * 60) / Math.max(1, this.fadeFrames));
      this.current.copy(this.fade);
      this.current.lerpTo(this.target, this.fadeT);
    } else {
      this.current.copy(this.target);
    }
    this.addLayers(ctx);
    this.applyToBones();
    this.applyRoot(ctx);
    this.updateDynamics(dt, ctx);
  }

  /** Breathing, travel lean and head tracking on top of the sampled pose. */
  private addLayers(ctx: PoseContext): void {
    const st = ctx.state;
    const calm = st === CombatState.IDLE_NEUTRAL || st === CombatState.GUARDING || st === CombatState.WIN;
    if (calm) {
      const b = Math.sin(this.time * 2.1) * 0.022;
      this.current.rootY += b * 0.35;
      this.rotAdd('chest', b, 0, 0);
      this.rotAdd('head', -b * 0.6, Math.sin(this.time * 0.8) * 0.05, 0);
    }
    if (st === CombatState.RUNNING || st === CombatState.NINJA_MOVE) {
      this.current.rootPitch += 0.06;
    }
  }

  private rotAdd(key: BoneKey, x: number, y: number, z: number): void {
    const q = this.current.rot.get(key);
    if (!q) return;
    _e.set(x, y, z, 'XYZ');
    q.multiply(_q.setFromEuler(_e));
  }

  /**
   * Writes the pose. Limb transforms are composed along the canonical chain in character space
   * and then converted back into each bone's own parent space, so rigs whose deform bones are not
   * parented to each other animate exactly like the ones that are.
   */
  private applyToBones(): void {
    if (!this.model) return;
    // 1. Target world transform of every canonical bone.
    for (const key of CANON_ORDER) {
      const b = this.bones.get(key);
      if (!b) continue;
      if (key === 'weapon' && this.weaponMode !== 'hand') continue;
      const pk = CANON_PARENT[key];
      const p = pk ? this.bones.get(pk) : null;
      b.eff.copy(p ? p.eff : IDENTITY).multiply(this.current.rot.get(key)!);
      b.vis.copy(b.eff).multiply(b.zero);
      b.wRot.copy(b.vis).multiply(b.worldRest);
      if (!p) {
        b.wPos.copy(b.restPosW);
      } else if (key === 'weapon') {
        // A held weapon rides in the hand rather than at the offset the rip parked it at.
        b.wPos.copy(p.wPos);
      } else {
        b.wPos.copy(_v.copy(b.restPosW).sub(p.restPosW).applyQuaternion(p.vis)).add(p.wPos);
      }
    }
    // 1b. The prop's other bones follow the main weapon bone rigidly, so the sword stays one piece.
    const wp = this.bones.get('weapon');
    if (wp && this.weaponMode === 'hand' && this.weaponExtra.length) {
      _q.copy(wp.wRot).multiply(_q2.copy(wp.worldRest).invert());
      for (const b of this.weaponExtra) {
        b.wRot.copy(_q).multiply(b.worldRest);
        b.wPos.copy(_v.copy(b.restPosW).sub(wp.restPosW).applyQuaternion(_q)).add(wp.wPos);
      }
    }

    // 2. Walk the real hierarchy, converting those world transforms into local ones.
    this.writeNode(this.model, IDENTITY_MAT);
  }

  private writeNode(node: THREE.Object3D, parentWorld: THREE.Matrix4): void {
    const b = this.byNode.get(node);
    const depth = this.matDepth++;
    let world = this.matPool[depth];
    if (!world) { world = new THREE.Matrix4(); this.matPool[depth] = world; }
    const isWeapon = b !== undefined && (b === this.bones.get('weapon') || this.weaponExtra.includes(b));
    if (b && !(isWeapon && this.weaponMode !== 'hand')) {
      world.compose(b.wPos, b.wRot, b.restScaleW);
      _m.copy(parentWorld).invert().multiply(world);
      _m.decompose(node.position, node.quaternion, node.scale);
    } else {
      node.updateMatrix();
      world = world.multiplyMatrices(parentWorld, node.matrix);
    }
    // Skinned meshes carry no useful transform, but the armature node between the model root and
    // the skeleton is a plain Object3D — skipping non-bones here would stop the walk at once.
    for (const c of node.children) if (!(c as THREE.Mesh).isMesh) this.writeNode(c, world);
    this.matDepth--;
  }

  private applyRoot(ctx: PoseContext): void {
    const p = this.pivot!;
    const flip = Math.abs(p.rotation.y - Math.PI) < 0.01 ? Math.PI : 0;
    p.position.set(this.current.rootX, this.current.rootY, this.current.rootZ);
    p.rotation.set(this.current.rootPitch, flip + this.current.rootYaw, this.current.rootRoll, 'YXZ');
    void ctx;
  }

  /** Cloth / hair chains: lag behind the body's travel, with a slow flutter on top. */
  private updateDynamics(dt: number, ctx: PoseContext): void {
    if (!this.dyn.length) return;
    const speed = Math.min(2.2, ctx.speed * 0.09);
    // Travel is in world space; convert to character space (the pivot's frame).
    _v.copy(this.travel);
    const p = this.pivot!;
    p.updateWorldMatrix(true, false);
    _m.copy(p.matrixWorld).invert();
    _v.transformDirection(_m);
    const airborne = !ctx.grounded ? 1.6 : 1;
    for (const d of this.dyn) {
      const falloff = 1 / (1 + d.depth * 0.55);
      // Target sway: pushed opposite the travel direction, plus a flutter.
      const flutter = Math.sin(this.time * (3.4 + d.depth * 0.6) + d.phase) * (0.035 + speed * 0.05);
      _v2.set(-_v.x * speed * 0.35, 0, -_v.z * speed * 0.35);
      const tx = (_v2.z + flutter) * falloff * airborne;
      const tz = (-_v2.x + flutter * 0.6) * falloff * airborne;
      d.vel.x += (tx - d.sway.x) * 34 * dt;
      d.vel.z += (tz - d.sway.z) * 34 * dt;
      d.vel.multiplyScalar(Math.max(0, 1 - 9 * dt));
      d.sway.x += d.vel.x * dt;
      d.sway.z += d.vel.z * dt;
      _e.set(d.sway.x, 0, d.sway.z, 'XYZ');
      d.node.quaternion.copy(d.rest).multiply(_q2.setFromEuler(_e));
    }
  }

  /** Smear direction is applied by FighterRig; the rig only needs the travel vector for cloth. */
  setTravel(v: THREE.Vector3): void { this.travel.copy(v); }
}
