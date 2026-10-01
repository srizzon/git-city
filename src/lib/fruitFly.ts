// Autonomous fruit flies (#142). Pure steering logic, no rendering, so it can
// be unit tested and ticked from a single useFrame.
//
// Real Drosophila cruise in fairly straight segments broken by fast body
// saccades (sharp turns). We mimic that instead of a smooth sine wobble:
// each fly holds a heading bias that snaps to a new direction every so often.

export interface FlyObstacle {
  x: number;
  z: number;
  /** Half width (X) and half depth (Z) of the footprint. */
  hw: number;
  hd: number;
  /** Roof height. Buildings stand on y = 0. */
  h: number;
  /** False for scenery flies avoid but never land on (a sloped sign's box top is mid-air). */
  perch?: boolean;
}

export type FlyMode = "cruise" | "approach" | "landing" | "landed" | "takeoff";

export interface FlyState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  mode: FlyMode;
  /** Seconds left in the current mode (cruise, landed, takeoff). */
  timer: number;
  /** Where the fly is heading; for approach/landing, the roof spot. */
  tx: number; ty: number; tz: number;
  /** Saccade heading bias (unit vector on XZ) and time until the next one. */
  bx: number; bz: number;
  saccadeIn: number;
  /** Facing while landed, radians. */
  yaw: number;
  /** Obstacle index of the roof being approached or sat on, else -1. */
  perch: number;
}

export const FLY = {
  cruiseSpeed: 34,
  maxAccel: 70,
  /** Keep this far from walls and roofs while not landing. */
  clearance: 7,
  minAltitude: 8,
  maxAltitude: 140,
  /** Flies roam within this radius of the point the camera looks at. */
  roam: 220,
  /** Past this distance from home a fly is respawned near it. */
  leash: 700,
  separation: 10,
  /** A wall this much above us (cruising) is flown away from, not climbed. */
  tallWall: 30,
  /** Chance that a finished cruise leg ends on a roof. */
  landChance: 0.7,
  /** Seconds a fly sits on a roof before taking off again. */
  sitMin: 8,
  sitMax: 15,
} as const;

type Rng = () => number;

const range = (rng: Rng, a: number, b: number) => a + rng() * (b - a);

// ─── Spatial grid ───────────────────────────────────────────

/** Uniform XZ grid so each fly only looks at buildings near it (the city can hold 80k). */
export class ObstacleGrid {
  readonly obstacles: FlyObstacle[];
  private readonly cell: number;
  private readonly cells = new Map<number, number[]>();
  private readonly stamp: Uint32Array;
  private query = 0;

  constructor(obstacles: FlyObstacle[], cell = 64) {
    this.obstacles = obstacles;
    this.cell = cell;
    this.stamp = new Uint32Array(obstacles.length);
    obstacles.forEach((o, i) => {
      const x0 = Math.floor((o.x - o.hw) / cell), x1 = Math.floor((o.x + o.hw) / cell);
      const z0 = Math.floor((o.z - o.hd) / cell), z1 = Math.floor((o.z + o.hd) / cell);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const k = this.key(cx, cz);
          const list = this.cells.get(k);
          if (list) list.push(i);
          else this.cells.set(k, [i]);
        }
      }
    });
  }

  private key(cx: number, cz: number) {
    // Cell coords stay well inside ±2^15 for any city size we render.
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  /** Indices of obstacles whose cells touch the square of radius r around (x, z). Reuses `out`. */
  near(x: number, z: number, r: number, out: number[]): number[] {
    out.length = 0;
    const q = ++this.query;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const i of list) {
          if (this.stamp[i] === q) continue;
          this.stamp[i] = q;
          out.push(i);
        }
      }
    }
    return out;
  }
}

// ─── Lifecycle ──────────────────────────────────────────────

export function spawnFly(homeX: number, homeZ: number, rng: Rng = Math.random, grid?: ObstacleGrid): FlyState {
  const a = rng() * Math.PI * 2;
  const r = range(rng, 0.3, 1) * FLY.roam;
  const f: FlyState = {
    x: homeX + Math.cos(a) * r, y: range(rng, 40, FLY.maxAltitude), z: homeZ + Math.sin(a) * r,
    vx: 0, vy: 0, vz: 0,
    mode: "cruise", timer: 0,
    tx: 0, ty: 0, tz: 0,
    bx: 1, bz: 0, saccadeIn: 0,
    yaw: 0,
    perch: -1,
  };
  // Never appear inside a tall building.
  if (grid) f.y = Math.max(f.y, floorAt(grid, f.x, f.z, []));
  pickCruiseTarget(f, homeX, homeZ, rng);
  return f;
}

