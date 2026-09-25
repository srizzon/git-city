"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Voxel look for drive-mode attacks, matching the city's blocky buildings:
// cube bursts (explosions, shockwaves, missile trails) from one fixed pool,
// the "?" crate for item boxes, the bomb and the missile.

// ─── Cube bursts ─────────────────────────────────────────────

export interface BurstOptions {
  count: number;
  /** Launch speed (city units/s), spread upward and outward. */
  speed: number;
  colors: string[];
  size?: number;
  life?: number;
  /** 0 = sphere, 1 = flat ring along the ground. */
  flat?: number;
  gravity?: number;
}

export interface VoxelBursts {
  burst: (x: number, y: number, z: number, o: BurstOptions) => void;
}

const POOL = 900;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0);

interface Cube {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  g: number;
}

export const Bursts = forwardRef<VoxelBursts>(function Bursts(_, ref) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cubes = useRef<Cube[] | null>(null);
  const next = useRef(0);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => () => geo.dispose(), [geo]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < POOL; i++) {
      m.setMatrixAt(i, _hidden);
      m.setColorAt(i, _c.set("#ffffff"));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);

  useImperativeHandle(ref, () => ({
    burst(x, y, z, o) {
      const m = mesh.current;
      if (!m) return;
      cubes.current ??= Array.from({ length: POOL }, () => ({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        r: new THREE.Vector3(),
        age: 1,
        life: 0,
        size: 1,
        g: 0,
      }));
      const flat = o.flat ?? 0;
      for (let k = 0; k < o.count; k++) {
        const i = next.current;
        next.current = (next.current + 1) % POOL;
        const c = cubes.current[i];
        const a = Math.random() * Math.PI * 2;
        const up = (1 - flat) * (0.3 + Math.random() * 0.9) + flat * 0.08;
        const out = Math.sqrt(Math.max(0, 1 - up * up));
        const sp = o.speed * (0.45 + Math.random() * 0.75);
        c.p.set(x, y, z);
        c.v.set(Math.cos(a) * out * sp, up * sp, Math.sin(a) * out * sp);
        c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        c.age = 0;
        c.life = (o.life ?? 1) * (0.7 + Math.random() * 0.6);
        c.size = (o.size ?? 1.4) * (0.6 + Math.random() * 0.8);
        c.g = o.gravity ?? 45;
        m.setColorAt(i, _c.set(o.colors[k % o.colors.length]));
      }
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    },
  }));

  useFrame((_, dt) => {
    const m = mesh.current;
    const list = cubes.current;
    if (!m || !list) return;
    for (let i = 0; i < POOL; i++) {
      const c = list[i];
      if (c.age >= c.life) {
        if (c.life > 0) {
          m.setMatrixAt(i, _hidden);
          c.life = 0;
        }
        continue;
      }
      c.age += dt;
      c.v.y -= c.g * dt;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < c.size / 2) {
        c.p.y = c.size / 2;
        c.v.y *= -0.3;
        c.v.x *= 0.7;
        c.v.z *= 0.7;
      }
      const k = 1 - c.age / c.life;
      _e.set(c.r.x * c.age, c.r.y * c.age, c.r.z * c.age);
      _q.setFromEuler(_e);
      _s.setScalar(Math.max(0.001, c.size * Math.min(1, k * 1.6)));
      m.setMatrixAt(i, _m.compose(_p.copy(c.p), _q, _s));
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[geo, undefined, POOL]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
});

export const FIRE = ["#ffd23f", "#ff8c1a", "#ff4d1a", "#ffffff", "#3a3a44", "#6a6a74"];
export const SHOCK_COLORS = ["#7ee8ff", "#c8f6ff", "#ffffff", "#39b8ff"];

// ─── The "?" crate ───────────────────────────────────────────

function crateTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a5a2b";
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = "#6b4220";
  for (const y of [5, 10]) g.fillRect(0, y, 16, 1);
  g.fillStyle = "#4a2c14";
  g.fillRect(0, 0, 16, 1);
  g.fillRect(0, 15, 16, 1);
  g.fillRect(0, 0, 1, 16);
  g.fillRect(15, 0, 1, 16);
  // Pixel "?"
  g.fillStyle = "#ffd23f";
  const q = ["0111110", "1100011", "0000011", "0000110", "0001100", "0001100", "0000000", "0001100"];
  q.forEach((row, y) => [...row].forEach((b, x) => b === "1" && g.fillRect(4 + x, 4 + y, 1, 1)));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let sharedCrate: THREE.CanvasTexture | null = null;

/** `faded`: you already hold an attack, so this box can't be taken right now. */
export function Crate({ x, z, size = 3.6, faded = false }: { x: number; z: number; size?: number; faded?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const tex = useMemo(() => (sharedCrate ??= crateTexture()), []);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime + x * 0.01;
    g.rotation.y = t * 1.2;
    g.position.y = size * 0.9 + Math.sin(t * 2.4) * 0.5;
  });
  return (
    <group ref={ref} position={[x, size, z]}>
      <mesh>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial
          map={tex}
          emissiveMap={tex}
          emissive="#ffffff"
          emissiveIntensity={faded ? 0.2 : 0.55}
          roughness={0.9}
          transparent={faded}
          opacity={faded ? 0.28 : 1}
          depthWrite={!faded}
        />
      </mesh>
    </group>
  );
}

// ─── Bomb and missile (city units) ───────────────────────────

export function Bomb({ armed }: { armed: () => boolean }) {
  const spark = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    const m = spark.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    const fast = armed() ? 10 : 4;
    m.color.set(Math.sin(t * fast) > 0 ? "#ff3b1a" : "#ffd23f");
  });
  return (
    <group>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[2.8, 2.8, 2.8]} />
        <meshStandardMaterial color="#1a1a20" emissive="#15151c" roughness={0.6} />
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <boxGeometry args={[0.9, 0.7, 0.9]} />
        <meshStandardMaterial color="#555560" emissive="#2a2a30" />
      </mesh>
      <mesh position={[0, 3.8, 0]}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshBasicMaterial ref={spark} color="#ffd23f" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Pointing +z. */
export function Missile() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.9, 0.9, 3.2]} />
        <meshStandardMaterial color="#e8e8ee" emissive="#8a8a96" />
      </mesh>
      <mesh position={[0, 0, 1.9]}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshBasicMaterial color="#ff3b3b" toneMapped={false} />
      </mesh>
      {[
        [0.75, 0],
        [-0.75, 0],
        [0, 0.75],
      ].map(([fx, fy], i) => (
        <mesh key={i} position={[fx, fy, -1.3]}>
          <boxGeometry args={[fx ? 0.6 : 0.2, fy ? 0.6 : 0.2, 0.8]} />
          <meshStandardMaterial color="#ff3b3b" emissive="#7a1a1a" />
        </mesh>
      ))}
      <mesh position={[0, 0, -1.9]}>
        <boxGeometry args={[0.6, 0.6, 0.5]} />
        <meshBasicMaterial color="#ffd23f" toneMapped={false} />
      </mesh>
    </group>
  );
}
