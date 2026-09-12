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

export const CAMERA_PARAMS = {
  H_OFFSET: 1.2,
  D_MIN: 6.0,
  D_MAX: 16.5,
  K_D: 0.55,
  H_MIN: 1.8,
  H_MAX: 5.4,
  K_H: 0.22,
  THETA_BIAS: 0.26,
  LAMBDA: 10.5,
  LOOK_LAMBDA: 14.0,
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

    const D = clamp(P.D_MIN + P.K_D * d, P.D_MIN, P.D_MAX);
    const H = clamp(P.H_MIN + P.K_H * d, P.H_MIN, P.H_MAX);

    // Lateral normal and azimuth-biased view direction
    this.nLat.crossVectors(this.uSep, UP).normalize().multiplyScalar(this.side);
    this.vDir
      .copy(this.nLat)
      .multiplyScalar(Math.cos(P.THETA_BIAS))
      .addScaledVector(this.uSep, -Math.sin(P.THETA_BIAS));

    this.cTarget.copy(this.pMid).addScaledVector(this.vDir, D);
    this.cTarget.y += H;

    // Keep the camera inside the arena ceiling/walls with a soft margin so it never clips the cylinder.
    const rxz = Math.hypot(this.cTarget.x, this.cTarget.z);
    const maxR = ARENA_RADIUS + 6.0;
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
    const fov = clamp(46 + d * 0.35, 46, 58);
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
