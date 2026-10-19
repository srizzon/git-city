import { describe, expect, it } from "vitest";
import { LOT } from "../league-city/grid";
import { UNIT_TO_M } from "../league-city/drive/tuning";
import {
  CELL,
  PAINT,
  SUB,
  PaintBoard,
  PaintGrid,
  capture,
  dayPoints,
  decodeRuns,
  encodeRuns,
  enclosed,
  lineCells,
  newRun,
  stateIndex,
  step,
  weekStandings,
  weightOf,
  type PaintEvent,
} from "./brasil-paint";

const SP = stateIndex("SP");
const RJ = stateIndex("RJ");

/** A board of open land, cells 0…n-1 (lots 0…n/SUB-1). */
function board(w = 80, d = 80): PaintGrid {
  const g = new PaintGrid({ scale: 1, x0: 0, z0: 0, w, d });
  g.open.fill(1);
  return g;
}

/** A cell's middle in meters. */
const m = (cell: number) => ((cell + 0.5) * CELL - LOT / 2) * UNIT_TO_M;

/** Drives a run cell by cell along `cells`, a state every 500 ms (a cell is 4.8 m: ~10 m/s); every event, in order. */
function drive(g: PaintGrid, run: ReturnType<typeof newRun>, cells: [number, number][], t0 = 1000): PaintEvent[] {
  const out: PaintEvent[] = [];
  cells.forEach(([x, z], i) => out.push(...step(g, run, m(x), m(z), t0 + i * 500).events));
  return out;
}

/** The cells of a rectangle's outline, clockwise from (x0, z0). */
function ring(x0: number, z0: number, x1: number, z1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = x0; x <= x1; x++) out.push([x, z0]);
  for (let z = z0 + 1; z <= z1; z++) out.push([x1, z]);
  for (let x = x1 - 1; x >= x0; x--) out.push([x, z1]);
  for (let z = z1 - 1; z > z0; z--) out.push([x0, z]);
  return out;
}

describe("runs code", () => {
  it("round-trips a board", () => {
    const a = new Uint8Array([0, 0, 0, 5, 5, 0, 27, 27, 27, 0]);
    expect(encodeRuns(a)).toEqual([0, 3, 5, 2, 0, 1, 27, 3, 0, 1]);
    expect([...decodeRuns(encodeRuns(a), new Uint8Array(10))]).toEqual([...a]);
  });
  it("stops at junk", () => {
    expect([...decodeRuns([3, 2, 99, 1, 3, 1], new Uint8Array(4))]).toEqual([3, 3, 0, 0]);
  });
});

describe("cells", () => {
  it("SUB to a lot's side, a lot's middle in its middle", () => {
    const g = board();
    expect(g.lotCells(1, 2).map((c) => g.xyOf(c))[0]).toEqual([SUB, 2 * SUB]);
    const mid = (lot: number) => lot * LOT * UNIT_TO_M;
    expect(g.lotOf(g.cellAt(mid(3), mid(5)))).toEqual([3, 5]);
  });
  it("lines go side by side, never corner to corner", () => {
    const g = board();
    const cells = lineCells(g, g.index(0, 0), g.index(3, 2)).map((c) => g.xyOf(c));
    expect(cells.at(-1)).toEqual([3, 2]);
    expect(cells).toHaveLength(5);
    let prev: [number, number] = [0, 0];
    for (const c of cells) {
      expect(Math.abs(c[0] - prev[0]) + Math.abs(c[1] - prev[1])).toBe(1);
      prev = c;
    }
  });
});

