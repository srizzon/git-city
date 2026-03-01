"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  NeonOutline,
  ParticleAura,
  SpotlightEffect,
  RooftopFire,
  Helipad,
  AntennaArray,
  RooftopGarden,
  Spire,
  Billboards,
  Flag,
  NeonTrim,
  SatelliteDish,
  CrownItem,
  PoolParty,
  HologramRing,
  LightningAura,
  LEDBanner,
} from "./BuildingEffects";
import { ClaimedGlow } from "./Building3D";
import type { BuildingDims } from "./ShopClient";
import { ZONE_ITEMS } from "@/lib/zones";

const ACCENT = "#c8e64a";

// Fallback dims if none provided
const DEFAULT_DIMS: BuildingDims = { width: 20, height: 40, depth: 16 };

// ─── City-matching theme colors (Midnight) ───────────────────
const THEME = {
  windowLit: ["#a0c0f0", "#80a0e0", "#6080c8", "#c0d8f8", "#e0e8ff"],
  windowOff: "#0c0e18",
  face: "#101828",
  roof: "#2a3858",
  fogColor: "#0a1428",
  ambientColor: "#4060b0",
  sunColor: "#6080c0",
  fillColor: "#304080",
  groundColor: "#242c38",
};

// ─── Procedural window texture (matching city style) ─────────

function createPreviewWindowTexture(
  rows: number,
  cols: number,
  seed: number,
  faceColor?: string | null
): THREE.CanvasTexture {
  const WS = 6;
  const GAP = 2;
  const PAD = 3;

  const w = PAD * 2 + cols * WS + Math.max(0, cols - 1) * GAP;
  const h = PAD * 2 + rows * WS + Math.max(0, rows - 1) * GAP;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = faceColor || THEME.face;
  ctx.fillRect(0, 0, w, h);

  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const litPct = 0.65;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = PAD + c * (WS + GAP);
      const y = PAD + r * (WS + GAP);
      if (rand() < litPct) {
        ctx.fillStyle = THEME.windowLit[Math.floor(rand() * THEME.windowLit.length)];
      } else {
        ctx.fillStyle = THEME.windowOff;
      }
      ctx.fillRect(x, y, WS, WS);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const WHITE = new THREE.Color("#ffffff");

// ─── Effect renderer map ─────────────────────────────────────

function EffectForItem({
  itemId,
  dims,
  billboardImages,
}: {
  itemId: string;
  dims: BuildingDims;
  billboardImages?: string[];
}) {
  switch (itemId) {
    case "neon_outline":
      return <NeonOutline {...dims} />;
    case "particle_aura":
      return <ParticleAura {...dims} />;
    case "spotlight":
      return <SpotlightEffect {...dims} />;
    case "rooftop_fire":
      return <RooftopFire {...dims} />;
    case "helipad":
      return <Helipad {...dims} />;
    case "antenna_array":
      return <AntennaArray {...dims} />;
    case "rooftop_garden":
      return <RooftopGarden {...dims} />;
    case "spire":
      return <Spire {...dims} />;
    case "billboard":
      return <Billboards {...dims} images={billboardImages ?? []} />;
    case "flag":
      return <Flag {...dims} />;
    case "neon_trim":
      return <NeonTrim {...dims} color={ACCENT} />;
    case "satellite_dish":
      return <SatelliteDish {...dims} color={ACCENT} />;
    case "crown_item":
      return <CrownItem height={dims.height} color={ACCENT} />;
    case "pool_party":
      return <PoolParty {...dims} />;
    case "hologram_ring":
      return <HologramRing {...dims} color={ACCENT} />;
    case "lightning_aura":
      return <LightningAura {...dims} color={ACCENT} />;
    case "led_banner":
      return <LEDBanner {...dims} color={ACCENT} />;
    default:
      return null;
  }
}

// ─── Ground ──────────────────────────────────────────────────

function Ground({ y, size }: { y: number; size: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={THEME.groundColor} />
    </mesh>
  );
}

// ─── Scene ───────────────────────────────────────────────────

interface Loadout {
  crown: string | null;
  roof: string | null;
  aura: string | null;
}

function ShopPreviewScene({
  loadout,
  ownedFacesItems,
  customColor,
  billboardImages,
  dims,
  highlightItemId,
}: {
  loadout: Loadout;
  ownedFacesItems: string[];
  customColor: string | null;
  billboardImages: string[];
  dims: BuildingDims;
  highlightItemId?: string | null;
}) {
  const { width: W, height: H, depth: D } = dims;
  const groupRef = useRef<THREE.Group>(null);

  // Compute window grid from building dims (matching city logic)
  const floors = Math.max(2, Math.round(H / 5));
  const windowsPerFloor = Math.max(2, Math.round(W / 5));
  const sideWindowsPerFloor = Math.max(2, Math.round(D / 5));

  // Custom color: baked into the texture face color (same as city)
  const faceColor = useMemo(() => {
    if (customColor) return customColor;
    if (highlightItemId === "custom_color") return ACCENT;
    return null;
  }, [highlightItemId, customColor]);

  // City-matching per-face textures (regenerated when custom color changes)
  const textures = useMemo(() => {
    const seed = 42 * 137; // deterministic for preview
    const front = createPreviewWindowTexture(floors, windowsPerFloor, seed, faceColor);
    const side = createPreviewWindowTexture(floors, sideWindowsPerFloor, seed + 7919, faceColor);
    return { front, side };
  }, [floors, windowsPerFloor, sideWindowsPerFloor, faceColor]);

  // 6-material array matching city Building3D: [side, side, roof, roof, front, front]
  const materials = useMemo(() => {
    const roofColor = new THREE.Color(THEME.roof);
    const roof = new THREE.MeshStandardMaterial({
      color: roofColor,
      emissive: roofColor,
      emissiveIntensity: 1.5,
      roughness: 0.6,
    });

    const makeFace = (tex: THREE.CanvasTexture) =>
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: WHITE.clone(),
        emissiveMap: tex,
        emissiveIntensity: 2.0,
        roughness: 0.85,
        metalness: 0,
      });

    const side = makeFace(textures.side);
    const front = makeFace(textures.front);
    return [side, side, roof, roof, front, front];
  }, [textures]);

  // Gentle idle bob
  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.3;
  });

  const groundSize = Math.max(120, Math.max(W, D) * 4);

  return (
    <>
      {/* City-matching lighting (Midnight theme, multiplied like CityCanvas) */}
      <ambientLight intensity={0.35 * 3} color={THEME.ambientColor} />
      <directionalLight position={[300, 120, -200]} intensity={0.45 * 3.5} color={THEME.sunColor} />
      <directionalLight position={[-200, 60, 200]} intensity={0.15 * 3} color={THEME.fillColor} />
      <hemisphereLight args={["#5080a0", "#202830", 0.5 * 3.5]} />

      {/* Subtle fog for atmosphere (scaled to building size) */}
      <fog attach="fog" args={[THEME.fogColor, H * 1.5, H * 5]} />

      <OrbitControls
        autoRotate
        autoRotateSpeed={1}
        enablePan
        screenSpacePanning
        minDistance={Math.max(15, H * 0.15)}
        maxDistance={Math.max(200, H * 3)}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI * 0.85}
        target={[0, H * 0.05, 0]}
      />

      <Ground y={-H / 2} size={groundSize} />

      <group ref={groupRef}>
        {/* Building centered at origin, multi-material like city */}
        <mesh position={[0, 0, 0]} material={materials}>
          <boxGeometry args={[W, H, D]} />
        </mesh>

        {/* Claimed glow (neon trim around roofline) */}
        <group position={[0, -H / 2, 0]}>
          <ClaimedGlow height={H} width={W} depth={D} />
        </group>

        {/* Effects use y=0 as ground, so offset them */}
        <group position={[0, -H / 2, 0]}>
          {/* Zone items: highlight replaces equipped item in the same zone */}
          {(["crown", "roof", "aura"] as const).map((zone) => {
            const equipped = loadout[zone];
            const highlightInZone = highlightItemId && ZONE_ITEMS[zone]?.includes(highlightItemId);
            const showId = highlightInZone ? highlightItemId : equipped;
            return showId ? <EffectForItem key={zone} itemId={showId} dims={dims} /> : null;
          })}

          {/* Faces: always render if owned (same as Building3D) */}
          {ownedFacesItems.includes("led_banner") && (
            <EffectForItem itemId="led_banner" dims={dims} />
          )}
          {(billboardImages.length > 0 || ownedFacesItems.includes("billboard")) && (
            <EffectForItem itemId="billboard" dims={dims} billboardImages={billboardImages} />
          )}
        </group>
      </group>
    </>
  );
}

