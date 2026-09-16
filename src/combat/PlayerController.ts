/**
 * PlayerController.ts — Kinematic controller: samples input, runs the FSM, integrates velocity,
 * applies gravity (except in flight states), evaluates the cylindrical arena boundary and
 * wall-splat transition, then drives the visual rig.
 */
import * as THREE from 'three';
import { CombatState, GRAVITY, JUMP_GRAVITY_SCALE, KNOCKBACK_STATES } from '../core/Types';
import { Fighter } from './Fighter';
import { CameraBasis, CombatStateMachine } from './CombatStateMachine';
import { ArenaEnvironment } from '../systems/ArenaEnvironment';
import { setFlash } from '../render/Shaders';

const FLIGHT_STATES: ReadonlySet<CombatState> = new Set([
  CombatState.DASH_HOMING,
  CombatState.SPARK_DASH,
  CombatState.WALL_SPLAT,
  CombatState.SUBSTITUTED,
  CombatState.DASH_STARTUP,
  CombatState.DASH_CHARGING,
]);

const WALL_SPLAT_ELIGIBLE: ReadonlySet<CombatState> = new Set([CombatState.TUMBLE, CombatState.LAUNCHED, CombatState.HITSTUN]);

export class PlayerController {
  private scratch = new THREE.Vector3();

  constructor(
    public readonly fighter: Fighter,
    private fsm: CombatStateMachine,
    private arena: ArenaEnvironment,
  ) {}

  tick(tick: number, dt: number, cam: CameraBasis): void {
    const f = this.fighter;
    f.input.tick(tick);
    f.prevPosition.copy(f.position);
    f.prevYaw = f.yaw;

    // Hitstop (HITSTOP_*): the fighter freezes in place — no state advance, no motion, no animation.
    if (f.hitstopFrames > 0) {
      f.hitstopFrames--;
      f.rig.root.position.copy(f.position);
      f.rig.root.rotation.y = f.yaw;
      return;
    }

    // 1-2. State resolution + per-state kinematics
    this.fsm.update(f, dt, cam);

    // 3. Integrate
    const flight = FLIGHT_STATES.has(f.state);
    if (!flight) f.velocity.y += GRAVITY * dt * (f.state === CombatState.JUMPING ? JUMP_GRAVITY_SCALE : 1);
    if (f.state === CombatState.DASH_STARTUP || f.state === CombatState.DASH_CHARGING) {
      // Hover in place vertically while winding up (keeps aerial dashes possible)
      if (f.position.y > f.groundY + 0.02) f.velocity.y = 0;
    }
    f.position.addScaledVector(f.velocity, dt);

    // Terrain following: the floor under the fighter is the stage mesh height, not y = 0.
    const gy = this.arena.groundY(f.position.x, f.position.z, f.position.y);
    f.groundY = gy;
    if (f.position.y <= gy + 0.001) {
      f.position.y = gy;
      if (f.velocity.y < 0) f.velocity.y = 0;
      if (!f.grounded && (f.state === CombatState.JUMPING || f.state === CombatState.NINJA_MOVE || f.state === CombatState.THROW)) {
        // Touchdown: no carried momentum — the run state rebuilds speed from the stick.
        f.velocity.x *= 0.15;
        f.velocity.z *= 0.15;
      }
      f.grounded = true;
      f.doubleJumped = false;
      f.airDashed = false;
      f.airDashFrames = 0;
      f.jumpCount = 0;
    } else {
      f.grounded = false;
    }

    // 6. Stage constraints
    const knock = KNOCKBACK_STATES.has(f.state);
    const res = this.arena.constrain(f.position, f.velocity, knock);
    if (res.splatQualified && WALL_SPLAT_ELIGIBLE.has(f.state)) {
      this.fsm.wallSplat(f, res.normal);
    } else if (res.clamped && knock && f.state !== CombatState.WALL_SPLAT) {
      // Soft wall bump: bleed some speed
      f.velocity.multiplyScalar(0.7);
    }
    if (f.position.y <= f.groundY + 0.001) f.grounded = true;

    // 8. Rig
    // Cloth and hair chains on the One Piece rigs lag behind the body's travel.
    f.rig.opbr?.setTravel(f.velocity);
    f.rig.root.position.copy(f.position);
    f.rig.root.rotation.y = f.yaw;
    f.rig.update(
      {
        state: f.state === CombatState.INTRO && f.stateFrame < f.introDelay ? CombatState.IDLE_NEUTRAL : f.state,
        stateFrame: f.stateFrame,
        moveName: f.currentMove?.name ?? null,
        airDash: f.airDashed && !f.grounded,
        jumpCount: f.jumpCount,
        awakened: f.awakened,
        moveClip: f.currentMove?.clip ?? null,
        moveFrame: f.moveFrame,
        moveTotal: f.currentMove?.totalFrames ?? 0,
        speed: Math.hypot(f.velocity.x, f.velocity.z),
        grounded: f.grounded,
        guardActive: f.state === CombatState.GUARDING,
        charging: f.state === CombatState.DASH_CHARGING,
        moveDir: f.moveDirLocal,
        hitDir: f.lastHitDir,
        throwDir: f.throwDir,
        jumpDir: f.state === CombatState.DODGE || (f.state === CombatState.JUMPING && f.jumpLaunch) ? f.jumpDirLocal : null,
        awInfix: f.def.awClipInfix ?? null,
        // A launched jump keeps its take-off clip through the apex; only falls use the fall loop.
        falling: f.state === CombatState.JUMPING ? !f.jumpLaunch : !f.grounded && f.velocity.y < -0.5,
        framesLeft: f.state === CombatState.KNOCKDOWN ? 34 - f.stateFrame : f.stunFrames,
      },
      dt,
    );

    if (f.flashTimer > 0) {
      f.flashTimer -= dt;
      setFlash(f.rig.visual, f.flashTimer > 0 ? 0.85 : 0);
    }
  }
}
