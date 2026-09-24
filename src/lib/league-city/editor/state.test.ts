import { describe, expect, it } from "vitest";
import type { CityObject } from "../types";
import { editorReducer, initEditor, type EditorAction, type EditorState } from "./state";

const bld = (id: string, dev: number, x: number, z: number): CityObject => ({
  id, kind: "building", item_type: null, developer_id: dev, x, z, rot: 0, is_new: false,
});
const item = (id: string, x: number, z: number): CityObject => ({
  id, kind: "item", item_type: "lamp", developer_id: null, x, z, rot: 0, is_new: false,
});

function start(objects: CityObject[] = [bld("a", 1, 1, 0), bld("b", 2, 2, 0), item("t", 3, 3)]) {
  return initEditor({ size: 12, version: 5, objects });
}
const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const at = (s: EditorState, id: string) => s.objects.get(id);

describe("place, undo, redo", () => {
  it("places with the client id and undoes with remove", () => {
    let s = run(start(), { type: "setTool", tool: { kind: "place", item: "bench" } }, { type: "place", x: -2, z: -2, id: "n1" });
    expect(at(s, "n1")).toMatchObject({ item_type: "bench", x: -2, z: -2 });
    expect(s.pending[0].ops[0]).toMatchObject({ op: "place", id: "n1" });

    s = run(s, { type: "undo" });
    expect(at(s, "n1")).toBeUndefined();
    expect(s.pending.at(-1)?.ops).toEqual([{ op: "remove", id: "n1" }]);
    expect(s.redo).toHaveLength(1);

    s = run(s, { type: "redo" });
    expect(at(s, "n1")).toMatchObject({ x: -2, z: -2 });
    expect(s.undo).toHaveLength(1);
    expect(s.redo).toHaveLength(0);
  });

  it("refuses a taken lot with a hint", () => {
    const s = run(start(), { type: "setTool", tool: { kind: "place", item: "bench" } }, { type: "place", x: 3, z: 3, id: "n1" });
    expect(at(s, "n1")).toBeUndefined();
    expect(s.notice?.message).toMatch(/taken/);
  });

  it("clears redo on a new edit", () => {
    const s = run(start(), { type: "rotate", id: "t" }, { type: "undo" }, { type: "rotate", id: "a" });
    expect(s.redo).toHaveLength(0);
  });
});

describe("move and rotate chain", () => {
  it("undoes step by step back to the start", () => {
    let s = run(start(), { type: "pickUp", id: "t" }, { type: "drop", x: -1, z: -3 }, { type: "rotate", id: "t" }, { type: "rotate", id: "t" });
    expect(at(s, "t")).toMatchObject({ x: -1, z: -3, rot: 180 });
    s = run(s, { type: "undo" });
    expect(at(s, "t")?.rot).toBe(90);
    s = run(s, { type: "undo" }, { type: "undo" });
    expect(at(s, "t")).toMatchObject({ x: 3, z: 3, rot: 0 });
    expect(s.undo).toHaveLength(0);
  });

  it("refuses dropping on an item or out of bounds", () => {
    let s = run(start(), { type: "pickUp", id: "a" }, { type: "drop", x: 3, z: 3 });
    expect(at(s, "a")).toMatchObject({ x: 1, z: 0 });
    expect(s.notice?.message).toMatch(/taken/);
    s = run(s, { type: "drop", x: 9, z: 0 });
    expect(at(s, "a")).toMatchObject({ x: 1, z: 0 });
    expect(s.pending).toHaveLength(0);
  });
});

