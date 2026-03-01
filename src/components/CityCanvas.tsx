"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Stats, PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import CityScene from "./CityScene";
import type { FocusInfo } from "./CityScene";
import type { CityBuilding, CityPlaza, CityDecoration, CityRiver, CityBridge } from "@/lib/github";
import { seededRandom } from "@/lib/github";
import SkyAds from "./SkyAds";
import BuildingAds from "./BuildingAds";
import type { SkyAd } from "@/lib/skyAds";
import RaidSequence3D, { VehicleMesh } from "./RaidSequence3D";
import type { RaidPhase } from "@/lib/useRaidSequence";
import type { RaidExecuteResponse } from "@/lib/raid";
import FounderSpire from "./FounderSpire";
import WhiteRabbit from "./WhiteRabbit";
import CelebrationEffect from "./CelebrationEffect";

// ─── Theme Definitions ───────────────────────────────────────

export const THEME_NAMES = [
  "Midnight",
  "Sunset",
  "Neon",
  "Emerald",
] as const;

export interface BuildingColors {
  windowLit: string[];
  windowOff: string;
  face: string;
  roof: string;
  accent: string;
}

interface CityTheme {
  sky: [number, string][];
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientColor: string;
  ambientIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  fillColor: string;
  fillIntensity: number;
  fillPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  groundColor: string;
  grid1: string;
  grid2: string;
  roadMarkingColor: string;
  sidewalkColor: string;
  building: BuildingColors;
  waterColor: string;
  waterEmissive: string;
  dockColor: string;
}

const THEMES: CityTheme[] = [
  // 0 – Midnight
  {
    sky: [
      [0, "#000206"], [0.15, "#020814"], [0.30, "#061428"], [0.45, "#0c2040"],
      [0.55, "#102850"], [0.65, "#0c2040"], [0.80, "#061020"], [1, "#020608"],
    ],
    fogColor: "#0a1428", fogNear: 500, fogFar: 3500,
    ambientColor: "#4060b0", ambientIntensity: 0.55,
    sunColor: "#7090d0", sunIntensity: 0.75, sunPos: [300, 120, -200],
    fillColor: "#304080", fillIntensity: 0.3, fillPos: [-200, 60, 200],
    hemiSky: "#5080a0", hemiGround: "#202830", hemiIntensity: 0.5,
    groundColor: "#242c38", grid1: "#344050", grid2: "#2c3848",
    roadMarkingColor: "#8090a0",
    sidewalkColor: "#484c58",
    building: {
      windowLit: ["#a0c0f0", "#80a0e0", "#6080c8", "#c0d8f8", "#e0e8ff"],
      windowOff: "#0c0e18", face: "#101828", roof: "#2a3858",
      accent: "#6090e0",
    },
    waterColor: "#0a1830", waterEmissive: "#0a2050", dockColor: "#3a2818",
  },
  // 1 – Sunset
  {
    sky: [
      [0, "#0c0614"], [0.15, "#1c0e30"], [0.28, "#3a1850"], [0.38, "#6a3060"],
      [0.46, "#a05068"], [0.52, "#d07060"], [0.57, "#e89060"], [0.62, "#f0b070"],
      [0.68, "#f0c888"], [0.75, "#c08060"], [0.85, "#603030"], [1, "#180c10"],
    ],
    fogColor: "#80405a", fogNear: 500, fogFar: 3500,
    ambientColor: "#e0a080", ambientIntensity: 0.7,
    sunColor: "#f0b070", sunIntensity: 1.0, sunPos: [400, 120, -300],
    fillColor: "#6050a0", fillIntensity: 0.35, fillPos: [-200, 80, 200],
    hemiSky: "#d09080", hemiGround: "#4a2828", hemiIntensity: 0.55,
    groundColor: "#3a3038", grid1: "#504048", grid2: "#443838",
    roadMarkingColor: "#d0a840",
    sidewalkColor: "#585058",
    building: {
      windowLit: ["#f8d880", "#f0b860", "#e89840", "#d07830", "#f0c060"],
      windowOff: "#1a1018", face: "#281828", roof: "#604050",
      accent: "#c8e64a",
    },
    waterColor: "#1a2040", waterEmissive: "#102060", dockColor: "#4a3020",
  },
  // 2 – Neon
  {
    sky: [
      [0, "#06001a"], [0.15, "#100028"], [0.30, "#200440"], [0.42, "#380650"],
      [0.52, "#500860"], [0.60, "#380648"], [0.75, "#180230"], [0.90, "#0c0118"],
      [1, "#06000c"],
    ],
    fogColor: "#1a0830", fogNear: 500, fogFar: 3500,
    ambientColor: "#8040c0", ambientIntensity: 0.6,
    sunColor: "#c050e0", sunIntensity: 0.85, sunPos: [300, 100, -200],
    fillColor: "#00c0d0", fillIntensity: 0.4, fillPos: [-250, 60, 200],
    hemiSky: "#9040d0", hemiGround: "#201028", hemiIntensity: 0.5,
    groundColor: "#2c2038", grid1: "#3c2c50", grid2: "#342440",
    roadMarkingColor: "#c060e0",
    sidewalkColor: "#484058",
    building: {
      windowLit: ["#ff40c0", "#c040ff", "#00e0ff", "#40ff80", "#ff8040"],
      windowOff: "#0a0814", face: "#180830", roof: "#3c1858",
      accent: "#e040c0",
    },
    waterColor: "#0c0830", waterEmissive: "#1008a0", dockColor: "#2a1838",
  },
  // 3 – Emerald
  {
    sky: [
      [0, "#000804"], [0.15, "#001408"], [0.30, "#002810"], [0.42, "#003c1c"],
      [0.52, "#004828"], [0.60, "#003820"], [0.75, "#002014"], [0.90, "#001008"],
      [1, "#000604"],
    ],
    fogColor: "#0a2014", fogNear: 500, fogFar: 3500,
    ambientColor: "#40a060", ambientIntensity: 0.55,
    sunColor: "#70d090", sunIntensity: 0.75, sunPos: [300, 100, -250],
    fillColor: "#20a080", fillIntensity: 0.35, fillPos: [-200, 60, 200],
    hemiSky: "#50b068", hemiGround: "#183020", hemiIntensity: 0.5,
    groundColor: "#1e3020", grid1: "#2c4838", grid2: "#243828",
    roadMarkingColor: "#60c080",
    sidewalkColor: "#404848",
    building: {
      windowLit: ["#0e4429", "#006d32", "#26a641", "#39d353", "#c8e64a"],
      windowOff: "#060e08", face: "#0c1810", roof: "#1e4028",
      accent: "#f0c060",
    },
    waterColor: "#082018", waterEmissive: "#0a3020", dockColor: "#3a2818",
  },
];

// ─── Sky Dome ────────────────────────────────────────────────

function SkyDome({ stops }: { stops: [number, string][] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 512;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    for (const [stop, color] of stops) g.addColorStop(stop, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
  }, [stops]);

  // Keep sky dome centered on camera so it always surrounds the viewer
  useFrame(({ camera }) => {
    if (meshRef.current) {
      meshRef.current.position.copy(camera.position);
    }
  });

  useEffect(() => {
    return () => {
      mat.map?.dispose();
      mat.dispose();
    };
  }, [mat]);

  return (
    <mesh ref={meshRef} material={mat} renderOrder={-1}>
      <sphereGeometry args={[3500, 32, 48]} />
    </mesh>
  );
}

// ─── Paper Plane (GLB model) ─────────────────────────────────

