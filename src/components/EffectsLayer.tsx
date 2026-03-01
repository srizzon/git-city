"use client";

import { useState, useRef, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import type { CityBuilding } from "@/lib/github";
import type { BuildingColors } from "./CityCanvas";
import { ClaimedGlow, BuildingItemEffects } from "./Building3D";
import { StreakFlame, NeonOutline, ParticleAura, SpotlightEffect } from "./BuildingEffects";
import RaidTag3D from "./RaidTag3D";

// ─── Memoized per-building effects ────────────────────────────

const ActiveBuildingEffects = memo(function ActiveBuildingEffects({
  building,
  accentColor,
  isFocused,
  isDimmed,
  isGhostTarget,
  ghostEffectId,
}: {
  building: CityBuilding;
  accentColor: string;
  isFocused: boolean;
  isDimmed: boolean;
  isGhostTarget: boolean;
  ghostEffectId: number;
}) {
  return (
    <group position={[building.position[0], 0, building.position[2]]} visible={!isDimmed}>
      {building.claimed && (
        <ClaimedGlow height={building.height} width={building.width} depth={building.depth} />
      )}
      <BuildingItemEffects
        building={building}
        accentColor={accentColor}
        focused={isFocused}
      />
      {isGhostTarget && (
        ghostEffectId === 0
          ? <NeonOutline width={building.width} height={building.height} depth={building.depth} color={accentColor} />
          : ghostEffectId === 1
          ? <ParticleAura width={building.width} height={building.height} depth={building.depth} color={accentColor} />
          : <SpotlightEffect height={building.height} width={building.width} depth={building.depth} color={accentColor} />
      )}
      {building.app_streak > 0 && (
        <StreakFlame height={building.height} width={building.width} depth={building.depth} streakDays={building.app_streak} color={accentColor} />
      )}
      {building.active_raid_tag && (
        <RaidTag3D
          width={building.width}
          height={building.height}
          depth={building.depth}
          attackerLogin={building.active_raid_tag.attacker_login}
          tagStyle={building.active_raid_tag.tag_style}
        />
      )}
    </group>
  );
});

// ─── Spatial Grid (same structure as CityScene) ────────────────

interface GridIndex {
  cells: Map<string, number[]>;
  cellSize: number;
}

function querySpatialGrid(grid: GridIndex, x: number, z: number, radius: number): number[] {
  const result: number[] = [];
  const minCx = Math.floor((x - radius) / grid.cellSize);
  const maxCx = Math.floor((x + radius) / grid.cellSize);
  const minCz = Math.floor((z - radius) / grid.cellSize);
  const maxCz = Math.floor((z + radius) / grid.cellSize);
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      const arr = grid.cells.get(`${cx},${cz}`);
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          result.push(arr[i]);
        }
      }
    }
  }
  return result;
}

// ─── Constants ─────────────────────────────────────────────────

const EFFECTS_RADIUS = 400;
const EFFECTS_RADIUS_HYSTERESIS = 480;
const EFFECTS_UPDATE_INTERVAL = 0.3; // seconds
const MAX_ACTIVE_EFFECTS = 40;

// ─── Component ─────────────────────────────────────────────────

interface EffectsLayerProps {
  buildings: CityBuilding[];
  grid: GridIndex;
  colors: BuildingColors;
  accentColor: string;
  focusedBuilding?: string | null;
  focusedBuildingB?: string | null;
  hideEffectsFor?: string | null;
  introMode?: boolean;
  flyMode?: boolean;
  ghostPreviewLogin?: string | null;
}

