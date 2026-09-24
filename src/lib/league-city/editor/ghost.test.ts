import { describe, expect, it } from "vitest";
import type { CityObject } from "../types";
import { initEditor } from "./state";
import { ghostFit } from "./ghost";

const o = (id: string, kind: "building" | "item", x: number, z: number): CityObject => ({
  id, kind, item_type: kind === "item" ? "lamp" : null, developer_id: kind === "building" ? 1 : null, x, z, rot: 0, is_new: false,
});
const s = initEditor({ size: 12, version: 1, objects: [o("a", "building", 1, 0), o("b", "building", 2, 0), o("t", "item", 3, 3)] });

describe("ghostFit", () => {
  it("is green on a free lot and red on a taken one or outside", () => {
    expect(ghostFit(s, 0, 4)).toEqual({ ok: true });
    expect(ghostFit(s, 3, 3)).toEqual({ ok: false, reason: "lot_taken" });
    expect(ghostFit(s, 6, 0)).toEqual({ ok: false, reason: "out_of_bounds" });
  });
  it("allows a held building onto another building (swap) and onto its own lot", () => {
    expect(ghostFit({ ...s, held: "a" }, 2, 0)).toEqual({ ok: true, swapWith: "b" });
    expect(ghostFit({ ...s, held: "a" }, 1, 0)).toEqual({ ok: true });
    expect(ghostFit({ ...s, held: "a" }, 3, 3)).toEqual({ ok: false, reason: "lot_taken" });
    expect(ghostFit({ ...s, held: "t" }, 1, 0)).toEqual({ ok: false, reason: "lot_taken" });
  });
});