function PlaneModel() {
  const { scene } = useGLTF("/models/paper-plane.glb");

  return (
    <group scale={[3, 3, 3]} rotation={[0, Math.PI / 2, 0]}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload("/models/paper-plane.glb");

// ─── Intro Flyover ──────────────────────────────────────────

const INTRO_DURATION = 14; // seconds

// Founder building sits at roughly (146, h, -66) in the first block.
// Camera target: founder building top.
const FOUNDER_X = 146;
const FOUNDER_Z = -66;
const TARGET_X = FOUNDER_X;
const TARGET_Z = FOUNDER_Z;
const TARGET_Y = 450;

// Arc sweep: camera arcs ~180° around the city
// Far left in fog -> descends through buildings -> rises to wide panorama centered on founder
const INTRO_WAYPOINTS: [number, number, number][] = [
  [-1600, 800, 1800],   // WP0: Far, high, left - city hidden in fog
  [-1000, 700, 1300],   // WP1: Descending, silhouette appears
  [-600,  600, 900],    // WP2: Ad plane level, buildings becoming clear
  [-200,  550, 650],    // WP3: Skirting the city edge
  [200,   600, 600],    // WP4: Crossing over
  [500,   700, 700],    // WP5: Rising, pulling back
  [700,   800, 900],    // WP6: Dramatic pullback
  [800,   850, 1000],   // WP7: Final orbit position (wide panorama)
];

// Look targets smoothly converge toward the founder building top
const INTRO_LOOK_TARGETS: [number, number, number][] = [
  [100,      300,      -200],      // WP0: Toward distant city, already high
  [TARGET_X, 380,      TARGET_Z],  // WP1: Rising toward founder top
  [TARGET_X, TARGET_Y, TARGET_Z],  // WP2: Locking on
  [TARGET_X, TARGET_Y, TARGET_Z],  // WP3: Holding
  [TARGET_X, TARGET_Y, TARGET_Z],  // WP4: Holding
  [TARGET_X, TARGET_Y, TARGET_Z],  // WP5: Holding
  [TARGET_X, TARGET_Y, TARGET_Z],  // WP6: Holding
  [TARGET_X, TARGET_Y, TARGET_Z],  // WP7: Final look target
];

// Smootherstep (Perlin): zero velocity AND zero acceleration at both ends
function introEase(t: number): number {
  const s = Math.max(0, Math.min(1, t));
  return s * s * s * (s * (s * 6 - 15) + 10);
}

// Pre-allocated temp vectors for IntroFlyover (avoid GC in useFrame)
const _introPos = new THREE.Vector3();
const _introLook = new THREE.Vector3();

function IntroFlyover({ onEnd }: { onEnd: () => void }) {
  const { camera } = useThree();
  const elapsed = useRef(0);
  const ended = useRef(false);

  // Build CatmullRom curves once; centripetal = no cusps on uneven spacing
  const { posCurve, lookCurve } = useMemo(() => {
    const posPoints = INTRO_WAYPOINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const lookPoints = INTRO_LOOK_TARGETS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const posCurve = new THREE.CatmullRomCurve3(posPoints, false, 'centripetal');
    const lookCurve = new THREE.CatmullRomCurve3(lookPoints, false, 'centripetal');
    // Pre-compute arc-length tables so getPointAt() doesn't stutter on first call
    posCurve.getLength();
    lookCurve.getLength();
    return { posCurve, lookCurve };
  }, []);

  useEffect(() => {
    camera.position.set(...INTRO_WAYPOINTS[0]);
    camera.lookAt(...INTRO_LOOK_TARGETS[0]);
  }, [camera]);

  useFrame((_, delta) => {
    if (ended.current) return;
    elapsed.current += delta;

    const rawT = Math.min(elapsed.current / INTRO_DURATION, 1);
    const t = introEase(rawT);

    // getPointAt = arc-length parameterized = visually constant speed
    posCurve.getPointAt(t, _introPos);
    lookCurve.getPointAt(t, _introLook);

    camera.position.copy(_introPos);
    camera.lookAt(_introLook);

    if (elapsed.current >= INTRO_DURATION && !ended.current) {
      ended.current = true;
      onEnd();
    }
  });

  return null;
}

// ─── Rabbit Quest Flyover ────────────────────────────────────

const RABBIT_FLYOVER_DURATION = 8; // seconds

// Pre-allocated temp vectors for RabbitFlyover (avoid GC in useFrame)
const _rabbitPos = new THREE.Vector3();
const _rabbitLook = new THREE.Vector3();

function buildRabbitCurves(plazaX: number, plazaZ: number) {
  // Camera path: orbital start -> descend through city -> pass near rabbit -> climb back to orbital
  const posPoints = [
    new THREE.Vector3(800, 700, 1000),               // WP0: Orbital start (seamless)
    new THREE.Vector3(500, 500, 700),                 // WP1: Descending
    new THREE.Vector3(plazaX + 300, 300, plazaZ + 300), // WP2: Approaching
    new THREE.Vector3(plazaX + 100, 80, plazaZ + 100),  // WP3: Close pass (high side)
    new THREE.Vector3(plazaX - 80, 60, plazaZ - 60),    // WP4: Closest point (low swoop)
    new THREE.Vector3(plazaX - 200, 150, plazaZ - 250),  // WP5: Pulling away
    new THREE.Vector3(200, 450, 400),                 // WP6: Climbing back
    new THREE.Vector3(800, 700, 1000),                // WP7: Orbital end (seamless)
  ];

  // Look targets converge on the plaza during the close pass, then drift to city center
  const lookPoints = [
    new THREE.Vector3(0, 200, 0),                       // WP0: City center
    new THREE.Vector3(plazaX, 50, plazaZ),              // WP1: Starting to aim at plaza
    new THREE.Vector3(plazaX, 10, plazaZ),              // WP2: Locked on plaza
    new THREE.Vector3(plazaX, 5, plazaZ),               // WP3: Locked on plaza (ground level)
    new THREE.Vector3(plazaX, 5, plazaZ),               // WP4: Holding on plaza
    new THREE.Vector3(plazaX, 30, plazaZ),              // WP5: Lifting gaze
    new THREE.Vector3(0, 150, 0),                       // WP6: Drifting to city center
    new THREE.Vector3(0, 200, 0),                       // WP7: City center (match orbital)
  ];

  const posCurve = new THREE.CatmullRomCurve3(posPoints, false, "centripetal");
  const lookCurve = new THREE.CatmullRomCurve3(lookPoints, false, "centripetal");
  posCurve.getLength();
  lookCurve.getLength();
  return { posCurve, lookCurve };
}

function RabbitFlyover({
  targetPlazaIndex,
  plazas,
  onEnd,
}: {
  targetPlazaIndex: number;
  plazas: CityPlaza[];
  onEnd: () => void;
}) {
  const { camera } = useThree();
  const elapsed = useRef(0);
  const ended = useRef(false);

  const plaza = plazas[targetPlazaIndex];
  const plazaX = plaza?.position[0] ?? 0;
  const plazaZ = plaza?.position[2] ?? 0;

  const { posCurve, lookCurve } = useMemo(
    () => buildRabbitCurves(plazaX, plazaZ),
    [plazaX, plazaZ]
  );

  useEffect(() => {
    camera.position.set(800, 700, 1000);
    camera.lookAt(0, 200, 0);
  }, [camera]);

  useFrame((_, delta) => {
    if (ended.current) return;
    elapsed.current += delta;

    const rawT = Math.min(elapsed.current / RABBIT_FLYOVER_DURATION, 1);
    const t = introEase(rawT);

    posCurve.getPointAt(t, _rabbitPos);
    lookCurve.getPointAt(t, _rabbitLook);

    camera.position.copy(_rabbitPos);
    camera.lookAt(_rabbitLook);

    if (elapsed.current >= RABBIT_FLYOVER_DURATION && !ended.current) {
      ended.current = true;
      onEnd();
    }
  });

  return null;
}

// ─── Camera Focus (controls OrbitControls target) ───────────

function CameraFocus({
  buildings,
  focusedBuilding,
  focusedBuildingB,
  controlsRef,
}: {
  buildings: CityBuilding[];
  focusedBuilding: string | null;
  focusedBuildingB?: string | null;
  controlsRef: React.RefObject<any>;
}) {
  const { camera } = useThree();
  const startPos = useRef(new THREE.Vector3());
  const startLook = useRef(new THREE.Vector3());
  const endPos = useRef(new THREE.Vector3());
  const endLook = useRef(new THREE.Vector3());
  const progress = useRef(1);
  const active = useRef(false);

  // Use ref for buildings to avoid re-triggering animation on array changes
  const buildingsRef = useRef(buildings);
  buildingsRef.current = buildings;

  useEffect(() => {
    if (!focusedBuilding) {
      // Re-enable auto-rotate when focus is cleared
      if (controlsRef.current) {
        controlsRef.current.autoRotate = true;
      }
      return;
    }

    const bA = buildingsRef.current.find(
      (b) => b.login.toLowerCase() === focusedBuilding.toLowerCase()
    );
    if (!bA) return;

    // Capture current camera state as start
    startPos.current.copy(camera.position);
    if (controlsRef.current) {
      startLook.current.copy(controlsRef.current.target);
    }

    // Dual focus: compute midpoint + separation-based backoff
    const bB = focusedBuildingB
      ? buildingsRef.current.find((b) => b.login.toLowerCase() === focusedBuildingB.toLowerCase())
      : null;

    if (bB) {
      const midX = (bA.position[0] + bB.position[0]) / 2;
      const midZ = (bA.position[2] + bB.position[2]) / 2;
      const midY = (bA.height + bB.height) / 2 + 15;
      const dx = bB.position[0] - bA.position[0];
      const dz = bB.position[2] - bA.position[2];
      const separation = Math.sqrt(dx * dx + dz * dz);

      // On mobile, compensate for the bottom sheet covering ~45vh
      const isMobile = window.innerWidth < 640;
      const backoff = isMobile
        ? Math.max(500, separation * 2.8)
        : Math.max(400, separation * 2.2);
      const lookYOffset = isMobile ? 35 : 0;

      // Camera perpendicular to the A->B line so buildings land on opposite screen sides
      // When buildings are very close, use a default direction instead of unstable perpendicular
      let perpX: number, perpZ: number;
      if (separation < 5) {
        perpX = 0.707;
        perpZ = 0.707;
      } else {
        perpX = -dz / separation;
        perpZ = dx / separation;
      }

      endLook.current.set(midX, midY + lookYOffset, midZ);
      endPos.current.set(
        midX + perpX * backoff,
        midY + lookYOffset + backoff * 0.45,
        midZ + perpZ * backoff
      );
    } else {
      // On mobile, shift lookAt target down so building appears above the bottom sheet,
      // and pull camera further back to show more of the building
      const isMobile = window.innerWidth < 640;
      const mobileOffset = isMobile ? 60 : 0;
      const dist = isMobile ? 250 : 80;
      const camHeight = isMobile ? 160 : 60;
      endPos.current.set(
        bA.position[0] + dist,
        bA.height + camHeight,
        bA.position[2] + dist
      );
      endLook.current.set(
        bA.position[0],
        Math.max(0, bA.height + 15 - mobileOffset),
        bA.position[2]
      );
    }

    progress.current = 0;
    active.current = true;

    if (controlsRef.current) {
      controlsRef.current.autoRotate = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedBuilding, focusedBuildingB, camera, controlsRef]);

  useFrame((_, delta) => {
    if (!active.current || progress.current >= 1) return;

    progress.current = Math.min(1, progress.current + delta * 0.7);
    // Ease-out cubic
    const t = 1 - Math.pow(1 - progress.current, 3);

    // Direct A→B interpolation
    camera.position.lerpVectors(startPos.current, endPos.current, t);

    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(startLook.current, endLook.current, t);
      controlsRef.current.update();
    }

    if (progress.current >= 1) {
      active.current = false;
    }
  });

  return null;
}

// ─── Mouse-Driven Flight ─────────────────────────────────────

const DEFAULT_FLY_SPEED = 55;
const MIN_FLY_SPEED = 30;
const MAX_FLY_SPEED = 200;
const MIN_ALT = 25;
const MAX_ALT = 900;
const TURN_RATE = 2.0;
const CLIMB_RATE = 55;
const MAX_BANK = 0.55;
const MAX_PITCH = 0.7;
const DEADZONE = 0.08;
const FREE_CAM_BASE_SPEED = 100;

function deadzoneCurve(v: number): number {
  const abs = Math.abs(v);
  if (abs < DEADZONE) return 0;
  const adjusted = (abs - DEADZONE) / (1 - DEADZONE);
  return Math.sign(v) * adjusted * adjusted;
}

// Pre-allocated temp vectors to avoid GC pressure in useFrame
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _idealCamPos = new THREE.Vector3();
const _idealLook = new THREE.Vector3();
const _blendedPos = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

function AirplaneFlight({ onExit, onHud, onPause, pauseSignal = 0, hasOverlay = false, vehicleType = "airplane" }: { onExit: () => void; onHud: (s: number, a: number, x: number, z: number, yaw: number) => void; onPause: (paused: boolean) => void; pauseSignal?: number; hasOverlay?: boolean; vehicleType?: string }) {
  const { camera } = useThree();
  const ref = useRef<THREE.Group>(null);
  const orbitRef = useRef<any>(null);

  const mouse = useRef({ x: 0, y: 0 });
  const keys = useRef<Record<string, boolean>>({});
  const [isPaused, setIsPaused] = useState(false);
  const paused = useRef(false);

  // Flight state
  const yaw = useRef(0);
  const pos = useRef(new THREE.Vector3(0, 120, 400));
  const flySpeed = useRef(DEFAULT_FLY_SPEED);
  const bank = useRef(0);
  const pitch = useRef(0);

  // Camera smoothing
  const camPos = useRef(new THREE.Vector3(0, 140, 450));
  const camLook = useRef(new THREE.Vector3(0, 120, 400));

  // Transition state
  const transitionProgress = useRef(1);
  const transitionFrom = useRef(new THREE.Vector3());
  const transitionTo = useRef(new THREE.Vector3());
  const transitionLookFrom = useRef(new THREE.Vector3());
  const transitionLookTo = useRef(new THREE.Vector3());
  const wasJustUnpaused = useRef(false);

  const hudTimer = useRef(0);
  const lastHudSpeed = useRef(-1);
  const lastHudAlt = useRef(-1);

  // Initialize flight from current camera position and direction
  useEffect(() => {
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);

    // Derive yaw from camera look direction (projected onto XZ plane)
    const initialYaw = Math.atan2(-camDir.x, -camDir.z);
    yaw.current = initialYaw;

    // Place airplane ahead of camera in the look direction
    const startPos = camera.position.clone();
    // Clamp altitude to flight range
    startPos.y = Math.max(MIN_ALT, Math.min(MAX_ALT, startPos.y));
    pos.current.copy(startPos);

    // Camera follow position: behind and above the airplane
    const behindOffset = new THREE.Vector3(
      Math.sin(initialYaw) * 50,
      20,
      Math.cos(initialYaw) * 50
    );
    camPos.current.copy(startPos).add(behindOffset);
    camLook.current.copy(startPos);

    camera.position.copy(camPos.current);
    camera.lookAt(camLook.current);
  }, [camera]);

  // Mouse tracking for flight steering
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!paused.current) {
        mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!paused.current) {
        flySpeed.current = Math.max(MIN_FLY_SPEED, Math.min(MAX_FLY_SPEED, flySpeed.current - e.deltaY * 0.05));
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  // External pause (triggered by parent, e.g. building click)
  const prevSignal = useRef(pauseSignal);
  useEffect(() => {
    if (pauseSignal !== prevSignal.current) {
      prevSignal.current = pauseSignal;
      if (!paused.current) {
        paused.current = true;
        setIsPaused(true);
        onPause(true);
      }
    }
  }, [pauseSignal, onPause]);

  // Keyboard
  const hasOverlayRef = useRef(hasOverlay);
  hasOverlayRef.current = hasOverlay;

  useEffect(() => {
    const doPause = () => {
      if (paused.current) return;
      paused.current = true;
      setIsPaused(true);
      onPause(true);
    };

    const doResume = () => {
      if (!paused.current) return;
      paused.current = false;
      setIsPaused(false);
      wasJustUnpaused.current = true;
      transitionProgress.current = 0;
      transitionFrom.current.copy(camera.position);
      transitionLookFrom.current.copy(camLook.current);
      onPause(false);
    };

    const FLIGHT_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);

    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === "Escape") {
        if (!paused.current) {
          // Flying → pause
          doPause();
        } else if (hasOverlayRef.current) {
          // Paused + overlay showing → let page.tsx close it
          return;
        } else {
          // Paused + no overlay → exit fly mode
          onExit();
        }
      } else if (e.code === "KeyP" || e.code === "Space") {
        e.preventDefault();
        if (paused.current) doResume();
        else doPause();
      } else if (paused.current && FLIGHT_KEYS.has(e.code)) {
        // Any flight key while paused → resume flying
        doResume();
      }
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [camera, onExit, onPause]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const k = keys.current;

    if (paused.current) {
      // ── PAUSED: OrbitControls handles camera ──
      if (ref.current) ref.current.visible = true;

      // Keep orbit target on the plane
      if (orbitRef.current) {
        orbitRef.current.target.copy(pos.current);
        orbitRef.current.update();
      }

      hudTimer.current += dt;
      if (hudTimer.current > 0.25) {
        hudTimer.current = 0;
        lastHudSpeed.current = 0;
        lastHudAlt.current = Math.round(pos.current.y);
        onHud(0, pos.current.y, pos.current.x, pos.current.z, yaw.current);
      }
      return;
    }

    // ── Unpause transition ──
    if (wasJustUnpaused.current) {
      if (ref.current) ref.current.visible = true;
      transitionProgress.current += dt * 2; // 0.5s transition
      if (transitionProgress.current >= 1) {
        transitionProgress.current = 1;
        wasJustUnpaused.current = false;
      }
    }

    // ── FLIGHT MODE ──
    const t = state.clock.elapsedTime;
    const mx = mouse.current.x;
    const my = mouse.current.y;

    let turnInput = deadzoneCurve(mx);
    if (k["KeyA"] || k["ArrowLeft"]) turnInput = -1;
    if (k["KeyD"] || k["ArrowRight"]) turnInput = 1;

    yaw.current -= turnInput * TURN_RATE * dt;

    let altInput = deadzoneCurve(my);
    if (k["KeyW"] || k["ArrowUp"]) altInput = 1;
    if (k["KeyS"] || k["ArrowDown"]) altInput = -1;

    // Shift = boost 2x, Alt = slow 0.3x
    let speedMult = 1;
    if (k["ShiftLeft"] || k["ShiftRight"]) speedMult = 2;
    if (k["AltLeft"] || k["AltRight"]) speedMult = 0.3;

    const actualSpeed = flySpeed.current * speedMult;

    // Climb scales gently with speed using sqrt so it stays proportional
    // without getting out of control at high speeds
    const climbScale = Math.sqrt(actualSpeed / DEFAULT_FLY_SPEED);
    pos.current.y += altInput * CLIMB_RATE * climbScale * dt;
    pos.current.y = Math.max(MIN_ALT, Math.min(MAX_ALT, pos.current.y));

    _fwd.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    pos.current.addScaledVector(_fwd, actualSpeed * dt);

    const targetBank = -turnInput * MAX_BANK;
    bank.current += (targetBank - bank.current) * 5 * dt;

    const targetPitch = altInput * MAX_PITCH;
    pitch.current += (targetPitch - pitch.current) * 6 * dt;

    if (ref.current) {
      ref.current.visible = true;
      ref.current.position.copy(pos.current);
      ref.current.rotation.set(pitch.current, yaw.current, bank.current, "YXZ");
    }

    const camDist = 35 + flySpeed.current * 0.2;
    _camOffset.set(0, 15, camDist).applyAxisAngle(_yAxis, yaw.current);
    _idealCamPos.copy(pos.current).add(_camOffset);

    _idealLook.copy(pos.current).addScaledVector(_fwd, 5).y += 2;

    const lerpXZ = 2.0 * dt;
    const lerpY = 1.8 * dt;
    camPos.current.x += (_idealCamPos.x - camPos.current.x) * lerpXZ;
    camPos.current.z += (_idealCamPos.z - camPos.current.z) * lerpXZ;
    camPos.current.y += (_idealCamPos.y - camPos.current.y) * lerpY;
    camLook.current.lerp(_idealLook, 4.0 * dt);

    // Apply transition blend if coming back from free-cam
    if (wasJustUnpaused.current && transitionProgress.current < 1) {
      const tEase = 1 - Math.pow(1 - transitionProgress.current, 3);
      _blendedPos.copy(transitionFrom.current).lerp(camPos.current, tEase);
      camera.position.copy(_blendedPos);
    } else {
      camera.position.copy(camPos.current);
    }
    camera.lookAt(camLook.current);

    hudTimer.current += dt;
    if (hudTimer.current > 0.25) {
      hudTimer.current = 0;
      lastHudSpeed.current = Math.round(flySpeed.current);
      lastHudAlt.current = Math.round(pos.current.y);
      onHud(flySpeed.current, pos.current.y, pos.current.x, pos.current.z, yaw.current);
    }
  });

  return (
    <>
      <group ref={ref}>
        <group scale={[4, 4, 4]}>
          <VehicleMesh type={vehicleType} />
        </group>
        <pointLight position={[0, -2, 0]} color="#f0c870" intensity={15} distance={60} />
        <pointLight position={[0, 3, -4]} color="#ffffff" intensity={5} distance={30} />
      </group>
      {isPaused && (
        <OrbitControls
          ref={orbitRef}
          enableDamping
          dampingFactor={0.06}
          minDistance={20}
          maxDistance={300}
          maxPolarAngle={Math.PI / 2.1}
          target={pos.current.toArray() as [number, number, number]}
        />
      )}
    </>
  );
}

