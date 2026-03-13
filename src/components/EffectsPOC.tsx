"use client";

import { useState, useRef, useMemo, useEffect, memo } from "react";
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
import { ZONE_ITEMS, ITEM_NAMES, ITEM_EMOJIS } from "@/lib/zones";

// ─── Shared Geometries ──────────────────────────────────────
const _box = /* @__PURE__ */ new THREE.BoxGeometry(1, 1, 1);

// ─── Theme (Midnight, matching ShopPreview) ──────────────────
const THEME = {
  windowLit: ["#a0c0f0", "#80a0e0", "#6080c8", "#c0d8f8", "#e0e8ff"],
  windowOff: "#0c0e18",
  face: "#101828",
  roof: "#2a3858",
  fogColor: "#0a1428",
  ambientColor: "#4060b0",
  sunColor: "#7090d0",
  fillColor: "#304080",
  groundColor: "#242c38",
};

const ACCENT = "#c8e64a";
const STAR_GOLD = "#FFD700";
const WHITE = new THREE.Color("#ffffff");

// ═══════════════════════════════════════════════════════════════
// NEW EXPERIMENTAL EFFECTS
// ═══════════════════════════════════════════════════════════════

// ─── Shooting Star ───────────────────────────────────────────
// A golden star orbiting the building with a glowing particle trail

const TRAIL_COUNT = 40;

