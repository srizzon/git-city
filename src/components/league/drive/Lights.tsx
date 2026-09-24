"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CarApi } from "./Car";

// Headlights (two spot lights and their lamps) and tail lights that brighten
// on the brake. Rendered inside the car's group, in city units (the car is
// ~8.4 long, front at +z).

const FRONT = 4.1;
const REAR = -4.2;
const Y = 1.9;
const X = 1.35;

export default function Lights({ car }: { car: React.MutableRefObject<CarApi | null> }) {
  const tails = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const left = useRef<THREE.SpotLight>(null);
  const right = useRef<THREE.SpotLight>(null);
  const targetL = useRef<THREE.Object3D>(null);
  const targetR = useRef<THREE.Object3D>(null);

  useEffect(() => {
    if (left.current && targetL.current) left.current.target = targetL.current;
    if (right.current && targetR.current) right.current.target = targetR.current;
  }, []);

  useFrame((_, dt) => {
    const c = car.current;
    if (!c) return;
    const want = c.state.braking ? 5 : 1.2;
    for (const m of tails.current) if (m) m.emissiveIntensity += (want - m.emissiveIntensity) * Math.min(1, dt * 14);
  });

  return (
    <group>
      {[X, -X].map((x) => (
        <mesh key={`h${x}`} position={[x, Y, FRONT]}>
          <boxGeometry args={[0.9, 0.45, 0.2]} />
          <meshBasicMaterial color="#fff6d8" toneMapped={false} />
        </mesh>
      ))}
      {[X, -X].map((x, i) => (
        <mesh key={`t${x}`} position={[x, Y + 0.2, REAR]}>
          <boxGeometry args={[0.9, 0.4, 0.2]} />
          <meshStandardMaterial
            ref={(m) => {
              tails.current[i] = m;
            }} color="#ff2a2a" emissive="#ff1a1a" emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      ))}
      <spotLight ref={left} position={[X, Y, FRONT]} angle={0.45} penumbra={0.6} intensity={900} distance={110} decay={1.4} color="#fff2cc" />
      <spotLight ref={right} position={[-X, Y, FRONT]} angle={0.45} penumbra={0.6} intensity={900} distance={110} decay={1.4} color="#fff2cc" />
      <object3D ref={targetL} position={[X * 1.5, -1, FRONT + 40]} />
      <object3D ref={targetR} position={[-X * 1.5, -1, FRONT + 40]} />
    </group>
  );
}