// ─── Camera Reset (after exiting fly mode) ──────────────────

function CameraReset() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(400, 450, 600);
    camera.lookAt(0, 30, 0);
  }, [camera]);
  return null;
}

// ─── Ground ──────────────────────────────────────────────────

function Ground({ color, grid1, grid2 }: { color: string; grid1: string; grid2: string }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[20000, 20000]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} roughness={0.95} />
      </mesh>
      <gridHelper args={[4000, 200, grid1, grid2]} position={[0, -0.5, 0]} />
    </group>
  );
}

// ─── Tree ─────────────────────────────────────────────────────

function Tree3D({ position, variant }: { position: [number, number, number]; variant: number }) {
  const greens = ['#2d5a1e', '#1e6b2e', '#3a7a2a'];
  const trunkH = 8 + variant * 1.5;
  const canopyH = 10 + variant * 2;
  const canopyR = 6 + variant * 0.8;
  const gc = greens[variant % greens.length];
  return (
    <group position={position}>
      <mesh position={[0, trunkH / 2, 0]}>
        <cylinderGeometry args={[1, 1.3, trunkH, 6]} />
        <meshStandardMaterial color="#5a3a1e" emissive="#5a3a1e" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, trunkH + canopyH / 2 - 1, 0]}>
        <coneGeometry args={[canopyR, canopyH, 8]} />
        <meshStandardMaterial color={gc} emissive={gc} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

