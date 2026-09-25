"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { M_TO_UNIT } from "@/lib/league-city/drive/tuning";
import { TRACK, WALL_OFFSET, pointAt, type Track } from "@/lib/league-city/race/track";
import { along, clearOfTrack, curbRuns, hash, offsetAt, treeSpots } from "@/lib/league-city/race/layout";
import { RACE } from "@/lib/league-city/race/race";

// The race track as you see it, in city units (1 m = M_TO_UNIT), made to be
// read from the high camera in daylight: bright grass, dark asphalt with
// white edges, red and white curbs and yellow chevron boards in every corner,
// the walls (the same segments the physics uses), the start line with its
// checkers, grid boxes and a gantry of five red lights, grandstands with a
// crowd, the pit building and trees.

const U = M_TO_UNIT;
const GRASS = "#4f9e3c";
const ASPHALT = "#454b57";
const LINE = "#ffffff";
const CURB_RED = "#e0323c";
const CURB_WHITE = "#f2f2f2";
const WALL_A = "#2f6fe4";
const WALL_B = "#eef0f4";

/** A flat ribbon from `a` to `b` m left of the centerline over [s0, s1], a quad every `step` m. */
function ribbon(t: Track, s0: number, s1: number, a: number, b: number, y: number, step = 2, stripe?: { every: number; colors: [THREE.Color, THREE.Color] }) {
  const pos: number[] = [];
  const col: number[] = [];
  const n = Math.max(1, Math.round((s1 - s0) / step));
  for (let i = 0; i < n; i++) {
    const sa = s0 + ((s1 - s0) * i) / n;
    const sb = s0 + ((s1 - s0) * (i + 1)) / n;
    const pa = offsetAt(t, sa, a);
    const pb = offsetAt(t, sa, b);
    const qa = offsetAt(t, sb, a);
    const qb = offsetAt(t, sb, b);
    const quad = [pa, pb, qb, pa, qb, qa];
    for (const p of quad) pos.push(p.x * U, y, p.z * U);
    if (stripe) {
      const c = stripe.colors[Math.floor(sa / stripe.every) % 2];
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (stripe) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Winding follows travel, so make sure every face looks up.
  const nrm = g.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  return g;
}

function useDispose<T extends { dispose: () => void }>(v: T): T {
  useEffect(() => () => v.dispose(), [v]);
  return v;
}

function Surface({ track }: { track: Track }) {
  const asphalt = useDispose(useMemo(() => ribbon(track, 0, track.length, TRACK.width / 2, -TRACK.width / 2, 0.05), [track]));
  const edges = useDispose(
    useMemo(() => {
      const w = TRACK.width / 2;
      const l = ribbon(track, 0, track.length, w - 0.3, w - 0.8, 0.1);
      const r = ribbon(track, 0, track.length, -w + 0.8, -w + 0.3, 0.1);
      const g = mergeFlat([l, r]);
      l.dispose();
      r.dispose();
      return g;
    }, [track]),
  );
  const curbs = useDispose(
    useMemo(() => {
      const colors: [THREE.Color, THREE.Color] = [new THREE.Color(CURB_RED), new THREE.Color(CURB_WHITE)];
      const w = TRACK.width / 2;
      const parts = curbRuns(track).flatMap(([s0, s1]) => [
        ribbon(track, s0, s1, w + TRACK.curb, w, 0.1, 1, { every: 2.5, colors }),
        ribbon(track, s0, s1, -w, -w - TRACK.curb, 0.1, 1, { every: 2.5, colors }),
      ]);
      const g = mergeFlat(parts);
      parts.forEach((p) => p.dispose());
      return g;
    }, [track]),
  );
  return (
    <group>
      {/* Flat layers a few cm apart: polygon offset keeps them from flickering at a distance. */}
      <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6000, 6000]} />
        <meshStandardMaterial color={GRASS} roughness={1} />
      </mesh>
      <mesh geometry={asphalt}>
        <meshStandardMaterial color={ASPHALT} roughness={0.9} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <mesh geometry={curbs}>
        <meshStandardMaterial vertexColors polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <mesh geometry={edges}>
        <meshStandardMaterial color={LINE} emissive={LINE} emissiveIntensity={0.2} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
      </mesh>
    </group>
  );
}

