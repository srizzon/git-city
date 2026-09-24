// ─── League city editor state ───────────────────────────────
// Pure reducer. Edits apply optimistically to `objects`; every edit becomes
// `{ops, inverse}`: ops wait in `pending` for the autosave queue, the inverse
// goes on the undo stack. One edit is never split across save batches, so a
// swap (two moves) always reaches the server together.
//
// Buildings, roads and plazas own lots. Props (lamps, benches, trees,
// fountains) stand anywhere their footprint fits (see props.ts): on plazas,
// on grass, on a road's sidewalk.

import { lotKey } from "../placement";
import { inBounds } from "../grid";
import { PROP_PROBLEM_TEXT, lotOf, propAt, propProblem, snap } from "../props";
import { isSurface, type CityObject, type CityOp, type ItemType, type PropType } from "../types";

// ─── Types ──────────────────────────────────────────────────

export type Tool =
  | { kind: "select" }
  | { kind: "place"; item: ItemType }
  | { kind: "road" }
  | { kind: "bulldoze" };

export type HotbarTab = "streets" | "nature" | "plaza" | "buildings";

/** One user action: what to send, and how to take it back. */
export interface Edit {
  id: number;
  ops: CityOp[];
  inverse: CityOp[];
}

export interface Notice {
  kind: "hint" | "error" | "info";
  message: string;
  /** Changes every time, so the same message can toast twice. */
  seq: number;
}

export interface EditorState {
  objects: Map<string, CityObject>;
  size: number;
  version: number;
  tool: Tool;
  hotbarTab: HotbarTab;
  slot: number;
  /** Object picked up and following the cursor (The Sims build mode). */
  held: string | null;
  /** Rotation of the held object; applied when it's dropped. */
  heldRot: number;
  /** Rotation for the next prop placed from the hotbar. */
  placeRot: number;
  selection: string | null;
  undo: Edit[];
  redo: Edit[];
  /** Edits not sent yet, oldest first. */
  pending: Edit[];
  /** The batch the server is working on. */
  inflight: Edit[] | null;
  notice: Notice | null;
  seq: number;
}

export interface CitySnapshot {
  size: number;
  version: number;
  objects: CityObject[];
}

/** Where the pointer is: the lot under it and the exact ground point. */
export interface Spot {
  x: number;
  z: number;
  wx: number;
  wz: number;
  /** Shift: no 4-unit snap for props. */
  free?: boolean;
  /** The prop under the pointer on screen, if any (beats the ground point). */
  propId?: string;
}

export type EditorAction =
  | { type: "setTool"; tool: Tool }
  | { type: "setTab"; tab: HotbarTab }
  | { type: "setSlot"; slot: number }
  | { type: "select"; id: string | null }
  | ({ type: "place"; id: string } & Spot)
  | { type: "paintRoad"; lots: [number, number][]; ids: string[] }
  | { type: "pickUp"; id: string }
  | ({ type: "drop" } & Spot)
  | { type: "cancel" }
  | { type: "rotate"; id?: string }
  | { type: "remove"; id: string }
  | ({ type: "removeAt" } & Spot)
  | { type: "dismissNew"; id: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "send"; maxOps?: number }
  | { type: "ack"; version: number }
  | { type: "reject"; message?: string }
  | { type: "resync"; city: CitySnapshot }
  | { type: "notify"; kind: Notice["kind"]; message: string };

export const MAX_BATCH_OPS = 200;
export const PROP_TURN = 45;

export const HOTBAR: Record<Exclude<HotbarTab, "buildings">, ItemType[]> = {
  streets: ["road", "lamp", "bench"],
  nature: ["tree_default", "tree_oak", "tree_fat", "tree_detailed", "tree_palm_tall", "tree_pine_tall_a"],
  plaza: ["plaza", "fountain"],
};

// ─── Applying ops locally ───────────────────────────────────

/** Whether every op can apply to `objects`, in order. */
export function canApply(objects: ReadonlyMap<string, CityObject>, ops: readonly CityOp[]): boolean {
  const alive = new Set(objects.keys());
  for (const op of ops) {
    if (op.op === "place") {
      if (op.id && alive.has(op.id)) return false;
      if (op.id) alive.add(op.id);
    } else if ("id" in op) {
      if (!alive.has(op.id)) return false;
      if (op.op === "remove") alive.delete(op.id);
    }
  }
  return true;
}

