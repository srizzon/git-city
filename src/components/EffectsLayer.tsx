"use client";

import { useState, useRef, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import type { BuildingColors } from "./CityCanvas";
import { BuildingItemEffects, showsFlag } from "./Building3D";
import { NeonOutline, ParticleAura, SpotlightEffect } from "./BuildingEffects";
import InstancedEffects from "./InstancedEffects";
import RaidTag3D from "./RaidTag3D";
import LeagueCrown3D from "./LeagueCrown3D";

// ─── Memoized per-building effects ────────────────────────────

const ActiveBuildingEffects = memo(function ActiveBuildingEffects({
  building,
  accentColor,
  isFocused,
  isDimmed,
  isGhostTarget,
  ghostEffectId,
  tagAsPanel,
}: {
  building: CityBuilding;
  accentColor: string;
  isFocused: boolean;
  isDimmed: boolean;
  isGhostTarget: boolean;
  ghostEffectId: number;
  /** Raid tag drawn as an instanced far panel instead of the LED text. */
  tagAsPanel: boolean;
}) {
  return (
    <group position={[building.position[0], 0, building.position[2]]} visible={!isDimmed}>
      {/* Claimed trim, streak strips and the flag are drawn by InstancedEffects. */}
      <BuildingItemEffects
        building={building}
        accentColor={accentColor}
        focused={isFocused}
        skipFlag
      />
      {isGhostTarget && (
        ghostEffectId === 0
          ? <NeonOutline width={building.width} height={building.height} depth={building.depth} color={accentColor} />
          : ghostEffectId === 1
          ? <ParticleAura width={building.width} height={building.height} depth={building.depth} color={accentColor} />
          : <SpotlightEffect height={building.height} width={building.width} depth={building.depth} color={accentColor} />
      )}
      {building.active_raid_tag && !tagAsPanel && (
        <RaidTag3D
          width={building.width}
          height={building.height}
          depth={building.depth}
          attackerLogin={building.active_raid_tag.attacker_login}
          tagStyle={building.active_raid_tag.tag_style}
        />
      )}
      {building.active_league_crown && (
        <LeagueCrown3D width={building.width} height={building.height} depth={building.depth} />
      )}
    </group>
  );
});

// ─── Spatial Grid (same structure as CityScene) ────────────────

interface GridIndex {
  // Integer-keyed cells (cx * 4096 + cz). Skipping string keys saves a
  // template-literal allocation per visited cell — at ~3Hz over hundreds of
  // cells that was a steady GC drip.
  cells: Map<number, number[]>;
  cellSize: number;
}

// Reused result buffer — callers iterate immediately and never store the ref.
const _gridResultPool: number[] = [];
// Reused math for camera-look + frustum culling (no per-frame allocations).
const _camFwd = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _projScreen = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
// Per-frame distance² from the look target per candidate, used to rank the
// budget (nearest to where you're looking wins). Reused to avoid allocation.
const _scoreByIdx = new Map<number, number>();
const _pxByIdx = new Map<number, number>();

function querySpatialGrid(grid: GridIndex, x: number, z: number, radius: number): number[] {
  const result = _gridResultPool;
  result.length = 0;
  const minCx = Math.floor((x - radius) / grid.cellSize);
  const maxCx = Math.floor((x + radius) / grid.cellSize);
  const minCz = Math.floor((z - radius) / grid.cellSize);
  const maxCz = Math.floor((z + radius) / grid.cellSize);
  for (let cx = minCx; cx <= maxCx; cx++) {
    const row = cx * 4096;
    for (let cz = minCz; cz <= maxCz; cz++) {
      const arr = grid.cells.get(row + cz);
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

const EFFECTS_RADIUS = 300; // minimum candidate-gather radius (floor)
const EFFECTS_UPDATE_INTERVAL = 0.3; // seconds
const MAX_ACTIVE_EFFECTS = 300;
// In orbit/overhead, candidates are taken from a wide ring around the camera's
// ground focus and then trimmed by the actual view frustum — so customizations
// fill the WHOLE visible area, not a disk at the center. The ring radius grows
// with zoom up to this cap; when more than the budget are on screen, the ones
// nearest the focus win.
const EFFECTS_MAX_RADIUS = 9000;

// Cosmetics show based on what the camera is LOOKING AT (view frustum + gather
// range), NOT on how big the building is — a short building's crown shows just
// like a tall tower's, as long as it's in view. The only limit is the budget
// (MAX_ACTIVE_EFFECTS), which keeps the buildings NEAREST the camera when more
// than the cap are on screen at once.

// Screen-size LOD: a building whose footprint spans fewer CSS pixels than this
// renders its cosmetics as a speck (1-3 px) while costing the same ~10 draw
// calls as one up close. Sized by footprint only (height just locates the
// roof), so a short building's crown shows exactly like a tower's up close.
const MIN_EFFECT_FOOTPRINT_PX = 6;
// Phones: each cosmetic is ~10 draw calls and iOS Safari pays heavily per call
// (~750 calls kept an iPhone 15 at ~10 fps on the home view). Cosmetics show
// once a building is big enough on screen to read them, and fewer at a time.
const IS_TOUCH = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
const TOUCH_MIN_EFFECT_FOOTPRINT_PX = 24;
const TOUCH_MAX_ACTIVE = 60;
// Raid tag text is legible only up close; below this footprint the LED panel
// draws as a solid glow of its average color (instanced, InstancedEffects).
const RAID_TEXT_MIN_PX = 60;

// Low-perf preset: smaller bubble, fewer active components per frame.
const LOW_PERF_RADIUS = 120;
const LOW_PERF_MAX_ACTIVE = 40;

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
  lowPerf?: boolean;
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
  lowPerf,
}: EffectsLayerProps) {
  const effectsRadius = lowPerf ? LOW_PERF_RADIUS : EFFECTS_RADIUS;
  const maxActiveEffects = lowPerf ? LOW_PERF_MAX_ACTIVE : IS_TOUCH ? TOUCH_MAX_ACTIVE : MAX_ACTIVE_EFFECTS;
  const lastUpdate = useRef(-1);
  const activeSetRef = useRef(new Set<number>());
  const [activeIndices, setActiveIndices] = useState<number[]>([]);
  const farTagsRef = useRef(new Set<number>());
  const [farTags, setFarTags] = useState<Set<number>>(() => new Set());
  // Camera velocity tracking (fly mode look-ahead, so effects preload ahead).
  const prevCamPos = useRef<[number, number]>([0, 0]);
  const prevCamTime = useRef(0);
  const smoothVel = useRef<[number, number]>([0, 0]);

  const focusedLower = focusedBuilding?.toLowerCase() ?? null;
  const focusedBLower = focusedBuildingB?.toLowerCase() ?? null;
  const hideLower = hideEffectsFor?.toLowerCase() ?? null;
  const loginToIdx = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < buildings.length; i++) {
      map.set(buildings[i].loginLower, i);
    }
    return map;
  }, [buildings]);

  useFrame(({ camera, clock, size }) => {
    if (introMode) return; // Skip effects during intro

    const elapsed = clock.elapsedTime;
    const interval = flyMode ? 0.08 : EFFECTS_UPDATE_INTERVAL;
    if (elapsed - lastUpdate.current < interval) return;
    lastUpdate.current = elapsed;

    const camX = camera.position.x, camY = camera.position.y, camZ = camera.position.z;
    camera.getWorldDirection(_camFwd);

    // Fly look-ahead: predict where the camera will be (smoothed velocity) so
    // buildings ahead get scored as if already near and preload before you pass.
    const dt = elapsed - prevCamTime.current;
    let predX = camX, predZ = camZ;
    if (flyMode && dt > 0.001 && dt < 0.5) {
      const vx = (camX - prevCamPos.current[0]) / dt;
      const vz = (camZ - prevCamPos.current[1]) / dt;
      const SMOOTH = 0.3;
      smoothVel.current[0] += (vx - smoothVel.current[0]) * SMOOTH;
      smoothVel.current[1] += (vz - smoothVel.current[1]) * SMOOTH;
      const LOOK_AHEAD_SECS = 2;
      predX = camX + smoothVel.current[0] * LOOK_AHEAD_SECS;
      predZ = camZ + smoothVel.current[1] * LOOK_AHEAD_SECS;
    }
    prevCamPos.current[0] = camX;
    prevCamPos.current[1] = camZ;
    prevCamTime.current = elapsed;

    // Center the candidate gather on what the camera LOOKS at — the ground point
    // when looking down (orbit), or a point ahead when looking level (fly) — and
    // size the ring with distance. The view frustum + screen-size LOD below trim
    // it to exactly the buildings on screen, so fly and orbit behave the same:
    // customizations show across the view ahead, not in a bubble on the vehicle.
    let cx: number, cz: number, keepRadius: number;
    if (flyMode) {
      // Gather a wide ring around the predicted-ahead point so fast flight has
      // candidates loaded before arrival.
      cx = predX;
      cz = predZ;
      keepRadius = EFFECTS_MAX_RADIUS;
    } else if (_camFwd.y < -0.001) {
      const dist = -camY / _camFwd.y;
      cx = camX + _camFwd.x * dist;
      cz = camZ + _camFwd.z * dist;
      const focusDist = Math.hypot(cx - camX, camY, cz - camZ);
      keepRadius = Math.min(EFFECTS_MAX_RADIUS, Math.max(effectsRadius, focusDist * 2.5));
    } else {
      // Looking level/up: gather a wide ring ahead.
      cx = camX + _camFwd.x * 1500;
      cz = camZ + _camFwd.z * 1500;
      keepRadius = EFFECTS_MAX_RADIUS;
    }

    // Orbit trims to the exact view frustum; fly uses a path bubble so buildings
    // entering from the sides preload too.
    if (!flyMode) {
      _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_projScreen);
    }

    // px per world unit at distance 1 — footprint px = width * pxPerUnit / dist.
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 55;
    const pxPerUnit = size.height / (2 * Math.tan((fov * Math.PI) / 360));
    const minPx = IS_TOUCH ? TOUCH_MIN_EFFECT_FOOTPRINT_PX : MIN_EFFECT_FOOTPRINT_PX;
    const minPxSq = minPx * minPx;

    const candidates = querySpatialGrid(grid, cx, cz, keepRadius);
    const farSq = keepRadius * keepRadius;
    const newSet = new Set<number>();
    _scoreByIdx.clear();
    _pxByIdx.clear();

    for (let c = 0; c < candidates.length; c++) {
      const idx = candidates[c];
      const b = buildings[idx];

      // Only buildings that have something to render
      const hasEffects = b.claimed || (b.owned_items && b.owned_items.length > 0) || (b.app_streak > 0) || !!b.active_raid_tag || !!b.active_league_crown || b.rabbit_completed;
      if (!hasEffects) continue;

      // Distance from the LOOK TARGET (the ground point the camera is aimed at,
      // or the predicted-ahead point in fly mode) — NOT from the camera. This is
      // what makes the budget follow where you're LOOKING instead of clustering
      // at your feet: buildings around the centre of your view rank highest.
      // Building height is deliberately not a factor.
      const dx = cx - b.position[0];
      const dz = cz - b.position[2];
      const distSq = dx * dx + dz * dz;
      if (distSq > farSq) continue; // outside the gather ring

      let qualifies: boolean;
      if (flyMode) {
        // Path bubble: everything within the gather ring (already cut by farSq).
        qualifies = true;
      } else {
        // Show it if it's in view — i.e. where the camera is looking — no matter
        // how tall or short the building is.
        _sphere.center.set(b.position[0], b.height * 0.5, b.position[2]);
        _sphere.radius = Math.max(b.width, b.depth, b.height) * 0.5 + 30;
        qualifies = _frustum.intersectsSphere(_sphere);
      }
      if (qualifies) {
        const ex = b.position[0] - camX, ey = b.height - camY, ez = b.position[2] - camZ;
        const foot = Math.max(b.width, b.depth) * pxPerUnit;
        const d2 = ex * ex + ey * ey + ez * ez;
        if (foot * foot < minPxSq * d2) continue;
        _pxByIdx.set(idx, foot / Math.sqrt(d2));
        newSet.add(idx);
        _scoreByIdx.set(idx, distSq);
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

    // Cap at maxActiveEffects — keep the buildings nearest the LOOK TARGET so the
    // budget spreads across the centre of your view (size-independent), instead
    // of bunching up on the closest buildings directly under the camera.
    if (newSet.size > maxActiveEffects) {
      // Keep the buildings NEAREST the look target (distance, not size).
      const ranked = Array.from(newSet).sort(
        (a, b) => (_scoreByIdx.get(a) ?? Infinity) - (_scoreByIdx.get(b) ?? Infinity),
      );
      newSet.clear();
      for (let i = 0; i < maxActiveEffects && i < ranked.length; i++) {
        newSet.add(ranked[i]);
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

    // Raid tags too small on screen to read → solid far panel.
    const far = new Set<number>();
    for (const idx of newSet) {
      if (buildings[idx]?.active_raid_tag && (_pxByIdx.get(idx) ?? Infinity) < RAID_TEXT_MIN_PX) far.add(idx);
    }
    const prevFar = farTagsRef.current;
    let farChanged = far.size !== prevFar.size;
    if (!farChanged) for (const idx of far) if (!prevFar.has(idx)) { farChanged = true; break; }
    if (farChanged) {
      farTagsRef.current = far;
      setFarTags(far);
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

  // Buildings whose effects are visible this frame: same filter as the
  // per-building render below (hidden target and dimmed ones drop out).
  const visibleActive = useMemo(() => {
    const out: CityBuilding[] = [];
    for (const idx of activeIndices) {
      const b = buildings[idx];
      if (!b || b.loginLower === hideLower) continue;
      const isFocused = focusedLower === b.loginLower || focusedBLower === b.loginLower;
      if (focusedLower && !isFocused) continue;
      out.push(b);
    }
    return out;
  }, [activeIndices, buildings, hideLower, focusedLower, focusedBLower]);
  const flagBuildings = useMemo(() => visibleActive.filter(showsFlag), [visibleActive]);
  const farTagBuildings = useMemo(
    () => visibleActive.filter((b) => b.active_raid_tag && farTags.has(loginToIdx.get(b.loginLower) ?? -1)),
    [visibleActive, farTags, loginToIdx],
  );

  if (introMode) return null;

  return (
    <>
      <InstancedEffects buildings={visibleActive} flagBuildings={flagBuildings} farTagBuildings={farTagBuildings} accentColor={accentColor} />
      {activeIndices.map((idx) => {
        const b = buildings[idx];
        if (!b) return null;
        const loginLower = b.loginLower;
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
            tagAsPanel={farTags.has(idx)}
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