// ─── Street Lamp ──────────────────────────────────────────────

function StreetLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 9, 0]}>
        <cylinderGeometry args={[0.3, 0.45, 18, 6]} />
        <meshStandardMaterial color="#4a4a4a" emissive="#4a4a4a" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 18.5, 0]}>
        <boxGeometry args={[1.5, 0.8, 1.5]} />
        <meshStandardMaterial color="#f0d870" emissive="#f0d870" emissiveIntensity={2.0} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ─── Parked Car ───────────────────────────────────────────────

function ParkedCar({ position, rotation, variant }: { position: [number, number, number]; rotation: number; variant: number }) {
  const colors = ['#c03030', '#3050a0', '#d0d0d0', '#2a2a2a'];
  const color = colors[variant % colors.length];
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[8, 2.5, 3.5]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <boxGeometry args={[5, 2, 3.2]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

// ─── Park Bench ───────────────────────────────────────────────

function ParkBench({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[5, 0.3, 1.5]} />
        <meshStandardMaterial color="#6b4226" emissive="#6b4226" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 1.7, -0.65]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[5, 1.3, 0.2]} />
        <meshStandardMaterial color="#6b4226" emissive="#6b4226" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[-2, 0.45, 0]}>
        <boxGeometry args={[0.3, 0.9, 1.2]} />
        <meshStandardMaterial color="#3a3a3a" emissive="#3a3a3a" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[2, 0.45, 0]}>
        <boxGeometry args={[0.3, 0.9, 1.2]} />
        <meshStandardMaterial color="#3a3a3a" emissive="#3a3a3a" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

