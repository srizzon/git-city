"use client";

import { useRef, useMemo, useEffect, memo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";

// ─── Atlas Config ──────────────────────────────────────────────

const ATLAS_SIZE = 4096;
const CELL_W = 256;
const CELL_H = 40;
const ATLAS_COLS = ATLAS_SIZE / CELL_W; // 16
const ATLAS_ROWS = Math.floor(ATLAS_SIZE / CELL_H); // 102
const MAX_LABELS = ATLAS_COLS * ATLAS_ROWS; // 1632

const LABEL_VISIBLE_RADIUS = 400;
const LABEL_VISIBLE_RADIUS_SQ = LABEL_VISIBLE_RADIUS * LABEL_VISIBLE_RADIUS;

// ─── Text Atlas Builder ────────────────────────────────────────

function createTextAtlas(buildings: CityBuilding[]): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext("2d")!;

  // Transparent background
  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const count = Math.min(buildings.length, MAX_LABELS);

  for (let i = 0; i < count; i++) {
    const b = buildings[i];
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const cx = col * CELL_W + CELL_W / 2;
    const cy = row * CELL_H + CELL_H / 2;

    const login =
      b.login.length > 16
        ? b.login.slice(0, 16).toUpperCase() + "..."
        : b.login.toUpperCase();
    const text = `@${login}`;

    // Background pill
    ctx.font = 'bold 22px "Silkscreen", monospace';
    const textWidth = ctx.measureText(text).width;
    const padX = 12;
    const padY = 5;
    const bgW = textWidth + padX * 2;
    const bgH = 26 + padY * 2;
    const bgX = cx - bgW / 2;
    const bgY = cy - bgH / 2;
    ctx.fillStyle = "rgba(10, 10, 14, 0.65)";
    ctx.beginPath();
    ctx.roundRect(bgX, bgY, bgW, bgH, 4);
    ctx.fill();

    // Text
    if (b.claimed) {
      ctx.fillStyle = "#e8dcc8";
      ctx.shadowColor = "rgba(200, 230, 74, 0.5)";
      ctx.shadowBlur = 6;
    } else {
      ctx.fillStyle = "rgba(200, 200, 215, 0.85)";
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    ctx.fillText(text, cx, cy);

    // Reset shadow
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Billboard Shader ──────────────────────────────────────────

const billboardVertex = /* glsl */ `
  attribute vec4 aLabelUv;
  attribute float aAlpha;
  attribute vec3 aLabelPos;

  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    // Flip UV Y so text reads correctly (canvas Y is top-down, GL is bottom-up)
    vUv = vec2(aLabelUv.x + uv.x * aLabelUv.z, aLabelUv.y + (1.0 - uv.y) * aLabelUv.w);
    vAlpha = aAlpha;

    vec3 worldPos = aLabelPos;

    // Cylindrical billboard: only rotate around Y axis so text stays upright
    vec3 toCamera = cameraPosition - worldPos;
    toCamera.y = 0.0;
    float len = length(toCamera);
    toCamera = len > 0.001 ? toCamera / len : vec3(0.0, 0.0, 1.0);

    // Right = cross(up, toCamera) on XZ plane
    vec3 right = vec3(toCamera.z, 0.0, -toCamera.x);
    vec3 up = vec3(0.0, 1.0, 0.0);

    float labelW = 32.0;
    float labelH = 5.0;
    vec3 vertexPos = worldPos
      + right * position.x * labelW
      + up * position.y * labelH;

    vec4 mvPos = viewMatrix * vec4(vertexPos, 1.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const billboardFragment = /* glsl */ `
  uniform sampler2D uAtlas;

  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    vec4 texColor = texture2D(uAtlas, vUv);
    if (texColor.a < 0.01) discard;
    gl_FragColor = vec4(texColor.rgb, texColor.a * vAlpha);
  }
`;

// ─── Pre-allocated temps ───────────────────────────────────────

const _labelMatrix = new THREE.Matrix4();
const _labelQuat = new THREE.Quaternion();
const _labelScale = new THREE.Vector3(1, 1, 1);
const _labelPos = new THREE.Vector3();

// ─── Spatial Grid (O(nearby) lookups instead of O(n)) ─────────

const GRID_CELL_SIZE = 100;

class SpatialGrid2D {
  private cells: Map<string, number[]> = new Map();

  constructor(buildings: CityBuilding[], count: number) {
    for (let i = 0; i < count; i++) {
      const b = buildings[i];
      const key = `${Math.floor(b.position[0] / GRID_CELL_SIZE)},${Math.floor(b.position[2] / GRID_CELL_SIZE)}`;
      let cell = this.cells.get(key);
      if (!cell) {
        cell = [];
        this.cells.set(key, cell);
      }
      cell.push(i);
    }
  }

  queryRadius(x: number, z: number, radius: number): number[] {
    const cr = Math.ceil(radius / GRID_CELL_SIZE);
    const cx = Math.floor(x / GRID_CELL_SIZE);
    const cz = Math.floor(z / GRID_CELL_SIZE);
    const result: number[] = [];
    for (let dx = -cr; dx <= cr; dx++) {
      for (let dz = -cr; dz <= cr; dz++) {
        const cell = this.cells.get(`${cx + dx},${cz + dz}`);
        if (cell) {
          for (let i = 0; i < cell.length; i++) result.push(cell[i]);
        }
      }
    }
    return result;
  }
}

// ─── Component ─────────────────────────────────────────────────

interface InstancedLabelsProps {
  buildings: CityBuilding[];
  introMode?: boolean;
  flyMode?: boolean;
  focusedBuilding?: string | null;
  focusedBuildingB?: string | null;
}

export default memo(function InstancedLabels({
  buildings,
  introMode,
  flyMode,
  focusedBuilding,
  focusedBuildingB,
}: InstancedLabelsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = Math.min(buildings.length, MAX_LABELS);

  const focusedLower = focusedBuilding?.toLowerCase() ?? null;
  const focusedBLower = focusedBuildingB?.toLowerCase() ?? null;

  // Create atlas texture
  const atlas = useMemo(() => {
    if (typeof window === "undefined") return null;
    return createTextAtlas(buildings);
  }, [buildings]);

  // Geometry: unit plane
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  // Shader material
  const material = useMemo(() => {
    if (!atlas) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas },
      },
      vertexShader: billboardVertex,
      fragmentShader: billboardFragment,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }, [atlas]);

  // Per-instance data
  const { uvData, alphaData, posData } = useMemo(() => {
    const uv = new Float32Array(count * 4);
    const alpha = new Float32Array(count);
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const b = buildings[i];
      const col = i % ATLAS_COLS;
      const row = Math.floor(i / ATLAS_COLS);

      // UV: offset + repeat for this cell
      uv[i * 4 + 0] = col * CELL_W / ATLAS_SIZE;
      uv[i * 4 + 1] = row * CELL_H / ATLAS_SIZE;
      uv[i * 4 + 2] = CELL_W / ATLAS_SIZE;
      uv[i * 4 + 3] = CELL_H / ATLAS_SIZE;

      // Alpha: 0 during intro
      alpha[i] = 0;

      // Position: above building
      pos[i * 3 + 0] = b.position[0];
      pos[i * 3 + 1] = b.height + 20;
      pos[i * 3 + 2] = b.position[2];
    }

    return { uvData: uv, alphaData: alpha, posData: pos };
  }, [buildings, count]);

  // Set up instance attributes
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !material) return;

    // Identity matrices (billboard shader handles positioning)
    for (let i = 0; i < count; i++) {
      _labelPos.set(0, 0, 0);
      _labelScale.set(1, 1, 1);
      _labelMatrix.compose(_labelPos, _labelQuat, _labelScale);
      mesh.setMatrixAt(i, _labelMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    const uvAttr = new THREE.InstancedBufferAttribute(uvData, 4);
    const alphaAttr = new THREE.InstancedBufferAttribute(alphaData, 1);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    const posAttr = new THREE.InstancedBufferAttribute(posData, 3);

    mesh.geometry.setAttribute("aLabelUv", uvAttr);
    mesh.geometry.setAttribute("aAlpha", alphaAttr);
    mesh.geometry.setAttribute("aLabelPos", posAttr);

    mesh.count = count;
  }, [buildings, count, material, uvData, alphaData, posData]);

  // Pre-compute lowercased logins (avoid 1000+ toLowerCase calls per tick)
  const loginsLower = useMemo(
    () => buildings.slice(0, count).map((b) => b.login.toLowerCase()),
    [buildings, count]
  );

  // Spatial grid for fast nearby-building queries
  const grid = useMemo(() => new SpatialGrid2D(buildings, count), [buildings, count]);

  // Throttled target alphas + per-frame lerp
  const targetAlphas = useRef<Float32Array | null>(null);
  const lastLabelTick = useRef(-1);
  const allConverged = useRef(false);

  useFrame(({ camera, clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const alphaAttr = mesh.geometry.getAttribute("aAlpha") as THREE.InstancedBufferAttribute;
    if (!alphaAttr) return;
    const arr = alphaAttr.array as Float32Array;

    // Allocate target buffer once
    if (!targetAlphas.current || targetAlphas.current.length !== count) {
      targetAlphas.current = new Float32Array(count);
      allConverged.current = false;
    }
    const targets = targetAlphas.current;

    // Fast exit when already converged during intro/fly
    const hidden = !!(introMode || flyMode);
    if (hidden && allConverged.current) return;

    // Recalculate targets at ~8Hz (every 120ms)
    const now = clock.elapsedTime;
    if (now - lastLabelTick.current > 0.12) {
      lastLabelTick.current = now;

      if (hidden) {
        targets.fill(0);
      } else {
        const hasFocus = !!(focusedLower || focusedBLower);
        const camX = camera.position.x;
        const camZ = camera.position.z;

        if (hasFocus) {
          // Focus mode: dim all, highlight focused (must check all labels)
          for (let i = 0; i < count; i++) {
            const loginLow = loginsLower[i];
            const isFocused = loginLow === focusedLower || loginLow === focusedBLower;
            targets[i] = isFocused ? 0 : 0.15;
          }
        } else {
          // Normal mode: use spatial grid to only check nearby buildings
          targets.fill(0);
          const nearby = grid.queryRadius(camX, camZ, LABEL_VISIBLE_RADIUS);
          for (let j = 0; j < nearby.length; j++) {
            const i = nearby[j];
            const b = buildings[i];
            const dx = camX - b.position[0];
            const dz = camZ - b.position[2];
            const distSq = dx * dx + dz * dz;
            targets[i] = distSq < LABEL_VISIBLE_RADIUS_SQ ? 1 : 0;
          }
        }
      }

      // Only un-converge if targets actually differ from current alphas
      if (allConverged.current) {
        for (let i = 0; i < count; i++) {
          const diff = targets[i] - arr[i];
          if (diff > 0.01 || diff < -0.01) {
            allConverged.current = false;
            break;
          }
        }
      }
    }

    // Skip lerp if already converged
    if (allConverged.current) return;

    // Lerp toward targets
    let changed = false;
    let converged = true;
    for (let i = 0; i < count; i++) {
      const diff = targets[i] - arr[i];
      if (diff > 0.01 || diff < -0.01) {
        arr[i] += diff * 0.18;
        changed = true;
        converged = false;
      }
    }

    if (changed) {
      alphaAttr.needsUpdate = true;
    }
    if (converged) {
      allConverged.current = true;
    }
  });

  // Cleanup
  useEffect(() => {
    return () => {
      geo.dispose();
      material?.dispose();
      atlas?.dispose();
    };
  }, [geo, material, atlas]);

  if (!material || count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geo, material, count]}
      frustumCulled={false}
      renderOrder={10}
    />
  );
});
