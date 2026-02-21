"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import CityScene from "./CityScene";
import type { CityBuilding, CityPlaza, CityDecoration } from "@/lib/github";
import { seededRandom } from "@/lib/github";

// ─── Theme Definitions ───────────────────────────────────────

export const THEME_NAMES = [
  "Sunset",
  "Midnight",
  "Neon",
  "Dawn",
  "Emerald",
  "Vapor",
] as const;

export interface BuildingColors {
  windowLit: string[];
  windowOff: string;
  face: string;
  roof: string;
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
  building: BuildingColors;
}

const THEMES: CityTheme[] = [
  // 0 – Sunset
  {
    sky: [
      [0, "#0c0614"], [0.15, "#1c0e30"], [0.28, "#3a1850"], [0.38, "#6a3060"],
      [0.46, "#a05068"], [0.52, "#d07060"], [0.57, "#e89060"], [0.62, "#f0b070"],
      [0.68, "#f0c888"], [0.75, "#c08060"], [0.85, "#603030"], [1, "#180c10"],
    ],
    fogColor: "#80405a", fogNear: 200, fogFar: 1200,
    ambientColor: "#e0a080", ambientIntensity: 0.35,
    sunColor: "#f0b070", sunIntensity: 0.6, sunPos: [400, 50, -300],
    fillColor: "#6050a0", fillIntensity: 0.1, fillPos: [-200, 80, 200],
    hemiSky: "#a06060", hemiGround: "#100a0c", hemiIntensity: 0.25,
    groundColor: "#100a0c", grid1: "#2a1820", grid2: "#180e12",
    building: {
      windowLit: ["#f8d880", "#f0b860", "#e89840", "#d07830", "#f0c060"],
      windowOff: "#1a1018", face: "#281828", roof: "#604050",
    },
  },
  // 1 – Midnight
  {
    sky: [
      [0, "#000206"], [0.15, "#020814"], [0.30, "#061428"], [0.45, "#0c2040"],
      [0.55, "#102850"], [0.65, "#0c2040"], [0.80, "#061020"], [1, "#020608"],
    ],
    fogColor: "#0a1428", fogNear: 200, fogFar: 1000,
    ambientColor: "#4060b0", ambientIntensity: 0.2,
    sunColor: "#6080c0", sunIntensity: 0.3, sunPos: [300, 100, -200],
    fillColor: "#304080", fillIntensity: 0.08, fillPos: [-200, 60, 200],
    hemiSky: "#203060", hemiGround: "#060810", hemiIntensity: 0.15,
    groundColor: "#060810", grid1: "#101828", grid2: "#080c14",
    building: {
      windowLit: ["#a0c0f0", "#80a0e0", "#6080c8", "#c0d8f8", "#e0e8ff"],
      windowOff: "#0c0e18", face: "#101828", roof: "#2a3858",
    },
  },
  // 2 – Neon
  {
    sky: [
      [0, "#06001a"], [0.15, "#100028"], [0.30, "#200440"], [0.42, "#380650"],
      [0.52, "#500860"], [0.60, "#380648"], [0.75, "#180230"], [0.90, "#0c0118"],
      [1, "#06000c"],
    ],
    fogColor: "#1a0830", fogNear: 180, fogFar: 1000,
    ambientColor: "#8040c0", ambientIntensity: 0.3,
    sunColor: "#c040e0", sunIntensity: 0.5, sunPos: [300, 80, -200],
    fillColor: "#00c0d0", fillIntensity: 0.15, fillPos: [-250, 60, 200],
    hemiSky: "#6020a0", hemiGround: "#080410", hemiIntensity: 0.2,
    groundColor: "#08040c", grid1: "#201040", grid2: "#100820",
    building: {
      windowLit: ["#ff40c0", "#c040ff", "#00e0ff", "#40ff80", "#ff8040"],
      windowOff: "#0a0814", face: "#180830", roof: "#3c1858",
    },
  },
  // 3 – Dawn
  {
    sky: [
      [0, "#141430"], [0.15, "#1c1848"], [0.28, "#342860"], [0.38, "#604870"],
      [0.46, "#a07080"], [0.52, "#d09080"], [0.57, "#e8b0a0"], [0.62, "#f0c8b8"],
      [0.68, "#f0d8cc"], [0.75, "#c0a090"], [0.85, "#605048"], [1, "#181414"],
    ],
    fogColor: "#906870", fogNear: 200, fogFar: 1200,
    ambientColor: "#e0b0a0", ambientIntensity: 0.45,
    sunColor: "#f0c0a0", sunIntensity: 0.5, sunPos: [400, 60, -300],
    fillColor: "#8070b0", fillIntensity: 0.12, fillPos: [-200, 80, 200],
    hemiSky: "#a08090", hemiGround: "#141014", hemiIntensity: 0.25,
    groundColor: "#141014", grid1: "#281c24", grid2: "#1c1418",
    building: {
      windowLit: ["#f8e0c0", "#f0c8a0", "#e8b090", "#f0a880", "#ffd8b8"],
      windowOff: "#141018", face: "#201820", roof: "#503848",
    },
  },
  // 4 – Emerald
  {
    sky: [
      [0, "#000804"], [0.15, "#001408"], [0.30, "#002810"], [0.42, "#003c1c"],
      [0.52, "#004828"], [0.60, "#003820"], [0.75, "#002014"], [0.90, "#001008"],
      [1, "#000604"],
    ],
    fogColor: "#0a2014", fogNear: 200, fogFar: 1000,
    ambientColor: "#40a060", ambientIntensity: 0.25,
    sunColor: "#60c080", sunIntensity: 0.4, sunPos: [300, 80, -250],
    fillColor: "#20a080", fillIntensity: 0.1, fillPos: [-200, 60, 200],
    hemiSky: "#208040", hemiGround: "#040c06", hemiIntensity: 0.2,
    groundColor: "#040c06", grid1: "#0c2010", grid2: "#081408",
    building: {
      windowLit: ["#0e4429", "#006d32", "#26a641", "#39d353", "#c8e64a"],
      windowOff: "#060e08", face: "#0c1810", roof: "#1e4028",
    },
  },
  // 5 – Vapor
  {
    sky: [
      [0, "#0a0018"], [0.15, "#180030"], [0.25, "#300450"], [0.35, "#480660"],
      [0.45, "#801870"], [0.55, "#a03080"], [0.62, "#c05088"], [0.70, "#408888"],
      [0.80, "#206060"], [0.90, "#103030"], [1, "#081418"],
    ],
    fogColor: "#301838", fogNear: 180, fogFar: 1100,
    ambientColor: "#a060a0", ambientIntensity: 0.3,
    sunColor: "#e06890", sunIntensity: 0.45, sunPos: [350, 60, -250],
    fillColor: "#40b0b0", fillIntensity: 0.15, fillPos: [-250, 80, 200],
    hemiSky: "#804080", hemiGround: "#081010", hemiIntensity: 0.2,
    groundColor: "#080c10", grid1: "#201430", grid2: "#140c1c",
    building: {
      windowLit: ["#ff60a0", "#e040c0", "#40e0d0", "#80f0c0", "#c060e0"],
      windowOff: "#0c0a14", face: "#181028", roof: "#3c2850",
    },
  },
];

