"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Shared across every fly so a swarm doesn't allocate per instance.
const _sphere = /* @__PURE__ */ new THREE.SphereGeometry(1, 8, 6);
const _wingShape = /* @__PURE__ */ new THREE.SphereGeometry(1, 8, 4);
const _band = /* @__PURE__ */ new THREE.CylinderGeometry(0.258, 0.24, 0.055, 8);
const _antenna = /* @__PURE__ */ new THREE.CylinderGeometry(0.018, 0.025, 0.18, 5);
const _upperLeg = /* @__PURE__ */ new THREE.CylinderGeometry(0.021, 0.025, 0.33, 5);
const _lowerLeg = /* @__PURE__ */ new THREE.CylinderGeometry(0.019, 0.015, 0.25, 5);

const _abdomen = /* @__PURE__ */ new THREE.MeshStandardMaterial({ color: "#b37b36", flatShading: true });
const _dark = /* @__PURE__ */ new THREE.MeshStandardMaterial({ color: "#493322", flatShading: true });
const _thorax = /* @__PURE__ */ new THREE.MeshStandardMaterial({ color: "#65503d", flatShading: true });
const _head = /* @__PURE__ */ new THREE.MeshStandardMaterial({ color: "#af8a51", flatShading: true });
const _eye = /* @__PURE__ */ new THREE.MeshStandardMaterial({ color: "#ce4937", roughness: 0.45, flatShading: true });
const _wing = /* @__PURE__ */ new THREE.MeshStandardMaterial({
  color: "#d6edf0",
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
  roughness: 0.35,
  flatShading: true,
});

/**
 * Lightweight, procedural fly. Faces +Z; its feet rest near Y=0.
 * `flying` may be a getter so a parent driving flies from useFrame can flip
 * the wings without re-rendering.
 */
export default function FruitFly({ flying = true }: { flying?: boolean | (() => boolean) }) {
  const leftWing = useRef<THREE.Group>(null);
  const rightWing = useRef<THREE.Group>(null);
  const phase = useRef(0);

  useFrame((_, delta) => {
    // A stylized beat that remains readable at ordinary display frame rates.
    phase.current = (phase.current + Math.min(delta, 0.05) * 2 * Math.PI * 12) % (2 * Math.PI);
    const on = typeof flying === "function" ? flying() : flying;
    const angle = on ? Math.sin(phase.current) * 0.75 : -0.2;
    if (leftWing.current) leftWing.current.rotation.z = angle;
    if (rightWing.current) rightWing.current.rotation.z = -angle;
  });

  return (
    <group>
      {/* Faceted amber abdomen, dark thorax, and oversized red compound eyes. */}
      <mesh geometry={_sphere} material={_abdomen} position={[0, 0.44, -0.3]} scale={[0.29, 0.25, 0.48]} />
      {[-0.35, -0.52].map((z) => (
        <mesh key={z} geometry={_band} material={_dark} position={[0, 0.44, z]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
      <mesh geometry={_sphere} material={_thorax} position={[0, 0.47, 0.13]} scale={[0.28, 0.28, 0.32]} />
      <mesh geometry={_sphere} material={_head} position={[0, 0.51, 0.48]} scale={0.22} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh geometry={_sphere} material={_eye} position={[side * 0.17, 0.55, 0.52]} scale={[0.13, 0.18, 0.17]} />
          <mesh geometry={_antenna} material={_dark} position={[side * 0.08, 0.61, 0.71]} rotation={[0.7, 0, side * -0.3]} />
          {[-0.22, 0.02, 0.26].map((z) => (
            <group key={z} position={[side * 0.2, 0.34, z]}>
              <mesh geometry={_upperLeg} material={_dark} position={[side * 0.14, -0.08, 0]} rotation={[0, 0, side * 1.05]} />
              <mesh geometry={_lowerLeg} material={_dark} position={[side * 0.29, -0.23, 0]} rotation={[0, 0, side * 0.2]} />
            </group>
          ))}
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group key={side} ref={side < 0 ? leftWing : rightWing} position={[side * 0.13, 0.68, 0.02]}>
          <mesh
            geometry={_wingShape}
            material={_wing}
            position={[side * 0.49, 0, -0.2]}
            rotation={[0, side * 0.35, 0]}
            scale={[0.62, 0.025, 0.26]}
          />
        </group>
      ))}
    </group>
  );
}
