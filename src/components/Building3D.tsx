"use client";

import { useMemo, useRef, useEffect, memo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import type { BuildingColors } from "./CityCanvas";
import { ZONE_ITEMS } from "@/lib/zones";
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
  StreakFlame,
} from "./BuildingEffects";
import { MiniWhiteRabbit } from "./WhiteRabbit";

// Shared constants
const WHITE = new THREE.Color("#ffffff");

// Shared unit box geometry — scaled per building, prevents 300+ geometry allocations
const SHARED_BOX_GEO = new THREE.BoxGeometry(1, 1, 1);

// ─── Window Atlas ────────────────────────────────────────────
// ONE 2048x2048 texture with 6 lit-percentage bands of 42 rows each.
// Buildings clone this and use offset/repeat to pick their unique region.
const ATLAS_SIZE = 2048;
const ATLAS_CELL = 8; // 6px window + 2px gap
const ATLAS_COLS = ATLAS_SIZE / ATLAS_CELL; // 256
const ATLAS_BAND_ROWS = 42;
const ATLAS_LIT_PCTS = [0.2, 0.35, 0.5, 0.65, 0.8, 0.95];

// Parse hex/named color to ABGR uint32 for direct pixel writes (little-endian)
function colorToABGR(hex: string): number {
  const c = new THREE.Color(hex);
  return (
    255 << 24 |
    (Math.round(c.b * 255) << 16) |
    (Math.round(c.g * 255) << 8) |
    Math.round(c.r * 255)
  );
}

