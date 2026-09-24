// ─── Vehicle ────────────────────────────────────────────────
// The car's per-step logic on Rapier's DynamicRayCastVehicleController: four
// raycast wheels, rear drive, surface grip per wheel, handbrake drift, boost
// and flip recovery. No React here, so a headless world can drive it too.
// Chassis frame: +z forward, +y up, +x left. Wheels: 0 FL, 1 FR, 2 RL, 3 RR.

import type { RapierContext, RapierRigidBody } from "@react-three/rapier";
import type { DriveInput } from "./input";
import { isFlipped } from "./spawn";
import type { SurfaceGrip } from "./surface";
import { BOOST, DRIFT, ENGINE, M_TO_UNIT, RESPAWN, STEER, WHEEL } from "./tuning";

type World = RapierContext["world"];
export type VehicleController = ReturnType<World["createVehicleController"]>;

export interface CarState {
  /** Forward speed, m/s (negative when reversing). */
  speed: number;
  steer: number;
  /** 0…1; boost fires at 1. */
  boostCharge: number;
  /** Seconds of boost burn left. */
  boostLeft: number;
  braking: boolean;
  /** Rear-wheel sideways slip, 0…1 (skid marks, smoke, skid sound). */
  slip: number;
  flippedFor: number;
  /** Sliding on purpose: rear grip stays low until the slide ends. */
  drifting: boolean;
  /** Seconds the drift holds regardless of slide (after a handbrake tap). */
  driftGrace: number;
  /** Sideways speed, m/s. */
  lateral: number;
  /** Surface under the rear wheels. */
  surface: SurfaceGrip["surface"];
}

export const WHEELS: { x: number; z: number; front: boolean }[] = [
  { x: WHEEL.halfTrack, z: WHEEL.halfBase, front: true },
  { x: -WHEEL.halfTrack, z: WHEEL.halfBase, front: true },
  { x: WHEEL.halfTrack, z: -WHEEL.halfBase, front: false },
  { x: -WHEEL.halfTrack, z: -WHEEL.halfBase, front: false },
];

export function newCarState(): CarState {
  return { speed: 0, steer: 0, boostCharge: 1, boostLeft: 0, braking: false, slip: 0, flippedFor: 0, drifting: false, driftGrace: 0, lateral: 0, surface: "road" };
}

