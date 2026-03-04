"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type Tool = "draw" | "erase";
type ModelType = "door" | "window";

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

// Match city lot footprint (src/lib/github.ts): LOT_W=38, LOT_D=32.
// Keeping editor width aligned to LOT_W helps prevent overlap on placement.
const COLS = 38;
const CITY_LOT_WIDTH = 38;
const CITY_LOT_DEPTH = 32;
const FLOOR_UNITS = 10;
const MAX_FLOORS = 50;
const MAJOR_GRID_COLUMNS = 4;
const AUTO_ROOF_COLORS = [
  "#111111", // preto
  "#6b4423", // marrom
  "#2f6b3c", // verde
  "#b78a1d", // amarelo
  "#6b3f9e", // roxo
  "#2a4f9e", // azul
];

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

function voxelKey(x: number, y: number, z: number) {
  return `${x}:${y}:${z}`;
}

function mapFacadeXToDepthZ(x: number, cols: number, depth: number) {
  if (cols <= 1 || depth <= 1) return 0;
  const t = x / (cols - 1);
  return Math.max(0, Math.min(depth - 1, Math.round(t * (depth - 1))));
}

function blocksToVoxels(source: Block[], depth: number, cols: number, copyAllSides: boolean): Voxel[] {
  const out = new Map<string, Voxel>();
  for (const b of source) {
    for (let y = b.top; y < b.top + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        if (copyAllSides) {
          const sideZ = mapFacadeXToDepthZ(x, cols, depth);
          out.set(voxelKey(x, y, 0), { x, y, z: 0, color: b.color }); // front
          out.set(voxelKey(x, y, depth - 1), { x, y, z: depth - 1, color: b.color }); // back
          out.set(voxelKey(0, y, sideZ), { x: 0, y, z: sideZ, color: b.color }); // left
          out.set(voxelKey(cols - 1, y, sideZ), { x: cols - 1, y, z: sideZ, color: b.color }); // right
        } else {
          out.set(voxelKey(x, y, 0), { x, y, z: 0, color: b.color });
        }
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

function addAutomaticRoof(source: Voxel[], roofColor: string): Voxel[] {
  if (source.length === 0) return source;

  const out = new Map<string, Voxel>();
  for (const v of source) out.set(voxelKey(v.x, v.y, v.z), v);

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

  const roofY = topY > 0 ? topY - 1 : topY;
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

function VoxelEditor3D({
  voxels,
  rows,
  cols,
  depth,
  onPaintCell,
  setHoverCell,
}: {
  voxels: Voxel[];
  rows: number;
  cols: number;
  depth: number;
  onPaintCell: (x: number, y: number) => void;
  setHoverCell: (cell: { x: number; y: number } | null) => void;
}) {
  const voxelList = useMemo(() => voxels, [voxels]);
  const groupedByColor = useMemo(() => {
    const map = new Map<string, Voxel[]>();
    for (const v of voxelList) {
      const c = typeof v.color === "string" ? v.color : "#7c8aa0";
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(v);
    }
    return Array.from(map.entries());
  }, [voxelList]);

  function frontPointToCell(point: THREE.Vector3) {
    const x = Math.floor(point.x + cols / 2);
    const y = Math.floor(rows - point.y);
    if (x < 0 || x >= cols || y < 0 || y >= rows) return null;
    return { x, y };
  }

  function handleFrontPaint(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    const localPoint = event.point.clone();
    const cell = frontPointToCell(localPoint);
    if (!cell) return;
    setHoverCell(cell);
    onPaintCell(cell.x, cell.y);
  }

  return (
    <Canvas camera={{ position: [28, 26, 28], fov: 48 }}>
      <color attach="background" args={["#101015"]} />
      <ambientLight intensity={0.7} />
      <directionalLight intensity={1.1} position={[20, 24, 14]} />
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
      <mesh
        position={[0, rows / 2, -depth / 2 + 1.05]}
        onPointerDown={handleFrontPaint}
        onPointerMove={(event) => {
          const localPoint = event.point.clone();
          const cell = frontPointToCell(localPoint);
          setHoverCell(cell);
          if ((event.buttons & 1) === 1) handleFrontPaint(event);
        }}
        onPointerLeave={() => setHoverCell(null)}
      >
        <planeGeometry args={[cols, rows]} />
        <meshBasicMaterial transparent opacity={0.06} color="#c8e64a" side={THREE.DoubleSide} />
      </mesh>
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}

export default function BuildingEditorPage() {
  const depth3d = CITY_LOT_DEPTH;
  const [tool, setTool] = useState<Tool>("draw");
  const [color, setColor] = useState(COLORS[0]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [copyAllSides, setCopyAllSides] = useState(false);
  const [floors, setFloors] = useState(12);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [paintWholeBlock, setPaintWholeBlock] = useState(false);
  const [copyFromFloor, setCopyFromFloor] = useState(1);
  const [copyToFloors, setCopyToFloors] = useState("");
  const [editDepth, setEditDepth] = useState(0);
  const [extraVoxels, setExtraVoxels] = useState<Voxel[]>([]);
  const [expandedPanel, setExpandedPanel] = useState<ModelType | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveOk, setSaveOk] = useState(false);

  const rows = floors * FLOOR_UNITS;
  const floorOptions = useMemo(
    () => Array.from({ length: MAX_FLOORS }, (_, i) => i + 1),
    [],
  );

  useEffect(() => {
    setBlocks((prev) => prev.filter((b) => b.top + b.h <= rows));
  }, [rows]);

  useEffect(() => {
    if (copyFromFloor > floors) setCopyFromFloor(floors);
  }, [floors, copyFromFloor]);

  useEffect(() => {
    const stopPaint = () => setIsPointerDown(false);
    window.addEventListener("mouseup", stopPaint);
    return () => window.removeEventListener("mouseup", stopPaint);
  }, []);

  const selectedModel = useMemo(
    () => ALL_MODELS.find((m) => m.id === selectedModelId) ?? null,
    [selectedModelId],
  );

  function modelPlacement(model: PaintModel, x: number, y: number) {
    const px = Math.max(0, Math.min(COLS - model.w, x - Math.floor(model.w / 2)));
    const top = Math.max(0, y - model.h + 1);
    return { x: px, top };
  }

  const voxels = useMemo(() => {
    const base = blocksToVoxels(blocks, depth3d, COLS, copyAllSides);
    const merged = new Map<string, Voxel>();
    for (const v of base) merged.set(voxelKey(v.x, v.y, v.z), v);
    for (const v of extraVoxels) merged.set(voxelKey(v.x, v.y, v.z), v);
    return Array.from(merged.values());
  }, [blocks, depth3d, copyAllSides, extraVoxels]);

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

  function paintModelAt(model: PaintModel, x: number, y: number, targetDepth = 0) {
    const place = modelPlacement(model, x, y);
    const cells = model.pixels.map((p) => ({
      x: place.x + p.x,
      y: place.top + p.y,
      color: p.color,
    }));

    if (targetDepth === 0 && !copyAllSides) {
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

  function paintCell3D(x: number, y: number) {
    setSaveMessage("");
    const targetDepth = Math.max(0, Math.min(depth3d - 1, editDepth));

    if (selectedModel && tool === "draw") {
      paintModelAt(selectedModel, x, y, targetDepth);
      return;
    }

    if (targetDepth === 0 && !copyAllSides) {
      if (paintWholeBlock) {
        applyWholeBlockAt(x, y);
        return;
      }
      paintCell(x, y);
      return;
    }

    if (paintWholeBlock) {
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
    setBlocks([]);
    setExtraVoxels([]);
    setCopyAllSides(false);
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

  function saveBuilding() {
    if (!isConnectedToBase3D(voxels, rows)) {
      setSaveOk(false);
      setSaveMessage("There is at least one piece not connected to the building. Please fix it.");
      return;
    }

    const roofColor = AUTO_ROOF_COLORS[Math.floor(Math.random() * AUTO_ROOF_COLORS.length)];
    const voxelsWithRoof = addAutomaticRoof(voxels, roofColor);

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
      copy_all_sides: copyAllSides,
      voxels: voxelsWithRoof.map((v) => ({
        x: v.x,
        y: v.y,
        z: v.z,
        color: v.color,
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
        copyAllSides,
        blocks: payload.blocks.length,
        voxels: payload.voxels.length,
        roofColor,
        topColors,
      });
      (window as unknown as Record<string, unknown>).__gcEditorSaveDebug = {
        selectedColor: color,
        copyAllSides,
        blocks: payload.blocks.length,
        voxels: payload.voxels.length,
        roofColor,
        topColors,
        payload,
      };
    } catch {}
    localStorage.setItem("gitcity_editor_building_v1", JSON.stringify(payload));
    setSaveOk(true);
    setSaveMessage("Building saved successfully! It is now applied in the local city.");
  }

  function copyFloorPattern() {
    const targets = parseTargetFloors(copyToFloors).filter((f) => f !== copyFromFloor);
    if (targets.length === 0) return;

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

    if (sourceCells.size === 0) return;

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
  }

  return (
    <main className="min-h-screen bg-bg p-5 text-warm">
      <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-4">
        <header className="border border-border bg-bg-card p-4">
          <h1 className="text-lg text-cream">Building Block Editor 3D</h1>
          <p className="mt-1 text-xs text-muted">
            Edit the front facade in 3D blocks, rotate the building, and copy it to all sides.
          </p>
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
              <p className="mb-2 text-xs text-muted">Cor</p>
              <div className="grid grid-cols-10 gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-5 w-5 border ${color === c ? "border-cream" : "border-border"}`}
                    style={{ background: c }}
                    aria-label={`Cor ${c}`}
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
                      onClick={() => setSelectedModelId(m.id)}
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
                      onClick={() => setSelectedModelId(m.id)}
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
              <button
                onClick={() => setCopyAllSides(true)}
                className={`border px-2 py-1 ${copyAllSides ? "border-lime bg-lime text-black" : "border-border"}`}
              >
                Copy to all sides
              </button>
              <button
                onClick={() => setCopyAllSides(false)}
                className={`border px-2 py-1 ${!copyAllSides ? "border-lime bg-lime text-black" : "border-border"}`}
              >
                Edit front facade only
              </button>
              <p className="text-[10px] text-muted">
                You can keep editing after copying to all sides.
              </p>
              <label className="mt-2 block text-[10px] text-muted">
                Z layer (3D depth editing)
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, depth3d - 1)}
                  value={editDepth}
                  onChange={(e) => setEditDepth(Number(e.target.value))}
                  className="mt-1 w-full"
                />
                <span className="text-cream">z = {editDepth}</span>
              </label>
            </div>

            <div className="space-y-2 border border-border p-3 text-xs">
              <p className="text-muted">Copy floor</p>
              <label className="flex items-center gap-2">
                <span>From:</span>
                <select
                  value={copyFromFloor}
                  onChange={(e) => setCopyFromFloor(Number(e.target.value))}
                  className="border border-border bg-[#111117] px-2 py-1"
                >
                  {floorOptions.map((f) => (
                    <option key={f} value={f}>
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

            <div className="flex gap-2">
              <button
                onClick={saveBuilding}
                className="border border-lime bg-lime px-3 py-2 text-xs text-black"
              >
                Save
              </button>
              <button onClick={clearAll} className="border border-border px-3 py-2 text-xs">
                Clear
              </button>
            </div>
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
              <div
                className="overflow-auto border border-border bg-[#121216]"
                style={{ maxHeight: "76vh" }}
              >
                <div className="h-[76vh] min-w-full p-2">
                  <VoxelEditor3D
                    voxels={voxels}
                    rows={rows}
                    cols={COLS}
                    depth={depth3d}
                    onPaintCell={paintCell3D}
                    setHoverCell={setHoverCell}
                  />
                </div>
              </div>

              <aside className="border border-border bg-bg-raised p-3">
                <p className="mb-2 text-xs text-muted">Height (floors)</p>
                <div className="max-h-[76vh] space-y-1 overflow-auto pr-1">
                  {floorOptions.map((f) => (
                    <button
                      key={f}
                      onClick={() => setFloors(f)}
                      className={`w-full border px-2 py-1 text-left text-xs ${floors === f ? "border-lime bg-lime text-black" : "border-border"}`}
                    >
                      {f} floor{f > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
