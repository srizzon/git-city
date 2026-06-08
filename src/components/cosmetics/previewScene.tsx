"use client";

import { useMemo, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { VehicleMesh } from "@/components/RaidSequence3D";
import { ClaimedGlow } from "@/components/Building3D";

// ─── City-faithful preview scene ───────────────────────────────
// Mirrors CityCanvas: sky-gradient dome, theme lights, ground + grid, and
// a building with lit windows. Lets cosmetics be previewed exactly as they
// look in the real city, across all 4 themes.

import { THEMES } from "@/config/themes";

export interface PreviewTheme {
  name: string;
  accent: string;
  sky: [number, string][];
  fogColor: string;
  ambientColor: string;
  ambientIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  fillColor: string;
  fillIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  groundColor: string;
  grid: string;
  buildingFace: string;
  windowLit: string[];
  windowOff: string;
  roof: string;
}

export const PREVIEW_THEMES: PreviewTheme[] = Object.values(THEMES).map((t) => ({
  name: t.name,
  accent: t.accent,
  sky: t.sky,
  fogColor: t.fogColor,
  ambientColor: t.ambientColor,
  ambientIntensity: t.ambientIntensity,
  sunColor: t.sunColor,
  sunIntensity: t.sunIntensity,
  sunPos: t.sunPos,
  fillColor: t.fillColor,
  fillIntensity: t.fillIntensity,
  hemiSky: t.hemiSky,
  hemiGround: t.hemiGround,
  hemiIntensity: t.hemiIntensity,
  groundColor: t.groundColor,
  grid: t.grid1,
  buildingFace: t.building.face,
  windowLit: t.building.windowLit,
  windowOff: t.building.windowOff,
  roof: t.building.roof,
}));

// Deterministic pseudo-random for stable window pattern
function rng(seed: number) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

export function PreviewSky({ stops }: { stops: [number, string][] }) {
  const mat = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 4; c.height = 512;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    for (const [s, color] of stops) g.addColorStop(s, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
  }, [stops]);
  useEffect(() => () => { mat.map?.dispose(); mat.dispose(); }, [mat]);
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[600, 32, 32]} />
    </mesh>
  );
}

export function PreviewGround({ color, grid }: { color: string; grid: string }) {
  return (
    <group position={[0, 0, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <gridHelper args={[600, 40, grid, grid]} position={[0, 0, 0]} />
    </group>
  );
}

export function PreviewLights({ theme }: { theme: PreviewTheme }) {
  return (
    <>
      <ambientLight intensity={theme.ambientIntensity * 3} color={theme.ambientColor} />
      <directionalLight position={theme.sunPos} intensity={theme.sunIntensity * 3.5} color={theme.sunColor} />
      <directionalLight position={[-200, 60, 200]} intensity={theme.fillIntensity * 3} color={theme.fillColor} />
      <hemisphereLight args={[theme.hemiSky, theme.hemiGround, theme.hemiIntensity * 3.5]} />
    </>
  );
}

// Procedural window texture matching the real city (Building3D / ShopPreview):
// small dense windows, ~65% lit, emissive on the bright cells.
function windowTexture(rows: number, cols: number, seed: number, litColors: string[], offColor: string, faceColor: string): THREE.CanvasTexture {
  const WS = 6, GAP = 2, PAD = 3;
  const w = PAD * 2 + cols * WS + Math.max(0, cols - 1) * GAP;
  const h = PAD * 2 + rows * WS + Math.max(0, rows - 1) * GAP;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = faceColor;
  ctx.fillRect(0, 0, w, h);
  const rand = rng(seed);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = PAD + col * (WS + GAP);
      const y = PAD + r * (WS + GAP);
      ctx.fillStyle = rand() < 0.62 ? litColors[Math.floor(rand() * litColors.length)] : offColor;
      ctx.fillRect(x, y, WS, WS);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const WHITE = new THREE.Color("#ffffff");

// A building matching the city look: per-face emissive window textures on a
// multi-material box + the claimed neon roofline. `faceOverride` tints the
// base face (used by the `custom_color` cosmetic).
export function PreviewBuilding({ theme, faceOverride, width = 18, height = 40, depth = 18 }: { theme: PreviewTheme; faceOverride?: string; width?: number; height?: number; depth?: number }) {
  const face = faceOverride ?? theme.buildingFace;
  const floors = Math.max(2, Math.round(height / 5));
  const winPerFloor = Math.max(2, Math.round(width / 5));
  const sideWinPerFloor = Math.max(2, Math.round(depth / 5));

  const { front, side } = useMemo(() => ({
    front: windowTexture(floors, winPerFloor, 42 * 137, theme.windowLit, theme.windowOff, face),
    side: windowTexture(floors, sideWinPerFloor, 42 * 137 + 7919, theme.windowLit, theme.windowOff, face),
  }), [floors, winPerFloor, sideWinPerFloor, theme.windowLit, theme.windowOff, face]);

  const materials = useMemo(() => {
    const roofColor = new THREE.Color(theme.roof);
    const roof = new THREE.MeshStandardMaterial({ color: roofColor, emissive: roofColor, emissiveIntensity: 1.2, roughness: 0.6 });
    const makeFace = (t: THREE.CanvasTexture) =>
      new THREE.MeshStandardMaterial({ map: t, emissive: WHITE.clone(), emissiveMap: t, emissiveIntensity: 1.9, roughness: 0.85, metalness: 0 });
    const s = makeFace(side), f = makeFace(front);
    // BoxGeometry face order: [+x, -x, +y, -y, +z, -z] → [side, side, roof, roof, front, front]
    return [s, s, roof, roof, f, f];
  }, [front, side, theme.roof]);

  useEffect(() => () => {
    front.dispose(); side.dispose();
    for (const m of materials) m.dispose();
  }, [front, side, materials]);

  return (
    <group>
      <mesh position={[0, height / 2, 0]} material={materials}>
        <boxGeometry args={[width, height, depth]} />
      </mesh>
      <ClaimedGlow height={height} width={width} depth={depth} />
    </group>
  );
}

// Raid vehicles: rendered standalone (not on a building), slowly spinning —
// reuses the exact game mesh dispatch from RaidSequence3D.
export function PreviewVehicle({ type }: { type: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 0.5; });
  return (
    <group ref={ref}>
      <VehicleMesh type={type} />
    </group>
  );
}

