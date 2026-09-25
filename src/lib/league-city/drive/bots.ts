// ─── Town bots ──────────────────────────────────────────────
// Cars that drive the town's streets when few people are, so the city looks
// alive and a lone driver has company. No server: a bot's route is a plan
// every client works out the same way (MMO "plans, not positions"), from the
// town's roads, a seed per bot and slot of time, and the shared clock, so
// everyone sees the same bot in the same place.
//
//   graph   road lots, each linked to its road neighbors; the approach lots
//           south of the gate only lead in and out
//   slot    each bot lives in SLOT_S slots, staggered per bot: it drives in
//           through the gate, wanders (seeded turns, straight preferred, no
//           U-turn unless it's a dead end), heads back to the gate in time
//           and drives out; between slots it's gone
//   piece   one lot crossed from the edge it enters to the edge it leaves,
//           in the right-hand lane, as a quadratic Bézier; speed is capped
//           by the curve (v = √(a_lat·g/κ)) and eases between pieces
//
// Positions come out as drive snapshots (meters), like a remote car's.

import { LOT } from "../grid";
import { lotKey } from "../placement";
import { APPROACH_LOTS } from "../identity-geometry";
import type { CityObject } from "../types";
import { UNIT_TO_M } from "./tuning";
import type { CarSnapshot } from "./net";

export const SLOT_S = 240;
/** Most bots in a town at once. */
export const MAX_BOTS = 6;

const HALF = LOT / 2;
/** Right-hand lane: this far right of the road's center line (city units). */
const LANE = 6.5;
const V_MAX = 13; // m/s
const A_LAT = 0.4 * 9.81;
const WHEELBASE = 1.74;
/** Samples per piece for arc length and curvature. */
const N = 10;

type Obj = Pick<CityObject, "item_type" | "x" | "z" | "px">;
type Dir = readonly [number, number];
const DIRS: readonly Dir[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export interface RoadGraph {
  roads: Set<string>;
  /** Road neighbors of each road lot (approach lots excluded). */
  next: Map<string, [number, number][]>;
  /** The gate's road lot (0, 0) is there. */
  gate: boolean;
}

export function roadGraph(objects: readonly Obj[]): RoadGraph {
  // z > 0 is the approach outside the gate (drive mode draws it as road): in and out only.
  const roads = new Set(objects.filter((o) => o.px === null && o.item_type === "road" && o.z <= 0).map((o) => lotKey(o.x, o.z)));
  const next = new Map<string, [number, number][]>();
  for (const key of roads) {
    const [x, z] = key.split(",").map(Number);
    const out: [number, number][] = [];
    for (const [dx, dz] of DIRS) if (roads.has(lotKey(x + dx, z + dz))) out.push([x + dx, z + dz]);
    next.set(key, out);
  }
  return { roads, next, gate: roads.has(lotKey(0, 0)) };
}

/** How many bots a town this size gets, before real drivers take their place. */
export function botTarget(g: RoadGraph): number {
  if (g.roads.size < 4) return 0;
  return Math.max(2, Math.min(MAX_BOTS, Math.round(g.roads.size / 10)));
}

// ─── Seeded randomness ──────────────────────────────────────

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Pieces ─────────────────────────────────────────────────

interface Piece {
  p0: [number, number];
  c: [number, number];
  p1: [number, number];
  /** Cumulative arc length at each of the N+1 samples (city units). */
  arc: number[];
  len: number;
  /** Signed curvature at the middle (1/m), for the steering angle. */
  k: number;
  /** Speed limit through it (m/s). */
  vmax: number;
  // Filled when the plan is timed:
  t0: number;
  dur: number;
  v0: number;
  v1: number;
}

const right = ([dx, dz]: Dir): [number, number] => [-dz, dx];

function bez(p: Piece, u: number): [number, number] {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return [a * p.p0[0] + b * p.c[0] + c * p.p1[0], a * p.p0[1] + b * p.c[1] + c * p.p1[1]];
}

function bezTan(p: Piece, u: number): [number, number] {
  return [2 * (1 - u) * (p.c[0] - p.p0[0]) + 2 * u * (p.p1[0] - p.c[0]), 2 * (1 - u) * (p.c[1] - p.p0[1]) + 2 * u * (p.p1[1] - p.c[1])];
}

function curvature(p: Piece, u: number): number {
  const [dx, dz] = bezTan(p, u);
  const ddx = 2 * (p.p1[0] - 2 * p.c[0] + p.p0[0]);
  const ddz = 2 * (p.p1[1] - 2 * p.c[1] + p.p0[1]);
  const sp = Math.hypot(dx, dz);
  if (sp < 1e-6) return 0;
  // Per city unit → per meter.
  return (dx * ddz - dz * ddx) / (sp * sp * sp) / UNIT_TO_M;
}

/** Crossing lot (x, z) arriving along `din`, leaving along `dout`. */
function piece(x: number, z: number, din: Dir, dout: Dir): Piece {
  const cx = x * LOT;
  const cz = z * LOT;
  const ri = right(din);
  const ro = right(dout);
  const p0: [number, number] = [cx - din[0] * HALF + ri[0] * LANE, cz - din[1] * HALF + ri[1] * LANE];
  const p1: [number, number] = [cx + dout[0] * HALF + ro[0] * LANE, cz + dout[1] * HALF + ro[1] * LANE];
  let c: [number, number];
  if (din[0] === dout[0] && din[1] === dout[1]) c = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  else if (din[0] === -dout[0] && din[1] === -dout[1])
    c = [cx + din[0] * 14, cz + din[1] * 14]; // U-turn past the middle
  else c = [cx + ri[0] * LANE + ro[0] * LANE, cz + ri[1] * LANE + ro[1] * LANE]; // the two lanes cross here
  const pc: Piece = { p0, c, p1, arc: [0], len: 0, k: 0, vmax: V_MAX, t0: 0, dur: 0, v0: 0, v1: 0 };
  let prev = p0;
  let kmax = 0;
  for (let i = 1; i <= N; i++) {
    const pt = bez(pc, i / N);
    pc.arc.push(pc.arc[i - 1] + Math.hypot(pt[0] - prev[0], pt[1] - prev[1]));
    prev = pt;
    kmax = Math.max(kmax, Math.abs(curvature(pc, i / N)));
  }
  pc.len = pc.arc[N];
  pc.k = curvature(pc, 0.5);
  if (kmax > 1e-4) pc.vmax = Math.min(V_MAX, Math.sqrt(A_LAT / kmax));
  return pc;
}

// ─── Plans ──────────────────────────────────────────────────

export interface BotPlan {
  pieces: Piece[];
  /** Seconds into the slot when the bot has driven out (hidden after). */
  end: number;
}

const dirOf = (a: [number, number], b: [number, number]): Dir => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];

