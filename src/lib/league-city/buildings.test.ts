import { describe, expect, it } from "vitest";
import type { CityBuilding } from "@/lib/github";
import { LOT } from "./grid";
import { MAX_FOOTPRINT, leagueBuildings } from "./buildings";
import type { CityObject } from "./types";

const b = (login: string, width: number, depth: number) =>
  ({ login, loginLower: login, width, depth, height: 100, position: [999, 0, 999] }) as unknown as CityBuilding;

const obj = (developer_id: number, x: number, z: number, rot: 0 | 90 | 180 | 270 = 0): CityObject => ({
  id: String(developer_id),
  kind: "building",
  item_type: null,
  developer_id,
  x,
  z,
  rot,
  is_new: false,
});

describe("leagueBuildings", () => {
  it("centers buildings on their lots and skips unknown devs", () => {
    const out = leagueBuildings([obj(1, 2, -1), obj(9, 0, 0)], new Map([[1, b("a", 30, 20)]]));
    expect(out).toHaveLength(1);
    expect(out[0].position).toEqual([2 * LOT, 0, -LOT]);
  });

  it("caps the footprint and swaps it when turned", () => {
    const [out] = leagueBuildings([obj(1, 0, 0, 90)], new Map([[1, b("a", 60, 20)]]));
    expect(out.width).toBe(20);
    expect(out.depth).toBe(MAX_FOOTPRINT);
  });
});
