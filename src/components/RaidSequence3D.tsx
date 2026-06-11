"use client";

import { useRef, useMemo, useEffect, useState, Suspense, type ReactElement } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { resolveModelUrl } from "@/lib/cosmetics/modelBase";
import type { RaidPhase } from "@/lib/useRaidSequence";
import type { RaidExecuteResponse } from "@/lib/raid";
import type { CityBuilding } from "@/lib/github";
import { playRaidSound } from "@/lib/raidAudio";

// ─── Types ────────────────────────────────────────────────────

interface Props {
  phase: RaidPhase;
  attacker: CityBuilding | null;
  defender: CityBuilding | null;
  raidData: RaidExecuteResponse | null;
  onPhaseComplete: (phase: RaidPhase) => void;
}

// ─── Constants ────────────────────────────────────────────────

const ATTACK_DURATION = 6;
const ORBIT_RADIUS = 55;
const ORBIT_HEIGHT = 30;
const ORBIT_SPEED = 0.8;
const PROJECTILE_COUNT = 15;
const DEBRIS_COUNT = 50;
const SMOKE_COUNT = 40;

// ─── Easing ───────────────────────────────────────────────────

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// ─── Vehicle Components (all face -Z for correct lookAt) ─────

function CRTTerminalMesh() {
  const screenRef = useRef<THREE.MeshStandardMaterial>(null);
  const ledRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (screenRef.current) {
      screenRef.current.emissiveIntensity = 2.2 + Math.sin(t * 18) * 0.25 + Math.sin(t * 3) * 0.15;
    }
    if (ledRef.current) {
      ledRef.current.emissiveIntensity = 1.5 + Math.sin(t * 2) * 0.5;
    }
  });

  return (
    <group>
      {/* Main CRT housing (front of vehicle = -Z, screen faces forward) */}
      <mesh>
        <boxGeometry args={[3.2, 2.6, 3.6]} />
        <meshStandardMaterial color="#d4c4a8" emissive="#6b5d44" emissiveIntensity={0.25} />
      </mesh>
      {/* Top bevel */}
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[3, 0.12, 3.4]} />
        <meshStandardMaterial color="#b8a888" emissive="#5a4d36" emissiveIntensity={0.2} />
      </mesh>
      {/* Bottom bevel */}
      <mesh position={[0, -1.35, 0]}>
        <boxGeometry args={[3, 0.12, 3.4]} />
        <meshStandardMaterial color="#b8a888" emissive="#5a4d36" emissiveIntensity={0.2} />
      </mesh>
      {/* Bezel (black frame around screen) */}
      <mesh position={[0, 0.1, -1.82]}>
        <boxGeometry args={[2.8, 2.1, 0.08]} />
        <meshStandardMaterial color="#1a1a1a" emissive="#000000" emissiveIntensity={0} />
      </mesh>
      {/* The screen itself (glowing green Matrix vibe) */}
      <mesh position={[0, 0.1, -1.85]}>
        <boxGeometry args={[2.4, 1.7, 0.05]} />
        <meshStandardMaterial
          ref={screenRef}
          color="#0a3a1a"
          emissive="#00ff66"
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
      {/* Scanline overlay (subtle dark band across screen) */}
      <mesh position={[0, 0.1, -1.87]}>
        <boxGeometry args={[2.4, 0.04, 0.02]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.5} />
      </mesh>
      {/* Brand label below screen */}
      <mesh position={[0, -1.05, -1.82]}>
        <boxGeometry args={[2.6, 0.35, 0.05]} />
        <meshStandardMaterial color="#a89878" emissive="#4a3d28" emissiveIntensity={0.2} />
      </mesh>
      {/* Power LED (red, blinking) */}
      <mesh position={[1.05, -1.05, -1.82]}>
        <boxGeometry args={[0.12, 0.12, 0.06]} />
        <meshStandardMaterial
          ref={ledRef}
          color="#ff2200"
          emissive="#ff3300"
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
      {/* Power button */}
      <mesh position={[-1.05, -1.05, -1.82]}>
        <boxGeometry args={[0.18, 0.18, 0.06]} />
        <meshStandardMaterial color="#2a2a2a" emissive="#1a1a1a" emissiveIntensity={0.2} />
      </mesh>
      {/* Bottom face: 3 control knobs */}
      <mesh position={[-0.5, -1.05, -1.82]}>
        <boxGeometry args={[0.16, 0.16, 0.05]} />
        <meshStandardMaterial color="#3a3a3a" emissive="#1a1a1a" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-0.15, -1.05, -1.82]}>
        <boxGeometry args={[0.16, 0.16, 0.05]} />
        <meshStandardMaterial color="#3a3a3a" emissive="#1a1a1a" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0.2, -1.05, -1.82]}>
        <boxGeometry args={[0.16, 0.16, 0.05]} />
        <meshStandardMaterial color="#3a3a3a" emissive="#1a1a1a" emissiveIntensity={0.2} />
      </mesh>
      {/* Back vents (heat sink ridges) */}
      <mesh position={[0, 0.6, 1.81]}>
        <boxGeometry args={[2.4, 0.08, 0.05]} />
        <meshStandardMaterial color="#3a3326" emissive="#1a1612" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 0.3, 1.81]}>
        <boxGeometry args={[2.4, 0.08, 0.05]} />
        <meshStandardMaterial color="#3a3326" emissive="#1a1612" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 0, 1.81]}>
        <boxGeometry args={[2.4, 0.08, 0.05]} />
        <meshStandardMaterial color="#3a3326" emissive="#1a1612" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, -0.3, 1.81]}>
        <boxGeometry args={[2.4, 0.08, 0.05]} />
        <meshStandardMaterial color="#3a3326" emissive="#1a1612" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, -0.6, 1.81]}>
        <boxGeometry args={[2.4, 0.08, 0.05]} />
        <meshStandardMaterial color="#3a3326" emissive="#1a1612" emissiveIntensity={0.2} />
      </mesh>
      {/* VGA cable tail (trails behind) */}
      <mesh position={[0, -0.4, 2.2]}>
        <boxGeometry args={[0.18, 0.18, 0.8]} />
        <meshStandardMaterial color="#222" emissive="#111" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, -0.4, 2.9]}>
        <boxGeometry args={[0.12, 0.12, 0.6]} />
        <meshStandardMaterial color="#333" emissive="#222" emissiveIntensity={0.2} />
      </mesh>
      {/* Base/stand (pedestal under monitor) */}
      <mesh position={[0, -1.55, 0]}>
        <boxGeometry args={[1.4, 0.25, 1.4]} />
        <meshStandardMaterial color="#b8a888" emissive="#5a4d36" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, -1.78, 0]}>
        <boxGeometry args={[2, 0.2, 2]} />
        <meshStandardMaterial color="#a89878" emissive="#4a3d28" emissiveIntensity={0.2} />
      </mesh>
      {/* Left rabbit-ear antenna (angled outward) */}
      <mesh position={[-0.9, 2.2, 0.3]} rotation={[0, 0, -0.35]}>
        <boxGeometry args={[0.06, 1.8, 0.06]} />
        <meshStandardMaterial color="#999" emissive="#666" emissiveIntensity={0.3} />
      </mesh>
      {/* Right rabbit-ear antenna (angled outward) */}
      <mesh position={[0.9, 2.2, 0.3]} rotation={[0, 0, 0.35]}>
        <boxGeometry args={[0.06, 1.8, 0.06]} />
        <meshStandardMaterial color="#999" emissive="#666" emissiveIntensity={0.3} />
      </mesh>
      {/* Antenna base nubs */}
      <mesh position={[-0.7, 1.4, 0.3]}>
        <boxGeometry args={[0.15, 0.15, 0.15]} />
        <meshStandardMaterial color="#555" emissive="#333" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.7, 1.4, 0.3]}>
        <boxGeometry args={[0.15, 0.15, 0.15]} />
        <meshStandardMaterial color="#555" emissive="#333" emissiveIntensity={0.3} />
      </mesh>
      {/* Screen glow light (green, in front of monitor) */}
      <pointLight position={[0, 0.1, -3]} color="#00ff66" intensity={4} distance={14} />
      {/* Subtle ambient warm light from CRT phosphor */}
      <pointLight position={[0, 0, 0]} color="#aaffaa" intensity={0.8} distance={6} />
    </group>
  );
}

