// ─── City of the day: game-run cops and gang ────────────────
// The cars the game drives in the Brasil map's city of the day, as a sim
// with no React and no physics, so it can be tested and tuned on its own
// (HeistMode draws the result as town-bot feeds). The way games that got
// pursuit right do it:
//   flow field   one map of distances to the player over the free lots round
//                them (a lot with a standing building is blocked; streets,
//                squares, lawns and rubble are free), rebuilt a few times a
//                second and shared by every car (Game AI Pro's flow fields)
//   steering     each car aims at the furthest point down that map it can
//                see, or straight at its spot once it sees it, and turns and
//                brakes like a car: re-aimed every frame, so it never circles
//                a waypoint (Reynolds' steering behaviors)
//   roles        not a queue behind you: one chases, two come up your sides,
//                one cuts ahead and stops across your street; and they keep
//                apart (separation)
//   spawn        two or three streets away, out of your camera's view, ahead
//                of you for the blocker (GTA); a car left far behind or stuck
//                is taken out and brought back
// Meters throughout; lots are the city grid (`lotM` meters). Pure.

export type CopRole = "chase" | "left" | "right" | "block";

export interface CopWorld {
  /** A lot's size, meters. */
  lotM: number;
  /** A standing building on this lot. */
  blocked: (lx: number, lz: number) => boolean;
}

/** Whoever the cars are after (or running from): where, how fast, which way. */
export interface Quarry {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Heading (rad, 0 = +z) when it isn't moving. */
  h: number;
}

export interface Car {
  id: string;
  role: CopRole;
  x: number;
  z: number;
  /** Heading, rad (0 = +z, like the drive's cars). */
  h: number;
  /** Forward speed, m/s. */
  v: number;
  /** Stopped (a crash or a blast) or slowed (the blue screen) until (ms). */
  stunUntil: number;
  slowUntil: number;
  /** Closest it got to its quarry lately, and when: no progress for a while is stuck. */
  best: number;
  bestAt: number;
  /** Where it aimed last frame (for a debug view). */
  aim?: { x: number; z: number };
}

export const COPS = {
  /** The field reaches this many lots round the player. */
  fieldRadius: 25,
  fieldEveryMs: 250,
  /** Closer than this (m) with a clear line, a car leaves the field and goes straight for its spot. */
  direct: 80,
  /** How far down the field a car looks for a point it can see (lots). */
  lookahead: 5,
  /** Turning (rad/s) at walking pace, less at speed; braking and pickup (m/s²). */
  turn: 2.4,
  turnRefSpeed: 14,
  accel: 9,
  brake: 16,
  /** Cars keep this far apart (m), and brake for one this close ahead. */
  separation: 9,
  tailgate: 8,
  /** A car's half width plus a margin (m): a line of sight is this wide. */
  halfWidth: 2.5,
  /** The feeler (Reynolds' obstacle avoidance): how far ahead (m, plus a share of the speed in s) a car checks for a building. */
  feeler: 3,
  feelerTime: 0.45,
  /** Where the side cars ride (m to your side) and how far ahead the blocker stops (m). */
  flank: 9,
  blockAhead: 55,
  /** Leading you: aim where you'll be this far ahead (s). */
  lead: 0.6,
  /** Spawn ring (m) round the player. */
  spawnMin: 60,
  spawnMax: 90,
  /** Further than this (m) a car is taken out and brought back closer. */
  leash: 150,
  /** No closer by this much (m) in this long (ms), and not already close: stuck. */
  stuckGain: 3,
  stuckMs: 3500,
  stuckNear: 25,
  /** At one star a car keeps this far behind (m), never faster than you up close. */
  followGap: 25,
} as const;

/** By stars (index): how many cars and their top speed (m/s). The player's top speed is 25, 35 boosting. */
export const COPS_BY_STARS: readonly { cars: number; speed: number }[] = [
  { cars: 0, speed: 0 },
  { cars: 1, speed: 20 },
  { cars: 2, speed: 22 },
  { cars: 3, speed: 24 },
  { cars: 4, speed: 26 },
  { cars: 4, speed: 29 },
];

/** The role of the car in each slot, by how many there are and the stars. */
export function roleOf(slot: number, stars: number): CopRole {
  if (slot === 2 && stars >= 3) return "block";
  if (slot === 1) return "left";
  if (slot === 3) return "right";
  return "chase";
}

const lotOf = (m: number, lotM: number) => Math.round(m / lotM);
const wrap = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

// ─── Flow field ──────────────────────────────────────────────

/** Steps (lots) from every free lot round the player to the player's lot. */
export class FlowField {
  readonly size: number;
  readonly dist: Int16Array;
  cx = 0;
  cz = 0;
  builtAt = -Infinity;
  /** Where it was built from (lot). */
  fromX = NaN;
  fromZ = NaN;

