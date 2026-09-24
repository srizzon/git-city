// ─── Ghost fit ──────────────────────────────────────────────
// Whether the thing under the cursor can go on the hovered lot, mirroring the
// reducer's rules, so the ghost is green exactly when a click would work.

import { inBounds } from "../grid";
import type { CityObject } from "../types";
import type { EditorState } from "./state";

export type GhostFit =
  | { ok: true; swapWith?: string }
  | { ok: false; reason: "out_of_bounds" | "lot_taken" };

function objectAt(objects: ReadonlyMap<string, CityObject>, x: number, z: number) {
  for (const o of objects.values()) if (o.x === x && o.z === z) return o;
  return undefined;
}

export function ghostFit(s: Pick<EditorState, "objects" | "size" | "held">, x: number, z: number): GhostFit {
  if (!inBounds(s.size, x, z)) return { ok: false, reason: "out_of_bounds" };
  const there = objectAt(s.objects, x, z);
  if (!there) return { ok: true };
  const held = s.held ? s.objects.get(s.held) : undefined;
  if (held) {
    if (there.id === held.id) return { ok: true };
    if (held.kind === "building" && there.kind === "building") return { ok: true, swapWith: there.id };
  }
  return { ok: false, reason: "lot_taken" };
}
