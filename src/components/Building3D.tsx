"use client";

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import type { BuildingColors } from "./CityCanvas";
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
} from "./BuildingEffects";

// Shared constants
const WHITE = new THREE.Color("#ffffff");

// Shared unit box geometry — scaled per building, prevents 300+ geometry allocations
const SHARED_BOX_GEO = new THREE.BoxGeometry(1, 1, 1);

function createWindowTexture(
  rows: number,
  cols: number,
  litPct: number,
  seed: number,
  litColors: string[],
  offColor: string,
  faceColor: string
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

  ctx.fillStyle = faceColor;
  ctx.fillRect(0, 0, w, h);

  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = PAD + c * (WS + GAP);
      const y = PAD + r * (WS + GAP);

      if (rand() < litPct) {
        ctx.fillStyle = litColors[Math.floor(rand() * litColors.length)];
      } else {
        ctx.fillStyle = offColor;
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

// ─── Claimed Glow (neon trim + roof light) ────────────────────

function ClaimedGlow({ height, width, depth }: { height: number; width: number; depth: number }) {
  const trimRef = useRef<THREE.Group>(null);
  const frameCount = useRef(0);

  useFrame((state) => {
    if (!trimRef.current) return;
    frameCount.current++;
    if (frameCount.current % 3 !== 0) return;
    const t = state.clock.elapsedTime;
    trimRef.current.children.forEach((child) => {
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 3 + Math.sin(t * 2) * 0.8;
      }
    });
  });

  const trimThickness = 1.2;
  const trimHeight = 2;
  const accent = "#c8e64a";
  const hw = width / 2 + trimThickness / 2;
  const hd = depth / 2 + trimThickness / 2;

  return (
    <group>
      {/* Neon trim — 4 bars around the roofline */}
      <group ref={trimRef} position={[0, height - trimHeight / 2, 0]}>
        {/* Front */}
        <mesh position={[0, 0, hd]}>
          <boxGeometry args={[width + trimThickness * 2, trimHeight, trimThickness]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3} toneMapped={false} />
        </mesh>
        {/* Back */}
        <mesh position={[0, 0, -hd]}>
          <boxGeometry args={[width + trimThickness * 2, trimHeight, trimThickness]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3} toneMapped={false} />
        </mesh>
        {/* Left */}
        <mesh position={[-hw, 0, 0]}>
          <boxGeometry args={[trimThickness, trimHeight, depth]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3} toneMapped={false} />
        </mesh>
        {/* Right */}
        <mesh position={[hw, 0, 0]}>
          <boxGeometry args={[trimThickness, trimHeight, depth]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3} toneMapped={false} />
        </mesh>
      </group>

    </group>
  );
}

// ─── Label as CanvasTexture Sprite (no DOM, no useFrame) ─────

function createLabelTexture(building: CityBuilding): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "rgba(10, 10, 14, 0.88)";
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 6);
  ctx.fill();

  // Border
  ctx.strokeStyle = building.claimed ? "rgba(200, 230, 74, 0.6)" : "rgba(100, 100, 120, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 6);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Username
  ctx.font = 'bold 26px "Silkscreen", monospace';
  ctx.fillStyle = "#e8dcc8";
  ctx.shadowColor = "rgba(200, 230, 74, 0.4)";
  ctx.shadowBlur = 8;
  ctx.fillText(`@${building.login.toUpperCase()}`, W / 2, 11);

  // Reset shadow
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 2;

  // Rank + contributions
  ctx.font = '18px "Silkscreen", monospace';
  ctx.fillStyle = "#a0a0b0";
  ctx.fillText(
    `#${building.rank} · ${building.contributions.toLocaleString()} CONTRIBUTIONS`,
    W / 2,
    45
  );

  // Repos + stars + claimed badge
  let repoLine = `${building.public_repos} REPOS`;
  if (building.total_stars > 0) repoLine += ` · ${building.total_stars} ★`;
  ctx.fillText(repoLine, W / 2, 72);

  // Claimed badge
  if (building.claimed) {
    const badgeText = "CLAIMED";
    ctx.font = 'bold 14px "Silkscreen", monospace';
    const metrics = ctx.measureText(badgeText);
    const bw = metrics.width + 10;
    const bh = 17;
    const bx = W / 2 - bw / 2;
    const by = 98;
    ctx.fillStyle = "#c8e64a";
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 2);
    ctx.fill();
    ctx.fillStyle = "#0d0d0f";
    ctx.textBaseline = "top";
    ctx.fillText(badgeText, W / 2, by + 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Building Animation (separate component, unmounts when done) ─

function BuildingRiseAnimation({
  height,
  meshRef,
  spriteRef,
}: {
  height: number;
  meshRef: React.RefObject<THREE.Mesh | null>;
  spriteRef: React.RefObject<THREE.Sprite | null>;
}) {
  const progress = useRef(0);
  const done = useRef(false);

  useFrame((_, delta) => {
    if (done.current) return;

    progress.current = Math.min(1, progress.current + delta * 1.2);
    const t = 1 - Math.pow(1 - progress.current, 3);

    if (meshRef.current) {
      meshRef.current.scale.y = Math.max(0.001, t * height);
      meshRef.current.position.y = (height * t) / 2;
    }
    if (spriteRef.current) {
      spriteRef.current.position.y = height * t + 20;
    }

    if (progress.current >= 1) {
      done.current = true;
    }
  });

  return null;
}

// ─── Focus Highlight (batman spotlight + beacon) ─────────────

const BEACON_HEIGHT = 500;
const SPOTLIGHT_Y = 400; // cone origin high above

function FocusBeacon({ height, width, depth, accentColor }: { height: number; width: number; depth: number; accentColor: string }) {
  const coneRef = useRef<THREE.Mesh>(null);
  const markerRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Cone pulse
    if (coneRef.current) {
      (coneRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.10 + Math.sin(t * 1.5) * 0.03;
    }
    // Marker bob + spin
    if (markerRef.current) {
      markerRef.current.position.y = height + 35 + Math.sin(t * 2) * 5;
      markerRef.current.rotation.y = t * 1.5;
    }
  });

  const coneRadius = Math.max(width, depth) * 1.2;

  return (
    <group>
      {/* Batman spotlight cone from sky */}
      <mesh ref={coneRef} position={[0, SPOTLIGHT_Y / 2, 0]}>
        <cylinderGeometry args={[0, coneRadius, SPOTLIGHT_Y, 32, 1, true]} />
        <meshBasicMaterial
          color={accentColor}
          transparent
          opacity={0.10}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Thin bright core beam */}
      <mesh position={[0, BEACON_HEIGHT / 2, 0]}>
        <boxGeometry args={[2, BEACON_HEIGHT, 2]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.3} depthWrite={false} />
      </mesh>

      {/* Floating diamond marker */}
      <group ref={markerRef} position={[0, height + 35, 0]}>
        <mesh>
          <octahedronGeometry args={[6, 0]} />
          <meshBasicMaterial color={accentColor} />
        </mesh>
        <mesh scale={[1.6, 1.6, 1.6]}>
          <octahedronGeometry args={[6, 0]} />
          <meshBasicMaterial color={accentColor} transparent opacity={0.15} />
        </mesh>
        <pointLight color={accentColor} intensity={80} distance={150} />
      </group>
    </group>
  );
}