  constructor(readonly radius: number = COPS.fieldRadius) {
    this.size = radius * 2 + 1;
    this.dist = new Int16Array(this.size * this.size).fill(-1);
  }

  private index(lx: number, lz: number): number {
    const i = lx - this.cx + this.radius;
    const j = lz - this.cz + this.radius;
    return i < 0 || j < 0 || i >= this.size || j >= this.size ? -1 : j * this.size + i;
  }

  /** Breadth-first from (x, z) meters over free lots (the start lot counts as free even with a building on it). */
  build(world: CopWorld, x: number, z: number, now: number) {
    const sx = lotOf(x, world.lotM);
    const sz = lotOf(z, world.lotM);
    this.cx = sx;
    this.cz = sz;
    this.fromX = sx;
    this.fromZ = sz;
    this.builtAt = now;
    this.dist.fill(-1);
    const q = new Int32Array(this.size * this.size);
    let head = 0;
    let tail = 0;
    const start = this.index(sx, sz);
    this.dist[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const k = q[head++];
      const i = k % this.size;
      const j = (k - i) / this.size;
      const d = this.dist[k];
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.size || nj >= this.size) continue;
        const n = nj * this.size + ni;
        if (this.dist[n] !== -1) continue;
        if (world.blocked(ni - this.radius + this.cx, nj - this.radius + this.cz)) continue;
        this.dist[n] = d + 1;
        q[tail++] = n;
      }
    }
  }

  /** Steps from this lot to the player, or -1 (blocked, out of reach, off the field). */
  at(lx: number, lz: number): number {
    const k = this.index(lx, lz);
    return k < 0 ? -1 : this.dist[k];
  }

  /** The neighbouring lot one step closer (or, `away`, further), or null when there's none. */
  step(lx: number, lz: number, away = false): [number, number] | null {
    const here = this.at(lx, lz);
    let best: [number, number] | null = null;
    let bestD = here === -1 ? (away ? -1 : Infinity) : here;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const d = this.at(lx + dx, lz + dz);
      if (d === -1) continue;
      if (away ? d > bestD : d < bestD) {
        bestD = d;
        best = [lx + dx, lz + dz];
      }
    }
    return best;
  }
}

/**
 * Nothing standing between two points (m): a band a car wide (COPS.halfWidth
 * each side), sampled every eighth of a lot; the end lots don't count.
 */
export function lineOfSight(world: CopWorld, ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.01) return true;
  const n = Math.ceil(len / (world.lotM / 8));
  const px = (-(bz - az) / len) * COPS.halfWidth;
  const pz = ((bx - ax) / len) * COPS.halfWidth;
  const al = [lotOf(ax, world.lotM), lotOf(az, world.lotM)];
  const bl = [lotOf(bx, world.lotM), lotOf(bz, world.lotM)];
  for (let s = 1; s < n; s++) {
    const t = s / n;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    for (const k of [-1, 0, 1]) {
      const lx = lotOf(x + px * k, world.lotM);
      const lz = lotOf(z + pz * k, world.lotM);
      if ((lx === al[0] && lz === al[1]) || (lx === bl[0] && lz === bl[1])) continue;
      if (world.blocked(lx, lz)) return false;
    }
  }
  return true;
}

// ─── Steering ────────────────────────────────────────────────

/** The quarry's way forward: its velocity's direction, or its heading when it's still. */
function forwardOf(q: Quarry): [number, number] {
  const s = Math.hypot(q.vx, q.vz);
  return s > 3 ? [q.vx / s, q.vz / s] : [Math.sin(q.h), Math.cos(q.h)];
}

/** Where a car in this role wants to be. */
export function spotFor(role: CopRole, q: Quarry, stars: number): { x: number; z: number } {
  const [fx, fz] = forwardOf(q);
  if (stars <= 1) return { x: q.x - fx * COPS.followGap, z: q.z - fz * COPS.followGap };
  const lx = q.x + q.vx * COPS.lead;
  const lz = q.z + q.vz * COPS.lead;
  if (role === "left") return { x: lx - fz * COPS.flank, z: lz + fx * COPS.flank };
  if (role === "right") return { x: lx + fz * COPS.flank, z: lz - fx * COPS.flank };
  if (role === "block") return { x: q.x + fx * COPS.blockAhead, z: q.z + fz * COPS.blockAhead };
  return { x: lx, z: lz };
}

