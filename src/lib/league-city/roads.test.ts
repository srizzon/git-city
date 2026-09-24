import { describe, expect, it } from "vitest";
import { E, N, S, W, roadMask, roadPiece } from "./roads";

describe("roadPiece", () => {
  const cases: [number, string, number][] = [
    [0, "single", 0],
    [N, "end", 0],
    [E, "end", 90],
    [S, "end", 180],
    [W, "end", 270],
    [N | S, "straight", 0],
    [E | W, "straight", 90],
    [N | E, "corner", 0],
    [E | S, "corner", 90],
    [S | W, "corner", 180],
    [W | N, "corner", 270],
    [N | E | S, "tee", 0],
    [E | S | W, "tee", 90],
    [S | W | N, "tee", 180],
    [W | N | E, "tee", 270],
    [N | E | S | W, "cross", 0],
  ];

  it("covers all 16 masks", () => {
    expect(new Set(cases.map((c) => c[0])).size).toBe(16);
  });

  it.each(cases)("mask %i → %s at %i°", (mask, shape, rot) => {
    expect(roadPiece(mask)).toEqual({ shape, rot });
  });
});

describe("roadMask", () => {
  it("reads the 4 neighbors", () => {
    const roads = new Set(["0,-1", "1,0"]);
    expect(roadMask((x, z) => roads.has(`${x},${z}`), 0, 0)).toBe(N | E);
  });
});
