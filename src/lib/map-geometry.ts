// Ground geometry for the SF / Bay Area map: road ribbons, park fills and the
// land mass. Pure (three's math only, no DOM), so it runs in a Web Worker: on
// the Bay map it is ~1 s of work that used to block the first frame.
import * as THREE from "three";
import type { SFRenderMap } from "./github";

// Smooth road ribbons: each OSM road polyline is smoothed (centripetal
// Catmull-Rom) + resampled, then a continuous strip with mitered joins.
const ROAD_HALF = [10, 6, 4, 3]; // asphalt half-width by class

function ribbonStrip(pts: { x: number; z: number }[], hw: number, y: number, out: number[]) {
  const N = pts.length;
  if (N < 2) return;
  const dirs: [number, number][] = [];
  for (let i = 0; i < N - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x, dz = pts[i + 1].z - pts[i].z, l = Math.hypot(dx, dz) || 1;
    dirs.push([dx / l, dz / l]);
  }
  const L: [number, number][] = [], R: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const din = dirs[Math.max(0, i - 1)], dout = dirs[Math.min(dirs.length - 1, i)];
    const ninx = -din[1], ninz = din[0], noutx = -dout[1], noutz = dout[0];
    let mx = ninx + noutx, mz = ninz + noutz; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    let dot = mx * ninx + mz * ninz; if (dot < 0.34) dot = 0.34;
    const sc = hw / dot;
    L.push([pts[i].x + mx * sc, pts[i].z + mz * sc]);
    R.push([pts[i].x - mx * sc, pts[i].z - mz * sc]);
  }
  for (let i = 0; i < N - 1; i++) {
    const a = L[i], b = L[i + 1], c = R[i], d = R[i + 1];
    out.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], c[0], y, c[1], b[0], y, b[1], d[0], y, d[1]);
  }
}

// Flat ground geoms are built as horizontal triangles with only a position
// attribute. Without normals MeshStandardMaterial gets no sun/sky lighting and
// reads black. Give every vertex an up-normal so the ground catches daylight.
export function upNormals(positions: Float32Array): Float32Array {
  const n = new Float32Array(positions.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  return n;
}

export function buildRoadArrays(roads: SFRenderMap["roads"], y: number): { asphalt: Float32Array; sidewalk: Float32Array } {
  const asphalt: number[] = [], sidewalk: number[] = [];
  for (const r of roads) {
    const p = r.p;
    if (p.length < 4) continue;
    const raw: THREE.Vector3[] = [];
    for (let i = 0; i < p.length; i += 2) raw.push(new THREE.Vector3(p[i], 0, p[i + 1]));
    let pts: { x: number; z: number }[];
    if (raw.length >= 3) {
      const curve = new THREE.CatmullRomCurve3(raw, false, "centripetal");
      const divs = Math.max(2, Math.min(220, Math.round(curve.getLength() / 12)));
      pts = curve.getSpacedPoints(divs).map((v) => ({ x: v.x, z: v.z }));
    } else {
      pts = raw.map((v) => ({ x: v.x, z: v.z }));
    }
    const hw = ROAD_HALF[r.c] ?? 3;
    ribbonStrip(pts, hw + 2.5, y, sidewalk);
    ribbonStrip(pts, hw, y, asphalt);
  }
  return { asphalt: new Float32Array(asphalt), sidewalk: new Float32Array(sidewalk) };
}

export function buildParkArray(parks: SFRenderMap["parks"], y: number): Float32Array {
  const pos: number[] = [];
  for (const pk of parks) {
    const p = pk.p;
    if (p.length < 8) continue;
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i + 1 < p.length; i += 2) contour.push(new THREE.Vector2(p[i], p[i + 1]));
    let tris: number[][];
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { continue; }
    for (const t of tris) {
      for (const idx of t) { const v = contour[idx]; pos.push(v.x, y, v.y); }
    }
  }
  return new Float32Array(pos);
}