// ─── Sky Dome ────────────────────────────────────────────────

function SkyDome({ stops }: { stops: [number, string][] }) {
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
    return new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
  }, [stops]);

  useEffect(() => {
    return () => {
      mat.map?.dispose();
      mat.dispose();
    };
  }, [mat]);

  return (
    <mesh material={mat}>
      <sphereGeometry args={[900, 32, 48]} />
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

// ─── Camera Focus (controls OrbitControls target) ───────────

function CameraFocus({
  buildings,
  focusedBuilding,
  controlsRef,
}: {
  buildings: CityBuilding[];
  focusedBuilding: string | null;
  controlsRef: React.RefObject<any>;
}) {
  const { camera } = useThree();
  const startPos = useRef(new THREE.Vector3());
  const startLook = useRef(new THREE.Vector3());
  const endPos = useRef(new THREE.Vector3());
  const endLook = useRef(new THREE.Vector3());
  const progress = useRef(1);
  const active = useRef(false);

  useEffect(() => {
    if (!focusedBuilding) {
      // Re-enable auto-rotate when focus is cleared
      if (controlsRef.current) {
        controlsRef.current.autoRotate = true;
      }
      return;
    }

    const b = buildings.find(
      (b) => b.login.toLowerCase() === focusedBuilding.toLowerCase()
    );
    if (!b) return;

    // Capture current camera state as start
    startPos.current.copy(camera.position);
    if (controlsRef.current) {
      startLook.current.copy(controlsRef.current.target);
    }

    endPos.current.set(
      b.position[0] + 80,
      b.height + 60,
      b.position[2] + 80
    );
    endLook.current.set(
      b.position[0],
      b.height + 15,
      b.position[2]
    );
    progress.current = 0;
    active.current = true;

    if (controlsRef.current) {
      controlsRef.current.autoRotate = false;
    }
  }, [focusedBuilding, buildings, camera, controlsRef]);

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

const DEFAULT_FLY_SPEED = 60;
const MIN_FLY_SPEED = 20;
const MAX_FLY_SPEED = 160;
const MIN_ALT = 25;
const MAX_ALT = 900;
const TURN_RATE = 2.0;
const CLIMB_RATE = 30;
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

function AirplaneFlight({ onExit, onHud, onPause, pauseSignal = 0, hasOverlay = false }: { onExit: () => void; onHud: (s: number, a: number) => void; onPause: (paused: boolean) => void; pauseSignal?: number; hasOverlay?: boolean }) {
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
      if (hudTimer.current > 0.1) {
        hudTimer.current = 0;
        onHud(0, pos.current.y);
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

    pos.current.y += altInput * CLIMB_RATE * dt;
    pos.current.y = Math.max(MIN_ALT, Math.min(MAX_ALT, pos.current.y));

    // Shift = boost 2x, Ctrl = slow 0.3x
    let speedMult = 1;
    if (k["ShiftLeft"] || k["ShiftRight"]) speedMult = 2;
    if (k["AltLeft"] || k["AltRight"]) speedMult = 0.3;

    const altFactor = -altInput * 0.4;
    const targetSpeed = flySpeed.current + altFactor * flySpeed.current * 0.3;
    const actualSpeed = (flySpeed.current + (targetSpeed - flySpeed.current) * 0.5) * speedMult;

    _fwd.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    pos.current.addScaledVector(_fwd, actualSpeed * dt);

    const bob = (1 - Math.abs(turnInput)) * Math.sin(t * 1.5) * 0.15;
    pos.current.y += bob;

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
    if (hudTimer.current > 0.1) {
      hudTimer.current = 0;
      onHud(flySpeed.current, pos.current.y);
    }
  });

  return (
    <>
      <group ref={ref}>
        <PlaneModel />
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
    camera.position.set(200, 180, 300);
    camera.lookAt(0, 30, 0);
  }, [camera]);
  return null;
}