export const ShootingStar = memo(function ShootingStar({
  width,
  height,
  depth,
  color = STAR_GOLD,
}: {
  width: number;
  height: number;
  depth: number;
  color?: string;
}) {
  const starRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Points>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const frameCount = useRef(0);

  const orbitRadius = Math.max(width, depth) * 0.75;
  const orbitY = height * 0.6;

  const trailPositions = useMemo(() => {
    const arr = new Float32Array(TRAIL_COUNT * 3);
    // Initialize all trail points at origin
    for (let i = 0; i < TRAIL_COUNT * 3; i++) arr[i] = 0;
    return arr;
  }, []);

  const trailHistory = useRef<number[]>([]);

  useFrame((state) => {
    frameCount.current++;
    const t = state.clock.elapsedTime;

    // Star orbit position
    const x = Math.cos(t * 0.8) * orbitRadius;
    const y = orbitY + Math.sin(t * 1.6) * 4;
    const z = Math.sin(t * 0.8) * orbitRadius;

    if (starRef.current) {
      starRef.current.position.set(x, y, z);
      starRef.current.rotation.y = t * 2;
      starRef.current.rotation.z = t * 1.5;
      const mat = starRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 2.5 + Math.sin(t * 5) * 0.8;
    }

    // Glow follows star
    if (glowRef.current) {
      glowRef.current.position.set(x, y, z);
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + Math.sin(t * 5) * 0.05;
    }

    // Update trail (push new position, shift old ones)
    trailHistory.current.unshift(x, y, z);
    if (trailHistory.current.length > TRAIL_COUNT * 3) {
      trailHistory.current.length = TRAIL_COUNT * 3;
    }

    if (trailRef.current && frameCount.current % 2 === 0) {
      const arr = trailRef.current.geometry.attributes.position
        .array as Float32Array;
      for (let i = 0; i < TRAIL_COUNT * 3; i++) {
        arr[i] = trailHistory.current[i] ?? 0;
      }
      trailRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group position={[0, height * 0.5, 0]}>
      {/* Star body — octahedron for gem-like star */}
      <mesh ref={starRef}>
        <octahedronGeometry args={[1.8, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2.5}
          toneMapped={false}
        />
      </mesh>

      {/* Glow sphere around star */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[4, 8, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Particle trail */}
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[trailPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color={color}
          size={2}
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
});

// ─── Star Beam ───────────────────────────────────────────────
// Vertical beam of golden light shooting upward + floating star particles

const BEAM_PARTICLES = 50;

export const StarBeam = memo(function StarBeam({
  width,
  height,
  depth,
  color = STAR_GOLD,
}: {
  width: number;
  height: number;
  depth: number;
  color?: string;
}) {
  const beamRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const frameCount = useRef(0);
  const recycleCountsRef = useRef(new Uint16Array(BEAM_PARTICLES));

  const beamH = height * 2.5;
  const beamRadius = Math.min(width, depth) * 0.15;

  const { positions, speeds } = useMemo(() => {
    const pos = new Float32Array(BEAM_PARTICLES * 3);
    const spd = new Float32Array(BEAM_PARTICLES);
    for (let i = 0; i < BEAM_PARTICLES; i++) {
      const angle = pseudoRandom(i * 13.37 + beamRadius * 0.19 + beamH * 0.03) * Math.PI * 2;
      const r = pseudoRandom(i * 19.91 + beamRadius * 0.11 + beamH * 0.07) * beamRadius * 2;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = pseudoRandom(i * 23.17 + beamH * 0.13) * beamH;
      pos[i * 3 + 2] = Math.sin(angle) * r;
      spd[i] = 8 + pseudoRandom(i * 29.73 + beamRadius * 0.17) * 15;
    }
    return { positions: pos, speeds: spd };
  }, [beamH, beamRadius]);

  useEffect(() => {
    recycleCountsRef.current.fill(0);
  }, [beamH, beamRadius]);

  useFrame((state) => {
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;
    const t = state.clock.elapsedTime;

    // Beam pulse
    if (beamRef.current) {
      const mat = beamRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.1 + Math.sin(t * 2) * 0.04;
    }
    if (outerRef.current) {
      const mat = outerRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.04 + Math.sin(t * 1.5) * 0.02;
    }

    // Particles float upward
    if (particlesRef.current) {
      const arr = particlesRef.current.geometry.attributes.position
        .array as Float32Array;
      for (let i = 0; i < BEAM_PARTICLES; i++) {
        arr[i * 3 + 1] += speeds[i] * 0.033;
        if (arr[i * 3 + 1] > beamH) {
          recycleCountsRef.current[i] += 1;
          const n = recycleCountsRef.current[i];
          const angle = pseudoRandom((i + 1) * 31.7 + n * 7.9 + beamRadius * 0.23) * Math.PI * 2;
          const r = pseudoRandom((i + 1) * 47.3 + n * 11.1 + beamH * 0.17) * beamRadius * 2;
          arr[i * 3 + 1] = 0;
          arr[i * 3] = Math.cos(angle) * r;
          arr[i * 3 + 2] = Math.sin(angle) * r;
        }
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group position={[0, height, 0]}>
      {/* Inner beam */}
      <mesh ref={beamRef} position={[0, beamH / 2, 0]}>
        <cylinderGeometry args={[beamRadius * 0.5, beamRadius * 1.5, beamH, 8, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Outer glow */}
      <mesh ref={outerRef} position={[0, beamH / 2, 0]}>
        <cylinderGeometry args={[beamRadius * 1.5, beamRadius * 3, beamH * 0.9, 8, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.04}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Base glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <ringGeometry args={[beamRadius * 0.5, beamRadius * 3, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Star particles floating up */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color={color}
          size={2.5}
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
});

// ─── Starfall ────────────────────────────────────────────────
// Golden star-shaped particles gently falling around the building

const STARFALL_COUNT = 40;

type StarfallParticle = {
  x: number;
  y: number;
  z: number;
  speed: number;
  rotSpeed: number;
  size: number;
  sway: number;
  swaySpeed: number;
  seed: number;
  resets: number;
};

function createStarfallParticles(spread: number, topY: number, botY: number): StarfallParticle[] {
  const rangeY = topY - botY;
  return Array.from({ length: STARFALL_COUNT }, (_, i) => {
    const seed = i * 21.713 + spread * 0.09 + topY * 0.05 + botY * 0.03;
    return {
      x: (pseudoRandom(seed + 0.21) - 0.5) * spread * 2,
      y: botY + pseudoRandom(seed + 1.21) * rangeY,
      z: (pseudoRandom(seed + 2.21) - 0.5) * spread * 2,
      speed: 2 + pseudoRandom(seed + 3.21) * 4,
      rotSpeed: (pseudoRandom(seed + 4.21) - 0.5) * 3,
      size: 0.8 + pseudoRandom(seed + 5.21) * 1.2,
      sway: pseudoRandom(seed + 6.21) * Math.PI * 2,
      swaySpeed: 0.3 + pseudoRandom(seed + 7.21) * 0.7,
      seed,
      resets: 0,
    };
  });
}

export const Starfall = memo(function Starfall({
  width,
  height,
  depth,
  color = STAR_GOLD,
}: {
  width: number;
  height: number;
  depth: number;
  color?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const accDelta = useRef(0);
  const frameCount = useRef(0);

  const spread = Math.max(width, depth) * 1.3;
  const topY = height * 1.3;
  const botY = -height * 0.4;

  const initialStars = useMemo(
    () => createStarfallParticles(spread, topY, botY),
    [spread, topY, botY],
  );
  const starsRef = useRef<StarfallParticle[]>(initialStars.map((s) => ({ ...s })));

  useEffect(() => {
    starsRef.current = initialStars.map((s) => ({ ...s }));
  }, [initialStars]);

  useFrame((state, delta) => {
    accDelta.current += delta;
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;
    const dt = accDelta.current;
    accDelta.current = 0;

    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const ch = groupRef.current.children;

    const stars = starsRef.current;

    for (let i = 0; i < STARFALL_COUNT; i++) {
      const s = stars[i];
      const m = ch[i] as THREE.Mesh;
      if (!m) continue;

      s.y -= s.speed * dt;
      if (s.y < botY) {
        s.resets += 1;
        const rx = pseudoRandom(s.seed + s.resets * 9.17);
        const rz = pseudoRandom(s.seed + s.resets * 13.37);
        s.y = topY;
        s.x = (rx - 0.5) * spread * 2;
        s.z = (rz - 0.5) * spread * 2;
      }

      m.position.set(
        s.x + Math.sin(t * s.swaySpeed + s.sway) * 2,
        s.y,
        s.z + Math.cos(t * s.swaySpeed + s.sway) * 2
      );
      m.rotation.y = t * s.rotSpeed;
      m.rotation.z = t * s.rotSpeed * 0.5;

      // Fade near bottom
      const heightPct = (s.y - botY) / (topY - botY);
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.min(0.85, heightPct * 1.2);
    }
  });

  return (
    <group ref={groupRef} position={[0, height * 0.5, 0]}>
      {initialStars.map((s, i) => (
        <mesh
          key={i}
          position={[s.x, s.y, s.z]}
          scale={[s.size, s.size, s.size * 0.3]}
        >
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={3.5}
            toneMapped={false}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}
    </group>
  );
});

// ─── Shared: 5-pointed star shape ────────────────────────────

function createStarShape(
  outerR: number,
  innerR: number,
  points = 5
): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

const _starShape = /* @__PURE__ */ createStarShape(1, 0.4);
const _starGeo = /* @__PURE__ */ new THREE.ExtrudeGeometry(_starShape, {
  depth: 0.4,
  bevelEnabled: false,
});

// ─── GitHub Star (crown zone) ────────────────────────────────
// Giant golden 5-pointed star floating above the building like a trophy

export const GitHubStar = memo(function GitHubStar({
  width,
  height,
  depth,
  color = STAR_GOLD,
}: {
  width: number;
  height: number;
  depth: number;
  color?: string;
}) {
  const starRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const raysRef = useRef<THREE.Group>(null);
  const frameCount = useRef(0);

  const starScale = Math.min(width, depth) * 0.2;
  const floatY = height + 12;

  useFrame((state) => {
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;
    const t = state.clock.elapsedTime;

    if (starRef.current) {
      starRef.current.position.y = floatY + Math.sin(t * 0.8) * 2;
      starRef.current.rotation.y = t * 0.4;
      // Tilt slightly for 3D feel
      starRef.current.rotation.x = Math.sin(t * 0.3) * 0.15;
    }

    if (glowRef.current) {
      glowRef.current.position.y = floatY + Math.sin(t * 0.8) * 2;
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.12 + Math.sin(t * 2) * 0.05;
      const pulse = 1 + Math.sin(t * 2) * 0.1;
      glowRef.current.scale.setScalar(pulse);
    }

    // Light rays pulse
    if (raysRef.current) {
      raysRef.current.position.y = floatY + Math.sin(t * 0.8) * 2;
      raysRef.current.rotation.z = t * 0.15;
      raysRef.current.children.forEach((ray, i) => {
        const mat = (ray as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.06 + Math.sin(t * 3 + i * 1.2) * 0.04;
      });
    }
  });

  return (
    <group>
      {/* Star body */}
      <group ref={starRef} position={[0, floatY, 0]} scale={[starScale, starScale, starScale]}>
        <mesh geometry={_starGeo} rotation={[0, 0, 0]}>
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={3}
            toneMapped={false}
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>
        {/* Back face */}
        <mesh geometry={_starGeo} rotation={[0, Math.PI, 0]} position={[0, 0, 0.4]}>
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={3}
            toneMapped={false}
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>
      </group>

      {/* Glow sphere */}
      <mesh ref={glowRef} position={[0, floatY, 0]}>
        <sphereGeometry args={[starScale * 2, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Light rays radiating outward */}
      <group ref={raysRef} position={[0, floatY, 0]}>
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          const rayLen = starScale * 3.5;
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * rayLen * 0.5, Math.sin(angle) * rayLen * 0.5, 0]}
              rotation={[0, 0, angle - Math.PI / 2]}
              scale={[0.3, rayLen, 0.1]}
              geometry={_box}
            >
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.08}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
});

// ─── Star Orbit (aura zone) ─────────────────────────────────
// Multiple 5-pointed stars orbiting the building at different heights/speeds

const ORBIT_STARS = 6;

export const StarOrbit = memo(function StarOrbit({
  width,
  height,
  depth,
  color = STAR_GOLD,
}: {
  width: number;
  height: number;
  depth: number;
  color?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const frameCount = useRef(0);

  const orbitRadius = Math.max(width, depth) * 0.8;

  const orbits = useMemo(() => {
    return Array.from({ length: ORBIT_STARS }, (_, i) => ({
      offset: (i / ORBIT_STARS) * Math.PI * 2,
      speed: 0.4 + pseudoRandom(i * 17.7 + height * 0.03 + orbitRadius * 0.01) * 0.4,
      yBase: height * (0.15 + (i / ORBIT_STARS) * 0.7),
      yAmp: 2 + pseudoRandom(i * 23.3 + height * 0.05) * 3,
      radius: orbitRadius * (0.85 + pseudoRandom(i * 29.1 + depth * 0.07) * 0.3),
      scale: 1.2 + pseudoRandom(i * 31.9 + width * 0.09) * 1.0,
      tilt: (pseudoRandom(i * 37.5 + orbitRadius * 0.11) - 0.5) * 0.4,
    }));
  }, [height, orbitRadius, depth, width]);

  // Trail positions per star
  const TRAIL_PER_STAR = 12;
  const trailRef = useRef<THREE.Points>(null);
  const trailPositions = useMemo(
    () => new Float32Array(ORBIT_STARS * TRAIL_PER_STAR * 3),
    []
  );
  const trailHistories = useRef<number[][]>(
    Array.from({ length: ORBIT_STARS }, () => [])
  );

  useFrame((state) => {
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    const ch = groupRef.current.children;
    for (let i = 0; i < ORBIT_STARS; i++) {
      const o = orbits[i];
      const mesh = ch[i] as THREE.Group;
      if (!mesh) continue;

      const angle = t * o.speed + o.offset;
      const x = Math.cos(angle) * o.radius;
      const y = o.yBase + Math.sin(t * 1.5 + o.offset) * o.yAmp;
      const z = Math.sin(angle) * o.radius;

      mesh.position.set(x, y, z);
      mesh.rotation.y = t * 0.8 + o.offset;
      mesh.rotation.x = o.tilt;

      // Emissive pulse
      const star = mesh.children[0] as THREE.Mesh;
      if (star) {
        const mat = star.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 2.5 + Math.sin(t * 3 + o.offset) * 1;
      }

      // Update trail history
      const hist = trailHistories.current[i];
      hist.unshift(x, y, z);
      if (hist.length > TRAIL_PER_STAR * 3) hist.length = TRAIL_PER_STAR * 3;
    }

    // Write all trails to buffer
    if (trailRef.current) {
      const arr = trailRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < ORBIT_STARS; i++) {
        const hist = trailHistories.current[i];
        const baseIdx = i * TRAIL_PER_STAR * 3;
        for (let j = 0; j < TRAIL_PER_STAR * 3; j++) {
          arr[baseIdx + j] = hist[j] ?? 0;
        }
      }
      trailRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group position={[0, height * 0.5, 0]}>
      <group ref={groupRef}>
        {orbits.map((o, i) => (
          <group key={i} scale={[o.scale, o.scale, o.scale]}>
            <mesh geometry={_starGeo}>
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={2.5}
                toneMapped={false}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* All trails as one point cloud */}
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[trailPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color={color}
          size={1.5}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
});

// ─── Commit Stream (aura zone) ───────────────────────────────
// Green contribution squares (GitHub graph style) floating upward

const COMMIT_COUNT = 50;
const COMMIT_GREENS = ["#0e4429", "#006d32", "#26a641", "#39d353"];

type CommitParticle = {
  x: number;
  y: number;
  z: number;
  speed: number;
  size: number;
  sway: number;
  swaySpeed: number;
  color: string;
  emissiveIntensity: number;
  seed: number;
  resets: number;
};

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function createCommitParticles(spread: number, topY: number, botY: number): CommitParticle[] {
  const rangeY = topY - botY;
  return Array.from({ length: COMMIT_COUNT }, (_, i) => {
    const seed = i * 17.731 + spread * 0.13 + topY * 0.07 + botY * 0.11;
    const r0 = pseudoRandom(seed + 0.11);
    const r1 = pseudoRandom(seed + 1.11);
    const r2 = pseudoRandom(seed + 2.11);
    const r3 = pseudoRandom(seed + 3.11);
    const r4 = pseudoRandom(seed + 4.11);
    const r5 = pseudoRandom(seed + 5.11);
    const r6 = pseudoRandom(seed + 6.11);
    const green = COMMIT_GREENS[Math.floor(r0 * COMMIT_GREENS.length)];

    return {
      x: (r1 - 0.5) * spread * 2,
      y: botY + r2 * rangeY,
      z: (r3 - 0.5) * spread * 2,
      speed: 3 + r4 * 6,
      size: 0.5 + r5 * 0.8,
      sway: r6 * Math.PI * 2,
      swaySpeed: 0.2 + pseudoRandom(seed + 7.11) * 0.5,
      color: green,
      emissiveIntensity:
        green === "#39d353"
          ? 3.5
          : green === "#26a641"
            ? 2.5
            : green === "#006d32"
              ? 1.5
              : 0.8,
      seed,
      resets: 0,
    };
  });
}

export const CommitStream = memo(function CommitStream({
  width,
  height,
  depth,
}: {
  width: number;
  height: number;
  depth: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const accDelta = useRef(0);
  const frameCount = useRef(0);

  const spread = Math.max(width, depth) * 1.0;
  const topY = height * 1.4;
  const botY = -height * 0.1;

  const initialCommits = useMemo(
    () => createCommitParticles(spread, topY, botY),
    [spread, topY, botY],
  );
  const commitsRef = useRef<CommitParticle[]>(initialCommits.map((c) => ({ ...c })));

  useEffect(() => {
    commitsRef.current = initialCommits.map((c) => ({ ...c }));
  }, [initialCommits]);

  useFrame((state, delta) => {
    accDelta.current += delta;
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;
    const dt = accDelta.current;
    accDelta.current = 0;

    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const ch = groupRef.current.children;

    const commits = commitsRef.current;

    for (let i = 0; i < COMMIT_COUNT; i++) {
      const c = commits[i];
      const m = ch[i] as THREE.Mesh;
      if (!m) continue;

      c.y += c.speed * dt;
      if (c.y > topY) {
        c.resets += 1;
        const rr1 = pseudoRandom(c.seed + c.resets * 11.17);
        const rr2 = pseudoRandom(c.seed + c.resets * 19.43);
        c.y = botY;
        c.x = (rr1 - 0.5) * spread * 2;
        c.z = (rr2 - 0.5) * spread * 2;
      }

      m.position.set(
        c.x + Math.sin(t * c.swaySpeed + c.sway) * 1.5,
        c.y,
        c.z + Math.cos(t * c.swaySpeed + c.sway) * 1.5
      );
      m.rotation.y = t * 0.3;

      // Fade at edges
      const heightPct = (c.y - botY) / (topY - botY);
      const fade = heightPct < 0.1 ? heightPct / 0.1 : heightPct > 0.9 ? (1 - heightPct) / 0.1 : 1;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.opacity = fade * 0.9;
    }
  });

  return (
    <group ref={groupRef} position={[0, height * 0.5, 0]}>
      {initialCommits.map((c, i) => (
        <mesh
          key={i}
          position={[c.x, c.y, c.z]}
          geometry={_box}
          scale={[c.size, c.size, c.size * 0.2]}
        >
          <meshStandardMaterial
            color={c.color}
            emissive={c.color}
            emissiveIntensity={c.emissiveIntensity}
            toneMapped={false}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}
    </group>
  );
});

// ═══════════════════════════════════════════════════════════════
// POC CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const POC_ZONES: Record<string, string[]> = {
  crown: [...ZONE_ITEMS.crown, "github_star"],
  roof: [...ZONE_ITEMS.roof],
  aura: [...ZONE_ITEMS.aura, "shooting_star", "star_beam", "starfall", "star_orbit", "commit_stream"],
};

const POC_NAMES: Record<string, string> = {
  ...ITEM_NAMES,
  shooting_star: "Shooting Star",
  star_beam: "Star Beam",
  starfall: "Starfall",
  github_star: "GitHub Star",
  star_orbit: "Star Orbit",
  commit_stream: "Commit Stream",
};

const POC_EMOJIS: Record<string, string> = {
  ...ITEM_EMOJIS,
  shooting_star: "☄️",
  star_beam: "🌟",
  starfall: "🌠",
  github_star: "⭐",
  star_orbit: "💫",
  commit_stream: "🟩",
};

const NEW_ITEMS = new Set(["shooting_star", "star_beam", "starfall", "github_star", "star_orbit", "commit_stream"]);

// ─── Window texture (from ShopPreview) ───────────────────────

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

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = PAD + c * (WS + GAP);
      const y = PAD + r * (WS + GAP);
      if (rand() < 0.65) {
        ctx.fillStyle =
          THEME.windowLit[Math.floor(rand() * THEME.windowLit.length)];
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

// ─── Effect Router (existing + new) ─────────────────────────

interface BuildingDims {
  width: number;
  height: number;
  depth: number;
}

function EffectForItem({
  itemId,
  dims,
}: {
  itemId: string;
  dims: BuildingDims;
}) {
  switch (itemId) {
    // Existing effects
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
    // New POC effects
    case "shooting_star":
      return <ShootingStar {...dims} />;
    case "star_beam":
      return <StarBeam {...dims} />;
    case "starfall":
      return <Starfall {...dims} />;
    case "github_star":
      return <GitHubStar {...dims} />;
    case "star_orbit":
      return <StarOrbit {...dims} />;
    case "commit_stream":
      return <CommitStream {...dims} />;
    default:
      return null;
  }
}

// ─── 3D Preview Scene ────────────────────────────────────────

function PreviewScene({
  loadout,
  dims,
}: {
  loadout: { crown: string | null; roof: string | null; aura: string | null };
  dims: BuildingDims;
}) {
  const { width: W, height: H, depth: D } = dims;
  const groupRef = useRef<THREE.Group>(null);

  const floors = Math.max(2, Math.round(H / 5));
  const windowsPerFloor = Math.max(2, Math.round(W / 5));
  const sideWindowsPerFloor = Math.max(2, Math.round(D / 5));

  const textures = useMemo(() => {
    const seed = 42 * 137;
    const front = createPreviewWindowTexture(floors, windowsPerFloor, seed);
    const side = createPreviewWindowTexture(
      floors,
      sideWindowsPerFloor,
      seed + 7919
    );
    return { front, side };
  }, [floors, windowsPerFloor, sideWindowsPerFloor]);

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

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.3;
  });

  const groundSize = Math.max(400, Math.max(W, D) * 8);

  return (
    <>
      {/* Midnight theme — matching CityCanvas exactly */}
      <ambientLight intensity={0.55 * 3} color="#4060b0" />
      <directionalLight
        position={[300, 120, -200]}
        intensity={0.75 * 3.5}
        color="#7090d0"
      />
      <directionalLight
        position={[-200, 60, 200]}
        intensity={0.3 * 3}
        color="#304080"
      />
      <hemisphereLight args={["#5080a0", "#202830", 0.5 * 3.5]} />
      <fog attach="fog" args={[THEME.fogColor, H * 3, H * 15]} />

      <OrbitControls
        autoRotate
        autoRotateSpeed={0.8}
        enablePan
        screenSpacePanning
        minDistance={Math.max(15, H * 0.15)}
        maxDistance={Math.max(400, H * 8)}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI * 0.85}
        target={[0, H * 0.05, 0]}
      />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -H / 2, 0]}
      >
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial color={THEME.groundColor} />
      </mesh>

      <group ref={groupRef}>
        <mesh position={[0, 0, 0]} material={materials}>
          <boxGeometry args={[W, H, D]} />
        </mesh>

        <group position={[0, -H / 2, 0]}>
          <ClaimedGlow height={H} width={W} depth={D} />
        </group>

        <group position={[0, -H / 2, 0]}>
          {(["crown", "roof", "aura"] as const).map((zone) => {
            const itemId = loadout[zone];
            return itemId ? (
              <EffectForItem key={zone} itemId={itemId} dims={dims} />
            ) : null;
          })}
        </group>
      </group>
    </>
  );
}

// ─── Zone Selector UI ────────────────────────────────────────

function ZoneSelector({
  zone,
  label,
  items,
  selected,
  onSelect,
}: {
  zone: string;
  label: string;
  items: string[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">
          {label}
        </h3>
        {selected && (
          <button
            onClick={() => onSelect(null)}
            className="text-[10px] text-white/40 hover:text-white/70 uppercase"
          >
            Clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((id) => {
          const isNew = NEW_ITEMS.has(id);
          const isActive = selected === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(isActive ? null : id)}
              className={`
                relative px-2 py-1.5 text-left text-[11px] rounded transition-all
                ${
                  isActive
                    ? "bg-white/15 text-white ring-1 ring-white/30"
                    : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                }
                ${isNew ? "ring-1 ring-amber-500/40" : ""}
              `}
            >
              {isNew && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[7px] font-bold px-1 rounded-sm uppercase">
                  New
                </span>
              )}
              <span className="mr-1">{POC_EMOJIS[id] ?? ""}</span>
              {POC_NAMES[id] ?? id}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main POC Component ──────────────────────────────────────

export default function EffectsPOC() {
  const [loadout, setLoadout] = useState<{
    crown: string | null;
    roof: string | null;
    aura: string | null;
  }>({
    crown: "github_star",
    roof: null,
    aura: "star_orbit",
  });

  const dims: BuildingDims = { width: 24, height: 42, depth: 18 };
  const camDist = Math.max(80, dims.height * 2.5);

  const setZone = (zone: "crown" | "roof" | "aura") => (id: string | null) => {
    setLoadout((prev) => ({ ...prev, [zone]: id }));
  };

  return (
    <div className="flex h-screen bg-[#0a0e1a] text-white">
      {/* 3D Preview */}
      <div className="flex-1 relative" style={{ backgroundColor: THEME.fogColor }}>
        <Canvas
          camera={{
            position: [camDist * 0.5, camDist * 0.3, camDist * 0.7],
            fov: 45,
          }}
          gl={{ antialias: false }}
        >
          <color attach="background" args={[THEME.fogColor]} />
          <PreviewScene loadout={loadout} dims={dims} />
        </Canvas>

        {/* Active effects label */}
        <div className="absolute top-4 left-4">
          <h1 className="text-sm font-bold uppercase tracking-widest text-white/40">
            Effects POC
          </h1>
          <div className="mt-2 flex flex-wrap gap-1">
            {(["crown", "roof", "aura"] as const).map((zone) => {
              const id = loadout[zone];
              if (!id) return null;
              return (
                <span
                  key={zone}
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    NEW_ITEMS.has(id)
                      ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30"
                      : "bg-white/10 text-white/60"
                  }`}
                >
                  {POC_EMOJIS[id]} {POC_NAMES[id]}
                </span>
              );
            })}
          </div>
        </div>

        {/* Controls hint */}
        <div className="absolute bottom-3 left-3 text-[9px] text-white/30">
          Scroll: zoom · Drag: rotate · Right-drag: move
        </div>
      </div>

      {/* Control Panel */}
      <div className="w-70 bg-[#0d1220] border-l border-white/10 overflow-y-auto p-4 flex flex-col">
        <div className="mb-4 pb-3 border-b border-white/10">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">
            Building Effects
          </h2>
          <p className="text-[10px] text-white/30 mt-1">
            Select one effect per zone
          </p>
        </div>

        <ZoneSelector
          zone="aura"
          label="Aura"
          items={POC_ZONES.aura}
          selected={loadout.aura}
          onSelect={setZone("aura")}
        />

        <ZoneSelector
          zone="crown"
          label="Crown"
          items={POC_ZONES.crown}
          selected={loadout.crown}
          onSelect={setZone("crown")}
        />

        <ZoneSelector
          zone="roof"
          label="Roof"
          items={POC_ZONES.roof}
          selected={loadout.roof}
          onSelect={setZone("roof")}
        />

        <div className="mt-auto pt-4 border-t border-white/10">
          <p className="text-[9px] text-white/25 text-center">
            Items marked NEW are experimental
          </p>
        </div>
      </div>
    </div>
  );
}