function b64ToU8(b64: string): Uint8Array {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

// Land from the rasterized mask. A naive "quad per land cell" gives a hard
// 90° staircase coastline. Instead we blur the binary mask into a float field
// and run marching-squares over it: the iso-contour at 0.5 is interpolated
// along cell edges, so the shoreline comes out as smooth diagonals/curves
// rather than blocks — same geometry budget, no re-bake. The bay / ocean /
// Golden Gate gap still emerge for free wherever the field stays below 0.5.
export function buildLandArray(
  mask: { res: number; data: string },
  bounds: [number, number, number, number],
  y: number,
): Float32Array {
  const m = b64ToU8(mask.data);
  const res = mask.res;
  // binary → float, then a couple of box-blur passes to round the stairs
  const f0 = new Float32Array(res * res);
  for (let i = 0; i < m.length; i++) f0[i] = m[i];
  const blur = (a: Float32Array): Float32Array => {
    const o = new Float32Array(a.length);
    for (let z = 0; z < res; z++) for (let x = 0; x < res; x++) {
      let s = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, nz = z + dz;
        if (nx >= 0 && nx < res && nz >= 0 && nz < res) { s += a[nz * res + nx]; n++; }
      }
      o[z * res + x] = s / n;
    }
    return o;
  };
  const f = blur(blur(f0));

  const [minx, minz, maxx, maxz] = bounds;
  const cw = (maxx - minx) / res, ch = (maxz - minz) / res;
  const wx = (cx: number) => minx + (cx + 0.5) * cw;
  const wz = (cz: number) => minz + (cz + 0.5) * ch;
  const ISO = 0.5;
  const pos: number[] = [];
  const lerpE = (ax: number, az: number, av: number, bx: number, bz: number, bv: number): [number, number] => {
    const t = (ISO - av) / ((bv - av) || 1e-6);
    return [ax + (bx - ax) * t, az + (bz - az) * t];
  };
  const fan = (pts: [number, number][]) => {
    for (let i = 1; i + 1 < pts.length; i++) {
      pos.push(pts[0][0], y, pts[0][1], pts[i][0], y, pts[i][1], pts[i + 1][0], y, pts[i + 1][1]);
    }
  };
  for (let z = 0; z < res - 1; z++) for (let x = 0; x < res - 1; x++) {
    const v0 = f[z * res + x], v1 = f[z * res + x + 1], v2 = f[(z + 1) * res + x + 1], v3 = f[(z + 1) * res + x];
    const code = (v0 >= ISO ? 1 : 0) | (v1 >= ISO ? 2 : 0) | (v2 >= ISO ? 4 : 0) | (v3 >= ISO ? 8 : 0);
    if (code === 0) continue;
    const x0 = wx(x), x1 = wx(x + 1), z0 = wz(z), z1 = wz(z + 1);
    const C0: [number, number] = [x0, z0], C1: [number, number] = [x1, z0], C2: [number, number] = [x1, z1], C3: [number, number] = [x0, z1];
    if (code === 15) { fan([C0, C1, C2, C3]); continue; }
    const E01 = lerpE(x0, z0, v0, x1, z0, v1);
    const E12 = lerpE(x1, z0, v1, x1, z1, v2);
    const E23 = lerpE(x1, z1, v2, x0, z1, v3);
    const E30 = lerpE(x0, z1, v3, x0, z0, v0);
    switch (code) {
      case 1: fan([C0, E01, E30]); break;
      case 2: fan([C1, E12, E01]); break;
      case 4: fan([C2, E23, E12]); break;
      case 8: fan([C3, E30, E23]); break;
      case 3: fan([C0, C1, E12, E30]); break;
      case 6: fan([C1, C2, E23, E01]); break;
      case 12: fan([C2, C3, E30, E12]); break;
      case 9: fan([C0, E01, E23, C3]); break;
      case 7: fan([C0, C1, C2, E23, E30]); break;
      case 11: fan([C0, C1, E12, E23, C3]); break;
      case 13: fan([C0, E01, E12, C2, C3]); break;
      case 14: fan([C1, C2, C3, E30, E01]); break;
      case 5: fan([C0, E01, E30]); fan([C2, E23, E12]); break;
      case 10: fan([C1, E12, E01]); fan([C3, E30, E23]); break;
    }
  }
  return new Float32Array(pos);
}
