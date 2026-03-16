"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface WeatherProps {
  type: "rain" | "snow" | "clear";
  cityRadius: number;
}

const PARTICLE_COUNT = 5000;

export default function Weather({ type, cityRadius }: WeatherProps) {
  const pointsRef = useRef<THREE.Points>(null);

  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT);

    const spread = cityRadius * 2;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = Math.random() * 800; // Height
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
      vel[i] = 1 + Math.random() * 2;
    }
    return [pos, vel];
  }, [cityRadius]);

  useFrame((state, delta) => {
    if (!pointsRef.current || type === "clear") return;

    const geo = pointsRef.current.geometry;
    const posAttr = geo.attributes.position;
    const fallSpeed = type === "rain" ? 15 : 4;
    const windSpeed = type === "rain" ? 1 : 0.5;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let y = posAttr.getY(i);
      let x = posAttr.getX(i);
      let z = posAttr.getZ(i);

      y -= fallSpeed * velocities[i] * delta * 10;
      x += Math.sin(state.clock.elapsedTime + i) * windSpeed * delta;

      if (y < 0) {
        y = 800;
      }

      posAttr.setY(i, y);
      posAttr.setX(i, x);
    }
    posAttr.needsUpdate = true;
  });

  if (type === "clear") return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={PARTICLE_COUNT}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={type === "rain" ? 1.5 : 2.5}
        color={type === "rain" ? "#aaccff" : "#ffffff"}
        transparent
        opacity={type === "rain" ? 0.4 : 0.8}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
