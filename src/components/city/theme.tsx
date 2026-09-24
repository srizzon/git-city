"use client";

import { useRef, useEffect, useMemo, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// Theme palette, sky dome, theme lights and exposure, shared by the home city
// (CityCanvas) and the league scene.

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

export interface CityTheme {
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

export const THEMES: CityTheme[] = [
  // 0 – Emerald
  {
    sky: [
      [0, "#000804"], [0.15, "#001408"], [0.30, "#002810"], [0.42, "#003c1c"],
      [0.52, "#004828"], [0.60, "#003820"], [0.75, "#002014"], [0.90, "#001008"],
      [1, "#000604"],
    ],
    fogColor: "#0a2014", fogNear: 400, fogFar: 3500,
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
  // 1 – Midnight
  {
    sky: [
      [0, "#000206"], [0.15, "#020814"], [0.30, "#061428"], [0.45, "#0c2040"],
      [0.55, "#102850"], [0.65, "#0c2040"], [0.80, "#061020"], [1, "#020608"],
    ],
    fogColor: "#0a1428", fogNear: 400, fogFar: 3500,
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
  // 2 – Sunset
  {
    sky: [
      [0, "#0c0614"], [0.15, "#1c0e30"], [0.28, "#3a1850"], [0.38, "#6a3060"],
      [0.46, "#a05068"], [0.52, "#d07060"], [0.57, "#e89060"], [0.62, "#f0b070"],
      [0.68, "#f0c888"], [0.75, "#c08060"], [0.85, "#603030"], [1, "#180c10"],
    ],
    fogColor: "#80405a", fogNear: 400, fogFar: 3500,
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
  // 3 – Neon
  {
    sky: [
      [0, "#06001a"], [0.15, "#100028"], [0.30, "#200440"], [0.42, "#380650"],
      [0.52, "#500860"], [0.60, "#380648"], [0.75, "#180230"], [0.90, "#0c0118"],
      [1, "#06000c"],
    ],
    fogColor: "#1a0830", fogNear: 400, fogFar: 3500,
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
];

// ─── Sky Dome ────────────────────────────────────────────────

export function SkyDome({ stops }: { stops: [number, string][] }) {
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

  useEffect(() => {
    return () => {
      mat.map?.dispose();
      mat.dispose();
    };
  }, [mat]);

  // Center sky dome on whichever camera is currently rendering
  // (works with split-screen virtual cameras, not just the default one)
  const onBeforeRender = useCallback((_renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera) => {
    if (meshRef.current) {
      meshRef.current.position.copy(camera.position);
    }
  }, []);

  return (
    <mesh ref={meshRef} material={mat} renderOrder={-1} onBeforeRender={onBeforeRender}>
      <sphereGeometry args={[3500, 32, 48]} />
    </mesh>
  );
}

// Dynamically adjust scene exposure based on city energy (devs coding)
export function CityExposure({ cityEnergy }: { cityEnergy: number }) {
  const gl = useThree((s) => s.gl);
  const targetRef = useRef(1.3);
  targetRef.current = 0.4 + 0.9 * Math.min(1, cityEnergy); // 0.4 at sleep, 1.3 at full

  useFrame(() => {
    const current = gl.toneMappingExposure;
    const target = targetRef.current;
    if (Math.abs(current - target) > 0.001) {
      gl.toneMappingExposure += (target - current) * 0.02;
    }
  });

  return null;
}
// ─── Theme Lights ────────────────────────────────────────────

export function ThemeLights({ theme: t, themeIndex }: { theme: CityTheme; themeIndex: number }) {
  return (
    <>
      <ambientLight intensity={t.ambientIntensity * 3} color={t.ambientColor} />
      <directionalLight position={t.sunPos} intensity={t.sunIntensity * 3.5} color={t.sunColor} />
      <directionalLight position={t.fillPos} intensity={t.fillIntensity * 3} color={t.fillColor} />
      <hemisphereLight args={[t.hemiSky, t.hemiGround, t.hemiIntensity * 3.5]} key={`hemi-${themeIndex}`} />
      <SkyDome key={`sky-${themeIndex}`} stops={t.sky} />
    </>
  );
}