/** New cruise leg. With (awayX, awayZ), prefer a target on the far side of that direction. */
function pickCruiseTarget(f: FlyState, homeX: number, homeZ: number, rng: Rng, awayX = 0, awayZ = 0) {
  for (let t = 0; t < 8; t++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * FLY.roam;
    f.tx = homeX + Math.cos(a) * r;
    f.tz = homeZ + Math.sin(a) * r;
    if ((f.tx - f.x) * awayX + (f.tz - f.z) * awayZ < 0) break;
  }
  f.ty = range(rng, FLY.minAltitude + 15, FLY.maxAltitude);
  f.timer = range(rng, 4, 9);
  f.mode = "cruise";
  f.perch = -1;
}

/** Pick a random spot on a nearby roof. Returns false if nothing is close. */
function pickPerch(f: FlyState, grid: ObstacleGrid, homeX: number, homeZ: number, rng: Rng, scratch: number[]) {
  const near = grid.near(homeX, homeZ, FLY.roam, scratch);
  if (near.length === 0) return false;
  // A few tries so we don't settle on a sliver or a roof far above the cap.
  for (let t = 0; t < 6; t++) {
    const idx = near[Math.floor(rng() * near.length)];
    const o = grid.obstacles[idx];
    if (o.perch === false || o.h > FLY.maxAltitude * 2 || o.hw < 3 || o.hd < 3) continue;
    const sx = o.x + range(rng, -0.7, 0.7) * o.hw;
    const sz = o.z + range(rng, -0.7, 0.7) * o.hd;
    // Not under something taller (an overhang or a landmark's box).
    const covered = grid.near(sx, sz, 0, []).some((j) => {
      const c = grid.obstacles[j];
      return j !== idx && c.h > o.h && Math.abs(sx - c.x) < c.hw && Math.abs(sz - c.z) < c.hd;
    });
    if (covered) continue;
    f.tx = sx;
    f.tz = sz;
    f.ty = o.h;
    f.mode = "approach";
    f.perch = idx;
    f.timer = 25;
    return true;
  }
  return false;
}

export interface FlyContext {
  grid: ObstacleGrid;
  homeX: number;
  homeZ: number;
  flies: FlyState[];
  rng?: Rng;
  /** Reused query buffer. */
  scratch?: number[];
}

