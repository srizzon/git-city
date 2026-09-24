// ─── League city editor state ───────────────────────────────
// Pure reducer. Edits apply optimistically to `objects`; every edit becomes
// `{ops, inverse}`: ops wait in `pending` for the autosave queue, the inverse
// goes on the undo stack. One edit is never split across save batches, so a
// swap (two moves) always reaches the server together.

import { canPlace, lotKey } from "../placement";
import { inBounds, type Rot } from "../grid";
import type { CityObject, CityOp, ItemType } from "../types";

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
  heldRot: Rot;
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

export type EditorAction =
  | { type: "setTool"; tool: Tool }
  | { type: "setTab"; tab: HotbarTab }
  | { type: "setSlot"; slot: number }
  | { type: "select"; id: string | null }
  | { type: "place"; x: number; z: number; id: string }
  | { type: "paintRoad"; lots: [number, number][]; ids: string[] }
  | { type: "pickUp"; id: string }
  | { type: "drop"; x: number; z: number }
  | { type: "cancel" }
  | { type: "rotate"; id: string }
  | { type: "remove"; id: string }
  | { type: "removeAt"; x: number; z: number }
  | { type: "dismissNew"; id: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "send"; maxOps?: number }
  | { type: "ack"; version: number }
  | { type: "reject"; message?: string }
  | { type: "resync"; city: CitySnapshot }
  | { type: "notify"; kind: Notice["kind"]; message: string };

export const MAX_BATCH_OPS = 200;

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
        const id = op.id ?? `local-${next.size}-${op.x}-${op.z}`;
        next.set(
          id,
          op.kind === "item"
            ? { id, kind: "item", item_type: op.item_type, developer_id: null, x: op.x, z: op.z, rot: op.rot ?? 0, is_new: false }
            : { id, kind: "building", item_type: null, developer_id: op.developer_id, x: op.x, z: op.z, rot: op.rot ?? 0, is_new: false },
        );
        break;
      }
      case "move": {
        const o = next.get(op.id);
        if (o) next.set(op.id, { ...o, x: op.x, z: op.z, is_new: false });
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

function objectAt(objects: ReadonlyMap<string, CityObject>, x: number, z: number): CityObject | undefined {
  for (const o of objects.values()) if (o.x === x && o.z === z) return o;
  return undefined;
}

function placeOp(o: CityObject): CityOp {
  return o.kind === "item"
    ? { op: "place", kind: "item", item_type: o.item_type!, x: o.x, z: o.z, rot: o.rot, id: o.id }
    : { op: "place", kind: "building", developer_id: o.developer_id!, x: o.x, z: o.z, rot: o.rot, id: o.id };
}

// ─── Reducer helpers ────────────────────────────────────────

export function initEditor(city: CitySnapshot): EditorState {
  return {
    objects: new Map(city.objects.map((o) => [o.id, o])),
    size: city.size,
    version: city.version,
    tool: { kind: "select" },
    hotbarTab: "streets",
    slot: 0,
    held: null,
    heldRot: 0,
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

  if (!canApply(s.objects, ops) || !lotsFree(s, ops)) {
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

/** True when places and moves land on free lots once the whole list applies. */
function lotsFree(s: EditorState, ops: readonly CityOp[]): boolean {
  const after = applyLocal(s.objects, ops);
  const seen = new Set<string>();
  for (const o of after.values()) {
    const k = lotKey(o.x, o.z);
    if (seen.has(k)) return false;
    seen.add(k);
  }
  for (const op of ops) {
    if ((op.op === "place" || op.op === "move") && !inBounds(s.size, op.x, op.z)) return false;
  }
  return true;
}

function dropEntries(stack: Edit[], ids: Set<number>): Edit[] {
  return stack.filter((e) => !ids.has(e.id));
}

// ─── Reducer ────────────────────────────────────────────────

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case "setTool":
      return { ...s, tool: a.tool, held: null, selection: a.tool.kind === "select" ? s.selection : null };

    case "setTab":
      return { ...s, hotbarTab: a.tab, slot: 0 };

    case "setSlot":
      return { ...s, slot: a.slot };

    case "select":
      return { ...s, selection: a.id && s.objects.has(a.id) ? a.id : null, held: null };

    case "place": {
      if (s.tool.kind !== "place") return s;
      const fit = canPlace([...s.objects.values()], s.size, a.x, a.z);
      if (!fit.ok) return notify(s, "hint", fit.reason === "lot_taken" ? "That lot is taken." : "That's outside the city.");
      const op: CityOp = { op: "place", kind: "item", item_type: s.tool.item, x: a.x, z: a.z, rot: 0, id: a.id };
      return commit(s, [op], [{ op: "remove", id: a.id }]);
    }

    case "paintRoad": {
      const ops: CityOp[] = [];
      const inverse: CityOp[] = [];
      a.lots.forEach(([x, z], i) => {
        const id = a.ids[i];
        if (!id) return;
        ops.push({ op: "place", kind: "item", item_type: "road", x, z, rot: 0, id });
        inverse.unshift({ op: "remove", id });
      });
      return commit(s, ops, inverse);
    }

    case "pickUp": {
      const o = s.objects.get(a.id);
      return o ? { ...s, held: o.id, heldRot: o.rot, selection: o.id } : s;
    }

    case "cancel":
      if (s.held) return { ...s, held: null };
      if (s.selection) return { ...s, selection: null };
      if (s.tool.kind !== "select") return { ...s, tool: { kind: "select" } };
      return s;

    case "drop": {
      const h = s.held ? s.objects.get(s.held) : undefined;
      if (!h) return { ...s, held: null };
      const turn: { ops: CityOp[]; inverse: CityOp[] } =
        s.heldRot !== h.rot
          ? { ops: [{ op: "rotate", id: h.id, rot: s.heldRot }], inverse: [{ op: "rotate", id: h.id, rot: h.rot }] }
          : { ops: [], inverse: [] };
      const put = (next: EditorState) => ({ ...next, held: null, selection: null });
      if (h.x === a.x && h.z === a.z) return put(commit(s, turn.ops, turn.inverse));
      if (!inBounds(s.size, a.x, a.z)) return notify(s, "hint", "That's outside the city.");
      const there = objectAt(s.objects, a.x, a.z);
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
      return put(
        commit(
          s,
          [{ op: "move", id: h.id, x: a.x, z: a.z }, ...turn.ops],
          [...turn.inverse, { op: "move", id: h.id, x: h.x, z: h.z }],
        ),
      );
    }

    case "rotate": {
      // In hand: turn the ghost; the turn lands with the drop.
      if (a.id === s.held) return { ...s, heldRot: ((s.heldRot + 90) % 360) as Rot };
      const o = s.objects.get(a.id);
      if (!o) return s;
      const rot = ((o.rot + 90) % 360) as Rot;
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
      const o = objectAt(s.objects, a.x, a.z);
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
      let objects = new Map(a.city.objects.map((o) => [o.id, o]));
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
