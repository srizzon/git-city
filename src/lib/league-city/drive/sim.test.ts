import RAPIER from "@react-three/rapier/node_modules/@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import type { RapierContext, RapierRigidBody } from "@react-three/rapier";
import type { DriveInput } from "./input";
import type { SurfaceGrip } from "./surface";
import { LOT } from "../grid";
import type { CityObject } from "../types";
import { buildColliders } from "./colliders";
import { CHASSIS, GRAVITY, SURFACE } from "./tuning";
import { createVehicle, headingFromRot, newCarState, placeCar, stepCar } from "./vehicle";

type World = RapierContext["world"];
const DT = 1 / 60;
const idle: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, horn: false, camera: false, reset: false };

beforeAll(async () => {
  await RAPIER.init();
});

function setup(surface: SurfaceGrip["surface"] = "road", rot = 0, objects: CityObject[] = []) {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }) as unknown as World;
  world.createCollider(RAPIER.ColliderDesc.cuboid(2000, 1, 2000).setTranslation(0, -1, 0));
  for (const c of buildColliders(objects, [], 40)) {
    if (c.shape.type !== "hull") continue;
    world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(c.shape.points))!.setTranslation(...c.pos));
  }
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setLinearDamping(CHASSIS.linearDamping).setAngularDamping(CHASSIS.angularDamping).setCanSleep(false),
  ) as unknown as RapierRigidBody;
  const [hx, hy, hz] = CHASSIS.half;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(0, CHASSIS.colliderY, 0)
      .setMassProperties(CHASSIS.mass, { x: 0, y: CHASSIS.comY - CHASSIS.colliderY, z: 0 }, { x: 950, y: 1200, z: 340 }, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(0.3),
    body as never,
  );
  placeCar(body, 0, 0, headingFromRot(rot));
  const c = createVehicle(world, body);
  const s = newCarState();
  const grip = (): SurfaceGrip => ({ surface, ...SURFACE[surface] });
  const run = (input: Partial<DriveInput>, seconds: number) => {
    for (let t = 0; t < seconds; t += DT) {
      stepCar(c, s, { ...idle, ...input }, DT, grip);
      world.timestep = DT;
      world.step();
    }
  };
  return { body, c, s, run };
}

describe("vehicle (headless rapier)", () => {
  it("settles on its wheels", () => {
    const { body, run } = setup();
    run({}, 2);
    expect(body.translation().y).toBeGreaterThan(-0.2);
    expect(body.translation().y).toBeLessThan(0.4);
    expect(Math.abs(body.linvel().x) + Math.abs(body.linvel().z)).toBeLessThan(0.1);
  });

  it("drives forward (north at rot 0) up to the road top speed", () => {
    const { body, s, run } = setup("road", 0);
    run({}, 1);
    run({ throttle: 1 }, 12);
    expect(body.translation().z).toBeLessThan(-50);
    expect(Math.abs(body.translation().x)).toBeLessThan(2);
    expect(s.speed).toBeGreaterThan(SURFACE.road.topSpeed * 0.85);
    expect(s.speed).toBeLessThan(SURFACE.road.topSpeed * 1.15);
  });

  it("is slower on grass than on road", () => {
    const road = setup("road");
    const grass = setup("grass");
    road.run({ throttle: 1 }, 12);
    grass.run({ throttle: 1 }, 12);
    expect(grass.s.speed).toBeLessThan(road.s.speed * 0.7);
  });

  it("steers right with steer = 1", () => {
    const { body, run } = setup("road", 0);
    run({ throttle: 1 }, 2);
    run({ throttle: 0.6, steer: 1 }, 1.5);
    expect(body.translation().x).toBeGreaterThan(1); // north-facing car turning right heads east (+x)
  });

  it("reverses with the brake from rest", () => {
    const { s, run } = setup();
    run({ brake: 1 }, 3);
    expect(s.speed).toBeLessThan(-3);
  });

  it("drifts on the handbrake: slides wider than grip, keeps speed, doesn't spin", () => {
    const grip = setup();
    const drift = setup();
    for (const car of [grip, drift]) car.run({ throttle: 1 }, 4);
    grip.run({ throttle: 1, steer: 0.5 }, 1.4);
    drift.run({ throttle: 1, steer: 0.5, handbrake: true }, 0.4);
    drift.run({ throttle: 1, steer: 0.5 }, 1);
    expect(drift.s.drifting).toBe(true);
    expect(drift.s.lateral).toBeGreaterThan(grip.s.lateral * 1.8);
    expect(drift.s.slip).toBeGreaterThan(0);
    expect(drift.s.speed).toBeGreaterThan(grip.s.speed * 0.9);
    expect(Math.abs(drift.body.angvel().y)).toBeLessThan(2.5);
    drift.run({ throttle: 1 }, 1.5);
    expect(drift.s.drifting).toBe(false);
    expect(drift.s.lateral).toBeLessThan(0.5);
  });

  it("boosts past the road cap, then recharges", () => {
    const { s, run } = setup();
    run({ throttle: 1 }, 10);
    const before = s.speed;
    run({ throttle: 1, boost: true }, 1.2);
    expect(s.speed).toBeGreaterThan(before + 3);
    expect(s.boostCharge).toBe(0);
    run({ throttle: 1 }, 4.2);
    expect(s.boostCharge).toBe(1);
  });

  it("launches off a ramp it drives up", () => {
    // A ramp facing north, 2 lots north of the car; the car faces north too.
    const ramp: CityObject = { id: "ramp", kind: "item", item_type: "ramp", developer_id: null, x: 0, z: -2, px: 0, pz: -2 * LOT, rot: 0, is_new: false };
    const { body, run } = setup("road", 0, [ramp]);
    let maxY = 0;
    for (let i = 0; i < 60 * 8; i++) {
      run({ throttle: 1 }, 1 / 60);
      maxY = Math.max(maxY, body.translation().y);
    }
    expect(maxY).toBeGreaterThan(3.5); // the deck tops out at 3.2 m; the car flies off it
    const q = body.rotation();
    expect(1 - 2 * (q.x * q.x + q.z * q.z)).toBeGreaterThan(0.5); // landed on its wheels
  });

  it("rights itself after lying upside down", () => {
    const { body, run } = setup();
    body.setTranslation({ x: 0, y: 2, z: 0 }, true);
    body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true); // 180° about z
    run({}, 4);
    const q = body.rotation();
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    expect(upY).toBeGreaterThan(0.9);
  });
});
