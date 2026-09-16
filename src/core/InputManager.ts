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
  throw: string[];
  charge: string[];
  support: string[];
  support2: string[];
  ultimate: string[];
  /** One Piece palette: four skills, the finisher, Armament Haki and the Observation step. */
  skill1: string[];
  skill2: string[];
  skill3: string[];
  skill4: string[];
  haki: string[];
  step: string[];
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
  throw: ['KeyH'],
  charge: ['KeyN'],
  support: ['KeyY'],
  support2: ['KeyT'],
  ultimate: ['KeyM', 'Digit5'],
  skill1: ['Digit1'],
  skill2: ['Digit2'],
  skill3: ['Digit3'],
  skill4: ['Digit4'],
  haki: ['KeyR'],
  step: ['KeyF'],
};

/** Second player on the keyboard: arrows + numpad cluster (used in 2P mode when no second pad). */
export const P2_BINDINGS: KeyBinding = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  attack: ['Numpad1'],
  dash: ['Numpad2'],
  jump: ['Numpad0'],
  guard: ['Numpad3', 'ShiftRight'],
  sub: ['NumpadDecimal'],
  jutsu: ['Numpad4'],
  switch: ['Numpad8'],
  throw: ['Numpad5'],
  charge: ['Numpad6'],
  support: ['Numpad7'],
  support2: ['Numpad9'],
  ultimate: ['NumpadEnter', 'NumpadAdd', 'KeyB'],
  skill1: ['KeyZ'],
  skill2: ['KeyX'],
  skill3: ['KeyC'],
  skill4: ['KeyV'],
  haki: ['KeyG'],
  step: ['KeyQ'],
};
/** 1P bindings without the arrow keys (2P keyboard mode). */
export const P1_BINDINGS_WASD: KeyBinding = { ...P1_BINDINGS, up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'] };

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
  readonly pad: GamepadState;
  /**
   * One Piece control layout. The Storm scheme keeps the face buttons for attack / jump /
   * chakra; these fighters instead read L1 + face button as their four skills, R1 + ○ as the
   * finisher, R1 + △ as Armament Haki and a bare R1 tap as the Observation step.
   */
  opbrMode = false;

  /** Keys pressed since the last sample: a tap shorter than one sim step still registers. */
  private latched = new Set<string>();

  constructor(private binding: KeyBinding, target: Window = window, padIndex = 0) {
    this.pad = new GamepadState(padIndex);
    target.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.latched.add(e.code);
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  private any(codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c) || this.latched.has(c)) return true;
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
    if (this.any(b.throw)) held |= InputFlag.THROW;
    if (this.any(b.charge)) held |= InputFlag.CHARGE;
    if (this.any(b.support)) held |= InputFlag.SUPPORT;
    if (this.any(b.support2)) held |= InputFlag.SUPPORT2;
    if (this.any(b.ultimate)) held |= InputFlag.ULTIMATE;
    if (this.any(b.skill1)) held |= InputFlag.SKILL1;
    if (this.any(b.skill2)) held |= InputFlag.SKILL2;
    if (this.any(b.skill3)) held |= InputFlag.SKILL3;
    if (this.any(b.skill4)) held |= InputFlag.SKILL4;
    if (this.any(b.haki)) held |= InputFlag.HAKI;
    if (this.any(b.step)) held |= InputFlag.STEP;
    if (this.any(b.up)) held |= InputFlag.UP;
    if (this.any(b.down)) held |= InputFlag.DOWN;

    let mx = (this.any(b.right) ? 1 : 0) - (this.any(b.left) ? 1 : 0);
    let my = (this.any(b.up) ? 1 : 0) - (this.any(b.down) ? 1 : 0);

    this.latched.clear();

    // Gamepad overlay — Storm-style layout on the standard mapping (PS5 DualSense / Xbox)
    const gp = this.pad.poll();
    if (gp.connected) {
      if (Math.abs(gp.lx) > 0 || Math.abs(gp.ly) > 0) {
        mx = gp.lx;
        my = gp.ly;
      }
      const b = gp.buttons;
      // Authentic Storm layout: Triangle is the chakra button — alone it charges, with Cross it
      // chakra-dashes, with Circle it fires the jutsu. R2 is a plain dash button for convenience.
      const tri = b[PAD.TRIANGLE];
      if (b[PAD.CIRCLE]) held |= tri ? InputFlag.JUTSU : InputFlag.ATTACK; // Circle: attack / Triangle+Circle: jutsu
      if (b[PAD.CROSS]) held |= tri ? InputFlag.DASH | InputFlag.CHAKRA : InputFlag.JUMP; // Cross: jump / Triangle+Cross: chakra dash
      if (tri && !b[PAD.CROSS] && !b[PAD.CIRCLE]) held |= InputFlag.CHARGE; // Triangle alone: chakra charge
      if (b[PAD.R2]) held |= InputFlag.DASH | InputFlag.CHAKRA; // R2: chakra dash (hold to charge)
      if (b[PAD.SQUARE]) held |= InputFlag.THROW; // Square: shuriken (PL_ACT_PRJ)
      if (b[PAD.L2]) held |= InputFlag.GUARD | InputFlag.SUB; // L2: guard; the same press during hitstun = substitution
      if (b[PAD.L1]) held |= InputFlag.SUPPORT; // L1: call support 1 (PL_ACT_SUP_COMBO_JOIN)
      if (b[PAD.R1]) held |= InputFlag.SUPPORT2; // R1: call support 2
      if (b[PAD.R3]) held |= InputFlag.SWITCH; // R3: leader switch
      if (this.opbrMode && (b[PAD.L1] || b[PAD.R1])) {
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
