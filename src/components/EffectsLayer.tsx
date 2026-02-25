"use client";

import { useState, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { CityBuilding } from "@/lib/github";
import type { BuildingColors } from "./CityCanvas";
import { ClaimedGlow, BuildingItemEffects } from "./Building3D";
import { StreakFlame } from "./BuildingEffects";

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
const EFFECTS_RADIUS_HYSTERESIS = 500;
const EFFECTS_UPDATE_INTERVAL = 0.3; // seconds

// ─── Component ─────────────────────────────────────────────────

interface EffectsLayerProps {
  buildings: CityBuilding[];
  grid: GridIndex;
  colors: BuildingColors;
  accentColor: string;
  focusedBuilding?: string | null;
  introMode?: boolean;
  flyMode?: boolean;
}

export default function EffectsLayer({
  buildings,
  grid,
  colors,
  accentColor,
  focusedBuilding,
  introMode,
  flyMode,
}: EffectsLayerProps) {
  const lastUpdate = useRef(-1);
  const activeSetRef = useRef(new Set<number>());
  const [activeIndices, setActiveIndices] = useState<number[]>([]);

  const focusedLower = focusedBuilding?.toLowerCase() ?? null;
  const loginToIdx = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < buildings.length; i++) {
      map.set(buildings[i].login.toLowerCase(), i);
    }
    return map;
  }, [buildings]);

  useFrame(({ camera, clock }) => {
    if (introMode || flyMode) return; // Skip effects during intro/flight

    const elapsed = clock.elapsedTime;
    if (elapsed - lastUpdate.current < EFFECTS_UPDATE_INTERVAL) return;
    lastUpdate.current = elapsed;

    const cx = camera.position.x;
    const cz = camera.position.z;
    const candidates = querySpatialGrid(grid, cx, cz, EFFECTS_RADIUS_HYSTERESIS);

    const nearSq = EFFECTS_RADIUS * EFFECTS_RADIUS;
    const farSq = EFFECTS_RADIUS_HYSTERESIS * EFFECTS_RADIUS_HYSTERESIS;
    const newSet = new Set<number>();

    for (let c = 0; c < candidates.length; c++) {
      const idx = candidates[c];
      const b = buildings[idx];

      // Only buildings that have something to render
      const hasEffects = b.claimed || (b.owned_items && b.owned_items.length > 0) || (b.app_streak > 0);
      if (!hasEffects) continue;

      const dx = cx - b.position[0];
      const dz = cz - b.position[2];
      const distSq = dx * dx + dz * dz;

      const alreadyActive = activeSetRef.current.has(idx);
      if (distSq < nearSq || (alreadyActive && distSq < farSq)) {
        newSet.add(idx);
      }
    }

    // Always include focused building
    if (focusedLower) {
      const fi = loginToIdx.get(focusedLower);
      if (fi !== undefined) newSet.add(fi);
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

  if (introMode || flyMode) return null;

  return (
    <>
      {activeIndices.map((idx) => {
        const b = buildings[idx];
        if (!b) return null;
        const isFocused = focusedLower === b.login.toLowerCase();
        return (
          <group key={b.login} position={[b.position[0], 0, b.position[2]]}>
            {b.claimed && (
              <ClaimedGlow height={b.height} width={b.width} depth={b.depth} />
            )}
            <BuildingItemEffects
              building={b}
              accentColor={accentColor}
              focused={isFocused}
            />
            {b.app_streak > 0 && (
              <StreakFlame height={b.height} width={b.width} depth={b.depth} streakDays={b.app_streak} color={accentColor} />
            )}
          </group>
        );
      })}
    </>
  );
}
