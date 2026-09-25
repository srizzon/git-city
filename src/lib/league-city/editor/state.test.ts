import { describe, expect, it } from "vitest";
import { LOT, MAX_H } from "../grid";
import type { CityObject } from "../types";
import { HOTBAR, editorReducer, initEditor, type EditorAction, type EditorState, type Spot } from "./state";

// Test coordinates sit around z = 0; the city is anchored with z <= 0, so
// every helper shifts z by Z0 lots going in and back coming out.
const Z0 = -6;
const bld = (id: string, dev: number, x: number, z: number): CityObject => ({
  id, kind: "building", item_type: null, developer_id: dev, x, z: z + Z0, px: null, pz: null, rot: 0, is_new: false,
});
const surface = (id: string, item: "road" | "plaza", x: number, z: number, locked = false): CityObject => ({
  id, kind: "item", item_type: item, developer_id: null, x, z: z + Z0, px: null, pz: null, rot: 0, is_new: false, locked,
});
const prop = (id: string, item: CityObject["item_type"], px: number, pz: number, extra: Partial<CityObject> = {}): CityObject => ({
  id, kind: "item", item_type: item, developer_id: null, x: Math.round(px / LOT), z: Math.round(pz / LOT) + Z0, px, pz: pz + Z0 * LOT, rot: 0, is_new: false, ...extra,
});

// Buildings a (1,0) and b (2,0); a plaza on (3,3); a road on (0,-2); a lamp on
// the road's east sidewalk; a tree on grass at (-3,-3).
function start(objects: CityObject[] = [
  bld("a", 1, 1, 0),
  bld("b", 2, 2, 0),
  surface("p", "plaza", 3, 3),
  surface("r", "road", 0, -2),
  prop("l", "lamp", 18, -2 * LOT),
  prop("t", "tree_oak", -3 * LOT, -3 * LOT),
], hasLogo = true) {
  return initEditor({ h: 6, version: 5, objects }, hasLogo);
}
const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const at = (s: EditorState, id: string) => {
  const o = s.objects.get(id);
  return o && { ...o, z: o.z - Z0, pz: o.pz === null ? null : o.pz - Z0 * LOT };
};
const spot = (wx: number, wz: number, free = false): Spot => ({ x: Math.round(wx / LOT), z: Math.round(wz / LOT) + Z0, wx, wz: wz + Z0 * LOT, free });
const lotSpot = (x: number, z: number): Spot => ({ x, z: z + Z0, wx: x * LOT, wz: (z + Z0) * LOT });
const lots = (l: [number, number][]): [number, number][] => l.map(([x, z]) => [x, z + Z0]);
const tool = (item: "bench" | "lamp" | "plaza" | "tree_oak" | "billboard" | "flag" | "plane" | "blimp"): EditorAction => ({ type: "setTool", tool: { kind: "place", item } });

describe("props", () => {
  it("places a bench on a plaza, snapped, and undoes and redoes it", () => {
    let s = run(start(), tool("bench"), { type: "place", id: "n1", ...spot(3 * LOT + 9.3, 3 * LOT - 10.6) });
    expect(at(s, "n1")).toMatchObject({ item_type: "bench", px: 3 * LOT + 8, pz: 3 * LOT - 12, x: 3, z: 3 });
    s = run(s, { type: "undo" });
    expect(at(s, "n1")).toBeUndefined();
    s = run(s, { type: "redo" });
    expect(at(s, "n1")).toBeDefined();
  });

  it("places freely with shift", () => {
    const s = run(start(), tool("bench"), { type: "place", id: "n1", ...spot(3 * LOT + 9.34, 3 * LOT, true) });
    expect(at(s, "n1")?.px).toBe(3 * LOT + 9.3);
  });

  it("refuses overlaps, asphalt and building lots with the reason", () => {
    let s = run(start(), tool("bench"), { type: "place", id: "n1", ...spot(18, -2 * LOT + 2) });
    expect(s.notice?.message).toMatch(/close/i);
    s = run(s, { type: "place", id: "n2", ...spot(0, -2 * LOT) });
    expect(s.notice?.message).toMatch(/asphalt/i);
    s = run(s, { type: "place", id: "n3", ...spot(LOT, 0) });
    expect(s.notice?.message).toMatch(/building/i);
    expect(s.pending).toHaveLength(0);
  });

  it("rotates the next prop by 45° before placing", () => {
    const s = run(start(), tool("bench"), { type: "rotate" }, { type: "place", id: "n1", ...spot(-LOT * 4, LOT * 4) });
    expect(at(s, "n1")?.rot).toBe(45);
  });

  it("carries a prop: turn in hand, drop where the cursor is, one edit", () => {
    let s = run(start(), { type: "pickUp", id: "t" }, { type: "rotate" }, { type: "drop", ...spot(-4 * LOT, -4 * LOT) });
    expect(at(s, "t")).toMatchObject({ px: -4 * LOT, pz: -4 * LOT, x: -4, z: -4, rot: 45 });
    expect(s.pending).toHaveLength(1);
    s = run(s, { type: "undo" });
    expect(at(s, "t")).toMatchObject({ px: -3 * LOT, pz: -3 * LOT, rot: 0 });
  });
});

