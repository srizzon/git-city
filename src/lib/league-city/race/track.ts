// ─── Race track ─────────────────────────────────────────────
// The town race track: a short circuit (~740 m, a lap in about 35 s) built
// for time trials: the start straight, a right-hand hairpin, a chicane, an S
// up the hill, a long left sweeper to drift through, and the run back down.
// Relative imports only (the PartyKit party bundles this).
//
// Meters, x east, z south (three.js, y up). Points run in the direction of
// travel and the first one is the start line. The track is sampled every
// SAMPLE m along a closed Catmull-Rom through them; `s` is the distance along
// the centerline from the start line.

export const TRACK_ID = "sprint";

export const TRACK = {
  /** Asphalt width (m). */
  width: 14,
  /** Grass between the asphalt edge and the wall (m). */
  runoff: 4,
  wallThickness: 1,
  /** Wall collider height (m): nobody hops it. */
  wallHeight: 4,
  /** Curb width (m), laid outside the asphalt in corners. */
  curb: 1.6,
  /** A checkpoint every this many meters; the start line is checkpoint 0. */
  checkpointEvery: 40,
  /** Split times at these checkpoints (index), like sectors. */
  splits: [5, 10, 14],
  /** Grid slots behind the start line: first slot and the gap between rows (m). */
  gridFirst: 8,
  gridGap: 7,
};

const SAMPLE = 2;

/** Control points (m). */
const POINTS: [number, number][] = [
  [-10.6, 84.1], [-2.6, 84.1], [5.4, 84.1], [13.4, 84.1], [21.4, 84.1], [29.4, 84.1],
  [37.4, 84.1], [45.4, 84.1], [53.4, 84.1], [61.4, 83.9], [69.4, 83.6], [77.4, 83.1],
  [85.4, 82.3], [93.1, 80.2], [99.9, 76.2], [105.6, 70.5], [109.2, 63.4], [109.9, 55.5],
  [108.0, 47.8], [103.4, 41.3], [96.9, 36.7], [89.3, 34.3], [81.3, 34.4], [73.5, 36.3],
  [66.3, 39.6], [59.5, 43.8], [52.6, 47.8], [45.1, 50.6], [37.2, 51.1], [29.6, 48.5],
  [23.1, 44.0], [17.4, 38.4], [11.8, 32.6], [5.4, 27.9], [-2.1, 25.1], [-10.0, 24.3],
  [-18.0, 25.1], [-26.0, 25.1], [-33.3, 22.1], [-38.7, 16.3], [-41.7, 9.0], [-42.3, 1.0],
  [-40.2, -6.7], [-36.1, -13.5], [-30.9, -19.6], [-24.8, -24.7], [-18.1, -29.2], [-11.6, -33.8],
  [-6.1, -39.6], [-2.2, -46.5], [-0.0, -54.2], [-1.0, -62.1], [-4.9, -69.0], [-10.4, -74.8],
  [-17.2, -78.9], [-24.8, -81.5], [-32.6, -83.4], [-40.5, -84.1], [-48.5, -83.4], [-56.3, -81.6],
  [-63.9, -79.1], [-71.1, -75.6], [-77.4, -70.7], [-83.2, -65.2], [-88.5, -59.2], [-93.0, -52.6],
  [-96.6, -45.5], [-99.6, -38.1], [-102.4, -30.5], [-104.5, -22.8], [-105.9, -15.0], [-107.1, -7.0],
  [-108.0, 0.9], [-108.7, 8.9], [-109.3, 16.8], [-109.7, 24.8], [-110.0, 32.8], [-109.6, 40.8],
  [-108.5, 48.7], [-106.9, 56.6], [-104.6, 64.2], [-100.5, 71.1], [-94.9, 76.7], [-88.2, 81.1],
  [-80.6, 83.4], [-72.6, 84.1], [-64.6, 84.1], [-56.6, 84.1], [-48.6, 84.1], [-40.6, 84.1],
  [-32.6, 84.1], [-24.6, 84.1], [-16.6, 84.1],
];

export interface TrackSample {
  x: number;
  z: number;
  /** Distance from the start line (m). */
  s: number;
  /** Unit tangent (direction of travel). */
  tx: number;
  tz: number;
  /** Signed curvature (1/m): positive turns left. */
  k: number;
}

export interface GridSlot {
  x: number;
  z: number;
  /** Heading, radians about y (three.js): the car's +z faces the direction of travel. */
  heading: number;
}

export interface Track {
  samples: TrackSample[];
  length: number;
  /** Checkpoint distances; [0] is the start line. */
  checkpoints: number[];
  grid: GridSlot[];
  /** Spatial hash of sample indices, CELL m cells. */
  cells: Map<string, number[]>;
}

const CELL = 12;
const cellKey = (cx: number, cz: number) => `${cx},${cz}`;

