import { describe, expect, it } from "vitest";
import type { CityBuilding } from "@/lib/github";
import { LOT, rotToRadians } from "../grid";
import { RAMP } from "../ramp";
import type { CityObject } from "../types";
import { buildColliders, colliderKey } from "./colliders";
import { deadzone, readInput, type GamepadLike } from "./input";
import { isFlipped, nearestFreeLot, spawnPoint } from "./spawn";
import { surfaceAt, surfaceIndex } from "./surface";
import { SURFACE, UNIT_TO_M } from "./tuning";

const lot = (id: string, item: "road" | "plaza", x: number, z: number): CityObject => ({
  id, kind: "item", item_type: item, developer_id: null, x, z, px: null, pz: null, rot: 0, is_new: false,
});
const bld = (id: string, dev: number, x: number, z: number): CityObject => ({
  id, kind: "building", item_type: null, developer_id: dev, x, z, px: null, pz: null, rot: 0, is_new: false,
});
const prop = (id: string, item: CityObject["item_type"], px: number, pz: number, rot = 0): CityObject => ({
  id, kind: "item", item_type: item, developer_id: null, x: Math.round(px / LOT), z: Math.round(pz / LOT), px, pz, rot, is_new: false,
});
const building = (login: string, x: number, z: number, width: number, depth: number, height: number) =>
  ({ login, loginLower: login, position: [x, 0, z], width, depth, height }) as unknown as CityBuilding;

describe("colliders", () => {
  it("sizes a building cuboid from its footprint, in meters", () => {
    const [c] = buildColliders([], [building("ana", LOT, 0, 30, 20, 100)], 12);
    expect(c).toMatchObject({ id: "building:ana", body: "fixed" });
    expect(c.pos[0]).toBeCloseTo(LOT * UNIT_TO_M);
    expect(c.pos[1]).toBeCloseTo(50 * UNIT_TO_M);
    expect(c.shape).toEqual({ type: "cuboid", half: [15 * UNIT_TO_M, 50 * UNIT_TO_M, 10 * UNIT_TO_M] });
  });

  it("makes trees fixed cylinders and lamps, benches and fountains dynamic", () => {
    const cs = buildColliders(
      [prop("t", "tree_oak", 0, 0), prop("l", "lamp", 20, 0), prop("b", "bench", 40, 0, 90), prop("f", "fountain", 80, 0)],
      [],
      12,
    );
    const by = (id: string) => cs.find((c) => c.id === id)!;
    expect(by("t")).toMatchObject({ body: "fixed", shape: { type: "cylinder" } });
    expect(by("l")).toMatchObject({ body: "dynamic", prop: "lamp" });
    expect(by("b")).toMatchObject({ body: "dynamic", prop: "bench", rotY: rotToRadians(90) });
    expect(by("f")).toMatchObject({ body: "dynamic", prop: "fountain" });
    expect(by("l").mass).toBeGreaterThan(0);
  });

  it("skips roads and plazas (surfaces need no collider)", () => {
    const cs = buildColliders([lot("r", "road", 0, 0), lot("p", "plaza", 1, 0)], [], 12);
    expect(cs.find((c) => c.id === "r" || c.id === "p")).toBeUndefined();
  });

  it("turns the ramp wedge with its rotation, for every angle", () => {
    for (let rot = 0; rot < 360; rot++) {
      const [c] = buildColliders([prop("ramp", "ramp", 0, 0, rot)], [], 12);
      if (c.shape.type !== "hull") throw new Error("ramp should be a hull");
      const p = c.shape.points;
      expect(p).toHaveLength(18);
      // The two high corners (y = height) sit on the side the ramp faces:
      // rot 0 faces north (-z), 90 east (+x), clockwise.
      const hx = (p[12] + p[15]) / 2;
      const hz = (p[14] + p[17]) / 2;
      const r = (rot * Math.PI) / 180;
      const reach = (RAMP.length / 2) * UNIT_TO_M;
      expect(hx).toBeCloseTo(Math.sin(r) * reach, 5);
      expect(hz).toBeCloseTo(-Math.cos(r) * reach, 5);
      expect(p[13]).toBeCloseTo(RAMP.height * UNIT_TO_M);
      // Low edge stays on the ground.
      for (let i = 0; i < 4; i++) expect(p[i * 3 + 1]).toBe(0);
    }
  });

  it("walls the terrain edge and follows the city size", () => {
    const small = buildColliders([], [], 12).filter((c) => c.id.startsWith("wall"));
    const big = buildColliders([], [], 14).filter((c) => c.id.startsWith("wall"));
    expect(small).toHaveLength(4);
    const north = (cs: typeof small) => cs.find((c) => c.id.startsWith("wall-n"))!;
    // 12 lots: lots -6..5, north edge at -6.5 lots.
    expect(north(small).pos[2]).toBeLessThan(-6.5 * LOT * UNIT_TO_M);
    expect(north(big).pos[2]).toBeLessThan(north(small).pos[2]);
    expect(colliderKey(north(small))).not.toBe(colliderKey(north(big)));
  });
});

