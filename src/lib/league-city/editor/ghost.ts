// ─── Ghost fit ──────────────────────────────────────────────
// Whether a click at the cursor would work, with the reducer's rules, so the
// ghost is green exactly when it would. `replaces` marks a surface that a
// click would swap out (shown yellow), `swapWith` a building swap.

import { inBounds } from "../grid";
import { PROP_PROBLEM_TEXT, propProblem, snap } from "../props";
import { isSurface, type CityObject, type ItemType } from "../types";
import { lotObjectAt, type EditorState, type Spot } from "./state";

export type GhostFit =
  | { ok: true; replaces?: CityObject; swapWith?: string; px?: number; pz?: number }
  | { ok: false; reason: string; px?: number; pz?: number };

function propsNearLot(s: Pick<EditorState, "objects" | "size">, x: number, z: number): boolean {
  const probe = new Map(s.objects);
  probe.set("__probe", { id: "__probe", kind: "building", item_type: null, developer_id: 0, x, z, px: null, pz: null, rot: 0, is_new: false });
  for (const o of s.objects.values()) {
    if (o.px === null || o.pz === null || !o.item_type || Math.abs(o.x - x) > 1 || Math.abs(o.z - z) > 1) continue;
    if (propProblem(probe.values(), s.size, { item_type: o.item_type, px: o.px, pz: o.pz, id: o.id }) === "on_building") return true;
  }
  return false;
}

function propFit(s: Pick<EditorState, "objects" | "size">, item: ItemType, spot: Spot, id?: string): GhostFit {
  const px = snap(spot.wx, spot.free);
  const pz = snap(spot.wz, spot.free);
  const problem = propProblem(s.objects.values(), s.size, { item_type: item, px, pz, id });
  return problem ? { ok: false, reason: PROP_PROBLEM_TEXT[problem], px, pz } : { ok: true, px, pz };
}

function surfaceFit(s: Pick<EditorState, "objects" | "size">, item: ItemType, spot: Spot): GhostFit {
  if (!inBounds(s.size, spot.x, spot.z)) return { ok: false, reason: "That's outside the city." };
  const there = lotObjectAt(s.objects, spot.x, spot.z);
  if (there?.kind === "building") return { ok: false, reason: "A building is there." };
  if (there && there.item_type !== item) return { ok: true, replaces: there };
  return { ok: true };
}

export function ghostFit(s: Pick<EditorState, "objects" | "size" | "held" | "tool">, spot: Spot): GhostFit | null {
  const held = s.held ? s.objects.get(s.held) : undefined;
  if (held) {
    if (held.px !== null && held.item_type) return propFit(s, held.item_type, spot, held.id);
    if (!inBounds(s.size, spot.x, spot.z)) return { ok: false, reason: "That's outside the city." };
    const there = lotObjectAt(s.objects, spot.x, spot.z);
    if (held.kind === "building" && propsNearLot(s, spot.x, spot.z)) return { ok: false, reason: "Props are on that lot." };
    if (!there || there.id === held.id) return { ok: true };
    if (held.kind === "building" && there.kind === "building") return { ok: true, swapWith: there.id };
    return { ok: false, reason: "That lot is taken." };
  }
  if (s.tool.kind === "road") return surfaceFit(s, "road", spot);
  if (s.tool.kind === "place") return isSurface(s.tool.item) ? surfaceFit(s, s.tool.item, spot) : propFit(s, s.tool.item, spot);
  return null;
}
