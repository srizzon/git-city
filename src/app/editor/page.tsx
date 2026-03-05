"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

type Tool = "draw" | "erase";
type ModelType = "door" | "window" | "text";
type PaintSurface = "front" | "back" | "left" | "right";
type HoverPaintTarget = { x: number; y: number; z: number; surface: PaintSurface };

type Block = {
  id: string;
  x: number;
  top: number;
  w: number;
  h: number;
  color: string;
};

type Voxel = {
  x: number;
  y: number;
  z: number;
  color: string;
};

type SavedPayload = {
  version?: number;
  grid?: { cols?: number; rows?: number; floors?: number; cellHeightFloor?: number };
  footprint?: { lotWidth?: number; lotDepth?: number };
  blocks?: Array<{ x?: number; top?: number; widthUnits?: number; heightUnits?: number; color?: string }>;
  roof_color?: string;
  voxels?: Array<{ x?: number; y?: number; z?: number; color?: string }>;
  image_decals?: Array<{
    id?: string;
    src?: string;
    surface?: PaintSurface;
    cx?: number;
    cy?: number;
    cz?: number;
    w?: number;
    h?: number;
    rotation_quarter?: number;
    mirror?: boolean;
  }>;
};

// Match city lot footprint (src/lib/github.ts): LOT_W=38, LOT_D=32.
// Keeping editor width aligned to LOT_W helps prevent overlap on placement.
const COLS = 38;
const CITY_LOT_WIDTH = 38;
const CITY_LOT_DEPTH = 32;
const FLOOR_UNITS = 10;
const MAX_FLOORS = 50;
const MAJOR_GRID_COLUMNS = 4;
const EDITOR_BUILDING_STORAGE_KEY = "gitcity_editor_building_v1";
const DEFAULT_ROOF_COLOR = "#6b4423";
const DEFAULT_COLOR = "#9ca3af";

const COLORS = [
  // Gray
  "#111827", "#374151", "#6b7280", "#9ca3af", "#e5e7eb",
  // Red
  "#7f1d1d", "#b91c1c", "#ef4444", "#f87171", "#fecaca",
  // Orange
  "#7c2d12", "#c2410c", "#f97316", "#fb923c", "#fed7aa",
  // Yellow
  "#713f12", "#a16207", "#eab308", "#facc15", "#fef08a",
  // Green
  "#14532d", "#15803d", "#22c55e", "#4ade80", "#bbf7d0",
  // Teal
  "#134e4a", "#0f766e", "#14b8a6", "#2dd4bf", "#99f6e4",
  // Cyan
  "#164e63", "#0e7490", "#06b6d4", "#22d3ee", "#a5f3fc",
  // Blue
  "#1e3a8a", "#1d4ed8", "#3b82f6", "#60a5fa", "#bfdbfe",
  // Indigo
  "#312e81", "#4338ca", "#6366f1", "#818cf8", "#c7d2fe",
  // Purple
  "#581c87", "#7e22ce", "#a855f7", "#c084fc", "#e9d5ff",
  // Pink
  "#831843", "#be185d", "#ec4899", "#f472b6", "#fbcfe8",
  // Brown / neutral warm
  "#422006", "#78350f", "#a16207", "#d97706", "#fde68a",
  // White-ish
  "#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8",
];

function cellKey(x: number, y: number) {
  return `${x}:${y}`;
}

type ModelPixel = { x: number; y: number; color: string };
type PaintModel = {
  id: string;
  label: string;
  type: ModelType;
  w: number;
  h: number;
  pixels: ModelPixel[];
};

type FacadeImageDecal = {
  id: string;
  src: string;
  surface: PaintSurface;
  cx: number;
  cy: number;
  cz: number;
  w: number;
  h: number;
  rotationQuarter: number;
  mirror: boolean;
};

type EditorSnapshot = {
  blocks: Block[];
  extraVoxels: Voxel[];
  imageDecals: FacadeImageDecal[];
  floors: number;
  roofColor: string;
};

function rotateModel90(source: PaintModel): PaintModel {
  const nextPixels = source.pixels.map((p) => ({
    x: source.h - 1 - p.y,
    y: p.x,
    color: p.color,
  }));
  return {
    ...source,
    w: source.h,
    h: source.w,
    pixels: nextPixels,
  };
}

function shouldMirrorTextOnSurface(surface: PaintSurface) {
  return surface === "back" || surface === "right";
}

function rectPixels(w: number, h: number, color: string): ModelPixel[] {
  const out: ModelPixel[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out.push({ x, y, color });
  }
  return out;
}

function framePixels(w: number, h: number, frame: string, inside: string): ModelPixel[] {
  const out: ModelPixel[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      out.push({ x, y, color: border ? frame : inside });
    }
  }
  return out;
}

const DOOR_MODELS: PaintModel[] = [
  { id: "door_01", label: "Door 01", type: "door", w: 4, h: 10, pixels: framePixels(4, 10, "#5b3a29", "#8b5e3c") },
  { id: "door_02", label: "Door 02", type: "door", w: 4, h: 10, pixels: framePixels(4, 10, "#2f2a26", "#6f5b4e") },
  { id: "door_03", label: "Door 03", type: "door", w: 5, h: 10, pixels: framePixels(5, 10, "#4b3621", "#9b7653") },
  { id: "door_04", label: "Door 04", type: "door", w: 4, h: 10, pixels: framePixels(4, 10, "#3a3a3a", "#7a7a7a") },
  { id: "door_05", label: "Door 05", type: "door", w: 4, h: 10, pixels: framePixels(4, 10, "#2b4b66", "#5f8fb5") },
  { id: "door_06", label: "Door 06", type: "door", w: 6, h: 10, pixels: framePixels(6, 10, "#2f261e", "#aa8a68") },
  { id: "door_07", label: "Door 07", type: "door", w: 5, h: 10, pixels: framePixels(5, 10, "#4e1f1f", "#8d4a4a") },
  { id: "door_08", label: "Door 08", type: "door", w: 4, h: 10, pixels: framePixels(4, 10, "#3b2e46", "#7a6891") },
  { id: "door_09", label: "Door 09", type: "door", w: 5, h: 10, pixels: framePixels(5, 10, "#2b2f33", "#61717f") },
  { id: "door_10", label: "Door 10", type: "door", w: 4, h: 10, pixels: framePixels(4, 10, "#4a3a1a", "#b58d2e") },
];

const WINDOW_MODELS: PaintModel[] = [
  { id: "win_01", label: "Window 01", type: "window", w: 4, h: 5, pixels: framePixels(4, 5, "#1d3557", "#60a5fa") },
  { id: "win_02", label: "Window 02", type: "window", w: 5, h: 5, pixels: framePixels(5, 5, "#0f4c5c", "#67e8f9") },
  { id: "win_03", label: "Window 03", type: "window", w: 4, h: 5, pixels: framePixels(4, 5, "#374151", "#bfdbfe") },
  { id: "win_04", label: "Window 04", type: "window", w: 6, h: 5, pixels: framePixels(6, 5, "#1f2937", "#93c5fd") },
  { id: "win_05", label: "Window 05", type: "window", w: 4, h: 5, pixels: framePixels(4, 5, "#334155", "#7dd3fc") },
  { id: "win_06", label: "Window 06", type: "window", w: 5, h: 5, pixels: framePixels(5, 5, "#2b3440", "#a5f3fc") },
  { id: "win_07", label: "Window 07", type: "window", w: 4, h: 5, pixels: framePixels(4, 5, "#312e81", "#818cf8") },
  { id: "win_08", label: "Window 08", type: "window", w: 5, h: 5, pixels: framePixels(5, 5, "#2b2d42", "#c4b5fd") },
  { id: "win_09", label: "Window 09", type: "window", w: 6, h: 5, pixels: framePixels(6, 5, "#3f3f46", "#e2e8f0") },
  { id: "win_10", label: "Window 10", type: "window", w: 4, h: 5, pixels: framePixels(4, 5, "#064e3b", "#99f6e4") },
];

const ALL_MODELS = [...DOOR_MODELS, ...WINDOW_MODELS];

type BuildingPreset = {
  id: string;
  label: string;
  roofColor: string;
  wallMain: string;
  wallAccent: string;
  doorModelId: string;
  windowModelId: string;
  stripeEvery: number;
};

const BUILDING_PRESETS: BuildingPreset[] = [
  {
    id: "glass-tower",
    label: "Glass Tower",
    roofColor: "#0f172a",
    wallMain: "#94a3b8",
    wallAccent: "#1f2937",
    doorModelId: "door_05",
    windowModelId: "win_02",
    stripeEvery: 3,
  },
  {
    id: "neo-brick",
    label: "Neo Brick",
    roofColor: "#5b3a29",
    wallMain: "#d97706",
    wallAccent: "#7c2d12",
    doorModelId: "door_01",
    windowModelId: "win_10",
    stripeEvery: 2,
  },
  {
    id: "minimal-white",
    label: "Minimal White",
    roofColor: "#334155",
    wallMain: "#f1f5f9",
    wallAccent: "#94a3b8",
    doorModelId: "door_04",
    windowModelId: "win_03",
    stripeEvery: 4,
  },
  {
    id: "cyber-grid",
    label: "Cyber Grid",
    roofColor: "#111827",
    wallMain: "#1f2937",
    wallAccent: "#22d3ee",
    doorModelId: "door_09",
    windowModelId: "win_07",
    stripeEvery: 2,
  },
  {
    id: "corporate-blue",
    label: "Corporate Blue",
    roofColor: "#1e3a8a",
    wallMain: "#cbd5e1",
    wallAccent: "#1d4ed8",
    doorModelId: "door_10",
    windowModelId: "win_04",
    stripeEvery: 3,
  },
  {
    id: "carbon-luxe",
    label: "Carbon Luxe",
    roofColor: "#0b0f16",
    wallMain: "#111827",
    wallAccent: "#9ca3af",
    doorModelId: "door_02",
    windowModelId: "win_09",
    stripeEvery: 4,
  },
  {
    id: "neon-slate",
    label: "Neon Slate",
    roofColor: "#0f172a",
    wallMain: "#1e293b",
    wallAccent: "#22d3ee",
    doorModelId: "door_08",
    windowModelId: "win_08",
    stripeEvery: 2,
  },
  {
    id: "metro-graphite",
    label: "Metro Graphite",
    roofColor: "#1f2937",
    wallMain: "#334155",
    wallAccent: "#e2e8f0",
    doorModelId: "door_09",
    windowModelId: "win_01",
    stripeEvery: 3,
  },
  {
    id: "tech-ivory",
    label: "Tech Ivory",
    roofColor: "#475569",
    wallMain: "#f8fafc",
    wallAccent: "#38bdf8",
    doorModelId: "door_04",
    windowModelId: "win_06",
    stripeEvery: 5,
  },
  {
    id: "midnight-grid-x",
    label: "Midnight Grid X",
    roofColor: "#020617",
    wallMain: "#0f172a",
    wallAccent: "#a3e635",
    doorModelId: "door_05",
    windowModelId: "win_07",
    stripeEvery: 2,
  },
];

function voxelKey(x: number, y: number, z: number) {
  return `${x}:${y}:${z}`;
}