// ─── Fountain ─────────────────────────────────────────────────

function Fountain({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[8, 8.5, 2.4, 16]} />
        <meshStandardMaterial color="#707070" emissive="#707070" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 3.4, 0]}>
        <cylinderGeometry args={[5, 5.5, 2, 12]} />
        <meshStandardMaterial color="#808080" emissive="#808080" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 5.6, 0]}>
        <cylinderGeometry args={[2.5, 3.2, 2, 10]} />
        <meshStandardMaterial color="#909090" emissive="#909090" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 7.2, 0]}>
        <cylinderGeometry args={[1.8, 2, 1.2, 10]} />
        <meshStandardMaterial color="#4090d0" emissive="#2060a0" emissiveIntensity={2.0} toneMapped={false} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

// ─── Sidewalk ─────────────────────────────────────────────────

function Sidewalk({ position, size, color }: { position: [number, number, number]; size: [number, number]; color?: string }) {
  const c = color ?? "#585860";
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.2} roughness={0.85} />
    </mesh>
  );
}

// ─── Decoration Renderer ──────────────────────────────────────

function Decorations({ items }: { items: CityDecoration[] }) {
  return (
    <>
      {items.map((d, i) => {
        switch (d.type) {
          case 'tree': return <Tree3D key={`tree-${i}`} position={d.position} variant={d.variant} />;
          case 'streetLamp': return <StreetLamp key={`lamp-${i}`} position={d.position} />;
          case 'car': return <ParkedCar key={`car-${i}`} position={d.position} rotation={d.rotation} variant={d.variant} />;
          case 'bench': return <ParkBench key={`bench-${i}`} position={d.position} rotation={d.rotation} />;
          case 'fountain': return <Fountain key={`fountain-${i}`} position={d.position} />;
          case 'sidewalk': return <Sidewalk key={`walk-${i}`} position={d.position} size={d.size!} />;
          default: return null;
        }
      })}
    </>
  );
}

// ─── Instanced Decorations (single draw call per type) ───────

const _dMatrix = new THREE.Matrix4();
const _dPos = new THREE.Vector3();
const _dQuat = new THREE.Quaternion();
const _dScale = new THREE.Vector3();
const _dEuler = new THREE.Euler();

