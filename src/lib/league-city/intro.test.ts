import { describe, expect, it } from "vitest";
import { LOT, worldBounds } from "./grid";
import { INTRO_SECONDS, introPath, type IntroPieces } from "./intro";

const full: IntroPieces = {
  h: 6,
  portal: [0, 4],
  plaza: [LOT, 0],
  billboards: [[3 * LOT, -4 * LOT], [LOT, -LOT]],
  sky: [{ x: 0, z: -5 * LOT, alt: 180 }],
  signSide: "north",
  landing: { x: 2 * LOT, z: -3 * LOT, top: 120 },
};

describe("introPath", () => {
  it("starts high in the sky south of the city and lands looking at the building", () => {
    const p = introPath(full);
    expect(p.pos[0][1]).toBeGreaterThan(200);
    expect(p.pos[0][2]).toBeGreaterThan(worldBounds(6).maxZ);
    expect(p.look.at(-1)).toEqual([2 * LOT, 135, -3 * LOT]);
    expect(p.pos).toHaveLength(p.look.length);
    expect(p.duration).toBe(INTRO_SECONDS);
  });

  it("flies low through the portal", () => {
    const p = introPath(full);
    const through = p.pos.findIndex(([, y, z]) => y < 15 && z < 4);
    expect(through).toBeGreaterThan(0);
  });

  it("passes the nearest billboard and the plane", () => {
    const p = introPath(full);
    expect(p.look).toContainEqual([LOT, 18, -LOT]);
    expect(p.look).toContainEqual([0, 180, -5 * LOT]);
  });

  it("drops the segments of missing pieces", () => {
    const bare = introPath({ ...full, plaza: null, billboards: [], sky: [], signSide: null, landing: null });
    expect(bare.pos.length).toBe(introPath(full).pos.length - 4);
    expect(bare.pos.every(([, y]) => y > 0)).toBe(true);
    expect(bare.pos.every((v) => v.every(Number.isFinite))).toBe(true);
  });

  it("ends the turn across the city from the hill sign, looking at it", () => {
    const p = introPath({ ...full, landing: null, signSide: "east" });
    expect(p.look.at(-1)![0]).toBeGreaterThan(200);
    expect(p.pos.at(-1)![0]).toBeLessThan(-100);
  });

  it("rises straight up before crossing the rooftops", () => {
    const p = introPath({ ...full, tallest: 190 });
    const board = p.look.findIndex(([x, y, z]) => x === LOT && y === 18 && z === -LOT);
    expect(p.pos[board + 1][0]).toBe(p.pos[board][0]);
    expect(p.pos[board + 1][1]).toBeGreaterThan(230);
  });

  it("keeps the climb and the turn above the tallest building", () => {
    const p = introPath({ ...full, tallest: 190 });
    const plane = p.look.findIndex(([x, y, z]) => x === 0 && y === 180 && z === -5 * LOT);
    expect(p.pos[plane][1]).toBeGreaterThanOrEqual(230);
  });
});