// ─── Ground ──────────────────────────────────────────────────

function Ground({ color, grid1, grid2 }: { color: string; grid1: string; grid2: string }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <gridHelper args={[4000, 240, grid1, grid2]} position={[0, 0.02, 0]} />
    </group>
  );
}

// ─── Tree ─────────────────────────────────────────────────────

function Tree3D({ position, variant }: { position: [number, number, number]; variant: number }) {
  const greens = ['#2d5a1e', '#1e6b2e', '#3a7a2a'];
  const trunkH = 8 + variant * 1.5;
  const canopyH = 10 + variant * 2;
  const canopyR = 6 + variant * 0.8;
  return (
    <group position={position}>
      <mesh position={[0, trunkH / 2, 0]}>
        <cylinderGeometry args={[1, 1.3, trunkH, 6]} />
        <meshStandardMaterial color="#5a3a1e" />
      </mesh>
      <mesh position={[0, trunkH + canopyH / 2 - 1, 0]}>
        <coneGeometry args={[canopyR, canopyH, 8]} />
        <meshStandardMaterial color={greens[variant % greens.length]} />
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
        <meshStandardMaterial color="#4a4a4a" />
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
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <boxGeometry args={[5, 2, 3.2]} />
        <meshStandardMaterial color={color} />
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
        <meshStandardMaterial color="#6b4226" />
      </mesh>
      <mesh position={[0, 1.7, -0.65]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[5, 1.3, 0.2]} />
        <meshStandardMaterial color="#6b4226" />
      </mesh>
      <mesh position={[-2, 0.45, 0]}>
        <boxGeometry args={[0.3, 0.9, 1.2]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      <mesh position={[2, 0.45, 0]}>
        <boxGeometry args={[0.3, 0.9, 1.2]} />
        <meshStandardMaterial color="#3a3a3a" />
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
        <meshStandardMaterial color="#707070" />
      </mesh>
      <mesh position={[0, 3.4, 0]}>
        <cylinderGeometry args={[5, 5.5, 2, 12]} />
        <meshStandardMaterial color="#808080" />
      </mesh>
      <mesh position={[0, 5.6, 0]}>
        <cylinderGeometry args={[2.5, 3.2, 2, 10]} />
        <meshStandardMaterial color="#909090" />
      </mesh>
      <mesh position={[0, 7.2, 0]}>
        <cylinderGeometry args={[1.8, 2, 1.2, 10]} />
        <meshStandardMaterial color="#4090d0" emissive="#2060a0" emissiveIntensity={2.0} toneMapped={false} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

// ─── Sidewalk ─────────────────────────────────────────────────

function Sidewalk({ position, size }: { position: [number, number, number]; size: [number, number] }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshStandardMaterial color="#1a1a1e" />
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

function InstancedDecorations({ items }: { items: CityDecoration[] }) {
  const trees = useMemo(() => items.filter(d => d.type === 'tree'), [items]);
  const lamps = useMemo(() => items.filter(d => d.type === 'streetLamp'), [items]);
  const cars = useMemo(() => items.filter(d => d.type === 'car'), [items]);

  const treeTrunkRef = useRef<THREE.InstancedMesh>(null);
  const treeCanopyRef = useRef<THREE.InstancedMesh>(null);
  const lampPoleRef = useRef<THREE.InstancedMesh>(null);
  const lampLightRef = useRef<THREE.InstancedMesh>(null);
  const carBodyRef = useRef<THREE.InstancedMesh>(null);
  const carCabinRef = useRef<THREE.InstancedMesh>(null);

  // Shared geometries
  const geos = useMemo(() => ({
    treeTrunk: new THREE.CylinderGeometry(1, 1.3, 1, 6),
    treeCanopy: new THREE.ConeGeometry(1, 1, 8),
    lampPole: new THREE.CylinderGeometry(0.3, 0.45, 18, 6),
    lampLight: new THREE.BoxGeometry(1.5, 0.8, 1.5),
    carBody: new THREE.BoxGeometry(8, 2.5, 3.5),
    carCabin: new THREE.BoxGeometry(5, 2, 3.2),
  }), []);

  // Shared materials
  const mats = useMemo(() => ({
    treeTrunk: new THREE.MeshStandardMaterial({ color: "#5a3a1e" }),
    treeCanopy: new THREE.MeshStandardMaterial({ color: "#2d5a1e" }),
    lampPole: new THREE.MeshStandardMaterial({ color: "#4a4a4a" }),
    lampLight: new THREE.MeshStandardMaterial({
      color: "#f0d870", emissive: "#f0d870", emissiveIntensity: 2.0, toneMapped: false,
    }),
    carBody: new THREE.MeshStandardMaterial({ color: "#808080" }),
    carCabin: new THREE.MeshStandardMaterial({ color: "#808080" }),
  }), []);

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
      {/* Benches, fountains, sidewalks: keep as individual components (usually few) */}
      {items.filter(d => d.type === 'bench').map((d, i) => (
        <ParkBench key={`bench-${i}`} position={d.position} rotation={d.rotation} />
      ))}
      {items.filter(d => d.type === 'fountain').map((d, i) => (
        <Fountain key={`fountain-${i}`} position={d.position} />
      ))}
      {items.filter(d => d.type === 'sidewalk').map((d, i) => (
        <Sidewalk key={`walk-${i}`} position={d.position} size={d.size!} />
      ))}
    </>
  );
}

// ─── Orbit Scene (controls + focus) ──────────────────────────

function OrbitScene({ buildings, focusedBuilding }: { buildings: CityBuilding[]; focusedBuilding: string | null }) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();

  // Reset camera on mount
  useEffect(() => {
    camera.position.set(300, 250, 400);
    camera.lookAt(0, 30, 0);
  }, [camera]);

  return (
    <>
      <CameraFocus buildings={buildings} focusedBuilding={focusedBuilding} controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.06}
        minDistance={40}
        maxDistance={800}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 30, 0]}
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
  flyMode: boolean;
  onExitFly: () => void;
  themeIndex: number;
  onHud?: (speed: number, altitude: number) => void;
  onPause?: (paused: boolean) => void;
  focusedBuilding?: string | null;
  accentColor?: string;
  onClearFocus?: () => void;
  onBuildingClick?: (building: CityBuilding) => void;
  flyPauseSignal?: number;
  flyHasOverlay?: boolean;
}

