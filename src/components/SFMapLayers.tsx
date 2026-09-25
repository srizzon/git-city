"use client";

import { useMemo, useRef, useEffect, useState, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { mergeBufferGeometries } from "three-stdlib";
import * as THREE from "three";
import type { SFRenderMap } from "@/lib/github";
import { skyState } from "@/lib/sky";
import { buildLandArray, buildParkArray, buildRoadArrays, upNormals } from "@/lib/map-geometry";
import { loadMapGeometry } from "@/lib/city-snapshot-client";
import type { MapGeometryArrays } from "@/lib/map-geometry.worker";

// Ground geometry arrays → BufferGeometries (built in a worker, see map-geometry.ts).
function toGeometry(positions: Float32Array, bounds: SFRenderMap["bounds"]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(upNormals(positions), 3));
  // Every ground piece lies within the map bounds: give three the sphere
  // instead of letting it walk millions of vertices on the first cull
  // (~230 ms on a mid phone).
  const [minx, minz, maxx, maxz] = bounds;
  g.boundingSphere = new THREE.Sphere(
    new THREE.Vector3((minx + maxx) / 2, 0, (minz + maxz) / 2),
    Math.hypot(maxx - minx, maxz - minz) / 2 + 10,
  );
  return g;
}

interface GroundGeos { asphalt: THREE.BufferGeometry; sidewalk: THREE.BufferGeometry; parks: THREE.BufferGeometry; land: THREE.BufferGeometry | null }

function toGroundGeos(a: MapGeometryArrays, bounds: SFRenderMap["bounds"]): GroundGeos {
  return {
    asphalt: toGeometry(a.asphalt, bounds), sidewalk: toGeometry(a.sidewalk, bounds),
    parks: toGeometry(a.parks, bounds), land: a.land ? toGeometry(a.land, bounds) : null,
  };
}

/** The worker's geometry, or the same work on the main thread if it can't run. */
function useGroundGeos(sfMap: SFRenderMap): GroundGeos | null {
  const [geos, setGeos] = useState<GroundGeos | null>(null);
  useEffect(() => {
    let alive = true;
    loadMapGeometry().then((arrays) => {
      if (!alive) return;
      if (arrays) { setGeos(toGroundGeos(arrays, sfMap.bounds)); return; }
      const { asphalt, sidewalk } = buildRoadArrays(sfMap.roads, 0);
      setGeos(toGroundGeos({
        asphalt, sidewalk,
        parks: buildParkArray(sfMap.parks, 0),
        land: sfMap.landMask ? buildLandArray(sfMap.landMask, sfMap.bounds, -0.5) : null,
      }, sfMap.bounds));
    });
    return () => { alive = false; };
  }, [sfMap]);
  return geos;
}

const GG_ORANGE = "#c0392b"; // International Orange, slightly muted for night

// Axis-aligned box translated into place.
function ggBox(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

// Thin strut between two points in the X/Y plane at a fixed Z (for cable spans).
function ggStrut(x0: number, y0: number, x1: number, y1: number, z: number, thick: number): THREE.BufferGeometry {
  const dx = x1 - x0, dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const m = new THREE.Matrix4().makeRotationZ(Math.atan2(dy, dx));
  m.setPosition((x0 + x1) / 2, (y0 + y1) / 2, z);
  const g = new THREE.BoxGeometry(L, thick, thick);
  g.applyMatrix4(m);
  return g;
}

function ggMerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeBufferGeometries(parts, false) ?? parts[0];
}