export function createWindowAtlas(colors: BuildingColors): THREE.CanvasTexture {
  const WS = 6;
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext("2d")!;

  // Use ImageData + Uint32Array for direct pixel writes (10-50x faster than fillRect)
  const imageData = ctx.createImageData(ATLAS_SIZE, ATLAS_SIZE);
  const buf32 = new Uint32Array(imageData.data.buffer);

  const faceABGR = colorToABGR(colors.face);
  const litABGRs = colors.windowLit.map(colorToABGR);
  const offABGR = colorToABGR(colors.windowOff);

  // Fill background with face color
  buf32.fill(faceABGR);

  let s = 42;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  for (let band = 0; band < ATLAS_LIT_PCTS.length; band++) {
    const litPct = ATLAS_LIT_PCTS[band];
    const bandStart = band * ATLAS_BAND_ROWS;
    for (let r = 0; r < ATLAS_BAND_ROWS; r++) {
      const rowY = (bandStart + r) * ATLAS_CELL;
      for (let c = 0; c < ATLAS_COLS; c++) {
        const px = c * ATLAS_CELL;
        const abgr = rand() < litPct
          ? litABGRs[Math.floor(rand() * litABGRs.length)]
          : offABGR;
        // Write WS×WS pixel block directly
        for (let dy = 0; dy < WS; dy++) {
          const rowOffset = (rowY + dy) * ATLAS_SIZE + px;
          for (let dx = 0; dx < WS; dx++) {
            buf32[rowOffset + dx] = abgr;
          }
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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

export const ClaimedGlow = memo(function ClaimedGlow({ height, width, depth }: { height: number; width: number; depth: number }) {
  const trimThickness = 1.2;
  const trimHeight = 2;
  const accent = "#c8e64a";
  const hw = width / 2 + trimThickness / 2;
  const hd = depth / 2 + trimThickness / 2;

  return (
    <group>
      {/* Neon trim — 4 bars around the roofline */}
      <group position={[0, height - trimHeight / 2, 0]}>
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
});

// ─── Multi-Level Labels ──────────────────────────────────────

/** Level 1: Far — just @USERNAME (512x80, semi-transparent bg for readability) */
function createFarLabel(building: CityBuilding): THREE.CanvasTexture {
  const W = 512;
  const H = 80;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const login = building.login.length > 16
    ? building.login.slice(0, 16).toUpperCase() + "..."
    : building.login.toUpperCase();
  const text = `@${login}`;

  ctx.font = 'bold 40px "Silkscreen", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Semi-transparent background pill for contrast
  const textWidth = ctx.measureText(text).width;
  const padX = 20;
  const padY = 8;
  const bgW = textWidth + padX * 2;
  const bgH = 48 + padY * 2;
  const bgX = (W - bgW) / 2;
  const bgY = (H - bgH) / 2;
  ctx.fillStyle = "rgba(10, 10, 14, 0.65)";
  ctx.beginPath();
  ctx.roundRect(bgX, bgY, bgW, bgH, 6);
  ctx.fill();

  if (building.claimed) {
    ctx.fillStyle = "#e8dcc8";
    ctx.shadowColor = "rgba(200, 230, 74, 0.5)";
    ctx.shadowBlur = 8;
  } else {
    ctx.fillStyle = "rgba(140, 140, 160, 0.6)";
  }

  ctx.fillText(text, W / 2, H / 2);

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

export function FocusBeacon({ height, width, depth, accentColor }: { height: number; width: number; depth: number; accentColor: string }) {
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
      </group>
    </group>
  );
}

// ─── Main Building Component ─────────────────────────────────

// ─── Loadout-Aware Effect Rendering ──────────────────────────

export const BuildingItemEffects = memo(function BuildingItemEffects({ building, accentColor, focused }: { building: CityBuilding; accentColor: string; focused?: boolean }) {
  const { height, width, depth, owned_items, loadout, billboard_images } = building;
  const items = owned_items ?? [];

  // Zone definitions (from shared constants)
  const crownItems = ZONE_ITEMS.crown;
  const roofItems = ZONE_ITEMS.roof;
  const auraItems = ZONE_ITEMS.aura;

  // Without a loadout, only render flag (free claim item). All other items require explicit equip.
  const hasLoadout = loadout && (loadout.crown || loadout.roof || loadout.aura);
  const crownItem = hasLoadout ? loadout.crown : (items.includes("flag") ? "flag" : null);
  const roofItem = hasLoadout ? loadout.roof : null;
  const auraItem = hasLoadout ? loadout.aura : null;

  const shouldRender = (itemId: string) => {
    if (!items.includes(itemId)) return false;
    return true; // Faces zone items always render if owned
  };

  const shouldRenderZone = (itemId: string) => {
    if (!items.includes(itemId)) return false;
    if (crownItems.includes(itemId)) return crownItem === itemId;
    if (roofItems.includes(itemId)) return roofItem === itemId;
    if (auraItems.includes(itemId)) return auraItem === itemId;
    return true;
  };

  return (
    <>
      {/* Aura zone */}
      {shouldRenderZone("neon_outline") && (
        <NeonOutline width={width} height={height} depth={depth} color={accentColor} />
      )}
      {shouldRenderZone("particle_aura") && (
        <ParticleAura width={width} height={height} depth={depth} color={accentColor} />
      )}
      {shouldRenderZone("spotlight") && (
        <SpotlightEffect height={height} width={width} depth={depth} color={accentColor} />
      )}

      {/* Roof zone */}
      {shouldRenderZone("rooftop_fire") && (
        <RooftopFire height={height} width={width} depth={depth} />
      )}
      {shouldRenderZone("antenna_array") && (
        <AntennaArray height={height} width={width} depth={depth} />
      )}
      {shouldRenderZone("rooftop_garden") && (
        <RooftopGarden height={height} width={width} depth={depth} />
      )}

      {/* Crown zone */}
      {shouldRenderZone("helipad") && (
        <Helipad height={height} width={width} depth={depth} />
      )}
      {shouldRenderZone("spire") && (
        <Spire height={height} width={width} depth={depth} />
      )}
      {shouldRenderZone("flag") && (
        <Flag height={height} width={width} depth={depth} color={accentColor} />
      )}

      {/* New aura zone items */}
      {shouldRenderZone("neon_trim") && (
        <NeonTrim width={width} height={height} depth={depth} color={accentColor} />
      )}
      {shouldRenderZone("hologram_ring") && (
        <HologramRing width={width} height={height} depth={depth} color={accentColor} />
      )}
      {shouldRenderZone("lightning_aura") && (
        <LightningAura width={width} height={height} depth={depth} color={accentColor} />
      )}

      {/* New crown zone items */}
      {shouldRenderZone("satellite_dish") && (
        <SatelliteDish height={height} width={width} depth={depth} color={accentColor} />
      )}
      {shouldRenderZone("crown_item") && (
        <CrownItem height={height} color={accentColor} focused={focused} />
      )}
      {/* White rabbit: always renders for completers, not tied to loadout */}
      {building.rabbit_completed && (
        <MiniWhiteRabbit height={height} width={width} depth={depth} />
      )}

      {/* New roof zone items */}
      {shouldRenderZone("pool_party") && (
        <PoolParty height={height} width={width} depth={depth} />
      )}

      {/* Faces zone (always render if owned) */}
      {shouldRender("billboard") && (
        <Billboards height={height} width={width} depth={depth} images={billboard_images ?? []} color={accentColor} />
      )}
      {shouldRender("led_banner") && (
        <LEDBanner height={height} width={width} depth={depth} color={accentColor} />
      )}
    </>
  );
});

// ─── Main Building Component ─────────────────────────────────

interface Props {
  building: CityBuilding;
  colors: BuildingColors;
  atlasTexture: THREE.CanvasTexture;
  introMode?: boolean;
  focused?: boolean;
  dimmed?: boolean;
  accentColor?: string;
  onClick?: (building: CityBuilding) => void;
}

export default function Building3D({ building, colors, atlasTexture, introMode, focused, dimmed, accentColor, onClick }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  const textures = useMemo(() => {
    const seed =
      building.login.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 137;

    // Custom color buildings: per-building canvas textures (rare, <5%)
    // Blend custom color 50% with theme face color to prevent glaring brightness
    if (building.custom_color) {
      const blended = new THREE.Color(colors.face)
        .lerp(new THREE.Color(building.custom_color), 0.5);
      const blendedHex = '#' + blended.getHexString();
      const front = createWindowTexture(
        building.floors,
        building.windowsPerFloor,
        building.litPercentage,
        seed,
        colors.windowLit,
        colors.windowOff,
        blendedHex
      );
      const side = createWindowTexture(
        building.floors,
        building.sideWindowsPerFloor,
        building.litPercentage,
        seed + 7919,
        colors.windowLit,
        colors.windowOff,
        blendedHex
      );
      return { front, side };
    }

    // Atlas-based textures (lightweight clones, shared GPU source)
    const bandIndex = Math.min(5, Math.max(0, Math.round(building.litPercentage * 5)));
    const bandRowOffset = bandIndex * ATLAS_BAND_ROWS;

    const frontColStart = Math.abs(seed % Math.max(1, ATLAS_COLS - building.windowsPerFloor));
    const front = atlasTexture.clone();
    front.offset.set(frontColStart / ATLAS_COLS, bandRowOffset / ATLAS_COLS);
    front.repeat.set(building.windowsPerFloor / ATLAS_COLS, building.floors / ATLAS_COLS);

    const sideColStart = Math.abs((seed + 7919) % Math.max(1, ATLAS_COLS - building.sideWindowsPerFloor));
    const side = atlasTexture.clone();
    side.offset.set(sideColStart / ATLAS_COLS, bandRowOffset / ATLAS_COLS);
    side.repeat.set(building.sideWindowsPerFloor / ATLAS_COLS, building.floors / ATLAS_COLS);

    return { front, side };
  }, [building, colors, atlasTexture]);

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
    const emIntensity = building.custom_color ? 1.5 : 2.0;
    const make = (tex: THREE.CanvasTexture) =>
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: WHITE,
        emissiveMap: tex,
        emissiveIntensity: emIntensity,
        roughness: 0.85,
        metalness: 0,
      });
    // Reuse material instances for opposite faces (5 allocs -> 3)
    const side = make(textures.side);
    const front = make(textures.front);
    return [side, side, roof, roof, front, front];
  }, [textures, colors.roof]);

  // Defer label creation until intro is done (saves 160KB+ canvas work per building)
  const labelTexture = useMemo(
    () => introMode ? null : createFarLabel(building),
    [building, introMode]
  );

  useEffect(() => {
    return () => { labelTexture?.dispose(); };
  }, [labelTexture]);

  const labelMaterial = useMemo(
    () =>
      labelTexture
        ? new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            depthTest: true,
            sizeAttenuation: true,
            fog: true,
          })
        : null,
    [labelTexture]
  );

  // Dispose materials + label material on unmount/change
  useEffect(() => {
    return () => {
      for (const mat of materials) mat.dispose();
      labelMaterial?.dispose();
    };
  }, [materials, labelMaterial]);

  // Dim/undim building when another is focused
  useEffect(() => {
    for (const mat of materials) {
      mat.transparent = dimmed || false;
      mat.opacity = dimmed ? 0.55 : 1;
      mat.emissiveIntensity = dimmed ? 0.3 : (mat.map ? 2.0 : 1.5);
    }
    if (labelMaterial) {
      labelMaterial.opacity = focused ? 0 : dimmed ? 0.15 : 1;
    }
    if (spriteRef.current) spriteRef.current.visible = !focused;
    // Reset group visibility when un-dimming
    if (!dimmed && groupRef.current) {
      groupRef.current.visible = true;
    }
  }, [focused, dimmed, materials, labelMaterial]);

  return (
    <group ref={groupRef} position={[building.position[0], 0, building.position[2]]}>
      <mesh
        ref={meshRef}
        material={materials}
        geometry={SHARED_BOX_GEO}
        scale={[building.width, 0.001, building.depth]}
        dispose={null}
        onPointerDown={introMode ? undefined : (e) => {
          pointerDown.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={introMode ? undefined : (e) => {
          e.stopPropagation();
          if (!pointerDown.current) return;
          const dx = e.clientX - pointerDown.current.x;
          const dy = e.clientY - pointerDown.current.y;
          if (dx * dx + dy * dy > 25) return; // >5px = drag, not click
          onClick?.(building);
        }}
        onPointerOver={introMode ? undefined : () => { document.body.style.cursor = "pointer"; }}
        onPointerOut={introMode ? undefined : () => { document.body.style.cursor = "auto"; }}
      />

      {labelMaterial && (
        <sprite
          ref={spriteRef}
          material={labelMaterial}
          position={[0, building.height + 20, 0]}
          scale={[32, 5, 1]}
        />
      )}

      <BuildingRiseAnimation
        height={building.height}
        meshRef={meshRef}
        spriteRef={spriteRef}
      />

      {/* Skip heavy effects during intro - camera moves too fast to see them */}
      {!introMode && building.claimed && <ClaimedGlow height={building.height} width={building.width} depth={building.depth} />}

      {!introMode && focused && <FocusBeacon height={building.height} width={building.width} depth={building.depth} accentColor={accentColor ?? "#c8e64a"} />}

      {!introMode && (
        <BuildingItemEffects building={building} accentColor={accentColor ?? colors.accent ?? "#c8e64a"} focused={focused} />
      )}

      {!introMode && building.app_streak > 0 && (
        <StreakFlame height={building.height} width={building.width} depth={building.depth} streakDays={building.app_streak} color={accentColor ?? colors.accent ?? "#c8e64a"} />
      )}
    </group>
  );
}