/** Turn toward (ax, az) and hold `speed`, as a car does: no strafing, slower in a hard turn. */
export function drive(c: Car, ax: number, az: number, speed: number, dt: number) {
  const err = wrap(Math.atan2(ax - c.x, az - c.z) - c.h);
  const turn = COPS.turn * Math.min(1, Math.max(0.55, COPS.turnRefSpeed / Math.max(1, Math.abs(c.v))));
  c.h = wrap(c.h + Math.max(-turn * dt, Math.min(turn * dt, err)));
  const want = speed * Math.max(0.35, 1 - Math.abs(err) / 2);
  const dv = want - c.v;
  c.v += dv > 0 ? Math.min(dv, COPS.accel * dt) : Math.max(dv, -COPS.brake * dt);
  c.x += Math.sin(c.h) * c.v * dt;
  c.z += Math.cos(c.h) * c.v * dt;
}

/**
 * Where a car aims this frame: straight at `spot` when it's near and in sight,
 * otherwise the furthest lot down the field it can see (up to COPS.lookahead
 * steps), or the spot itself when the field has no way.
 */
export function aimFor(c: Car, spot: { x: number; z: number }, world: CopWorld, field: FlowField, away = false): { x: number; z: number } {
  if (!away && Math.hypot(spot.x - c.x, spot.z - c.z) < COPS.direct && lineOfSight(world, c.x, c.z, spot.x, spot.z)) return spot;
  let lx = lotOf(c.x, world.lotM);
  let lz = lotOf(c.z, world.lotM);
  let aim: { x: number; z: number } | null = null;
  for (let i = 0; i < COPS.lookahead; i++) {
    const s = field.step(lx, lz, away);
    if (!s) break;
    [lx, lz] = s;
    const p = { x: lx * world.lotM, z: lz * world.lotM };
    if (i === 0 || lineOfSight(world, c.x, c.z, p.x, p.z)) aim = p;
    else break;
  }
  return aim ?? spot;
}

/** Pushes the aim away from other cars within COPS.separation (the aim is at least that far out, so the push turns the car). */
export function separate(c: Car, aim: { x: number; z: number }, others: readonly Car[]): { x: number; z: number } {
  let x = aim.x;
  let z = aim.z;
  for (const o of others) {
    if (o === c) continue;
    const dx = c.x - o.x;
    const dz = c.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01 || d >= COPS.separation) continue;
    const k = ((COPS.separation - d) / d) * 5;
    x += dx * k;
    z += dz * k;
  }
  return { x, z };
}

/** The slowest speed of a car right ahead of this one (within COPS.tailgate, in front), or Infinity. */
function aheadSpeed(c: Car, others: readonly Car[]): number {
  const fx = Math.sin(c.h);
  const fz = Math.cos(c.h);
  let v = Infinity;
  for (const o of others) {
    if (o === c) continue;
    const dx = o.x - c.x;
    const dz = o.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01 || d > COPS.tailgate || (dx * fx + dz * fz) / d < 0.6) continue;
    v = Math.min(v, Math.max(0, o.v) * 0.8);
  }
  return v;
}

/**
 * The feeler: when the point a little ahead of the car is a building (not
 * the quarry's own lot), the way out is the next free lot down the field, and
 * the car brakes. Null when the way ahead is clear.
 */
function avoid(c: Car, world: CopWorld, field: FlowField, quarryLot: [number, number], away: boolean): { x: number; z: number } | null {
  const reach = COPS.feeler + Math.abs(c.v) * COPS.feelerTime;
  const lx = lotOf(c.x + Math.sin(c.h) * reach, world.lotM);
  const lz = lotOf(c.z + Math.cos(c.h) * reach, world.lotM);
  if ((lx === quarryLot[0] && lz === quarryLot[1]) || !world.blocked(lx, lz)) return null;
  const s = field.step(lotOf(c.x, world.lotM), lotOf(c.z, world.lotM), away);
  return s ? { x: s[0] * world.lotM, z: s[1] * world.lotM } : null;
}

