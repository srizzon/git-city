"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const RARITY_COLORS: Record<string, string> = {
  common: "#00ff88",
  rare: "#0088ff",
  epic: "#aa00ff",
  legendary: "#ffaa00",
};

// Reveal distances by rarity (far = subtle glow starts, near = full beacon)
const REVEAL_FAR: Record<string, number> = { common: 600, rare: 700, epic: 900, legendary: 1200 };
const REVEAL_NEAR: Record<string, number> = { common: 300, rare: 350, epic: 450, legendary: 600 };

const BEAM_HEIGHT = 300;

export default function DropBeacon({ rarity, height }: { rarity: string; height: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const markerRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const markerInnerRef = useRef<THREE.Mesh>(null);
  const markerOuterRef = useRef<THREE.Mesh>(null);

  const color = RARITY_COLORS[rarity] ?? RARITY_COLORS.common;
  const far = REVEAL_FAR[rarity] ?? 200;
  const near = REVEAL_NEAR[rarity] ?? 100;

  useFrame((state) => {
    if (!groupRef.current) return;

    const t = state.clock.elapsedTime;
    const cam = state.camera.position;
    const pos = groupRef.current.parent?.position;
    if (!pos) return;

    // Distance from camera to beacon (XZ plane only)
    const dx = cam.x - pos.x;
    const dz = cam.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Visibility phases: 0 = invisible, 0-1 = fading in glow, 1+ = full beacon
    // farPhase: 0 at dist>=far, 1 at dist<=near
    const farPhase = dist >= far ? 0 : dist <= near ? 1 : (far - dist) / (far - near);

    // Glow (visible from medium distance, subtle pulse)
    if (glowRef.current) {
      const glowOpacity = farPhase * (0.06 + Math.sin(t * 1.5) * 0.03);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = glowOpacity;
      glowRef.current.visible = farPhase > 0;
      // Scale glow ring larger when far (catching attention), smaller when near
      const glowScale = 1 + (1 - farPhase) * 2;
      glowRef.current.scale.set(glowScale, glowScale, 1);
    }

    // Beam (only visible when getting close)
    const beamPhase = Math.max(0, (farPhase - 0.3) / 0.7); // starts at 30% reveal
    if (beamRef.current) {
      (beamRef.current.material as THREE.MeshBasicMaterial).opacity =
        beamPhase * (0.12 + Math.sin(t * 2) * 0.04);
      beamRef.current.visible = beamPhase > 0;
      beamRef.current.scale.y = beamPhase; // grows upward as you approach
      beamRef.current.position.y = (BEAM_HEIGHT / 2) * beamPhase;
    }

    // Floating marker (only visible when close)
    const markerPhase = Math.max(0, (farPhase - 0.6) / 0.4); // starts at 60% reveal
    if (markerRef.current) {
      markerRef.current.visible = markerPhase > 0;
      markerRef.current.position.y = height + 30 + Math.sin(t * 1.8) * 4;
      markerRef.current.rotation.y = t * 1.2;
    }
    if (markerInnerRef.current) {
      (markerInnerRef.current.material as THREE.MeshBasicMaterial).opacity = markerPhase;
    }
    if (markerOuterRef.current) {
      (markerOuterRef.current.material as THREE.MeshBasicMaterial).opacity = markerPhase * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Vertical beam of light */}
      <mesh ref={beamRef} position={[0, BEAM_HEIGHT / 2, 0]} visible={false}>
        <boxGeometry args={[3, BEAM_HEIGHT, 3]} />
        <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Ground glow ring (first thing visible from afar) */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]} visible={false}>
        <ringGeometry args={[4, 14, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Floating marker (only when close) */}
      <group ref={markerRef} position={[0, height + 30, 0]} visible={false}>
        <mesh ref={markerInnerRef}>
          <octahedronGeometry args={[5, 0]} />
          <meshBasicMaterial color={color} transparent opacity={0} />
        </mesh>
        <mesh ref={markerOuterRef} scale={[1.5, 1.5, 1.5]}>
          <octahedronGeometry args={[5, 0]} />
          <meshBasicMaterial color={color} transparent opacity={0} />
        </mesh>
      </group>
    </group>
  );
}