describe("surfaces", () => {
  it("replaces a road with a plaza in one edit and undo restores the road", () => {
    let s = run(start(), tool("plaza"), { type: "place", id: "n1", ...lotSpot(0, -2) });
    expect(at(s, "r")).toBeUndefined();
    expect(at(s, "n1")).toMatchObject({ item_type: "plaza", x: 0, z: -2 });
    s = run(s, { type: "undo" });
    expect(at(s, "r")).toBeDefined();
    expect(at(s, "n1")).toBeUndefined();
  });

  it("never replaces a building", () => {
    const s = run(start(), tool("plaza"), { type: "place", id: "n1", ...lotSpot(1, 0) });
    expect(at(s, "n1")).toBeUndefined();
    expect(s.notice?.message).toMatch(/building/i);
  });

  it("paints roads over plazas and evicts props the new asphalt covers, all undoable", () => {
    // A road at (1,-2) gives (0,-2) an east arm: the sidewalk lamp is now on asphalt.
    let s = run(start(), { type: "paintRoad", lots: lots([[1, -2], [3, 3]]), ids: ["r1", "r2"] });
    expect(at(s, "r1")).toMatchObject({ item_type: "road" });
    expect(at(s, "p")).toBeUndefined();
    expect(at(s, "l")).toBeUndefined();
    s = run(s, { type: "undo" });
    expect(at(s, "l")).toBeDefined();
    expect(at(s, "p")).toBeDefined();
    expect(at(s, "r1")).toBeUndefined();
  });
});

describe("buildings", () => {
  it("swaps two buildings in one edit and one batch", () => {
    let s = run(start(), { type: "pickUp", id: "a" }, { type: "drop", ...lotSpot(2, 0) });
    expect(at(s, "a")).toMatchObject({ x: 2, z: 0 });
    expect(at(s, "b")).toMatchObject({ x: 1, z: 0 });
    s = run(s, { type: "send", maxOps: 1 });
    expect(s.inflight?.[0].ops).toHaveLength(2); // never split
    s = run(s, { type: "undo" });
    expect(at(s, "a")).toMatchObject({ x: 1, z: 0 });
  });

  it("turns 90° in hand and applies it with the drop", () => {
    const s = run(start(), { type: "pickUp", id: "a" }, { type: "rotate" }, { type: "drop", ...lotSpot(-5, 4) });
    expect(at(s, "a")).toMatchObject({ x: -5, z: 4, rot: 90 });
  });

  it("won't land on a lot with props, and is never deleted", () => {
    let s = run(start(), { type: "pickUp", id: "a" }, { type: "drop", ...lotSpot(-3, -3) });
    expect(at(s, "a")).toMatchObject({ x: 1, z: 0 });
    expect(s.notice?.message).toMatch(/props/i);
    s = run(s, { type: "cancel" }, { type: "remove", id: "a" });
    expect(at(s, "a")).toBeDefined();
  });

  it("puts things back on Esc", () => {
    const s = run(start(), { type: "pickUp", id: "a" }, { type: "rotate" }, { type: "cancel" });
    expect(at(s, "a")?.rot).toBe(0);
    expect(s.pending).toHaveLength(0);
  });
});