function blocksToVoxels(source: Block[]): Voxel[] {
  const out = new Map<string, Voxel>();
  for (const b of source) {
    for (let y = b.top; y < b.top + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        out.set(voxelKey(x, y, 0), { x, y, z: 0, color: b.color });
      }
    }
  }
  return Array.from(out.values());
}

function isConnectedToBase3D(source: Voxel[], rows: number) {
  if (source.length === 0) return true;
  const occupied = new Set(source.map((v) => voxelKey(v.x, v.y, v.z)));
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const v of source) {
    if (v.y === rows - 1) {
      const k = voxelKey(v.x, v.y, v.z);
      if (!visited.has(k)) {
        visited.add(k);
        queue.push(k);
      }
    }
  }

  if (queue.length === 0) return false;

  const dirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const [x, y, z] = cur.split(":").map(Number);
    for (const [dx, dy, dz] of dirs) {
      const nk = voxelKey(x + dx, y + dy, z + dz);
      if (!occupied.has(nk) || visited.has(nk)) continue;
      visited.add(nk);
      queue.push(nk);
    }
  }

  return visited.size === occupied.size;
}

function addAutomaticRoof(source: Voxel[], roofColor: string, rows: number, cols: number, depth: number): Voxel[] {
  const out = new Map<string, Voxel>();
  for (const v of source) out.set(voxelKey(v.x, v.y, v.z), v);
  const roofY = 0; // Always keep roof at the top floor limit in editor.

  if (source.length === 0) {
    for (let x = 0; x < cols; x++) {
      for (let z = 0; z < depth; z++) {
        out.set(voxelKey(x, roofY, z), { x, y: roofY, z, color: roofColor });
      }
    }
    return Array.from(out.values());
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let topY = Number.POSITIVE_INFINITY;

  for (const v of source) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
    if (v.y < topY) topY = v.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minZ) || !Number.isFinite(topY)) {
    return Array.from(out.values());
  }

  if (roofY >= rows) return Array.from(out.values());
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      out.set(voxelKey(x, roofY, z), { x, y: roofY, z, color: roofColor });
    }
  }

  return Array.from(out.values());
}

