/**
 * InputManager.ts — 8-frame ring buffer tracking button presses, direction vectors,
 * and buffered action triggers with input priority resolution.
 */
import { InputFlag, InputFrame } from './Types';
import { GamepadState, PAD } from './GamepadState';

export const INPUT_BUFFER_FRAMES = 8;

export interface KeyBinding {
  attack: string[];
  dash: string[];
  jump: string[];
  guard: string[];
  sub: string[];
  jutsu: string[];
  switch: string[];
  up: string[];
  down: string[];
  left: string[];
  right: string[];
}

export const P1_BINDINGS: KeyBinding = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['KeyJ'],
  dash: ['KeyK'],
  jump: ['Space'],
  guard: ['KeyL', 'ShiftLeft'],
  sub: ['KeyI'],
  jutsu: ['KeyU'],
  switch: ['KeyO'],
};

/** Priority resolution: when multiple actions are buffered on the same frame, higher wins. */
const ACTION_PRIORITY: Array<[InputFlag, number]> = [
  [InputFlag.SUB, 100],
  [InputFlag.SWITCH, 90],
  [InputFlag.GUARD, 80],
  [InputFlag.JUTSU, 70],
  [InputFlag.DASH, 60],
  [InputFlag.ATTACK, 50],
  [InputFlag.JUMP, 40],
];

export class InputRingBuffer {
  private frames: InputFrame[] = [];
  private head = 0;

  constructor(public readonly capacity: number = INPUT_BUFFER_FRAMES) {
    for (let i = 0; i < capacity; i++) {
      this.frames.push({ tick: -1, held: 0, pressed: 0, released: 0, moveX: 0, moveY: 0, magnitude: 0 });
    }
  }

  push(frame: InputFrame): void {
    const slot = this.frames[this.head];
    slot.tick = frame.tick;
    slot.held = frame.held;
    slot.pressed = frame.pressed;
    slot.released = frame.released;
    slot.moveX = frame.moveX;
    slot.moveY = frame.moveY;
    slot.magnitude = frame.magnitude;
    this.head = (this.head + 1) % this.capacity;
  }

  /** Most recent frame. */
  get latest(): InputFrame {
    return this.frames[(this.head - 1 + this.capacity) % this.capacity];
  }

  /** Frame `n` steps back in time (0 = latest). */
  at(n: number): InputFrame {
    return this.frames[(this.head - 1 - n + this.capacity * 2) % this.capacity];
  }

  /** True if `flag` was pressed within the last `window` frames (inclusive of the latest frame). */
  wasPressedWithin(flag: InputFlag, window: number = this.capacity): boolean {
    const w = Math.min(window, this.capacity);
    for (let i = 0; i < w; i++) {
      const f = this.at(i);
      if (f.tick < 0) break;
      if (f.pressed & flag) return true;
    }
    return false;
  }

  /** Consume a buffered press so it isn't triggered twice. Returns true if one was found. */
  consume(flag: InputFlag, window: number = this.capacity): boolean {
    const w = Math.min(window, this.capacity);
    for (let i = 0; i < w; i++) {
      const f = this.at(i);
      if (f.tick < 0) break;
      if (f.pressed & flag) {
        f.pressed &= ~flag;
        return true;
      }
    }
    return false;
  }

  /** Drop all buffered presses of a flag (used when a state consumes the buffer). */
  flush(flag: InputFlag): void {
    for (const f of this.frames) f.pressed &= ~flag;
  }

  isHeld(flag: InputFlag): boolean {
    return (this.latest.held & flag) !== 0;
  }

  /** Number of consecutive frames `flag` has been held (capped by buffer capacity). */
  heldFrames(flag: InputFlag): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) {
      const f = this.at(i);
      if (f.tick < 0 || !(f.held & flag)) break;
      n++;
    }
    return n;
  }

  /** Highest priority buffered action, or NONE. */
  resolvePriority(window: number = this.capacity): InputFlag {
    let best = InputFlag.NONE;
    let bestP = -1;
    for (const [flag, p] of ACTION_PRIORITY) {
      if (p > bestP && this.wasPressedWithin(flag, window)) {
        best = flag;
        bestP = p;
      }
    }
    return best;
  }

  clear(): void {
    for (const f of this.frames) {
      f.tick = -1;
      f.held = f.pressed = f.released = 0;
      f.moveX = f.moveY = f.magnitude = 0;
    }
  }
}

/**
 * Abstract input source: something that produces an InputFrame each tick.
 * Keyboard/gamepad for humans, scripted brain for the AI dummy.
 */
export interface InputSource {
  sample(tick: number): InputFrame;
}