function MechanicalKeyboardMesh() {
  const keycapsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const ledRef = useRef<THREE.MeshStandardMaterial>(null);

  // 5 rows x 14 cols layout (representative mechanical keyboard)
  const keycaps = useMemo(() => {
    const list: { x: number; z: number; idx: number }[] = [];
    const rows = 5;
    const cols = 14;
    const spacingX = 0.42;
    const spacingZ = 0.42;
    const startX = -((cols - 1) * spacingX) / 2;
    const startZ = -((rows - 1) * spacingZ) / 2;
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        list.push({ x: startX + c * spacingX, z: startZ + r * spacingZ, idx: idx++ });
      }
    }
    return list;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    keycapsRef.current.forEach((mat, i) => {
      if (!mat) return;
      const k = keycaps[i];
      // Single-color wave (green Matrix) rolling across the keyboard
      const phase = (k.x + k.z) * 1.5 + t * 2.5;
      mat.emissiveIntensity = 0.5 + Math.max(0, Math.sin(phase)) * 1.2;
    });
    if (ledRef.current) {
      ledRef.current.emissiveIntensity = 1.5 + Math.sin(t * 2) * 0.5;
    }
  });

  return (
    <group>
      {/* Chassis (matte beige body, matching CRT palette) */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[6.4, 0.5, 2.4]} />
        <meshStandardMaterial color="#d4c4a8" emissive="#6b5d44" emissiveIntensity={0.25} />
      </mesh>
      {/* Top plate (darker beige inset) */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[6.2, 0.08, 2.2]} />
        <meshStandardMaterial color="#b8a888" emissive="#5a4d36" emissiveIntensity={0.2} />
      </mesh>
      {/* Keycaps grid (beige caps with subtle green legend glow) */}
      {keycaps.map((k) => (
        <mesh key={k.idx} position={[k.x, 0.24, k.z]}>
          <boxGeometry args={[0.34, 0.22, 0.34]} />
          <meshStandardMaterial
            ref={(el) => { if (el) keycapsRef.current[k.idx] = el; }}
            color="#a89878"
            emissive="#00ff66"
            emissiveIntensity={0.5}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* Spacebar (wider keycap at bottom-front) */}
      <mesh position={[0, 0.24, 1.05]}>
        <boxGeometry args={[3.4, 0.22, 0.34]} />
        <meshStandardMaterial color="#a89878" emissive="#5a4d36" emissiveIntensity={0.3} />
      </mesh>
      {/* Caps Lock LED (single green indicator, blinking) */}
      <mesh position={[2.85, 0.18, -0.85]}>
        <boxGeometry args={[0.1, 0.06, 0.1]} />
        <meshStandardMaterial
          ref={ledRef}
          color="#0a3a1a"
          emissive="#00ff66"
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
      {/* USB-C braided cable (curling out the back) */}
      <mesh position={[0, 0.05, 1.45]}>
        <boxGeometry args={[0.18, 0.18, 0.4]} />
        <meshStandardMaterial color="#2a2a2a" emissive="#111" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 0.05, 1.85]}>
        <boxGeometry args={[0.14, 0.14, 0.5]} />
        <meshStandardMaterial color="#333" emissive="#111" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0.2, 0.1, 2.3]}>
        <boxGeometry args={[0.12, 0.12, 0.5]} />
        <meshStandardMaterial color="#444" emissive="#111" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0.5, 0.2, 2.7]}>
        <boxGeometry args={[0.12, 0.12, 0.5]} />
        <meshStandardMaterial color="#444" emissive="#222" emissiveIntensity={0.2} />
      </mesh>
      {/* Feet (small dark pads underneath) */}
      <mesh position={[-2.8, -0.5, -1]}>
        <boxGeometry args={[0.3, 0.1, 0.3]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[2.8, -0.5, -1]}>
        <boxGeometry args={[0.3, 0.1, 0.3]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[-2.8, -0.5, 1]}>
        <boxGeometry args={[0.3, 0.1, 0.3]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[2.8, -0.5, 1]}>
        <boxGeometry args={[0.3, 0.1, 0.3]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Soft green ambient light (only color, matching CRT screen) */}
      <pointLight position={[0, 0.5, 0]} color="#00ff66" intensity={1.2} distance={5} />
    </group>
  );
}

