// ─── Smash: the room's rules ───────────────────────────────
// What the drive room (party/drive.ts) checks before a floor comes off, and
// the numbers it runs on. Pure and shared with the client, relative imports
// only (PartyKit bundles it).

import { MISSILE } from "./drive/battle";
import { M_TO_UNIT } from "./drive/tuning";
import { SMASH, cols, type SmashStore } from "./smash";

/** Floors a blast takes from each column it reaches. */
export const BLAST_ROWS = 3;
/** A driver takes at most this many floors a minute; the rest are dropped. */
export const FLOORS_PER_MINUTE = 150;
/** Slack (units) on the car-to-column distance: the room sees the car ~15 times a second. */
export const REACH_SLACK = 20;
/** One blast may break floors this long after it was fired (ms), in up to this many buildings. */
export const BLAST_WINDOW_MS = 5000;
export const BLAST_BUILDINGS = 8;
/** Owner rebuild: parked (under this speed, m/s) within this distance (units) of their building's footprint. */
export const REBUILD_SPEED = 1;
export const REBUILD_REACH = 8;
/** The room saves every this often (ms), and asks for contributions every this often. */
export const SAVE_MS = 10_000;
export const CONTRIB_MS = 5 * 60_000;

export interface SmashMsg {
  b: string;
  c: number[];
  k: "car" | "blast";
  fx?: number;
}

/** A well-formed `smash` message, or null. */
export function parseSmash(m: Record<string, unknown>): SmashMsg | null {
  const { b, c, k, fx } = m;
  if (typeof b !== "string" || b.length === 0 || b.length > 40) return null;
  if (!Array.isArray(c) || c.length === 0 || c.length > 16 || !c.every((n) => Number.isInteger(n) && n >= 0 && n < 16)) return null;
  if (k !== "car" && k !== "blast") return null;
  if (k === "blast" && (typeof fx !== "number" || !Number.isInteger(fx) || fx <= 0)) return null;
  return { b, c: c as number[], k, ...(k === "blast" ? { fx: fx as number } : {}) };
}

/** Distance (units) from a point to a building's footprint (0 inside). */
export function toFootprint(store: SmashStore, target: number, x: number, z: number): number {
  const t = store.targets[target];
  const dx = Math.max(0, Math.abs(x - t.x) - t.w / 2);
  const dz = Math.max(0, Math.abs(z - t.z) - t.d / 2);
  return Math.hypot(dx, dz);
}

/** The columns of `target` a car at (x, z) meters can be touching. */
export function carReaches(store: SmashStore, target: number, columns: readonly number[], xm: number, zm: number): number[] {
  const t = store.targets[target];
  const x = xm * M_TO_UNIT;
  const z = zm * M_TO_UNIT;
  const cw = t.w / (t.xs.length - 1);
  const cd = t.d / (t.zs.length - 1);
  const reach = Math.hypot(cw, cd) / 2 + SMASH.carRadius + REACH_SLACK;
  return columns.filter((c) => {
    if (c >= cols(t)) return false;
    const [cx, cz] = store.columnCenter(target, c);
    return Math.hypot(cx - x, cz - z) <= reach;
  });
}

/** The columns of `target` a blast fired from (x, z) meters can reach (a missile flies up to its range). */
export function blastReaches(store: SmashStore, target: number, columns: readonly number[], xm: number, zm: number): number[] {
  const reach = (MISSILE.range + 20) * M_TO_UNIT;
  return columns.filter((c) => {
    if (c >= cols(store.targets[target])) return false;
    const [cx, cz] = store.columnCenter(target, c);
    return Math.hypot(cx - xm * M_TO_UNIT, cz - zm * M_TO_UNIT) <= reach;
  });
}

/** A per-account budget of floors per rolling minute. */
export class FloorBudget {
  private start = 0;
  private used = 0;
  /** `perMinute`: the cap (the Brasil map's robbers smash more: party/smash.ts). */
  constructor(private perMinute = FLOORS_PER_MINUTE) {}
  /** Its minute is over: nothing booked would still count. */
  idle(now: number): boolean {
    return now - this.start >= 60_000;
  }
  /** How many of `want` floors fit now (and books them). */
  take(want: number, now: number): number {
    if (now - this.start >= 60_000) {
      this.start = now;
      this.used = 0;
    }
    const n = Math.max(0, Math.min(want, this.perMinute - this.used));
    this.used += n;
    return n;
  }
}

/**
 * A room message about the floors, applied to a client's store. Returns the
 * columns that lost floors (someone else's hits, for debris); yours were
 * already drawn when you made them, so the room's copy changes nothing.
 */
export function applyRoomDamage(
  store: SmashStore,
  msg: { t: string } & Record<string, unknown>,
  now: number,
): { target: number; col: number }[] {
  if (msg.t === "damage_all" && Array.isArray(msg.list)) {
    store.applyAll(msg.list as [string, number[], string | null, number?][], now);
    return [];
  }
  if (msg.t !== "damage" || typeof msg.b !== "string" || !Array.isArray(msg.r)) return [];
  const target = store.index.get(msg.b);
  if (target === undefined) return [];
  const before = store.rowsOf(target);
  store.setRows(target, msg.r as number[], now);
  store.setBy(target, typeof msg.by === "string" ? msg.by : null);
  store.setShield(target, typeof msg.s === "number" ? msg.s : 0);
  const after = store.rowsOf(target);
  return after.flatMap((r, col) => (r < before[col] ? [{ target, col }] : []));
}
