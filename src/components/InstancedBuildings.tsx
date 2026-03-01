"use client";

import { useRef, useMemo, useEffect, memo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import type { BuildingColors } from "./CityCanvas";
import { wasAdPointerConsumed } from "./SkyAds";

// ─── Atlas Constants (must match Building3D.tsx) ───────────────
const ATLAS_SIZE = 2048;
const ATLAS_CELL = 8;
const ATLAS_COLS = ATLAS_SIZE / ATLAS_CELL; // 256
const ATLAS_BAND_ROWS = 42;

// ─── Shader ────────────────────────────────────────────────────

const vertexShader = /* glsl */ `
  attribute vec4 aUvFront;
  attribute vec4 aUvSide;
  attribute float aRise;
  attribute vec4 aTint;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vUvFront;
  varying vec4 vUvSide;
  varying vec3 vViewPos;
  varying float vInstanceId;
  varying vec4 vTint;

  void main() {
    vUv = uv;
    vNormal = normalize(mat3(instanceMatrix) * normal);
    vUvFront = aUvFront;
    vUvSide = aUvSide;
    vTint = aTint;

    // Rise animation: modulate Y position by aRise (0 = underground, 1 = full height)
    vec3 localPos = position;
    localPos.y = localPos.y * aRise + (aRise - 1.0) * 0.5;

    vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(localPos, 1.0);
    vViewPos = mvPos.xyz;
    vInstanceId = float(gl_InstanceID);

    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uRoofColor;
  uniform vec3 uFaceColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFocusedId;
  uniform float uFocusedIdB;
  uniform float uDimOpacity;
  uniform float uDimEmissive;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vUvFront;
  varying vec4 vUvSide;
  varying vec3 vViewPos;
  varying float vInstanceId;
  varying vec4 vTint;

  void main() {
    // Early discard: skip fragments fully inside fog (invisible anyway)
    float fogDepth = length(vViewPos);
    if (fogDepth > uFogFar) discard;

    vec3 absN = abs(vNormal);
    float isRoof = step(0.5, absN.y);

    // Choose UV params based on face normal:
    // Front/back faces (normal along Z) use aUvFront
    // Left/right faces (normal along X) use aUvSide
    bool isFrontBack = absN.z > absN.x;
    vec4 uvParams = isFrontBack ? vUvFront : vUvSide;

    vec2 atlasUv = uvParams.xy + vUv * uvParams.zw;
    vec3 wallColor = texture2D(uAtlas, atlasUv).rgb;

    // Custom color tint: blend custom color with theme face color at 50%
    // vTint.a > 0.5 means this building has a custom color
    if (vTint.a > 0.5) {
      // Detect face pixels (background between windows) vs window pixels
      // Face pixels are close to uFaceColor, windows are brighter
      float isFacePixel = step(length(wallColor - uFaceColor), 0.08);
      vec3 blendedTint = mix(uFaceColor, vTint.rgb, 0.5);
      wallColor = mix(wallColor, blendedTint, isFacePixel);
    }

    // Emissive glow for lit windows
    vec3 emissive = wallColor * 1.8;
    vec3 wallFinal = wallColor * 0.3 + emissive;

    // Roof: solid color with emissive
    vec3 roofFinal = uRoofColor * 1.8;

    vec3 color = mix(wallFinal, roofFinal, isRoof);

    // Simple directional light
    vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
    float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.3 + 0.7;
    color *= diffuse;

    // Focus/dim: keep focused building at full opacity, dim others
    float isFocused = step(abs(vInstanceId - uFocusedId), 0.5)
                    + step(abs(vInstanceId - uFocusedIdB), 0.5);
    isFocused = min(isFocused, 1.0);

    // When uFocusedId < 0, no dimming (no building focused)
    float hasFocus = step(0.0, uFocusedId);

    float dimFactor = mix(1.0, mix(uDimOpacity, 1.0, isFocused), hasFocus);
    float emissiveMult = mix(1.0, mix(uDimEmissive, 1.0, isFocused), hasFocus);
    color *= emissiveMult * dimFactor;

    // Screen-door transparency: discard pixels on non-focused buildings
    // Uses 4x4 Bayer dithering for smooth look
    float isUnfocused = hasFocus * (1.0 - isFocused);
    if (isUnfocused > 0.5) {
      int x = int(mod(gl_FragCoord.x, 4.0));
      int y = int(mod(gl_FragCoord.y, 4.0));
      int idx = x + y * 4;
      // 4x4 Bayer matrix thresholds (normalized 0-1)
      float bayer;
      if (idx == 0) bayer = 0.0;    else if (idx == 1) bayer = 0.5;
      else if (idx == 2) bayer = 0.125; else if (idx == 3) bayer = 0.625;
      else if (idx == 4) bayer = 0.75;  else if (idx == 5) bayer = 0.25;
      else if (idx == 6) bayer = 0.875; else if (idx == 7) bayer = 0.375;
      else if (idx == 8) bayer = 0.1875; else if (idx == 9) bayer = 0.6875;
      else if (idx == 10) bayer = 0.0625; else if (idx == 11) bayer = 0.5625;
      else if (idx == 12) bayer = 0.9375; else if (idx == 13) bayer = 0.4375;
      else if (idx == 14) bayer = 0.8125; else bayer = 0.3125;
      if (bayer > uDimOpacity) discard;
    }

    // Linear fog (reuse fogDepth from early discard)
    float fogFactor = smoothstep(uFogNear, uFogFar, fogDepth);
    color = mix(color, uFogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ─── Pre-allocated temp objects ────────────────────────────────
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

// ─── Types ─────────────────────────────────────────────────────

interface InstancedBuildingsProps {
  buildings: CityBuilding[];
  colors: BuildingColors;
  atlasTexture: THREE.CanvasTexture;
  focusedBuilding?: string | null;
  focusedBuildingB?: string | null;
  introMode?: boolean;
  onBuildingClick?: (building: CityBuilding) => void;
  dimOpacity?: number;
  dimEmissive?: number;
  holdRise?: boolean;
}

// Rise animation tracking
interface RiseState {
  startTime: number;
  idx: number;
}

const RISE_DURATION = 0.85; // seconds
const RISE_STAGGER_DELAY = 0.003; // stagger between buildings (~2.4s for 800 buildings)

export default memo(function InstancedBuildings({
  buildings,
  colors,
  atlasTexture,
  focusedBuilding,
  focusedBuildingB,
  introMode,
  onBuildingClick,
  dimOpacity,
  dimEmissive,
  holdRise,
}: InstancedBuildingsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = buildings.length;

  // Lookup for login -> index (lowercased)
  const loginToIdx = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < buildings.length; i++) {
      map.set(buildings[i].login.toLowerCase(), i);
    }
    return map;
  }, [buildings]);

  // Shared geometry (unit box)
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  // Shader material (created once, uniforms updated reactively)
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlasTexture },
        uRoofColor: { value: new THREE.Color(colors.roof) },
        uFaceColor: { value: new THREE.Color(colors.face) },
        uFogColor: { value: new THREE.Color("#0a1428") },
        uFogNear: { value: 500 },
        uFogFar: { value: 3500 },
        uFocusedId: { value: -1.0 },
        uFocusedIdB: { value: -1.0 },
        uDimOpacity: { value: 0.6 },
        uDimEmissive: { value: 0.5 },
      },
      vertexShader,
      fragmentShader,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update theme-dependent uniforms without recreating the material
  useEffect(() => {
    material.uniforms.uAtlas.value = atlasTexture;
    material.uniforms.uRoofColor.value.set(colors.roof);
    material.uniforms.uFaceColor.value.set(colors.face);
    material.needsUpdate = true;
  }, [material, atlasTexture, colors.roof, colors.face]);

  // Per-instance attribute buffers
  const { uvFrontData, uvSideData, riseData, tintData } = useMemo(() => {
    const uvF = new Float32Array(count * 4);
    const uvS = new Float32Array(count * 4);
    const rise = new Float32Array(count);
    const tint = new Float32Array(count * 4);
    const _c = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const b = buildings[i];
      const seed = b.login.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 137;

      const bandIndex = Math.min(5, Math.max(0, Math.round(b.litPercentage * 5)));
      const bandRowOffset = bandIndex * ATLAS_BAND_ROWS;

      // Front face UV
      const frontColStart = Math.abs(seed % Math.max(1, ATLAS_COLS - b.windowsPerFloor));
      uvF[i * 4 + 0] = frontColStart / ATLAS_COLS;
      uvF[i * 4 + 1] = bandRowOffset / ATLAS_COLS;
      uvF[i * 4 + 2] = b.windowsPerFloor / ATLAS_COLS;
      uvF[i * 4 + 3] = b.floors / ATLAS_COLS;

      // Side face UV (different column start for variety)
      const sideColStart = Math.abs((seed + 7919) % Math.max(1, ATLAS_COLS - b.sideWindowsPerFloor));
      uvS[i * 4 + 0] = sideColStart / ATLAS_COLS;
      uvS[i * 4 + 1] = bandRowOffset / ATLAS_COLS;
      uvS[i * 4 + 2] = b.sideWindowsPerFloor / ATLAS_COLS;
      uvS[i * 4 + 3] = b.floors / ATLAS_COLS;

      // Rise starts at 0 (will animate to 1)
      rise[i] = 0;

      // Custom color tint (rgb = color, a = flag)
      if (b.custom_color) {
        _c.set(b.custom_color);
        tint[i * 4 + 0] = _c.r;
        tint[i * 4 + 1] = _c.g;
        tint[i * 4 + 2] = _c.b;
        tint[i * 4 + 3] = 1.0;
      } else {
        tint[i * 4 + 0] = 0;
        tint[i * 4 + 1] = 0;
        tint[i * 4 + 2] = 0;
        tint[i * 4 + 3] = 0;
      }
    }

    return { uvFrontData: uvF, uvSideData: uvS, riseData: rise, tintData: tint };
  }, [buildings, count]);

  // Rise animation state
  const risingRef = useRef<RiseState[]>([]);
  const riseInitialized = useRef(false);
  const hasPlayedRise = useRef(false);
  const holdRiseRef = useRef(holdRise);
  holdRiseRef.current = holdRise;

  // Initialize instances
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Set instance matrices
    for (let i = 0; i < count; i++) {
      const b = buildings[i];
      _position.set(b.position[0], b.height / 2, b.position[2]);
      _scale.set(b.width, b.height, b.depth);
      _matrix.compose(_position, _quaternion, _scale);
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Force a bounding sphere that covers the entire city so raycaster coarse test always passes.
    // computeBoundingSphere() may not work correctly for InstancedMesh in all Three.js versions.
    let maxDist = 0;
    let maxHeight = 0;
    for (let i = 0; i < count; i++) {
      const b = buildings[i];
      const d = Math.sqrt(b.position[0] * b.position[0] + b.position[2] * b.position[2]);
      if (d > maxDist) maxDist = d;
      if (b.height > maxHeight) maxHeight = b.height;
    }
    const radius = Math.sqrt(maxDist * maxDist + maxHeight * maxHeight) + 100;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, maxHeight / 2, 0), radius);
    mesh.boundingBox = null; // let Three.js recompute if needed

    // Set per-instance attributes
    const uvFrontAttr = new THREE.InstancedBufferAttribute(uvFrontData, 4);
    const uvSideAttr = new THREE.InstancedBufferAttribute(uvSideData, 4);
    const riseAttr = new THREE.InstancedBufferAttribute(riseData, 1);
    riseAttr.setUsage(THREE.DynamicDrawUsage);
    const tintAttr = new THREE.InstancedBufferAttribute(tintData, 4);

    mesh.geometry.setAttribute("aUvFront", uvFrontAttr);
    mesh.geometry.setAttribute("aUvSide", uvSideAttr);
    mesh.geometry.setAttribute("aRise", riseAttr);
    mesh.geometry.setAttribute("aTint", tintAttr);

    if (hasPlayedRise.current) {
      // Skip rise animation on subsequent updates (city reload, chunk loading)
      // Show all buildings at full height immediately
      for (let i = 0; i < count; i++) riseData[i] = 1;
      riseAttr.needsUpdate = true;
      riseInitialized.current = true;
      risingRef.current = [];
    } else {
      // First mount: play the staggered rise animation
      hasPlayedRise.current = true;
      riseInitialized.current = false;
      risingRef.current = [];
    }

    mesh.count = count;
  }, [buildings, count, uvFrontData, uvSideData, riseData, tintData]);

  // Sync fog uniforms (only when values actually change, e.g. theme switch)
  const lastFogNear = useRef(0);
  const lastFogFar = useRef(0);
  useFrame(({ scene }) => {
    if (!material.uniforms) return;
    const fog = scene.fog as THREE.Fog | null;
    if (!fog) return;
    if (fog.near !== lastFogNear.current || fog.far !== lastFogFar.current) {
      material.uniforms.uFogColor.value.copy(fog.color);
      material.uniforms.uFogNear.value = fog.near;
      material.uniforms.uFogFar.value = fog.far;
      lastFogNear.current = fog.near;
      lastFogFar.current = fog.far;
    }
  });

  // Update focus uniforms
  useEffect(() => {
    if (!material.uniforms) return;
    const idA = focusedBuilding ? loginToIdx.get(focusedBuilding.toLowerCase()) : undefined;
    const idB = focusedBuildingB ? loginToIdx.get(focusedBuildingB.toLowerCase()) : undefined;
    material.uniforms.uFocusedId.value = idA !== undefined ? idA : -1.0;
    material.uniforms.uFocusedIdB.value = idB !== undefined ? idB : -1.0;
  }, [focusedBuilding, focusedBuildingB, loginToIdx, material]);

  // Rise animation + staggered init
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Hold rise animation until loading screen is done
    if (holdRiseRef.current) return;

    // Initialize rise animation queue (staggered)
    const now = clock.elapsedTime;
    if (!riseInitialized.current) {
      riseInitialized.current = true;
      const queue: RiseState[] = [];
      for (let i = 0; i < count; i++) {
        queue.push({
          startTime: now + i * RISE_STAGGER_DELAY,
          idx: i,
        });
      }
      risingRef.current = queue;
    }

    // Early exit if nothing is rising (avoids array allocation per frame)
    const rising = risingRef.current;
    if (rising.length === 0) return;

    const riseAttr = mesh.geometry.getAttribute("aRise") as THREE.InstancedBufferAttribute;
    if (!riseAttr) return;
    const arr = riseAttr.array as Float32Array;

    // Process rising buildings
    let anyChanged = false;
    const nextRising: RiseState[] = [];

    for (let r = 0; r < rising.length; r++) {
      const state = rising[r];
      const elapsed = now - state.startTime;
      if (elapsed < 0) {
        // Not started yet - keep this and all remaining in queue
        for (let j = r; j < rising.length; j++) {
          nextRising.push(rising[j]);
        }
        break;
      }
      const progress = Math.min(1, elapsed / RISE_DURATION);
      // Ease-out cubic
      const t = 1 - Math.pow(1 - progress, 3);
      arr[state.idx] = t;
      anyChanged = true;

      if (progress < 1) {
        nextRising.push(state);
      }
    }

    risingRef.current = nextRising;

    if (anyChanged) {
      riseAttr.needsUpdate = true;
    }
  });

  // ─── Click / Hover interaction (manual raycast, bypasses R3F events) ──

  const { gl, camera } = useThree();
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerNDC = useRef(new THREE.Vector2());

  // Stable refs so listeners always access latest values
  const buildingsRef = useRef(buildings);
  buildingsRef.current = buildings;
  const onClickRef = useRef(onBuildingClick);
  onClickRef.current = onBuildingClick;
  const introRef = useRef(introMode);
  introRef.current = introMode;

  // Tap state: captured on pointerdown, resolved on pointerup
  const tapRef = useRef<{ time: number; id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;

    const screenToNDC = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      pointerNDC.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const raycastInstance = (clientX: number, clientY: number): number | null => {
      const mesh = meshRef.current;
      if (!mesh) return null;
      screenToNDC(clientX, clientY);
      raycasterRef.current.setFromCamera(pointerNDC.current, camera);
      const hits: THREE.Intersection[] = [];
      mesh.raycast(raycasterRef.current, hits);
      if (hits.length > 0) {
        hits.sort((a, b) => a.distance - b.distance);
        if (hits[0].instanceId !== undefined) return hits[0].instanceId;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (introRef.current) return;
      if (wasAdPointerConsumed()) return;
      if ((window as any).__spireClicked) return;
      const id = raycastInstance(e.clientX, e.clientY);
      if (id !== null && id < buildingsRef.current.length) {
        tapRef.current = { time: performance.now(), id, x: e.clientX, y: e.clientY };
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const tap = tapRef.current;
      if (!tap) return;
      tapRef.current = null;

      const elapsed = performance.now() - tap.time;
      if (elapsed > 400) return;

      const dx = e.clientX - tap.x;
      const dy = e.clientY - tap.y;
      if (dx * dx + dy * dy > 625) return;

      if (tap.id < buildingsRef.current.length) {
        onClickRef.current?.(buildingsRef.current[tap.id]);
      }
    };

    // Hover raycast for cursor:pointer — skip on touch devices (no cursor)
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    let lastMoveTime = 0;
    const onPointerMove = isTouch ? null : (e: PointerEvent) => {
      if (introRef.current) {
        document.body.style.cursor = "auto";
        return;
      }
      if ((window as any).__spireCursor) return;
      // Throttle hover raycast to ~8Hz
      const now = performance.now();
      if (now - lastMoveTime < 125) return;
      lastMoveTime = now;
      const id = raycastInstance(e.clientX, e.clientY);
      document.body.style.cursor = id !== null ? "pointer" : "auto";
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    if (onPointerMove) canvas.addEventListener("pointermove", onPointerMove);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      if (onPointerMove) canvas.removeEventListener("pointermove", onPointerMove);
      document.body.style.cursor = "auto";
    };
  }, [gl, camera]);

  // Cleanup
  useEffect(() => {
    return () => {
      geo.dispose();
      material.dispose();
    };
  }, [geo, material]);

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geo, material, count]}
      frustumCulled={false}
    />
  );
});