function PCTowerMesh() {
  const powerLedRef = useRef<THREE.MeshStandardMaterial>(null);
  const hddLedRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (powerLedRef.current) {
      powerLedRef.current.emissiveIntensity = 1.4 + Math.sin(t * 2) * 0.3;
    }
    if (hddLedRef.current) {
      // Random HDD activity flicker (irregular bursts)
      const burst = Math.sin(t * 13) > 0.3 ? 1 + Math.random() * 0.8 : 0.15;
      hddLedRef.current.emissiveIntensity = burst * 1.6;
    }
  });

  return (
    <group>
      {/* Main tower body (vertical beige case, matching CRT housing) */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[2.2, 4, 2.6]} />
        <meshStandardMaterial color="#d4c4a8" emissive="#6b5d44" emissiveIntensity={0.25} />
      </mesh>
      {/* Top bevel */}
      <mesh position={[0, 2.55, 0]}>
        <boxGeometry args={[2, 0.12, 2.4]} />
        <meshStandardMaterial color="#b8a888" emissive="#5a4d36" emissiveIntensity={0.2} />
      </mesh>
      {/* Bottom bevel */}
      <mesh position={[0, -1.55, 0]}>
        <boxGeometry args={[2, 0.12, 2.4]} />
        <meshStandardMaterial color="#b8a888" emissive="#5a4d36" emissiveIntensity={0.2} />
      </mesh>
      {/* Front panel inset (slightly recessed darker area) */}
      <mesh position={[0, 0.5, -1.32]}>
        <boxGeometry args={[1.9, 3.7, 0.05]} />
        <meshStandardMaterial color="#b8a888" emissive="#5a4d36" emissiveIntensity={0.2} />
      </mesh>
      {/* CD-ROM drive (top slot, horizontal) */}
      <mesh position={[0, 1.7, -1.35]}>
        <boxGeometry args={[1.7, 0.5, 0.06]} />
        <meshStandardMaterial color="#1a1a1a" emissive="#0a0a0a" emissiveIntensity={0.2} />
      </mesh>
      {/* CD-ROM tray slot (the thin opening) */}
      <mesh position={[0, 1.65, -1.37]}>
        <boxGeometry args={[1.5, 0.06, 0.04]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      {/* CD-ROM eject button */}
      <mesh position={[0.65, 1.78, -1.37]}>
        <boxGeometry args={[0.1, 0.06, 0.04]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      {/* CD-ROM label/brand */}
      <mesh position={[-0.6, 1.78, -1.37]}>
        <boxGeometry args={[0.3, 0.08, 0.04]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      {/* Floppy drive (middle slot, 3.5") */}
      <mesh position={[0, 0.95, -1.35]}>
        <boxGeometry args={[1.4, 0.3, 0.06]} />
        <meshStandardMaterial color="#1a1a1a" emissive="#0a0a0a" emissiveIntensity={0.2} />
      </mesh>
      {/* Floppy slot opening */}
      <mesh position={[-0.1, 0.95, -1.37]}>
        <boxGeometry args={[1.1, 0.06, 0.04]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      {/* Floppy eject button (square) */}
      <mesh position={[0.55, 0.95, -1.37]}>
        <boxGeometry args={[0.1, 0.1, 0.04]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      {/* Floppy activity LED (small, green) */}
      <mesh position={[0.55, 1.08, -1.37]}>
        <boxGeometry args={[0.06, 0.04, 0.04]} />
        <meshStandardMaterial color="#0a3a1a" emissive="#00ff66" emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
      {/* Brand label area (small text panel) */}
      <mesh position={[0, 0.3, -1.36]}>
        <boxGeometry args={[1.6, 0.18, 0.04]} />
        <meshStandardMaterial color="#a89878" emissive="#4a3d28" emissiveIntensity={0.2} />
      </mesh>
      {/* Power button (big square with bevel) */}
      <mesh position={[0, -0.4, -1.36]}>
        <boxGeometry args={[0.5, 0.5, 0.08]} />
        <meshStandardMaterial color="#2a2a2a" emissive="#1a1a1a" emissiveIntensity={0.2} />
      </mesh>
      {/* Power button inner */}
      <mesh position={[0, -0.4, -1.4]}>
        <boxGeometry args={[0.3, 0.3, 0.04]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      {/* Power LED (large, green, slow pulse) */}
      <mesh position={[-0.7, -0.4, -1.37]}>
        <boxGeometry args={[0.14, 0.14, 0.06]} />
        <meshStandardMaterial
          ref={powerLedRef}
          color="#0a3a1a"
          emissive="#00ff66"
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
      {/* HDD activity LED (small, green, random flicker) */}
      <mesh position={[0.7, -0.4, -1.37]}>
        <boxGeometry args={[0.1, 0.1, 0.06]} />
        <meshStandardMaterial
          ref={hddLedRef}
          color="#0a3a1a"
          emissive="#00ff66"
          emissiveIntensity={0.3}
          toneMapped={false}
        />
      </mesh>
      {/* Reset button (small) */}
      <mesh position={[-0.7, -0.8, -1.37]}>
        <boxGeometry args={[0.12, 0.12, 0.04]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      {/* Bottom vents (5 horizontal slots) */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, -1.05 - i * 0.05, -1.36]}>
          <boxGeometry args={[1.7, 0.025, 0.04]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      ))}
      {/* Side vents (left) */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`vl${i}`} position={[-1.11, 0.5 + i * 0.4, 0]}>
          <boxGeometry args={[0.04, 0.06, 1.5]} />
          <meshStandardMaterial color="#3a3326" emissive="#1a1612" emissiveIntensity={0.2} />
        </mesh>
      ))}
      {/* Side vents (right) */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`vr${i}`} position={[1.11, 0.5 + i * 0.4, 0]}>
          <boxGeometry args={[0.04, 0.06, 1.5]} />
          <meshStandardMaterial color="#3a3326" emissive="#1a1612" emissiveIntensity={0.2} />
        </mesh>
      ))}
      {/* Back cables */}
      <mesh position={[0.5, 0, 1.4]}>
        <boxGeometry args={[0.15, 0.15, 0.6]} />
        <meshStandardMaterial color="#222" emissive="#111" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0.5, 0.1, 1.8]}>
        <boxGeometry args={[0.12, 0.12, 0.5]} />
        <meshStandardMaterial color="#333" emissive="#111" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-0.5, 0, 1.4]}>
        <boxGeometry args={[0.18, 0.18, 0.5]} />
        <meshStandardMaterial color="#222" emissive="#111" emissiveIntensity={0.2} />
      </mesh>
      {/* Feet (4 small pads) */}
      <mesh position={[-0.9, -1.7, -1]}>
        <boxGeometry args={[0.2, 0.1, 0.2]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0.9, -1.7, -1]}>
        <boxGeometry args={[0.2, 0.1, 0.2]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[-0.9, -1.7, 1]}>
        <boxGeometry args={[0.2, 0.1, 0.2]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0.9, -1.7, 1]}>
        <boxGeometry args={[0.2, 0.1, 0.2]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Lighting (subtle front glow only, like the CRT) */}
      <pointLight position={[0, 0, -2]} color="#00ff66" intensity={2} distance={7} />
    </group>
  );
}