function InstancedDecorations({ items, roadMarkingColor, sidewalkColor }: { items: CityDecoration[]; roadMarkingColor: string; sidewalkColor: string }) {
  const trees = useMemo(() => items.filter(d => d.type === 'tree'), [items]);
  const lamps = useMemo(() => items.filter(d => d.type === 'streetLamp'), [items]);
  const cars = useMemo(() => items.filter(d => d.type === 'car'), [items]);
  const roadMarkings = useMemo(() => items.filter(d => d.type === 'roadMarking'), [items]);

  const treeTrunkRef = useRef<THREE.InstancedMesh>(null);
  const treeCanopyRef = useRef<THREE.InstancedMesh>(null);
  const lampPoleRef = useRef<THREE.InstancedMesh>(null);
  const lampLightRef = useRef<THREE.InstancedMesh>(null);
  const carBodyRef = useRef<THREE.InstancedMesh>(null);
  const carCabinRef = useRef<THREE.InstancedMesh>(null);
  const roadMarkingRef = useRef<THREE.InstancedMesh>(null);

  // Shared geometries
  const geos = useMemo(() => ({
    treeTrunk: new THREE.CylinderGeometry(1, 1.3, 1, 6),
    treeCanopy: new THREE.ConeGeometry(1, 1, 8),
    lampPole: new THREE.CylinderGeometry(0.3, 0.45, 18, 6),
    lampLight: new THREE.BoxGeometry(1.5, 0.8, 1.5),
    carBody: new THREE.BoxGeometry(8, 2.5, 3.5),
    carCabin: new THREE.BoxGeometry(5, 2, 3.2),
    roadMarking: new THREE.PlaneGeometry(1, 1),
  }), []);

  // Shared materials
  const mats = useMemo(() => ({
    treeTrunk: new THREE.MeshStandardMaterial({ color: "#5a3a1e", emissive: "#5a3a1e", emissiveIntensity: 0.35 }),
    treeCanopy: new THREE.MeshStandardMaterial({ color: "#2d5a1e", emissive: "#2d5a1e", emissiveIntensity: 0.45 }),
    lampPole: new THREE.MeshStandardMaterial({ color: "#4a4a4a", emissive: "#4a4a4a", emissiveIntensity: 0.3 }),
    lampLight: new THREE.MeshStandardMaterial({
      color: "#f0d870", emissive: "#f0d870", emissiveIntensity: 2.0, toneMapped: false,
    }),
    carBody: new THREE.MeshStandardMaterial({ color: "#808080", emissive: "#808080", emissiveIntensity: 0.2 }),
    carCabin: new THREE.MeshStandardMaterial({ color: "#808080", emissive: "#808080", emissiveIntensity: 0.2 }),
    roadMarking: new THREE.MeshStandardMaterial({
      color: roadMarkingColor, emissive: roadMarkingColor, emissiveIntensity: 0.8,
    }),
  }), [roadMarkingColor]);

  // Set up tree instances
  useEffect(() => {
    if (!treeTrunkRef.current || !treeCanopyRef.current || trees.length === 0) return;
    const greens = [new THREE.Color('#2d5a1e'), new THREE.Color('#1e6b2e'), new THREE.Color('#3a7a2a')];

    for (let i = 0; i < trees.length; i++) {
      const d = trees[i];
      const trunkH = 8 + d.variant * 1.5;
      const canopyH = 10 + d.variant * 2;
      const canopyR = 6 + d.variant * 0.8;

      _dQuat.identity();
      _dPos.set(d.position[0], d.position[1] + trunkH / 2, d.position[2]);
      _dScale.set(1, trunkH, 1);
      _dMatrix.compose(_dPos, _dQuat, _dScale);
      treeTrunkRef.current.setMatrixAt(i, _dMatrix);

      _dPos.set(d.position[0], d.position[1] + trunkH + canopyH / 2 - 1, d.position[2]);
      _dScale.set(canopyR, canopyH, canopyR);
      _dMatrix.compose(_dPos, _dQuat, _dScale);
      treeCanopyRef.current.setMatrixAt(i, _dMatrix);
      treeCanopyRef.current.setColorAt(i, greens[d.variant % greens.length]);
    }

    treeTrunkRef.current.instanceMatrix.needsUpdate = true;
    treeCanopyRef.current.instanceMatrix.needsUpdate = true;
    if (treeCanopyRef.current.instanceColor) treeCanopyRef.current.instanceColor.needsUpdate = true;
  }, [trees]);

  // Set up lamp instances
  useEffect(() => {
    if (!lampPoleRef.current || !lampLightRef.current || lamps.length === 0) return;
    _dQuat.identity();
    _dScale.set(1, 1, 1);

    for (let i = 0; i < lamps.length; i++) {
      const d = lamps[i];
      _dPos.set(d.position[0], d.position[1] + 9, d.position[2]);
      _dMatrix.compose(_dPos, _dQuat, _dScale);
      lampPoleRef.current.setMatrixAt(i, _dMatrix);

      _dPos.set(d.position[0], d.position[1] + 18.5, d.position[2]);
      _dMatrix.compose(_dPos, _dQuat, _dScale);
      lampLightRef.current.setMatrixAt(i, _dMatrix);
    }

    lampPoleRef.current.instanceMatrix.needsUpdate = true;
    lampLightRef.current.instanceMatrix.needsUpdate = true;
  }, [lamps]);

  // Set up car instances
  useEffect(() => {
    if (!carBodyRef.current || !carCabinRef.current || cars.length === 0) return;
    const carColors = [
      new THREE.Color('#c03030'), new THREE.Color('#3050a0'),
      new THREE.Color('#d0d0d0'), new THREE.Color('#2a2a2a'),
    ];

    for (let i = 0; i < cars.length; i++) {
      const d = cars[i];
      _dEuler.set(0, d.rotation, 0);
      _dQuat.setFromEuler(_dEuler);
      _dScale.set(1, 1, 1);

      _dPos.set(d.position[0], d.position[1] + 1.25, d.position[2]);
      _dMatrix.compose(_dPos, _dQuat, _dScale);
      carBodyRef.current.setMatrixAt(i, _dMatrix);
      carBodyRef.current.setColorAt(i, carColors[d.variant % carColors.length]);

      _dPos.set(d.position[0], d.position[1] + 3.1, d.position[2]);
      _dMatrix.compose(_dPos, _dQuat, _dScale);
      carCabinRef.current.setMatrixAt(i, _dMatrix);
      carCabinRef.current.setColorAt(i, carColors[d.variant % carColors.length]);
    }

    carBodyRef.current.instanceMatrix.needsUpdate = true;
    carCabinRef.current.instanceMatrix.needsUpdate = true;
    if (carBodyRef.current.instanceColor) carBodyRef.current.instanceColor.needsUpdate = true;
    if (carCabinRef.current.instanceColor) carCabinRef.current.instanceColor.needsUpdate = true;
  }, [cars]);

  // Set up road marking instances
  useEffect(() => {
    if (!roadMarkingRef.current || roadMarkings.length === 0) return;

    for (let i = 0; i < roadMarkings.length; i++) {
      const d = roadMarkings[i];
      const w = d.size?.[0] ?? 2;
      const h = d.size?.[1] ?? 6;

      _dEuler.set(-Math.PI / 2, d.rotation, 0);
      _dQuat.setFromEuler(_dEuler);
      _dPos.set(d.position[0], d.position[1], d.position[2]);
      _dScale.set(w, h, 1);
      _dMatrix.compose(_dPos, _dQuat, _dScale);
      roadMarkingRef.current.setMatrixAt(i, _dMatrix);
    }

    roadMarkingRef.current.instanceMatrix.needsUpdate = true;
  }, [roadMarkings]);

  // Dispose
  useEffect(() => {
    return () => {
      Object.values(geos).forEach(g => g.dispose());
      Object.values(mats).forEach(m => m.dispose());
    };
  }, [geos, mats]);

  return (
    <>
      {trees.length > 0 && (
        <>
          <instancedMesh ref={treeTrunkRef} args={[geos.treeTrunk, mats.treeTrunk, trees.length]} />
          <instancedMesh ref={treeCanopyRef} args={[geos.treeCanopy, mats.treeCanopy, trees.length]} />
        </>
      )}
      {lamps.length > 0 && (
        <>
          <instancedMesh ref={lampPoleRef} args={[geos.lampPole, mats.lampPole, lamps.length]} />
          <instancedMesh ref={lampLightRef} args={[geos.lampLight, mats.lampLight, lamps.length]} />
        </>
      )}
      {cars.length > 0 && (
        <>
          <instancedMesh ref={carBodyRef} args={[geos.carBody, mats.carBody, cars.length]} />
          <instancedMesh ref={carCabinRef} args={[geos.carCabin, mats.carCabin, cars.length]} />
        </>
      )}
      {roadMarkings.length > 0 && (
        <instancedMesh ref={roadMarkingRef} args={[geos.roadMarking, mats.roadMarking, roadMarkings.length]} />
      )}
      {/* Benches, fountains, sidewalks: keep as individual components (usually few) */}
      {items.filter(d => d.type === 'bench').map((d, i) => (
        <ParkBench key={`bench-${i}`} position={d.position} rotation={d.rotation} />
      ))}
      {items.filter(d => d.type === 'fountain').map((d, i) => (
        <Fountain key={`fountain-${i}`} position={d.position} />
      ))}
      {items.filter(d => d.type === 'sidewalk').map((d, i) => (
        <Sidewalk key={`walk-${i}`} position={d.position} size={d.size!} color={sidewalkColor} />
      ))}
    </>
  );
}

// ─── River ───────────────────────────────────────────────────

function River({ river, waterColor, waterEmissive }: { river: CityRiver; waterColor: string; waterEmissive: string }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.opacity = 0.82 + Math.sin(clock.elapsedTime * 0.5) * 0.05;
    }
  });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[river.x + river.width / 2, 0.5, river.centerZ]}
      renderOrder={1}
    >
      <planeGeometry args={[river.width, river.length]} />
      <meshBasicMaterial
        ref={matRef}
        color={waterEmissive}
        transparent
        opacity={0.82}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── River Text (watermark) ──────────────────────────────────