/** Shortest road path from `from` to the gate (0, 0), both included. */
function pathToGate(g: RoadGraph, from: [number, number]): [number, number][] | null {
  const start = lotKey(from[0], from[1]);
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const k = queue.shift()!;
    if (k === "0,0") {
      const out: [number, number][] = [];
      for (let c: string | null = k; c; c = prev.get(c) ?? null) out.unshift(c.split(",").map(Number) as [number, number]);
      return out;
    }
    for (const [nx, nz] of g.next.get(k) ?? []) {
      const nk = lotKey(nx, nz);
      if (!prev.has(nk)) {
        prev.set(nk, k);
        queue.push(nk);
      }
    }
  }
  return null;
}

/** Pieces for a lot path (every lot but the ends), timed with speeds easing between them. */
function timed(lots: [number, number][], vcap: number): BotPlan | null {
  if (lots.length < 3) return null;
  const pieces: Piece[] = [];
  for (let i = 1; i < lots.length - 1; i++) {
    const p = piece(lots[i][0], lots[i][1], dirOf(lots[i - 1], lots[i]), dirOf(lots[i], lots[i + 1]));
    p.vmax = Math.min(p.vmax, vcap);
    pieces.push(p);
  }
  // Each piece ends at the slower of its own and the next one's limit.
  let t = 0;
  let v = pieces[0].vmax;
  pieces.forEach((p, i) => {
    const v1 = Math.min(p.vmax, pieces[i + 1]?.vmax ?? p.vmax);
    const v0 = Math.min(v, p.vmax);
    p.v0 = v0;
    p.v1 = v1;
    p.t0 = t;
    p.dur = (2 * p.len * UNIT_TO_M) / Math.max(0.5, v0 + v1);
    t += p.dur;
    v = v1;
  });
  return { pieces, end: t };
}

const MAX_HOPS = 300;

/**
 * One bot's drive for one slot: in through the gate (when the town has it),
 * a seeded wander, and back out, as long as fits in the slot. Deterministic
 * in (seed, graph).
 */
export function planSlot(g: RoadGraph, seed: string, speedScale = 1): BotPlan | null {
  if (g.roads.size < 2) return null;
  const rnd = mulberry32(hash(seed));
  const vcap = V_MAX * speedScale;
  const keys = [...g.roads].sort();
  const start: [number, number] = g.gate ? [0, 0] : (keys[Math.floor(rnd() * keys.length)].split(",").map(Number) as [number, number]);

  // The wander: seeded turns, straight on half the time, U-turn only at a dead end.
  const walk: [number, number][] = [start];
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const cur = walk[walk.length - 1];
    const back = walk.length > 1 ? walk[walk.length - 2] : null;
    const options = (g.next.get(lotKey(cur[0], cur[1])) ?? []).filter((n) => !back || n[0] !== back[0] || n[1] !== back[1]);
    let nextLot: [number, number];
    if (options.length === 0) {
      if (!back) break;
      nextLot = back;
    } else {
      const din = back ? dirOf(back, cur) : g.gate ? ([0, -1] as Dir) : null;
      const straight = din ? options.find((n) => n[0] - cur[0] === din[0] && n[1] - cur[1] === din[1]) : undefined;
      nextLot = straight && rnd() < 0.5 ? straight : options[Math.floor(rnd() * options.length)];
    }
    walk.push(nextLot);
  }
  const budget = SLOT_S * (0.6 + rnd() * 0.3);
  const approachIn: [number, number][] = [];
  const approachOut: [number, number][] = [];
  for (let z = APPROACH_LOTS; z >= 1; z--) approachIn.push([0, z]);
  for (let z = 1; z <= APPROACH_LOTS; z++) approachOut.push([0, z]);

  const build = (hops: number): BotPlan | null => {
    const part = walk.slice(0, hops + 1);
    if (!g.gate) return timed(part, vcap);
    const home = pathToGate(g, part[part.length - 1]);
    if (!home) return null;
    // Leaving the gate lot heading south needs it once; home already ends on it.
    return timed([...approachIn, ...part, ...home.slice(1), ...approachOut], vcap);
  };
  // The most hops that still fit the budget (plan time grows with hops, give or take the way home).
  let lo = 0;
  let hi = walk.length - 1;
  let best = build(0);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const p = build(mid);
    if (p && p.end <= budget) {
      lo = mid;
      best = p;
    } else hi = mid - 1;
  }
  return best && best.end < SLOT_S ? best : null;
}