// Suspension bridge built from the real roadway span: the deck sits low (on the
// street), twin tapered towers rise from the water, and parabolic main cables
// drape between them with vertical suspenders down to the deck.
function GoldenGateBridge({ a, b }: { a: [number, number]; b: [number, number] }) {
  const { deckGeo, towerGeo, cableGeo, mid, rotY } = useMemo(() => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const rotY = -Math.atan2(dz, dx);
    const half = len / 2;

    // wide enough to fully cover the class-0 roadway (half-width 10 + sidewalk)
    const deckW = 26, deckThick = 2.2, deckY = 4;
    const deckTopY = deckY + deckThick / 2;
    const railH = 1.8;
    const baseY = -3;                          // tower feet, just under the water
    const cableZ = deckW / 2 - 1.5;            // cable plane just inside deck edge

    // Real Golden Gate proportions: towers sit ~22% in from each end (so there's
    // a deep central main span + two side spans), and rise high above the deck.
    const xT = half * 0.56;                    // tower x (±) → towers at 22%/78%
    const towerAbove = 0.12 * (2 * xT);        // tall: ~12% of the main span
    const towerTopY = deckY + towerAbove;
    const sag = 0.42 * towerAbove;             // main-span cable dip below towers
    const mainCenterY = towerTopY - sag;
    const yAnchor = deckY + 3;                  // cable touches deck at the ends

    // Suspension-cable height profile: rises on the side spans, parabolic dip in
    // the main span between the two towers.
    const cableY = (x: number): number => {
      if (x <= -xT) return yAnchor + (towerTopY - yAnchor) * ((x + half) / (half - xT));
      if (x >= xT) return towerTopY + (yAnchor - towerTopY) * ((x - xT) / (half - xT));
      const u = x / xT; // -1..1 across the main span
      return mainCenterY + (towerTopY - mainCenterY) * u * u;
    };

    // ── deck: roadway + deep under-truss + edge railings ──
    const deckParts = [
      ggBox(len + 30, deckThick, deckW, 0, deckY, 0),
      ggBox(len + 30, 2.6, deckW - 6, 0, deckY - deckThick / 2 - 1.3, 0), // truss below
    ];
    for (const s of [1, -1]) {
      deckParts.push(ggBox(len + 30, railH, 1.1, 0, deckTopY + railH / 2, s * (deckW / 2 - 0.6)));
    }
    const deckGeo = ggMerge(deckParts);

    // ── twin towers: tapered legs + stacked portal crossbeams ──
    const towerParts: THREE.BufferGeometry[] = [];
    const beamD = cableZ * 2 + 6;
    const legSegs = 3;
    for (const tx of [-xT, xT]) {
      for (const tz of [cableZ, -cableZ]) {
        for (let s = 0; s < legSegs; s++) {
          const y0 = baseY + ((towerTopY - baseY) * s) / legSegs;
          const y1 = baseY + ((towerTopY - baseY) * (s + 1)) / legSegs;
          const w = 9 - 1.8 * s; // taper 9 → 7.2 → 5.4
          towerParts.push(ggBox(w, y1 - y0, w - 1.5, tx, (y0 + y1) / 2, tz));
        }
      }
      // portal crossbeams between the two legs, from just above deck to the top
      const nBeams = 4;
      for (let i = 0; i < nBeams; i++) {
        const y = deckY + 8 + ((towerTopY - 5) - (deckY + 8)) * (i / (nBeams - 1));
        towerParts.push(ggBox(5.5, 3.2, beamD, tx, y, 0));
      }
    }
    const towerGeo = ggMerge(towerParts);

    // ── main cables (sampled profile) + vertical suspenders ──
    const cableParts: THREE.BufferGeometry[] = [];
    const cableThick = Math.max(1.6, len * 0.001);
    const segN = 96;
    for (const cz of [cableZ, -cableZ]) {
      for (let i = 0; i < segN; i++) {
        const x0 = -half + (len * i) / segN, x1 = -half + (len * (i + 1)) / segN;
        cableParts.push(ggStrut(x0, cableY(x0), x1, cableY(x1), cz, cableThick));
      }
    }
    const susThick = 0.55, susSpacing = 26;
    const nSus = Math.floor(len / susSpacing);
    for (const cz of [cableZ, -cableZ]) {
      for (let i = 1; i < nSus; i++) {
        const x = -half + (len * i) / nSus;
        const cy = cableY(x);
        if (cy - deckTopY < 1.5) continue;
        cableParts.push(ggBox(susThick, cy - deckTopY, susThick, x, (cy + deckTopY) / 2, cz));
      }
    }
    const cableGeo = ggMerge(cableParts);

    return { deckGeo, towerGeo, cableGeo, mid, rotY };
  }, [a, b]);

  return (
    <group position={[mid[0], 0, mid[1]]} rotation={[0, rotY, 0]}>
      <mesh geometry={deckGeo} castShadow receiveShadow>
        <meshStandardMaterial color={GG_ORANGE} emissive={GG_ORANGE} emissiveIntensity={0.28} roughness={0.6} />
      </mesh>
      <mesh geometry={towerGeo} castShadow>
        <meshStandardMaterial color={GG_ORANGE} emissive={GG_ORANGE} emissiveIntensity={0.34} roughness={0.55} />
      </mesh>
      <mesh geometry={cableGeo}>
        <meshStandardMaterial color={GG_ORANGE} emissive={GG_ORANGE} emissiveIntensity={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}

// ─── Animated stylized water (bay / Pacific) ───────────────
// All-GPU, no render targets. The geometry stays nearly flat (so wave crests
// never poke through the shoreline) — the life comes from a PER-PIXEL ripple
// normal computed in the fragment shader, which catches the sun/moon and
// reflects the sky at grazing angles. Ripples fade out with distance so the
// far bay stays calm (no aliasing fireflies). Driven by the shared day/night
// `skyState` to stay in sync with the rest of the scene.
function Water({ cx, cz, size, y }: { cx: number; cz: number; size: number; y: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color("#0c2230") },
        uShallow: { value: new THREE.Color("#163f52") },
        uSky: { value: new THREE.Color("#0a1428") },
        uSunDir: { value: new THREE.Vector3(0.28, 0.86, 0.42) },
        uSunCol: { value: new THREE.Color("#cfe0ff") },
        uNight: { value: 1 },
      },
    ]),
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vWPos;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        // tiny large-scale swell only — stays well below the shoreline
        wp.y += sin(wp.x*0.004 + uTime*0.5)*0.3 + sin(wp.z*0.005 - uTime*0.4)*0.3;
        vWPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSunCol;
      uniform vec3 uSunDir; uniform float uNight; uniform float uTime;
      varying vec3 vWPos;
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec3 toCam = cameraPosition - vWPos;
        float dist = length(toCam);
        vec3 V = toCam / max(dist, 1e-4);
        // per-pixel ripple normal, faded out in the distance to keep far water calm
        float fade = clamp(1.0 - dist / 3500.0, 0.0, 1.0);
        vec2 p = vWPos.xz; float t = uTime;
        // gentle, low-slope ripples (kept small so the sheen reads as subtle
        // shimmer instead of bright criss-cross streaks)
        vec2 d = vec2(sin(p.x*0.045 + t*1.0), sin(p.y*0.05 - t*0.85)) * 0.14;
        d += vec2(sin((p.x+p.y)*0.08 + t*1.5), sin((p.x-p.y)*0.07 - t*1.2)) * 0.08;
        d += vec2(sin(p.x*0.15 - t*1.8), sin(p.y*0.13 + t*1.4)) * 0.04;
        d *= fade;
        vec3 N = normalize(vec3(-d.x, 1.0, -d.y));
        // key light: real sun by day, an overhead moon by night (sunDir is below
        // the horizon at night, so blend to an up-ish dir to keep the sheen alive)
        vec3 L = normalize(mix(normalize(uSunDir), vec3(0.30, 0.92, 0.20), uNight));
        float ndl = max(dot(N, L), 0.0);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 col = mix(uDeep, uShallow, clamp(0.30 + 0.35*ndl, 0.0, 1.0));
        col += uSky * 0.06 * (N.y*0.5 + 0.5);          // soft hemispheric fill
        col = mix(col, uSky * 1.1, fres * 0.35);       // faint sky reflection at grazing
        // tight, faint specular — small glints riding the ripples, not streaks
        float spec = pow(max(dot(N, normalize(L + V)), 0.0), 220.0);
        col += uSunCol * spec * 0.22 * fade;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  }), []);
  useFrame((_, dt) => {
    const m = matRef.current; if (!m) return;
    m.uniforms.uTime.value = (m.uniforms.uTime.value as number) + dt;
    const s = skyState;
    (m.uniforms.uSunDir.value as THREE.Vector3).set(s.sunDir[0], s.sunDir[1], s.sunDir[2]);
    (m.uniforms.uSunCol.value as THREE.Color).setRGB(s.sunColor[0], s.sunColor[1], s.sunColor[2]);
    (m.uniforms.uSky.value as THREE.Color).setRGB(s.skyHorizon[0], s.skyHorizon[1], s.skyHorizon[2]);
    m.uniforms.uNight.value = s.nightFactor;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, y, cz]}>
      <planeGeometry args={[size, size, 48, 48]} />
      <primitive object={mat} ref={matRef} attach="material" />
    </mesh>
  );
}