describe("surfaces", () => {
  // A road running north-south through x = 0, a plaza at (2, 0).
  const index = surfaceIndex([lot("r0", "road", 0, 0), lot("r1", "road", 0, 1), lot("p", "plaza", 2, 0)]);

  it("is road on asphalt, plaza on the sidewalk and plazas, grass elsewhere", () => {
    expect(surfaceAt(index, 0, 0).surface).toBe("road");
    expect(surfaceAt(index, 0, LOT / 2).surface).toBe("road"); // arm toward the neighbor
    expect(surfaceAt(index, 20, 0).surface).toBe("plaza"); // sidewalk
    expect(surfaceAt(index, 2 * LOT, 0).surface).toBe("plaza");
    expect(surfaceAt(index, 5 * LOT, 5 * LOT).surface).toBe("grass");
  });

  it("grips and caps speed road > plaza > grass", () => {
    const road = surfaceAt(index, 0, 0);
    const plaza = surfaceAt(index, 2 * LOT, 0);
    const grass = surfaceAt(index, 5 * LOT, 0);
    expect(road).toMatchObject(SURFACE.road);
    expect(road.grip).toBeGreaterThan(plaza.grip);
    expect(plaza.grip).toBeGreaterThan(grass.grip);
    expect(road.topSpeed).toBeGreaterThan(plaza.topSpeed);
    expect(plaza.topSpeed).toBeGreaterThan(grass.topSpeed);
  });
});

describe("input", () => {
  const pad = (buttons: Record<number, number>, axes: number[] = [0, 0], count = 17): GamepadLike => ({
    buttons: Array.from({ length: count }, (_, i) => ({ value: buttons[i] ?? 0, pressed: (buttons[i] ?? 0) > 0.5 })),
    axes,
  });

  it("maps WASD, arrows and the action keys", () => {
    expect(readInput(new Set(["KeyW", "KeyA"]), null)).toMatchObject({ throttle: 1, brake: 0, steer: -1 });
    expect(readInput(new Set(["ArrowDown", "ArrowRight"]), null)).toMatchObject({ throttle: 0, brake: 1, steer: 1 });
    expect(readInput(new Set(["KeyA", "KeyD"]), null).steer).toBe(0);
    expect(readInput(new Set(["Space", "ShiftLeft", "KeyH", "KeyC", "KeyR", "KeyF"]), null)).toMatchObject({
      handbrake: true, boost: true, horn: true, camera: true, reset: true, fire: true,
    });
    expect(readInput(new Set(), null)).toMatchObject({ throttle: 0, brake: 0, steer: 0, handbrake: false });
  });

  it("maps a standard gamepad: triggers, stick and buttons", () => {
    const i = readInput(new Set(), pad({ 7: 1, 6: 0.5, 0: 1, 2: 1, 3: 1, 1: 1, 9: 1, 5: 1 }, [-1, 0]));
    expect(i.throttle).toBe(1);
    expect(i.brake).toBeCloseTo(deadzone(0.5, 0.05));
    expect(i.steer).toBe(-1);
    expect(i).toMatchObject({ handbrake: true, boost: true, camera: true, horn: true, reset: true, fire: true });
  });

  it("ignores stick and trigger noise inside the deadzone", () => {
    const i = readInput(new Set(), pad({ 7: 0.03, 6: 0.02 }, [0.1, 0.12]));
    expect(i).toMatchObject({ throttle: 0, brake: 0, steer: 0 });
  });

  it("drives with the left stick on a gamepad with no triggers", () => {
    const up = readInput(new Set(), pad({}, [0, -1], 4));
    expect(up).toMatchObject({ throttle: 1, brake: 0 });
    const down = readInput(new Set(), pad({}, [0.5, 1], 4));
    expect(down.brake).toBe(1);
    expect(down.steer).toBeGreaterThan(0);
  });

  it("merges keyboard and gamepad", () => {
    expect(readInput(new Set(["KeyW"]), pad({}, [1, 0])).steer).toBe(1);
    expect(readInput(new Set(["KeyW"]), pad({}, [1, 0])).throttle).toBe(1);
  });
});

describe("spawn", () => {
  const city = [
    lot("r0", "road", 0, 0), lot("r1", "road", 1, 0), lot("r2", "road", -1, 0), lot("r3", "road", 0, 1), lot("r4", "road", 0, -1),
    lot("r5", "road", 3, 2), lot("r6", "road", 3, 3),
    bld("mine", 7, 4, 2),
  ];

  it("starts on the road in front of your building, along the road", () => {
    expect(spawnPoint(city, 7, 12)).toEqual({ x: 3 * LOT, z: 2 * LOT, rot: 0 });
  });

  it("starts at the crossing nearest the center when you have no building", () => {
    expect(spawnPoint(city, null, 12)).toMatchObject({ x: 0, z: 0 });
    expect(spawnPoint(city, 99, 12)).toMatchObject({ x: 0, z: 0 });
  });

  it("falls back to the nearest free lot when there are no roads", () => {
    const s = spawnPoint([bld("b", 1, 0, 0)], null, 12);
    expect(Math.abs(s.x) + Math.abs(s.z)).toBe(LOT);
  });

  it("detects a flipped car", () => {
    expect(isFlipped({ y: 1 })).toBe(false);
    expect(isFlipped({ y: 0.1 })).toBe(true);
    expect(isFlipped({ y: -1 })).toBe(true);
  });

  it("pushes out to the nearest lot without a building or a prop", () => {
    const objs = [bld("a", 1, 1, 0), prop("t", "tree_oak", 2 * LOT, 0)];
    expect(nearestFreeLot(objs, 12, 1.4 * LOT, 0.2 * LOT)).toEqual([1, 1]);
    expect(nearestFreeLot(objs, 12, 0.9 * LOT, 0)).toEqual([0, 0]);
  });

  it("returns null when every lot is taken", () => {
    const full: CityObject[] = [];
    for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) full.push(bld(`${x},${z}`, x * 100 + z, x, z));
    expect(nearestFreeLot(full, 12, 0, 0)).toBeNull();
  });
});