describe("bulldozer", () => {
  it("removes the prop under the cursor before the lot's surface", () => {
    let s = run(start(), { type: "removeAt", ...spot(18, -2 * LOT) });
    expect(at(s, "l")).toBeUndefined();
    expect(at(s, "r")).toBeDefined();
    s = run(s, { type: "removeAt", ...spot(0, -2 * LOT) });
    expect(at(s, "r")).toBeUndefined();
  });
});

describe("expand", () => {
  it("adds a column each side right away, queues one expand op, caps at MAX_H", () => {
    let s = run(start(), { type: "expand" });
    expect(s.h).toBe(7);
    expect(s.pending.at(-1)?.ops).toEqual([{ op: "expand" }]);
    expect(s.undo).toHaveLength(0);
    s = run(s, tool("bench"), { type: "place", id: "n1", ...spot(7 * LOT, 3 * LOT) }); // lot (7, 3): only exists in the new column
    expect(at(s, "n1")).toBeDefined();
    s = run({ ...s, h: MAX_H }, { type: "expand" });
    expect(s.h).toBe(MAX_H);
    expect(s.notice?.message).toMatch(/biggest/);
  });
});

describe("shrink", () => {
  it("drops the edge strips with what's on them, and undo brings both back", () => {
    // h = 7: a road on the east column (7), a lamp on the west one, a tree inside.
    let s = initEditor({
      h: 7,
      version: 1,
      objects: [bld("a", 1, 1, 0), surface("edge", "road", 7, 0), prop("e", "lamp", -7 * LOT, 0), prop("t", "tree_oak", 0, 3 * LOT)],
    });
    s = run(s, { type: "shrink" });
    expect(s.h).toBe(6);
    expect(at(s, "edge")).toBeUndefined();
    expect(at(s, "e")).toBeUndefined();
    expect(at(s, "t")).toBeDefined();
    expect(s.pending.at(-1)?.ops.at(-1)).toEqual({ op: "shrink" });
    expect(s.notice?.message).toMatch(/Removed 2 items/);
    s = run(s, { type: "undo" });
    expect(s.h).toBe(7);
    expect(at(s, "edge")).toBeDefined();
    expect(at(s, "e")).toBeDefined();
  });

  it("takes the two north rows, never the entrance row", () => {
    // h = 7: rows z -13 and -12 go (test z -7 and -6); the entrance row stays.
    let s = initEditor({ h: 7, version: 1, objects: [surface("north", "road", 0, -7), surface("entry", "road", 0, 6, true)] });
    s = run(s, { type: "shrink" });
    expect(s.h).toBe(6);
    expect(at(s, "north")).toBeUndefined();
    expect(at(s, "entry")).toBeDefined();
  });

  it("is blocked by a building on the edge and stops at the smallest size", () => {
    let s = initEditor({ h: 7, version: 1, objects: [bld("a", 1, 7, 0)] });
    s = run(s, { type: "shrink" });
    expect(s.h).toBe(7);
    expect(s.notice?.message).toMatch(/buildings off the edge/);
    expect(run(start(), { type: "shrink" }).notice?.message).toMatch(/smallest/);
  });

  it("restores the size when the server rejects it", () => {
    let s = initEditor({ h: 7, version: 1, objects: [] });
    s = run(s, { type: "shrink" }, { type: "send" }, { type: "reject", message: "no" });
    expect(s.h).toBe(7);
  });
});

