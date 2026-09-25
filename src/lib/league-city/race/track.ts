// ─── Race track ─────────────────────────────────────────────
// The town race track: a closed circuit after Interlagos (São Paulo), traced
// from OpenStreetMap (© OpenStreetMap contributors, ODbL), scaled to 40% and
// smoothed so no corner is tighter than a 16 m radius. Counter-clockwise
// like the real one. Relative imports only (the PartyKit party bundles this).
//
// Meters, x east, z south (three.js, y up). Points run in the direction of
// travel and the first one is the start line. The track is sampled every
// SAMPLE m along a closed Catmull-Rom through them; `s` is the distance along
// the centerline from the start line.

export const TRACK_ID = "interlagos";

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
  /** Grid slots behind the start line: first slot and the gap between rows (m). */
  gridFirst: 8,
  gridGap: 7,
};

const SAMPLE = 2;

/** Control points (m). */
const POINTS: [number, number][] = [
  [-114.0, 67.7], [-112.0, 75.4], [-110.0, 83.2], [-108.0, 90.9], [-106.0, 98.7], [-104.0, 106.4],
  [-102.0, 114.2], [-100.0, 121.9], [-98.0, 129.7], [-96.0, 137.4], [-94.0, 145.2], [-92.0, 152.9],
  [-90.0, 160.6], [-88.0, 168.4], [-86.0, 176.1], [-84.0, 183.9], [-81.7, 191.5], [-78.0, 198.6],
  [-72.4, 204.3], [-65.1, 207.3], [-57.1, 207.2], [-49.7, 204.4], [-43.5, 199.3], [-36.4, 195.8],
  [-28.5, 195.0], [-20.8, 196.9], [-13.9, 201.0], [-6.6, 204.3], [1.1, 206.3], [9.1, 207.0],
  [17.1, 206.8], [25.0, 205.6], [32.6, 203.3], [39.8, 199.7], [46.5, 195.4], [52.6, 190.1],
  [57.9, 184.1], [62.4, 177.5], [65.9, 170.3], [68.5, 162.8], [70.9, 155.2], [73.1, 147.5],
  [75.4, 139.8], [77.6, 132.1], [79.9, 124.5], [82.1, 116.8], [84.3, 109.1], [86.5, 101.4],
  [88.7, 93.7], [90.8, 86.0], [92.8, 78.2], [94.7, 70.4], [96.5, 62.6], [98.3, 54.8],
  [100.2, 47.1], [102.3, 39.4], [104.4, 31.6], [106.4, 23.9], [108.5, 16.2], [110.5, 8.4],
  [112.6, 0.7], [114.7, -7.0], [116.8, -14.8], [118.9, -22.5], [120.9, -30.2], [123.1, -37.9],
  [125.2, -45.6], [127.4, -53.3], [129.6, -61.0], [131.7, -68.7], [133.0, -76.6], [131.5, -84.4],
  [127.1, -91.1], [120.6, -95.7], [113.0, -98.0], [105.1, -99.4], [97.3, -100.8], [89.4, -102.1],
  [81.4, -103.1], [73.4, -102.9], [65.6, -101.3], [58.1, -98.5], [51.3, -94.3], [45.2, -89.1],
  [39.8, -83.3], [34.8, -77.0], [30.0, -70.6], [25.3, -64.2], [20.6, -57.7], [15.9, -51.2],
  [11.3, -44.7], [6.6, -38.2], [1.9, -31.7], [-2.7, -25.2], [-7.4, -18.7], [-12.2, -12.2],
  [-16.9, -5.8], [-21.6, 0.7], [-26.3, 7.2], [-31.0, 13.6], [-35.8, 20.1], [-41.1, 26.0],
  [-47.8, 30.4], [-55.4, 32.7], [-63.4, 33.1], [-71.3, 32.3], [-79.0, 30.2], [-86.4, 27.0],
  [-92.9, 22.5], [-98.1, 16.4], [-101.0, 9.0], [-102.9, 1.2], [-104.3, -6.7], [-105.6, -14.6],
  [-106.6, -22.5], [-105.6, -30.4], [-101.7, -37.3], [-95.3, -42.1], [-87.6, -44.1], [-79.7, -44.4],
  [-72.1, -46.8], [-66.0, -51.9], [-62.4, -58.9], [-61.9, -66.9], [-64.3, -74.4], [-68.8, -81.1],
  [-71.7, -88.5], [-71.3, -96.4], [-67.7, -103.5], [-61.3, -108.1], [-53.5, -109.6], [-45.7, -107.9],
  [-38.5, -104.4], [-30.9, -102.1], [-22.9, -101.2], [-14.9, -101.7], [-7.2, -103.8], [-0.2, -107.5],
  [6.0, -112.6], [11.1, -118.8], [15.5, -125.4], [19.8, -132.2], [24.1, -138.9], [28.3, -145.7],
  [32.5, -152.5], [36.7, -159.3], [40.9, -166.2], [44.0, -173.5], [44.2, -181.5], [41.4, -188.9],
  [36.0, -194.8], [28.9, -198.3], [21.4, -201.1], [13.9, -203.8], [6.3, -206.4], [-1.5, -207.7],
  [-9.5, -206.8], [-17.4, -205.6], [-25.3, -204.1], [-33.1, -202.6], [-40.8, -200.4], [-48.3, -197.5],
  [-55.6, -194.2], [-62.8, -190.8], [-70.0, -187.3], [-77.0, -183.4], [-83.6, -178.9], [-89.8, -173.8],
  [-95.4, -168.1], [-100.0, -161.6], [-103.8, -154.6], [-106.7, -147.1], [-108.8, -139.4], [-110.8, -131.7],
  [-112.8, -123.9], [-114.7, -116.1], [-116.5, -108.3], [-118.3, -100.6], [-120.2, -92.8], [-122.0, -85.0],
  [-123.9, -77.2], [-125.8, -69.4], [-127.7, -61.7], [-129.5, -53.9], [-131.1, -46.0], [-132.3, -38.1],
  [-132.9, -30.1], [-133.0, -22.1], [-132.6, -14.2], [-131.6, -6.2], [-130.3, 1.7], [-128.7, 9.5],
  [-126.9, 17.3], [-125.0, 25.1], [-123.0, 32.8], [-121.0, 40.6], [-119.0, 48.3], [-117.0, 56.1],
  [-115.0, 63.8],];

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
