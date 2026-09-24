"use client";

import { useEffect, useMemo } from "react";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import { LOT, lotToWorld, maxLot, minLot, rotToRadians } from "@/lib/league-city/grid";
import type { GhostFit } from "@/lib/league-city/editor/ghost";
import type { CityObject, ItemType } from "@/lib/league-city/types";
import { propRadius } from "@/lib/league-city/props";
import { GhostRoads } from "../LeagueRoads";
import { bumpGeometry, rampGeometry } from "../LeagueToys";
import { RAMP, RAMP_BIG } from "@/lib/league-city/ramp";
import { BOOST_PAD, CONE, CRATE, TIRE_WALL_HEIGHT, TIRE_WALL_WIDTH, TIRE } from "@/lib/league-city/toys";

// Build-mode overlays inside the Canvas: lot grid, hover highlight, the
// placement ghost (green fits, red with ✕ doesn't), the selection outline and
// NEW markers over newly placed buildings.

const OK = "#4ade80";
const BAD = "#ef4444";
const SELECT = "#c8e64a";
const REPLACE = "#facc15";

export interface GhostSpec {
  x: number;
  z: number;
  fit: GhostFit;
  /** What follows the cursor. */
  thing:
    | { kind: "prop"; item: ItemType; rot: number }
    | { kind: "surface"; item: ItemType }
    | { kind: "building"; building: CityBuilding; rot: number }
    | { kind: "road" }
    | { kind: "bulldoze"; target: CityObject }
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
  if (item === "ramp" || item === "ramp_big") return <RampProxy color={color} big={item === "ramp_big"} />;
  if (item === "speed_bump") return <BumpProxy color={color} />;
  if (item === "boost_pad")
    return (
      <mesh position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOOST_PAD.width, BOOST_PAD.length]} />
        {mat}
      </mesh>
    );
  if (item === "cone")
    return (
      <mesh position={[0, CONE.height / 2, 0]}>
        <coneGeometry args={[CONE.radius, CONE.height, 10]} />
        {mat}
      </mesh>
    );
  if (item === "crates")
    return (
      <mesh position={[0, CRATE * 1.5, 0]}>
        <boxGeometry args={[CRATE * 3, CRATE * 3, CRATE]} />
        {mat}
      </mesh>
    );
  if (item === "tire_wall")
    return (
      <mesh position={[0, TIRE_WALL_HEIGHT / 2, 0]}>
        <boxGeometry args={[TIRE_WALL_WIDTH, TIRE_WALL_HEIGHT, TIRE.width]} />
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

function RampProxy({ color, big }: { color: string; big: boolean }) {
  const geo = useMemo(() => rampGeometry(big ? RAMP_BIG : RAMP), [big]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}

function BumpProxy({ color }: { color: string }) {
  const geo = useMemo(() => bumpGeometry(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}

/** Footprint ring for props, so their size reads before they land. */
function Ring({ wx, wz, r, color }: { wx: number; wz: number; r: number; color: string }) {
  return (
    <mesh position={[wx, 1, wz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
      <ringGeometry args={[Math.max(0.5, r - 1.2), r, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}

function Ghost({ ghost, objects }: { ghost: GhostSpec; objects: CityObject[] }) {
  const { x, z, fit, thing } = ghost;
  const [wx, wz] = lotToWorld(x, z);
  if (!thing) return null;

  if (thing.kind === "bulldoze") {
    // Red means "this goes"; a building can't, so it stays grey.
    const t = thing.target;
    if (t.px !== null && t.pz !== null) {
      return (
        <group>
          <Ring wx={t.px} wz={t.pz} r={propRadius(t.item_type) + 2} color={BAD} />
          <Billboard position={[t.px, 24, t.pz]} renderOrder={8}>
            {[Math.PI / 4, -Math.PI / 4].map((r) => (
              <mesh key={r} rotation={[0, 0, r]}>
                <planeGeometry args={[12, 2.6]} />
                <meshBasicMaterial color={BAD} depthTest={false} transparent />
              </mesh>
            ))}
          </Billboard>
        </group>
      );
    }
    return fit.ok ? (
      <group>
        <LotTile x={t.x} z={t.z} color={BAD} opacity={0.35} />
        <Cross x={t.x} z={t.z} y={22} />
      </group>
    ) : (
      <LotTile x={t.x} z={t.z} color="#9ca3af" opacity={0.18} />
    );
  }

  const color = fit.ok ? (fit.replaces ? REPLACE : OK) : BAD;

  if (thing.kind === "prop") {
    const px = fit.px ?? wx;
    const pz = fit.pz ?? wz;
    return (
      <group>
        <Ring wx={px} wz={pz} r={propRadius(thing.item)} color={color} />
        <group position={[px, 0, pz]} rotation={[0, rotToRadians(thing.rot), 0]}>
          <ItemProxy item={thing.item} color={color} />
        </group>
        {!fit.ok && (
          <Billboard position={[px, 26, pz]} renderOrder={8}>
            {[Math.PI / 4, -Math.PI / 4].map((r) => (
              <mesh key={r} rotation={[0, 0, r]}>
                <planeGeometry args={[12, 2.6]} />
                <meshBasicMaterial color={BAD} depthTest={false} transparent />
              </mesh>
            ))}
          </Billboard>
        )}
      </group>
    );
  }

  return (
    <group>
      <LotTile x={x} z={z} color={color} opacity={fit.ok && fit.replaces ? 0.32 : 0.22} />
      {thing.kind === "road" && fit.ok && <GhostRoads objects={objects} lots={[[x, z]]} ok />}
      {thing.kind === "surface" && (
        <group position={[wx, 0, wz]}>
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
  hovered,
  ghost,
  roadPath,
}: {
  size: number;
  objects: CityObject[];
  /** Laid-out buildings (for heights), keyed by developer id. */
  buildingByDev: ReadonlyMap<number, CityBuilding>;
  grid: boolean;
  hover: { x: number; z: number } | null;
  /** What's under the cursor with the hand tool: ringed if a prop, tiled if a lot object. */
  hovered?: CityObject;
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
      {hover && !ghost && !roadPath && hovered?.px != null && hovered.pz != null && (
        <Ring wx={hovered.px} wz={hovered.pz} r={propRadius(hovered.item_type) + 2} color="#ffffff" />
      )}
      {hover && !ghost && !roadPath && hovered?.px == null && <LotTile x={hover.x} z={hover.z} color="#ffffff" opacity={0.1} />}
      {roadPath && roadPath.length > 0 && <GhostRoads objects={objects} lots={roadPath} ok />}
      {ghost && !roadPath && <Ghost ghost={ghost} objects={objects} />}
      <NewMarkers buildings={newOnes} />
    </group>
  );
}
