// ─── Drive input ────────────────────────────────────────────
// Merges held keys (KeyboardEvent.code) and a polled gamepad (standard
// mapping) into one set of controls. Levels only: the caller turns camera,
// reset and horn into presses.

export interface DriveInput {
  throttle: number;
  brake: number;
  /** -1 left … 1 right. */
  steer: number;
  handbrake: boolean;
  boost: boolean;
  horn: boolean;
  camera: boolean;
  reset: boolean;
  /** Use the attack you're holding. */
  fire: boolean;
}

export interface GamepadLike {
  buttons: readonly { value: number; pressed: boolean }[];
  axes: readonly number[];
}

export const STICK_DEADZONE = 0.15;
export const TRIGGER_DEADZONE = 0.05;

// Standard gamepad buttons.
const A = 0;
const B = 1;
const X = 2;
const Y = 3;
const RB = 5;
const LT = 6;
const RT = 7;
const START = 9;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Rescales past the deadzone so the output still spans 0…1. */
export function deadzone(v: number, dz: number): number {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return (Math.sign(v) * (a - dz)) / (1 - dz);
}

const any = (keys: ReadonlySet<string>, ...codes: string[]) => codes.some((c) => keys.has(c));

export function readInput(keys: ReadonlySet<string>, pad: GamepadLike | null): DriveInput {
  const kb: DriveInput = {
    throttle: any(keys, "KeyW", "ArrowUp") ? 1 : 0,
    brake: any(keys, "KeyS", "ArrowDown") ? 1 : 0,
    steer: (any(keys, "KeyD", "ArrowRight") ? 1 : 0) - (any(keys, "KeyA", "ArrowLeft") ? 1 : 0),
    handbrake: keys.has("Space"),
    boost: any(keys, "ShiftLeft", "ShiftRight"),
    horn: keys.has("KeyH"),
    camera: keys.has("KeyC"),
    reset: keys.has("KeyR"),
    fire: keys.has("KeyF"),
  };
  if (!pad) return kb;

  const btn = (i: number) => pad.buttons[i];
  const pressed = (i: number) => !!btn(i)?.pressed;
  const stickX = deadzone(pad.axes[0] ?? 0, STICK_DEADZONE);
  let throttle: number;
  let brake: number;
  if (btn(RT) && btn(LT)) {
    throttle = deadzone(clamp01(btn(RT)!.value), TRIGGER_DEADZONE);
    brake = deadzone(clamp01(btn(LT)!.value), TRIGGER_DEADZONE);
  } else {
    // No triggers: the left stick's vertical axis drives (up is negative).
    const stickY = deadzone(pad.axes[1] ?? 0, STICK_DEADZONE);
    throttle = clamp01(-stickY);
    brake = clamp01(stickY);
  }

  return {
    throttle: Math.max(kb.throttle, throttle),
    brake: Math.max(kb.brake, brake),
    steer: Math.max(-1, Math.min(1, kb.steer + stickX)),
    handbrake: kb.handbrake || pressed(A),
    boost: kb.boost || pressed(X),
    horn: kb.horn || pressed(B),
    camera: kb.camera || pressed(Y),
    reset: kb.reset || pressed(START),
    fire: kb.fire || pressed(RB),
  };
}