/** Applies ops to a copy of `objects`, mirroring apply_league_city_ops for an admin. */
export function applyLocal(objects: ReadonlyMap<string, CityObject>, ops: readonly CityOp[]): Map<string, CityObject> {
  const next = new Map(objects);
  for (const op of ops) {
    switch (op.op) {
      case "place": {
        const id = op.id ?? `local-${next.size}`;
        const rot = op.rot ?? 0;
        if (op.kind === "building") {
          next.set(id, { id, kind: "building", item_type: null, developer_id: op.developer_id, x: op.x, z: op.z, px: null, pz: null, rot, is_new: false });
        } else if ("px" in op) {
          const [x, z] = lotOf(op.px, op.pz);
          next.set(id, { id, kind: "item", item_type: op.item_type, developer_id: null, x, z, px: op.px, pz: op.pz, rot, is_new: false });
        } else if (isSurface(op.item_type)) {
          next.set(id, { id, kind: "item", item_type: op.item_type, developer_id: null, x: op.x, z: op.z, px: null, pz: null, rot, is_new: false });
        } else {
          // A lot-only prop op lands at the lot's center (server does the same).
          next.set(id, { id, kind: "item", item_type: op.item_type, developer_id: null, x: op.x, z: op.z, px: op.x * 48, pz: op.z * 48, rot, is_new: false });
        }
        break;
      }
      case "move": {
        const o = next.get(op.id);
        if (!o) break;
        if ("px" in op) {
          const [x, z] = lotOf(op.px, op.pz);
          next.set(op.id, { ...o, x, z, px: op.px, pz: op.pz });
        } else next.set(op.id, { ...o, x: op.x, z: op.z, is_new: false });
        break;
      }
      case "rotate": {
        const o = next.get(op.id);
        if (o) next.set(op.id, { ...o, rot: op.rot });
        break;
      }
      case "remove":
        if ("id" in op) next.delete(op.id);
        break;
      case "dismiss_new": {
        const o = next.get(op.id);
        if (o) next.set(op.id, { ...o, is_new: false });
        break;
      }
      default:
        break;
    }
  }
  return next;
}

/** The lot object (building, road, plaza) on a lot. Props don't own lots. */
export function lotObjectAt(objects: ReadonlyMap<string, CityObject>, x: number, z: number): CityObject | undefined {
  for (const o of objects.values()) if (o.px === null && o.x === x && o.z === z) return o;
  return undefined;
}

/** What a click at this spot grabs: a prop under the cursor first, else the lot's object. */
export function objectAtSpot(objects: ReadonlyMap<string, CityObject>, spot: Spot): CityObject | undefined {
  if (spot.propId && objects.has(spot.propId)) return objects.get(spot.propId);
  const p = propAt(objects.values(), spot.wx, spot.wz);
  return p ? objects.get(p.id) : lotObjectAt(objects, spot.x, spot.z);
}

export function placeOp(o: CityObject): CityOp {
  if (o.kind === "building") return { op: "place", kind: "building", developer_id: o.developer_id!, x: o.x, z: o.z, rot: o.rot, id: o.id };
  if (o.px !== null && o.pz !== null) return { op: "place", kind: "item", item_type: o.item_type as PropType, px: o.px, pz: o.pz, rot: o.rot, id: o.id };
  return { op: "place", kind: "item", item_type: o.item_type as "road" | "plaza", x: o.x, z: o.z, rot: o.rot, id: o.id };
}

/**
 * Props that no longer fit once `ops` apply (a new road took their
 * sidewalk), as remove ops plus the places that bring them back on undo.
 */
function evictedProps(s: EditorState, ops: CityOp[]): { removes: CityOp[]; restores: CityOp[] } {
  const after = applyLocal(s.objects, ops);
  const removes: CityOp[] = [];
  const restores: CityOp[] = [];
  for (const o of after.values()) {
    if (o.px === null || o.pz === null || !o.item_type) continue;
    if (!s.objects.has(o.id)) continue; // placed by this edit: checked by the caller
    if (propProblem(after.values(), s.size, { item_type: o.item_type, px: o.px, pz: o.pz, id: o.id }) === "on_road") {
      removes.push({ op: "remove", id: o.id });
      restores.push(placeOp(s.objects.get(o.id)!));
    }
  }
  return { removes, restores };
}

/** A building landing on a lot must not sit on props there. */
function propsOnLot(objects: ReadonlyMap<string, CityObject>, x: number, z: number, size: number): boolean {
  const probe = new Map(objects);
  probe.set("__probe", { id: "__probe", kind: "building", item_type: null, developer_id: 0, x, z, px: null, pz: null, rot: 0, is_new: false });
  for (const o of objects.values()) {
    if (o.px === null || o.pz === null || !o.item_type) continue;
    if (Math.abs(o.x - x) > 1 || Math.abs(o.z - z) > 1) continue;
    if (propProblem(probe.values(), size, { item_type: o.item_type, px: o.px, pz: o.pz, id: o.id }) === "on_building") return true;
  }
  return false;
}