// ─── Instanced low-poly trees (parks + street trees) ───────
function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function sampleTrees(sfMap: SFRenderMap): Float32Array {
  const rng = rngFrom(917283);
  const out: number[] = [];
  // park trees: area-weighted sampling over triangulated parks
  const tris: number[] = []; const cum: number[] = []; let area = 0;
  for (const pk of sfMap.parks) {
    const p = pk.p; if (p.length < 8) continue;
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i + 1 < p.length; i += 2) contour.push(new THREE.Vector2(p[i], p[i + 1]));
    let t: number[][]; try { t = THREE.ShapeUtils.triangulateShape(contour, []); } catch { continue; }
    for (const tr of t) {
      const a = contour[tr[0]], b = contour[tr[1]], c = contour[tr[2]];
      const ar = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
      if (ar < 1) continue;
      tris.push(a.x, a.y, b.x, b.y, c.x, c.y); area += ar; cum.push(area);
    }
  }
  const PARK_TREES = Math.min(5000, Math.round(area / 520)); // ~1 tree / 520 m²
  for (let i = 0; i < PARK_TREES && cum.length; i++) {
    const r = rng() * area;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    const o = lo * 6;
    let u = rng(), v = rng(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const x = tris[o] + u * (tris[o + 2] - tris[o]) + v * (tris[o + 4] - tris[o]);
    const z = tris[o + 1] + u * (tris[o + 3] - tris[o + 1]) + v * (tris[o + 5] - tris[o + 1]);
    out.push(x, z, 0.8 + rng() * 0.8);
  }
  // street trees along primary/secondary roads
  let street = 0;
  for (const rd of sfMap.roads) {
    if (rd.c !== 1 && rd.c !== 2) continue;
    const p = rd.p, off = (rd.c === 1 ? 9 : 6) + 4;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const x1 = p[i], z1 = p[i + 1], x2 = p[i + 2], z2 = p[i + 3];
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      const steps = Math.floor(len / 38);
      const nx = -dz / (len || 1), nz = dx / (len || 1);
      for (let s = 1; s <= steps; s++) {
        if (rng() > 0.5) continue;
        const tt = s / (steps + 1);
        const bx = x1 + dx * tt, bz = z1 + dz * tt;
        const side = rng() > 0.5 ? 1 : -1;
        out.push(bx + nx * off * side, bz + nz * off * side, 0.7 + rng() * 0.6);
        if (++street > 6000) break;
      }
      if (street > 6000) break;
    }
    if (street > 6000) break;
  }
  return new Float32Array(out);
}