/** Where the bot is `sec` seconds into its slot, as a drive snapshot. Null when it's out of town. */
export function sampleBot(plan: BotPlan, sec: number, out: CarSnapshot): CarSnapshot | null {
  if (sec < 0 || sec >= plan.end) return null;
  const ps = plan.pieces;
  let lo = 0;
  let hi = ps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ps[mid].t0 <= sec) lo = mid;
    else hi = mid - 1;
  }
  const p = ps[lo];
  const tau = Math.min(p.dur, sec - p.t0);
  const a = (p.v1 - p.v0) / p.dur;
  const sM = p.v0 * tau + 0.5 * a * tau * tau;
  const s = Math.min(p.len, sM / UNIT_TO_M);
  // Arc length → curve parameter.
  let i = 1;
  while (i < N && p.arc[i] < s) i++;
  const seg = p.arc[i] - p.arc[i - 1] || 1;
  const u = (i - 1 + (s - p.arc[i - 1]) / seg) / N;
  const [x, z] = bez(p, u);
  const [tx, tz] = bezTan(p, u);
  const yaw = Math.atan2(tx, tz);
  out.x = x * UNIT_TO_M;
  out.y = 0;
  out.z = z * UNIT_TO_M;
  out.qx = 0;
  out.qy = Math.sin(yaw / 2);
  out.qz = 0;
  out.qw = Math.cos(yaw / 2);
  out.speed = p.v0 + a * tau;
  out.steer = Math.max(-0.5, Math.min(0.5, -Math.atan(WHEELBASE * curvature(p, u))));
  out.slip = 0;
  out.flags = a < -1.5 ? 1 : 0; // brake lights going into a turn
  return out;
}

/** Bot `i`'s slot at wall time `sec` (seconds): which slot, and how far into it. */
export function slotAt(i: number, sec: number): { slot: number; into: number } {
  const shifted = sec + (i * SLOT_S) / MAX_BOTS;
  const slot = Math.floor(shifted / SLOT_S);
  return { slot, into: shifted - slot * SLOT_S };
}

/** Seed for bot `i` of a town in a slot. */
export const botSeed = (town: string, i: number, slot: number) => `${town}|${i}|${slot}`;

/** Bots of a town that fill in for missing drivers. */
export function activeBots(g: RoadGraph, realDrivers: number): number {
  return Math.max(0, botTarget(g) - realDrivers);
}

/** Per-bot speed feel, 0.8–1.05 of the limit. */
export function botSpeed(town: string, i: number): number {
  return 0.8 + mulberry32(hash(`${town}|speed|${i}`))() * 0.25;
}

export function isApproachLot(x: number, z: number): boolean {
  return x === 0 && z >= 1 && z <= APPROACH_LOTS;
}

// ─── Clock and feed ─────────────────────────────────────────

let serverOffsetMs = 0;

/** The drive room's clock (its welcome's `now`), so every client puts bots in the same place. */
export function syncBotClock(serverNow: number): void {
  if (Number.isFinite(serverNow)) serverOffsetMs = serverNow - Date.now();
}

/**
 * A bot as a car feed: `sample` takes a performance.now() time, like a remote
 * car's snapshot buffer, and answers from the plan for that moment.
 */
export class BotSource {
  private cache: { slot: number; plan: BotPlan | null } | null = null;
  latest: CarSnapshot | null = null;

  constructor(
    private readonly g: RoadGraph,
    private readonly town: string,
    private readonly i: number,
  ) {}

  sample(perfMs: number, out: CarSnapshot): CarSnapshot | null {
    const wall = (perfMs + (Date.now() - performance.now()) + serverOffsetMs) / 1000;
    const { slot, into } = slotAt(this.i, wall);
    if (this.cache?.slot !== slot) {
      this.cache = { slot, plan: planSlot(this.g, botSeed(this.town, this.i, slot), botSpeed(this.town, this.i)) };
    }
    const s = this.cache.plan ? sampleBot(this.cache.plan, into, out) : null;
    this.latest = s;
    return s;
  }
}
