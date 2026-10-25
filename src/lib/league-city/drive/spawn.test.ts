import { describe, expect, it } from "vitest";
import { LOT } from "../grid";
import { spawnPoint } from "./spawn";

const road = (x: number, z: number) => ({ kind: "item" as const, item_type: "road" as const, developer_id: null, x, z, px: null, pz: null });
const building = (id: number, x: number, z: number) => ({ kind: "building" as const, item_type: null, developer_id: id, x, z, px: null, pz: null });

describe("spawnPoint", () => {
  it("starts a building with no road beside it on the nearest road, not the entrance", () => {
    // A 3×3 block at 10..12 with roads round it; the building sits in its middle.
    const roads = [9, 10, 11, 12, 13].flatMap((x) => [road(x, 9), road(x, 13)]);
    const s = spawnPoint([...roads, building(7, 11, 11), road(0, 0)], 7, 40);
    expect(s.z).toBe(9 * LOT);
    expect(s.x).toBe(11 * LOT);
  });
});