export default function EffectsLayer({
  buildings,
  grid,
  colors,
  accentColor,
  focusedBuilding,
  focusedBuildingB,
  hideEffectsFor,
  introMode,
  flyMode,
  ghostPreviewLogin,
}: EffectsLayerProps) {
  const lastUpdate = useRef(-1);
  const activeSetRef = useRef(new Set<number>());
  const [activeIndices, setActiveIndices] = useState<number[]>([]);
  const prevCamPos = useRef<[number, number]>([0, 0]);
  const prevCamTime = useRef(0);
  const smoothVel = useRef<[number, number]>([0, 0]);

  const focusedLower = focusedBuilding?.toLowerCase() ?? null;
  const focusedBLower = focusedBuildingB?.toLowerCase() ?? null;
  const hideLower = hideEffectsFor?.toLowerCase() ?? null;
  const loginToIdx = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < buildings.length; i++) {
      map.set(buildings[i].login.toLowerCase(), i);
    }
    return map;
  }, [buildings]);

  useFrame(({ camera, clock }) => {
    if (introMode) return; // Skip effects during intro

    const elapsed = clock.elapsedTime;
    const interval = flyMode ? 0.15 : EFFECTS_UPDATE_INTERVAL;
    if (elapsed - lastUpdate.current < interval) return;
    lastUpdate.current = elapsed;

    const rawCx = camera.position.x;
    const rawCz = camera.position.z;
    let cx = rawCx;
    let cz = rawCz;

    // In fly mode, predict ahead using smoothed velocity so effects pre-load without flickering
    const dt = elapsed - prevCamTime.current;
    if (flyMode && dt > 0.01) {
      const vxRaw = (rawCx - prevCamPos.current[0]) / dt;
      const vzRaw = (rawCz - prevCamPos.current[1]) / dt;
      // Exponential moving average to avoid jitter on turns
      const SMOOTH = 0.3;
      smoothVel.current[0] += (vxRaw - smoothVel.current[0]) * SMOOTH;
      smoothVel.current[1] += (vzRaw - smoothVel.current[1]) * SMOOTH;
      const LOOK_AHEAD_SECS = 2.0;
      cx += smoothVel.current[0] * LOOK_AHEAD_SECS;
      cz += smoothVel.current[1] * LOOK_AHEAD_SECS;
    }
    prevCamPos.current[0] = rawCx;
    prevCamPos.current[1] = rawCz;
    prevCamTime.current = elapsed;

    // Wider hysteresis in fly mode so buildings stay active longer once loaded
    const flyHyst = flyMode ? 450 : EFFECTS_RADIUS_HYSTERESIS;
    const candidates = querySpatialGrid(grid, cx, cz, flyHyst);

    const nearSq = EFFECTS_RADIUS * EFFECTS_RADIUS;
    const farSq = flyHyst * flyHyst;
    const newSet = new Set<number>();

    for (let c = 0; c < candidates.length; c++) {
      const idx = candidates[c];
      const b = buildings[idx];

      // Only buildings that have something to render
      const hasEffects = b.claimed || (b.owned_items && b.owned_items.length > 0) || (b.app_streak > 0) || !!b.active_raid_tag || b.rabbit_completed;
      if (!hasEffects) continue;

      const dx = cx - b.position[0];
      const dz = cz - b.position[2];
      const distSq = dx * dx + dz * dz;

      const alreadyActive = activeSetRef.current.has(idx);
      if (distSq < nearSq || (alreadyActive && distSq < farSq)) {
        newSet.add(idx);
      }
    }

    // Always include focused buildings
    if (focusedLower) {
      const fi = loginToIdx.get(focusedLower);
      if (fi !== undefined) newSet.add(fi);
    }
    if (focusedBLower) {
      const fi = loginToIdx.get(focusedBLower);
      if (fi !== undefined) newSet.add(fi);
    }

    // Cap at MAX_ACTIVE_EFFECTS — keep closest buildings
    if (newSet.size > MAX_ACTIVE_EFFECTS) {
      const withDist = Array.from(newSet).map((idx) => {
        const b = buildings[idx];
        const dx = cx - b.position[0];
        const dz = cz - b.position[2];
        return { idx, distSq: dx * dx + dz * dz };
      });
      withDist.sort((a, b) => a.distSq - b.distSq);
      newSet.clear();
      for (let i = 0; i < MAX_ACTIVE_EFFECTS && i < withDist.length; i++) {
        newSet.add(withDist[i].idx);
      }
      // Re-add focused buildings (always visible)
      if (focusedLower) {
        const fi = loginToIdx.get(focusedLower);
        if (fi !== undefined) newSet.add(fi);
      }
      if (focusedBLower) {
        const fi = loginToIdx.get(focusedBLower);
        if (fi !== undefined) newSet.add(fi);
      }
    }

    // Check if changed
    let changed = newSet.size !== activeSetRef.current.size;
    if (!changed) {
      for (const idx of newSet) {
        if (!activeSetRef.current.has(idx)) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      activeSetRef.current = newSet;
      setActiveIndices(Array.from(newSet));
    }
  });

  // A8: Ghost preview — pick a random aura effect based on login hash
  const ghostLower = ghostPreviewLogin?.toLowerCase() ?? null;
  const ghostIdx = ghostLower ? loginToIdx.get(ghostLower) : undefined;
  const ghostBuilding = ghostIdx != null ? buildings[ghostIdx] : null;
  const ghostEffectId = useMemo(() => {
    if (!ghostLower) return 0;
    let h = 0;
    for (let i = 0; i < ghostLower.length; i++) h = (h * 31 + ghostLower.charCodeAt(i)) | 0;
    return Math.abs(h) % 3; // 0=NeonOutline, 1=ParticleAura, 2=Spotlight
  }, [ghostLower]);

  if (introMode) return null;

  return (
    <>
      {activeIndices.map((idx) => {
        const b = buildings[idx];
        if (!b) return null;
        const loginLower = b.login.toLowerCase();
        if (hideLower === loginLower) return null;
        const isFocused = focusedLower === loginLower || focusedBLower === loginLower;
        const isDimmed = !!focusedLower && !isFocused;
        const isGhostTarget = ghostLower === loginLower;
        return (
          <ActiveBuildingEffects
            key={b.login}
            building={b}
            accentColor={accentColor}
            isFocused={isFocused}
            isDimmed={isDimmed}
            isGhostTarget={isGhostTarget}
            ghostEffectId={ghostEffectId}
          />
        );
      })}
      {/* A8: Ghost preview for building not in active set (force render) */}
      {ghostBuilding && ghostIdx != null && !activeIndices.includes(ghostIdx) && (
        <group position={[ghostBuilding.position[0], 0, ghostBuilding.position[2]]}>
          {ghostEffectId === 0
            ? <NeonOutline width={ghostBuilding.width} height={ghostBuilding.height} depth={ghostBuilding.depth} color={accentColor} />
            : ghostEffectId === 1
            ? <ParticleAura width={ghostBuilding.width} height={ghostBuilding.height} depth={ghostBuilding.depth} color={accentColor} />
            : <SpotlightEffect height={ghostBuilding.height} width={ghostBuilding.width} depth={ghostBuilding.depth} color={accentColor} />
          }
        </group>
      )}
    </>
  );
}