function RiverText({ river }: { river: CityRiver }) {
  const [fontReady, setFontReady] = useState(false);
  const texRef = useRef<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    document.fonts.ready.then(() => setFontReady(true));
  }, []);

  const texture = useMemo(() => {
    if (!fontReady) return null;

    // Canvas: narrow (river width) x tall (river length)
    // UV maps: canvas X → plane X (river width), canvas Y → plane Z (river length)
    const cW = 256;
    const cH = 4096;
    const c = document.createElement("canvas");
    c.width = cW;
    c.height = cH;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, cW, cH);

    // Rotate context so horizontal text runs along canvas Y (= river Z)
    ctx.save();
    ctx.translate(cW / 2, cH / 2);
    ctx.rotate(-Math.PI / 2);

    // After rotation: text "width" spans canvas height (river length)
    // text "height" spans canvas width (river width)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = 'bold 100px "Silkscreen", monospace';
    ctx.fillText("$GITC  -  CA: 0xd523f92f5f313288cf69ac9ca456b8a7d7a6dba3", 0, 0);

    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    texRef.current = tex;
    return tex;
  }, [fontReady]);

  useEffect(() => {
    return () => { texRef.current?.dispose(); };
  }, []);

  if (!texture) return null;

  return (
    <mesh
      position={[river.x + river.width / 2, 0.6, river.centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
    >
      <planeGeometry args={[river.width, river.length]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Bridge ──────────────────────────────────────────────────

function Bridge({ bridge }: { bridge: CityBridge }) {
  const [bx, , bz] = bridge.position;
  const deckLength = bridge.width;
  const deckWidth = 18;
  const deckHeight = 1;
  const deckY = 6;

  const pillarCount = 3;
  const pillarSpacing = deckLength / (pillarCount + 1);

  return (
    <group position={[bx, 0, bz]} rotation={[0, bridge.rotation ?? 0, 0]}>
      {/* Deck */}
      <mesh position={[0, deckY, 0]}>
        <boxGeometry args={[deckLength, deckHeight, deckWidth]} />
        <meshStandardMaterial color="#505860" emissive="#404850" emissiveIntensity={0.4} />
      </mesh>
      {/* Guardrails */}
      <mesh position={[0, deckY + 1, deckWidth / 2 - 0.2]}>
        <boxGeometry args={[deckLength, 1.5, 0.4]} />
        <meshStandardMaterial color="#606870" emissive="#505860" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, deckY + 1, -(deckWidth / 2 - 0.2)]}>
        <boxGeometry args={[deckLength, 1.5, 0.4]} />
        <meshStandardMaterial color="#606870" emissive="#505860" emissiveIntensity={0.3} />
      </mesh>
      {/* Pillars */}
      {Array.from({ length: pillarCount }, (_, i) => {
        const px = -deckLength / 2 + pillarSpacing * (i + 1);
        return (
          <group key={i}>
            <mesh position={[px, deckY / 2, 0]}>
              <boxGeometry args={[2.5, deckY, 2.5]} />
              <meshStandardMaterial color="#404848" emissive="#303838" emissiveIntensity={0.3} />
            </mesh>
            {/* Suspension cables (simple lines from pillar tops to deck edges) */}
            <mesh position={[px, deckY + 8, 0]}>
              <boxGeometry args={[2, 16, 2]} />
              <meshStandardMaterial color="#404848" emissive="#303838" emissiveIntensity={0.3} />
            </mesh>
            {/* Cable left */}
            <mesh position={[px - deckLength * 0.12, deckY + 6, 0]} rotation={[0, 0, 0.35]}>
              <boxGeometry args={[deckLength * 0.25, 0.3, 0.3]} />
              <meshStandardMaterial color="#606060" emissive="#505050" emissiveIntensity={0.3} />
            </mesh>
            {/* Cable right */}
            <mesh position={[px + deckLength * 0.12, deckY + 6, 0]} rotation={[0, 0, -0.35]}>
              <boxGeometry args={[deckLength * 0.25, 0.3, 0.3]} />
              <meshStandardMaterial color="#606060" emissive="#505050" emissiveIntensity={0.3} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ─── Waterfront (Docks + Bollards) ──────────────────────────

function Waterfront({ river, dockColor }: { river: CityRiver; dockColor: string }) {
  const dockPlankRef = useRef<THREE.InstancedMesh>(null);
  const bollardRef = useRef<THREE.InstancedMesh>(null);

  const dockSpacing = 35;
  const dockCount = 60; // 30 per side
  const bollardsPerDock = 2;
  const totalBollards = dockCount * bollardsPerDock;

  const geos = useMemo(() => ({
    plank: new THREE.BoxGeometry(8, 0.3, 4),
    bollard: new THREE.CylinderGeometry(0.5, 0.5, 2, 8),
  }), []);

  const mats = useMemo(() => ({
    plank: new THREE.MeshStandardMaterial({ color: dockColor, emissive: dockColor, emissiveIntensity: 0.35 }),
    bollard: new THREE.MeshStandardMaterial({ color: "#808080", emissive: "#606060", emissiveIntensity: 0.3 }),
  }), [dockColor]);

  useEffect(() => {
    if (!dockPlankRef.current || !bollardRef.current) return;
    const leftX = river.x - 6; // left bank
    const rightX = river.x + river.width + 6; // right bank
    const halfRange = (dockCount / 2) * dockSpacing / 2;
    let di = 0;
    let bi = 0;
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const m = new THREE.Matrix4();

    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? leftX : rightX;
      for (let i = 0; i < dockCount / 2; i++) {
        const z = -halfRange + i * dockSpacing;
        p.set(x, 0.2, z);
        m.compose(p, q, s);
        dockPlankRef.current.setMatrixAt(di++, m);

        // Bollards at corners of dock
        p.set(x - 3.5, 1.1, z - 1.5);
        m.compose(p, q, s);
        bollardRef.current.setMatrixAt(bi++, m);
        p.set(x + 3.5, 1.1, z + 1.5);
        m.compose(p, q, s);
        bollardRef.current.setMatrixAt(bi++, m);
      }
    }

    dockPlankRef.current.instanceMatrix.needsUpdate = true;
    bollardRef.current.instanceMatrix.needsUpdate = true;
  }, [river, dockCount, dockSpacing]);

  useEffect(() => {
    return () => {
      Object.values(geos).forEach(g => g.dispose());
      Object.values(mats).forEach(m => m.dispose());
    };
  }, [geos, mats]);

  return (
    <>
      <instancedMesh ref={dockPlankRef} args={[geos.plank, mats.plank, dockCount]} />
      <instancedMesh ref={bollardRef} args={[geos.bollard, mats.bollard, totalBollards]} />
    </>
  );
}

// ─── Orbit Scene (controls + focus) ──────────────────────────

function OrbitScene({ buildings, focusedBuilding, focusedBuildingB }: { buildings: CityBuilding[]; focusedBuilding: string | null; focusedBuildingB?: string | null }) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();

  // Reset camera on mount — wide panorama centered on founder area
  useEffect(() => {
    camera.position.set(800, 700, 1000);
    camera.lookAt(TARGET_X, TARGET_Y, TARGET_Z);
  }, [camera]);

  return (
    <>
      <CameraFocus buildings={buildings} focusedBuilding={focusedBuilding} focusedBuildingB={focusedBuildingB} controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.06}
        minDistance={40}
        maxDistance={2500}
        maxPolarAngle={Math.PI / 2.1}
        target={[TARGET_X, TARGET_Y, TARGET_Z]}
        autoRotate
        autoRotateSpeed={0.15}
      />
    </>
  );
}

// ─── Main Canvas ─────────────────────────────────────────────

interface Props {
  buildings: CityBuilding[];
  plazas: CityPlaza[];
  decorations: CityDecoration[];
  river?: CityRiver | null;
  bridges?: CityBridge[];
  flyMode: boolean;
  flyVehicle?: string;
  onExitFly: () => void;
  themeIndex: number;
  onHud?: (speed: number, altitude: number, x: number, z: number, yaw: number) => void;
  onPause?: (paused: boolean) => void;
  focusedBuilding?: string | null;
  focusedBuildingB?: string | null;
  accentColor?: string;
  onClearFocus?: () => void;
  onBuildingClick?: (building: CityBuilding) => void;
  onFocusInfo?: (info: FocusInfo) => void;
  flyPauseSignal?: number;
  flyHasOverlay?: boolean;
  skyAds?: SkyAd[];
  onAdClick?: (ad: SkyAd) => void;
  onAdViewed?: (adId: string) => void;
  introMode?: boolean;
  onIntroEnd?: () => void;
  raidPhase?: RaidPhase;
  raidData?: RaidExecuteResponse | null;
  raidAttacker?: CityBuilding | null;
  raidDefender?: CityBuilding | null;
  onRaidPhaseComplete?: (phase: RaidPhase) => void;
  onLandmarkClick?: () => void;
  rabbitSighting?: number | null;
  onRabbitCaught?: () => void;
  rabbitCinematic?: boolean;
  onRabbitCinematicEnd?: () => void;
  rabbitCinematicTarget?: number;
  ghostPreviewLogin?: string | null;
  holdRise?: boolean;
  celebrationActive?: boolean;
}

// Plaza indices for rabbit sightings (progressively further from center)
const RABBIT_PLAZA_INDICES = [1, 2, 4, 7, 10]; // plazas[1]=slot3, [2]=slot7, [4]=slot18, [7]=slot42, [10]=slot75

export default function CityCanvas({ buildings, plazas, decorations, river, bridges, flyMode, flyVehicle, onExitFly, themeIndex, onHud, onPause, focusedBuilding, focusedBuildingB, accentColor, onClearFocus, onBuildingClick, onFocusInfo, flyPauseSignal, flyHasOverlay, skyAds, onAdClick, onAdViewed, introMode, onIntroEnd, raidPhase, raidData, raidAttacker, raidDefender, onRaidPhaseComplete, onLandmarkClick, rabbitSighting, onRabbitCaught, rabbitCinematic, onRabbitCinematicEnd, rabbitCinematicTarget, ghostPreviewLogin, holdRise, celebrationActive }: Props) {
  const t = THEMES[themeIndex] ?? THEMES[0];
  const showPerf = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("perf");
  const [dpr, setDpr] = useState(1.5);

  const cityRadius = useMemo(() => {
    let max = 200;
    for (const b of buildings) {
      const d = Math.sqrt(b.position[0] ** 2 + b.position[2] ** 2);
      if (d > max) max = d;
    }
    return max;
  }, [buildings]);

  return (
    <Canvas
      camera={{ position: [400, 450, 600], fov: 55, near: 0.5, far: 4000 }}
      dpr={dpr}
      gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.3 }}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh" }}
    >
      {showPerf && <Stats />}
      <PerformanceMonitor onIncline={() => setDpr(1.5)} onDecline={() => setDpr(1)} />
      <fog attach="fog" args={[t.fogColor, t.fogNear, t.fogFar]} key={`fog-${themeIndex}`} />

      <ambientLight intensity={t.ambientIntensity * 3} color={t.ambientColor} />
      <directionalLight position={t.sunPos} intensity={t.sunIntensity * 3.5} color={t.sunColor} />
      <directionalLight position={t.fillPos} intensity={t.fillIntensity * 3} color={t.fillColor} />
      <hemisphereLight args={[t.hemiSky, t.hemiGround, t.hemiIntensity * 3.5]} key={`hemi-${themeIndex}`} />

      <SkyDome key={`sky-${themeIndex}`} stops={t.sky} />

      {introMode && <IntroFlyover onEnd={onIntroEnd ?? (() => {})} />}

      {rabbitCinematic && rabbitCinematicTarget != null && (
        <RabbitFlyover
          targetPlazaIndex={RABBIT_PLAZA_INDICES[(rabbitCinematicTarget - 1)] ?? 1}
          plazas={plazas}
          onEnd={onRabbitCinematicEnd ?? (() => {})}
        />
      )}

      {!introMode && !rabbitCinematic && !flyMode && (!raidPhase || raidPhase === "idle" || raidPhase === "preview") && (
        <OrbitScene buildings={buildings} focusedBuilding={focusedBuilding ?? null} focusedBuildingB={focusedBuildingB} />
      )}

      {raidPhase && raidPhase !== "idle" && raidPhase !== "preview" && (
        <RaidSequence3D
          phase={raidPhase}
          attacker={raidAttacker ?? null}
          defender={raidDefender ?? null}
          raidData={raidData ?? null}
          onPhaseComplete={onRaidPhaseComplete ?? (() => {})}
        />
      )}

      {!introMode && flyMode && <AirplaneFlight onExit={onExitFly} onHud={onHud ?? (() => {})} onPause={onPause ?? (() => {})} pauseSignal={flyPauseSignal} hasOverlay={flyHasOverlay} vehicleType={flyVehicle} />}

      <Ground key={`ground-${themeIndex}`} color={t.groundColor} grid1={t.grid1} grid2={t.grid2} />

      <FounderSpire onClick={onLandmarkClick ?? (() => {})} />

      {celebrationActive && <CelebrationEffect cityRadius={cityRadius} />}

      {rabbitSighting && rabbitSighting >= 1 && rabbitSighting <= 5 && (() => {
        const plazaIdx = RABBIT_PLAZA_INDICES[rabbitSighting - 1];
        const plaza = plazas[plazaIdx];
        if (!plaza) return null;
        const pos: [number, number, number] = [plaza.position[0], 0.5, plaza.position[2]];
        return (
          <WhiteRabbit
            position={pos}
            visible={true}
            onCaught={onRabbitCaught ?? (() => {})}
          />
        );
      })()}

      {river && (
        <>
          <River river={river} waterColor={t.waterColor} waterEmissive={t.waterEmissive} />
          <RiverText river={river} />
          <Waterfront river={river} dockColor={t.dockColor} />
        </>
      )}

      {bridges?.map((b, i) => (
        <Bridge key={`bridge-${i}`} bridge={b} />
      ))}

      <CityScene
        buildings={buildings}
        colors={t.building}
        focusedBuilding={raidPhase && raidPhase !== "idle" && raidPhase !== "preview" && raidPhase !== "share" && raidPhase !== "done" ? (raidDefender?.login ?? focusedBuilding) : focusedBuilding}
        focusedBuildingB={raidPhase && raidPhase !== "idle" && raidPhase !== "preview" && raidPhase !== "share" && raidPhase !== "done" ? (raidAttacker?.login ?? null) : focusedBuildingB}
        hideEffectsFor={raidPhase && raidPhase !== "idle" && raidPhase !== "preview" && raidPhase !== "share" && raidPhase !== "done" ? (raidAttacker?.login ?? null) : null}
        accentColor={t.building.accent}
        onBuildingClick={onBuildingClick}
        onFocusInfo={onFocusInfo}
        introMode={introMode}
        flyMode={flyMode}
        ghostPreviewLogin={ghostPreviewLogin}
        holdRise={holdRise}
      />

      <InstancedDecorations items={decorations} roadMarkingColor={t.roadMarkingColor} sidewalkColor={t.sidewalkColor} />

      {skyAds && skyAds.length > 0 && (
        <>
          <SkyAds ads={skyAds} cityRadius={cityRadius} flyMode={flyMode} onAdClick={onAdClick} onAdViewed={onAdViewed} />
          <BuildingAds
            ads={skyAds}
            buildings={buildings}
            onAdClick={onAdClick}
            onAdViewed={onAdViewed}
            focusedBuilding={raidPhase && raidPhase !== "idle" && raidPhase !== "preview" && raidPhase !== "share" && raidPhase !== "done" ? (raidDefender?.login ?? focusedBuilding) : focusedBuilding}
            focusedBuildingB={raidPhase && raidPhase !== "idle" && raidPhase !== "preview" && raidPhase !== "share" && raidPhase !== "done" ? (raidAttacker?.login ?? null) : focusedBuildingB}
          />
        </>
      )}

      <EffectComposer multisampling={0}>
        <Bloom
          mipmapBlur
          luminanceThreshold={1}
          luminanceSmoothing={0.3}
          intensity={1.2}
        />
      </EffectComposer>
    </Canvas>
  );
}