const _treeFwd = new THREE.Vector3();

// Real low-poly tree models (Kenney Nature Kit, CC0), instanced for variety.
const TREE_URLS = [
  "/models/trees/tree_default.glb",
  "/models/trees/tree_oak.glb",
  "/models/trees/tree_fat.glb",
  "/models/trees/tree_detailed.glb",
  "/models/trees/tree_pineTallA.glb",
  "/models/trees/tree_palmTall.glb",
];
useGLTF.preload(TREE_URLS);
const TREE_TARGET_H = 11; // meters

function Trees({ sfMap }: { sfMap: SFRenderMap }) {
  const gltfs = useGLTF(TREE_URLS) as unknown as { scene: THREE.Group }[];
  // Each Kenney tree has 2 materials (leafsGreen + woodBark). Keep them as
  // separate submeshes so the colors survive (merging to one material made the
  // whole tree monochrome).
  const variants = useMemo(() => gltfs.map((g) => {
    g.scene.updateMatrixWorld(true);
    const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
    let minY = Infinity, maxY = -Infinity;
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const ge = mesh.geometry.clone();
      ge.applyMatrix4(mesh.matrixWorld);
      ge.computeBoundingBox();
      minY = Math.min(minY, ge.boundingBox!.min.y);
      maxY = Math.max(maxY, ge.boundingBox!.max.y);
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
      (groups.get(mat) ?? groups.set(mat, []).get(mat)!).push(ge);
    });
    const subs = [...groups.entries()].map(([mat, geos]) => {
      const geo = geos.length === 1 ? geos[0] : (mergeBufferGeometries(geos, false) ?? geos[0]);
      geo.translate(0, -minY, 0); // whole tree base at y=0
      return { geo, mat };
    });
    return { subs, baseScale: TREE_TARGET_H / ((maxY - minY) || 1) };
  }), [gltfs]);

  const data = useMemo(() => sampleTrees(sfMap), [sfMap]);
  const count = data.length / 3;
  const V = variants.length;
  const counts = useMemo(() => {
    const c = variants.map(() => 0);
    for (let i = 0; i < count; i++) c[i % V]++;
    return c;
  }, [count, variants, V]);

  // Every tree's matrix, grouped by variant. The instanced meshes only hold the
  // trees currently worth drawing (see the cull below), packed at the front.
  const all = useMemo(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const mats = counts.map((n) => new Float32Array(n * 16));
    const pos = counts.map((n) => new Float32Array(n * 2));
    const cursor = variants.map(() => 0);
    for (let i = 0; i < count; i++) {
      const v = i % V;
      const x = data[i * 3], z = data[i * 3 + 1], js = data[i * 3 + 2];
      const sc = variants[v].baseScale * (0.7 + js * 0.6);
      q.setFromAxisAngle(up, (x * 13.7 + z * 7.1) % 6.283);
      p.set(x, 0, z); s.set(sc, sc, sc); m.compose(p, q, s);
      const ci = cursor[v]++;
      m.toArray(mats[v], ci * 16);
      pos[v][ci * 2] = x; pos[v][ci * 2 + 1] = z;
    }
    return { mats, pos };
  }, [data, count, variants, V, counts]);

  const refs = useRef<Record<string, THREE.InstancedMesh | null>>({});
  const cull = useRef({ t: -1, x: NaN, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, dirty: true });
  useEffect(() => { cull.current.dirty = true; }, [all]);

  // Only ~5-10% of the ~7k trees are on screen and inside the fog at a time;
  // drawing all of them was ~1M triangles a frame. Re-pack the visible ones
  // when the camera actually moves or turns (≤10 Hz). Generous margins — a
  // wider cone, fog + 400 m, and everything within 400 m — keep trees from
  // popping in between refreshes.
  useFrame(({ camera, scene, clock }) => {
    const c = cull.current, cp = camera.position, cq = camera.quaternion;
    const t = clock.elapsedTime;
    if (!c.dirty && t - c.t < 0.1) return;
    const moved = Math.hypot(cp.x - c.x, cp.y - c.y, cp.z - c.z);
    const turned = 1 - Math.abs(cq.x * c.qx + cq.y * c.qy + cq.z * c.qz + cq.w * c.qw);
    if (!c.dirty && moved < 60 && turned < 0.0015) return;
    c.t = t; c.x = cp.x; c.y = cp.y; c.z = cp.z; c.qx = cq.x; c.qy = cq.y; c.qz = cq.z; c.qw = cq.w; c.dirty = false;

    const fog = scene.fog as THREE.Fog | null;
    const far = (fog && "far" in fog ? fog.far : 16000) + 400;
    const far2 = far * far, near2 = 400 * 400;
    camera.getWorldDirection(_treeFwd);
    const cam = camera as THREE.PerspectiveCamera;
    // Half-angle of the view's diagonal, widened so turns don't reveal gaps.
    const halfV = ((cam.fov ?? 55) * Math.PI) / 360;
    const halfDiag = Math.atan(Math.tan(halfV) * Math.hypot(1, cam.aspect ?? 1.8)) + 0.35;
    const minCos = Math.cos(Math.min(Math.PI, halfDiag));

    for (let v = 0; v < V; v++) {
      const src = all.mats[v], pos = all.pos[v], n = pos.length / 2;
      const meshes: THREE.InstancedMesh[] = [];
      for (let si = 0; si < variants[v].subs.length; si++) {
        const mesh = refs.current[`${v}_${si}`];
        if (mesh) meshes.push(mesh);
      }
      if (meshes.length === 0) continue;
      let k = 0;
      for (let i = 0; i < n; i++) {
        const dx = pos[i * 2] - cp.x, dy = 5 - cp.y, dz = pos[i * 2 + 1] - cp.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > far2) continue;
        if (d2 > near2 && (dx * _treeFwd.x + dy * _treeFwd.y + dz * _treeFwd.z) < minCos * Math.sqrt(d2)) continue;
        for (const mesh of meshes) (mesh.instanceMatrix.array as Float32Array).set(src.subarray(i * 16, i * 16 + 16), k * 16);
        k++;
      }
      for (const mesh of meshes) {
        mesh.count = k;
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, k * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  });

  if (count === 0 || V === 0) return null;
  return (
    <group>
      {variants.map((vr, v) => vr.subs.map((sub, si) => (
        <instancedMesh
          key={`${v}_${si}`}
          ref={(el) => { refs.current[`${v}_${si}`] = el; }}
          args={[sub.geo, sub.mat, Math.max(1, counts[v])]}
          count={0}
          frustumCulled={false}
          castShadow
          receiveShadow
        />
      )))}
    </group>
  );
}

