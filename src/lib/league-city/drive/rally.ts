// ─── City races ─────────────────────────────────────────────
// A point-to-point race on a town's roads (the Brasil map: city to city).
// The drive room owns it through this state machine; clients render it.
// Relative imports only (the party bundles this file).
//
// - Anyone driving starts one with a route (gates and a grid, worked out on
//   their screen from the map: lib/towns/brasil-race). Everyone else in the
//   room has RALLY.invite ms to accept; alone in the room it starts at once.
// - Everyone in is put on a grid slot behind the start line and held there;
//   five lights, one a second, out after a short random wait.
// - The room times each car on its own clock: a gate counts when a car's
//   state passes within RALLY.reach of it, in order; the last gate is the
//   finish. A car that ever moves faster than a car can goes on, untimed.
// - When the winner is in, the rest have RALLY.afterWinner; then results.
// - Item boxes, after Mario Kart: rows across the road between gates (a
//   straight, since every turn has a gate), back RALLY_BOXES.respawn after
//   one is taken. The room owns them (who took which, the item); the item
//   depends on your place: the back of the field gets the missiles.

export const RALLY = {
  invite: 15_000,
  lights: 5,
  lightMs: 1000,
  holdMin: 400,
  holdMax: 1600,
  /** Before the lights: everyone gets put on the grid. */
  settle: 2_500,
  afterWinner: 30_000,
  maxMs: 10 * 60_000,
  /** Results show this long before the next race can start. */
  over: 10_000,
  maxGrid: 30,
  maxGates: 120,
  /** A gate counts within this distance (m). */
  reach: 14,
  /** No car goes faster than this (m/s); boost tops out at 35. */
  maxSpeed: 40,
  /** Delivery jitter allowance (s). */
  jitter: 0.3,
} as const;

/** The race's item boxes: a row across the road every few gates. */
export const RALLY_BOXES = {
  /** A row between gates k-1 and k for k = first, first + every, … (never on the way to the finish). */
  first: 1,
  every: 3,
  maxRows: 12,
  /** Across the road, from its middle (m). */
  lanes: [-5.4, -1.8, 1.8, 5.4],
  /** How far before its gate a row sits (m): on the gate's straight. */
  before: 25,
  respawn: 2500,
} as const;

/** Where every box sits (m), row by row, from the route's gates alone: the room and every screen agree. */
export function rallyBoxSpots(route: Pick<RallyRoute, "gates">): [number, number][] {
  const out: [number, number][] = [];
  const last = route.gates.length - 1;
  let rows = 0;
  for (let k = RALLY_BOXES.first; k < last && rows < RALLY_BOXES.maxRows; k += RALLY_BOXES.every, rows++) {
    // A row across the road just before gate k, on its straight.
    const [gx, gz, rot] = route.gates[k];
    const r = (rot * Math.PI) / 180;
    const fx = Math.sin(r);
    const fz = -Math.cos(r);
    const cx = gx - fx * RALLY_BOXES.before;
    const cz = gz - fz * RALLY_BOXES.before;
    for (const o of RALLY_BOXES.lanes) out.push([cx - fz * o, cz + fx * o]);
  }
  return out;
}

export type RallyItem = "shock" | "bomb" | "missile";

/**
 * Mario Kart's odds, by place: the leader mostly gets what defends (a bomb
 * to drop, a shockwave), the back of the field mostly missiles to catch up.
 * `place` 1-based of `n` racing.
 */
export function rallyItem(place: number, n: number, rand: () => number = Math.random): RallyItem {
  const q = n > 1 ? (place - 1) / (n - 1) : 0.5;
  const w: [RallyItem, number][] = [
    ["missile", 0.15 + 0.7 * q],
    ["bomb", 0.5 - 0.35 * q],
    ["shock", 0.35 - 0.35 * q + 0.15],
  ];
  const total = w.reduce((a, [, x]) => a + x, 0);
  let r = rand() * total;
  for (const [item, x] of w) {
    if ((r -= x) <= 0) return item;
  }
  return "missile";
}

export type RallyPhase = "idle" | "invite" | "countdown" | "live" | "over";

export interface RallyRacer {
  name: string;
  /** Grid slot index. */
  slot: number;
  /** Next gate to cross (index); gates.length once finished. */
  next: number;
  /** Finish time (ms from lights out), or null. */
  ms: number | null;
  /** Too fast at some point: still racing, but untimed. */
  void: boolean;
  /** Left the room mid-race. */
  gone: boolean;
}

export interface RallyRoute {
  from: string;
  to: string;
  key: string;
  /** x, z (m) and the way through (deg clockwise from north); the last one is the finish. */
  gates: [number, number, number][];
  /** x, z (m), rot (deg clockwise from north). */
  grid: [number, number, number][];
  /** Start line to finish (m). */
  length: number;
}