/** Advance one fly by dt seconds. */
export function stepFly(f: FlyState, dt: number, ctx: FlyContext) {
  const rng = ctx.rng ?? Math.random;
  const scratch = ctx.scratch ?? [];
  const { grid, homeX, homeZ } = ctx;

  // Camera jumped far away: reappear near it instead of commuting across the city.
  if (Math.hypot(f.x - homeX, f.z - homeZ) > FLY.leash) {
    Object.assign(f, spawnFly(homeX, homeZ, rng, grid));
    return;
  }

  if (f.mode === "landed") {
    f.timer -= dt;
    // Now and then a little turn in place, like a fly grooming and reorienting.
    if (rng() < dt * 0.8) f.yaw += range(rng, -1.2, 1.2);
    if (f.timer <= 0) {
      f.mode = "takeoff";
      f.timer = 0.5;
      f.vy = 18;
    }
    return;
  }

  // ── Desired velocity ──
  let dx = 0, dy = 0, dz = 0;
  const toX = f.tx - f.x, toZ = f.tz - f.z;
  const flat = Math.hypot(toX, toZ);

  if (f.mode === "takeoff") {
    dy = 20;
    f.timer -= dt;
    if (f.timer <= 0) pickCruiseTarget(f, homeX, homeZ, rng);
  } else if (f.mode === "landing") {
    // Straight down onto our own roof, correcting drift. The spot is inside
    // the perch footprint, so nothing else can be in the way.
    dx = toX * 3; dz = toZ * 3;
    dy = -Math.max(3, Math.min(12, (f.y - f.ty) * 1.5));
    if (f.y - f.ty < 0.15) {
      f.y = f.ty; f.x = f.tx; f.z = f.tz;
      f.vx = f.vy = f.vz = 0;
      f.mode = "landed";
      f.timer = range(rng, FLY.sitMin, FLY.sitMax);
      return;
    }
  } else {
    // cruise / approach: head for the target plus the saccade bias.
    const approaching = f.mode === "approach";
    const hoverY = approaching ? f.ty + FLY.clearance + 1 : f.ty;
    const speed = approaching ? Math.min(FLY.cruiseSpeed, 6 + flat * 0.9) : FLY.cruiseSpeed;
    if (flat > 0.001) { dx = (toX / flat) * speed; dz = (toZ / flat) * speed; }

    f.saccadeIn -= dt;
    if (f.saccadeIn <= 0) {
      const a = rng() * Math.PI * 2;
      f.bx = Math.cos(a); f.bz = Math.sin(a);
      f.saccadeIn = range(rng, 0.4, 1.4);
    }
    // Less wander when closing in on a roof so the approach stays clean.
    const wander = approaching ? Math.min(1, flat / 60) * 14 : 20;
    dx += f.bx * wander; dz += f.bz * wander;

    // Already beside a wall far above us: head away from it. Hovering up a
    // tall face for seconds looks stuck. The usual lookahead below still
    // applies along the new heading, so we don't slide into something else.
    const tall = approaching ? FLY.tallWall * 2 : FLY.tallWall;
    const here = floorAt(grid, f.x, f.z, scratch);
    const away = here - f.y > tall ? awayFromWalls(grid, f.x, f.z, f.y + tall, scratch) : null;
    let veer = false;
    if (away) {
      dx = away[0] * FLY.cruiseSpeed * 0.7;
      dz = away[1] * FLY.cruiseSpeed * 0.7;
      veer = true;
      pickCruiseTarget(f, homeX, homeZ, rng, -away[0], -away[1]);
    }

    // Fly over whatever is just ahead. When a wall is coming, ease off forward
    // speed and climb it. Check along both where we're moving and where we
    // want to go: a saccade can swing the heading toward a wall the current
    // velocity hasn't seen. (When turning away, only the new heading matters.)
    let ahead = scanAhead(grid, f, approaching && !away ? flat : Infinity, away ? [dx, dz] : [f.vx, f.vz, dx, dz], scratch);
    // A wall far above, coming up: veer off rather than climb its face.
    if (!away && ahead.blockedAt <= LOOKAHEAD[0] && ahead.wallTop - f.y > tall) {
      veer = true;
      pickCruiseTarget(f, homeX, homeZ, rng, ahead.wallX, ahead.wallZ);
      f.bx = -ahead.wallX; f.bz = -ahead.wallZ; // snap the saccade bias away too
      f.saccadeIn = range(rng, 0.6, 1.2);
      const tx = f.tx - f.x, tz = f.tz - f.z, tl = Math.hypot(tx, tz) || 1;
      dx = (tx / tl) * FLY.cruiseSpeed + f.bx * 20;
      dz = (tz / tl) * FLY.cruiseSpeed + f.bz * 20;
      ahead = scanAhead(grid, f, Infinity, [dx, dz], scratch);
    }
    let floor = ahead.floor;
    // Turning away from a tall wall: never climb it, even if the new heading
    // grazes it. We hold still a moment and try another heading next frame.
    if (veer && floor - f.y > tall) floor = f.y;
    // A tall wall we're leaving would pin us under its roof line; ignore it.
    if (!away) floor = Math.max(floor, here);
    if (ahead.blockedAt < Infinity) {
      // Stop dead at the clearance edge and rise; creeping forward still hits tall walls.
      const ease = ahead.blockedAt / LOOKAHEAD[LOOKAHEAD.length - 1];
      dx *= ease; dz *= ease;
    }
    // Aim a bit above the floor: easing toward it exactly would stall just
    // under it forever, still "blocked" and with no forward speed.
    dy = Math.max(-15, Math.min(25, (Math.max(hoverY, floor + 2) - f.y) * 1.5));

    f.timer -= dt;
    if (veer) {
      // keep the leg we just picked
    } else if (!approaching) {
      if (flat < 12 || f.timer <= 0) {
        if (!(rng() < FLY.landChance && pickPerch(f, grid, homeX, homeZ, rng, scratch))) {
          pickCruiseTarget(f, homeX, homeZ, rng);
        }
      }
    } else if (flat < 2.5 && f.y > hoverY - 3) {
      // A taller neighbour may keep us higher than hoverY; landing just descends further.
      f.mode = "landing";
    } else if (f.timer <= 0) {
      pickCruiseTarget(f, homeX, homeZ, rng); // couldn't get there, give up
    }
  }

  // ── Keep a little distance from each other ──
  for (const o of ctx.flies) {
    if (o === f || o.mode === "landed") continue;
    const ex = f.x - o.x, ey = f.y - o.y, ez = f.z - o.z;
    const d = Math.hypot(ex, ey, ez);
    if (d > 0.001 && d < FLY.separation) {
      const push = (1 - d / FLY.separation) * 40;
      dx += (ex / d) * push; dy += (ey / d) * push; dz += (ez / d) * push;
    }
  }

  // ── Integrate with an acceleration cap (cheap inertia) ──
  let ax = dx - f.vx, ay = dy - f.vy, az = dz - f.vz;
  const a = Math.hypot(ax, ay, az);
  const maxA = FLY.maxAccel * (f.mode === "landing" ? 1.5 : 1) * dt;
  if (a > maxA) { const s = maxA / a; ax *= s; ay *= s; az *= s; }
  f.vx += ax; f.vy += ay; f.vz += az;
  f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
  if (f.y < 0.5) { f.y = 0.5; if (f.vy < 0) f.vy = 0; }

  // Backstop: never end a step inside a building. Leave by the shallowest face.
  for (const i of grid.near(f.x, f.z, 0, scratch)) {
    const o = grid.obstacles[i];
    const left = f.x - (o.x - o.hw), right = o.x + o.hw - f.x;
    const back = f.z - (o.z - o.hd), front = o.z + o.hd - f.z;
    const up = o.h - f.y;
    if (left <= 0 || right <= 0 || back <= 0 || front <= 0 || up <= 0) continue;
    const m = Math.min(left, right, back, front, up);
    if (m === up) { f.y = o.h; if (f.vy < 0) f.vy = 0; }
    else if (m === left) { f.x -= left; if (f.vx > 0) f.vx = 0; }
    else if (m === right) { f.x += right; if (f.vx < 0) f.vx = 0; }
    else if (m === back) { f.z -= back; if (f.vz > 0) f.vz = 0; }
    else { f.z += front; if (f.vz < 0) f.vz = 0; }
  }
}

