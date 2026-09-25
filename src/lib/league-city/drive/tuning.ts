// ─── Drive tuning ───────────────────────────────────────────
// Every handling number in one place. Physics runs in meters; the city is in
// units (1 unit = 0.4 m, so a lot is 19 m). Tune by driving, starting from the
// spec's values. The car is Kenney's sedan scaled to a compact sedan (3.4 m
// long, 2 m wide), so the wheel radius follows the model (0.4 m).

export const UNIT_TO_M = 0.4;
export const M_TO_UNIT = 1 / UNIT_TO_M;

/** Kenney model units → meters (model is 2.55 long). */
export const MODEL_TO_M = 1.32;

export const GRAVITY = -14.7;

export const CHASSIS = {
  mass: 1000,
  /** Collider half extents (x, y, z), meters. */
  half: [0.9, 0.35, 1.6] as [number, number, number],
  /** Collider center above the body origin (the ground under the car at rest). */
  colliderY: 0.85,
  /** Center of mass, low for anti-flip. */
  comY: 0.45,
  linearDamping: 0.05,
  angularDamping: 0.6,
};

export const WHEEL = {
  radius: 0.4,
  /** Half track and half wheelbase, meters. */
  halfTrack: 0.56,
  halfBase: 0.87,
  /** Suspension hard point height above the body origin. */
  connectionY: 0.65,
  restLength: 0.35,
  maxTravel: 0.25,
  stiffness: 30,
  compression: 2.0,
  relaxation: 2.3,
  maxForce: 20000,
  sideFriction: 1.0,
};

// Hold Space while steering: the car commits to a slide. Its velocity arcs
// around the turn at a steady rate while the nose points into it, and the
// speed carries. Steering into the drift tightens it; countersteer widens it.
export const DRIFT = {
  /** Space starts a drift above this speed (m/s, ~18 km/h). */
  minSpeed: 5,
  /** Below this the drift ends by itself. */
  endSpeed: 3,
  /** Nose angle off the direction of travel (rad, ~35°), and the swing steering adds or takes away. */
  angle: 0.6,
  angleSteer: 0.2,
  /** How fast the direction of travel turns (rad/s), and the swing steering adds or takes away. */
  turn: 0.9,
  turnSteer: 0.5,
  /** How hard the nose chases its angle (1/s), and the yaw rate cap (rad/s). */
  yawGain: 10,
  maxYaw: 4,
  /** Speed change while drifting (m/s²): throttle, coasting, braking. */
  accel: 2.5,
  drag: 0.8,
  brake: 10,
  /** After letting go: how fast the direction of travel swings back under the nose (1/s), and for how long (s). */
  recover: 6,
  recoverTime: 0.4,
  /** Wheel side friction while sliding (the slide is steered above, not by the tires). */
  sideFriction: 0.05,
};

export const ENGINE = {
  /** Total force at the rear wheels, split between the two. */
  force: 4000,
  reverseForce: 3800,
  /** Reverse top speed, m/s (~50 km/h). */
  reverseTop: 14,
  /** Engine force fades to 0 over this fraction above the top speed. */
  capFade: 0.08,
  brake: 1500 / 60,
  /** Light brake with no throttle, so the car stops rolling. */
  idleBrake: 3 / 60,
  /** Below this forward speed (m/s) the brake key reverses. */
  reverseBelow: 1,
  /** Extra pull off the line: engine × (1 + launch) at rest, fading out by `launchUntil` m/s. */
  launch: 3,
  launchUntil: 16,
  /** Throttle while rolling backward: a firm brake so you're going forward again fast. */
  switchBrake: 4500 / 60,
};

export const STEER = {
  atRest: 0.5,
  atTop: 0.2,
  /** Speed (m/s) at which steering reaches its top-speed limit. */
  topSpeed: 25,
  /** How fast the wheels turn toward the input (rad/s). */
  rate: 3.5,
  // Arcade assist: the tires alone can't turn a car hard at speed, so steering
  // sets a target turn rate and the direction of travel follows the nose.
  /** Turn radius at full lock (m): turn rate = speed / radius, up to the caps below. */
  radius: 6,
  /** Turn rate cap (rad/s) at low speed, easing to `maxYawTop` at boost speed. */
  maxYaw: 2.2,
  maxYawTop: 1.4,
  /** How hard the turn rate chases its target (1/s). */
  yawGain: 10,
  /** How fast the direction of travel follows the nose on road (1/s); scaled down by surface grip. */
  follow: 8,
};

export const SURFACE = {
  road: { grip: 2.0, topSpeed: 25 },
  plaza: { grip: 1.8, topSpeed: 20 },
  grass: { grip: 1.1, topSpeed: 14 },
} as const;

// Hold Shift: unlimited boost in the town. On the race track only a mini-turbo.
export const BOOST = {
  engineMul: 2.6,
  topSpeed: 35,
  /** Extra acceleration while boosting in a drift (m/s²). */
  driftAccel: 6,
};

// Race track, after Mario Kart: hold a drift and it charges; let go and it
// fires a boost. Longer drifts, bigger turbos.
export const TURBO = {
  /** Seconds of drift for each level: blue, orange, purple. */
  charge: [0.6, 1.3, 2.2],
  /** Boost seconds per level (index 0: no turbo). */
  seconds: [0, 0.6, 1.0, 1.5],
  /** Instant speed added along the nose when it fires (m/s). */
  kick: [0, 3.5, 5.5, 8],
  colors: ["#ffffff", "#4cc9ff", "#ff9a1f", "#c75bff"],
};

export const RESPAWN = {
  /** Upside down this long → auto-right. */
  flippedFor: 1,
  rightingImpulse: 5000,
  rightingTorque: 2500,
  /** Knocked props go back to their spot this long after the hit. */
  propReset: 8,
};

export const PROPS = {
  lamp: { mass: 60, radius: 0.2, halfHeight: 3.6 },
  bench: { mass: 40, half: [1.0, 0.4, 0.35] as [number, number, number] },
  fountain: { mass: 600, radius: 3.4, halfHeight: 1.5 },
  tree: { radius: 0.8, halfHeight: 5 },
  cone: { mass: 4 },
  crate: { mass: 25 },
};

/** Toys: tire walls bounce the car back, pads fire it forward. */
export const TOYS = {
  tireRestitution: 0.9,
  /** A boost pad sets your speed along it to at least this (m/s), plus a kick. */
  padSpeed: 30,
  padKick: 6,
  /** Seconds before the same pad fires again for you. */
  padCooldown: 0.6,
};

export const WALL = { height: 4, thickness: 1 };

export const CAMERA = {
  distance: 7,
  height: 2.8,
  fov: 60,
  fovBoost: 75,
  /** Spring stiffness for the chase follow (higher = tighter). */
  follow: 6,
  topDownHeight: 110,
};
