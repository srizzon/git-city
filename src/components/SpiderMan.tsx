"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface SpiderManProps {
  position: [number, number, number];
  rotation: number;
}

export default function SpiderMan({ position, rotation }: SpiderManProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      // Gentle breathing/swaying animation
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.5;
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={[0, rotation, 0]}>
      {/* Body (Red) */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.5, 2, 1]} />
        <meshStandardMaterial color="#e62e2e" emissive="#e62e2e" emissiveIntensity={0.5} />
      </mesh>
      {/* Head (Red) */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[1.2, 1.2, 1.1]} />
        <meshStandardMaterial color="#e62e2e" emissive="#e62e2e" emissiveIntensity={0.5} />
      </mesh>
      {/* Eyes (White) */}
      <mesh position={[0.3, 1.6, 0.55]}>
        <boxGeometry args={[0.4, 0.4, 0.1]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1} />
      </mesh>
      <mesh position={[-0.3, 1.6, 0.55]}>
        <boxGeometry args={[0.4, 0.4, 0.1]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1} />
      </mesh>
      {/* Arms (Blue) */}
      <mesh position={[1, 0, 0]}>
        <boxGeometry args={[0.6, 1.5, 0.6]} />
        <meshStandardMaterial color="#2d5bb9" emissive="#2d5bb9" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[-1, 0, 0]}>
        <boxGeometry args={[0.6, 1.5, 0.6]} />
        <meshStandardMaterial color="#2d5bb9" emissive="#2d5bb9" emissiveIntensity={0.3} />
      </mesh>
      {/* Legs (Blue) */}
      <mesh position={[0.4, -1.5, 0]}>
        <boxGeometry args={[0.6, 1.5, 0.6]} />
        <meshStandardMaterial color="#2d5bb9" emissive="#2d5bb9" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[-0.4, -1.5, 0]}>
        <boxGeometry args={[0.6, 1.5, 0.6]} />
        <meshStandardMaterial color="#2d5bb9" emissive="#2d5bb9" emissiveIntensity={0.3} />
      </mesh>
      {/* Spider Symbol (Black) */}
      <mesh position={[0, 0.2, 0.55]}>
        <boxGeometry args={[0.5, 0.5, 0.1]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
    </group>
  );
}
