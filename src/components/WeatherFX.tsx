"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export type WeatherMode = "clear" | "rain" | "fog" | "storm";

interface Props {
  mode: WeatherMode;
}

const DROP_COUNT = 850;
const DROP_RADIUS = 1300;

function buildDrops(seed: number): Float32Array {
  const arr = new Float32Array(DROP_COUNT * 3);
  let t = seed;
  const rand = () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < DROP_COUNT; i++) {
    const r = DROP_RADIUS * (0.12 + rand() * 0.75);
    const a = rand() * Math.PI * 2;
    arr[i * 3] = Math.cos(a) * r;
    arr[i * 3 + 1] = 120 + rand() * 750;
    arr[i * 3 + 2] = Math.sin(a) * r;
  }

  return arr;
}

export default function WeatherFX({ mode }: Props) {
  const dropsRef = useRef<THREE.Points>(null);
  const flashRef = useRef<THREE.PointLight>(null);
  const fogShellRef = useRef<THREE.Mesh>(null);
  const stormClock = useRef(0);
  const flashCooldown = useRef(4);
  const flashEnergy = useRef(0);
  const { camera } = useThree();

  const drops = useMemo(() => buildDrops(20260319), []);

  useEffect(() => {
    if (mode !== "storm") {
      flashEnergy.current = 0;
      stormClock.current = 0;
      flashCooldown.current = 3 + Math.random() * 5;
    }
  }, [mode]);

  useFrame((_, delta) => {
    const points = dropsRef.current;
    if (points && (mode === "rain" || mode === "storm")) {
      const attr = points.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const fall = mode === "storm" ? 240 : 160;

      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= fall * delta;
        arr[i] += Math.sin((arr[i + 2] + i) * 0.001) * delta * 14;
        arr[i + 2] += Math.cos((arr[i] + i) * 0.0015) * delta * 7;
        if (arr[i + 1] < 25) arr[i + 1] = 780 + Math.random() * 120;
      }
      attr.needsUpdate = true;
    }

    if (mode === "storm") {
      stormClock.current += delta;
      if (stormClock.current >= flashCooldown.current) {
        stormClock.current = 0;
        flashCooldown.current = 2.5 + Math.random() * 6;
        flashEnergy.current = 1;
      }
    }

    if (flashEnergy.current > 0 && flashRef.current) {
      flashEnergy.current *= 0.87;
      flashRef.current.intensity = 120 * flashEnergy.current;
      flashRef.current.position.set(
        camera.position.x + (Math.random() - 0.5) * 500,
        460 + Math.random() * 280,
        camera.position.z + (Math.random() - 0.5) * 500,
      );
    } else if (flashRef.current) {
      flashRef.current.intensity = 0;
    }

    if ((mode === "fog" || mode === "storm") && fogShellRef.current) {
      fogShellRef.current.position.set(camera.position.x, 210, camera.position.z);
    }
  });

  if (mode === "clear") return null;

  return (
    <group>
      {(mode === "rain" || mode === "storm") && (
        <points ref={dropsRef} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[drops, 3]}
              count={drops.length / 3}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            color={mode === "storm" ? "#9ec7ff" : "#b8d5ff"}
            size={mode === "storm" ? 2.4 : 1.8}
            transparent
            opacity={mode === "storm" ? 0.75 : 0.55}
            depthWrite={false}
          />
        </points>
      )}

      {(mode === "fog" || mode === "storm") && (
        <mesh ref={fogShellRef} position={[0, 210, 0]}>
          <sphereGeometry args={[1300, 28, 20]} />
          <meshBasicMaterial
            color={mode === "storm" ? "#3d4c66" : "#60708c"}
            transparent
            opacity={mode === "storm" ? 0.2 : 0.14}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {mode === "storm" && (
        <pointLight
          ref={flashRef}
          color="#d3e9ff"
          intensity={0}
          distance={2200}
          decay={1.6}
        />
      )}
    </group>
  );
}