export class KeyboardInputSource implements InputSource {
  private down = new Set<string>();
  private prevHeld = 0;
  /** Shared gamepad poller; polled once per sample. */
  readonly pad = new GamepadState();

  constructor(private binding: KeyBinding, target: Window = window) {
    target.addEventListener('keydown', (e) => {
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  private any(codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  sample(tick: number): InputFrame {
    let held = 0;
    const b = this.binding;
    if (this.any(b.attack)) held |= InputFlag.ATTACK;
    if (this.any(b.dash)) held |= InputFlag.DASH | InputFlag.CHAKRA;
    if (this.any(b.jump)) held |= InputFlag.JUMP;
    if (this.any(b.guard)) held |= InputFlag.GUARD;
    if (this.any(b.sub)) held |= InputFlag.SUB;
    if (this.any(b.jutsu)) held |= InputFlag.JUTSU;
    if (this.any(b.switch)) held |= InputFlag.SWITCH;
    if (this.any(b.up)) held |= InputFlag.UP;
    if (this.any(b.down)) held |= InputFlag.DOWN;

    let mx = (this.any(b.right) ? 1 : 0) - (this.any(b.left) ? 1 : 0);
    let my = (this.any(b.up) ? 1 : 0) - (this.any(b.down) ? 1 : 0);

    // Gamepad overlay — Storm-style layout on the standard mapping (PS5 DualSense / Xbox)
    const gp = this.pad.poll();
    if (gp.connected) {
      if (Math.abs(gp.lx) > 0 || Math.abs(gp.ly) > 0) {
        mx = gp.lx;
        my = gp.ly;
      }
      const b = gp.buttons;
      if (b[PAD.CIRCLE]) held |= InputFlag.ATTACK; // Circle / B: attack
      if (b[PAD.CROSS]) held |= InputFlag.JUMP; // Cross / A: jump, ninja move, hollow step
      if (b[PAD.TRIANGLE] || b[PAD.R2]) held |= InputFlag.DASH | InputFlag.CHAKRA; // Triangle / Y (or R2): chakra dash, hold to charge
      if (b[PAD.SQUARE]) held |= InputFlag.JUTSU; // Square / X: jutsu
      if (b[PAD.L2] || b[PAD.L1]) held |= InputFlag.GUARD | InputFlag.SUB; // L2 / L1: guard; the same press during hitstun = substitution
      if (b[PAD.R1] || b[PAD.R3]) held |= InputFlag.SWITCH; // R1 or R3: leader switch
      if (b[PAD.DPAD_UP] || gp.ly > 0.6) held |= InputFlag.UP;
      if (b[PAD.DPAD_DOWN] || gp.ly < -0.6) held |= InputFlag.DOWN;
      // D-pad also moves
      if (mx === 0 && my === 0) {
        mx = (b[PAD.DPAD_RIGHT] ? 1 : 0) - (b[PAD.DPAD_LEFT] ? 1 : 0);
        my = (b[PAD.DPAD_UP] ? 1 : 0) - (b[PAD.DPAD_DOWN] ? 1 : 0);
      }
    }

    let mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
      mag = 1;
    }

    const pressed = held & ~this.prevHeld;
    const released = this.prevHeld & ~held;
    this.prevHeld = held;
    return { tick, held, pressed, released, moveX: mx, moveY: my, magnitude: mag };
  }
}

/** Scriptable source used by the AI dummy. Set fields, then sample() packages them. */
export class ScriptedInputSource implements InputSource {
  held = 0;
  moveX = 0;
  moveY = 0;
  private prevHeld = 0;

  press(flag: InputFlag): void {
    this.held |= flag;
  }
  release(flag: InputFlag): void {
    this.held &= ~flag;
  }
  releaseAll(): void {
    this.held = 0;
    this.moveX = 0;
    this.moveY = 0;
  }

  sample(tick: number): InputFrame {
    let mx = this.moveX;
    let my = this.moveY;
    let mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
      mag = 1;
    }
    const pressed = this.held & ~this.prevHeld;
    const released = this.prevHeld & ~this.held;
    this.prevHeld = this.held;
    return { tick, held: this.held, pressed, released, moveX: mx, moveY: my, magnitude: mag };
  }
}

/** Per-player input manager: samples a source into a ring buffer each tick. */
export class InputManager {
  readonly buffer = new InputRingBuffer(INPUT_BUFFER_FRAMES);
  constructor(public source: InputSource) {}

  tick(t: number): InputFrame {
    const f = this.source.sample(t);
    this.buffer.push(f);
    return f;
  }
}
