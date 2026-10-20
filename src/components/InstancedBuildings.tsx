"use client";

import { useRef, useMemo, useEffect, memo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import type { BuildingColors } from "./CityCanvas";
import { wasAdPointerConsumed } from "./SkyAds";
import { SMASH_SLOTS, type SmashStore } from "@/lib/league-city/smash";

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
  attribute float aLive;
  attribute float aInvited;
  // The building this instance belongs to (a broken building's columns carry its index).
  attribute float aOwner;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vUvFront;
  varying vec4 vUvSide;
  varying vec3 vViewPos;
  varying float vInstanceId;
  varying vec4 vTint;
  varying float vLive;
  varying float vInvited;
  varying float vWorldY;
  #include <common>
  #include <logdepthbuf_pars_vertex>

  void main() {
    vUv = uv;
    vNormal = normalize(mat3(instanceMatrix) * normal);
    vUvFront = aUvFront;
    vUvSide = aUvSide;
    vTint = aTint;
    vLive = aLive;
    vInvited = aInvited;

    // Rise animation: modulate Y position by aRise (0 = underground, 1 = full height)
    vec3 localPos = position;
    localPos.y = localPos.y * aRise + (aRise - 1.0) * 0.5;

    vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(localPos, 1.0);
    vViewPos = mvPos.xyz;
    vWorldY = (modelMatrix * instanceMatrix * vec4(localPos, 1.0)).y;
    vInstanceId = aOwner;

    gl_Position = projectionMatrix * mvPos;
    #include <logdepthbuf_vertex>
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
  uniform float uCityEnergy;
  uniform float uInvitedOpacity;
  uniform float uBuildTo;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec4 vUvFront;
  varying vec4 vUvSide;
  varying vec3 vViewPos;
  varying float vInstanceId;
  varying vec4 vTint;
  varying float vLive;
  varying float vInvited;
  varying float vWorldY;
  #include <logdepthbuf_pars_fragment>

  void main() {
    // Under construction: nothing above the floors built so far.
    if (vWorldY > uBuildTo) discard;
    // Early discard: skip fragments fully inside fog (invisible anyway)
    float fogDepth = length(vViewPos);
    if (fogDepth > uFogFar) discard;
    #include <logdepthbuf_fragment>


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

    // Emissive glow for lit windows, scaled by city energy
    // Both ambient and emissive dim when city sleeps
    float ambientBase = 0.08 + 0.22 * uCityEnergy;
    vec3 emissive = wallColor * 1.8 * uCityEnergy;
    vec3 wallFinal = wallColor * ambientBase + emissive;

    // Live building boost: pushes windows past bloom threshold
    vec3 liveBoost = vec3(1.4, 1.35, 1.2);
    wallFinal = mix(wallFinal, wallFinal * liveBoost, vLive);

    // Roof: solid color with emissive, also scaled by city energy
    vec3 roofFinal = uRoofColor * (0.4 + 1.4 * uCityEnergy);

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

    // Screen-door transparency: discard pixels on non-focused buildings and on
    // invited league members who haven't joined yet (a faded "ghost" building).
    // Uses 4x4 Bayer dithering for smooth look
    float isUnfocused = hasFocus * (1.0 - isFocused);
    float opacity = 1.0;
    if (isUnfocused > 0.5) opacity = uDimOpacity;
    if (vInvited > 0.5) opacity = min(opacity, uInvitedOpacity);
    if (opacity < 1.0) {
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
      if (bayer > opacity) discard;
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
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0);
const _yaw = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

// ─── Smash ghost ───────────────────────────────────────────────
// A broken building's original size: a thin outline of its full box, faint,
// in the town's color, with a whisper of fill.

const ghostVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const ghostFragment = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 e = min(vUv, 1.0 - vUv) / fwidth(vUv);
    float edge = 1.0 - clamp(min(e.x, e.y) - 0.75, 0.0, 1.0);
    gl_FragColor = vec4(uColor, edge * 0.6 + 0.025);
  }
`;

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
  liveByLogin?: Map<string, unknown>;
  cityEnergy?: number;
  dimAll?: boolean;
  /** Drive-through destruction (rival towns): broken buildings draw as columns, with a ghost of what's missing. */
  smash?: SmashStore;
  /** The ghost's color (the town's side). */
  ghostColor?: string;
  /** A building going up (a film's): nothing is drawn above this world height, read every frame. */
  buildTo?: { current: number };
}

const RISE_DURATION = 0.85; // seconds
const MAX_RISE_TOTAL = 4; // cap total stagger to 4s regardless of building count

// Module-level flag so the rise animation only plays once per session,
// surviving component remounts caused by Next.js navigation.
let hasPlayedRiseGlobal = false;

/** A film (the reel studio) opens on the city already standing: no staggered rise on its first mount. */
export function skipCityRise() {
  hasPlayedRiseGlobal = true;
}

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
  liveByLogin,
  cityEnergy = 1.0,
  dimAll,
  smash,
  ghostColor = "#ffffff",
  buildTo,
}: InstancedBuildingsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const ghostRef = useRef<THREE.InstancedMesh>(null);
  const smashVersion = useRef(-1);
  const count = buildings.length;
  // With smash, every building owns SMASH_SLOTS more instances after the
  // buildings, for its columns (hidden until it breaks).
  const capacity = smash ? count * (1 + SMASH_SLOTS) : count;

  // Lookup for login -> index (uses precomputed loginLower)
  const loginToIdx = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < buildings.length; i++) {
      map.set(buildings[i].loginLower, i);
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
        uCityEnergy: { value: 1.0 },
        uInvitedOpacity: { value: 0.35 },
        uBuildTo: { value: 1e9 },
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
  const { uvFrontData, uvSideData, riseData, tintData, invitedData, ownerData } = useMemo(() => {
    const invited = new Float32Array(capacity);
    const owner = new Float32Array(capacity);
    const uvF = new Float32Array(capacity * 4);
    const uvS = new Float32Array(capacity * 4);
    const rise = new Float32Array(capacity).fill(1);
    const tint = new Float32Array(capacity * 4);
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

      invited[i] = b.invited ? 1 : 0;
      owner[i] = i;

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
      for (let c = 0; c < capacity - count && c < SMASH_SLOTS; c++) {
        const slot = count + i * SMASH_SLOTS + c;
        invited[slot] = invited[i];
        owner[slot] = i;
        for (let k = 0; k < 4; k++) tint[slot * 4 + k] = tint[i * 4 + k];
      }
    }

    return { uvFrontData: uvF, uvSideData: uvS, riseData: rise, tintData: tint, invitedData: invited, ownerData: owner };
  }, [buildings, count, capacity]);

  // Live presence attribute (updated dynamically)
  const liveData = useMemo(() => new Float32Array(capacity), [capacity]);

  // Rise animation state — zero-alloc model:
  //   riseStartTime: when we first kicked off the staggered rise
  //   staggerDelay : delay between successive buildings
  //   firstActive  : lowest index whose rise has not yet completed (monotonic)
  //   lastStarted  : index just past the latest building whose startTime has passed
  // Because stagger times are monotonic and rise duration is constant, buildings
  // finish in the order they started, so we never need a queue/array. Each
  // frame we advance two integer cursors and update arr[i] only for the
  // currently-rising window [firstActive, lastStarted). Allocates nothing.
  const riseStartTime = useRef(-1);
  const riseStaggerDelay = useRef(0);
  const riseFirstActive = useRef(0);
  const riseLastStarted = useRef(0);
  const riseInitialized = useRef(false);
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
    for (let i = count; i < capacity; i++) mesh.setMatrixAt(i, _hidden);
    mesh.instanceMatrix.needsUpdate = true;
    smashVersion.current = -1;

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
    // The ghosts start hidden, so their own bounds would be a point: use the city's.
    if (ghostRef.current) ghostRef.current.boundingSphere = mesh.boundingSphere.clone();

    // Set per-instance attributes
    const uvFrontAttr = new THREE.InstancedBufferAttribute(uvFrontData, 4);
    const uvSideAttr = new THREE.InstancedBufferAttribute(uvSideData, 4);
    const riseAttr = new THREE.InstancedBufferAttribute(riseData, 1);
    riseAttr.setUsage(THREE.DynamicDrawUsage);
    const tintAttr = new THREE.InstancedBufferAttribute(tintData, 4);
    const invitedAttr = new THREE.InstancedBufferAttribute(invitedData, 1);
    const ownerAttr = new THREE.InstancedBufferAttribute(ownerData, 1);

    const liveAttr = new THREE.InstancedBufferAttribute(liveData, 1);
    liveAttr.setUsage(THREE.DynamicDrawUsage);

    mesh.geometry.setAttribute("aUvFront", uvFrontAttr);
    mesh.geometry.setAttribute("aUvSide", uvSideAttr);
    mesh.geometry.setAttribute("aRise", riseAttr);
    mesh.geometry.setAttribute("aTint", tintAttr);
    mesh.geometry.setAttribute("aLive", liveAttr);
    mesh.geometry.setAttribute("aInvited", invitedAttr);
    mesh.geometry.setAttribute("aOwner", ownerAttr);

    if (hasPlayedRiseGlobal) {
      // Skip rise animation on return visits / subsequent updates
      // Show all buildings at full height immediately
      for (let i = 0; i < count; i++) riseData[i] = 1;
      riseAttr.needsUpdate = true;
      riseInitialized.current = true;
      riseFirstActive.current = count;
      riseLastStarted.current = count;
    } else {
      // First mount this session: play the staggered rise animation
      hasPlayedRiseGlobal = true;
      riseInitialized.current = false;
      riseStartTime.current = -1;
      riseFirstActive.current = 0;
      riseLastStarted.current = 0;
    }

    mesh.count = capacity;
  }, [buildings, count, capacity, uvFrontData, uvSideData, riseData, tintData, invitedData, ownerData, liveData]);

  // Sync fog uniforms (only when values actually change, e.g. theme switch)
  // Also smoothly lerp cityEnergy uniform toward target value
  const lastFogNear = useRef(0);
  const lastFogFar = useRef(0);
  const cityEnergyRef = useRef(cityEnergy);
  cityEnergyRef.current = cityEnergy;
  useFrame(({ scene }) => {
    if (!material.uniforms) return;
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      if (fog.near !== lastFogNear.current || fog.far !== lastFogFar.current) {
        material.uniforms.uFogColor.value.copy(fog.color);
        material.uniforms.uFogNear.value = fog.near;
        material.uniforms.uFogFar.value = fog.far;
        lastFogNear.current = fog.near;
        lastFogFar.current = fog.far;
      }
    }

    if (buildTo) material.uniforms.uBuildTo.value = buildTo.current;

    // Smooth lerp city energy (transition over ~5 seconds)
    const current = material.uniforms.uCityEnergy.value;
    const target = cityEnergyRef.current;
    if (Math.abs(current - target) > 0.001) {
      material.uniforms.uCityEnergy.value += (target - current) * 0.02;
    }
  });

  // Update focus uniforms
  useEffect(() => {
    if (!material.uniforms) return;
    const idA = focusedBuilding ? loginToIdx.get(focusedBuilding.toLowerCase()) : undefined;
    const idB = focusedBuildingB ? loginToIdx.get(focusedBuildingB.toLowerCase()) : undefined;
    // dimAll: set focusedId to a value that matches no building, but hasFocus=true so all dim
    material.uniforms.uFocusedId.value = dimAll ? 999999.0 : (idA !== undefined ? idA : -1.0);
    material.uniforms.uFocusedIdB.value = idB !== undefined ? idB : -1.0;
  }, [focusedBuilding, focusedBuildingB, dimAll, loginToIdx, material]);

  // Track which indices we previously lit so we can clear just those next
  // pass — iterating the 80k building array on every heartbeat was 80k
  // toLowerCase() calls plus 80k Map.has() probes per realtime tick, which
  // is the GC firehose that ate frames once a handful of people came online.
  const litIndicesRef = useRef<number[]>([]);

  // Update live presence glow (O(live count), not O(buildings))
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const liveAttr = mesh.geometry.getAttribute("aLive") as THREE.InstancedBufferAttribute | undefined;
    if (!liveAttr) return;
    const arr = liveAttr.array as Float32Array;

    // Clear last frame's lit slots
    const lit = litIndicesRef.current;
    for (let i = 0; i < lit.length; i++) arr[lit[i]] = 0;
    lit.length = 0;

    if (liveByLogin && liveByLogin.size > 0) {
      for (const login of liveByLogin.keys()) {
        const key = login.toLowerCase();
        const idx = loginToIdx.get(key);
        if (idx === undefined) continue;
        // Creator gets an overdriven glow (1.5 overshoots the mix, extra bright)
        arr[idx] = key === "srizzon" ? 1.5 : 1.0;
        lit.push(idx);
      }
    }

    liveAttr.needsUpdate = true;
  }, [liveByLogin, loginToIdx]);

  // Rise animation + staggered init (zero allocation per frame)
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Hold rise animation until loading screen is done
    if (holdRiseRef.current) return;

    const now = clock.elapsedTime;

    // First tick after init: lock in the start time + stagger
    if (!riseInitialized.current) {
      riseInitialized.current = true;
      riseStartTime.current = now;
      riseStaggerDelay.current = Math.min(0.003, MAX_RISE_TOTAL / Math.max(1, count));
      riseFirstActive.current = 0;
      riseLastStarted.current = 0;
    }

    // Nothing rising anymore (everyone reached t=1)
    if (riseFirstActive.current >= count) return;

    const riseAttr = mesh.geometry.getAttribute("aRise") as THREE.InstancedBufferAttribute;
    if (!riseAttr) return;
    const arr = riseAttr.array as Float32Array;

    const startTime = riseStartTime.current;
    const stagger = riseStaggerDelay.current;
    const elapsedSinceRise = now - startTime;

    // Advance lastStarted: every building whose startTime has passed is in the window.
    // Monotonic stagger means a single while-loop covers any new starters this tick.
    let lastStarted = riseLastStarted.current;
    while (lastStarted < count && elapsedSinceRise >= lastStarted * stagger) {
      lastStarted++;
    }
    riseLastStarted.current = lastStarted;

    let wrote = false;

    // Lock in finished buildings (monotonic — once locked, never revisited).
    let firstActive = riseFirstActive.current;
    while (firstActive < lastStarted) {
      const localElapsed = elapsedSinceRise - firstActive * stagger;
      if (localElapsed < RISE_DURATION) break;
      arr[firstActive] = 1;
      firstActive++;
      wrote = true;
    }
    riseFirstActive.current = firstActive;

    // Update only the currently-animating window [firstActive, lastStarted).
    for (let i = firstActive; i < lastStarted; i++) {
      const localElapsed = elapsedSinceRise - i * stagger;
      const progress = localElapsed / RISE_DURATION;
      // Ease-out cubic: 1 - (1-p)^3
      const one = 1 - progress;
      arr[i] = 1 - one * one * one;
      wrote = true;
    }

    if (wrote) {
      riseAttr.needsUpdate = true;
    }
  });

  // ─── Smash: broken buildings as columns ────────────────────────
  // A broken building hides its box and draws its standing columns in its
  // slots after the buildings, each showing its share of the windows; the
  // ghost mesh draws the rest up to full height. Only the buildings that
  // changed are rewritten.

  // Building index → smash target (and back).
  const smashMap = useMemo(() => {
    const toTarget = new Int32Array(count).fill(-1);
    const toBuilding = new Map<number, number>();
    if (smash) {
      for (let i = 0; i < count; i++) {
        const k = smash.index.get(buildings[i].loginLower);
        if (k === undefined) continue;
        toTarget[i] = k;
        toBuilding.set(k, i);
      }
    }
    return { toTarget, toBuilding };
  }, [smash, buildings, count]);

  const ghostGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const ghostMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(ghostColor) } },
        vertexShader: ghostVertex,
        fragmentShader: ghostFragment,
        transparent: true,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    ghostMat.uniforms.uColor.value.set(ghostColor);
  }, [ghostMat, ghostColor]);
  useEffect(
    () => () => {
      ghostGeo.dispose();
      ghostMat.dispose();
    },
    [ghostGeo, ghostMat],
  );
  useEffect(() => {
    const g = ghostRef.current;
    if (!g) return;
    for (let i = 0; i < count; i++) g.setMatrixAt(i, _hidden);
    g.instanceMatrix.needsUpdate = true;
  }, [smash, count]);

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    const ghost = ghostRef.current;
    if (!smash || !mesh || !ghost) return;
    const moving = smash.frame(performance.now(), Math.min(dt, 0.1));
    const full = smash.version !== smashVersion.current;
    if (!full && moving.size === 0) return;
    smashVersion.current = smash.version;
    const uvF = uvFrontData;
    const uvS = uvSideData;

    const write = (i: number, k: number) => {
      const t = smash.targets[k];
      const b = buildings[i];
      const broken = smash.isBroken(k);
      if (broken) {
        mesh.setMatrixAt(i, _hidden);
        // Just outside the full box, so it outlines the building without z-fighting its columns.
        _position.set(b.position[0], b.height / 2, b.position[2]);
        _scale.set(b.width + 0.6, b.height + 0.3, b.depth + 0.6);
        ghost.setMatrixAt(i, _matrix.compose(_position, _quaternion, _scale));
      } else {
        ghost.setMatrixAt(i, _hidden);
        _position.set(b.position[0], b.height / 2, b.position[2]);
        _scale.set(b.width, b.height, b.depth);
        mesh.setMatrixAt(i, _matrix.compose(_position, _quaternion, _scale));
      }
      const nx = t.xs.length - 1;
      const nz = t.zs.length - 1;
      const x0 = t.x - t.w / 2;
      const z0 = t.z - t.d / 2;
      for (let c = 0; c < SMASH_SLOTS; c++) {
        const slot = count + i * SMASH_SLOTS + c;
        const a = c % nx;
        const bz = Math.floor(c / nx);
        if (!broken || c >= nx * nz) {
          mesh.setMatrixAt(slot, _hidden);
          continue;
        }
        const shown = smash.shown[k * SMASH_SLOTS + c];
        const lift = smash.drop[k * SMASH_SLOTS + c] * t.floorH;
        const gone = smash.rows[k * SMASH_SLOTS + c] === 0 && shown < 0.4 && lift === 0;
        const cx = x0 + ((t.xs[a] + t.xs[a + 1]) / 2) * t.w;
        const cz = z0 + ((t.zs[bz] + t.zs[bz + 1]) / 2) * t.d;
        const cw = (t.xs[a + 1] - t.xs[a]) * t.w;
        const cd = (t.zs[bz + 1] - t.zs[bz]) * t.d;
        // An emptied column is a low, crooked stump of rubble. A standing one
        // floats `lift` above the ground while it falls into its gap.
        const rows = gone ? 0.35 : shown;
        const h = rows * t.floorH;
        const jitter = gone ? ((c * 37 + i * 11) % 7) / 7 - 0.5 : 0;
        _yaw.setFromAxisAngle(_up, jitter * 0.5);
        if (h < 0.01) {
          mesh.setMatrixAt(slot, _hidden);
        } else {
          _position.set(cx, lift + h / 2, cz);
          _scale.set(cw * (gone ? 0.8 : 1), h, cd * (gone ? 0.8 : 1));
          mesh.setMatrixAt(slot, _matrix.compose(_position, _yaw, _scale));
        }
        // The windows that are left are the upper ones: they ride down with the column.
        const skip = gone ? 0 : (t.floors - rows) / ATLAS_COLS;
        uvF[slot * 4 + 0] = uvF[i * 4 + 0] + t.xs[a] * uvF[i * 4 + 2];
        uvF[slot * 4 + 1] = uvF[i * 4 + 1] + skip;
        uvF[slot * 4 + 2] = (t.xs[a + 1] - t.xs[a]) * uvF[i * 4 + 2];
        uvF[slot * 4 + 3] = rows / ATLAS_COLS;
        uvS[slot * 4 + 0] = uvS[i * 4 + 0] + t.zs[bz] * uvS[i * 4 + 2];
        uvS[slot * 4 + 1] = uvS[i * 4 + 1] + skip;
        uvS[slot * 4 + 2] = (t.zs[bz + 1] - t.zs[bz]) * uvS[i * 4 + 2];
        uvS[slot * 4 + 3] = rows / ATLAS_COLS;
      }
    };

    if (full) {
      for (let i = 0; i < count; i++) {
        const k = smashMap.toTarget[i];
        if (k >= 0) write(i, k);
      }
    } else {
      for (const k of moving) {
        const i = smashMap.toBuilding.get(k);
        if (i !== undefined) write(i, k);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    ghost.instanceMatrix.needsUpdate = true;
    const fa = mesh.geometry.getAttribute("aUvFront") as THREE.InstancedBufferAttribute | undefined;
    const sa = mesh.geometry.getAttribute("aUvSide") as THREE.InstancedBufferAttribute | undefined;
    if (fa) fa.needsUpdate = true;
    if (sa) sa.needsUpdate = true;
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
      // A broken building is its columns (slots after the buildings) and its
      // ghost (one per building, same index): both click as the building.
      ghostRef.current?.raycast(raycasterRef.current, hits);
      if (hits.length > 0) {
        hits.sort((a, b) => a.distance - b.distance);
        const id = hits[0].instanceId;
        if (id === undefined) return null;
        const n = buildingsRef.current.length;
        return hits[0].object === mesh && id >= n ? Math.floor((id - n) / SMASH_SLOTS) : id;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (introRef.current) return;
      if (wasAdPointerConsumed()) return;
      if ((window as any).__monumentClicked) return;
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
      if ((window as any).__monumentCursor) return;
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
    <>
      <instancedMesh
        ref={meshRef}
        args={[geo, material, capacity]}
        frustumCulled={false}
      />
      {smash && <instancedMesh ref={ghostRef} args={[ghostGeo, ghostMat, count]} frustumCulled={false} renderOrder={2} />}
    </>
  );
});
