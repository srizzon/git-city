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
  rearSideFrictionHandbrake: 0.35,
  /** Rear grip (frictionSlip) multiplier while drifting: what actually breaks traction. */
  rearGripDrift: 0.2,
};

export const DRIFT = {
  /** The handbrake starts a drift above this speed (m/s). */
  minSpeed: 7,
  /** A drift holds while steering on throttle and sliding faster than this (m/s sideways). */
  holdSlip: 1.2,
  /** After the handbrake lets go, the drift holds at least this long (s) so a tap can start one. */
  grace: 0.5,
  /** Yaw rate at full steer while drifting (rad/s): steer sets the rotation, so it slides instead of spinning. */
  maxYaw: 2.0,
  /** How fast the yaw rate follows the steer (1/s). */
  yawControl: 15,
  /** Front wheel lock while drifting, as a share of normal (less scrub, the yaw control steers). */
  frontLock: 0.4,
  /** How fast the velocity swings back toward the heading (1/s): the slide keeps its speed. */
  align: 1.4,
  /** Share of engine force pushed straight into the chassis while drifting. */
  push: 1.0,
};

export const ENGINE = {
  /** Total force at the rear wheels, split between the two. */
  force: 4000,
  reverseForce: 2200,
  /** Engine force fades to 0 over this fraction above the top speed. */
  capFade: 0.08,
  brake: 1500 / 60,
  handbrake: 3000 / 60,
  /** Light brake with no throttle, so the car stops rolling. */
  idleBrake: 3 / 60,
  /** Below this forward speed (m/s) the brake key reverses. */
  reverseBelow: 1,
};

export const STEER = {
  atRest: 0.5,
  atTop: 0.2,
  /** Speed (m/s) at which steering reaches its top-speed limit. */
  topSpeed: 25,
  /** How fast the wheels turn toward the input (rad/s). */
  rate: 3.5,
};

export const SURFACE = {
  road: { grip: 2.0, topSpeed: 25 },
  plaza: { grip: 1.8, topSpeed: 20 },
  grass: { grip: 1.1, topSpeed: 14 },
} as const;

export const BOOST = {
  engineMul: 1.8,
  topSpeed: 35,
  burn: 1.2,
  recharge: 4,
  /** Forward kick when a boost starts, N·s. */
  impulse: 2500,
};

export const RESPAWN = {
  /** Upside down this long → auto-right. */
  flippedFor: 3,
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
};

export const WALL = { height: 4, thickness: 1 };

export const CAMERA = {
  distance: 7,
  height: 2.8,
  fov: 60,
  fovBoost: 75,
  /** Spring stiffness for the chase follow (higher = tighter). */
  follow: 6,
  topDownHeight: 40,
};