function HackerRigMesh() {
  const steamRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (steamRef.current) {
      steamRef.current.position.y = 0.7 + Math.sin(t * 1.5) * 0.05;
      const mat = steamRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.25 + Math.sin(t * 1.5) * 0.1;
    }
  });

  return (
    <group>
      {/* Desk surface (compact beige wood, matching CRT housing) */}
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[4, 0.18, 2.4]} />
        <meshStandardMaterial color="#b8a888" emissive="#5a4d36" emissiveIntensity={0.2} />
      </mesh>
      {/* Desk edge trim */}
      <mesh position={[0, -0.01, -1.18]}>
        <boxGeometry args={[4, 0.06, 0.04]} />
        <meshStandardMaterial color="#a89878" emissive="#4a3d28" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, -0.01, 1.18]}>
        <boxGeometry args={[4, 0.06, 0.04]} />
        <meshStandardMaterial color="#a89878" emissive="#4a3d28" emissiveIntensity={0.2} />
      </mesh>

      {/* CRT terminal in the center-back (scaled down, sits on desk, screen faces the keyboard) */}
      <group position={[0, 0.95, -0.55]} scale={0.45} rotation={[0, Math.PI, 0]}>
        <CRTTerminalMesh />
      </group>

      {/* Mechanical keyboard in the front (scaled down, sits on desk) */}
      <group position={[0, 0.05, 0.6]} scale={0.3}>
        <MechanicalKeyboardMesh />
      </group>

      {/* Mousepad to the right of the keyboard */}
      <mesh position={[1.15, 0.0, 0.6]}>
        <boxGeometry args={[0.55, 0.02, 0.5]} />
        <meshStandardMaterial color="#1a1a1a" emissive="#0a0a0a" emissiveIntensity={0.2} />
      </mesh>
      {/* Mouse body (small, dark, slightly curved silhouette) */}
      <mesh position={[1.15, 0.07, 0.6]}>
        <boxGeometry args={[0.18, 0.08, 0.28]} />
        <meshStandardMaterial color="#1a1a1a" emissive="#0a0a0a" emissiveIntensity={0.2} />
      </mesh>
      {/* Mouse scroll wheel hint (tiny detail on top) */}
      <mesh position={[1.15, 0.12, 0.52]}>
        <boxGeometry args={[0.04, 0.02, 0.06]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      {/* Mouse USB cable trailing back */}
      <mesh position={[1.15, 0.06, 0.78]}>
        <boxGeometry args={[0.04, 0.04, 0.12]} />
        <meshStandardMaterial color="#222" emissive="#111" emissiveIntensity={0.2} />
      </mesh>

      {/* Floppy disk stack on left side (4 disks) */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i}>
          {/* Disk body */}
          <mesh position={[-1.5, 0.05 + i * 0.09, 0.2]}>
            <boxGeometry args={[0.75, 0.07, 0.75]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? "#1a1a1a" : "#2a2a2a"}
              emissive="#0a0a0a"
              emissiveIntensity={0.2}
            />
          </mesh>
          {/* Metal shutter */}
          <mesh position={[-1.5, 0.05 + i * 0.09, -0.05]}>
            <boxGeometry args={[0.35, 0.075, 0.18]} />
            <meshStandardMaterial color="#888" emissive="#555" emissiveIntensity={0.3} />
          </mesh>
          {/* Label area (beige sticker) */}
          <mesh position={[-1.5, 0.09 + i * 0.09, 0.32]}>
            <boxGeometry args={[0.6, 0.005, 0.35]} />
            <meshStandardMaterial color="#d4c4a8" emissive="#6b5d44" emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}

      {/* Coffee mug on right side, behind the mouse (beige, matching CRT housing) */}
      <mesh position={[1.6, 0.25, -0.4]}>
        <boxGeometry args={[0.42, 0.55, 0.42]} />
        <meshStandardMaterial color="#d4c4a8" emissive="#6b5d44" emissiveIntensity={0.25} />
      </mesh>
      {/* Mug handle */}
      <mesh position={[1.88, 0.27, -0.4]}>
        <boxGeometry args={[0.1, 0.28, 0.1]} />
        <meshStandardMaterial color="#b8a888" emissive="#5a4d36" emissiveIntensity={0.2} />
      </mesh>
      {/* Coffee inside (dark surface, faint green reflection) */}
      <mesh position={[1.6, 0.5, -0.4]}>
        <boxGeometry args={[0.36, 0.02, 0.36]} />
        <meshStandardMaterial color="#1a0e05" emissive="#0a2a14" emissiveIntensity={0.4} />
      </mesh>
      {/* Steam (subtle white puff that floats) */}
      <mesh ref={steamRef} position={[1.6, 0.7, -0.4]}>
        <boxGeometry args={[0.2, 0.3, 0.2]} />
        <meshStandardMaterial color="#ffffff" emissive="#aaffaa" emissiveIntensity={0.3} transparent opacity={0.25} />
      </mesh>

    </group>
  );
}

// ─── Vehicle dispatch ─────────────────────────────────────────────
// Legacy vehicles are hand-coded meshes. Every NEW vehicle is data-driven: a
// GLB in Supabase Storage (cosmetic-models/vehicles/<id>.glb) + a catalog row.
// VehicleMesh resolves the model from the storage base by id, so adding a
// vehicle is upload + DB row — never a code change or a git commit.
const BUILTIN_VEHICLES: Record<string, () => ReactElement> = {
  airplane: () => <CRTTerminalMesh />,
  raid_helicopter: () => <MechanicalKeyboardMesh />,
  raid_drone: () => <PCTowerMesh />,
  raid_rocket: () => <HackerRigMesh />,
};

// Loads a GLB vehicle from a URL. useGLTF suspends + caches per-URL; clone so
// multiple pilots fly it independently. Scaled ~0.9 to match the CRT footprint.
function GLBVehicle({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <group scale={0.9}><primitive object={scene} /></group>;
}

export function VehicleMesh({ type, propagateSuspense = false }: { type: string; propagateSuspense?: boolean }) {
  const builtin = BUILTIN_VEHICLES[type];
  if (builtin) return builtin();
  const node = <GLBVehicle url={resolveModelUrl(`vehicles/${type}.glb`)} />;
  // Live use: show the CRT while the model loads. Thumbnail factory: let the
  // suspension bubble up (propagateSuspense) so the snapshot waits for the model.
  return propagateSuspense ? node : <Suspense fallback={<CRTTerminalMesh />}>{node}</Suspense>;
}

// ─── Smoke Trail ──────────────────────────────────────────────

function SmokeTrail({ vehicleRef, active }: {
  vehicleRef: React.RefObject<THREE.Group | null>;
  active: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particles = useRef<{
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    age: number;
    maxAge: number;
  }[]>([]);
  const _matrix = useMemo(() => new THREE.Matrix4(), []);
  const _scale = useMemo(() => new THREE.Vector3(), []);
  const _worldPos = useMemo(() => new THREE.Vector3(), []);
  const _backward = useMemo(() => new THREE.Vector3(), []);
  const spawnTimer = useRef(0);

  useEffect(() => {
    if (!active) particles.current = [];
  }, [active]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    if (active && vehicleRef.current) {
      spawnTimer.current += delta;
      if (spawnTimer.current >= 0.03) {
        spawnTimer.current = 0;
        vehicleRef.current.getWorldPosition(_worldPos);
        _backward.set(0, 0, 1).applyQuaternion(vehicleRef.current.quaternion);

        const spawnPos = _worldPos.clone().add(_backward.clone().multiplyScalar(6));

        if (particles.current.length < SMOKE_COUNT) {
          particles.current.push({
            pos: spawnPos,
            vel: new THREE.Vector3(
              (Math.random() - 0.5) * 2,
              Math.random() * 3 + 1,
              (Math.random() - 0.5) * 2,
            ),
            age: 0,
            maxAge: 0.8 + Math.random() * 0.6,
          });
        } else {
          let oldest = 0;
          for (let i = 1; i < particles.current.length; i++) {
            if (particles.current[i].age > particles.current[oldest].age) oldest = i;
          }
          const p = particles.current[oldest];
          p.pos.copy(spawnPos);
          p.vel.set(
            (Math.random() - 0.5) * 2,
            Math.random() * 3 + 1,
            (Math.random() - 0.5) * 2,
          );
          p.age = 0;
          p.maxAge = 0.8 + Math.random() * 0.6;
        }
      }
    }

    for (let i = 0; i < SMOKE_COUNT; i++) {
      const p = particles.current[i];
      if (!p || p.age >= p.maxAge) {
        _matrix.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _matrix);
        continue;
      }

      p.age += delta;
      p.pos.addScaledVector(p.vel, delta);
      p.vel.y += delta * 2;
      p.vel.x += (Math.random() - 0.5) * delta * 4;
      p.vel.z += (Math.random() - 0.5) * delta * 4;

      const life = p.age / p.maxAge;
      const scale = (0.5 + life * 3) * 1.5;

      _matrix.makeTranslation(p.pos.x, p.pos.y, p.pos.z);
      _scale.setScalar(scale);
      _matrix.scale(_scale);
      meshRef.current.setMatrixAt(i, _matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SMOKE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 5, 5]} />
      <meshBasicMaterial color="#888" transparent opacity={0.12} depthWrite={false} />
    </instancedMesh>
  );
}

// ─── Shockwave Ring ──────────────────────────────────────────

function Shockwave({ active, position }: {
  active: boolean;
  position: THREE.Vector3;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useEffect(() => {
    if (active) timeRef.current = 0;
  }, [active]);

  useFrame((_, delta) => {
    if (!active || !meshRef.current) return;
    timeRef.current += delta;
    const t = timeRef.current;

    const scale = t * 60;
    meshRef.current.scale.set(scale, scale, 1);

    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 0.7 * (1 - t * 1.5));
  });

  if (!active) return null;

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.7, 1, 32]} />
      <meshBasicMaterial
        color="#ff6600"
        transparent
        opacity={0.7}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Projectile Pool (fires FROM vehicle) ────────────────────

