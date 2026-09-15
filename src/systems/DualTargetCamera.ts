/**
 * DualTargetCamera.ts — Dual-target dynamic midpoint tracking camera.
 *
 *   P_mid    = (P1 + P2)/2 + [0, H_offset, 0]          H_offset = 1.2
 *   d        = ||P1 - P2||
 *   D(d)     = clamp(D_min + k_d * d, D_min, D_max)    D_min=6.0  D_max=16.5  k_d=0.55
 *   H(d)     = clamp(H_min + k_h * d, H_min, H_max)    H_min=1.8  H_max=5.4   k_h=0.22
 *   u_sep    = normalize(P2 - P1)
 *   n_lat    = u_sep x [0,1,0]
 *   v_dir    = cos(theta) * n_lat - sin(theta) * u_sep  theta = 0.26 rad
 *   C_target = P_mid + v_dir * D(d) + [0, H(d), 0]
 *   C_t      = C_target + (C_{t-1} - C_target) * exp(-lambda * dt)   lambda = 10.5
 */
import * as THREE from 'three';
import { ARENA_RADIUS, clamp } from '../core/Types';


/**
 * Blueprint constants, nudged toward the framing observed in the Storm 2 prototype (Xenia
 * session, docs/proto/05): the retail camera sits lower and closer at neutral range so the
 * fighters fill more of the frame, and pulls back faster as they separate.
 */
export const CAMERA_PARAMS = {
  H_OFFSET: 1.2,
  D_MIN: 5.2,
  D_MAX: 16.5,
  K_D: 0.6,
  H_MIN: 1.45,
  H_MAX: 5.4,
  K_H: 0.24,
  THETA_BIAS: 0.26,
  LAMBDA: 10.5,
  LOOK_LAMBDA: 14.0,
  // Storm behind-the-shoulder framing: the camera sits behind and slightly beside the player,
  // pulls back as the fighters separate, and looks at a point weighted toward the enemy.
  BACK_MIN: 2.6,
  BACK_K: 0.2,
  BACK_MAX: 7.0,
  SIDE: 1.15,
  UP_MIN: 1.45,
  UP_K: 0.09,
  UP_MAX: 3.0,
  LOOK_MIX: 0.34,
  LOOK_UP: 1.0,
  FOV_MIN: 42,
  FOV_MAX: 56,
};

const UP = new THREE.Vector3(0, 1, 0);

export class DualTargetCamera {
  readonly camera: THREE.PerspectiveCamera;
  private position = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private initialized = false;

  /** Which side the camera prefers: +1 keeps P1 on the left, -1 flips. Hysteresis avoids flip-flopping. */
  private side = 1;
  private sideLockTimer = 0;

  /** Playable radius of the current stage (set by the game after a stage loads). */
  arenaRadius = ARENA_RADIUS;

  /** Screen shake state. */
  private shakeAmp = 0;
  private shakeTime = 0;