export interface RallyState {
  phase: RallyPhase;
  /** This race's id (random, from the room). */
  id: string;
  by: string | null;
  route: RallyRoute | null;
  /** Invite closes here (server ms). */
  inviteEnds: number;
  lightsAt: number;
  startsAt: number;
  /** Live: ends by this time. Over: when it ended. */
  endsAt: number;
  racers: Record<string, RallyRacer>;
  /** Finishers in order (ids). */
  order: string[];
  /** Each item box's generation, and until when it's gone (server ms, 0 = there). */
  boxGen: number[];
  boxUntil: number[];
}

export function idleRally(): RallyState {
  return { phase: "idle", id: "", by: null, route: null, inviteEnds: 0, lightsAt: 0, startsAt: 0, endsAt: 0, racers: {}, order: [], boxGen: [], boxUntil: [] };
}

/** A race is on or about to be (the room's other games wait). */
export function rallyBusy(st: RallyState): boolean {
  return st.phase === "invite" || st.phase === "countdown" || st.phase === "live";
}

/** A sent route, or null when anything is off. */
export function validRoute(r: unknown, coordMax: number): RallyRoute | null {
  if (!r || typeof r !== "object") return null;
  const { from, to, key, gates, grid, length } = r as Record<string, unknown>;
  const id = /^[0-9]{1,8}$/;
  if (typeof from !== "string" || typeof to !== "string" || !id.test(from) || !id.test(to) || from === to) return null;
  if (typeof key !== "string" || key.length > 40 || !/^[0-9a-z:-]+$/.test(key)) return null;
  if (typeof length !== "number" || !Number.isFinite(length) || length < 100 || length > 200_000) return null;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= coordMax;
  if (!Array.isArray(gates) || gates.length < 1 || gates.length > RALLY.maxGates) return null;
  if (!gates.every((g) => Array.isArray(g) && g.length === 3 && num(g[0]) && num(g[1]) && typeof g[2] === "number" && Number.isFinite(g[2]))) return null;
  if (!Array.isArray(grid) || grid.length < 1 || grid.length > RALLY.maxGrid) return null;
  if (!grid.every((g) => Array.isArray(g) && g.length === 3 && num(g[0]) && num(g[1]) && typeof g[2] === "number" && Number.isFinite(g[2]))) return null;
  return {
    from,
    to,
    key,
    gates: (gates as number[][]).map(([x, z, rot]) => [x, z, rot]),
    grid: (grid as number[][]).map(([x, z, rot]) => [x, z, rot]),
    length,
  };
}

const racer = (name: string, slot: number): RallyRacer => ({ name, slot, next: 0, ms: null, void: false, gone: false });

/** Someone starts a race. `alone`: nobody else in the room, so no invite. */
export function startRally(st: RallyState, id: string, by: string, name: string, route: RallyRoute, now: number, alone: boolean): boolean {
  // A new race clears the last one's results (a rematch starts right from them).
  if (rallyBusy(st)) return false;
  Object.assign(st, idleRally());
  st.id = id;
  st.by = by;
  st.route = route;
  st.racers = { [by]: racer(name, 0) };
  const boxes = rallyBoxSpots(route).length;
  st.boxGen = Array.from({ length: boxes }, () => 0);
  st.boxUntil = Array.from({ length: boxes }, () => 0);
  st.phase = "invite";
  st.inviteEnds = now + (alone ? 0 : RALLY.invite);
  return true;
}

/** Someone accepts while the invite is open. */
export function joinRally(st: RallyState, id: string, name: string, now: number): boolean {
  const route = st.route;
  if (st.phase !== "invite" || now >= st.inviteEnds || !route || st.racers[id]) return false;
  const n = Object.keys(st.racers).length;
  if (n >= Math.min(RALLY.maxGrid, route.grid.length)) return false;
  st.racers[id] = racer(name, n);
  return true;
}

/** The clock: invite → countdown → live → over. True when anything changed. */
export function tickRally(st: RallyState, now: number, rand: () => number = Math.random): boolean {
  if (st.phase === "invite" && now >= st.inviteEnds) {
    st.phase = "countdown";
    st.lightsAt = now + RALLY.settle;
    const hold = RALLY.holdMin + rand() * (RALLY.holdMax - RALLY.holdMin);
    st.startsAt = Math.round(st.lightsAt + RALLY.lights * RALLY.lightMs + hold);
    return true;
  }
  if (st.phase === "countdown" && now >= st.startsAt) {
    st.phase = "live";
    st.endsAt = st.startsAt + RALLY.maxMs;
    return true;
  }
  if (st.phase === "live") {
    const left = Object.values(st.racers).filter((r) => r.ms === null && !r.gone);
    if (now >= st.endsAt || left.length === 0) {
      st.phase = "over";
      st.endsAt = now;
      return true;
    }
  }
  if (st.phase === "over" && now >= st.endsAt + RALLY.over) {
    Object.assign(st, idleRally());
    return true;
  }
  return false;
}

