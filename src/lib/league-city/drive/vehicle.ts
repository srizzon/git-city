// ─── Vehicle ────────────────────────────────────────────────
// The car's per-step logic on Rapier's DynamicRayCastVehicleController: four
// raycast wheels, rear drive, surface grip per wheel, a held drift, boost
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
  /** Boost meter, 0…1. */
  boostCharge: number;
  boosting: boolean;
  /** Seconds before the meter starts refilling. */
  boostWait: number;
  braking: boolean;
  /** Sideways slip, 0…1 (skid marks, smoke, skid sound). */
  slip: number;
  flippedFor: number;
  drifting: boolean;
  /** 1 drifting right, -1 left. */
  driftDir: number;
  /** Seconds of grip recovery left after a drift. */
  recovering: number;
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
  return {
    speed: 0, steer: 0, boostCharge: 1, boosting: false, boostWait: 0, braking: false, slip: 0,
    flippedFor: 0, drifting: false, driftDir: 0, recovering: 0, lateral: 0, surface: "road",
  };
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

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

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
  const grounded = c.wheelIsInContact(2) || c.wheelIsInContact(3);

  // Drift: hold Space while steering at speed; it ends when Space lets go.
  if (!s.drifting && input.handbrake && input.steer !== 0 && speed > DRIFT.minSpeed && grounded) {
    s.drifting = true;
    s.driftDir = Math.sign(input.steer);
  } else if (s.drifting && (!input.handbrake || speed < DRIFT.endSpeed)) {
    s.drifting = false;
    s.recovering = DRIFT.recoverTime;
  }
  s.recovering = Math.max(0, s.recovering - dt);

  // Grip and top speed per wheel, from the surface under it.
  let rearTop = 0;
  WHEELS.forEach((w, i) => {
    const [ox, , oz] = rotate(q, [w.x, 0, w.z]);
    const g = gripAt((p.x + ox) * M_TO_UNIT, (p.z + oz) * M_TO_UNIT);
    c.setWheelFrictionSlip(i, g.grip);
    if (!w.front) {
      rearTop += g.topSpeed / 2;
      s.surface = g.surface;
    }
  });

  // Boost: hold to burn the meter; it refills after a short pause.
  const wantBoost = input.boost && (s.boosting ? s.boostCharge > 0 : s.boostCharge >= BOOST.minToStart);
  s.boosting = wantBoost;
  if (s.boosting) {
    s.boostCharge = Math.max(0, s.boostCharge - dt / BOOST.burn);
    s.boostWait = BOOST.rechargeDelay;
  } else if (s.boostWait > 0) {
    s.boostWait = Math.max(0, s.boostWait - dt);
  } else {
    s.boostCharge = Math.min(1, s.boostCharge + dt / BOOST.recharge);
  }
  const top = s.boosting ? BOOST.topSpeed : rearTop;

  // Throttle, brake and reverse (boost drives even without throttle).
  const throttle = s.boosting ? 1 : input.throttle;
  let engine = 0;
  let brake = 0;
  if (throttle > 0 && speed < -ENGINE.reverseBelow) {
    brake = ENGINE.brake * throttle;
  } else if (throttle > 0) {
    engine = ENGINE.force * throttle * (s.boosting ? BOOST.engineMul : 1) * capFade(speed, top);
  } else if (input.brake > 0 && speed > ENGINE.reverseBelow) {
    brake = ENGINE.brake * input.brake;
  } else if (input.brake > 0) {
    engine = -ENGINE.reverseForce * input.brake * capFade(-speed, ENGINE.reverseTop);
  } else {
    brake = ENGINE.idleBrake;
  }
  s.braking = input.brake > 0 && speed > ENGINE.reverseBelow;

  // Steering eases toward the input; less lock at speed.
  const t = Math.min(1, Math.abs(speed) / STEER.topSpeed);
  const lock = STEER.atRest + (STEER.atTop - STEER.atRest) * t;
  const target = -input.steer * lock;
  const step = STEER.rate * dt;
  s.steer += Math.max(-step, Math.min(step, target - s.steer));

  // While sliding, the tires let go: the drift below steers the car.
  const sliding = s.drifting && grounded;
  for (let i = 0; i < 4; i++) {
    const front = WHEELS[i].front;
    c.setWheelSteering(i, front ? s.steer : 0);
    c.setWheelEngineForce(i, front || sliding ? 0 : engine / 2);
    c.setWheelBrake(i, sliding ? 0 : brake);
    c.setWheelSideFrictionStiffness(i, sliding ? DRIFT.sideFriction : WHEEL.sideFriction);
  }

  // The slide and the recovery work from the velocity before the tires act,
  // so tire friction never eats the drift's speed.
  const v0 = body.linvel();
  c.updateVehicle(dt);

  const v = body.linvel();
  const [fx, , fz] = rotate(q, [0, 0, 1]);
  const heading = Math.atan2(fx, fz);

  if (sliding) {
    // The direction of travel arcs around the turn; the nose leads it into the turn.
    const into = input.steer * s.driftDir; // +1 steering into the drift, -1 countersteering
    const turn = Math.max(0.2, DRIFT.turn + DRIFT.turnSteer * into);
    const angle = Math.max(0.15, DRIFT.angle + DRIFT.angleSteer * into);
    // Right is a clockwise (negative) turn about +y.
    const th = -s.driftDir * turn * dt;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    let vx = v0.x * cos + v0.z * sin;
    let vz = -v0.x * sin + v0.z * cos;
    let mag = Math.hypot(vx, vz);
    if (input.brake > 0) mag -= DRIFT.brake * input.brake * dt;
    else if (throttle > 0 && mag < top) mag += (DRIFT.accel + (s.boosting ? BOOST.driftAccel : 0)) * throttle * dt;
    else mag -= DRIFT.drag * dt;
    mag = Math.max(0, mag);
    const dir = Math.hypot(vx, vz) || 1;
    vx = (vx / dir) * mag;
    vz = (vz / dir) * mag;
    body.setLinvel({ x: vx, y: v.y, z: vz }, true);

    const travel = Math.atan2(vx, vz);
    const want = travel - s.driftDir * angle;
    const w = body.angvel();
    const yaw = Math.max(-DRIFT.maxYaw, Math.min(DRIFT.maxYaw, wrap(want - heading) * DRIFT.yawGain));
    body.setAngvel({ x: w.x, y: yaw, z: w.z }, true);
  } else if (s.recovering > 0 && grounded) {
    // Out of the drift: the direction of travel swings back under the nose, speed kept.
    const mag = Math.max(Math.hypot(v.x, v.z), Math.hypot(v0.x, v0.z));
    const along = v0.x * fx + v0.z * fz >= 0 ? 1 : -1;
    const k = Math.min(1, DRIFT.recover * dt);
    const len = Math.hypot(fx, fz) || 1;
    const tx = (along * fx * mag) / len;
    const tz = (along * fz * mag) / len;
    const bx = v0.x + (tx - v0.x) * k;
    const bz = v0.z + (tz - v0.z) * k;
    const bl = Math.hypot(bx, bz) || 1;
    body.setLinvel({ x: (bx / bl) * mag, y: v.y, z: (bz / bl) * mag }, true);
    const w = body.angvel();
    body.setAngvel({ x: w.x, y: w.y * (1 - k), z: w.z }, true);
  }

  // Sideways slip for skid marks, smoke and sound.
  const nv = body.linvel();
  const [rx, ry, rz] = rotate(q, [1, 0, 0]);
  const lateral = Math.abs(nv.x * rx + nv.y * ry + nv.z * rz);
  s.lateral = lateral;
  s.slip = grounded ? Math.min(1, Math.max(0, (lateral - 1) / 4)) : 0;

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
