import { describe, expect, it } from "vitest";
import { lPath, lWalk } from "./paint";

describe("lWalk", () => {
  it("walks x first, then z", () => {
    expect(lWalk([0, 0], [2, -2])).toEqual([[0, 0], [1, 0], [2, 0], [2, -1], [2, -2]]);
  });
  it("handles a single lot and straight lines", () => {
    expect(lWalk([1, 1], [1, 1])).toEqual([[1, 1]]);
    expect(lWalk([0, 3], [0, 1])).toEqual([[0, 3], [0, 2], [0, 1]]);
  });
});

describe("lPath", () => {
  const road = (x: number, z: number) => ({ x, z, item_type: "road" as const });
  const tree = (x: number, z: number) => ({ x, z, item_type: "tree_oak" as const });

  it("skips existing road lots", () => {
    expect(lPath([0, 0], [3, 0], [road(1, 0)], 6)).toEqual([[0, 0], [2, 0], [3, 0]]);
  });
  it("stops at an occupied lot", () => {
    expect(lPath([0, 0], [3, 0], [tree(2, 0)], 6)).toEqual([[0, 0], [1, 0]]);
  });
  it("stops at the edge", () => {
    expect(lPath([5, 0], [9, 0], [], 6)).toEqual([[5, 0], [6, 0]]);
  });
});
