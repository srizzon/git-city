"use client";

import "@/lib/silenceThreeClockWarning";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import CityScene from "@/components/CityScene";
import { THEMES, ThemeLights } from "@/components/city/theme";
import { InstancedDecorations } from "@/components/city/decorations";
import type { CityBuilding, CityDecoration } from "@/lib/github";
import { LOT, lotToWorld, maxLot, minLot, rotToRadians, terrainBounds } from "@/lib/league-city/grid";
import type { CityObject } from "@/lib/league-city/types";
import LeagueRoads from "./LeagueRoads";
import LeagueTrees from "./LeagueTrees";

// Full-screen league city: one Canvas, midnight theme, the league's lots with
// roads, trees, decorations and member buildings (invited ones faded).

const THEME_INDEX = 1; // Midnight
const theme = THEMES[THEME_INDEX];

// ─── Ground ──────────────────────────────────────────────────

function LeagueGround({ size }: { size: number }) {
  const { cx, cz, width } = terrainBounds(size);
  const lines = useMemo(() => {
    const pts: number[] = [];
    const lo = (minLot(size) - 0.5) * LOT;
    const hi = (maxLot(size) + 0.5) * LOT;
    for (let i = minLot(size); i <= maxLot(size) + 1; i++) {
      const v = (i - 0.5) * LOT;
      pts.push(v, 0.1, lo, v, 0.1, hi, lo, 0.1, v, hi, 0.1, v);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [size]);
  useEffect(() => () => lines.dispose(), [lines]);

  return (
    <group>
      {/* Terrain */}
      <mesh position={[cx, 0, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, width]} />
        <meshStandardMaterial color={theme.groundColor} emissive={theme.groundColor} emissiveIntensity={0.15} roughness={0.95} />
      </mesh>
      {/* Lot lines */}
      <lineSegments geometry={lines}>
        <lineBasicMaterial color={theme.grid1} transparent opacity={0.35} />
      </lineSegments>
      {/* Void around the terrain, lost in the fog */}
      <mesh position={[cx, -2, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width * 12, width * 12]} />
        <meshStandardMaterial color="#0c1018" roughness={1} />
      </mesh>
    </group>
  );
}

// ─── Plaza slabs (plaza and fountain lots) ───────────────────

const _m = new THREE.Matrix4();

function PlazaSlabs({ objects }: { objects: CityObject[] }) {
  const lots = useMemo(() => objects.filter((o) => o.item_type === "plaza" || o.item_type === "fountain"), [objects]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    lots.forEach((o, i) => {
      const [x, z] = lotToWorld(o.x, o.z);
      _m.makeTranslation(x, 0.3, z);
      ref.current?.setMatrixAt(i, _m);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [lots]);
  if (lots.length === 0) return null;
  return (
    <instancedMesh key={lots.length} ref={ref} args={[undefined, undefined, lots.length]}>
      <boxGeometry args={[LOT - 2, 0.6, LOT - 2]} />
      <meshStandardMaterial color={theme.sidewalkColor} emissive={theme.sidewalkColor} emissiveIntensity={0.2} roughness={0.85} />
    </instancedMesh>
  );
}

function toDecorations(objects: CityObject[]): CityDecoration[] {
  const out: CityDecoration[] = [];
  for (const o of objects) {
    const [x, z] = lotToWorld(o.x, o.z);
    const rotation = rotToRadians(o.rot);
    if (o.item_type === "lamp") out.push({ type: "streetLamp", position: [x, 0, z], rotation, variant: 0 });
    else if (o.item_type === "bench") out.push({ type: "bench", position: [x, 0, z], rotation, variant: 0 });
    else if (o.item_type === "fountain") out.push({ type: "fountain", position: [x, 0.6, z], rotation, variant: 0 });
  }
  return out;
}

// ─── Camera ──────────────────────────────────────────────────

function cameraFrame(size: number, aspect = 1.6) {
  const { cx, cz, width } = terrainBounds(size);
  // Portrait screens are narrow: back off so the terrain still fits across.
  const dist = (width * 0.95 + 120) * Math.max(1, 1.3 / aspect) ** 0.55;
  return {
    target: new THREE.Vector3(cx, 30, cz),
    position: new THREE.Vector3(cx - dist * 0.55, dist * 0.6, cz + dist * 0.65),
    min: Math.max(120, width * 0.2),
    max: width * 2.4 + 400,
  };
}

function LeagueCamera({ size }: { size: number }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const frame = useMemo(() => cameraFrame(size, aspect), [size, aspect]);
  const controls = useRef<OrbitControlsImpl>(null);
  const [rotate, setRotate] = useState(true);

  // Frame the terrain on mount and when it grows.
  useEffect(() => {
    camera.position.copy(frame.position);
    controls.current?.target.copy(frame.target);
    controls.current?.update();
  }, [camera, frame]);

  // Auto-rotate pauses while the tab is hidden and stops once the viewer
  // takes the camera.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={frame.target}
      enableDamping
      dampingFactor={0.08}
      minDistance={frame.min}
      maxDistance={frame.max}
      maxPolarAngle={Math.PI * 0.44}
      autoRotate={rotate && !hidden}
      autoRotateSpeed={0.35}
      onStart={() => setRotate(false)}
    />
  );
}

// ─── Scene ───────────────────────────────────────────────────

export interface LeagueSceneProps {
  size: number;
  objects: CityObject[];
  buildings: CityBuilding[];
  focused?: string | null;
  onBuildingClick?: (b: CityBuilding) => void;
}

export default function LeagueScene({ size, objects, buildings, focused, onBuildingClick }: LeagueSceneProps) {
  const [lost, setLost] = useState(false);
  const decorations = useMemo(() => toDecorations(objects), [objects]);
  const initial = useMemo(() => cameraFrame(size), [size]);

  if (lost) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-bg font-pixel uppercase">
        <p className="text-xs text-muted">The city stopped drawing.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-press border-2 border-lime px-4 py-2 text-[11px] text-lime"
        >
          Reload the city
        </button>
      </div>
    );
  }

  return (
    <Canvas
      shadows={false}
      frameloop="always"
      dpr={[1, 1.5]}
      camera={{ position: initial.position.toArray(), fov: 50, near: 1, far: 12000 }}
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.3 }}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          setLost(true);
        });
      }}
    >
      <fog attach="fog" args={[theme.fogColor, theme.fogNear * 2, theme.fogFar * 1.2]} />
      <ThemeLights theme={theme} themeIndex={THEME_INDEX} />
      <LeagueCamera size={size} />

      <LeagueGround size={size} />
      <LeagueRoads objects={objects} markingColor={theme.roadMarkingColor} />
      <PlazaSlabs objects={objects} />
      <InstancedDecorations items={decorations} roadMarkingColor={theme.roadMarkingColor} sidewalkColor={theme.sidewalkColor} />
      <Suspense fallback={null}>
        <LeagueTrees objects={objects} />
      </Suspense>

      <CityScene
        buildings={buildings}
        colors={theme.building}
        accentColor={theme.building.accent}
        focusedBuilding={focused ?? null}
        onBuildingClick={onBuildingClick}
      />
    </Canvas>
  );
}
