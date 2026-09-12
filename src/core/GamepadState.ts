/**
 * GamepadState.ts — Polls the Gamepad API every sample (no reliance on the connect event, which
 * only fires after the page has focus and a button has been pressed). Exposes a Storm-style
 * layout for the standard mapping (DualSense / DualShock / Xbox all report "standard" in Chrome).
 *
 * Standard mapping indices:
 *   0 Cross/A   1 Circle/B   2 Square/X   3 Triangle/Y
 *   4 L1/LB     5 R1/RB      6 L2/LT      7 R2/RT
 *   8 Create/Back  9 Options/Start  10 L3  11 R3  12-15 D-pad U D L R  16 PS/Guide
 */
export const PAD = {
  CROSS: 0,
  CIRCLE: 1,
  SQUARE: 2,
  TRIANGLE: 3,
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  CREATE: 8,
  OPTIONS: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

export interface PadSnapshot {
  connected: boolean;
  id: string;
  buttons: boolean[];
  /** Left stick, y already flipped so up is positive. Radial deadzone applied. */
  lx: number;
  ly: number;
  /** Right stick, y flipped. */
  rx: number;
  ry: number;
}

const DEADZONE = 0.18;

export class GamepadState {
  readonly snap: PadSnapshot = { connected: false, id: '', buttons: new Array(18).fill(false), lx: 0, ly: 0, rx: 0, ry: 0 };
  private prevButtons: boolean[] = new Array(18).fill(false);
  private pressedNow: boolean[] = new Array(18).fill(false);
  /** Short human-readable label for the HUD. */
  label = 'No controller';

  poll(): PadSnapshot {
    const s = this.snap;
    let gp: Gamepad | null = null;
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (p && p.connected) {
          gp = p;
          break;
        }
      }
    }
    if (!gp) {
      if (s.connected) this.label = 'Controller disconnected';
      s.connected = false;
      s.buttons.fill(false);
      s.lx = s.ly = s.rx = s.ry = 0;
      for (let i = 0; i < this.pressedNow.length; i++) this.pressedNow[i] = false;
      return s;
    }
    if (!s.connected || s.id !== gp.id) {
      s.id = gp.id;
      this.label = friendlyName(gp.id, gp.mapping);
    }
    s.connected = true;
    for (let i = 0; i < 18; i++) {
      const b = gp.buttons[i];
      const down = !!b && (b.pressed || b.value > 0.5);
      this.pressedNow[i] = down && !this.prevButtons[i];
      this.prevButtons[i] = down;
      s.buttons[i] = down;
    }
    const [lx, ly] = radialDeadzone(gp.axes[0] ?? 0, -(gp.axes[1] ?? 0));
    const [rx, ry] = radialDeadzone(gp.axes[2] ?? 0, -(gp.axes[3] ?? 0));
    s.lx = lx;
    s.ly = ly;
    s.rx = rx;
    s.ry = ry;
    return s;
  }

  /** True on the frame a button went down (edge), based on the most recent poll(). */
  justPressed(index: number): boolean {
    return this.pressedNow[index];
  }
}

function radialDeadzone(x: number, y: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return [0, 0];
  const scaled = Math.min(1, (m - DEADZONE) / (1 - DEADZONE));
  return [(x / m) * scaled, (y / m) * scaled];
}

function friendlyName(id: string, mapping: string): string {
  const lower = id.toLowerCase();
  let name = 'Controller';
  if (lower.includes('dualsense') || lower.includes('054c') && lower.includes('0ce6')) name = 'PS5 DualSense';
  else if (lower.includes('dualshock') || lower.includes('054c')) name = 'PlayStation controller';
  else if (lower.includes('xbox') || lower.includes('045e')) name = 'Xbox controller';
  else if (id.length) name = id.split('(')[0].trim().slice(0, 28) || 'Controller';
  return mapping === 'standard' ? name : `${name} (non-standard mapping)`;
}
