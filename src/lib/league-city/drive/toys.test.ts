import { describe, expect, it } from "vitest";
import type { CityBuilding } from "@/lib/github";
import { LOT } from "../grid";
import { RAMP_BIG } from "../ramp";
import { crateLayout, padAt, padDirection, toLocal, toWorld } from "../toys";
import type { CityObject } from "../types";
import { buildColliders } from "./colliders";
import { honkTarget, padKick } from "./reactions";
import { TOYS, UNIT_TO_M } from "./tuning";

const prop = (id: string, item: CityObject["item_type"], px: number, pz: number, rot = 0): CityObject => ({
  id, kind: "item", item_type: item, developer_id: null, x: Math.round(px / LOT), z: Math.round(pz / LOT), px, pz, rot, is_new: false,
});
const building = (login: string, x: number, z: number, width: number, depth: number) =>
  ({ login, loginLower: login, position: [x, 0, z], width, depth, height: 60 }) as unknown as CityBuilding;

describe("toy geometry", () => {
  it("turns local points to world and back, for every angle", () => {
    for (let rot = 0; rot < 360; rot += 15) {
      const [wx, wz] = toWorld(10, -20, rot, 3, -7);
      const [x, z] = toLocal(10, -20, rot, wx, wz);
      expect(x).toBeCloseTo(3);
      expect(z).toBeCloseTo(-7);
    }
  });

  it("points a pad north at 0 and east at 90", () => {
    expect(padDirection(0)[1]).toBeCloseTo(-1);
    expect(padDirection(90)[0]).toBeCloseTo(1);
  });

  it("finds the pad under a point, respecting its rotation", () => {
    const pads = [prop("p", "boost_pad", 0, 0, 90)]; // 16 long along x when turned
    expect(padAt(pads, 7, 0)?.id).toBe("p");
    expect(padAt(pads, 0, 7)).toBeUndefined();
    expect(padAt([prop("q", "boost_pad", 0, 0)], 0, 7)?.id).toBe("q");
  });

  it("stacks crates 3-2-1", () => {
    const c = crateLayout();
    expect(c).toHaveLength(6);
    expect(new Set(c.map(([, y]) => y)).size).toBe(3);
  });
});

describe("toy colliders", () => {
  it("builds a hull for the big ramp and the speed bump, a bouncy wall for tires, six crates", () => {
    const cs = buildColliders(
      [prop("rb", "ramp_big", 0, 0), prop("sb", "speed_bump", 100, 0), prop("tw", "tire_wall", 0, 100), prop("cr", "crates", 100, 100, 45), prop("co", "cone", 50, 50)],
      [],
      12,
    );
    const rb = cs.find((c) => c.id === "rb")!;
    if (rb.shape.type !== "hull") throw new Error("hull");
    expect(Math.max(...rb.shape.points.filter((_, i) => i % 3 === 1))).toBeCloseTo(RAMP_BIG.height * UNIT_TO_M);
    expect(cs.find((c) => c.id === "sb")?.shape.type).toBe("hull");
    expect(cs.find((c) => c.id === "tw")).toMatchObject({ body: "fixed", restitution: TOYS.tireRestitution });
    expect(cs.filter((c) => c.id.startsWith("cr:"))).toHaveLength(6);
    expect(cs.filter((c) => c.id.startsWith("cr:")).every((c) => c.body === "dynamic" && c.prop === "crate")).toBe(true);
    expect(cs.find((c) => c.id === "co")).toMatchObject({ body: "dynamic", prop: "cone" });
  });

  it("gives boost pads no collider (the car checks them itself)", () => {
    expect(buildColliders([prop("bp", "boost_pad", 0, 0)], [], 12).find((c) => c.id === "bp")).toBeUndefined();
  });
});

describe("boost pads", () => {
  it("brings you up to pad speed along the pad, plus a kick", () => {
    const [dx, dz] = padKick(0, 0, 0);
    expect(dx).toBeCloseTo(0);
    expect(dz).toBeCloseTo(-(TOYS.padSpeed + TOYS.padKick));
  });
  it("fires the way you're going, from either end of the strip", () => {
    const [, north] = padKick(0, -10, 0);
    const [, south] = padKick(0, 10, 0);
    expect(north).toBeLessThan(0);
    expect(south).toBeGreaterThan(0);
    const [, fromRest] = padKick(0, 0, 0, 0, 1); // parked facing south
    expect(fromRest).toBeGreaterThan(0);
  });

  it("only kicks when you're already faster than pad speed", () => {
    const [, dz] = padKick(0, -40, 0);
    expect(dz).toBeCloseTo(-TOYS.padKick);
  });
});

describe("honking at buildings", () => {
  const bs = [building("ana", 0, 0, 20, 20), building("bob", 100, 0, 20, 20)];
  it("picks the building you're parked next to", () => {
    expect(honkTarget(bs, 18, 0, 0)?.login).toBe("ana");
    expect(honkTarget(bs, 88, 0, 1)?.login).toBe("bob");
  });
  it("needs you close and slow", () => {
    expect(honkTarget(bs, 50, 0, 0)).toBeNull();
    expect(honkTarget(bs, 18, 0, 20)).toBeNull();
  });
});