/** Point on a centripetal Catmull-Rom segment p1→p2 at u ∈ [0, 1]. */
function catmull(p0: number[], p1: number[], p2: number[], p3: number[], u: number): [number, number] {
  const d = (a: number[], b: number[]) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const lerp = (a: number[], b: number[], ta: number, tb: number) => {
    const w = (t - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  const c = lerp(b1, b2, t1, t2);
  return [c[0], c[1]];
}

export function buildTrack(points: readonly [number, number][] = POINTS): Track {
  const n = points.length;
  // Dense polyline through the control points.
  const dense: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let j = 0; j < 8; j++) dense.push(catmull(p0, p1, p2, p3, j / 8));
  }
  // Even spacing by arc length.
  const cum: number[] = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[dense.length];
  const count = Math.round(total / SAMPLE);
  const length = count * SAMPLE;
  const pts: [number, number][] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const want = (i / count) * total;
    while (cum[j + 1] < want) j++;
    const a = dense[j];
    const b = dense[(j + 1) % dense.length];
    const w = (want - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    pts.push([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]);
  }

  const samples: TrackSample[] = pts.map(([x, z], i) => {
    const a = pts[(i - 1 + count) % count];
    const b = pts[(i + 1) % count];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return { x, z, s: i * SAMPLE, tx: dx / l, tz: dz / l, k: 0 };
  });
  // Curvature from the turn of the tangent over ±2 samples. Left of travel is
  // (tz, -tx); a left turn swings the tangent toward it.
  for (let i = 0; i < count; i++) {
    const a = samples[(i - 2 + count) % count];
    const b = samples[(i + 2) % count];
    const cross = a.tz * b.tx - a.tx * b.tz;
    samples[i].k = Math.asin(Math.max(-1, Math.min(1, cross))) / (4 * SAMPLE);
  }

  const cells = new Map<string, number[]>();
  samples.forEach((p, i) => {
    const key = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    const list = cells.get(key);
    if (list) list.push(i);
    else cells.set(key, [i]);
  });

  const checkpoints: number[] = [];
  for (let s = 0; s < length - TRACK.checkpointEvery / 2; s += TRACK.checkpointEvery) checkpoints.push(s);

  const track: Track = { samples, length, checkpoints, grid: [], cells };
  track.grid = gridSlots(track, 12);
  return track;
}

/** Staggered grid behind the start line: two columns, each slot half a row behind the last. */
function gridSlots(t: Track, count: number): GridSlot[] {
  const out: GridSlot[] = [];
  for (let i = 0; i < count; i++) {
    const s = t.length - (TRACK.gridFirst + i * (TRACK.gridGap / 2));
    const p = pointAt(t, s);
    const side = i % 2 === 0 ? 1 : -1; // pole on the left of the grid
    const off = side * (TRACK.width / 4);
    out.push({ x: p.x + p.tz * off, z: p.z - p.tx * off, heading: Math.atan2(p.tx, p.tz) });
  }
  return out;
}

/** Centerline point and tangent at distance s (wraps). */
export function pointAt(t: Track, s: number): { x: number; z: number; tx: number; tz: number } {
  const L = t.length;
  const u = (((s % L) + L) % L) / SAMPLE;
  const i = Math.floor(u);
  const w = u - i;
  const a = t.samples[i % t.samples.length];
  const b = t.samples[(i + 1) % t.samples.length];
  const tx = a.tx + (b.tx - a.tx) * w;
  const tz = a.tz + (b.tz - a.tz) * w;
  const l = Math.hypot(tx, tz) || 1;
  return { x: a.x + (b.x - a.x) * w, z: a.z + (b.z - a.z) * w, tx: tx / l, tz: tz / l };
}

export interface TrackSpot {
  /** Distance from the start line (m). */
  s: number;
  /** Signed distance from the centerline (m), positive to the left of travel. */
  lateral: number;
  /** Nearest sample index. */
  i: number;
}

/** Distance along and off the track of (x, z), measured from sample i. */
function refine(t: Track, i: number, x: number, z: number): TrackSpot {
  const p = t.samples[i];
  const along = (x - p.x) * p.tx + (z - p.z) * p.tz;
  const lateral = (x - p.x) * p.tz - (z - p.z) * p.tx;
  const s = (((p.s + Math.max(-SAMPLE, Math.min(SAMPLE, along))) % t.length) + t.length) % t.length;
  return { s, lateral, i };
}

/** The nearest point on the track to (x, z), from anywhere. Null when nothing is within `radius` m. */
export function locate(t: Track, x: number, z: number, radius = 40): TrackSpot | null {
  const r = Math.ceil(radius / CELL);
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  let best = -1;
  let bestD = radius * radius;
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const list = t.cells.get(cellKey(cx + dx, cz + dz));
      if (!list) continue;
      for (const i of list) {
        const p = t.samples[i];
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
  }
  return best < 0 ? null : refine(t, best, x, z);
}

/**
 * The nearest point within a window of the track around `s`: `back` m behind
 * to `fwd` m ahead. Stays on the right stretch where two run side by side.
 */
export function locateNear(t: Track, x: number, z: number, s: number, back: number, fwd: number): TrackSpot {
  const n = t.samples.length;
  const i0 = Math.floor(s / SAMPLE) - Math.ceil(back / SAMPLE);
  const i1 = Math.floor(s / SAMPLE) + Math.ceil(fwd / SAMPLE);
  let best = 0;
  let bestD = Infinity;
  for (let k = i0; k <= i1; k++) {
    const i = ((k % n) + n) % n;
    const p = t.samples[i];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return refine(t, best, x, z);
}

/** Signed shortest distance along the loop from a to b (m), in (-L/2, L/2]. */
export function arcDelta(t: Track, a: number, b: number): number {
  const L = t.length;
  let d = (((b - a) % L) + L) % L;
  if (d > L / 2) d -= L;
  return d;
}

/** Edge of the grass beyond which the wall starts (m from the centerline). */
export const WALL_OFFSET = TRACK.width / 2 + TRACK.runoff + TRACK.wallThickness / 2;

let cached: Track | null = null;
/** The track, built once. */
export function theTrack(): Track {
  cached ??= buildTrack();
  return cached;
}