describe("building swap", () => {
  it("swaps two buildings in one edit and one batch", () => {
    let s = run(start(), { type: "pickUp", id: "a" }, { type: "drop", x: 2, z: 0 });
    expect(at(s, "a")).toMatchObject({ x: 2, z: 0 });
    expect(at(s, "b")).toMatchObject({ x: 1, z: 0 });
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0].ops).toHaveLength(2);

    s = run(s, { type: "send", maxOps: 1 });
    expect(s.inflight?.[0].ops).toHaveLength(2); // never split

    s = run(s, { type: "undo" });
    expect(at(s, "a")).toMatchObject({ x: 1, z: 0 });
    expect(at(s, "b")).toMatchObject({ x: 2, z: 0 });
  });

  it("never deletes a building", () => {
    const s = run(start(), { type: "remove", id: "a" });
    expect(at(s, "a")).toBeDefined();
    expect(s.notice?.kind).toBe("hint");
  });
});

describe("undo after a server removal", () => {
  it("skips the entry and never recreates the object", () => {
    let s = run(start(), { type: "rotate", id: "t" });
    s = run(s, { type: "send" }, { type: "ack", version: 6 });
    s = run(s, { type: "resync", city: { size: 12, version: 7, objects: [bld("a", 1, 1, 0), bld("b", 2, 2, 0)] } });
    expect(s.undo).toHaveLength(0); // pruned on resync

    // Same case without a resync in between: undo finds the object gone.
    let s2 = run(start(), { type: "rotate", id: "t" });
    s2 = { ...s2, objects: new Map([...s2.objects].filter(([id]) => id !== "t")) };
    s2 = run(s2, { type: "undo" });
    expect(at(s2, "t")).toBeUndefined();
    expect(s2.undo).toHaveLength(0);
    expect(s2.notice?.message).toMatch(/can't be undone/);
  });
});

describe("reject", () => {
  it("rolls back the batch and later edits, and drops their undo entries", () => {
    let s = run(start(), { type: "rotate", id: "t" });
    s = run(s, { type: "send" });
    s = run(s, { type: "pickUp", id: "t" }, { type: "drop", x: 0, z: 4 });
    s = run(s, { type: "reject", message: "That lot is taken." });
    expect(at(s, "t")).toMatchObject({ x: 3, z: 3, rot: 0 });
    expect(s.undo).toHaveLength(0);
    expect(s.pending).toHaveLength(0);
    expect(s.inflight).toBeNull();
    expect(s.notice?.kind).toBe("error");
  });

  it("keeps acknowledged edits", () => {
    let s = run(start(), { type: "rotate", id: "t" }, { type: "send" }, { type: "ack", version: 6 });
    s = run(s, { type: "rotate", id: "a" }, { type: "send" }, { type: "reject" });
    expect(at(s, "t")?.rot).toBe(90);
    expect(at(s, "a")?.rot).toBe(0);
    expect(s.undo).toHaveLength(1);
    expect(s.version).toBe(6);
  });
});

describe("resync", () => {
  it("takes the server city, replays unsent edits and prunes stale entries", () => {
    let s = run(start(), { type: "rotate", id: "a" }, { type: "send" }, { type: "ack", version: 6 });
    s = run(s, { type: "rotate", id: "t" }); // unsent
    s = run(s, {
      type: "resync",
      city: { size: 14, version: 8, objects: [bld("b", 2, 2, 0), item("t", 3, 3), bld("c", 3, 1, 0)] },
    });
    expect(s.size).toBe(14);
    expect(s.version).toBe(8);
    expect(at(s, "c")).toBeDefined();
    expect(at(s, "a")).toBeUndefined();
    expect(at(s, "t")?.rot).toBe(90); // unsent edit replayed
    expect(s.pending).toHaveLength(1);
    expect(s.undo.map((e) => e.ops[0])).toEqual([{ op: "rotate", id: "t", rot: 90 }]); // "a" entry pruned
  });
});

describe("send", () => {
  it("batches whole edits up to the op limit", () => {
    let s = run(start(), { type: "rotate", id: "a" }, { type: "rotate", id: "b" }, { type: "rotate", id: "t" });
    s = run(s, { type: "send", maxOps: 2 });
    expect(s.inflight).toHaveLength(2);
    expect(s.pending).toHaveLength(1);
    expect(run(s, { type: "send" }).inflight).toHaveLength(2); // one in flight at a time
  });
});
