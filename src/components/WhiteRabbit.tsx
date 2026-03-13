"use client";

import { useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface WhiteRabbitProps {
  position: [number, number, number];
  visible: boolean;
  onCaught: () => void;
}

type RabbitWindowFlags = Window & {
  __rabbitClicked?: boolean;
  __rabbitCursor?: boolean;
};

const WHITE = "#f0f0f0";
const RED_EYE = "#ff0000";

// Shared geometry — prevents GPU leaks on mount/unmount
const _box = /* @__PURE__ */ new THREE.BoxGeometry(1, 1, 1);

export default function WhiteRabbit({ position, visible, onCaught }: WhiteRabbitProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { gl, camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const onCaughtRef = useRef(onCaught);

  useEffect(() => {
    onCaughtRef.current = onCaught;
  }, [onCaught]);

  const [caught, setCaught] = useState(false);
  const catchTimeRef = useRef(0);

  // Capture-phase click detection (same pattern as FounderSpire)
  useEffect(() => {
    if (!visible || caught) return;
    const canvas = gl.domElement;
    const w = window as RabbitWindowFlags;

    const hitsRabbit = (e: PointerEvent): boolean => {
      const group = groupRef.current;
      if (!group) return false;
      const rect = canvas.getBoundingClientRect();
      ndc.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(ndc.current, camera);
      return raycaster.current.intersectObject(group, true).length > 0;
    };

    let tap: { time: number; x: number; y: number } | null = null;

    const onDown = (e: PointerEvent) => {
      if (hitsRabbit(e)) {
        w.__rabbitClicked = true;
        tap = { time: performance.now(), x: e.clientX, y: e.clientY };
      }
    };

    const onUp = (e: PointerEvent) => {
      w.__rabbitClicked = false;
      if (!tap) return;
      const elapsed = performance.now() - tap.time;
      const dx = e.clientX - tap.x;
      const dy = e.clientY - tap.y;
      tap = null;
      if (elapsed > 400 || dx * dx + dy * dy > 625) return;
      setCaught(true);
      catchTimeRef.current = 0;
    };

    // Cursor
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    let lastMove = 0;
    const onMove = isTouch ? null : (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastMove < 66) return;
      lastMove = now;
      if (hitsRabbit(e)) {
        document.body.style.cursor = "pointer";
        w.__rabbitCursor = true;
      } else if (w.__rabbitCursor) {
        w.__rabbitCursor = false;
      }
    };

    canvas.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    if (onMove) canvas.addEventListener("pointermove", onMove, true);

    return () => {
      canvas.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      if (onMove) canvas.removeEventListener("pointermove", onMove, true);
      w.__rabbitClicked = false;
      w.__rabbitCursor = false;
    };
  }, [gl, camera, visible, caught]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group || !visible) return;

    if (caught) {
      // Caught animation: shrink + emissive flash
      catchTimeRef.current += delta;
      const t = catchTimeRef.current;
      const scale = Math.max(0, 1 - t * 2.5); // shrink over ~0.4s
      group.scale.setScalar(scale);

      // Flash white emissive on all meshes
      if (t < 0.5) {
        const intensity = Math.sin(t * Math.PI * 4) * 5;
        group.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.emissive) mat.emissiveIntensity = Math.max(0, intensity);
          }
        });
      }

      // After animation, fire callback
      if (t > 0.5) {
        onCaughtRef.current();
        setCaught(false);
        catchTimeRef.current = 0;
        group.scale.setScalar(1);
      }
      return;
    }

    // Idle animations
    const t = clock.getElapsedTime();

    // Gentle vertical bob
    group.position.y = position[1] + Math.sin(t * 2) * 1.5;

    // Slight ear twitch (rotate ears slightly)
    // Ears are children 2 and 3 in the group
    const leftEar = group.children[2] as THREE.Mesh;
    const rightEar = group.children[3] as THREE.Mesh;
    if (leftEar) leftEar.rotation.z = Math.sin(t * 3 + 1) * 0.08;
    if (rightEar) rightEar.rotation.z = Math.sin(t * 3 + 2) * -0.08;
  });

  if (!visible) return null;

  return (
    <group ref={groupRef} position={position}>
      {/* Invisible hitbox for easier clicking */}
      <mesh visible={false} geometry={_box} scale={[12, 18, 10]}>
        <meshBasicMaterial />
      </mesh>

      {/* Body (torso) */}
      <mesh position={[0, 4, 0]} geometry={_box} scale={[6, 7, 5]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.15} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 10, 0]} geometry={_box} scale={[5, 4, 4]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.15} />
      </mesh>

      {/* Left ear */}
      <mesh position={[-1.2, 14.5, 0]} geometry={_box} scale={[1.2, 4, 1]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.15} />
      </mesh>

      {/* Right ear */}
      <mesh position={[1.2, 14.5, 0]} geometry={_box} scale={[1.2, 4, 1]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.15} />
      </mesh>

      {/* Left eye (red - Matrix reference) */}
      <mesh position={[-1.2, 10.5, 2.1]} geometry={_box} scale={[0.8, 0.8, 0.3]}>
        <meshStandardMaterial color={RED_EYE} emissive={RED_EYE} emissiveIntensity={3} />
      </mesh>

      {/* Right eye (red) */}
      <mesh position={[1.2, 10.5, 2.1]} geometry={_box} scale={[0.8, 0.8, 0.3]}>
        <meshStandardMaterial color={RED_EYE} emissive={RED_EYE} emissiveIntensity={3} />
      </mesh>

      {/* Front left leg */}
      <mesh position={[-1.8, 0.5, 1]} geometry={_box} scale={[1.5, 2, 1.5]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.1} />
      </mesh>

      {/* Front right leg */}
      <mesh position={[1.8, 0.5, 1]} geometry={_box} scale={[1.5, 2, 1.5]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.1} />
      </mesh>

      {/* Back left leg */}
      <mesh position={[-1.8, 0.5, -1]} geometry={_box} scale={[1.5, 2, 1.5]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.1} />
      </mesh>

      {/* Back right leg */}
      <mesh position={[1.8, 0.5, -1]} geometry={_box} scale={[1.5, 2, 1.5]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.1} />
      </mesh>

      {/* Tail (round puff) */}
      <mesh position={[0, 4, -3.2]} geometry={_box} scale={[2, 2, 2]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.2} />
      </mesh>

      {/* Subtle white glow */}
      <pointLight
        position={[0, 8, 0]}
        color="#ffffff"
        intensity={15}
        distance={60}
        decay={2}
      />
    </group>
  );
}