export function createVehicle(world: World, body: RapierRigidBody): VehicleController {
  const c = world.createVehicleController(body);
  c.indexUpAxis = 1;
  c.setIndexForwardAxis = 2;
  WHEELS.forEach((w, i) => {
    c.addWheel({ x: w.x, y: WHEEL.connectionY, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, WHEEL.restLength, WHEEL.radius);
    c.setWheelSuspensionStiffness(i, WHEEL.stiffness);
    c.setWheelSuspensionCompression(i, WHEEL.compression);
    c.setWheelSuspensionRelaxation(i, WHEEL.relaxation);
    c.setWheelMaxSuspensionForce(i, WHEEL.maxForce);
    c.setWheelMaxSuspensionTravel(i, WHEEL.maxTravel);
    c.setWheelSideFrictionStiffness(i, WHEEL.sideFriction);
  });
  return c;
}

// Scratch math (no allocation per step).
function rotate(q: { x: number; y: number; z: number; w: number }, v: [number, number, number]): [number, number, number] {
  const [vx, vy, vz] = v;
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  return [vx + q.w * tx + (q.y * tz - q.z * ty), vy + q.w * ty + (q.z * tx - q.x * tz), vz + q.w * tz + (q.x * ty - q.y * tx)];
}

/** Engine force multiplier that fades out just above the top speed. */
export function capFade(speed: number, top: number): number {
  if (speed <= top) return 1;
  return Math.max(0, 1 - (speed - top) / (top * ENGINE.capFade));
}

const REVERSE_TOP = 8;

/**
 * One physics step: reads input, sets wheel forces, grip and steering, then
 * updates the controller. Call before world.step with the same dt.
 * `gripAt` takes a point in city units.
 */
export function stepCar(
  c: VehicleController,
  s: CarState,
  input: DriveInput,
  dt: number,
  gripAt: (wx: number, wz: number) => SurfaceGrip,
): void {
  const body = c.chassis();
  const q = body.rotation();
  const p = body.translation();
  const speed = c.currentVehicleSpeed();
  s.speed = speed;

  // Drift: the handbrake starts it; steering on throttle while still sliding keeps it.
  s.driftGrace = Math.max(0, s.driftGrace - dt);
  if (input.handbrake && speed > DRIFT.minSpeed) {
    s.drifting = true;
    s.driftGrace = DRIFT.grace;
  } else if (!input.handbrake && (input.steer === 0 || input.throttle === 0 || (s.driftGrace === 0 && s.lateral < DRIFT.holdSlip))) {
    s.drifting = false;
  }
  const loose = s.drifting || input.handbrake;

  // Grip and top speed per wheel, from the surface under it.
  let rearTop = 0;
  WHEELS.forEach((w, i) => {
    const [ox, , oz] = rotate(q, [w.x, 0, w.z]);
    const g = gripAt((p.x + ox) * M_TO_UNIT, (p.z + oz) * M_TO_UNIT);
    c.setWheelFrictionSlip(i, !w.front && loose ? g.grip * WHEEL.rearGripDrift : g.grip);
    if (!w.front) {
      rearTop += g.topSpeed / 2;
      s.surface = g.surface;
    }
  });

  // Boost: fires when charged, burns, then recharges.
  if (s.boostLeft > 0) {
    s.boostLeft = Math.max(0, s.boostLeft - dt);
  } else {
    s.boostCharge = Math.min(1, s.boostCharge + dt / BOOST.recharge);
    if (input.boost && s.boostCharge >= 1) {
      s.boostCharge = 0;
      s.boostLeft = BOOST.burn;
      const [fx, fy, fz] = rotate(q, [0, 0, BOOST.impulse]);
      body.applyImpulse({ x: fx, y: fy, z: fz }, true);
    }
  }
  const boosting = s.boostLeft > 0;
  const top = boosting ? BOOST.topSpeed : rearTop;

  // Throttle, brake and reverse.
  let engine = 0;
  let brake = 0;
  if (input.throttle > 0 && speed < -ENGINE.reverseBelow) {
    brake = ENGINE.brake * input.throttle;
  } else if (input.throttle > 0) {
    engine = ENGINE.force * input.throttle * (boosting ? BOOST.engineMul : 1) * capFade(speed, top);
  } else if (input.brake > 0 && speed > ENGINE.reverseBelow) {
    brake = ENGINE.brake * input.brake;
  } else if (input.brake > 0) {
    engine = -ENGINE.reverseForce * input.brake * capFade(-speed, REVERSE_TOP);
  } else {
    brake = ENGINE.idleBrake;
  }
  if (boosting && input.throttle === 0 && input.brake === 0) engine = ENGINE.force * BOOST.engineMul * capFade(speed, top);
  s.braking = brake > ENGINE.idleBrake || (input.brake > 0 && speed > ENGINE.reverseBelow);

  // Steering eases toward the input; less lock at speed.
  const t = Math.min(1, Math.abs(speed) / STEER.topSpeed);
  const lock = STEER.atRest + (STEER.atTop - STEER.atRest) * t;
  const target = -input.steer * lock;
  const step = STEER.rate * dt;
  s.steer += Math.max(-step, Math.min(step, target - s.steer));

  for (let i = 0; i < 4; i++) {
    const front = WHEELS[i].front;
    c.setWheelSteering(i, front ? s.steer * (s.drifting ? DRIFT.frontLock : 1) : 0);
    c.setWheelEngineForce(i, front ? 0 : engine / 2);
    const hand = !front && input.handbrake;
    c.setWheelBrake(i, hand ? Math.max(brake, ENGINE.handbrake) : brake);
    c.setWheelSideFrictionStiffness(i, !front && loose ? WHEEL.rearSideFrictionHandbrake : WHEEL.sideFriction);
  }

  c.updateVehicle(dt);

  // Low rear grip also caps the engine: push the chassis so a drift keeps its speed.
  if (s.drifting && input.throttle > 0 && speed < top) {
    const [fx, fy, fz] = rotate(q, [0, 0, ENGINE.force * input.throttle * DRIFT.push * dt]);
    body.applyImpulse({ x: fx, y: fy, z: fz }, true);
  }

  // Rear slip from the chassis' sideways speed.
  const v = body.linvel();
  const [rx, ry, rz] = rotate(q, [1, 0, 0]);
  const lateral = Math.abs(v.x * rx + v.y * ry + v.z * rz);
  const grounded = c.wheelIsInContact(2) || c.wheelIsInContact(3);
  s.lateral = lateral;
  s.slip = grounded ? Math.min(1, Math.max(0, (lateral - 1) / 4)) : 0;

  // A drift slides; it doesn't spin: steer sets the yaw rate, and the velocity
  // swings back toward the heading without losing speed.
  if (loose && grounded) {
    const w = body.angvel();
    const yaw = w.y + (-input.steer * DRIFT.maxYaw - w.y) * Math.min(1, DRIFT.yawControl * dt);
    body.setAngvel({ x: w.x, y: yaw, z: w.z }, true);
    const [fx, , fz] = rotate(q, [0, 0, 1]);
    const len = Math.hypot(fx, fz) || 1;
    const mag = Math.hypot(v.x, v.z);
    const dir = v.x * fx + v.z * fz >= 0 ? 1 : -1;
    const k = Math.min(1, DRIFT.align * dt);
    body.setLinvel({ x: v.x + ((dir * fx * mag) / len - v.x) * k, y: v.y, z: v.z + ((dir * fz * mag) / len - v.z) * k }, true);
  }

  // Upside down for a while: put it back on its wheels.
  const [, uy] = rotate(q, [0, 1, 0]);
  s.flippedFor = isFlipped({ y: uy }) ? s.flippedFor + dt : 0;
  if (s.flippedFor >= RESPAWN.flippedFor) {
    rightCar(body);
    s.flippedFor = 0;
  }
}

/** Heading of the car (radians about y, three.js convention). */
export function carHeading(body: RapierRigidBody): number {
  const [fx, , fz] = rotate(body.rotation(), [0, 0, 1]);
  return Math.atan2(fx, fz);
}

/** Lifts the car and turns it upright, keeping its heading. */
export function rightCar(body: RapierRigidBody): void {
  const h = carHeading(body);
  const p = body.translation();
  body.setTranslation({ x: p.x, y: Math.max(p.y, 0) + 1.2, z: p.z }, true);
  body.setRotation({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

/** Puts the car at a point (meters) facing `heading` (radians about y), at rest. */
export function placeCar(body: RapierRigidBody, x: number, z: number, heading: number): void {
  body.setTranslation({ x, y: 0.4, z }, true);
  body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

/** Heading (radians about y) for a city rot in degrees: the car's +z faces that way. */
export function headingFromRot(rot: number): number {
  return Math.PI - (rot * Math.PI) / 180;
}
