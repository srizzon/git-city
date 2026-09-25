import { describe, expect, it } from "vitest";
import type { CityBuilding } from "@/lib/github";
import { LOT } from "./grid";
import { MAX_FOOTPRINT, TOWN_MAX_HEIGHT, TOWN_MIN_HEIGHT, leagueBuildings, scaleTownHeights, townHeights } from "./buildings";
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

describe("townHeights", () => {
  it("maps the town's range onto one to four lots, order kept", () => {
    const out = townHeights([30, 900, 120, 4000]);
    expect(out[0]).toBe(TOWN_MIN_HEIGHT);
    expect(out[3]).toBe(TOWN_MAX_HEIGHT);
    expect(out[0] < out[2] && out[2] < out[1] && out[1] < out[3]).toBe(true);
  });

  it("spreads close raw heights across the whole range", () => {
    const out = townHeights([500, 505, 510, 515, 520]);
    expect(out[0]).toBe(TOWN_MIN_HEIGHT);
    expect(out[4]).toBe(TOWN_MAX_HEIGHT);
    // Most stay low: the middle building is under the halfway height.
    expect(out[2]).toBeLessThan((TOWN_MIN_HEIGHT + TOWN_MAX_HEIGHT) / 2);
  });

  it("keeps equal heights equal", () => {
    const out = townHeights([100, 300, 100]);
    expect(out[0]).toBe(out[2]);
  });

  it("puts a town of equals in the middle", () => {
    const mid = Math.round((TOWN_MIN_HEIGHT + TOWN_MAX_HEIGHT) / 2);
    expect(townHeights([500, 500])).toEqual([mid, mid]);
    expect(townHeights([700])).toEqual([mid]);
  });

  it("rescales every building and its floors", () => {
    const out = scaleTownHeights(new Map([[1, b("a", 20, 20)], [2, { ...b("b", 20, 20), height: 800 }]]));
    expect([out.get(1)?.height, out.get(2)?.height]).toEqual([TOWN_MIN_HEIGHT, TOWN_MAX_HEIGHT]);
    expect(out.get(2)?.floors).toBe(Math.floor(TOWN_MAX_HEIGHT / 6));
  });
});