export default function CityCanvas({ buildings, plazas, decorations, flyMode, onExitFly, themeIndex, onHud, onPause, focusedBuilding, accentColor, onClearFocus, onBuildingClick, flyPauseSignal, flyHasOverlay }: Props) {
  const t = THEMES[themeIndex] ?? THEMES[0];

  return (
    <Canvas
      camera={{ position: [200, 180, 300], fov: 55, near: 0.5, far: 2000 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh" }}
    >
      <fog attach="fog" args={[t.fogColor, t.fogNear, t.fogFar]} key={`fog-${themeIndex}`} />

      <ambientLight intensity={t.ambientIntensity} color={t.ambientColor} />
      <directionalLight position={t.sunPos} intensity={t.sunIntensity * 2.5} color={t.sunColor} />
      <directionalLight position={t.fillPos} intensity={t.fillIntensity * 1.5} color={t.fillColor} />
      <hemisphereLight args={[t.hemiSky, t.hemiGround, t.hemiIntensity * 1.5]} key={`hemi-${themeIndex}`} />

      <SkyDome key={`sky-${themeIndex}`} stops={t.sky} />

      {!flyMode && (
        <OrbitScene buildings={buildings} focusedBuilding={focusedBuilding ?? null} />
      )}

      {flyMode && <AirplaneFlight onExit={onExitFly} onHud={onHud ?? (() => {})} onPause={onPause ?? (() => {})} pauseSignal={flyPauseSignal} hasOverlay={flyHasOverlay} />}

      <Ground key={`ground-${themeIndex}`} color={t.groundColor} grid1={t.grid1} grid2={t.grid2} />

      <CityScene
        buildings={buildings}
        colors={t.building}
        focusedBuilding={focusedBuilding}
        accentColor={accentColor}
        onBuildingClick={onBuildingClick}
      />

      <InstancedDecorations items={decorations} />
    </Canvas>
  );
}