/** Concatenates non-indexed geometries (position, color when all have it). */
function mergeFlat(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const withColor = parts.length > 0 && parts.every((p) => p.getAttribute("color"));
  for (const p of parts) {
    pos.push(...(p.getAttribute("position").array as Float32Array));
    if (withColor) col.push(...(p.getAttribute("color").array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (withColor) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

/** Instanced boxes: each item a position (m), rotation, size (m) and color. */
function Boxes({
  items,
  emissive = 0.3,
}: {
  items: { x: number; y: number; z: number; rotY: number; w: number; h: number; d: number; color: string }[];
  emissive?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((b, i) => {
      _q.setFromAxisAngle(_y, b.rotY);
      _p.set(b.x * U, b.y * U, b.z * U);
      _s.set(b.w * U, b.h * U, b.d * U);
      _m.compose(_p, _q, _s);
      m.setMatrixAt(i, _m);
      m.setColorAt(i, _c.set(b.color));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh key={items.length} ref={ref} args={[undefined, undefined, items.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        emissive="#ffffff"
        emissiveIntensity={0}
        roughness={0.8}
        onBeforeCompile={(sh) => tintEmissive(sh, emissive)}
        customProgramCacheKey={() => `tint-${emissive}`}
      />
    </instancedMesh>
  );
}

/** Lets instance colors glow a little, so the night track reads. */
function tintEmissive(shader: THREE.WebGLProgramParametersWithUniforms, k: number) {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    `#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance += vColor.rgb * ${k.toFixed(2)};\n#endif`,
  );
}

/**
 * The walls as one continuous strip per side (inner face, top, outer face),
 * striped every WALL_STRIPE m. Physics uses overlapping boxes; drawn that way
 * their shared faces flickered.
 */
const WALL_STRIPE = 6;
const WALL_H = 1.2;

function Walls({ track }: { track: Track }) {
  const geo = useDispose(
    useMemo(() => {
      const pos: number[] = [];
      const col: number[] = [];
      const a = new THREE.Color(WALL_A);
      const b = new THREE.Color(WALL_B);
      const h = WALL_H * U;
      const t = TRACK.wallThickness / 2;
      const n = Math.round(track.length / 2);
      for (const side of [1, -1]) {
        for (let i = 0; i < n; i++) {
          const s0 = (i * track.length) / n;
          const s1 = ((i + 1) * track.length) / n;
          const c = Math.floor(s0 / WALL_STRIPE) % 2 === 0 ? a : b;
          const in0 = offsetAt(track, s0, side * (WALL_OFFSET - t));
          const in1 = offsetAt(track, s1, side * (WALL_OFFSET - t));
          const out0 = offsetAt(track, s0, side * (WALL_OFFSET + t));
          const out1 = offsetAt(track, s1, side * (WALL_OFFSET + t));
          const P = (p: { x: number; z: number }, y: number) => [p.x * U, y, p.z * U];
          const quads = [
            [P(in0, 0), P(in1, 0), P(in1, h), P(in0, h)],
            [P(in0, h), P(in1, h), P(out1, h), P(out0, h)],
            [P(out0, h), P(out1, h), P(out1, 0), P(out0, 0)],
          ];
          for (const [p0, p1, p2, p3] of quads) {
            for (const p of [p0, p1, p2, p0, p2, p3]) pos.push(...p);
            for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    }, [track]),
  );
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.7} />
    </mesh>
  );
}

// ─── Corner boards ───────────────────────────────────────────

/** Yellow boards with black chevrons on the outside of every corner, pointing the way it turns. */
function Chevrons({ track }: { track: Track }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffd21f";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#15171c";
    for (const x0 of [14, 58]) {
      g.beginPath();
      g.moveTo(x0, 8);
      g.lineTo(x0 + 22, 8);
      g.lineTo(x0 + 46, 32);
      g.lineTo(x0 + 22, 56);
      g.lineTo(x0, 56);
      g.lineTo(x0 + 24, 32);
      g.closePath();
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useDispose(tex);
  const boards = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const [s0, s1] of curbRuns(track)) {
      const mid = (s0 + s1) / 2;
      const turn = Math.sign(track.samples[Math.floor((((mid % track.length) + track.length) % track.length) / 2)].k) || 1;
      const side = -turn; // outside of the turn
      const len = s1 - s0;
      const n = Math.max(2, Math.min(6, Math.round(len / 12)));
      for (let i = 0; i < n; i++) {
        const s = s0 + ((i + 0.5) * len) / n;
        // Standing just in front of the wall's inner face, above it.
        const p = offsetAt(track, s, side * (WALL_OFFSET - TRACK.wallThickness / 2 - 0.3));
        const tangent = new THREE.Vector3(p.tx, 0, p.tz);
        // Facing the track: the normal points back across it.
        const normal = new THREE.Vector3(p.tz * -side, 0, -p.tx * -side);
        const x = new THREE.Vector3().crossVectors(up, normal);
        const flip = x.dot(tangent) < 0 ? -1 : 1;
        const m = new THREE.Matrix4().makeBasis(x.multiplyScalar(flip), up, normal);
        m.scale(new THREE.Vector3(3.2 * U, 1.6 * U, 1));
        m.setPosition(p.x * U, 2.1 * U, p.z * U);
        out.push(m);
      }
    }
    return out;
  }, [track]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    boards.forEach((b, i) => m.setMatrixAt(i, b));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [boards]);
  return (
    <instancedMesh key={boards.length} ref={ref} args={[undefined, undefined, boards.length]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial map={tex} side={THREE.DoubleSide} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.25} />
    </instancedMesh>
  );
}

// ─── Start line ──────────────────────────────────────────────

function StartLine({ track }: { track: Track }) {
  const items = useMemo(() => {
    const out: Parameters<typeof Boxes>[0]["items"] = [];
    const p = pointAt(track, 0);
    const rotY = Math.atan2(p.tx, p.tz);
    const cells = 14;
    const size = TRACK.width / cells;
    for (let row = 0; row < 2; row++) {
      for (let c = 0; c < cells; c++) {
        const off = -TRACK.width / 2 + size * (c + 0.5);
        const q = offsetAt(track, (row - 0.5) * size, off);
        out.push({ x: q.x, y: 0.07, z: q.z, rotY, w: size, h: 0.1, d: size, color: (row + c) % 2 ? "#111318" : "#f4f4f4" });
      }
    }
    // Grid boxes: a white bar across the front of each slot.
    for (const g of track.grid) {
      out.push({ x: g.x + Math.sin(g.heading) * 2.2, y: 0.07, z: g.z + Math.cos(g.heading) * 2.2, rotY: g.heading, w: 3, h: 0.1, d: 0.35, color: LINE });
    }
    return out;
  }, [track]);
  return <Boxes items={items} emissive={0.1} />;
}

/** Gantry over the start line with five pairs of red lights. `lit` reads 0–5 every frame. */
function Gantry({ track, lit, title }: { track: Track; lit: React.MutableRefObject<number>; title: string }) {
  const p = pointAt(track, 0);
  const rotY = Math.atan2(p.tx, p.tz);
  const span = TRACK.width / 2 + 1.5;
  const lamps = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const group = useRef<THREE.Group>(null);
  const mats = useRef<THREE.Material[] | null>(null);
  const banner = useMemo(() => bannerTexture(title), [title]);
  useDispose(banner);
  useFrame(({ camera }) => {
    const n = lit.current;
    lamps.current.forEach((m, i) => m?.color.set(Math.floor(i / 2) < n ? "#ff2a2a" : "#2a1416"));
    // The high camera passes right through the gantry: it goes see-through up close.
    const g = group.current;
    if (!g) return;
    if (!mats.current) {
      mats.current = [];
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) {
          m.transparent = true;
          mats.current!.push(m);
        }
      });
    }
    const d = Math.hypot(camera.position.x - g.position.x, camera.position.z - g.position.z) / U;
    const opacity = Math.min(1, Math.max(0.2, (d - 14) / 16));
    for (const m of mats.current) m.opacity = opacity;
  });
  const H = 7;
  return (
    <group ref={group} position={[p.x * U, 0, p.z * U]} rotation={[0, rotY, 0]}>
      {[-span, span].map((x) => (
        <mesh key={x} position={[x * U, (H / 2) * U, 0]}>
          <boxGeometry args={[0.6 * U, H * U, 0.6 * U]} />
          <meshStandardMaterial color="#2a2f3a" emissive="#2a2f3a" emissiveIntensity={0.4} />
        </mesh>
      ))}
      <mesh position={[0, H * U, 0]}>
        <boxGeometry args={[span * 2 * U, 1.6 * U, 0.8 * U]} />
        <meshStandardMaterial color="#1c2029" emissive="#1c2029" emissiveIntensity={0.3} />
      </mesh>
      {/* Banner above the lights, facing the grid. */}
      <mesh position={[0, (H + 1.9) * U, -0.1 * U]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[span * 2 * U, 2.2 * U]} />
        <meshBasicMaterial map={banner} toneMapped={false} />
      </mesh>
      {Array.from({ length: RACE.lights * 2 }, (_, i) => {
        const col = Math.floor(i / 2);
        const x = (col - (RACE.lights - 1) / 2) * 1.6;
        const y = H + (i % 2 === 0 ? 0.35 : -0.35);
        return (
          <mesh key={i} position={[x * U, y * U, -0.45 * U]}>
            <boxGeometry args={[0.55 * U, 0.55 * U, 0.1 * U]} />
            <meshBasicMaterial ref={(m) => void (lamps.current[i] = m)} color="#2a1416" toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function bannerTexture(title: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#c8ff3a";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#0d1016";
  const text = title.toUpperCase();
  // Shrink long names until they fit with a margin.
  let size = 40;
  do {
    g.font = `bold ${size}px monospace`;
    size -= 2;
  } while (size > 14 && g.measureText(text).width > c.width - 32);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// ─── Around the track ────────────────────────────────────────

const CROWD = ["#ff5a5f", "#ffb400", "#3ddc97", "#4cc9f0", "#b388ff", "#ff7eb6", "#f4f1bb", "#ffffff", "#ff9f1c"];

function Stands({ track }: { track: Track }) {
  const items = useMemo(() => {
    const out: Parameters<typeof Boxes>[0]["items"] = [];
    // Grandstands on the outside of the main straight, the pits on the inside.
    const stands = along(track, -40, 56, 12, -(WALL_OFFSET + 9)).filter((p) => clearOfTrack(track, p.x, p.z, WALL_OFFSET + 5));
    stands.forEach((p, k) => {
      for (let step = 0; step < 4; step++) {
        const back = -step * 2.2;
        const q = { x: p.x + Math.cos(p.rotY) * back, z: p.z - Math.sin(p.rotY) * back };
        out.push({ x: q.x, y: 0.8 + step * 1.2, z: q.z, rotY: p.rotY, w: 2.2, h: 1.6 + step * 2.4, d: 11.6, color: "#4a5060" });
        for (let seat = 0; seat < 8; seat++) {
          if (hash(k * 97 + step * 13 + seat) < 0.25) continue;
          const along2 = -5 + seat * 1.4;
          out.push({
            x: q.x + Math.sin(p.rotY) * along2,
            y: 1.6 + step * 2.4 + 0.5,
            z: q.z + Math.cos(p.rotY) * along2,
            rotY: p.rotY,
            w: 0.7,
            h: 0.9,
            d: 0.7,
            color: CROWD[Math.floor(hash(k * 31 + step * 7 + seat * 3) * CROWD.length)],
          });
        }
      }
      out.push({ x: p.x - Math.cos(p.rotY) * 8, y: 6.5, z: p.z + Math.sin(p.rotY) * 8, rotY: p.rotY, w: 0.6, h: 13, d: 12, color: "#2b303b" });
    });
    // Low and set back, so the high camera sees over them.
    const pits = along(track, -40, 50, 10, WALL_OFFSET + 14).filter((p) => clearOfTrack(track, p.x, p.z, WALL_OFFSET + 8));
    pits.forEach((p, k) => {
      out.push({ x: p.x, y: 1.5, z: p.z, rotY: p.rotY, w: 10, h: 3, d: 9.8, color: "#5b6272" });
      const f = offsetAt(track, p.s, WALL_OFFSET + 8.9);
      out.push({ x: f.x, y: 1.1, z: f.z, rotY: p.rotY, w: 0.2, h: 2.2, d: 7, color: k % 3 === 0 ? "#c8ff3a" : "#9aa3b5" });
    });
    return out;
  }, [track]);
  return <Boxes items={items} emissive={0.1} />;
}

function Trees({ track }: { track: Track }) {
  const items = useMemo(() => {
    const out: Parameters<typeof Boxes>[0]["items"] = [];
    treeSpots(track, 260).forEach((t, i) => {
      const h = 5 * t.scale;
      out.push({ x: t.x, y: h * 0.25, z: t.z, rotY: 0, w: 0.7, h: h * 0.5, d: 0.7, color: "#4a3524" });
      out.push({ x: t.x, y: h * 0.75, z: t.z, rotY: hash(i) * Math.PI, w: 3.2 * t.scale, h: h * 0.6, d: 3.2 * t.scale, color: i % 3 ? "#2f6b3e" : "#3c7d47" });
    });
    return out;
  }, [track]);
  return <Boxes items={items} emissive={0.05} />;
}

export default function TrackScene({ track, lit, title }: { track: Track; lit: React.MutableRefObject<number>; title: string }) {
  return (
    <group>
      <Surface track={track} />
      <Walls track={track} />
      <StartLine track={track} />
      <Gantry track={track} lit={lit} title={title} />
      <Stands track={track} />
      <Chevrons track={track} />
      <Trees track={track} />
    </group>
  );
}
