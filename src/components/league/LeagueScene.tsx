"use client";

import "@/lib/silenceThreeClockWarning";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import dynamic from "next/dynamic";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import CityScene from "@/components/CityScene";
import { THEMES, ThemeLights, type CityTheme } from "@/components/city/theme";
import ThemeSkyFX from "@/components/ThemeSkyFX";
import { InstancedDecorations } from "@/components/city/decorations";
import type { CityBuilding, CityDecoration } from "@/lib/github";
import { LOT, lotToWorld, maxLot, minLot, rotToRadians, terrainBounds } from "@/lib/league-city/grid";
import type { CityObject } from "@/lib/league-city/types";
import LeagueToys from "./LeagueToys";
import LeagueRoads from "./LeagueRoads";
import LeagueTrees from "./LeagueTrees";
import EditCamera, { type EditCameraApi, type LotEvent, type Pickable } from "./editor/EditCamera";
import type { DriveWorldProps } from "./drive/DriveWorld";

// Drive mode (Rapier, the car, its sounds) loads only when someone drives.
const DriveWorld = dynamic(() => import("./drive/DriveWorld"), { ssr: false, loading: () => null });

/** Props that become physics bodies in drive mode (drawn by DriveWorld instead). */
const KNOCKABLE = new Set(["lamp", "bench", "fountain", "cone", "crates"]);

// Full-screen league city: one Canvas, midnight theme, the league's lots with
// roads, trees, decorations and member buildings (invited ones faded).

// Towns use Midnight with more light: brighter ambient and sky, a lighter
// ground and sidewalks, so the city reads at a glance. Same buildings and
// window colors as the main city.
const MIDNIGHT = THEMES[1];
const theme: CityTheme = {
  ...MIDNIGHT,
  fogColor: "#10203a",
  fogNear: 700,
  fogFar: 5000,
  ambientColor: "#6a88d0",
  ambientIntensity: 1.0,
  sunColor: "#a8c0f0",
  sunIntensity: 1.15,
  fillColor: "#5068b0",
  fillIntensity: 0.55,
  hemiSky: "#7aa0d0",
  hemiGround: "#34404e",
  hemiIntensity: 0.95,
  groundColor: "#2f3b50",
  grid1: "#465670",
  grid2: "#3a4860",
  roadMarkingColor: "#b8c4d4",
  sidewalkColor: "#646a7c",
};
// Keys the theme's lights and sky (a value of its own, apart from the main city's).
const THEME_INDEX = 11;
const EXPOSURE = 1.65;
/** The grass-less world around the terrain; the fog fades it into the horizon. */
const VOID_COLOR = "#0b1422";
/** Under 1 lowers the orbit camera so the horizon, sky and moon stay in view. */
const CAMERA_LIFT = 0.62;

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
        <meshBasicMaterial color={VOID_COLOR} />
      </mesh>
    </group>
  );
}

// ─── Plaza slabs (plaza and fountain lots) ───────────────────

const _m = new THREE.Matrix4();