/** Distances ahead of the fly, along its heading, to check for buildings. */
const LOOKAHEAD = [8, 16, 26, 38];

interface Ahead {
  /** Lowest safe altitude along the scanned headings. */
  floor: number;
  /** Distance to the first spot we're too low for, its floor and heading. */
  blockedAt: number;
  wallTop: number;
  wallX: number;
  wallZ: number;
}

/** Scan up to `limit` ahead along each heading (flat pairs of x, z) for buildings in the way. */
function scanAhead(grid: ObstacleGrid, f: FlyState, limit: number, headings: number[], scratch: number[]): Ahead {
  const out: Ahead = { floor: FLY.minAltitude, blockedAt: Infinity, wallTop: 0, wallX: 0, wallZ: 0 };
  for (let h = 0; h < headings.length; h += 2) {
    const ux = headings[h], uz = headings[h + 1];
    const l = Math.hypot(ux, uz);
    if (l < 0.5) continue;
    for (const d of LOOKAHEAD) {
      // Don't look past the roof we're landing on at whatever stands behind it.
      if (d > limit) break;
      const fl = floorAt(grid, f.x + (ux / l) * d, f.z + (uz / l) * d, scratch);
      if (fl > f.y && d < out.blockedAt) Object.assign(out, { blockedAt: d, wallTop: fl, wallX: ux / l, wallZ: uz / l });
      out.floor = Math.max(out.floor, fl);
    }
  }
  return out;
}

/**
 * Unit XZ direction away from walls whose clearance zone we're in and whose
 * roof is above `above`, or null if none (or we're over a roof, not beside it).
 */
function awayFromWalls(grid: ObstacleGrid, x: number, z: number, above: number, scratch: number[]): [number, number] | null {
  const pad = FLY.clearance;
  let ax = 0, az = 0;
  for (const i of grid.near(x, z, pad, scratch)) {
    const o = grid.obstacles[i];
    if (o.h + pad <= above) continue;
    const cx = Math.max(o.x - o.hw, Math.min(x, o.x + o.hw));
    const cz = Math.max(o.z - o.hd, Math.min(z, o.z + o.hd));
    const ex = x - cx, ez = z - cz;
    const d = Math.hypot(ex, ez);
    if (d < 1e-3 || d >= pad * 1.5) continue;
    ax += ex / d; az += ez / d;
  }
  const l = Math.hypot(ax, az);
  return l > 1e-3 ? [ax / l, az / l] : null;
}

/** Lowest safe altitude at (x, z): tallest roof whose footprint, padded by the clearance, covers it. */
function floorAt(grid: ObstacleGrid, x: number, z: number, scratch: number[]) {
  const pad = FLY.clearance;
  let floor = 0;
  for (const i of grid.near(x, z, pad, scratch)) {
    const o = grid.obstacles[i];
    if (Math.abs(x - o.x) < o.hw + pad && Math.abs(z - o.z) < o.hd + pad) floor = Math.max(floor, o.h + pad);
  }
  return floor;
}

/** Buildings to obstacles. Positions are footprint centers; y is ignored. */
export function obstaclesFrom(buildings: { position: [number, number, number]; width: number; depth: number; height: number }[]): FlyObstacle[] {
  return buildings.map((b) => ({ x: b.position[0], z: b.position[2], hw: b.width / 2, hd: b.depth / 2, h: b.height }));
}
