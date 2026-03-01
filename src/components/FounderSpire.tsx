"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const MATRIX_GREEN = "#00ff41";
const SPIRE_HEIGHT = 800;

interface FounderSpireProps {
  onClick: () => void;
}

export default function FounderSpire({ onClick }: FounderSpireProps) {
  const groupRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);
  const topGlowRef = useRef<THREE.Mesh>(null);

  const { gl, camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  // Native capture-phase handlers for click + cursor
  // Capture phase fires BEFORE bubble phase, so this runs before InstancedBuildings' handlers
  useEffect(() => {
    const canvas = gl.domElement;

    const hitsSpire = (e: PointerEvent): boolean => {
      const group = groupRef.current;
      if (!group) return false;
      const rect = canvas.getBoundingClientRect();
      ndc.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(ndc.current, camera);
      return raycaster.current.intersectObject(group, true).length > 0;
    };

    // Click handling
    let tap: { time: number; x: number; y: number } | null = null;

    const onDown = (e: PointerEvent) => {
      if (hitsSpire(e)) {
        (window as any).__spireClicked = true;
        tap = { time: performance.now(), x: e.clientX, y: e.clientY };
      }
    };

    const onUp = (e: PointerEvent) => {
      (window as any).__spireClicked = false;
      if (!tap) return;
      const elapsed = performance.now() - tap.time;
      const dx = e.clientX - tap.x;
      const dy = e.clientY - tap.y;
      tap = null;
      if (elapsed > 400 || dx * dx + dy * dy > 625) return;
      onClickRef.current();
    };

    // Cursor handling (throttled ~15Hz)
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    let lastMove = 0;
    const onMove = isTouch ? null : (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastMove < 66) return;
      lastMove = now;
      if (hitsSpire(e)) {
        document.body.style.cursor = "pointer";
        (window as any).__spireCursor = true;
      } else if ((window as any).__spireCursor) {
        (window as any).__spireCursor = false;
      }
    };

    canvas.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    if (onMove) canvas.addEventListener("pointermove", onMove, true);

    return () => {
      canvas.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      if (onMove) canvas.removeEventListener("pointermove", onMove, true);
      (window as any).__spireClicked = false;
      (window as any).__spireCursor = false;
    };
  }, [gl, camera]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (pulseRef.current) {
      const cycle = (t * 0.4) % 1;
      pulseRef.current.position.y = cycle * SPIRE_HEIGHT * 0.8;
      pulseRef.current.scale.setScalar(1 + Math.sin(cycle * Math.PI) * 0.5);
      (pulseRef.current.material as THREE.MeshStandardMaterial).opacity =
        Math.sin(cycle * Math.PI) * 0.8;
    }

    if (ring1Ref.current) ring1Ref.current.rotation.y = t * 0.3;
    if (ring2Ref.current) ring2Ref.current.rotation.y = -t * 0.2;
    if (ring3Ref.current) ring3Ref.current.rotation.z = t * 0.25;

    if (topGlowRef.current) {
      const glow = 0.6 + Math.sin(t * 2) * 0.4;
      (topGlowRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = glow * 3;
      topGlowRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.15);
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Invisible hitbox for easier clicking */}
      <mesh position={[0, SPIRE_HEIGHT / 2, 0]} visible={false}>
        <cylinderGeometry args={[35, 35, SPIRE_HEIGHT, 8]} />
        <meshBasicMaterial />
      </mesh>

      {/* Base platform */}
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[30, 35, 4, 8]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Base ring detail */}
      <mesh position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[28, 1.5, 8, 8]} />
        <meshStandardMaterial
          color={MATRIX_GREEN}
          emissive={MATRIX_GREEN}
          emissiveIntensity={1.5}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Main tower shaft - bottom section */}
      <mesh position={[0, 100, 0]}>
        <cylinderGeometry args={[12, 18, 200, 6]} />
        <meshStandardMaterial color="#111111" roughness={0.2} metalness={0.9} />
      </mesh>

      {/* Mid section - tapered */}
      <mesh position={[0, 300, 0]}>
        <cylinderGeometry args={[8, 12, 200, 6]} />
        <meshStandardMaterial color="#0d0d0d" roughness={0.2} metalness={0.9} />
      </mesh>

      {/* Upper section - thin */}
      <mesh position={[0, 500, 0]}>
        <cylinderGeometry args={[4, 8, 200, 6]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.15} metalness={0.95} />
      </mesh>

      {/* Top spike */}
      <mesh position={[0, 700, 0]}>
        <cylinderGeometry args={[0.5, 4, 200, 6]} />
        <meshStandardMaterial color="#080808" roughness={0.1} metalness={1} />
      </mesh>

      {/* Green accent lines running up the tower */}
      {[0, 60, 120, 180, 240, 300].map((angle, i) => (
        <mesh
          key={i}
          position={[
            Math.cos((angle * Math.PI) / 180) * 13,
            250,
            Math.sin((angle * Math.PI) / 180) * 13,
          ]}
        >
          <boxGeometry args={[0.8, 500, 0.8]} />
          <meshStandardMaterial
            color={MATRIX_GREEN}
            emissive={MATRIX_GREEN}
            emissiveIntensity={1}
            transparent
            opacity={0.5}
          />
        </mesh>
      ))}

      {/* Floating ring 1 - lower */}
      <mesh ref={ring1Ref} position={[0, 180, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[22, 1, 8, 6]} />
        <meshStandardMaterial
          color={MATRIX_GREEN}
          emissive={MATRIX_GREEN}
          emissiveIntensity={2}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Floating ring 2 - middle */}
      <mesh ref={ring2Ref} position={[0, 400, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[16, 0.8, 8, 6]} />
        <meshStandardMaterial
          color={MATRIX_GREEN}
          emissive={MATRIX_GREEN}
          emissiveIntensity={2}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* Floating ring 3 - upper, tilted */}
      <mesh ref={ring3Ref} position={[0, 580, 0]} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[10, 0.6, 8, 6]} />
        <meshStandardMaterial
          color={MATRIX_GREEN}
          emissive={MATRIX_GREEN}
          emissiveIntensity={2}
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Energy pulse ring traveling up */}
      <mesh ref={pulseRef} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[15, 2, 8, 8]} />
        <meshStandardMaterial
          color={MATRIX_GREEN}
          emissive={MATRIX_GREEN}
          emissiveIntensity={3}
          transparent
          opacity={0}
        />
      </mesh>

      {/* Top beacon */}
      <mesh ref={topGlowRef} position={[0, SPIRE_HEIGHT, 0]}>
        <sphereGeometry args={[5, 8, 8]} />
        <meshStandardMaterial
          color={MATRIX_GREEN}
          emissive={MATRIX_GREEN}
          emissiveIntensity={3}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Point light at top for glow effect */}
      <pointLight
        position={[0, SPIRE_HEIGHT, 0]}
        color={MATRIX_GREEN}
        intensity={50}
        distance={200}
        decay={2}
      />

    </group>
  );
}