function ProjectilePool({ active, vehicleRef, targetPos, onImpact }: {
  active: boolean;
  vehicleRef: React.RefObject<THREE.Group | null>;
  targetPos: THREE.Vector3;
  onImpact: () => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);
  const projectiles = useRef<{
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    alive: boolean;
    spawned: boolean;
  }[]>([]);
  const nextSpawnIdx = useRef(0);
  const spawnTimer = useRef(0);
  const impactCount = useRef(0);
  const _matrix = useMemo(() => new THREE.Matrix4(), []);
  const _worldPos = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    projectiles.current = Array.from({ length: PROJECTILE_COUNT }, () => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      alive: false,
      spawned: false,
    }));
    nextSpawnIdx.current = 0;
    spawnTimer.current = -1.8; // 1.8s delay before first projectile
    impactCount.current = 0;
  }, [active]);

  useFrame((_, delta) => {
    if (!active || !meshRef.current) return;
    spawnTimer.current += delta;

    if (nextSpawnIdx.current < PROJECTILE_COUNT && spawnTimer.current >= 0.18) {
      spawnTimer.current = 0;
      const p = projectiles.current[nextSpawnIdx.current];
      if (p && !p.spawned && vehicleRef.current) {
        p.alive = true;
        p.spawned = true;
        vehicleRef.current.getWorldPosition(_worldPos);
        p.pos.copy(_worldPos);

        p.vel
          .copy(targetPos)
          .sub(p.pos)
          .normalize()
          .multiplyScalar(120)
          .add(new THREE.Vector3(
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 15,
          ));
      }
      nextSpawnIdx.current++;
    }

    for (let i = 0; i < projectiles.current.length; i++) {
      const p = projectiles.current[i];
      if (!p.alive) {
        _matrix.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _matrix);
        if (glowRef.current) glowRef.current.setMatrixAt(i, _matrix);
        continue;
      }

      p.vel.y -= 20 * delta;
      p.pos.addScaledVector(p.vel, delta);

      if (p.pos.distanceTo(targetPos) < 10) {
        p.alive = false;
        impactCount.current++;
        if (impactCount.current % 2 === 0) playRaidSound("impact");
        if (impactCount.current >= PROJECTILE_COUNT * 0.8) onImpact();
      }

      if (p.pos.y < 0) p.alive = false;

      _matrix.makeTranslation(p.pos.x, p.pos.y, p.pos.z);
      meshRef.current.setMatrixAt(i, _matrix);
      if (glowRef.current) glowRef.current.setMatrixAt(i, _matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (glowRef.current) glowRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {/* Core — small bright bullet */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, PROJECTILE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.6, 6, 6]} />
        <meshStandardMaterial
          color="#ffaa00"
          emissive="#ff6600"
          emissiveIntensity={8}
          toneMapped={false}
        />
      </instancedMesh>
      {/* Glow halo — larger, transparent, trails behind */}
      <instancedMesh ref={glowRef} args={[undefined, undefined, PROJECTILE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[2, 8, 8]} />
        <meshBasicMaterial
          color="#ff4400"
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

// ─── Debris Particles (enhanced with fire) ───────────────────

function DebrisParticles({ active, origin }: { active: boolean; origin: THREE.Vector3 }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);
  const particles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; alive: boolean; size: number }[]>([]);
  const _matrix = useMemo(() => new THREE.Matrix4(), []);
  const _scale = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (!active) return;
    particles.current = Array.from({ length: DEBRIS_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * 30;
      return {
        pos: origin.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          Math.random() * 5,
          (Math.random() - 0.5) * 6,
        )),
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.random() * 25 + 15,
          Math.sin(angle) * speed,
        ),
        alive: true,
        size: 0.2 + Math.random() * 0.5,
      };
    });
  }, [active, origin]);

  useFrame((_, delta) => {
    if (!active || !meshRef.current) return;

    for (let i = 0; i < particles.current.length; i++) {
      const p = particles.current[i];
      if (!p || !p.alive) {
        _matrix.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _matrix);
        if (glowRef.current) glowRef.current.setMatrixAt(i, _matrix);
        continue;
      }

      p.vel.y -= 35 * delta;
      p.vel.multiplyScalar(0.995);
      p.pos.addScaledVector(p.vel, delta);

      if (p.pos.y < 0) p.alive = false;

      _matrix.makeTranslation(p.pos.x, p.pos.y, p.pos.z);
      _scale.setScalar(p.size);
      _matrix.scale(_scale);
      meshRef.current.setMatrixAt(i, _matrix);
      if (glowRef.current) glowRef.current.setMatrixAt(i, _matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (glowRef.current) glowRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!active) return null;

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, DEBRIS_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#555" />
      </instancedMesh>
      <instancedMesh ref={glowRef} args={[undefined, undefined, DEBRIS_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.8, 4, 4]} />
        <meshBasicMaterial color="#ff4400" transparent opacity={0.5} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

// ─── Fire Glow (post-explosion light) ────────────────────────

function FireGlow({ active, position }: { active: boolean; position: THREE.Vector3 }) {
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (!active || !lightRef.current) return;
    const flicker = 0.7
      + Math.sin(clock.elapsedTime * 15) * 0.15
      + Math.sin(clock.elapsedTime * 23) * 0.1
      + Math.sin(clock.elapsedTime * 37) * 0.05;
    lightRef.current.intensity = 30 * flicker;
  });

  if (!active) return null;

  return (
    <pointLight
      ref={lightRef}
      position={[position.x, position.y + 5, position.z]}
      color="#ff4400"
      intensity={30}
      distance={80}
      decay={2}
    />
  );
}