// Parks read black at night: the green is dark and the day/night lighting drops
// to near-zero after sunset. Mirror the building-window trick — give the grass a
// soft self-glow that rises with nightFactor and fades out in daylight, so parks
// stay readable green at 3am without blowing out at noon.
function Parks({ geo }: { geo: THREE.BufferGeometry }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    // muted self-glow — keep parks readable at night without the neon look
    if (matRef.current) matRef.current.emissiveIntensity = 0.1 + skyState.nightFactor * 0.26;
  });
  return (
    <mesh geometry={geo} position={[0, -0.16, 0]} renderOrder={3} receiveShadow>
      <meshStandardMaterial
        ref={matRef}
        color="#33513a"
        emissive="#16301d"
        emissiveIntensity={0.36}
        roughness={1}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
    </mesh>
  );
}

// Procedural ground relief: injects into MeshStandardMaterial (so it keeps the
// scene's real lights / fog / shadows) and breaks the flat solid color by
// (a) perturbing the up-facing normal with the gradient of a low-freq noise, so
// the plane catches the moving sun as soft relief, and (b) mottling the albedo.
// No textures, no extra passes — just a few noise taps over the ground pixels.
function patchGround(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vGPos;")
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n  vGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      /* glsl */ `#include <common>
      varying vec3 vGPos;
      float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gNoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(gHash(i), gHash(i+vec2(1.0,0.0)), u.x),
                   mix(gHash(i+vec2(0.0,1.0)), gHash(i+vec2(1.0,1.0)), u.x), u.y);
      }
      float gFbm(vec2 p){ float v=0.0,a=0.5; for(int k=0;k<4;k++){ v+=a*gNoise(p); p*=2.0; a*=0.5; } return v; }`,
    )
    .replace(
      "#include <normal_fragment_begin>",
      /* glsl */ `#include <normal_fragment_begin>
      {
        vec2 q = vGPos.xz;
        float e = 6.0;
        float gx = gNoise((q + vec2(e,0.0))*0.012) - gNoise((q - vec2(e,0.0))*0.012);
        float gz = gNoise((q + vec2(0.0,e))*0.012) - gNoise((q - vec2(0.0,e))*0.012);
        normal = normalize(normal + mat3(viewMatrix) * vec3(-gx, 0.0, -gz) * 3.5);
      }`,
    )
    .replace(
      "#include <map_fragment>",
      /* glsl */ `#include <map_fragment>
      diffuseColor.rgb *= 0.80 + 0.42 * gFbm(vGPos.xz * 0.0045);        // large-scale mottle
      diffuseColor.rgb *= 0.94 + 0.12 * gNoise(vGPos.xz * 0.06);        // fine grain`,
    );
}