// ─── Reducer helpers ────────────────────────────────────────

function normalize(o: CityObject): CityObject {
  return { ...o, px: o.px ?? null, pz: o.pz ?? null };
}

export function initEditor(city: CitySnapshot): EditorState {
  return {
    objects: new Map(city.objects.map((o) => [o.id, normalize(o)])),
    size: city.size,
    version: city.version,
    tool: { kind: "select" },
    hotbarTab: "streets",
    slot: 0,
    held: null,
    heldRot: 0,
    placeRot: 0,
    selection: null,
    undo: [],
    redo: [],
    pending: [],
    inflight: null,
    notice: null,
    seq: 0,
  };
}

function notify(s: EditorState, kind: Notice["kind"], message: string): EditorState {
  return { ...s, notice: { kind, message, seq: s.seq + 1 }, seq: s.seq + 1 };
}

/** Records a new user edit: apply, queue, push the inverse, clear redo. */
function commit(s: EditorState, ops: CityOp[], inverse: CityOp[], undoable = true): EditorState {
  if (ops.length === 0) return s;
  const edit: Edit = { id: s.seq + 1, ops, inverse };
  return {
    ...s,
    seq: s.seq + 1,
    objects: applyLocal(s.objects, ops),
    pending: [...s.pending, edit],
    undo: undoable ? [...s.undo, edit] : s.undo,
    redo: undoable ? [] : s.redo,
  };
}

/** Undo/redo: replays one stack entry as a new edit and moves it to the other stack. */
function replay(s: EditorState, from: "undo" | "redo"): EditorState {
  const stack = s[from];
  const entry = stack[stack.length - 1];
  if (!entry) return s;
  const rest = stack.slice(0, -1);
  const ops = from === "undo" ? entry.inverse : entry.ops;
  const back = from === "undo" ? entry.ops : entry.inverse;

  if (!canApply(s.objects, ops) || !fits(s, ops)) {
    return notify({ ...s, [from]: rest }, "info", `That change can't be ${from === "undo" ? "undone" : "redone"}: the city changed since.`);
  }
  const edit: Edit = { id: s.seq + 1, ops, inverse: back };
  const stored: Edit = from === "undo" ? { id: edit.id, ops: back, inverse: ops } : edit;
  const next: EditorState = {
    ...s,
    seq: s.seq + 1,
    objects: applyLocal(s.objects, ops),
    pending: [...s.pending, edit],
    [from]: rest,
  };
  return from === "undo" ? { ...next, redo: [...s.redo, stored] } : { ...next, undo: [...s.undo, stored] };
}

/** True when lot objects don't collide and the props an op touches still stand. */
function fits(s: EditorState, ops: readonly CityOp[]): boolean {
  const after = applyLocal(s.objects, ops);
  const seen = new Set<string>();
  for (const o of after.values()) {
    if (o.px !== null) continue;
    const k = lotKey(o.x, o.z);
    if (seen.has(k) || !inBounds(s.size, o.x, o.z)) return false;
    seen.add(k);
  }
  const touched = new Set(ops.flatMap((op) => ("id" in op && op.id ? [op.id] : [])));
  for (const o of after.values()) {
    if (o.px === null || o.pz === null || !o.item_type || !touched.has(o.id)) continue;
    if (propProblem(after.values(), s.size, { item_type: o.item_type, px: o.px, pz: o.pz, id: o.id })) return false;
  }
  return true;
}

function dropEntries(stack: Edit[], ids: Set<number>): Edit[] {
  return stack.filter((e) => !ids.has(e.id));
}

function propSpot(spot: Spot): [number, number] {
  return [snap(spot.wx, spot.free), snap(spot.wz, spot.free)];
}