// ─── Shield Dome ──────────────────────────────────────────────

function ShieldDome({ active, position, size, strength, hitIntensity }: {
  active: boolean;
  position: THREE.Vector3;
  size: number;
  strength: "weak" | "medium" | "strong";
  hitIntensity: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!active || !meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    const basePulse = Math.sin(clock.elapsedTime * 4) * 0.05;
    const hitPulse = hitIntensity * 0.3;
    const baseOpacity = strength === "strong" ? 0.15 : strength === "medium" ? 0.1 : 0.05;
    mat.opacity = baseOpacity + basePulse + hitPulse;

    if (wireRef.current) {
      const wireMat = wireRef.current.material as THREE.MeshBasicMaterial;
      wireMat.opacity = (strength === "strong" ? 0.35 : strength === "medium" ? 0.2 : 0.1) + hitPulse * 0.5;
    }
  });

  if (!active) return null;

  const radius = size * 0.8;
  const color = strength === "strong" ? "#4080ff" : strength === "medium" ? "#40a0ff" : "#6060ff";

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 20, 20]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={wireRef}>
        <sphereGeometry args={[radius * 1.01, 20, 20]} />
        <meshBasicMaterial color="#00ccff" wireframe transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function RaidSequence3D({ phase, attacker, defender, raidData, onPhaseComplete }: Props) {
  const { camera } = useThree();
  const vehicleRef = useRef<THREE.Group>(null);
  const phaseTimeRef = useRef(0);
  const prevPhaseRef = useRef<RaidPhase>("idle");

  // Camera shake state (sine-based)
  const shakeRef = useRef({ intensity: 0, elapsed: 0 });

  const flightProgress = useRef(0);
  const soundPlayed = useRef(false);
  const climaxTriggered = useRef(false);
  const projectilesActive = useRef(false);
  const debrisActive = useRef(false);
  const shockwaveActive = useRef(false);
  const hitIntensityRef = useRef(0);
  const cameraSnapped = useRef(false);

  // Force re-render when refs that gate JSX visibility change
  const [, forceRender] = useState(0);

  // ── Positions ──

  const attackerPos = useMemo(() => {
    if (!attacker) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(attacker.position[0], attacker.height + 10, attacker.position[2]);
  }, [attacker]);

  const defenderTopPos = useMemo(() => {
    if (!defender) return new THREE.Vector3(100, 80, 0);
    return new THREE.Vector3(defender.position[0], defender.height + 5, defender.position[2]);
  }, [defender]);

  // Orbit entry: arrive from the attacker's direction
  const orbitStartAngle = useMemo(() => {
    return Math.atan2(
      attackerPos.z - defenderTopPos.z,
      attackerPos.x - defenderTopPos.x,
    );
  }, [attackerPos, defenderTopPos]);

  const orbitEntryPos = useMemo(() => {
    return new THREE.Vector3(
      defenderTopPos.x + Math.cos(orbitStartAngle) * ORBIT_RADIUS,
      defenderTopPos.y + ORBIT_HEIGHT,
      defenderTopPos.z + Math.sin(orbitStartAngle) * ORBIT_RADIUS,
    );
  }, [defenderTopPos, orbitStartAngle]);

  // Direction from attacker toward defender (horizontal)
  const flightDir = useMemo(() => {
    return new THREE.Vector3(
      defenderTopPos.x - attackerPos.x,
      0,
      defenderTopPos.z - attackerPos.z,
    ).normalize();
  }, [attackerPos, defenderTopPos]);

  // Where the intro liftoff ends (must match intro phase final position)
  const liftEndPos = useMemo(() => {
    const rooftopY = attackerPos.y - 10;
    return new THREE.Vector3(
      attackerPos.x + flightDir.x * 8,
      rooftopY + 8,
      attackerPos.z + flightDir.z * 8,
    );
  }, [attackerPos, flightDir]);

  // Flight path: starts where intro ends, high cruise, descend to orbit entry
  const flightCurve = useMemo(() => {
    const cruiseHeight = Math.max(liftEndPos.y, orbitEntryPos.y) + 80;
    const mid = new THREE.Vector3().lerpVectors(liftEndPos, orbitEntryPos, 0.5);
    mid.y = cruiseHeight;

    // Depart forward + up (not straight up)
    const depart = liftEndPos.clone()
      .add(flightDir.clone().multiplyScalar(35))
      .setY(liftEndPos.y + 25);

    // Approach from behind orbit entry, slightly above
    const approach = orbitEntryPos.clone()
      .add(flightDir.clone().multiplyScalar(-25))
      .setY(orbitEntryPos.y + 15);

    return new THREE.CatmullRomCurve3([
      liftEndPos.clone(),
      depart,
      mid,
      approach,
      orbitEntryPos.clone(),
    ]);
  }, [liftEndPos, orbitEntryPos, flightDir]);

  // Defense strength
  const defenseStrength = useMemo((): "weak" | "medium" | "strong" => {
    if (!raidData) return "medium";
    const ds = raidData.defense_score;
    if (ds <= 15) return "weak";
    if (ds <= 40) return "medium";
    return "strong";
  }, [raidData]);

  // Phase change reset
  useEffect(() => {
    if (phase !== prevPhaseRef.current) {
      phaseTimeRef.current = 0;
      prevPhaseRef.current = phase;
      flightProgress.current = 0;
      soundPlayed.current = false;
      climaxTriggered.current = false;
      projectilesActive.current = false;
      hitIntensityRef.current = 0;
      cameraSnapped.current = false;

      // Keep explosion effects alive through outro phases
      if (phase !== "outro_win" && phase !== "outro_lose") {
        debrisActive.current = false;
        shockwaveActive.current = false;
      }
    }
  }, [phase]);

  const triggerShake = (intensity: number) => {
    shakeRef.current.intensity = Math.max(shakeRef.current.intensity, intensity);
    shakeRef.current.elapsed = 0;
  };

  // Reusable vectors (avoid GC)
  const _camTarget = useMemo(() => new THREE.Vector3(), []);
  const _tempVec = useMemo(() => new THREE.Vector3(), []);
  const _vehicleTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    phaseTimeRef.current += delta;
    const t = phaseTimeRef.current;

    // ── Camera Shake: sine oscillation with exponential decay ──
    const s = shakeRef.current;
    if (s.intensity > 0.01) {
      s.elapsed += delta;
      const decay = Math.exp(-s.elapsed * 5);
      camera.position.x += Math.sin(s.elapsed * 25) * s.intensity * decay;
      camera.position.y += Math.cos(s.elapsed * 30) * s.intensity * 0.6 * decay;
      camera.rotation.z += Math.sin(s.elapsed * 20) * s.intensity * 0.012 * decay;

      if (decay < 0.01) s.intensity = 0;
    }

    // ── Decay hit intensity ──
    if (hitIntensityRef.current > 0) {
      hitIntensityRef.current *= 0.92;
      if (hitIntensityRef.current < 0.01) hitIntensityRef.current = 0;
    }

    switch (phase) {
      // ───────── INTRO: camera focuses, vehicle parked, then lifts off ─────────
      case "intro": {
        const rooftopY = attackerPos.y - 10; // attackerPos is height+10, rooftop is height

        // Phase 1 (0-2.5s): camera dolly in, vehicle parked on rooftop
        // Phase 2 (2.5-4.5s): vehicle lifts off
        const camProgress = Math.min(t / 2.5, 1);
        const camEase = smoothstep(camProgress);

        // Camera: start behind attacker, dolly in
        const camBehindX = -flightDir.x;
        const camBehindZ = -flightDir.z;
        const camStartDist = 90 - camEase * 45;
        const camStartY = attackerPos.y + 50 - camEase * 25;

        _camTarget.set(
          attackerPos.x + camBehindX * camStartDist,
          camStartY,
          attackerPos.z + camBehindZ * camStartDist,
        );

        // First frame: snap camera instantly (don't lerp from orbit controls position)
        if (!cameraSnapped.current) {
          cameraSnapped.current = true;
          camera.position.copy(_camTarget);
        } else {
          camera.position.lerp(_camTarget, 0.06);
        }
        camera.lookAt(attackerPos);

        // Vehicle: parked above rooftop until 2.5s, then gently lifts off forward
        if (vehicleRef.current) {
          const liftProgress = Math.max(0, Math.min((t - 2.5) / 2, 1));
          const liftEase = smoothstep(liftProgress);

          const startY = rooftopY + 6; // above rooftop, clear of items
          vehicleRef.current.position.set(
            attackerPos.x + flightDir.x * liftEase * 8,
            startY + liftEase * 8,
            attackerPos.z + flightDir.z * liftEase * 8,
          );

          // Face toward defender
          _vehicleTarget.set(
            defenderTopPos.x,
            rooftopY + liftEase * 10,
            defenderTopPos.z,
          );
          vehicleRef.current.lookAt(_vehicleTarget);
          vehicleRef.current.rotateY(Math.PI); // nose is -Z
          vehicleRef.current.rotateX(liftProgress * 0.08); // slight nose-up tilt
          vehicleRef.current.scale.setScalar(2);
        }

        if (t >= 4.5) onPhaseComplete("intro");
        break;
      }

      // ───────── FLIGHT: follow spline, trailing camera ─────────
      case "flight": {
        flightProgress.current = Math.min(flightProgress.current + delta * 0.16, 1);
        const fp = flightProgress.current;
        const eased = smoothstep(fp);

        const point = flightCurve.getPoint(eased);
        const lookAhead = flightCurve.getPoint(Math.min(eased + 0.05, 0.99));
        const tangent = flightCurve.getTangent(eased).normalize();

        if (vehicleRef.current) {
          vehicleRef.current.position.copy(point);
          vehicleRef.current.lookAt(lookAhead);
          vehicleRef.current.rotateY(Math.PI); // flip: lookAt makes +Z face target, but nose is -Z
          vehicleRef.current.scale.setScalar(2);

          // Banking: gentle lean during middle of flight (sign flipped due to rotateY)
          const bankAmount = Math.sin(fp * Math.PI) * -0.12;
          vehicleRef.current.rotateZ(bankAmount);
        }

        // Camera: behind-and-side, always above vehicle for clear view
        // Use horizontal tangent only (ignore vertical component for camera trail)
        const hTangentLen = Math.sqrt(tangent.x * tangent.x + tangent.z * tangent.z) || 1;
        const hTanX = tangent.x / hTangentLen;
        const hTanZ = tangent.z / hTangentLen;
        const perpX = -hTanZ;
        const perpZ = hTanX;

        const trailDist = 50 + (1 - fp) * 20;
        const trailHeight = 20 + Math.sin(fp * Math.PI) * 15;
        const sideDist = 20 + Math.sin(fp * Math.PI) * 10;

        _camTarget.set(
          point.x - hTanX * trailDist + perpX * sideDist,
          point.y + trailHeight,
          point.z - hTanZ * trailDist + perpZ * sideDist,
        );
        camera.position.lerp(_camTarget, 0.1);

        // Look slightly ahead of the vehicle
        _tempVec.lerpVectors(point, lookAhead, 0.5);
        camera.lookAt(_tempVec);

        if (fp >= 1.0) onPhaseComplete("flight");
        break;
      }

      // ───────── ATTACK: orbiting gun run ─────────
      case "attack": {
        const topX = defenderTopPos.x;
        const topY = defenderTopPos.y;
        const topZ = defenderTopPos.z;

        // Vehicle position on orbit circle
        const orbitAngle = orbitStartAngle - t * ORBIT_SPEED;
        const vehicleX = topX + Math.cos(orbitAngle) * ORBIT_RADIUS;
        const vehicleZ = topZ + Math.sin(orbitAngle) * ORBIT_RADIUS;
        const vehicleY = topY + ORBIT_HEIGHT + Math.sin(t * 2) * 3;

        // Orbit tangent (direction of travel for counter-clockwise)
        const tangentX = Math.sin(orbitAngle);
        const tangentZ = -Math.cos(orbitAngle);

        if (vehicleRef.current) {
          vehicleRef.current.position.set(vehicleX, vehicleY, vehicleZ);
          vehicleRef.current.scale.setScalar(2);

          // Look along orbit tangent (direction of travel)
          _vehicleTarget.set(
            vehicleX + tangentX * 30,
            vehicleY - 2,
            vehicleZ + tangentZ * 30,
          );
          vehicleRef.current.lookAt(_vehicleTarget);
          vehicleRef.current.rotateY(Math.PI); // flip: nose faces travel direction

          // Bank into the turn (sign flipped due to rotateY)
          vehicleRef.current.rotateZ(0.25);
        }

        // ── Smooth continuous camera (no discrete act jumps) ──
        const ap = t / ATTACK_DURATION; // 0 → 1

        // Camera orbit: offset behind vehicle, slowly sweeping
        const camOrbitOffset = Math.PI * 0.5;
        const camAngle = orbitAngle + camOrbitOffset + ap * Math.PI * 0.25;

        // Camera distance: wide enough to see over neighboring buildings
        const camDist = ORBIT_RADIUS * 1.5;

        // Camera height: above building top to clear skyline, cinematic angle ~20-25°
        const camY = topY + 30 + ap * 10;

        _camTarget.set(
          topX + Math.cos(camAngle) * camDist,
          camY,
          topZ + Math.sin(camAngle) * camDist,
        );
        camera.position.lerp(_camTarget, 0.06);

        // LookAt: always toward defender building (slight vehicle blend early on)
        const vehicleBlend = Math.max(0, 0.25 - ap * 0.4);
        _tempVec.set(
          vehicleX * vehicleBlend + topX * (1 - vehicleBlend),
          vehicleY * vehicleBlend + topY * (1 - vehicleBlend),
          vehicleZ * vehicleBlend + topZ * (1 - vehicleBlend),
        );
        camera.lookAt(_tempVec);

        // ── Event triggers (don't affect camera smoothness) ──

        // Sound at 1s
        if (t >= 1.0 && !soundPlayed.current) {
          soundPlayed.current = true;
          playRaidSound("shoot");
        }

        // Progressive shake during strafing (2s+)
        if (t >= 2.0 && t < 4.5) {
          const strafeProgress = (t - 2.0) / 2.5;
          triggerShake((0.15 + strafeProgress * 0.4) * delta * 8);
        }

        // Climax at 4.5s
        if (t >= 4.5 && !climaxTriggered.current) {
          climaxTriggered.current = true;
          if (raidData?.success) {
            triggerShake(4.0);
            playRaidSound("explosion");
            debrisActive.current = true;
            shockwaveActive.current = true;
          } else {
            triggerShake(1.5);
            playRaidSound("shield_hit");
            hitIntensityRef.current = 1;
          }
          forceRender(n => n + 1);
        }

        // Vehicle rises after climax
        if (climaxTriggered.current && vehicleRef.current) {
          if (raidData?.success) {
            vehicleRef.current.position.y += delta * 15;
          } else {
            vehicleRef.current.rotation.z += Math.sin(t * 12) * delta * 2;
            vehicleRef.current.position.y += delta * 5;
          }
        }

        if (t >= ATTACK_DURATION) onPhaseComplete("attack");
        break;
      }

      // ───────── OUTRO WIN: dramatic crane shot ─────────
      case "outro_win": {
        const progress = Math.min(t / 3.5, 1);
        const ease = easeOutCubic(progress);
        const riseY = defenderTopPos.y + 15 + ease * 35;
        const slowAngle = t * 0.15;
        const dist = ORBIT_RADIUS * 1.6;

        _camTarget.set(
          defenderTopPos.x + Math.cos(slowAngle) * dist,
          riseY,
          defenderTopPos.z + Math.sin(slowAngle) * dist,
        );
        camera.position.lerp(_camTarget, 0.07);
        camera.lookAt(defenderTopPos);

        // Vehicle circles in victory
        if (vehicleRef.current) {
          const victoryAngle = orbitStartAngle - (phaseTimeRef.current + ATTACK_DURATION) * ORBIT_SPEED * 0.3;
          const victoryDist = ORBIT_RADIUS * 1.5;
          vehicleRef.current.position.set(
            defenderTopPos.x + Math.cos(victoryAngle) * victoryDist,
            defenderTopPos.y + ORBIT_HEIGHT + 20 + t * 5,
            defenderTopPos.z + Math.sin(victoryAngle) * victoryDist,
          );

          const vTangentX = Math.sin(victoryAngle);
          const vTangentZ = -Math.cos(victoryAngle);
          _vehicleTarget.set(
            vehicleRef.current.position.x + vTangentX * 30,
            vehicleRef.current.position.y,
            vehicleRef.current.position.z + vTangentZ * 30,
          );
          vehicleRef.current.lookAt(_vehicleTarget);
          vehicleRef.current.rotateY(Math.PI);
          vehicleRef.current.rotateZ(0.15);
        }
        break;
      }

      // ───────── OUTRO LOSE: vehicle retreats ─────────
      case "outro_lose": {
        const progress = Math.min(t / 3, 1);

        if (vehicleRef.current) {
          // Fly away back towards attacker direction
          _tempVec.set(
            attackerPos.x - defenderTopPos.x,
            0,
            attackerPos.z - defenderTopPos.z,
          ).normalize();

          vehicleRef.current.position.addScaledVector(_tempVec, delta * 40);
          vehicleRef.current.position.y += delta * 8;

          // Damaged wobble
          vehicleRef.current.rotation.z = Math.sin(t * 8) * 0.3 * (1 - progress);

          // Face retreat direction
          _vehicleTarget.copy(vehicleRef.current.position).addScaledVector(_tempVec, 20);
          _vehicleTarget.y = vehicleRef.current.position.y;
          vehicleRef.current.lookAt(_vehicleTarget);
          vehicleRef.current.rotateY(Math.PI);

          const scale = Math.max(0.01, 2 * (1 - progress * 0.5));
          vehicleRef.current.scale.setScalar(scale);

          if (progress < 0.6) {
            camera.lookAt(vehicleRef.current.position);
          }
        }

        // Gentle rise + pull back for cinematic reveal
        const loseAngle = t * 0.12;
        const loseDist = ORBIT_RADIUS * 1.4;
        const loseY = defenderTopPos.y + 20 + progress * 25;
        _camTarget.set(
          defenderTopPos.x + Math.cos(loseAngle) * loseDist,
          loseY,
          defenderTopPos.z + Math.sin(loseAngle) * loseDist,
        );
        camera.position.lerp(_camTarget, 0.05);

        if (progress > 0.6) {
          camera.lookAt(defenderTopPos);
        }
        break;
      }

      default:
        break;
    }
  });

  if (phase === "idle" || phase === "preview" || phase === "done") return null;

  const vehicleType = raidData?.vehicle ?? "airplane";
  const isAttack = phase === "attack";
  const isOutro = phase === "outro_win" || phase === "outro_lose";
  const showSmoke = phase === "flight" || isAttack;

  return (
    <group>
      {/* Vehicle */}
      <group ref={vehicleRef} position={[attackerPos.x, attackerPos.y - 4, attackerPos.z]} scale={2}>
        <VehicleMesh type={vehicleType} />
      </group>

      {/* Smoke Trail */}
      <SmokeTrail vehicleRef={vehicleRef} active={showSmoke} />

      {/* Red targeting light on defender */}
      {(phase === "flight" || phase === "attack") && (
        <group position={[defenderTopPos.x, defenderTopPos.y + 30, defenderTopPos.z]}>
          <pointLight color="#ff2020" intensity={8} distance={60} />
        </group>
      )}

      {/* Projectiles from vehicle */}
      <ProjectilePool
        active={isAttack}
        vehicleRef={vehicleRef}
        targetPos={defenderTopPos}
        onImpact={() => {
          triggerShake(0.8);
          hitIntensityRef.current = 0.5;
        }}
      />

      {/* Shield dome */}
      <ShieldDome
        active={isAttack && defenseStrength !== "weak"}
        position={defenderTopPos}
        size={Math.max(defender?.width ?? 10, defender?.depth ?? 10)}
        strength={defenseStrength}
        hitIntensity={hitIntensityRef.current}
      />

      {/* Shockwave ring */}
      <Shockwave active={(isAttack || isOutro) && !!raidData?.success && climaxTriggered.current} position={defenderTopPos} />

      {/* Debris */}
      <DebrisParticles active={(isAttack || isOutro) && !!raidData?.success && climaxTriggered.current} origin={defenderTopPos} />

      {/* Fire glow */}
      <FireGlow active={(isAttack || isOutro) && !!raidData?.success && climaxTriggered.current} position={defenderTopPos} />
    </group>
  );
}