export type RallyEvent = { t: "gate"; k: number } | { t: "finish"; ms: number; place: number } | { t: "void" };

/** Where a racer was last (m) and when (server ms): the speed check's memory, kept by the room. */
export interface RallyTrack {
  x: number;
  z: number;
  at: number;
}

/**
 * One car state during the race. `last`: where the room saw this car
 * before (updated here). Returns what happened.
 */
export function stepRally(st: RallyState, id: string, x: number, z: number, now: number, last: RallyTrack | undefined): RallyEvent[] {
  const r = st.racers[id];
  const route = st.route;
  const out: RallyEvent[] = [];
  if (st.phase !== "live" || !r || !route || r.ms !== null || r.gone) return out;
  if (last && !r.void) {
    const dt = Math.max(0, now - last.at) / 1000;
    if (Math.hypot(x - last.x, z - last.z) > RALLY.maxSpeed * (dt + RALLY.jitter) + 5) {
      r.void = true;
      out.push({ t: "void" });
    }
  }
  // Gates in order: the next one (crossing two in one state counts both).
  while (r.next < route.gates.length) {
    const [gx, gz] = route.gates[r.next];
    const prev = last ?? { x, z };
    if (distToSegment(gx, gz, prev.x, prev.z, x, z) > RALLY.reach) break;
    r.next += 1;
    if (r.next < route.gates.length) {
      out.push({ t: "gate", k: r.next - 1 });
      continue;
    }
    if (r.void) {
      r.ms = -1;
      break;
    }
    r.ms = Math.max(0, now - st.startsAt);
    st.order.push(id);
    out.push({ t: "finish", ms: r.ms, place: st.order.length });
    // The winner's in: the rest have afterWinner.
    if (st.order.length === 1) st.endsAt = Math.min(st.endsAt, now + RALLY.afterWinner);
  }
  return out;
}

/** A racer takes box `box` of generation `gen`: true when it was theirs to take (the room then hands them an item). */
export function takeRallyBox(st: RallyState, id: string, box: number, gen: number, now: number): boolean {
  const r = st.racers[id];
  if (st.phase !== "live" || !r || r.ms !== null || r.gone) return false;
  if (!Number.isInteger(box) || box < 0 || box >= st.boxGen.length || st.boxGen[box] !== gen || now < st.boxUntil[box]) return false;
  st.boxGen[box] += 1;
  st.boxUntil[box] = now + RALLY_BOXES.respawn;
  return true;
}

/** A racer left: out of the race (their time stands if they finished). */
export function leaveRally(st: RallyState, id: string): boolean {
  const r = st.racers[id];
  if (!r) return false;
  if (st.phase === "invite") {
    if (id === st.by) {
      Object.assign(st, idleRally());
      return true;
    }
    delete st.racers[id];
    return true;
  }
  if (r.ms !== null) return false;
  r.gone = true;
  return true;
}

/** How far each racer is (gates crossed), for the standings. */
export function rallyStandings(st: RallyState): string[] {
  return Object.entries(st.racers)
    .sort(([a, ra], [b, rb]) => {
      const fa = st.order.indexOf(a);
      const fb = st.order.indexOf(b);
      if (fa >= 0 || fb >= 0) return (fa < 0 ? Infinity : fa) - (fb < 0 ? Infinity : fb);
      return rb.next - ra.next || ra.slot - rb.slot;
    })
    .map(([id]) => id);
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// ─── Receipts ───────────────────────────────────────────────
// A timed finish by a GitHub login gets a receipt signed by the room
// (party/rallyToken.ts), which the driver's client carries to the site; the
// site checks it (lib/towns/brasil-race-receipt.ts) and that the login is
// the signed-in viewer before saving the time.

export const RALLY_RECEIPT_VERSION = "rally1";
export const RALLY_RECEIPT_TTL_MS = 10 * 60_000;

export interface RallyReceipt {
  /** Town slug (the room). */
  room: string;
  /** The race's id. */
  race: string;
  /** The route: its key and cities, as the room raced them. */
  key: string;
  from: string;
  to: string;
  /** Driver GitHub login, lowercase. */
  dln: string;
  ms: number;
  place: number;
  /** Cars on the grid. */
  n: number;
  /** Expiry (epoch ms). */
  exp: number;
}