// Mini version for building crown effect
export function MiniWhiteRabbit({ height, width, depth }: { height: number; width: number; depth: number }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.getElapsedTime();

    // Occasional hop every ~5s
    const hopCycle = t % 5;
    if (hopCycle < 0.3) {
      group.position.y = height + Math.sin(hopCycle / 0.3 * Math.PI) * 3;
    } else {
      group.position.y = height;
    }
  });

  const s = 0.6;

  return (
    <group ref={groupRef} position={[width * 0.3, height, depth * 0.3]} scale={[s, s, s]}>
      {/* Body */}
      <mesh position={[0, 4, 0]} geometry={_box} scale={[6, 7, 5]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.3} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 10, 0]} geometry={_box} scale={[5, 4, 4]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.3} />
      </mesh>

      {/* Left ear */}
      <mesh position={[-1.2, 14.5, 0]} geometry={_box} scale={[1.2, 4, 1]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.3} />
      </mesh>

      {/* Right ear */}
      <mesh position={[1.2, 14.5, 0]} geometry={_box} scale={[1.2, 4, 1]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.3} />
      </mesh>

      {/* Eyes (red) */}
      <mesh position={[-1.2, 10.5, 2.1]} geometry={_box} scale={[0.8, 0.8, 0.3]}>
        <meshStandardMaterial color={RED_EYE} emissive={RED_EYE} emissiveIntensity={2} />
      </mesh>
      <mesh position={[1.2, 10.5, 2.1]} geometry={_box} scale={[0.8, 0.8, 0.3]}>
        <meshStandardMaterial color={RED_EYE} emissive={RED_EYE} emissiveIntensity={2} />
      </mesh>

      {/* Legs */}
      <mesh position={[-1.8, 0.5, 1]} geometry={_box} scale={[1.5, 2, 1.5]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[1.8, 0.5, 1]} geometry={_box} scale={[1.5, 2, 1.5]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-1.8, 0.5, -1]} geometry={_box} scale={[1.5, 2, 1.5]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[1.8, 0.5, -1]} geometry={_box} scale={[1.5, 2, 1.5]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.2} />
      </mesh>

      {/* Tail */}
      <mesh position={[0, 4, -3.2]} geometry={_box} scale={[2, 2, 2]}>
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={0.3} />
      </mesh>

      {/* Glow */}
      <pointLight position={[0, 8, 0]} color="#ffffff" intensity={5} distance={30} decay={2} />
    </group>
  );
}