// The land plane is the largest Universe-B surface. Like the parks, give it a
// faint cool self-glow that rises at night so the whole city floor reads as a
// lit ground (not a black void) and harmonizes with the boosted night ambient.
function Land({ geo, fallback }: { geo: THREE.BufferGeometry | null; fallback: { w: number; h: number; cx: number; cz: number } }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (matRef.current) matRef.current.emissiveIntensity = 0.06 + skyState.nightFactor * 0.16;
  });
  const mat = (
    <meshStandardMaterial
      ref={matRef}
      color="#4a5468"
      emissive="#2b3550"
      emissiveIntensity={0.22}
      roughness={0.97}
      side={THREE.DoubleSide}
      onBeforeCompile={patchGround}
      customProgramCacheKey={() => "gc-ground"}
    />
  );
  return geo ? (
    <mesh geometry={geo} receiveShadow>{mat}</mesh>
  ) : (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[fallback.cx, -0.5, fallback.cz]} receiveShadow>
      <planeGeometry args={[fallback.w + 120, fallback.h + 120]} />
      {mat}
    </mesh>
  );
}


export default function SFMapLayers({ sfMap }: { sfMap: SFRenderMap }) {
  const [minx, minz, maxx, maxz] = sfMap.bounds;
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  const w = maxx - minx, h = maxz - minz;
  const pad = Math.max(w, h) * 1.5;

  const ground = useGroundGeos(sfMap);
  return (
    <group>
      {/* animated stylized water — the bay / Pacific / Golden Gate gap.
          Sits below the land; wave crests stay under the shore (no poke-through). */}
      <Water cx={cx} cz={cz} size={Math.max(w, h) + pad} y={-2.0} />
      {ground && (
        <>
          {/* land — only where the mask says land (so water reads around it) */}
          <Land geo={ground.land} fallback={{ w, h, cx, cz }} />
          {/* streets — generated asphalt + sidewalk (mitered, follows the real roads) */}
          <mesh geometry={ground.sidewalk} position={[0, -0.28, 0]} renderOrder={1}>
            <meshStandardMaterial color="#525866" roughness={0.95} side={THREE.DoubleSide}
              polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
          <mesh geometry={ground.asphalt} position={[0, -0.24, 0]} renderOrder={2} receiveShadow>
            <meshStandardMaterial color="#32373f" roughness={0.92} side={THREE.DoubleSide}
              polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
          </mesh>
          {/* parks (matte green, with a soft night self-glow so they don't read black) */}
          <Parks geo={ground.parks} />
        </>
      )}
      <Suspense fallback={null}><Trees sfMap={sfMap} /></Suspense>
      <GoldenGateBridge a={sfMap.goldenGate[0]} b={sfMap.goldenGate[1]} />
    </group>
  );
}