describe("a loop", () => {
  it("out of home leaves a trail; back home it closes", () => {
    const g = board();
    // Lot (0, 0): cells 0…3 both ways.
    g.setHomes([{ x: 0, z: 0, uf: "SP" }]);
    const run = newRun(SP);
    // From beside the building, round an 8×8 square and back in beside it.
    const ev = drive(g, run, [[4, 1], ...ring(5, 1, 12, 8), [4, 2]]);
    const close = ev.find((e) => e.k === "close");
    expect(close).toBeTruthy();
    const got = capture(g, SP, enclosed(g, SP, close!.k === "close" ? close!.trail : []));
    // The ring (28) and its inside (6×6).
    expect(got.taken).toBe(64);
    expect(got.invaded).toBe(0);
    expect(g.owner[g.index(8, 5)]).toBe(SP);
    expect(g.owner[g.index(30, 30)]).toBe(0);
  });

  it("across its own trail it closes too (a drawn circle)", () => {
    const g = board();
    g.setHomes([{ x: 0, z: 0, uf: "SP" }]);
    const run = newRun(SP);
    // Out to (10, 10), round a 5×5 ring and across its own start.
    const out: [number, number][] = [[4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [10, 2], [10, 3], [10, 4], [10, 5], [10, 6], [10, 7], [10, 8], [10, 9]];
    const ev = drive(g, run, [...out, ...ring(10, 10, 14, 14), [10, 11], [10, 10]]);
    const close = ev.find((e) => e.k === "close");
    expect(ev.some((e) => e.k === "lost")).toBe(false);
    const got = capture(g, SP, enclosed(g, SP, close!.k === "close" ? close!.trail : []));
    expect(g.owner[g.index(12, 12)]).toBe(SP);
    expect(got.taken).toBeGreaterThan(25);
    expect(run.cells).toEqual([]);
  });

  it("a U from the state's land closes in what lies between", () => {
    const g = board();
    g.setHomes([{ x: 10, z: 10, uf: "SP" }]);
    for (let x = 0; x < 20; x++) g.owner[g.index(x, 5)] = SP;
    const run = newRun(SP);
    const ev = drive(g, run, [[3, 5], [3, 6], [3, 7], [3, 8], [4, 8], [5, 8], [6, 8], [6, 7], [6, 6], [6, 5]]);
    const close = ev.find((e) => e.k === "close");
    expect(close?.k === "close" && close.trail.length).toBe(8);
    const got = capture(g, SP, enclosed(g, SP, close!.k === "close" ? close!.trail : []));
    expect(got.taken).toBe(8 + 4);
  });

  it("over another state is an invasion; buildings never change hands", () => {
    const g = board();
    // RJ's building: lot (1, 1), cells 4…7.
    g.setHomes([{ x: 0, z: 0, uf: "SP" }, { x: 1, z: 1, uf: "RJ" }]);
    const cells: number[] = [];
    for (let x = 3; x < 8; x++) for (let z = 3; z < 8; z++) cells.push(g.index(x, z));
    for (const c of cells) if (!g.home[c]) g.owner[c] = RJ;
    const got = capture(g, SP, cells);
    // 25 cells, less RJ's building (16) and SP's corner (3, 3).
    expect(got.invaded).toBe(8);
    expect(got.from.get("RJ")).toBe(8);
    expect(g.owner[g.index(5, 5)]).toBe(RJ);
  });
});

describe("losing the trail", () => {
  // The building: lot (0, 2), cells x 0…3, z 8…11.
  const start = (): [PaintGrid, ReturnType<typeof newRun>] => {
    const g = board();
    g.setHomes([{ x: 0, z: 2, uf: "SP" }]);
    return [g, newRun(SP)];
  };


  it("a jump", () => {
    const [g, run] = start();
    drive(g, run, [[4, 10], [5, 10], [6, 10]]);
    const { events } = step(g, run, m(60), m(10), 2500);
    expect(events).toEqual([{ k: "lost", why: "jump" }]);
    expect(run.cells).toEqual([]);
  });

  it("a gap in the stream", () => {
    const [g, run] = start();
    drive(g, run, [[4, 10], [5, 10], [6, 10]]);
    expect(step(g, run, m(7), m(10), 2000 + PAINT.gapMs + 1).events).toEqual([{ k: "lost", why: "gap" }]);
  });

  it("too long", () => {
    const g = board(PAINT.trailMax + 20, 8);
    g.setHomes([{ x: 0, z: 1, uf: "SP" }]);
    const run = newRun(SP);
    const cells: [number, number][] = Array.from({ length: PAINT.trailMax + 3 }, (_, i) => [i + 4, 5]);
    const ev = drive(g, run, cells);
    expect(ev.filter((e) => e.k === "lost")).toEqual([{ k: "lost", why: "long" }]);
  });

  it("the sea doesn't paint", () => {
    const [g, run] = start();
    g.open[g.index(5, 10)] = 0;
    const ev = drive(g, run, [[4, 10], [5, 10], [6, 10]]);
    const added = ev.flatMap((e) => (e.k === "add" ? e.cells : []));
    expect(added.map((c) => g.xyOf(c))).toEqual([[6, 10]]);
  });
});

describe("points", () => {
  it("one per 20 lots' cells, invaded twice, capped a day", () => {
    expect(weightOf(10, 5)).toBe(20);
    expect(dayPoints(PAINT.cellsPerPoint * 2 - 1)).toBe(1);
    expect(dayPoints(10_000)).toBe(PAINT.dayCap);
  });
});

describe("PaintBoard", () => {
  it("draws what the room sends", () => {
    const b = new PaintBoard();
    b.all({ scale: 1, x0: 0, z0: 0, w: 4, d: 1 }, [0, 2, SP, 2], 4, "2026-10-19", [["a", RJ, [0]]]);
    expect(b.shares()).toEqual([{ uf: "SP", cells: 2 }]);
    expect(b.trailAt(0)).toBe(RJ);
    expect(b.takeDirty()).toBeNull();
    b.fill(RJ, [0, 1, 2], "a");
    expect(b.trails.size).toBe(0);
    expect([...(b.takeDirty() ?? [])].sort()).toEqual([0, 1, 2]);
    expect(b.shares()).toEqual([
      { uf: "RJ", cells: 3 },
      { uf: "SP", cells: 1 },
    ]);
  });
});

describe("weekStandings", () => {
  const H = 3_600_000;
  const start = Date.parse("2026-10-19T00:00:00Z");
  it("averages every hour, an hour with no save the one before", () => {
    // SP holds 10% from the first hour; RJ grabs 50% in the last minute of hour 10.
    const hours = [
      { at: start + 10 * 60_000, land: 100, shares: { SP: 10 } },
      { at: start + 9 * H + 59 * 60_000, land: 100, shares: { SP: 10, RJ: 50 } },
    ];
    const got = weekStandings("2026-10-19", hours, start + 10 * H + 1);
    expect(got[0].uf).toBe("SP");
    expect(got[0].share).toBeCloseTo(0.1);
    expect(got[1].uf).toBe("RJ");
    expect(got[1].share).toBeCloseTo(0.05);
  });
  it("nothing before the first hour ends", () => {
    expect(weekStandings("2026-10-19", [], start + H - 1)).toEqual([]);
  });
});