describe("server sync", () => {
  it("skips an undo whose object the server removed", () => {
    let s = run(start(), { type: "pickUp", id: "t" }, { type: "drop", ...spot(-4 * LOT, -4 * LOT) });
    s = { ...s, objects: new Map([...s.objects].filter(([id]) => id !== "t")) };
    s = run(s, { type: "undo" });
    expect(at(s, "t")).toBeUndefined();
    expect(s.undo).toHaveLength(0);
    expect(s.notice?.message).toMatch(/can't be undone/);
  });

  it("rejects: rolls back the batch and later edits, drops their undo entries", () => {
    let s = run(start(), { type: "pickUp", id: "t" }, { type: "drop", ...spot(-4 * LOT, -4 * LOT) }, { type: "send" });
    s = run(s, { type: "pickUp", id: "a" }, { type: "drop", ...lotSpot(-5, 5) });
    s = run(s, { type: "reject", message: "That lot is taken." });
    expect(at(s, "t")).toMatchObject({ px: -3 * LOT });
    expect(at(s, "a")).toMatchObject({ x: 1, z: 0 });
    expect(s.undo).toHaveLength(0);
    expect(s.notice?.kind).toBe("error");
  });

  it("keeps acknowledged edits on reject", () => {
    let s = run(start(), { type: "rotate", id: "t" }, { type: "send" }, { type: "ack", version: 6 });
    s = run(s, { type: "rotate", id: "a" }, { type: "send" }, { type: "reject" });
    expect(at(s, "t")?.rot).toBe(45);
    expect(at(s, "a")?.rot).toBe(0);
    expect(s.version).toBe(6);
  });

  it("resyncs to the server city, replays unsent edits and prunes stale entries", () => {
    let s = run(start(), { type: "rotate", id: "a" }, { type: "send" }, { type: "ack", version: 6 });
    s = run(s, { type: "rotate", id: "t" }); // unsent
    s = run(s, {
      type: "resync",
      city: { h: 7, version: 8, objects: [bld("b", 2, 2, 0), prop("t", "tree_oak", -3 * LOT, -3 * LOT), bld("c", 3, 1, 0)] },
    });
    expect(s.h).toBe(7);
    expect(at(s, "c")).toBeDefined();
    expect(at(s, "a")).toBeUndefined();
    expect(at(s, "t")?.rot).toBe(45);
    expect(s.undo.map((e) => e.ops[0])).toEqual([{ op: "rotate", id: "t", rot: 45 }]);
  });

  it("batches whole edits up to the op limit, one batch in flight", () => {
    let s = run(start(), { type: "rotate", id: "a" }, { type: "rotate", id: "b" }, { type: "rotate", id: "t" });
    s = run(s, { type: "send", maxOps: 2 });
    expect(s.inflight).toHaveLength(2);
    expect(run(s, { type: "send" }).inflight).toHaveLength(2);
  });
});

describe("ramps", () => {
  it("places a ramp on grass or on the road, and turns it 45° at a time", () => {
    const ramp: EditorAction = { type: "setTool", tool: { kind: "place", item: "ramp" } };
    let s = run(start(), ramp, { type: "rotate" }, { type: "rotate" }, { type: "place", id: "n1", ...spot(-4 * LOT, 4 * LOT) });
    expect(at(s, "n1")).toMatchObject({ item_type: "ramp", px: -4 * LOT, pz: 4 * LOT, rot: 90 });
    s = run(s, { type: "select", id: "n1" }, { type: "rotate", id: "n1" });
    expect(at(s, "n1")?.rot).toBe(135);
    s = run(s, { type: "place", id: "n2", ...spot(0, -2 * LOT - 16) });
    expect(at(s, "n2")).toMatchObject({ item_type: "ramp" }); // driving toys may sit on asphalt
  });

  it("puts every driving toy in the stunts tab and keeps lamps off asphalt", () => {
    expect(HOTBAR.stunts).toEqual(["ramp", "ramp_big", "boost_pad", "speed_bump", "cone", "crates", "tire_wall"]);
    const lamp: EditorAction = { type: "setTool", tool: { kind: "place", item: "lamp" } };
    const s = run(start(), lamp, { type: "place", id: "n1", ...spot(0, -2 * LOT - 4) });
    expect(at(s, "n1")).toBeUndefined();
    expect(s.notice?.message).toMatch(/asphalt/i);
  });

});

describe("locked objects", () => {
  const locked = () => start([surface("entry", "road", 0, 6, true), prop("portal", "portal", 0, 6 * LOT + 4, { locked: true })]);

  it("can't be picked up, turned, removed or replaced", () => {
    let s = run(locked(), { type: "pickUp", id: "portal" });
    expect(s.held).toBeNull();
    expect(s.notice?.message).toBe("The entrance is fixed.");
    s = run(s, { type: "rotate", id: "entry" }, { type: "remove", id: "portal" }, { type: "removeAt", ...lotSpot(0, 6) });
    s = run(s, tool("plaza"), { type: "place", id: "n1", ...lotSpot(0, 6) });
    expect(at(s, "portal")).toBeDefined();
    expect(at(s, "entry")).toMatchObject({ item_type: "road", rot: 0 });
    expect(s.pending).toHaveLength(0);
  });

  it("blocks a shrink that would take them", () => {
    const s = run(initEditor({ h: 7, version: 1, objects: [surface("x", "road", 7, 0, true)] }), { type: "shrink" });
    expect(s.h).toBe(7);
  });
});

describe("identity pieces", () => {
  it("lists billboard, flag, blimp and plane in the Identity tab", () => {
    expect(HOTBAR.identity).toEqual(["billboard", "flag", "blimp", "plane"]);
  });

  it("caps billboards at 4 with the count", () => {
    let s = start([]);
    for (let i = 0; i < 5; i++) s = run(s, tool("billboard"), { type: "place", id: `b${i}`, ...spot(-5 * LOT + i * 2 * LOT, 3 * LOT) });
    expect([...s.objects.values()].filter((o) => o.item_type === "billboard")).toHaveLength(4);
    expect(s.notice?.message).toMatch(/4\/4/);
  });

  it("shares one limit of 3 between planes and blimps, and flies them over buildings", () => {
    let s = start();
    s = run(s, tool("plane"), { type: "place", id: "p1", ...spot(LOT, 0) }); // over building a
    s = run(s, tool("blimp"), { type: "place", id: "p2", ...spot(0, 0) }, { type: "place", id: "p3", ...spot(0, LOT) });
    s = run(s, tool("plane"), { type: "place", id: "p4", ...spot(-LOT, 0) });
    expect(at(s, "p1")).toMatchObject({ item_type: "plane", props: { text: "Welcome to town" } });
    expect(at(s, "p3")).toBeDefined();
    expect(at(s, "p4")).toBeUndefined();
    expect(s.notice?.message).toMatch(/3\/3/);
  });

  it("needs a logo for billboards, flags and the plaza floor", () => {
    let s = run(start(undefined, false), tool("flag"), { type: "place", id: "f1", ...spot(-4 * LOT, 4 * LOT) });
    expect(at(s, "f1")).toBeUndefined();
    expect(s.notice?.message).toMatch(/logo/i);
    s = run(s, { type: "setProps", id: "p", props: { logo_floor: true } });
    expect(at(s, "p")?.props).toBeNull();
    s = run(s, { type: "setHasLogo", hasLogo: true }, { type: "setProps", id: "p", props: { logo_floor: true } });
    expect(at(s, "p")?.props).toEqual({ logo_floor: true });
  });

  it("edits props as one undoable set_props op", () => {
    let s = run(start(), tool("blimp"), { type: "place", id: "bl", ...spot(0, 0) });
    s = run(s, { type: "setProps", id: "bl", props: { text: "Ship it", color: "#ffffff", bg: "#1a2a6c", alt: 200 } });
    expect(s.pending.at(-1)?.ops).toEqual([{ op: "set_props", id: "bl", props: { text: "Ship it", color: "#ffffff", bg: "#1a2a6c", alt: 200 } }]);
    expect(at(s, "bl")?.props).toMatchObject({ text: "Ship it" });
    s = run(s, { type: "undo" });
    expect(at(s, "bl")?.props).toMatchObject({ text: "Welcome to town" });
  });
});