/** One cop, one frame. Returns true when it's stuck or left too far behind (take it out and bring it back). */
export function stepCop(c: Car, q: Quarry, stars: number, world: CopWorld, field: FlowField, others: readonly Car[], now: number, dt: number, decoy?: { x: number; z: number } | null): boolean {
  const top = (COPS_BY_STARS[Math.min(5, stars)]?.speed ?? 0) * (c.slowUntil > now ? 0.35 : 1);
  if (c.stunUntil > now) {
    c.v *= Math.max(0, 1 - dt * 3);
    c.x += Math.sin(c.h) * c.v * dt;
    c.z += Math.cos(c.h) * c.v * dt;
    return false;
  }
  const dist = Math.hypot(q.x - c.x, q.z - c.z);
  if (dist > COPS.leash) return true;
  if (dist < c.best - COPS.stuckGain || dist < COPS.stuckNear) {
    c.best = dist;
    c.bestAt = now;
  } else if (now - c.bestAt > COPS.stuckMs) return true;

  const [fx, fz] = forwardOf(q);
  // The blocker, once it's ahead of you and close: it stops across your street.
  if (c.role === "block" && stars >= 3 && !decoy) {
    const ahead = (c.x - q.x) * fx + (c.z - q.z) * fz;
    if (ahead > 10 && dist < 70) {
      const across = Math.atan2(fz, -fx);
      const err = wrap(across - c.h);
      c.h = wrap(c.h + Math.max(-2 * dt, Math.min(2 * dt, err)));
      c.v += Math.max(-COPS.brake * dt, -c.v);
      c.x += Math.sin(c.h) * c.v * dt;
      c.z += Math.cos(c.h) * c.v * dt;
      return false;
    }
  }
  const spot = decoy ?? spotFor(c.role, q, stars);
  const quarryLot: [number, number] = [lotOf(q.x, world.lotM), lotOf(q.z, world.lotM)];
  const out = avoid(c, world, field, quarryLot, false);
  const aim = out ?? separate(c, aimFor(c, spot, world, field), others);
  c.aim = aim;
  // Following (one star): full speed to catch up, then no faster than you.
  const qs = Math.hypot(q.vx, q.vz);
  let speed = stars <= 1 && dist < COPS.followGap + 15 ? Math.min(top, qs + 3) : top;
  if (out) speed *= 0.4;
  speed = Math.min(speed, aheadSpeed(c, others));
  drive(c, aim.x, aim.z, speed, dt);
  return false;
}

/**
 * One gang car (a lone cop's prey), one frame: it runs from the cop down the
 * field when they're close, otherwise roams toward `goal` (and wants a new one
 * when it gets there: returns true).
 */
export function stepGang(c: Car, cop: Quarry, goal: { x: number; z: number }, world: CopWorld, field: FlowField, others: readonly Car[], speed: number, now: number, dt: number, pulled = false): boolean {
  const top = speed * (c.slowUntil > now ? 0.35 : 1);
  if (c.stunUntil > now) {
    c.v *= Math.max(0, 1 - dt * 3);
    c.x += Math.sin(c.h) * c.v * dt;
    c.z += Math.cos(c.h) * c.v * dt;
    return false;
  }
  if (pulled) {
    drive(c, cop.x, cop.z, 10, dt);
    return false;
  }
  const near = Math.hypot(cop.x - c.x, cop.z - c.z) < 45;
  const out = avoid(c, world, field, [lotOf(cop.x, world.lotM), lotOf(cop.z, world.lotM)], near);
  if (out) {
    drive(c, out.x, out.z, top * 0.4, dt);
    return false;
  }
  if (near) {
    const aim = separate(c, aimFor(c, cop, world, field, true), others);
    drive(c, aim.x, aim.z, top, dt);
    return false;
  }
  const blocked = !lineOfSight(world, c.x, c.z, goal.x, goal.z);
  drive(c, goal.x, goal.z, top * 0.7, dt);
  return blocked || Math.hypot(goal.x - c.x, goal.z - c.z) < 8;
}

/**
 * A free lot between COPS.spawnMin and COPS.spawnMax from the player that the
 * field reaches, out of the camera's view (`camH`: where it looks), or ahead
 * of the player (`ahead`, the blocker). Null when there's none.
 */
export function spawnSpot(world: CopWorld, field: FlowField, q: Quarry, camH: number, ahead: boolean, random: () => number = Math.random): { x: number; z: number } | null {
  const [fx, fz] = forwardOf(q);
  const cx = Math.sin(camH);
  const cz = Math.cos(camH);
  let best: { x: number; z: number; score: number } | null = null;
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2 + random() * 0.2;
    for (const r of [COPS.spawnMin, (COPS.spawnMin + COPS.spawnMax) / 2, COPS.spawnMax]) {
      const x = q.x + Math.sin(ang) * r;
      const z = q.z + Math.cos(ang) * r;
      const lx = lotOf(x, world.lotM);
      const lz = lotOf(z, world.lotM);
      if (world.blocked(lx, lz) || field.at(lx, lz) === -1) continue;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      // Behind the camera, or (the blocker) ahead of the player.
      const score = ahead ? dx * fx + dz * fz : -(dx * cx + dz * cz);
      if (score < 0.2) continue;
      const s = score + random() * 0.1;
      if (!best || s > best.score) best = { x: lx * world.lotM, z: lz * world.lotM, score: s };
    }
  }
  return best ? { x: best.x, z: best.z } : null;
}

export function newCar(id: string, role: CopRole, x: number, z: number, h: number, now: number): Car {
  return { id, role, x, z, h, v: 0, stunUntil: 0, slowUntil: 0, best: Infinity, bestAt: now };
}