  // scratch
  private pMid = new THREE.Vector3();
  private uSep = new THREE.Vector3();
  private nLat = new THREE.Vector3();
  private vDir = new THREE.Vector3();
  private cTarget = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 400);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  addShake(amp: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  /** Cinematic override: place the camera directly and keep the smoothing state in sync so the
   *  return to gameplay blends instead of popping. */
  override(pos: THREE.Vector3, quat: THREE.Quaternion, fov: number): void {
    this.position.copy(pos);
    this.camera.position.copy(pos);
    this.camera.quaternion.copy(quat);
    this.tmp.set(0, 0, -1).applyQuaternion(quat);
    this.lookAt.copy(pos).addScaledVector(this.tmp, 4);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.initialized = true;
  }

  /** Force the camera to snap to the target on the next update (used on round start / sub). */
  snap(): void {
    this.initialized = false;
  }

  update(p1: THREE.Vector3, p2: THREE.Vector3, dt: number): void {
    const P = CAMERA_PARAMS;

    // Midpoint with chest-height offset
    this.pMid.addVectors(p1, p2).multiplyScalar(0.5);
    this.pMid.y += P.H_OFFSET;

    // Separation
    this.uSep.subVectors(p2, p1);
    const d = this.uSep.length();
    if (d < 1e-4) this.uSep.set(0, 0, 1);
    else this.uSep.divideScalar(d);
    // Flatten to the horizontal plane so vertical juggles don't tip the orbit
    this.uSep.y = 0;
    if (this.uSep.lengthSq() < 1e-6) this.uSep.set(0, 0, 1);
    this.uSep.normalize();

    // Behind-the-shoulder: back along the P1→P2 axis, offset to P1's right so P1 reads on the
    // left of the frame, height rising with distance; look between the two, biased to the enemy.
    const back = clamp(P.BACK_MIN + P.BACK_K * d, P.BACK_MIN, P.BACK_MAX);
    const up = clamp(P.UP_MIN + P.UP_K * d, P.UP_MIN, P.UP_MAX);
    this.nLat.crossVectors(this.uSep, UP).normalize().multiplyScalar(this.side);
    this.cTarget.copy(p1).addScaledVector(this.uSep, -back).addScaledVector(this.nLat, P.SIDE);
    this.cTarget.y = Math.max(p1.y, p2.y) * 0.35 + Math.min(p1.y, p2.y) * 0.65 + up;
    this.pMid.copy(p1).lerp(p2, P.LOOK_MIX);
    this.pMid.y += P.LOOK_UP;

    // Keep the camera inside the arena ceiling/walls with a soft margin so it never clips the cylinder.
    const rxz = Math.hypot(this.cTarget.x, this.cTarget.z);
    const maxR = this.arenaRadius + 6.0;
    if (rxz > maxR) {
      this.cTarget.x *= maxR / rxz;
      this.cTarget.z *= maxR / rxz;
    }
    if (this.cTarget.y < 1.0) this.cTarget.y = 1.0;

    // Side hysteresis: flip only if the camera would end up nearly behind the separation axis for a while.
    this.sideLockTimer = Math.max(0, this.sideLockTimer - dt);

    if (!this.initialized) {
      this.position.copy(this.cTarget);
      this.lookAt.copy(this.pMid);
      this.initialized = true;
    } else {
      // Exponential smoothing: C_t = C_target + (C_{t-1} - C_target) * e^{-lambda dt}
      const k = Math.exp(-P.LAMBDA * dt);
      this.tmp.subVectors(this.position, this.cTarget).multiplyScalar(k);
      this.position.addVectors(this.cTarget, this.tmp);

      const kl = Math.exp(-P.LOOK_LAMBDA * dt);
      this.tmp.subVectors(this.lookAt, this.pMid).multiplyScalar(kl);
      this.lookAt.addVectors(this.pMid, this.tmp);
    }

    // Screen shake (decays quickly)
    this.camera.position.copy(this.position);
    if (this.shakeAmp > 0.001) {
      this.shakeTime += dt * 60;
      const s = this.shakeAmp;
      this.camera.position.x += Math.sin(this.shakeTime * 1.7) * s;
      this.camera.position.y += Math.cos(this.shakeTime * 2.3) * s * 0.6;
      this.camera.position.z += Math.sin(this.shakeTime * 1.1 + 2.0) * s;
      this.shakeAmp *= Math.exp(-9.0 * dt);
    }

    this.camera.lookAt(this.lookAt);

    // Field of view widens slightly as fighters separate, tightening framing in close range.
    const fov = clamp(P.FOV_MIN + d * 0.5, P.FOV_MIN, P.FOV_MAX);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Returns the camera's forward vector projected onto the ground plane (for camera-relative input). */
  groundForward(out: THREE.Vector3): THREE.Vector3 {
    this.camera.getWorldDirection(out);
    out.y = 0;
    if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
    return out.normalize();
  }

  groundRight(out: THREE.Vector3): THREE.Vector3 {
    this.groundForward(out);
    out.crossVectors(out, UP).normalize();
    return out;
  }
}