// ─── Main Building Component ─────────────────────────────────

interface Props {
  building: CityBuilding;
  colors: BuildingColors;
  focused?: boolean;
  dimmed?: boolean;
  accentColor?: string;
  onClick?: (building: CityBuilding) => void;
}

export default function Building3D({ building, colors, focused, dimmed, accentColor, onClick }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const spriteRef = useRef<THREE.Sprite>(null);

  const textures = useMemo(() => {
    const seed =
      building.login.split("").reduce((a, c) => a + c.charCodeAt(0), 0) *
      137;
    // custom_color overrides building face color
    const faceColor = building.custom_color ?? colors.face;
    const front = createWindowTexture(
      building.floors,
      building.windowsPerFloor,
      building.litPercentage,
      seed,
      colors.windowLit,
      colors.windowOff,
      faceColor
    );
    const side = createWindowTexture(
      building.floors,
      building.sideWindowsPerFloor,
      building.litPercentage,
      seed + 7919,
      colors.windowLit,
      colors.windowOff,
      faceColor
    );
    return { front, side };
  }, [building, colors]);

  useEffect(() => {
    return () => {
      textures.front.dispose();
      textures.side.dispose();
    };
  }, [textures]);

  const materials = useMemo(() => {
    const roof = new THREE.MeshStandardMaterial({
      color: colors.roof,
      emissive: new THREE.Color(colors.roof),
      emissiveIntensity: 1.5,
      roughness: 0.6,
    });
    const make = (tex: THREE.CanvasTexture) =>
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: WHITE,
        emissiveMap: tex,
        emissiveIntensity: 2.0,
        roughness: 0.85,
        metalness: 0,
      });
    return [
      make(textures.side),
      make(textures.side),
      roof,
      roof,
      make(textures.front),
      make(textures.front),
    ];
  }, [textures, colors.roof]);

  const labelTexture = useMemo(
    () => createLabelTexture(building),
    [building]
  );

  useEffect(() => {
    return () => labelTexture.dispose();
  }, [labelTexture]);

  const labelMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
        depthTest: true,
        sizeAttenuation: true,
        fog: true,
      }),
    [labelTexture]
  );

  // Dispose materials + label material on unmount/change
  useEffect(() => {
    return () => {
      for (const mat of materials) mat.dispose();
      labelMaterial.dispose();
    };
  }, [materials, labelMaterial]);

  // Dim/undim building when another is focused
  useEffect(() => {
    for (const mat of materials) {
      mat.transparent = dimmed || false;
      mat.opacity = dimmed ? 0.55 : 1;
      mat.emissiveIntensity = dimmed ? 0.3 : (mat.map ? 2.0 : 1.5);
    }
    labelMaterial.opacity = dimmed ? 0.15 : 1;
    // Reset group visibility when un-dimming
    if (!dimmed && groupRef.current) {
      groupRef.current.visible = true;
    }
  }, [dimmed, materials, labelMaterial]);

  return (
    <group ref={groupRef} position={[building.position[0], 0, building.position[2]]}>
      <mesh
        ref={meshRef}
        material={materials}
        geometry={SHARED_BOX_GEO}
        scale={[building.width, 0.001, building.depth]}
        dispose={null}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(building);
        }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "auto"; }}
      />

      <sprite
        ref={spriteRef}
        material={labelMaterial}
        position={[0, building.height + 20, 0]}
        scale={[28, 7, 1]}
      />

      <BuildingRiseAnimation
        height={building.height}
        meshRef={meshRef}
        spriteRef={spriteRef}
      />

      {building.claimed && <ClaimedGlow height={building.height} width={building.width} depth={building.depth} />}

      {focused && <FocusBeacon height={building.height} width={building.width} depth={building.depth} accentColor={accentColor ?? "#c8e64a"} />}

      {/* Purchased effects */}
      {building.owned_items?.includes("neon_outline") && (
        <NeonOutline width={building.width} height={building.height} depth={building.depth} />
      )}
      {building.owned_items?.includes("particle_aura") && (
        <ParticleAura width={building.width} height={building.height} depth={building.depth} />
      )}
      {building.owned_items?.includes("spotlight") && (
        <SpotlightEffect height={building.height} width={building.width} depth={building.depth} />
      )}
      {building.owned_items?.includes("rooftop_fire") && (
        <RooftopFire height={building.height} width={building.width} depth={building.depth} />
      )}
      {building.owned_items?.includes("helipad") && (
        <Helipad height={building.height} width={building.width} depth={building.depth} />
      )}
      {building.owned_items?.includes("antenna_array") && (
        <AntennaArray height={building.height} />
      )}
      {building.owned_items?.includes("rooftop_garden") && (
        <RooftopGarden height={building.height} width={building.width} depth={building.depth} />
      )}
      {building.owned_items?.includes("spire") && (
        <Spire height={building.height} width={building.width} depth={building.depth} />
      )}
      {building.owned_items?.includes("billboard") && (
        <Billboards height={building.height} width={building.width} depth={building.depth} images={building.billboard_images ?? []} />
      )}
      {building.owned_items?.includes("flag") && (
        <Flag height={building.height} />
      )}
    </group>
  );
}
