"use client";

import { useEffect, useMemo } from "react";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import { LOT, lotToWorld, maxLot, minLot, rotToRadians } from "@/lib/league-city/grid";
import type { GhostFit } from "@/lib/league-city/editor/ghost";
import type { CityObject, ItemType } from "@/lib/league-city/types";
import { GhostRoads } from "../LeagueRoads";

// Build-mode overlays inside the Canvas: lot grid, hover highlight, the
// placement ghost (green fits, red with ✕ doesn't), the selection outline and
// NEW markers over newly placed buildings.

const OK = "#4ade80";
const BAD = "#ef4444";
const SELECT = "#c8e64a";

export interface GhostSpec {
  x: number;
  z: number;
  fit: GhostFit;
  /** What follows the cursor. */
  thing:
    | { kind: "item"; item: ItemType; rot: number }
    | { kind: "building"; building: CityBuilding; rot: number }
    | { kind: "road" }
    | { kind: "bulldoze" }
    | null;
}

function Grid({ size }: { size: number }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const lo = (minLot(size) - 0.5) * LOT;
    const hi = (maxLot(size) + 0.5) * LOT;
    for (let i = minLot(size); i <= maxLot(size) + 1; i++) {
      const v = (i - 0.5) * LOT;
      pts.push(v, 0.8, lo, v, 0.8, hi, lo, 0.8, v, hi, 0.8, v);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [size]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} renderOrder={4}>
      <lineBasicMaterial color={SELECT} transparent opacity={0.22} depthWrite={false} />
    </lineSegments>
  );
}

function LotTile({ x, z, color, opacity }: { x: number; z: number; color: string; opacity: number }) {
  const [wx, wz] = lotToWorld(x, z);
  return (
    <mesh position={[wx, 0.9, wz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
      <planeGeometry args={[LOT - 2, LOT - 2]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** The ✕ for lots that don't fit, so it reads without color. */
function Cross({ x, z, y = 16 }: { x: number; z: number; y?: number }) {
  const [wx, wz] = lotToWorld(x, z);
  return (
    <Billboard position={[wx, y, wz]} renderOrder={8}>
      {[Math.PI / 4, -Math.PI / 4].map((r) => (
        <mesh key={r} rotation={[0, 0, r]}>
          <planeGeometry args={[18, 3.5]} />
          <meshBasicMaterial color={BAD} depthTest={false} transparent />
        </mesh>
      ))}
    </Billboard>
  );
}

/** Rough stand-in shapes for items, tinted by fit. */
function ItemProxy({ item, color }: { item: ItemType; color: string }) {
  const mat = <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />;
  if (item === "lamp")
    return (
      <mesh position={[0, 9, 0]}>
        <cylinderGeometry args={[0.8, 1, 18, 6]} />
        {mat}
      </mesh>
    );
  if (item === "bench")
    return (
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[6, 2.4, 2]} />
        {mat}
      </mesh>
    );
  if (item === "fountain")
    return (
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[8, 8.5, 6, 16]} />
        {mat}
      </mesh>
    );
  if (item === "plaza" || item === "road")
    return (
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[LOT - 4, 1.2, LOT - 4]} />
        {mat}
      </mesh>
    );
  return (
    <mesh position={[0, 15, 0]}>
      <coneGeometry args={[9, 30, 7]} />
      {mat}
    </mesh>
  );
}

function Ghost({ ghost, objects }: { ghost: GhostSpec; objects: CityObject[] }) {
  const { x, z, fit, thing } = ghost;
  const [wx, wz] = lotToWorld(x, z);
  if (!thing) return null;
  if (thing.kind === "bulldoze") {
    // Red means "this goes"; a building can't, so it stays grey.
    return fit.ok ? (
      <group>
        <LotTile x={x} z={z} color={BAD} opacity={0.35} />
        <Cross x={x} z={z} y={22} />
      </group>
    ) : (
      <LotTile x={x} z={z} color="#9ca3af" opacity={0.18} />
    );
  }
  const color = fit.ok ? OK : BAD;
  return (
    <group>
      <LotTile x={x} z={z} color={color} opacity={0.22} />
      {thing.kind === "road" && fit.ok && <GhostRoads objects={objects} lots={[[x, z]]} ok />}
      {thing.kind === "item" && (
        <group position={[wx, 0, wz]} rotation={[0, rotToRadians(thing.rot), 0]}>
          <ItemProxy item={thing.item} color={color} />
        </group>
      )}
      {thing.kind === "building" && (
        <mesh position={[wx, thing.building.height / 2, wz]} rotation={[0, rotToRadians(thing.rot), 0]} renderOrder={7}>
          <boxGeometry args={[thing.building.width, thing.building.height, thing.building.depth]} />
          <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
      {!fit.ok && <Cross x={x} z={z} y={thing.kind === "building" ? Math.min(thing.building.height + 20, 120) : 18} />}
    </group>
  );
}

function makeNewTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = SELECT;
  ctx.fillRect(0, 4, 64, 24);
  ctx.fillStyle = "#0d0d0f";
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("NEW", 32, 17);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One Points object for every NEW marker (no DOM per building). */
function NewMarkers({ buildings }: { buildings: { x: number; z: number; top: number }[] }) {
  const tex = useMemo(() => makeNewTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(buildings.flatMap((b) => [b.x, b.top + 22, b.z]), 3));
    return g;
  }, [buildings]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (buildings.length === 0) return null;
  return (
    <points geometry={geo} renderOrder={9}>
      <pointsMaterial map={tex} size={40} sizeAttenuation transparent alphaTest={0.1} depthTest={false} />
    </points>
  );
}

export default function EditorOverlay({
  size,
  objects,
  buildingByDev,
  grid,
  hover,
  ghost,
  roadPath,
}: {
  size: number;
  objects: CityObject[];
  /** Laid-out buildings (for heights), keyed by developer id. */
  buildingByDev: ReadonlyMap<number, CityBuilding>;
  grid: boolean;
  hover: [number, number] | null;
  ghost: GhostSpec | null;
  roadPath: [number, number][] | null;
}) {
  const byDev = buildingByDev;

  const newOnes = useMemo(
    () =>
      objects
        .filter((o) => o.kind === "building" && o.is_new && o.developer_id !== null)
        .map((o) => {
          const [x, z] = lotToWorld(o.x, o.z);
          return { x, z, top: byDev.get(o.developer_id!)?.height ?? 40 };
        }),
    [objects, byDev],
  );

  return (
    <group>
      {grid && <Grid size={size} />}
      {hover && !ghost && !roadPath && <LotTile x={hover[0]} z={hover[1]} color="#ffffff" opacity={0.08} />}
      {roadPath && roadPath.length > 0 && <GhostRoads objects={objects} lots={roadPath} ok />}
      {ghost && !roadPath && <Ghost ghost={ghost} objects={objects} />}
      <NewMarkers buildings={newOnes} />
    </group>
  );
}