function ColorVoxelInstanced({
  voxels,
  rows,
  cols,
  depth,
  color,
}: {
  voxels: Voxel[];
  rows: number;
  cols: number;
  depth: number;
  color: string;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(0.96, 0.96, 0.96);
    const xOffset = cols / 2;
    const zOffset = depth / 2;

    for (let i = 0; i < voxels.length; i++) {
      const v = voxels[i];
      pos.set(v.x - xOffset + 0.5, rows - v.y - 0.5, v.z - zOffset + 0.5);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(i, matrix);
    }

    mesh.count = voxels.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [voxels, rows, cols, depth]);

  if (voxels.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
}

function GhostVoxels({
  voxels,
  rows,
  cols,
  depth,
}: {
  voxels: Voxel[];
  rows: number;
  cols: number;
  depth: number;
}) {
  if (voxels.length === 0) return null;
  const xOffset = cols / 2;
  const zOffset = depth / 2;

  return (
    <group>
      {voxels.map((v) => (
        <mesh key={`ghost-${v.x}-${v.y}-${v.z}-${v.color}`} position={[v.x - xOffset + 0.5, rows - v.y - 0.5, v.z - zOffset + 0.5]}>
          <boxGeometry args={[0.98, 0.98, 0.98]} />
          <meshBasicMaterial color={v.color} transparent opacity={0.48} depthWrite={false} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}

function FacadeImageDecals({
  decals,
  rows,
  cols,
  depth,
  opacity = 1,
}: {
  decals: FacadeImageDecal[];
  rows: number;
  cols: number;
  depth: number;
  opacity?: number;
}) {
  const xOffset = cols / 2;
  const zOffset = depth / 2;
  const decalOutset = 0.01;
  const uniqueSources = useMemo(() => Array.from(new Set(decals.map((d) => d.src).filter(Boolean))), [decals]);
  const texturesBySrc = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const map = new Map<string, THREE.Texture>();
    for (const src of uniqueSources) {
      const texture = loader.load(src);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      map.set(src, texture);
    }
    return map;
  }, [uniqueSources]);

  useEffect(() => {
    return () => {
      for (const texture of texturesBySrc.values()) texture.dispose();
    };
  }, [texturesBySrc]);

  return (
    <group>
      {decals.map((d, idx) => {
        const worldY = rows - d.cy - 0.5;
        const isFrontBack = d.surface === "front" || d.surface === "back";
        const worldX = isFrontBack
          ? d.cx - xOffset + 0.5
          : d.surface === "left"
            ? -cols / 2 + decalOutset
            : cols / 2 - decalOutset;
        const worldZ = isFrontBack
          ? d.surface === "front"
            ? -depth / 2 + decalOutset
            : depth / 2 - decalOutset
          : d.cz - zOffset + 0.5;
        const yaw =
          d.surface === "front"
            ? 0
            : d.surface === "back"
              ? Math.PI
              : d.surface === "left"
                ? Math.PI / 2
                : -Math.PI / 2;
        return (
          <mesh
            key={`${d.id}-${idx}`}
            position={[worldX, worldY, worldZ]}
            rotation={[0, yaw, d.rotationQuarter * (Math.PI / 2)]}
            scale={[d.mirror ? -1 : 1, 1, 1]}
          >
            <planeGeometry args={[d.w, d.h]} />
            <meshBasicMaterial
              map={texturesBySrc.get(d.src) ?? null}
              transparent
              opacity={opacity}
              depthWrite={false}
              side={THREE.DoubleSide}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function VoxelEditor3D({
  voxels,
  ghostVoxels,
  imageDecals,
  ghostImageDecal,
  rows,
  cols,
  depth,
  cameraLocked,
  layFlat,
  onPaintCell,
  onPaintStrokeStart,
  setHoverTarget,
}: {
  voxels: Voxel[];
  ghostVoxels: Voxel[];
  imageDecals: FacadeImageDecal[];
  ghostImageDecal: FacadeImageDecal | null;
  rows: number;
  cols: number;
  depth: number;
  cameraLocked: boolean;
  layFlat: boolean;
  onPaintCell: (x: number, y: number, z: number, surface: PaintSurface) => void;
  onPaintStrokeStart: () => void;
  setHoverTarget: (cell: HoverPaintTarget | null) => void;
}) {
  const voxelList = useMemo(() => voxels, [voxels]);
  const [isPaintingStroke, setIsPaintingStroke] = useState(false);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const sceneGroupRef = useRef<THREE.Group>(null);
  const groupedByColor = useMemo(() => {
    const map = new Map<string, Voxel[]>();
    for (const v of voxelList) {
      const c = typeof v.color === "string" ? v.color : "#7c8aa0";
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(v);
    }
    return Array.from(map.entries());
  }, [voxelList]);

  function pointToVoxel(point: THREE.Vector3, surface: PaintSurface) {
    const y = Math.floor(rows - point.y);
    if (y < 0 || y >= rows) return null;

    if (surface === "front" || surface === "back") {
      const x = Math.floor(point.x + cols / 2);
      if (x < 0 || x >= cols) return null;
      return { x, y, z: surface === "front" ? 0 : depth - 1, surface };
    }

    const z = Math.floor(point.z + depth / 2);
    if (z < 0 || z >= depth) return null;
    return { x: surface === "left" ? 0 : cols - 1, y, z, surface };
  }

  function handlePaint(event: ThreeEvent<PointerEvent>, surface: PaintSurface) {
    event.stopPropagation();
    const localPoint = sceneGroupRef.current
      ? sceneGroupRef.current.worldToLocal(event.point.clone())
      : event.point.clone();
    const target = pointToVoxel(localPoint, surface);
    if (!target) return;
    setHoverTarget(target);
    onPaintCell(target.x, target.y, target.z, target.surface);
  }

  const paintPlanes = useMemo(
    () => [
      {
        surface: "front" as PaintSurface,
        position: [0, rows / 2, -depth / 2 + 1.05] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        size: [cols, rows] as [number, number],
      },
      {
        surface: "back" as PaintSurface,
        position: [0, rows / 2, depth / 2 - 1.05] as [number, number, number],
        rotation: [0, Math.PI, 0] as [number, number, number],
        size: [cols, rows] as [number, number],
      },
      {
        surface: "left" as PaintSurface,
        position: [-cols / 2 + 1.05, rows / 2, 0] as [number, number, number],
        rotation: [0, Math.PI / 2, 0] as [number, number, number],
        size: [depth, rows] as [number, number],
      },
      {
        surface: "right" as PaintSurface,
        position: [cols / 2 - 1.05, rows / 2, 0] as [number, number, number],
        rotation: [0, -Math.PI / 2, 0] as [number, number, number],
        size: [depth, rows] as [number, number],
      },
    ],
    [rows, cols, depth],
  );

  useEffect(() => {
    const step = 0.12;
    const onKeyDown = (event: KeyboardEvent) => {
      if (cameraLocked) return;
      const controls = controlsRef.current as (OrbitControlsImpl & {
        getAzimuthalAngle?: () => number;
        setAzimuthalAngle?: (angle: number) => void;
        getPolarAngle?: () => number;
        setPolarAngle?: (angle: number) => void;
        rotateLeft?: (angle: number) => void;
        rotateUp?: (angle: number) => void;
      }) | null;
      if (!controls) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (controls.getAzimuthalAngle && controls.setAzimuthalAngle) {
          controls.setAzimuthalAngle(controls.getAzimuthalAngle() + step);
        } else {
          controls.rotateLeft?.(step);
        }
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (controls.getAzimuthalAngle && controls.setAzimuthalAngle) {
          controls.setAzimuthalAngle(controls.getAzimuthalAngle() - step);
        } else {
          controls.rotateLeft?.(-step);
        }
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (controls.getPolarAngle && controls.setPolarAngle) {
          const next = Math.min(Math.PI - 0.2, controls.getPolarAngle() - step);
          controls.setPolarAngle(next);
        } else {
          controls.rotateUp?.(step);
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (controls.getPolarAngle && controls.setPolarAngle) {
          const next = Math.max(0.2, controls.getPolarAngle() + step);
          controls.setPolarAngle(next);
        } else {
          controls.rotateUp?.(-step);
        }
      } else {
        return;
      }
      controls.update();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cameraLocked]);

  return (
    <Canvas camera={{ position: [28, 26, 28], fov: 48 }}>
      <color attach="background" args={["#101015"]} />
      <ambientLight intensity={0.7} />
      <directionalLight intensity={1.1} position={[20, 24, 14]} />
      <group ref={sceneGroupRef} rotation={layFlat ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
        <gridHelper args={[90, 90, "#2b2b33", "#1b1b22"]} position={[0, 0, 0]} />
        {groupedByColor.map(([groupColor, groupVoxels]) => (
          <ColorVoxelInstanced
            key={`${groupColor}-${groupVoxels.length}`}
            voxels={groupVoxels}
            rows={rows}
            cols={cols}
            depth={depth}
            color={groupColor}
          />
        ))}
        <GhostVoxels voxels={ghostVoxels} rows={rows} cols={cols} depth={depth} />
        <FacadeImageDecals decals={imageDecals} rows={rows} cols={cols} depth={depth} />
        {ghostImageDecal && (
          <FacadeImageDecals decals={[ghostImageDecal]} rows={rows} cols={cols} depth={depth} opacity={0.45} />
        )}
        {paintPlanes.map((plane) => (
          <mesh
            key={`paint-plane-${plane.surface}`}
            position={plane.position}
            rotation={plane.rotation}
            onPointerDown={(event) => {
              setIsPaintingStroke(true);
              onPaintStrokeStart();
              handlePaint(event, plane.surface);
            }}
            onPointerMove={(event) => {
              event.stopPropagation();
              const localPoint = sceneGroupRef.current
                ? sceneGroupRef.current.worldToLocal(event.point.clone())
                : event.point.clone();
              const target = pointToVoxel(localPoint, plane.surface);
              setHoverTarget(target);
              if ((event.buttons & 1) === 1) handlePaint(event, plane.surface);
            }}
            onPointerUp={() => setIsPaintingStroke(false)}
            onPointerLeave={() => {
              setIsPaintingStroke(false);
              setHoverTarget(null);
            }}
          >
            <planeGeometry args={plane.size} />
            <meshBasicMaterial transparent opacity={0.08} color="#c8e64a" side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enabled={!cameraLocked && !isPaintingStroke}
      />
    </Canvas>
  );
}

export default function BuildingEditorPage() {
  const searchParams = useSearchParams();
  const depth3d = CITY_LOT_DEPTH;
  const maxFloorsQuery = Number(searchParams.get("max_floors") ?? MAX_FLOORS);
  const maxFloors = Number.isFinite(maxFloorsQuery)
    ? Math.max(1, Math.min(MAX_FLOORS, Math.floor(maxFloorsQuery)))
    : MAX_FLOORS;
  const [tool, setTool] = useState<Tool>("draw");
  const [cameraLocked, setCameraLocked] = useState(false);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [roofColor, setRoofColor] = useState(DEFAULT_ROOF_COLOR);
  const [showRoofPalette, setShowRoofPalette] = useState(false);
  const [showTextTool, setShowTextTool] = useState(false);
  const [showImageTool, setShowImageTool] = useState(false);
  const [showPresetTool, setShowPresetTool] = useState(false);
  const [textToolUnlocked, setTextToolUnlocked] = useState(false);
  const [imageToolUnlocked, setImageToolUnlocked] = useState(false);
  const [ownerLogin, setOwnerLogin] = useState("");
  const [textInput, setTextInput] = useState("");
  const [textSizePx, setTextSizePx] = useState(16);
  const [textLetterSpacing, setTextLetterSpacing] = useState(0);
  const [textRotationQuarter, setTextRotationQuarter] = useState(0);
  const [textMirrorEnabled, setTextMirrorEnabled] = useState(false);
  const [generatedTextModel, setGeneratedTextModel] = useState<PaintModel | null>(null);
  const [textPlacementReady, setTextPlacementReady] = useState(false);
  const [textError, setTextError] = useState("");
  const [imageSrc, setImageSrc] = useState("");
  const [imageWidthUnits, setImageWidthUnits] = useState(12);
  const [imageHeightUnits, setImageHeightUnits] = useState(12);
  const [imageRotationQuarter, setImageRotationQuarter] = useState(0);
  const [imageMirrorEnabled, setImageMirrorEnabled] = useState(false);
  const [imagePlacementReady, setImagePlacementReady] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageDecals, setImageDecals] = useState<FacadeImageDecal[]>([]);
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditorSnapshot[]>([]);
  const [layFlat, setLayFlat] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [floors, setFloors] = useState(maxFloors);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [paintWholeBlock, setPaintWholeBlock] = useState(false);
  const [copyFromFloor, setCopyFromFloor] = useState(1);
  const [copyToFloors, setCopyToFloors] = useState("");
  const [extraVoxels, setExtraVoxels] = useState<Voxel[]>([]);
  const [expandedPanel, setExpandedPanel] = useState<ModelType | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<HoverPaintTarget | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveOk, setSaveOk] = useState(false);
  const [busyAction, setBusyAction] = useState<"draft" | "publish" | null>(null);
  const [loadedFromCloud, setLoadedFromCloud] = useState(false);
  const [joystickDragging, setJoystickDragging] = useState(false);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  const joystickVectorRef = useRef({ x: 0, y: 0 });
  const rotateIntervalRef = useRef<number | null>(null);
  const previousRowsRef = useRef(floors * FLOOR_UNITS);
  const skipRowsReanchorRef = useRef(false);
  const blocksRef = useRef(blocks);
  const extraVoxelsRef = useRef(extraVoxels);
  const imageDecalsRef = useRef(imageDecals);
  const floorsRef = useRef(floors);
  const roofColorRef = useRef(roofColor);

  const rows = floors * FLOOR_UNITS;
  const shopHref = ownerLogin ? `/shop/${ownerLogin}` : "/shop";
  const floorOptions = useMemo(
    () => Array.from({ length: maxFloors }, (_, i) => i + 1),
    [maxFloors],
  );

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  useEffect(() => {
    extraVoxelsRef.current = extraVoxels;
  }, [extraVoxels]);

  useEffect(() => {
    imageDecalsRef.current = imageDecals;
  }, [imageDecals]);

  useEffect(() => {
    floorsRef.current = floors;
  }, [floors]);

  useEffect(() => {
    roofColorRef.current = roofColor;
  }, [roofColor]);

  useEffect(() => {
    setFloors(maxFloors);
  }, [maxFloors]);

  useEffect(() => {
    const previousRows = previousRowsRef.current;
    if (previousRows === rows) return;

    if (skipRowsReanchorRef.current) {
      previousRowsRef.current = rows;
      skipRowsReanchorRef.current = false;
      return;
    }

    const delta = rows - previousRows;
    setBlocks((prev) =>
      prev
        .map((b) => ({ ...b, top: b.top + delta }))
        .filter((b) => b.top >= 0 && b.top + b.h <= rows),
    );
    setExtraVoxels((prev) =>
      prev
        .map((v) => ({ ...v, y: v.y + delta }))
        .filter((v) => v.y >= 0 && v.y < rows),
    );
    setImageDecals((prev) =>
      prev
        .map((d) => ({ ...d, cy: d.cy + delta }))
        .filter((d) => d.cy >= 0 && d.cy < rows),
    );
    previousRowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    if (copyFromFloor > floors) setCopyFromFloor(floors);
  }, [floors, copyFromFloor]);

  useEffect(() => {
    const stopPaint = () => setIsPointerDown(false);
    window.addEventListener("mouseup", stopPaint);
    return () => window.removeEventListener("mouseup", stopPaint);
  }, []);

  function dispatchRotateKey(key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown") {
    if (cameraLocked) return;
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }

  function updateJoystickFromClient(clientX: number, clientY: number) {
    const base = joystickBaseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = 20;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius && dist > 0) {
      const s = maxRadius / dist;
      dx *= s;
      dy *= s;
    }
    setJoystickKnob({ x: dx, y: dy });
    joystickVectorRef.current = { x: dx / maxRadius, y: dy / maxRadius };
  }

  function startJoystick(clientX: number, clientY: number) {
    if (cameraLocked) return;
    setJoystickDragging(true);
    updateJoystickFromClient(clientX, clientY);
  }

  function stopJoystick() {
    setJoystickDragging(false);
    setJoystickKnob({ x: 0, y: 0 });
    joystickVectorRef.current = { x: 0, y: 0 };
    joystickPointerIdRef.current = null;
  }

  useEffect(() => {
    if (rotateIntervalRef.current !== null) {
      window.clearInterval(rotateIntervalRef.current);
      rotateIntervalRef.current = null;
    }
    if (!joystickDragging || cameraLocked) return;

    const tick = () => {
      const v = joystickVectorRef.current;
      const dead = 0.25;
      if (v.x <= -dead) dispatchRotateKey("ArrowLeft");
      if (v.x >= dead) dispatchRotateKey("ArrowRight");
      if (v.y <= -dead) dispatchRotateKey("ArrowUp");
      if (v.y >= dead) dispatchRotateKey("ArrowDown");
    };

    tick();
    rotateIntervalRef.current = window.setInterval(tick, 65);
    return () => {
      if (rotateIntervalRef.current !== null) {
        window.clearInterval(rotateIntervalRef.current);
        rotateIntervalRef.current = null;
      }
    };
  }, [joystickDragging, cameraLocked]);

  function captureSnapshot(): EditorSnapshot {
    return {
      blocks: blocksRef.current.map((b) => ({ ...b })),
      extraVoxels: extraVoxelsRef.current.map((v) => ({ ...v })),
      imageDecals: imageDecalsRef.current.map((d) => ({ ...d })),
      floors: floorsRef.current,
      roofColor: roofColorRef.current,
    };
  }

  function restoreSnapshot(snapshot: EditorSnapshot) {
    skipRowsReanchorRef.current = true;
    setFloors(snapshot.floors);
    setRoofColor(snapshot.roofColor);
    setBlocks(snapshot.blocks.map((b) => ({ ...b })));
    setExtraVoxels(snapshot.extraVoxels.map((v) => ({ ...v })));
    setImageDecals(snapshot.imageDecals.map((d) => ({ ...d })));
  }

  function pushUndoSnapshot() {
    const snapshot = captureSnapshot();
    setUndoStack((prev) => {
      const next = [...prev, snapshot];
      return next.length > 80 ? next.slice(next.length - 80) : next;
    });
    setRedoStack([]);
  }

  function undoAction() {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const current = captureSnapshot();
      setRedoStack((redoPrev) => {
        const next = [...redoPrev, current];
        return next.length > 80 ? next.slice(next.length - 80) : next;
      });
      restoreSnapshot(last);
      return prev.slice(0, -1);
    });
  }

  function redoAction() {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const current = captureSnapshot();
      setUndoStack((undoPrev) => {
        const next = [...undoPrev, current];
        return next.length > 80 ? next.slice(next.length - 80) : next;
      });
      restoreSnapshot(last);
      return prev.slice(0, -1);
    });
  }

  function applyPayload(source: SavedPayload | null) {
    if (!source || typeof source !== "object") return false;
    const payloadBlocks = Array.isArray(source.blocks) ? source.blocks : [];
    const payloadVoxels = Array.isArray(source.voxels) ? source.voxels : [];
    const payloadImageDecals = Array.isArray(source.image_decals) ? source.image_decals : [];
    if (payloadBlocks.length === 0 && payloadVoxels.length === 0 && payloadImageDecals.length === 0) return false;
    if (typeof source.roof_color === "string") setRoofColor(source.roof_color);

    const nextFloorsRaw = Number(
      source.grid?.floors ?? Math.ceil((Number(source.grid?.rows ?? 120) || 120) / FLOOR_UNITS),
    );
    const nextFloors = Number.isFinite(nextFloorsRaw)
      ? Math.max(1, Math.min(maxFloors, Math.floor(nextFloorsRaw)))
      : Math.min(12, maxFloors);

    const nextBlocks: Block[] = payloadBlocks
      .map((b, idx) => {
        const x = Number(b.x ?? 0);
        const top = Number(b.top ?? 0);
        const w = Number(b.widthUnits ?? 1);
        const h = Number(b.heightUnits ?? 1);
        const c = typeof b.color === "string" ? b.color : DEFAULT_COLOR;
        if (!Number.isFinite(x) || !Number.isFinite(top) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
        return {
          id: `load-${idx}-${x}-${top}`,
          x: Math.max(0, Math.min(COLS - 1, Math.floor(x))),
          top: Math.max(0, Math.floor(top)),
          w: Math.max(1, Math.floor(w)),
          h: Math.max(1, Math.floor(h)),
          color: c,
        } as Block;
      })
      .filter((b): b is Block => !!b);

    const baseVoxels = new Set(blocksToVoxels(nextBlocks).map((v) => voxelKey(v.x, v.y, v.z)));
    const nextExtraVoxels: Voxel[] = payloadVoxels
      .map((v) => {
        const x = Number(v.x ?? 0);
        const y = Number(v.y ?? 0);
        const z = Number(v.z ?? 0);
        const c = typeof v.color === "string" ? v.color : DEFAULT_COLOR;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), color: c } as Voxel;
      })
      .filter((v): v is Voxel => !!v && !baseVoxels.has(voxelKey(v.x, v.y, v.z)));
    const nextImageDecals: FacadeImageDecal[] = payloadImageDecals
      .map((d, idx) => {
        if (typeof d?.src !== "string") return null;
        const surface = d.surface;
        if (surface !== "front" && surface !== "back" && surface !== "left" && surface !== "right") return null;
        const cx = Number(d.cx ?? 0);
        const cy = Number(d.cy ?? 0);
        const cz = Number(d.cz ?? 0);
        const w = Number(d.w ?? 1);
        const h = Number(d.h ?? 1);
        const rotationQuarter = Number(d.rotation_quarter ?? 0);
        const mirror = Boolean(d.mirror ?? false);
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz) || !Number.isFinite(w) || !Number.isFinite(h)) {
          return null;
        }
        return {
          id: typeof d.id === "string" && d.id.length > 0 ? d.id : `img-${idx}-${Date.now()}`,
          src: d.src,
          surface,
          cx: Math.floor(cx),
          cy: Math.floor(cy),
          cz: Math.floor(cz),
          w: Math.max(1, Math.floor(w)),
          h: Math.max(1, Math.floor(h)),
          rotationQuarter: ((Math.floor(rotationQuarter) % 4) + 4) % 4,
          mirror,
        } as FacadeImageDecal;
      })
      .filter((d): d is FacadeImageDecal => !!d);

    const sourceRows = nextFloors * FLOOR_UNITS;
    const targetFloors = maxFloors;
    const targetRows = targetFloors * FLOOR_UNITS;
    const deltaRows = targetRows - sourceRows;
    const addedFloors = deltaRows > 0 ? Math.floor(deltaRows / FLOOR_UNITS) : 0;

    const shiftedBlocks = nextBlocks
      .map((b) => ({ ...b, top: b.top + deltaRows }))
      .filter((b) => b.top >= 0 && b.top + b.h <= targetRows);
    const shiftedExtraVoxels = nextExtraVoxels
      .map((v) => ({ ...v, y: v.y + deltaRows }))
      .filter((v) => v.y >= 0 && v.y < targetRows && v.x >= 0 && v.x < COLS && v.z >= 0 && v.z < depth3d);
    const shiftedImageDecals = nextImageDecals
      .map((d) => ({ ...d, cy: d.cy + deltaRows }))
      .filter((d) => d.cy >= 0 && d.cy < targetRows);

    // If account floor limit increased, clone the previous top floor into each new floor.
    const topFrontBlocks = nextBlocks.filter((b) => b.top >= 0 && b.top < FLOOR_UNITS);
    const topExtraVoxels = nextExtraVoxels.filter((v) => v.y >= 0 && v.y < FLOOR_UNITS);
    const grownBlocks: Block[] = [];
    const grownExtraVoxels: Voxel[] = [];
    if (addedFloors > 0) {
      for (let f = 0; f < addedFloors; f++) {
        const floorOffset = f * FLOOR_UNITS;
        for (const b of topFrontBlocks) {
          grownBlocks.push({
            ...b,
            id: `grow-${f}-${b.id}`,
            top: b.top + floorOffset,
          });
        }
        for (const v of topExtraVoxels) {
          grownExtraVoxels.push({
            ...v,
            y: v.y + floorOffset,
          });
        }
      }
    }

    skipRowsReanchorRef.current = true;
    setFloors(targetFloors);
    setBlocks([...grownBlocks, ...shiftedBlocks]);
    setExtraVoxels([...grownExtraVoxels, ...shiftedExtraVoxels]);
    setImageDecals(shiftedImageDecals);
    setUndoStack([]);
    setRedoStack([]);
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    const loadSaved = async () => {
      const localRaw = localStorage.getItem(EDITOR_BUILDING_STORAGE_KEY);
      let localLoaded = false;
      if (localRaw) {
        try {
          localLoaded = applyPayload(JSON.parse(localRaw) as SavedPayload);
        } catch {}
      }

      try {
        const res = await fetch("/api/building-editor", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (typeof data?.github_login === "string") setOwnerLogin(data.github_login);
        setTextToolUnlocked(Boolean(data?.features?.text_unlocked));
        setImageToolUnlocked(Boolean(data?.features?.image_unlocked));
        const preferred = (data?.draft ?? data?.published) as SavedPayload | undefined;
        if (preferred && applyPayload(preferred)) {
          setLoadedFromCloud(true);
          return;
        }
        if (!localLoaded) setLoadedFromCloud(false);
      } catch {
        if (!cancelled && !localLoaded) setLoadedFromCloud(false);
      }
    };
    void loadSaved();
    return () => {
      cancelled = true;
    };
  }, [maxFloors]);

  const selectedModel = useMemo(
    () => ALL_MODELS.find((m) => m.id === selectedModelId) ?? null,
    [selectedModelId],
  );
  const activeModel = useMemo(() => {
    const base = generatedTextModel ?? selectedModel;
    if (!base) return null;
    if (base.type !== "text") return base;
    let rotated = base;
    for (let i = 0; i < textRotationQuarter; i++) rotated = rotateModel90(rotated);
    return rotated;
  }, [generatedTextModel, selectedModel, textRotationQuarter]);

  function buildTextModel(text: string, sizePx: number, letterSpacingPx: number, fillColor: string): PaintModel | null {
    const value = text.trim();
    if (!value) return null;

    const safeSize = Math.max(1, Math.min(100, Math.floor(sizePx)));
    const safeLetterSpacing = Math.max(-2, Math.min(30, Math.floor(letterSpacingPx)));
    const supersample = 8;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.font = `500 ${safeSize}px Tahoma, Verdana, Arial, sans-serif`;
    const chars = Array.from(value);
    const charsWidth = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0);
    const spacingTotal = Math.max(0, chars.length - 1) * safeLetterSpacing;
    const textWidth = charsWidth + spacingTotal;
    const pad = Math.max(2, Math.ceil(safeSize * 0.25));
    const width = Math.max(1, Math.ceil(textWidth) + pad * 2); // model width in voxel units
    const height = Math.max(1, Math.ceil(safeSize * 1.15) + pad * 2); // model height in voxel units
    canvas.width = width * supersample;
    canvas.height = height * supersample;

    ctx.setTransform(supersample, 0, 0, supersample, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.font = `500 ${safeSize}px Tahoma, Verdana, Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let cursorX = pad;
    for (const ch of chars) {
      ctx.fillText(ch, cursorX, height / 2);
      cursorX += ctx.measureText(ch).width + safeLetterSpacing;
    }

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixels: ModelPixel[] = [];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let alphaSum = 0;
        for (let sy = 0; sy < supersample; sy++) {
          for (let sx = 0; sx < supersample; sx++) {
            const px = x * supersample + sx;
            const py = y * supersample + sy;
            alphaSum += data[(py * canvas.width + px) * 4 + 3];
          }
        }
        const alphaAvg = alphaSum / (supersample * supersample * 255);
        if (alphaAvg < 0.2) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        pixels.push({ x, y, color: fillColor });
      }
    }

    if (pixels.length === 0) return null;

    return {
      id: `text-${value}-${safeSize}-${safeLetterSpacing}-${fillColor.replace("#", "")}`,
      label: `Text ${value}`,
      type: "text",
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      pixels: pixels.map((p) => ({ x: p.x - minX, y: p.y - minY, color: p.color })),
    };
  }

  function generateTextPlacement() {
    setTextError("");
    setImagePlacementReady(false);
    if (!textToolUnlocked) {
      setGeneratedTextModel(null);
      setTextPlacementReady(false);
      setTextError("Text tool is locked. Buy once ($2) to use forever.");
      return;
    }
    const model = buildTextModel(textInput, textSizePx, textLetterSpacing, color);
    if (!model) {
      setGeneratedTextModel(null);
      setTextPlacementReady(false);
      setTextError("Type a text before pressing OK.");
      return;
    }
    setExpandedPanel(null);
    setSelectedModelId(null);
    setGeneratedTextModel(model);
    setTextPlacementReady(true);
  }

  useEffect(() => {
    if (!textPlacementReady) return;
    const model = buildTextModel(textInput, textSizePx, textLetterSpacing, color);
    if (!model) {
      setGeneratedTextModel(null);
      return;
    }
    setGeneratedTextModel(model);
  }, [textInput, textSizePx, textLetterSpacing, color, textPlacementReady]);

  function clampDecalCenter(index: number, size: number, max: number) {
    const left = Math.floor((size - 1) / 2);
    const right = Math.floor(size / 2);
    const min = left;
    const maxCenter = max - 1 - right;
    return Math.max(min, Math.min(maxCenter, index));
  }

  function buildImageDecalForTarget(
    target: HoverPaintTarget,
    src: string,
    wUnits: number,
    hUnits: number,
    id: string,
    rotationQuarter: number,
    mirror: boolean,
  ): FacadeImageDecal {
    const quarter = ((Math.floor(rotationQuarter) % 4) + 4) % 4;
    const baseW = Math.max(1, Math.floor(wUnits));
    const baseH = Math.max(1, Math.floor(hUnits));
    const rotatedW = quarter % 2 === 1 ? baseH : baseW;
    const rotatedH = quarter % 2 === 1 ? baseW : baseH;
    const w = Math.max(
      1,
      Math.min(target.surface === "left" || target.surface === "right" ? depth3d : COLS, rotatedW),
    );
    const h = Math.max(1, Math.min(rows, rotatedH));
    const cy = clampDecalCenter(target.y, h, rows);
    if (target.surface === "left" || target.surface === "right") {
      const cz = clampDecalCenter(target.z, w, depth3d);
      return {
        id,
        src,
        surface: target.surface,
        cx: target.x,
        cy,
        cz,
        w,
        h,
        rotationQuarter: quarter,
        mirror,
      };
    }
    const cx = clampDecalCenter(target.x, w, COLS);
    return {
      id,
      src,
      surface: target.surface,
      cx,
      cy,
      cz: target.z,
      w,
      h,
      rotationQuarter: quarter,
      mirror,
    };
  }

  const ghostImageDecal = useMemo(() => {
    if (!imagePlacementReady || !hoverTarget || !imageSrc || tool !== "draw") return null;
    return buildImageDecalForTarget(
      hoverTarget,
      imageSrc,
      imageWidthUnits,
      imageHeightUnits,
      "ghost-image",
      imageRotationQuarter,
      imageMirrorEnabled,
    );
  }, [
    imagePlacementReady,
    hoverTarget,
    imageSrc,
    imageWidthUnits,
    imageHeightUnits,
    imageRotationQuarter,
    imageMirrorEnabled,
    tool,
  ]);
  const ghostVoxels = useMemo(() => {
    if (!activeModel || !hoverTarget || tool !== "draw") return [];
    const top = Math.max(0, hoverTarget.y - activeModel.h + 1);
    const mirror =
      activeModel.type === "text" &&
      (shouldMirrorTextOnSurface(hoverTarget.surface) !== textMirrorEnabled);
    if (hoverTarget.surface === "left" || hoverTarget.surface === "right") {
      const zStart = Math.max(
        0,
        Math.min(depth3d - activeModel.w, hoverTarget.z - Math.floor(activeModel.w / 2)),
      );
      const xFixed = hoverTarget.surface === "left" ? 0 : COLS - 1;
      return activeModel.pixels
        .map((p) => ({
          x: xFixed,
          y: top + p.y,
          z: zStart + (mirror ? activeModel.w - 1 - p.x : p.x),
          color: p.color,
        }))
        .filter((v) => v.y >= 0 && v.y < rows && v.z >= 0 && v.z < depth3d);
    }
    const xStart = Math.max(0, Math.min(COLS - activeModel.w, hoverTarget.x - Math.floor(activeModel.w / 2)));
    const zFixed = hoverTarget.surface === "front" ? 0 : depth3d - 1;
    return activeModel.pixels
      .map((p) => ({
        x: xStart + (mirror ? activeModel.w - 1 - p.x : p.x),
        y: top + p.y,
        z: zFixed,
        color: p.color,
      }))
      .filter((v) => v.x >= 0 && v.x < COLS && v.y >= 0 && v.y < rows);
  }, [activeModel, hoverTarget, tool, depth3d, rows, textMirrorEnabled]);

  function modelPlacement(model: PaintModel, x: number, y: number) {
    const px = Math.max(0, Math.min(COLS - model.w, x - Math.floor(model.w / 2)));
    const top = Math.max(0, y - model.h + 1);
    return { x: px, top };
  }

  const voxels = useMemo(() => {
    const base = blocksToVoxels(blocks);
    const merged = new Map<string, Voxel>();
    for (const v of base) merged.set(voxelKey(v.x, v.y, v.z), v);
    for (const v of extraVoxels) merged.set(voxelKey(v.x, v.y, v.z), v);
    return Array.from(merged.values());
  }, [blocks, extraVoxels]);
  const previewVoxels = useMemo(
    () => addAutomaticRoof(voxels, roofColor, rows, COLS, depth3d),
    [voxels, roofColor, rows, depth3d],
  );

  function floorToRowStart(floorFromBottom: number) {
    return rows - floorFromBottom * FLOOR_UNITS;
  }

  function parseTargetFloors(value: string) {
    const values = value
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= floors);
    return Array.from(new Set(values));
  }

  function buildOccupiedSet(source: Block[]) {
    const set = new Set<string>();
    for (const b of source) {
      for (let y = b.top; y < b.top + b.h; y++) {
        for (let x = b.x; x < b.x + b.w; x++) {
          set.add(cellKey(x, y));
        }
      }
    }
    return set;
  }

  function applyWholeBlockAt(x: number, y: number) {
    const colStart = Math.floor((x * MAJOR_GRID_COLUMNS) / COLS);
    const xStart = Math.floor((colStart * COLS) / MAJOR_GRID_COLUMNS);
    const xEnd = Math.floor(((colStart + 1) * COLS) / MAJOR_GRID_COLUMNS) - 1;

    const floorBand = Math.floor(y / FLOOR_UNITS);
    const yStart = floorBand * FLOOR_UNITS;
    const yEnd = Math.min(rows - 1, yStart + FLOOR_UNITS - 1);

    if (tool === "erase") {
      setBlocks((prev) =>
        prev.filter((b) => !(b.x >= xStart && b.x <= xEnd && b.top >= yStart && b.top <= yEnd)),
      );
      return;
    }

    setBlocks((prev) => {
      let next = [...prev];
      const occupied = buildOccupiedSet(next);

      // Always overwrite existing color first.
      next = next.map((b) => {
        if (b.x >= xStart && b.x <= xEnd && b.top >= yStart && b.top <= yEnd) {
          if (b.color !== color) return { ...b, color };
        }
        return b;
      });

      const additions: Block[] = [];
      for (let yy = yEnd; yy >= yStart; yy--) {
        for (let xx = xStart; xx <= xEnd; xx++) {
          const k = cellKey(xx, yy);
          if (occupied.has(k)) continue;
          additions.push({
            id: `${Date.now()}-${xx}-${yy}-${Math.random().toString(36).slice(2, 6)}`,
            x: xx,
            top: yy,
            w: 1,
            h: 1,
            color,
          });
          occupied.add(k);
        }
      }

      if (additions.length > 0) next.push(...additions);
      return next;
    });
  }

  function applyWholeBlockAtDepth(x: number, y: number, z: number) {
    const colStart = Math.floor((x * MAJOR_GRID_COLUMNS) / COLS);
    const xStart = Math.floor((colStart * COLS) / MAJOR_GRID_COLUMNS);
    const xEnd = Math.floor(((colStart + 1) * COLS) / MAJOR_GRID_COLUMNS) - 1;
    const floorBand = Math.floor(y / FLOOR_UNITS);
    const yStart = floorBand * FLOOR_UNITS;
    const yEnd = Math.min(rows - 1, yStart + FLOOR_UNITS - 1);

    setExtraVoxels((prev) => {
      const within = (v: Voxel) => v.z === z && v.x >= xStart && v.x <= xEnd && v.y >= yStart && v.y <= yEnd;
      if (tool === "erase") return prev.filter((v) => !within(v));

      const next = [...prev];
      const indexByKey = new Map<string, number>();
      for (let i = 0; i < next.length; i++) indexByKey.set(voxelKey(next[i].x, next[i].y, next[i].z), i);

      for (let yy = yStart; yy <= yEnd; yy++) {
        for (let xx = xStart; xx <= xEnd; xx++) {
          const key = voxelKey(xx, yy, z);
          const idx = indexByKey.get(key);
          if (idx !== undefined) next[idx] = { ...next[idx], color };
          else next.push({ x: xx, y: yy, z, color });
        }
      }
      return next;
    });
  }

  function applyWholeSideBlockAtDepth(y: number, z: number, surface: "left" | "right") {
    const depthBand = Math.floor((z * MAJOR_GRID_COLUMNS) / depth3d);
    const zStart = Math.floor((depthBand * depth3d) / MAJOR_GRID_COLUMNS);
    const zEnd = Math.floor(((depthBand + 1) * depth3d) / MAJOR_GRID_COLUMNS) - 1;
    const floorBand = Math.floor(y / FLOOR_UNITS);
    const yStart = floorBand * FLOOR_UNITS;
    const yEnd = Math.min(rows - 1, yStart + FLOOR_UNITS - 1);
    const xFixed = surface === "left" ? 0 : COLS - 1;

    setExtraVoxels((prev) => {
      const within = (v: Voxel) => v.x === xFixed && v.z >= zStart && v.z <= zEnd && v.y >= yStart && v.y <= yEnd;
      if (tool === "erase") return prev.filter((v) => !within(v));

      const next = [...prev];
      const indexByKey = new Map<string, number>();
      for (let i = 0; i < next.length; i++) indexByKey.set(voxelKey(next[i].x, next[i].y, next[i].z), i);

      for (let yy = yStart; yy <= yEnd; yy++) {
        for (let zz = zStart; zz <= zEnd; zz++) {
          const key = voxelKey(xFixed, yy, zz);
          const idx = indexByKey.get(key);
          if (idx !== undefined) next[idx] = { ...next[idx], color };
          else next.push({ x: xFixed, y: yy, z: zz, color });
        }
      }
      return next;
    });
  }

  function paintModelAt(model: PaintModel, x: number, y: number, targetDepth = 0) {
    const place = modelPlacement(model, x, y);
    const cells = model.pixels.map((p) => ({
      x: place.x + p.x,
      y: place.top + p.y,
      color: p.color,
    }))
      .filter((c) => c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < rows);

    if (cells.length === 0) return;

    if (targetDepth === 0) {
      setBlocks((prev) => {
        const target = new Set(cells.map((c) => cellKey(c.x, c.y)));
        const kept = prev.filter((b) => !target.has(cellKey(b.x, b.top)));
        const added: Block[] = cells.map((c) => ({
          id: `${Date.now()}-${c.x}-${c.y}-${Math.random().toString(36).slice(2, 6)}`,
          x: c.x,
          top: c.y,
          w: 1,
          h: 1,
          color: c.color,
        }));
        return [...kept, ...added];
      });
      return;
    }

    setExtraVoxels((prev) => {
      const next = [...prev];
      const indexByKey = new Map<string, number>();
      for (let i = 0; i < next.length; i++) indexByKey.set(voxelKey(next[i].x, next[i].y, next[i].z), i);
      for (const c of cells) {
        const key = voxelKey(c.x, c.y, targetDepth);
        const idx = indexByKey.get(key);
        if (idx !== undefined) next[idx] = { ...next[idx], color: c.color };
        else next.push({ x: c.x, y: c.y, z: targetDepth, color: c.color });
      }
      return next;
    });
  }

  function paintCell(x: number, y: number) {
    setSaveMessage("");

    if (selectedModel && tool === "draw") {
      paintModelAt(selectedModel, x, y);
      return;
    }

    if (paintWholeBlock) {
      applyWholeBlockAt(x, y);
      return;
    }

    if (tool === "erase") {
      setBlocks((prev) => prev.filter((b) => !(b.x === x && b.top === y)));
      return;
    }

    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.x === x && b.top === y);
      if (idx >= 0) {
        // Always overwrite when painting an existing pixel.
        if (prev[idx].color === color) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], color };
        return next;
      }

      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          x,
          top: y,
          w: 1,
          h: 1,
          color,
        },
      ];
    });
  }

  function paintVoxel3D(x: number, y: number, z: number, surface: PaintSurface) {
    setSaveMessage("");
    const targetDepth = Math.max(0, Math.min(depth3d - 1, z));

    if (imagePlacementReady && tool === "draw" && imageSrc && imageToolUnlocked) {
      const decal = buildImageDecalForTarget(
        { x, y, z: targetDepth, surface },
        imageSrc,
        imageWidthUnits,
        imageHeightUnits,
        `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        imageRotationQuarter,
        imageMirrorEnabled,
      );
      setImageDecals((prev) => [...prev, decal]);
      return;
    }

    if (activeModel && tool === "draw") {
      if (activeModel.type === "text") {
        const top = Math.max(0, y - activeModel.h + 1);
        const mirror = shouldMirrorTextOnSurface(surface) !== textMirrorEnabled;

        if (surface === "left" || surface === "right") {
          const zStart = Math.max(0, Math.min(depth3d - activeModel.w, targetDepth - Math.floor(activeModel.w / 2)));
          const xFixed = surface === "left" ? 0 : COLS - 1;
          setExtraVoxels((prev) => {
            const next = [...prev];
            const indexByKey = new Map<string, number>();
            for (let i = 0; i < next.length; i++) indexByKey.set(voxelKey(next[i].x, next[i].y, next[i].z), i);
            for (const p of activeModel.pixels) {
              const vx = xFixed;
              const vy = top + p.y;
              const vz = zStart + (mirror ? activeModel.w - 1 - p.x : p.x);
              if (vy < 0 || vy >= rows || vz < 0 || vz >= depth3d) continue;
              const key = voxelKey(vx, vy, vz);
              const idx = indexByKey.get(key);
              if (idx !== undefined) next[idx] = { ...next[idx], color: p.color };
              else next.push({ x: vx, y: vy, z: vz, color: p.color });
            }
            return next;
          });
          return;
        }

        const xStart = Math.max(0, Math.min(COLS - activeModel.w, x - Math.floor(activeModel.w / 2)));
        const zFixed = surface === "front" ? 0 : depth3d - 1;
        setExtraVoxels((prev) => {
          const next = [...prev];
          const indexByKey = new Map<string, number>();
          for (let i = 0; i < next.length; i++) indexByKey.set(voxelKey(next[i].x, next[i].y, next[i].z), i);
          for (const p of activeModel.pixels) {
            const vx = xStart + (mirror ? activeModel.w - 1 - p.x : p.x);
            const vy = top + p.y;
            if (vx < 0 || vx >= COLS || vy < 0 || vy >= rows) continue;
            const key = voxelKey(vx, vy, zFixed);
            const idx = indexByKey.get(key);
            if (idx !== undefined) next[idx] = { ...next[idx], color: p.color };
            else next.push({ x: vx, y: vy, z: zFixed, color: p.color });
          }
          return next;
        });
        return;
      }

      if (surface === "left" || surface === "right") {
        const top = Math.max(0, y - activeModel.h + 1);
        const zStart = Math.max(0, Math.min(depth3d - activeModel.w, targetDepth - Math.floor(activeModel.w / 2)));
        const xFixed = surface === "left" ? 0 : COLS - 1;
        setExtraVoxels((prev) => {
          const next = [...prev];
          const indexByKey = new Map<string, number>();
          for (let i = 0; i < next.length; i++) indexByKey.set(voxelKey(next[i].x, next[i].y, next[i].z), i);
          for (const p of activeModel.pixels) {
            const vx = xFixed;
            const vy = top + p.y;
            const vz = zStart + p.x;
            if (vy < 0 || vy >= rows || vz < 0 || vz >= depth3d) continue;
            const key = voxelKey(vx, vy, vz);
            const idx = indexByKey.get(key);
            if (idx !== undefined) next[idx] = { ...next[idx], color: p.color };
            else next.push({ x: vx, y: vy, z: vz, color: p.color });
          }
          return next;
        });
        return;
      }
      paintModelAt(activeModel, x, y, targetDepth);
      return;
    }

    if (surface === "front" && targetDepth === 0) {
      if (paintWholeBlock) {
        applyWholeBlockAt(x, y);
        return;
      }
      paintCell(x, y);
      return;
    }

    if (paintWholeBlock) {
      if (surface === "left" || surface === "right") {
        applyWholeSideBlockAtDepth(y, targetDepth, surface);
        return;
      }
      applyWholeBlockAtDepth(x, y, targetDepth);
      return;
    }

    setExtraVoxels((prev) => {
      if (tool === "erase") {
        return prev.filter((v) => !(v.x === x && v.y === y && v.z === targetDepth));
      }

      const idx = prev.findIndex((v) => v.x === x && v.y === y && v.z === targetDepth);
      if (idx >= 0) {
        if (prev[idx].color === color) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], color };
        return next;
      }

      return [
        ...prev,
        {
          x,
          y,
          z: targetDepth,
          color,
        },
      ];
    });
  }

  function clearAll() {
    pushUndoSnapshot();
    setBlocks([]);
    setExtraVoxels([]);
    setImageDecals([]);
  }

  function isConnectedToBase(source: Block[]) {
    const occupied = buildOccupiedSet(source);
    if (occupied.size === 0) return true;

    const queue: string[] = [];
    const visited = new Set<string>();

    for (const key of occupied) {
      const y = Number(key.split(":")[1]);
      if (y === rows - 1) {
        queue.push(key);
        visited.add(key);
      }
    }

    if (queue.length === 0) return false;

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const [x, y] = cur.split(":").map(Number);
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= rows) continue;
        const nk = cellKey(nx, ny);
        if (!occupied.has(nk) || visited.has(nk)) continue;
        visited.add(nk);
        queue.push(nk);
      }
    }

    return visited.size === occupied.size;
  }

  async function saveBuilding(mode: "draft" | "publish") {
    if (!isConnectedToBase3D(voxels, rows)) {
      setSaveOk(false);
      setSaveMessage("There is at least one piece not connected to the building. Please fix it.");
      return;
    }

    setBusyAction(mode);
    const voxelsWithRoof = addAutomaticRoof(voxels, roofColor, rows, COLS, depth3d);

    const payload = {
      version: 1,
      grid: { cols: COLS, rows, floors, cellHeightFloor: 0.1 },
      footprint: { lotWidth: CITY_LOT_WIDTH, lotDepth: CITY_LOT_DEPTH },
      blocks: blocks.map((b) => ({
        x: b.x,
        top: b.top,
        widthUnits: b.w,
        heightUnits: b.h,
        heightFloor: Number((b.h * 0.1).toFixed(1)),
        color: b.color,
      })),
      roof_color: roofColor,
      voxels: voxelsWithRoof.map((v) => ({
        x: v.x,
        y: v.y,
        z: v.z,
        color: v.color,
      })),
      image_decals: imageDecals.map((d) => ({
        id: d.id,
        src: d.src,
        surface: d.surface,
        cx: d.cx,
        cy: d.cy,
        cz: d.cz,
        w: d.w,
        h: d.h,
        rotation_quarter: d.rotationQuarter,
        mirror: d.mirror,
      })),
    };
    try {
      const colorCount = new Map<string, number>();
      for (const v of payload.voxels) {
        colorCount.set(v.color, (colorCount.get(v.color) ?? 0) + 1);
      }
      const topColors = Array.from(colorCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      console.log("[Editor Save Debug]", {
        selectedColor: color,
        blocks: payload.blocks.length,
        voxels: payload.voxels.length,
        roofColor,
        topColors,
      });
      (window as unknown as Record<string, unknown>).__gcEditorSaveDebug = {
        selectedColor: color,
        blocks: payload.blocks.length,
        voxels: payload.voxels.length,
        roofColor,
        topColors,
        payload,
      };
    } catch {}
    localStorage.setItem(EDITOR_BUILDING_STORAGE_KEY, JSON.stringify(payload));
    try {
      const res = await fetch("/api/building-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, payload }),
      });
      if (res.ok) {
        setSaveOk(true);
        setLoadedFromCloud(true);
        setSaveMessage(
          mode === "publish"
            ? "Published successfully! Your building is now live in the city."
            : "Draft saved successfully.",
        );
      } else {
        const body = await res.json().catch(() => ({}));
        const msg = typeof body?.error === "string" ? body.error : "Failed to save to server.";
        setSaveOk(mode === "draft");
        setSaveMessage(
          mode === "publish"
            ? `Publish failed: ${msg}`
            : `Draft saved locally, but cloud sync failed: ${msg}`,
        );
      }
    } catch {
      setSaveOk(mode === "draft");
      setSaveMessage(
        mode === "publish"
          ? "Publish failed: network error."
          : "Draft saved locally, but cloud sync failed.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  function copyFloorPattern() {
    const targets = parseTargetFloors(copyToFloors).filter((f) => f !== copyFromFloor);
    if (targets.length === 0) return;
    pushUndoSnapshot();

    const fromStart = floorToRowStart(copyFromFloor);
    const fromEnd = fromStart + FLOOR_UNITS - 1;

    const sourceCells = new Map<string, string>();
    for (const b of blocks) {
      if (b.w !== 1 || b.h !== 1) continue;
      if (b.top >= fromStart && b.top <= fromEnd) {
        const localY = b.top - fromStart;
        sourceCells.set(`${b.x}:${localY}`, b.color);
      }
    }

    const sourceExtraCells = extraVoxels
      .filter((v) => v.y >= fromStart && v.y <= fromEnd)
      .map((v) => ({
        x: v.x,
        z: v.z,
        localY: v.y - fromStart,
        color: v.color,
      }));

    if (sourceCells.size === 0 && sourceExtraCells.length === 0) return;

    setBlocks((prev) => {
      let next = [...prev];

      for (const floor of targets) {
        const targetStart = floorToRowStart(floor);
        const targetEnd = targetStart + FLOOR_UNITS - 1;

        next = next.filter((b) => !(b.top >= targetStart && b.top <= targetEnd));

        const additions: Block[] = [];
        const occupied = buildOccupiedSet(next);
        const entries = Array.from(sourceCells.entries())
          .map(([k, cellColor]) => {
            const [sx, ly] = k.split(":").map(Number);
            return { sx, ly, cellColor };
          })
          .sort((a, b) => b.ly - a.ly); // bottom-up

        for (const { sx, ly, cellColor } of entries) {
          const ty = targetStart + ly;
          if (ty < targetStart || ty > targetEnd) continue;
          additions.push({
            id: `${Date.now()}-${floor}-${sx}-${ly}-${Math.random().toString(36).slice(2, 6)}`,
            x: sx,
            top: ty,
            w: 1,
            h: 1,
            color: cellColor,
          });
          occupied.add(cellKey(sx, ty));
        }
        next.push(...additions);
      }
      return next;
    });

    if (sourceExtraCells.length > 0) {
      setExtraVoxels((prev) => {
        let next = [...prev];
        for (const floor of targets) {
          const targetStart = floorToRowStart(floor);
          const targetEnd = targetStart + FLOOR_UNITS - 1;

          next = next.filter((v) => !(v.y >= targetStart && v.y <= targetEnd));

          const indexByKey = new Map<string, number>();
          for (let i = 0; i < next.length; i++) indexByKey.set(voxelKey(next[i].x, next[i].y, next[i].z), i);

          for (const c of sourceExtraCells) {
            const y = targetStart + c.localY;
            if (y < targetStart || y > targetEnd) continue;
            const key = voxelKey(c.x, y, c.z);
            const idx = indexByKey.get(key);
            if (idx !== undefined) next[idx] = { ...next[idx], color: c.color };
            else next.push({ x: c.x, y, z: c.z, color: c.color });
          }
        }
        return next;
      });
    }
  }

  function applyBuildingPreset(preset: BuildingPreset) {
    pushUndoSnapshot();
    setSaveMessage("");
    setGeneratedTextModel(null);
    setTextPlacementReady(false);
    setImagePlacementReady(false);
    setSelectedModelId(null);
    setExpandedPanel(null);
    setRoofColor(preset.roofColor);

    const doorModel = DOOR_MODELS.find((m) => m.id === preset.doorModelId) ?? DOOR_MODELS[0];
    const windowModel = WINDOW_MODELS.find((m) => m.id === preset.windowModelId) ?? WINDOW_MODELS[0];

    const frontBlocks = new Map<string, Block>();
    const extraMap = new Map<string, Voxel>();

    const addFront = (x: number, y: number, colorValue: string) => {
      if (x < 0 || x >= COLS || y < 0 || y >= rows) return;
      const key = `${x}:${y}`;
      frontBlocks.set(key, {
        id: `preset-${key}-${Math.random().toString(36).slice(2, 6)}`,
        x,
        top: y,
        w: 1,
        h: 1,
        color: colorValue,
      });
    };

    const addExtra = (x: number, y: number, z: number, colorValue: string) => {
      if (x < 0 || x >= COLS || y < 0 || y >= rows || z < 0 || z >= depth3d) return;
      const key = voxelKey(x, y, z);
      extraMap.set(key, { x, y, z, color: colorValue });
    };

    const stampModel = (
      model: PaintModel,
      surface: PaintSurface,
      center: number,
      top: number,
      useModelColors = true,
      fallbackColor = preset.wallAccent,
    ) => {
      if (surface === "front" || surface === "back") {
        const xStart = Math.max(0, Math.min(COLS - model.w, center - Math.floor(model.w / 2)));
        const zFixed = surface === "front" ? 0 : depth3d - 1;
        for (const p of model.pixels) {
          const x = xStart + p.x;
          const y = top + p.y;
          const c = useModelColors ? p.color : fallbackColor;
          if (surface === "front") addFront(x, y, c);
          else addExtra(x, y, zFixed, c);
        }
        return;
      }
      const zStart = Math.max(0, Math.min(depth3d - model.w, center - Math.floor(model.w / 2)));
      const xFixed = surface === "left" ? 0 : COLS - 1;
      for (const p of model.pixels) {
        const z = zStart + p.x;
        const y = top + p.y;
        const c = useModelColors ? p.color : fallbackColor;
        addExtra(xFixed, y, z, c);
      }
    };

    // Base shell on all four sides.
    for (let y = 0; y < rows; y++) {
      const floorBandFromTop = Math.floor(y / FLOOR_UNITS);
      const stripe = floorBandFromTop % preset.stripeEvery === 0;
      const wallColor = stripe ? preset.wallAccent : preset.wallMain;

      for (let x = 0; x < COLS; x++) {
        addFront(x, y, wallColor);
        addExtra(x, y, depth3d - 1, wallColor);
      }
      for (let z = 0; z < depth3d; z++) {
        addExtra(0, y, z, wallColor);
        addExtra(COLS - 1, y, z, wallColor);
      }
    }

    // Ground floor double door centered on front.
    const groundTop = floorToRowStart(1);
    const doorGap = 1;
    const doorHalfSpan = Math.floor(doorModel.w / 2);
    const center = Math.floor(COLS / 2);
    const leftCenter = center - doorHalfSpan - Math.floor(doorGap / 2);
    const rightCenter = center + doorHalfSpan + Math.ceil(doorGap / 2);
    stampModel(doorModel, "front", leftCenter, groundTop, true);
    stampModel(doorModel, "front", rightCenter, groundTop, true);

    // Replicate windows on floors 2..N.
    for (let floor = 2; floor <= floors; floor++) {
      const floorTop = floorToRowStart(floor);
      const windowTop = floorTop + 2;

      const frontStep = Math.max(windowModel.w + 3, 7);
      for (let cx = 4; cx < COLS - 2; cx += frontStep) {
        stampModel(windowModel, "front", cx, windowTop, true);
        stampModel(windowModel, "back", cx, windowTop, true);
      }

      const sideStep = Math.max(windowModel.w + 3, 7);
      for (let cz = 4; cz < depth3d - 2; cz += sideStep) {
        stampModel(windowModel, "left", cz, windowTop, true);
        stampModel(windowModel, "right", cz, windowTop, true);
      }
    }

    // Lobby accent strip on floor 1.
    const lobbyTop = floorToRowStart(1) + 1;
    for (let x = 0; x < COLS; x++) {
      addFront(x, lobbyTop, preset.wallAccent);
      addExtra(x, lobbyTop, depth3d - 1, preset.wallAccent);
    }
    for (let z = 0; z < depth3d; z++) {
      addExtra(0, lobbyTop, z, preset.wallAccent);
      addExtra(COLS - 1, lobbyTop, z, preset.wallAccent);
    }

    setBlocks(Array.from(frontBlocks.values()));
    setExtraVoxels(Array.from(extraMap.values()));
    setImageDecals([]);
    setShowPresetTool(false);
  }

  return (
    <main className="min-h-screen bg-bg p-5 text-warm">
      <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-4">
        <header className="border border-border bg-bg-card p-4">
          <h1 className="text-lg text-cream">Building Block Editor 3D</h1>
          <p className="mt-1 text-xs text-muted">
            Drag to orbit the camera. Use Travar to freeze the view while painting. Publishing turns this into your live city building skin.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
            <Link href="/" className="border border-border px-2 py-1 text-muted hover:text-cream">
              Back to city
            </Link>
            <Link href={shopHref} className="border border-border px-2 py-1 text-muted hover:text-cream">
              Open shop/loadout
            </Link>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <aside className="space-y-4 border border-border bg-bg-card p-4">
            <div>
              <p className="mb-2 text-xs text-muted">Tool</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setTool("draw")}
                  className={`border px-3 py-2 text-xs ${tool === "draw" ? "border-lime bg-lime text-black" : "border-border"}`}
                >
                  Draw
                </button>
                <button
                  onClick={() => setTool("erase")}
                  className={`border px-3 py-2 text-xs ${tool === "erase" ? "border-lime bg-lime text-black" : "border-border"}`}
                >
                  Erase
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs text-muted">Color</p>
              <div className="grid grid-cols-10 gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-5 w-5 border ${color === c ? "border-cream" : "border-border"}`}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted">
                Selected color: <span className="text-cream">{color}</span>
              </p>
            </div>

            <div className="space-y-2 border border-border p-3 text-xs">
              <p className="text-muted">Doors and windows</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setExpandedPanel((p) => (p === "door" ? null : "door"))}
                  className={`border px-2 py-1 ${expandedPanel === "door" ? "border-lime bg-lime text-black" : "border-border"}`}
                >
                  Doors
                </button>
                <button
                  onClick={() => setExpandedPanel((p) => (p === "window" ? null : "window"))}
                  className={`border px-2 py-1 ${expandedPanel === "window" ? "border-lime bg-lime text-black" : "border-border"}`}
                >
                  Windows
                </button>
                <button
                  onClick={() => {
                    setExpandedPanel(null);
                    setSelectedModelId(null);
                    setGeneratedTextModel(null);
                  }}
                  className={`border px-2 py-1 ${selectedModelId === null ? "border-lime bg-lime text-black" : "border-border"}`}
                >
                  None
                </button>
              </div>
              {expandedPanel === "door" && (
                <div className="grid max-h-36 grid-cols-2 gap-1 overflow-auto pr-1">
                  {DOOR_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModelId(m.id);
                        setGeneratedTextModel(null);
                      }}
                      className={`border px-2 py-1 text-left ${selectedModelId === m.id ? "border-lime bg-lime text-black" : "border-border"}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              {expandedPanel === "window" && (
                <div className="grid max-h-36 grid-cols-2 gap-1 overflow-auto pr-1">
                  {WINDOW_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModelId(m.id);
                        setGeneratedTextModel(null);
                      }}
                      className={`border px-2 py-1 text-left ${selectedModelId === m.id ? "border-lime bg-lime text-black" : "border-border"}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 border border-border p-3 text-xs">
              <p className="text-muted">Paint mode</p>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={paintWholeBlock}
                  onChange={(e) => setPaintWholeBlock(e.target.checked)}
                />
                Paint full major block
              </label>
              <p className="text-[10px] text-muted">
                Front, back, and side guides are all paintable at all times.
              </p>
              <p className="text-[10px] text-muted">
                All 4 transparent side guides are active. Click any side directly to paint it.
              </p>
            </div>

            <div className="space-y-2 border border-border p-3 text-xs">
              <p className="text-muted">Copy floor</p>
              <label className="flex items-center gap-2">
                <span>From:</span>
                <select
                  value={copyFromFloor}
                  onChange={(e) => setCopyFromFloor(Number(e.target.value))}
                  className="border border-lime bg-[#111117] px-2 py-1 text-lime focus:outline-none"
                  style={{
                    color: "#c8e64a",
                    borderColor: "#c8e64a",
                    backgroundColor: "#0f1116",
                    colorScheme: "dark",
                    boxShadow: "inset 0 0 0 9999px #0f1116",
                  }}
                >
                  {floorOptions.map((f) => (
                    <option key={f} value={f} style={{ color: "#c8e64a", backgroundColor: "#0f1116" }}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span>To (e.g. 2,3,10)</span>
                <input
                  value={copyToFloors}
                  onChange={(e) => setCopyToFloors(e.target.value)}
                  className="mt-1 w-full border border-border bg-[#111117] px-2 py-1"
                />
              </label>
              <button
                onClick={copyFloorPattern}
                className="border border-border px-3 py-2"
              >
                Copy floor
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void saveBuilding("publish")}
                disabled={busyAction !== null}
                className="border border-lime bg-lime px-3 py-2 text-xs text-black disabled:opacity-60"
              >
                {busyAction === "publish" ? "Publishing..." : "Publish to city"}
              </button>
              <button onClick={clearAll} className="border border-border px-3 py-2 text-xs">
                Clear
              </button>
            </div>
            <p className="text-[10px] text-muted">
              Max floors for this account: {maxFloors}. {loadedFromCloud ? "Cloud project loaded." : "Using local project data."}
            </p>
            <p className="text-[10px] text-muted">
              Publish updates your building in the city. Loadout/shop items still apply on top of this base model.
            </p>
            {saveMessage && (
              <div
                className={`border px-2 py-2 text-xs ${saveOk ? "border-green-500 text-green-300" : "border-red-500 text-red-300"}`}
              >
                {saveMessage}
              </div>
            )}
          </aside>

          <section className="border border-border bg-bg-card p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_190px]">
              <div className="flex flex-col gap-3">
                <div
                  className="relative overflow-hidden border border-border bg-[#121216]"
                >
                  <div className="pointer-events-none absolute right-3 top-3 z-10 border border-border bg-[#121216]/90 px-2 py-1 text-[10px] text-cream">
                    Rotate building with arrow keys
                  </div>
                  <button
                    onClick={() => setCameraLocked((prev) => !prev)}
                    className={`absolute left-3 top-3 z-10 border px-3 py-2 text-[10px] ${cameraLocked ? "border-lime bg-lime text-black" : "border-border bg-[#121216]/90 text-cream"}`}
                  >
                    {cameraLocked ? "UNLOCK IMAGE" : "LOCK IMAGE"}
                  </button>
                  <button
                    onClick={() => setLayFlat((prev) => !prev)}
                    className="absolute left-36 top-3 z-10 border border-border bg-[#121216]/90 px-3 py-2 text-[10px] text-cream hover:border-border-light"
                    title="Lay building flat"
                  >
                    ↻ {layFlat ? "UPRIGHT" : "LAY FLAT"}
                  </button>
                  <button
                    onClick={undoAction}
                    disabled={undoStack.length === 0}
                    className="absolute left-[290px] top-3 z-10 border border-border bg-[#121216]/90 px-3 py-2 text-[10px] text-cream hover:border-border-light disabled:opacity-45"
                    title="Undo last action"
                  >
                    UNDO
                  </button>
                  <button
                    onClick={redoAction}
                    disabled={redoStack.length === 0}
                    className="absolute left-[360px] top-3 z-10 border border-border bg-[#121216]/90 px-3 py-2 text-[10px] text-cream hover:border-border-light disabled:opacity-45"
                    title="Redo action"
                  >
                    REDO
                  </button>
                  <div
                    ref={joystickBaseRef}
                    className="absolute bottom-3 right-3 z-10 h-24 w-24 rounded-full border border-lime/70 bg-[#121216]/90 shadow-[inset_0_0_14px_rgba(200,230,74,0.25)]"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      joystickPointerIdRef.current = e.pointerId;
                      startJoystick(e.clientX, e.clientY);
                    }}
                    onPointerMove={(e) => {
                      if (!joystickDragging) return;
                      if (joystickPointerIdRef.current !== e.pointerId) return;
                      updateJoystickFromClient(e.clientX, e.clientY);
                    }}
                    onPointerUp={(e) => {
                      if (joystickPointerIdRef.current !== e.pointerId) return;
                      stopJoystick();
                    }}
                    onPointerCancel={(e) => {
                      if (joystickPointerIdRef.current !== e.pointerId) return;
                      stopJoystick();
                    }}
                  >
                    <div className="absolute inset-2 rounded-full border border-lime/35" />
                    <div
                      className="absolute h-9 w-9 rounded-full border border-lime bg-lime/35 shadow-[0_0_12px_rgba(200,230,74,0.45)]"
                      style={{
                        left: `calc(50% + ${joystickKnob.x}px)`,
                        top: `calc(50% + ${joystickKnob.y}px)`,
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                  </div>
                  <div className="h-[76vh] min-w-full p-2">
                    <VoxelEditor3D
                      voxels={previewVoxels}
                      ghostVoxels={ghostVoxels}
                      imageDecals={imageDecals}
                      ghostImageDecal={ghostImageDecal}
                      rows={rows}
                      cols={COLS}
                      depth={depth3d}
                      cameraLocked={cameraLocked}
                      layFlat={layFlat}
                      onPaintCell={paintVoxel3D}
                      onPaintStrokeStart={pushUndoSnapshot}
                      setHoverTarget={setHoverTarget}
                    />
                  </div>
                </div>
                <div className="border border-border bg-bg-raised p-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setShowRoofPalette((prev) => !prev)}
                      className="border border-border px-3 py-2 text-xs hover:border-border-light"
                    >
                      Change roof color
                    </button>
                    <button
                      onClick={() => {
                        setShowPresetTool((prev) => !prev);
                        setShowTextTool(false);
                        setShowImageTool(false);
                      }}
                      className="border border-border px-3 py-2 text-xs hover:border-border-light"
                    >
                      Building presets
                    </button>
                    <button
                      onClick={() => {
                        setShowTextTool((prev) => !prev);
                        setShowImageTool(false);
                        setShowPresetTool(false);
                      }}
                      className="border border-border px-3 py-2 text-xs hover:border-border-light"
                    >
                      {textToolUnlocked ? "Add text" : "Add text ($2)"}
                    </button>
                    <button
                      onClick={() => {
                        setShowImageTool((prev) => !prev);
                        setShowTextTool(false);
                        setShowPresetTool(false);
                      }}
                      className="border border-border px-3 py-2 text-xs hover:border-border-light"
                    >
                      {imageToolUnlocked ? "Add image" : "Add image ($5)"}
                    </button>
                  </div>
                  {showRoofPalette && (
                    <div className="mt-2 grid grid-cols-10 gap-1">
                      {COLORS.map((c) => (
                        <button
                          key={`roof-${c}`}
                          onClick={() => {
                            pushUndoSnapshot();
                            setRoofColor(c);
                          }}
                          className={`h-5 w-5 border ${roofColor === c ? "border-cream" : "border-border"}`}
                          style={{ background: c }}
                          aria-label={`Roof color ${c}`}
                        />
                      ))}
                    </div>
                  )}
                  {showPresetTool && (
                    <div className="mt-3 space-y-2 border border-border p-2 text-[10px]">
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Choose a modern preset</span>
                        <button
                          onClick={() => setShowPresetTool(false)}
                          className="border border-border px-2 py-1 text-[9px] hover:border-border-light"
                        >
                          CLOSE
                        </button>
                      </div>
                      <div className="grid gap-1">
                        {BUILDING_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => applyBuildingPreset(preset)}
                            className="border border-border px-3 py-2 text-left text-[10px] hover:border-lime"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-muted">
                        Applies full facade style with door on floor 1 and repeated windows from floor 2+.
                      </p>
                    </div>
                  )}
                  {showTextTool && (
                    <div className="mt-3 space-y-2 border border-border p-2 text-[10px]">
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Text writer</span>
                        <button
                          onClick={() => {
                            setShowTextTool(false);
                            setGeneratedTextModel(null);
                            setTextPlacementReady(false);
                            setTextRotationQuarter(0);
                            setTextMirrorEnabled(false);
                            setTool("draw");
                          }}
                          className="border border-border px-2 py-1 text-[9px] hover:border-border-light"
                        >
                          CLOSE
                        </button>
                      </div>
                      {!textToolUnlocked && (
                        <div className="space-y-2 border border-border bg-[#111117] p-2">
                          <p className="text-muted">Text tool is premium: $2 one-time. After payment, it is unlocked forever.</p>
                          <Link
                            href={shopHref}
                            className="inline-block border border-lime bg-lime px-3 py-1 text-[10px] text-black"
                          >
                            Unlock in shop
                          </Link>
                        </div>
                      )}
                      {textToolUnlocked && (
                        <>
                      <label className="block">
                        <span className="text-muted">Text</span>
                        <input
                          value={textInput}
                          onChange={(e) => setTextInput(e.target.value)}
                          className="mt-1 w-full border border-border bg-[#111117] px-2 py-1 text-cream"
                          placeholder="Type your text"
                        />
                      </label>
                      <label className="block">
                        <span className="text-muted">Size ({textSizePx}px)</span>
                        <input
                          type="range"
                          min={1}
                          max={100}
                          value={textSizePx}
                          onChange={(e) => setTextSizePx(Number(e.target.value))}
                          className="mt-1 w-full"
                        />
                      </label>
                      <label className="block">
                        <span className="text-muted">Letter spacing ({textLetterSpacing}px)</span>
                        <input
                          type="range"
                          min={-2}
                          max={30}
                          value={textLetterSpacing}
                          onChange={(e) => setTextLetterSpacing(Number(e.target.value))}
                          className="mt-1 w-full"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={generateTextPlacement}
                          className="border border-lime bg-lime px-3 py-1 text-[10px] text-black"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => setTextRotationQuarter((r) => (r + 1) % 4)}
                          className="border border-border px-3 py-1 text-[10px]"
                        >
                          Rotate 90°
                        </button>
                        <button
                          onClick={() => setTextMirrorEnabled((prev) => !prev)}
                          className={`border px-3 py-1 text-[10px] ${
                            textMirrorEnabled ? "border-lime bg-lime text-black" : "border-border"
                          }`}
                        >
                          Mirror text
                        </button>
                        <button
                          onClick={() => {
                            setGeneratedTextModel(null);
                            setTextPlacementReady(false);
                            setTextRotationQuarter(0);
                            setTextMirrorEnabled(false);
                          }}
                          className="border border-border px-3 py-1 text-[10px]"
                        >
                          Clear
                        </button>
                      </div>
                      {generatedTextModel && (
                        <p className="text-muted">
                          Text is ready ({textRotationQuarter * 90}deg, mirror {textMirrorEnabled ? "on" : "off"}). Move over the building to preview, then click to place.
                        </p>
                      )}
                      {textError && <p className="text-red-300">{textError}</p>}
                        </>
                      )}
                    </div>
                  )}
                  {showImageTool && (
                    <div className="mt-3 space-y-2 border border-border p-2 text-[10px]">
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Image facade</span>
                        <button
                          onClick={() => {
                            setShowImageTool(false);
                            setImagePlacementReady(false);
                            setImageError("");
                            setImageRotationQuarter(0);
                            setImageMirrorEnabled(false);
                            setTool("draw");
                          }}
                          className="border border-border px-2 py-1 text-[9px] hover:border-border-light"
                        >
                          CLOSE
                        </button>
                      </div>
                      {!imageToolUnlocked && (
                        <div className="space-y-2 border border-border bg-[#111117] p-2">
                          <p className="text-muted">Image tool is premium: $5 one-time. After payment, it is unlocked forever.</p>
                          <Link
                            href={shopHref}
                            className="inline-block border border-lime bg-lime px-3 py-1 text-[10px] text-black"
                          >
                            Unlock in shop
                          </Link>
                        </div>
                      )}
                      {imageToolUnlocked && (
                        <>
                      <label className="block">
                        <span className="text-muted">Image file</span>
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              const result = typeof reader.result === "string" ? reader.result : "";
                              setImageSrc(result);
                              setImageError("");
                            };
                            reader.readAsDataURL(file);
                          }}
                          className="mt-1 w-full border border-border bg-[#111117] px-2 py-1 text-cream file:border-0 file:bg-lime file:px-2 file:py-1 file:text-black"
                        />
                      </label>
                      <label className="block">
                        <span className="text-muted">Width ({imageWidthUnits})</span>
                        <input
                          type="range"
                          min={1}
                          max={COLS}
                          value={imageWidthUnits}
                          onChange={(e) => setImageWidthUnits(Number(e.target.value))}
                          className="mt-1 w-full"
                        />
                      </label>
                      <label className="block">
                        <span className="text-muted">Height ({imageHeightUnits})</span>
                        <input
                          type="range"
                          min={1}
                          max={rows}
                          value={imageHeightUnits}
                          onChange={(e) => setImageHeightUnits(Number(e.target.value))}
                          className="mt-1 w-full"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setImageRotationQuarter((r) => (r + 1) % 4)}
                          className="border border-border px-3 py-1 text-[10px]"
                        >
                          Rotate 90°
                        </button>
                        <button
                          onClick={() => setImageMirrorEnabled((v) => !v)}
                          className={`border px-3 py-1 text-[10px] ${
                            imageMirrorEnabled ? "border-lime bg-lime text-black" : "border-border"
                          }`}
                        >
                          Mirror image
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!imageToolUnlocked) {
                              setImagePlacementReady(false);
                              setImageError("Image tool is locked. Buy once ($5) to use forever.");
                              return;
                            }
                            if (!imageSrc) {
                              setImagePlacementReady(false);
                              setImageError("Select an image before pressing OK.");
                              return;
                            }
                            setTool("draw");
                            setGeneratedTextModel(null);
                            setTextPlacementReady(false);
                            setImagePlacementReady(true);
                            setImageError("");
                          }}
                          className="border border-lime bg-lime px-3 py-1 text-[10px] text-black"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => {
                            setImagePlacementReady(false);
                            setImageError("");
                            setImageRotationQuarter(0);
                            setImageMirrorEnabled(false);
                          }}
                          className="border border-border px-3 py-1 text-[10px]"
                        >
                          Stop placing
                        </button>
                      </div>
                      {imagePlacementReady && (
                        <p className="text-muted">
                          Image is ready ({imageRotationQuarter * 90}deg, mirror {imageMirrorEnabled ? "on" : "off"}). Move over facade to preview, then click to place.
                        </p>
                      )}
                      {imageError && <p className="text-red-300">{imageError}</p>}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <aside className="border border-border bg-bg-raised p-3">
                <p className="mb-2 text-xs text-muted">Building height</p>
                <p className="border border-border bg-[#111117] px-3 py-2 text-xs text-cream">
                  Your building has {floors} floor{floors > 1 ? "s" : ""}.
                </p>
              </aside>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
