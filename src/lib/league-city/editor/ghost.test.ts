import { describe, expect, it } from "vitest";
import { LOT } from "../grid";
import type { CityObject } from "../types";
import { initEditor, type Spot } from "./state";
import { ghostFit } from "./ghost";

const o = (id: string, kind: "building" | "item", item: CityObject["item_type"], x: number, z: number, prop = false): CityObject => ({
  id, kind, item_type: item, developer_id: kind === "building" ? 1 : null, x, z,
  px: prop ? x * LOT : null, pz: prop ? z * LOT : null, rot: 0, is_new: false,
});
// Test z shifted by -6 lots so it sits inside the anchored city (z <= 0).
const base = initEditor({
  h: 6,
  version: 1,
  objects: [o("a", "building", null, 1, -6), o("b", "building", null, 2, -6), o("p", "item", "plaza", 3, -3), o("t", "item", "tree_oak", -3, -9, true)],
});
const lot = (x: number, z: number): Spot => ({ x, z: z - 6, wx: x * LOT, wz: (z - 6) * LOT });

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
    expect(ghostFit(s, lot(7, 0))).toMatchObject({ ok: false });
  });
  it("held building: swap onto a building, refuse props or other lot objects", () => {
    const s = { ...base, held: "a" };
    expect(ghostFit(s, lot(2, 0))).toMatchObject({ ok: true, swapWith: "b" });
    expect(ghostFit(s, lot(1, 0))).toMatchObject({ ok: true });
    expect(ghostFit(s, lot(3, 3))).toMatchObject({ ok: false });
    expect(ghostFit(s, lot(-3, -3))).toMatchObject({ ok: false });
  });
  it("shows the limit and the lock", () => {
    const s = { ...base, tool: { kind: "place" as const, item: "billboard" as const }, hasLogo: false };
    expect(ghostFit(s, lot(3, 3))).toMatchObject({ ok: false, reason: expect.stringMatching(/logo/i) });
    const locked = initEditor({ h: 6, version: 1, objects: [{ ...o("e", "item", "road", 0, 0), locked: true }] });
    expect(ghostFit({ ...locked, tool: { kind: "place", item: "plaza" } }, { x: 0, z: 0, wx: 0, wz: 0 })).toMatchObject({ ok: false, reason: "The entrance is fixed." });
  });
});