function PlazaSlabs({ objects }: { objects: CityObject[] }) {
  const lots = useMemo(() => objects.filter((o) => o.item_type === "plaza" && o.px === null), [objects]);
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

function toDecorations(objects: CityObject[], driving: boolean): CityDecoration[] {
  const out: CityDecoration[] = [];
  for (const o of objects) {
    if (driving && o.item_type && KNOCKABLE.has(o.item_type)) continue;
    const [x, z] = o.px !== null && o.pz !== null ? [o.px, o.pz] : lotToWorld(o.x, o.z);
    const rotation = rotToRadians(o.rot);
    if (o.item_type === "lamp") out.push({ type: "streetLamp", position: [x, 0, z], rotation, variant: 0 });
    else if (o.item_type === "bench") out.push({ type: "bench", position: [x, 0, z], rotation, variant: 0 });
    else if (o.item_type === "fountain") out.push({ type: "fountain", position: [x, 0.6, z], rotation, variant: 0 });
  }
  return out;
}

// ─── Camera ──────────────────────────────────────────────────

function cameraFrame(size: number, aspect = 1.6, zoom = 1, tallest = 0) {
  const { cx, cz, width } = terrainBounds(size);
  // Portrait screens are narrow: back off so the terrain still fits across.
  // `tallest` (hero only) keeps the camera above and back from the towers.
  const dist = Math.max((width * 0.95 + 120) * Math.max(1, 1.3 / aspect) ** 0.55 * zoom, tallest * 1.9);
  return {
    target: new THREE.Vector3(cx, Math.max(30, tallest * 0.35), cz),
    position: new THREE.Vector3(cx - dist * 0.55, dist * 0.6 * CAMERA_LIFT, cz + dist * 0.65),
    max: width * 2.4 + 400,
  };
}

const _fromPos = new THREE.Vector3();
const _fromLook = new THREE.Vector3();

// Frames the terrain, and flies to a selected building like the home city
// (camera outside the building, looking at its top), then back on close.
function LeagueCamera({
  size,
  focus,
  spin = true,
  driving = false,
  zoom = 1,
  tallest = 0,
}: {
  size: number;
  focus: CityBuilding | null;
  spin?: boolean;
  /** The drive camera owns the view; on exit this eases back to the orbit. */
  driving?: boolean;
  /** Under 1 moves the orbit closer (Discover's hero crops the ground). */
  zoom?: number;
  tallest?: number;
}) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const frame = useMemo(() => cameraFrame(size, aspect, zoom, tallest), [size, aspect, zoom, tallest]);
  const controls = useRef<OrbitControlsImpl>(null);
  const [rotate, setRotate] = useState(true);
  const fly = useRef({ t: 1, toPos: new THREE.Vector3(), toLook: new THREE.Vector3() });
  const framed = useRef(false);

  // First frame: jump. Later (terrain grew, screen turned): fly.
  const flyTo = (pos: THREE.Vector3, look: THREE.Vector3) => {
    const c = controls.current;
    if (!c) return;
    if (!framed.current) {
      framed.current = true;
      camera.position.copy(pos);
      c.target.copy(look);
      c.update();
      return;
    }
    _fromPos.copy(camera.position);
    _fromLook.copy(c.target);
    fly.current.toPos.copy(pos);
    fly.current.toLook.copy(look);
    fly.current.t = 0;
  };

  useEffect(() => {
    if (!focus) {
      flyTo(frame.position, frame.target);
      setRotate(true);
      return;
    }
    setRotate(false);
    const mobile = window.innerWidth < 640;
    const dist = mobile ? 300 : 180;
    const camHeight = mobile ? 200 : 120;
    const lookDrop = mobile ? 60 : 0;
    const [bx, , bz] = focus.position;
    // Step outward from the terrain center, or along the current view when
    // the building sits at the center.
    let dx = bx - frame.target.x;
    let dz = bz - frame.target.z;
    let len = Math.hypot(dx, dz);
    if (len < 1) {
      dx = camera.position.x - bx;
      dz = camera.position.z - bz;
      len = Math.hypot(dx, dz) || 1;
    }
    flyTo(
      new THREE.Vector3(bx + (dx / len) * dist, focus.height + camHeight, bz + (dz / len) * dist),
      new THREE.Vector3(bx, Math.max(0, focus.height + 15 - lookDrop), bz),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, frame]);

  // Back from driving: look ahead from where the chase camera was, then fly home.
  const wasDriving = useRef(driving);
  useEffect(() => {
    const was = wasDriving.current;
    wasDriving.current = driving;
    const c = controls.current;
    if (driving) {
      fly.current.t = 1;
      setRotate(false);
      return;
    }
    if (!was || !c) return;
    c.target.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 60);
    flyTo(frame.position, frame.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driving]);

  useFrame((_, delta) => {
    const f = fly.current;
    const c = controls.current;
    if (driving || f.t >= 1 || !c) return;
    f.t = Math.min(1, f.t + delta * 0.9);
    const e = 1 - Math.pow(1 - f.t, 3); // ease-out cubic, as the home city
    camera.position.lerpVectors(_fromPos, f.toPos, e);
    c.target.lerpVectors(_fromLook, f.toLook, e);
    c.update();
  });

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
      enabled={!driving}
      enableDamping
      dampingFactor={0.08}
      minDistance={80}
      maxDistance={frame.max}
      maxPolarAngle={Math.PI * 0.44}
      autoRotate={spin && rotate && !hidden && !focus && !driving}
      autoRotateSpeed={0.35}
      onStart={() => {
        fly.current.t = 1;
        setRotate(false);
      }}
    />
  );
}

// Discover's hero: on wide screens the copy sits on the left, so the picture
// shifts right to keep the town clear of it.
function HeroFraming() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (width >= 1024) camera.setViewOffset(width, height, -width * 0.26, 0, width, height);
    else camera.clearViewOffset();
    return () => camera.clearViewOffset();
  }, [camera, width, height]);
  return null;
}