// ─── Canvas wrapper (default export) ─────────────────────────

export default function ShopPreview({
  loadout,
  ownedFacesItems,
  customColor,
  billboardImages,
  buildingDims,
  highlightItemId,
}: {
  loadout: { crown: string | null; roof: string | null; aura: string | null };
  ownedFacesItems: string[];
  customColor: string | null;
  billboardImages: string[];
  buildingDims?: BuildingDims;
  highlightItemId?: string | null;
}) {
  // Clamp building dims for preview (cap height, ensure min width/depth)
  const raw = buildingDims ?? DEFAULT_DIMS;
  const dims: BuildingDims = {
    width: Math.max(18, raw.width),
    height: Math.min(55, Math.max(30, raw.height)),
    depth: Math.max(14, raw.depth),
  };
  const camDist = Math.max(80, dims.height * 2.5);

  return (
    <div className="relative border-[3px] border-border" style={{ backgroundColor: THEME.fogColor }}>
      <div className="h-[280px] sm:h-[360px] lg:h-[520px]">
        <Canvas
          camera={{ position: [camDist * 0.5, camDist * 0.3, camDist * 0.7], fov: 45 }}
          gl={{ antialias: false }}
        >
          <color attach="background" args={[THEME.fogColor]} />
          <ShopPreviewScene
            loadout={loadout}
            ownedFacesItems={ownedFacesItems}
            customColor={customColor}
            billboardImages={billboardImages}
            dims={dims}
            highlightItemId={highlightItemId}
          />
        </Canvas>
      </div>
      <div className="absolute bottom-2 left-2 right-2 flex flex-col items-center gap-1 pointer-events-none">
        <span className="bg-bg/80 px-2 py-0.5 text-[9px] text-muted">
          {highlightItemId ? "PREVIEW" : "HOVER AN ITEM TO PREVIEW"}
        </span>
        <span className="bg-bg/80 px-2 py-0.5 text-[9px] text-muted normal-case">
          Scroll: zoom · Drag: rotate · Right-drag: move | 滚动：缩放 · 拖动：旋转 · 右键拖动：移动
        </span>
      </div>
    </div>
  );
}