// ─── Reducer ────────────────────────────────────────────────

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case "setTool":
      return { ...s, tool: a.tool, held: null, selection: null, placeRot: 0 };

    case "setTab":
      return { ...s, hotbarTab: a.tab, slot: 0 };

    case "setSlot":
      return { ...s, slot: a.slot };

    case "select":
      return { ...s, selection: a.id && s.objects.has(a.id) ? a.id : null, held: null };

    case "place": {
      if (s.tool.kind !== "place") return s;
      const item = s.tool.item;

      if (!isSurface(item)) {
        const [px, pz] = propSpot(a);
        const problem = propProblem(s.objects.values(), s.size, { item_type: item, px, pz });
        if (problem) return notify(s, "hint", PROP_PROBLEM_TEXT[problem]);
        return commit(
          s,
          [{ op: "place", kind: "item", item_type: item, px, pz, rot: s.placeRot, id: a.id }],
          [{ op: "remove", id: a.id }],
        );
      }

      // Surfaces own the lot; one on top of another replaces it.
      if (!inBounds(s.size, a.x, a.z)) return notify(s, "hint", "That's outside the city.");
      const there = lotObjectAt(s.objects, a.x, a.z);
      if (there?.kind === "building") return notify(s, "hint", "A building is there. Move it first.");
      if (there?.item_type === item) return s;
      const place: CityOp = { op: "place", kind: "item", item_type: item, x: a.x, z: a.z, rot: 0, id: a.id };
      const ops: CityOp[] = there ? [{ op: "remove", id: there.id }, place] : [place];
      const inverse: CityOp[] = there ? [{ op: "remove", id: a.id }, placeOp(there)] : [{ op: "remove", id: a.id }];
      const evicted = evictedProps(s, ops);
      return commit(s, [...evicted.removes, ...ops], [...inverse, ...evicted.restores]);
    }

    case "paintRoad": {
      const removes: CityOp[] = [];
      const places: CityOp[] = [];
      const inverse: CityOp[] = [];
      const restores: CityOp[] = [];
      a.lots.forEach(([x, z], i) => {
        const id = a.ids[i];
        if (!id || !inBounds(s.size, x, z)) return;
        const there = lotObjectAt(s.objects, x, z);
        if (there?.kind === "building" || there?.item_type === "road") return;
        if (there) {
          removes.push({ op: "remove", id: there.id });
          restores.push(placeOp(there));
        }
        places.push({ op: "place", kind: "item", item_type: "road", x, z, rot: 0, id });
        inverse.push({ op: "remove", id });
      });
      const ops = [...removes, ...places];
      const evicted = evictedProps(s, ops);
      return commit(s, [...evicted.removes, ...ops], [...inverse, ...restores, ...evicted.restores]);
    }

    case "pickUp": {
      const o = s.objects.get(a.id);
      return o ? { ...s, held: o.id, heldRot: o.rot, selection: o.id } : s;
    }

    case "cancel":
      if (s.held) return { ...s, held: null, selection: null };
      if (s.selection) return { ...s, selection: null };
      if (s.tool.kind !== "select") return { ...s, tool: { kind: "select" }, placeRot: 0 };
      return s;

    case "drop": {
      const h = s.held ? s.objects.get(s.held) : undefined;
      if (!h) return { ...s, held: null };
      const put = (next: EditorState) => ({ ...next, held: null, selection: null });
      const turn: { ops: CityOp[]; inverse: CityOp[] } =
        s.heldRot !== h.rot
          ? { ops: [{ op: "rotate", id: h.id, rot: s.heldRot }], inverse: [{ op: "rotate", id: h.id, rot: h.rot }] }
          : { ops: [], inverse: [] };

      // Props go where the cursor is.
      if (h.px !== null && h.pz !== null && h.item_type) {
        const [px, pz] = propSpot(a);
        if (px === h.px && pz === h.pz) return put(commit(s, turn.ops, turn.inverse));
        const problem = propProblem(s.objects.values(), s.size, { item_type: h.item_type, px, pz, id: h.id });
        if (problem) return notify(s, "hint", PROP_PROBLEM_TEXT[problem]);
        return put(
          commit(s, [{ op: "move", id: h.id, px, pz }, ...turn.ops], [...turn.inverse, { op: "move", id: h.id, px: h.px, pz: h.pz }]),
        );
      }

      if (h.x === a.x && h.z === a.z) return put(commit(s, turn.ops, turn.inverse));
      if (!inBounds(s.size, a.x, a.z)) return notify(s, "hint", "That's outside the city.");
      const there = lotObjectAt(s.objects, a.x, a.z);
      if (h.kind === "building" && propsOnLot(s.objects, a.x, a.z, s.size)) {
        return notify(s, "hint", "Move the props off that lot first.");
      }
      if (there) {
        if (h.kind === "building" && there.kind === "building") {
          // Swap: both moves (and the turn) in one edit, so they share a batch.
          const ops: CityOp[] = [
            { op: "move", id: h.id, x: a.x, z: a.z },
            { op: "move", id: there.id, x: h.x, z: h.z },
            ...turn.ops,
          ];
          const inverse: CityOp[] = [
            ...turn.inverse,
            { op: "move", id: h.id, x: h.x, z: h.z },
            { op: "move", id: there.id, x: there.x, z: there.z },
          ];
          return put(commit(s, ops, inverse));
        }
        return notify(s, "hint", "That lot is taken.");
      }
      const ops: CityOp[] = [{ op: "move", id: h.id, x: a.x, z: a.z }, ...turn.ops];
      const evicted = h.item_type === "road" ? evictedProps(s, ops) : { removes: [], restores: [] };
      return put(
        commit(s, [...evicted.removes, ...ops], [...turn.inverse, { op: "move", id: h.id, x: h.x, z: h.z }, ...evicted.restores]),
      );
    }

    case "rotate": {
      // Nothing named: turn what's in hand, or the next prop to place.
      const id = a.id ?? s.held;
      if (!id) {
        if (s.tool.kind === "place" && !isSurface(s.tool.item)) return { ...s, placeRot: (s.placeRot + PROP_TURN) % 360 };
        return s;
      }
      const o = s.objects.get(id);
      if (!o) return s;
      const step = o.px !== null ? PROP_TURN : 90;
      // In hand: turn the ghost; the turn lands with the drop.
      if (id === s.held) return { ...s, heldRot: (s.heldRot + step) % 360 };
      const rot = (o.rot + step) % 360;
      return commit(s, [{ op: "rotate", id: o.id, rot }], [{ op: "rotate", id: o.id, rot: o.rot }]);
    }

    case "remove": {
      const o = s.objects.get(a.id);
      if (!o) return s;
      if (o.kind === "building") return notify(s, "hint", "Buildings stay in the city. Remove people in Settings.");
      const next = commit(s, [{ op: "remove", id: o.id }], [placeOp(o)]);
      return { ...next, selection: next.selection === o.id ? null : next.selection, held: next.held === o.id ? null : next.held };
    }

    case "removeAt": {
      const o = objectAtSpot(s.objects, a);
      return o ? editorReducer(s, { type: "remove", id: o.id }) : s;
    }

    case "dismissNew": {
      const o = s.objects.get(a.id);
      if (!o || !o.is_new) return s;
      return commit(s, [{ op: "dismiss_new", id: o.id }], [], false);
    }

    case "undo":
      return replay(s, "undo");

    case "redo":
      return replay(s, "redo");

    case "send": {
      if (s.inflight || s.pending.length === 0) return s;
      const max = a.maxOps ?? MAX_BATCH_OPS;
      const batch: Edit[] = [];
      let n = 0;
      for (const e of s.pending) {
        if (batch.length > 0 && n + e.ops.length > max) break;
        batch.push(e);
        n += e.ops.length;
      }
      return { ...s, inflight: batch, pending: s.pending.slice(batch.length) };
    }

    case "ack":
      return { ...s, inflight: null, version: a.version };

    case "reject": {
      // Roll back the batch and everything queued after it (built on top of
      // it), newest first, and forget their undo/redo entries.
      const rolled = [...(s.inflight ?? []), ...s.pending];
      let objects: Map<string, CityObject> = s.objects;
      for (let i = rolled.length - 1; i >= 0; i--) objects = applyLocal(objects, rolled[i].inverse);
      const ids = new Set(rolled.map((e) => e.id));
      const next: EditorState = {
        ...s,
        objects,
        inflight: null,
        pending: [],
        undo: dropEntries(s.undo, ids),
        redo: dropEntries(s.redo, ids),
        held: null,
        selection: s.selection && objects.has(s.selection) ? s.selection : null,
      };
      return a.message ? notify(next, "error", a.message) : next;
    }

    case "resync": {
      // Server truth, with our unsent edits replayed on top where they still apply.
      let objects = new Map(a.city.objects.map((o) => [o.id, normalize(o)]));
      const pending: Edit[] = [];
      for (const e of s.pending) {
        if (!canApply(objects, e.ops)) continue;
        objects = applyLocal(objects, e.ops);
        pending.push(e);
      }
      const undo = s.undo.filter((e) => canApply(objects, e.inverse));
      const redo = s.redo.filter((e) => canApply(objects, e.ops));
      return {
        ...s,
        objects,
        size: a.city.size,
        version: a.city.version,
        pending,
        undo,
        redo,
        held: s.held && objects.has(s.held) ? s.held : null,
        selection: s.selection && objects.has(s.selection) ? s.selection : null,
      };
    }

    case "notify":
      return notify(s, a.kind, a.message);

    default:
      return s;
  }
}

/** Objects list for rendering. */
export function objectList(s: EditorState): CityObject[] {
  return [...s.objects.values()];
}