// ─── Scene ───────────────────────────────────────────────────

export type SceneMode = "view" | "edit" | "preview" | "drive";

export interface LeagueSceneProps {
  size: number;
  objects: CityObject[];
  buildings: CityBuilding[];
  focused?: string | null;
  onBuildingClick?: (b: CityBuilding) => void;
  /** view: orbit + auto-rotate. edit: build camera + lot picking. preview: orbit, still. */
  mode?: SceneMode;
  onLot?: (e: LotEvent) => void;
  editApiRef?: React.MutableRefObject<EditCameraApi | null>;
  /** Props the edit camera can pick on screen. */
  editPickables?: React.MutableRefObject<Pickable[]>;
  /** Editor overlays (grid, ghost, selection), rendered inside the Canvas. */
  children?: React.ReactNode;
  /** Drive mode: the car and its world. */
  drive?: Omit<DriveWorldProps, "objects" | "buildings" | "size">;
  /** Fill the parent box instead of the viewport, and ignore the pointer (Discover's hero). */
  embedded?: boolean;
}

export default function LeagueScene({
  size,
  objects,
  buildings,
  focused,
  onBuildingClick,
  mode = "view",
  onLot,
  editApiRef,
  editPickables,
  children,
  drive,
  embedded = false,
}: LeagueSceneProps) {
  const editing = mode === "edit";
  const driving = mode === "drive" && !!drive;
  const focusedBuilding = useMemo(
    () => (focused ? (buildings.find((b) => b.loginLower === focused.toLowerCase()) ?? null) : null),
    [buildings, focused],
  );
  const [lost, setLost] = useState(false);
  const decorations = useMemo(() => toDecorations(objects, driving), [objects, driving]);
  const tallest = useMemo(() => buildings.reduce((m, b) => Math.max(m, b.height), 0), [buildings]);
  const initial = useMemo(() => cameraFrame(size), [size]);
  const driveRef = useRef(drive);
  useEffect(() => {
    driveRef.current = drive;
  }, [drive]);

  if (lost) {
    return (
      <div className={`${embedded ? "absolute" : "fixed"} inset-0 flex flex-col items-center justify-center gap-4 bg-bg font-pixel uppercase`}>
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
      // One Canvas for every mode: remounting leaks WebGL contexts.
      frameloop={editing ? "demand" : "always"}
      dpr={[1, 1.5]}
      camera={{ position: initial.position.toArray(), fov: 50, near: 1, far: 12000 }}
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: EXPOSURE }}
      style={
        embedded
          ? { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }
          : { position: "fixed", inset: 0, width: "100vw", height: "100vh" }
      }
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          setLost(true);
          driveRef.current?.onFail();
        });
      }}
    >
      <fog attach="fog" args={[theme.fogColor, theme.fogNear * 2, theme.fogFar * 1.2]} />
      <ThemeLights theme={theme} themeIndex={THEME_INDEX} />
      {/* Moon and stars from the main city's Midnight sky (its index there is 0). */}
      <ThemeSkyFX themeIndex={0} theme={theme} lowSky />
      {embedded && <HeroFraming />}
      {editing ? (
        <EditCamera size={size} onLot={onLot ?? (() => {})} apiRef={editApiRef} pickables={editPickables} />
      ) : (
        <LeagueCamera
          size={size}
          focus={mode === "view" ? focusedBuilding : null}
          spin={mode === "view"}
          driving={driving}
          zoom={embedded ? 0.85 : 1}
          tallest={embedded ? tallest : 0}
        />
      )}

      <LeagueGround size={size} />
      <LeagueRoads objects={objects} markingColor={theme.roadMarkingColor} />
      <PlazaSlabs objects={objects} />
      <LeagueToys objects={objects} driving={driving} />
      <InstancedDecorations items={decorations} roadMarkingColor={theme.roadMarkingColor} sidewalkColor={theme.sidewalkColor} />
      <Suspense fallback={null}>
        <LeagueTrees objects={objects} />
      </Suspense>

      <CityScene
        buildings={buildings}
        colors={theme.building}
        accentColor={theme.building.accent}
        focusedBuilding={editing || driving ? null : (focused ?? null)}
        onBuildingClick={editing || driving ? undefined : onBuildingClick}
      />
      {driving && drive && <DriveWorld objects={objects} buildings={buildings} size={size} {...drive} />}
      {children}
    </Canvas>
  );
}
