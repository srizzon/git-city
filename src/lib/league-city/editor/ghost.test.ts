import { describe, expect, it } from "vitest";
import { LOT } from "../grid";
import type { CityObject } from "../types";
import { initEditor, type Spot } from "./state";
import { ghostFit } from "./ghost";

const o = (id: string, kind: "building" | "item", item: CityObject["item_type"], x: number, z: number, prop = false): CityObject => ({
  id, kind, item_type: item, developer_id: kind === "building" ? 1 : null, x, z,
  px: prop ? x * LOT : null, pz: prop ? z * LOT : null, rot: 0, is_new: false,
});
const base = initEditor({
  size: 12,
  version: 1,
  objects: [o("a", "building", null, 1, 0), o("b", "building", null, 2, 0), o("p", "item", "plaza", 3, 3), o("t", "item", "tree_oak", -3, -3, true)],
});
const lot = (x: number, z: number): Spot => ({ x, z, wx: x * LOT, wz: z * LOT });

describe("ghostFit", () => {
  it("props: green on grass and plazas, red on buildings and other props", () => {
    const s = { ...base, tool: { kind: "place" as const, item: "bench" as const } };
    expect(ghostFit(s, lot(3, 3))).toMatchObject({ ok: true });
    expect(ghostFit(s, lot(1, 0))).toMatchObject({ ok: false });
    expect(ghostFit(s, lot(-3, -3))).toMatchObject({ ok: false });
  });
  it("surfaces: replacing another surface is allowed and flagged, a building is not", () => {
    const s = { ...base, tool: { kind: "road" as const } };
    expect(ghostFit(s, lot(3, 3))).toMatchObject({ ok: true, replaces: { id: "p" } });
    expect(ghostFit(s, lot(1, 0))).toMatchObject({ ok: false });
    expect(ghostFit(s, lot(6, 0))).toMatchObject({ ok: false });
  });
  it("held building: swap onto a building, refuse props or other lot objects", () => {
    const s = { ...base, held: "a" };
    expect(ghostFit(s, lot(2, 0))).toMatchObject({ ok: true, swapWith: "b" });
    expect(ghostFit(s, lot(1, 0))).toMatchObject({ ok: true });
    expect(ghostFit(s, lot(3, 3))).toMatchObject({ ok: false });
    expect(ghostFit(s, lot(-3, -3))).toMatchObject({ ok: false });
  });
});
