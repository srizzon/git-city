"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * The Git City Bank — "on Base".
 *
 * A blue cobalt landmark tower that nods to Base (the L2): a dark-navy pixel
 * tower clad in Base-blue edge pillars and cornice, with the giant Base square
 * mark glowing on its facade and chunky "BANK" block letters on the roof. A
 * blue holographic plaza ring grounds it. Deliberately the only blue beacon in
 * the green digital-rain city.
 *
 * Facade-first: this renders the building and reports clicks. The interactive
 * banking panel is wired separately.
 *
 * Sits at the opposite end of the city from the Founder Spire (x = +519),
 * facing the center (+X).
 */

// Base brand palette — fixed, so the bank always reads as "the blue bank",
// never a recolored theme tower.
const BASE = "#0052ff"; // Base cobalt
const BASE_HOT = "#2f6bff"; // brighter blue accent
const DEEP = "#07102a"; // dark navy body
const WHITE = "#eaf0ff"; // letter core

const BANK_POSITION: [number, number, number] = [-519, 0, 0];
const BANK_SCALE = 0.6;

// Front of the building faces +X (toward the city center).
const W = 360; // width along Z
const H = 560; // tower body height
const D = 360; // depth along X
const BASE_H = 30; // stepped base height
const BODY_Y = BASE_H + H / 2;
const CORNICE_Y = BASE_H + H + 16;
const MARK_Y = BASE_H + H * 0.55;

/** Rounded-square outline — the Base mark. */
function roundedSquare(size: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const h = size / 2;
  const x = -h;
  const y = -h;
  s.moveTo(x + r, y);
  s.lineTo(x + size - r, y);
  s.quadraticCurveTo(x + size, y, x + size, y + r);
  s.lineTo(x + size, y + size - r);
  s.quadraticCurveTo(x + size, y + size, x + size - r, y + size);
  s.lineTo(x + r, y + size);
  s.quadraticCurveTo(x, y + size, x, y + size - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

interface BankBuildingProps {
  onClick?: () => void;
  /** Unused now (bank is fixed Base-blue), kept for call-site compatibility. */
  themeAccent?: string;
  themeWindowLit?: string[];
  themeFace?: string;
}

type BankWindowFlags = Window & {
  __bankClicked?: boolean;
  __bankCursor?: boolean;
  __arcadeClicked?: boolean;
  __spireClicked?: boolean;
};

export default function BankBuilding({ onClick }: BankBuildingProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { gl, camera, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const onClickRef = useRef(onClick);

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  // ─── Geometry / materials (built once) ───────────────────────
  const markGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(roundedSquare(200, 32), {
      depth: 16,
      bevelEnabled: true,
      bevelThickness: 3,
      bevelSize: 3,
      bevelSegments: 2,
    });
    g.center();
    return g;
  }, []);

  const innerGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(roundedSquare(124, 20), {
      depth: 8,
      bevelEnabled: false,
    });
    g.center();
    return g;
  }, []);

  const markMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: BASE,
        emissive: BASE,
        emissiveIntensity: 1.25,
        roughness: 0.25,
        metalness: 0.4,
        toneMapped: false,
      }),
    [],
  );

  const innerMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: BASE_HOT,
        emissive: WHITE,
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0.4,
        toneMapped: false,
      }),
    [],
  );

  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: BASE,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );

  // Faint horizontal ledger lines across the front face.
  const ledgerLines = useMemo(
    () => Array.from({ length: 7 }, (_, i) => BASE_H + (H / 8) * (i + 1)),
    [],
  );

  // ─── Click / cursor (capture-phase, mirrors FounderSpire) ────
  useEffect(() => {
    const canvas = gl.domElement;
    const w = window as BankWindowFlags;

    const hitsBank = (e: PointerEvent): boolean => {
      const group = groupRef.current;
      if (!group) return false;
      const rect = canvas.getBoundingClientRect();
      ndc.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(ndc.current, camera);

      const bankHits = raycaster.current.intersectObject(group, true);
      if (bankHits.length === 0) return false;

      const bankDistance = bankHits[0].distance;
      const sceneHits = raycaster.current.intersectObjects(scene.children, true);
      for (const hit of sceneHits) {
        if (hit.distance >= bankDistance) break;
        if ((hit.object as THREE.InstancedMesh).isInstancedMesh) return false;
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          if (obj === group) break;
          if (obj.userData?.isLandmark) return false;
          obj = obj.parent;
        }
      }
      return true;
    };

    let tap: { time: number; x: number; y: number } | null = null;

    const onDown = (e: PointerEvent) => {
      if (w.__arcadeClicked || w.__spireClicked) return;
      if (hitsBank(e)) {
        w.__bankClicked = true;
        tap = { time: performance.now(), x: e.clientX, y: e.clientY };
      }
    };

    const onUp = (e: PointerEvent) => {
      w.__bankClicked = false;
      if (!tap) return;
      const elapsed = performance.now() - tap.time;
      const dx = e.clientX - tap.x;
      const dy = e.clientY - tap.y;
      tap = null;
      if (elapsed > 400 || dx * dx + dy * dy > 625) return;
      onClickRef.current?.();
    };

    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    let lastMove = 0;
    const onMove = isTouch
      ? null
      : (e: PointerEvent) => {
          const now = performance.now();
          if (now - lastMove < 66) return;
          lastMove = now;
          if (hitsBank(e)) {
            document.body.style.cursor = "pointer";
            w.__bankCursor = true;
          } else if (w.__bankCursor) {
            w.__bankCursor = false;
          }
        };

    canvas.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    if (onMove) canvas.addEventListener("pointermove", onMove, true);

    return () => {
      canvas.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      if (onMove) canvas.removeEventListener("pointermove", onMove, true);
      w.__bankClicked = false;
      w.__bankCursor = false;
    };
  }, [gl, camera, scene]);

  // Gentle pulse on the Base mark + plaza ring.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    markMat.emissiveIntensity = 1.15 + Math.sin(t * 1.6) * 0.25;
    ringMat.opacity = 0.4 + Math.sin(t * 2) * 0.18;
  });

  return (
    <group ref={groupRef} position={BANK_POSITION} scale={BANK_SCALE} userData={{ isLandmark: true }}>
      {/* Invisible raycast hitbox covering the whole tower */}
      <mesh position={[0, BODY_Y, 0]}>
        <boxGeometry args={[D + 40, H + 80, W + 40]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Stepped base + glowing blue rim */}
      <mesh position={[0, BASE_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[D + 90, BASE_H, W + 90]} />
        <meshStandardMaterial color={DEEP} emissive="#0a1c44" emissiveIntensity={0.35} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, BASE_H + 1, 0]}>
        <boxGeometry args={[D + 100, 7, W + 100]} />
        <meshStandardMaterial color={BASE_HOT} emissive={BASE_HOT} emissiveIntensity={0.9} roughness={0.3} metalness={0.5} toneMapped={false} />
      </mesh>

      {/* Main tower body */}
      <mesh position={[0, BODY_Y, 0]} castShadow>
        <boxGeometry args={[D, H, W]} />
        <meshStandardMaterial color={DEEP} emissive="#0a1c44" emissiveIntensity={0.35} roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Faint blue ledger lines on the front face */}
      {ledgerLines.map((y, i) => (
        <mesh key={`l${i}`} position={[D / 2 + 1, y, 0]}>
          <boxGeometry args={[4, 3, W - 20]} />
          <meshStandardMaterial color={BASE_HOT} emissive={BASE_HOT} emissiveIntensity={0.7} roughness={0.3} metalness={0.5} toneMapped={false} />
        </mesh>
      ))}

      {/* Glowing blue edge pillars on the four vertical corners */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`p${sx}${sz}`} position={[(sx * D) / 2, BODY_Y, (sz * W) / 2]}>
            <boxGeometry args={[14, H, 14]} />
            <meshStandardMaterial color={BASE} emissive={BASE} emissiveIntensity={1.25} roughness={0.25} metalness={0.4} toneMapped={false} />
          </mesh>
        )),
      )}

      {/* Blue cornice + dark roof slab */}
      <mesh position={[0, CORNICE_Y, 0]} castShadow>
        <boxGeometry args={[D + 34, 32, W + 34]} />
        <meshStandardMaterial color={BASE} emissive={BASE} emissiveIntensity={1.0} roughness={0.25} metalness={0.4} toneMapped={false} />
      </mesh>
      <mesh position={[0, CORNICE_Y + 22, 0]}>
        <boxGeometry args={[D - 6, 14, W - 6]} />
        <meshStandardMaterial color={DEEP} emissive="#0a1c44" emissiveIntensity={0.35} roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Base mark — front (+X) and back (−X) */}
      <mesh geometry={markGeo} material={markMat} position={[D / 2 + 8, MARK_Y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow />
      <mesh geometry={innerGeo} material={innerMat} position={[D / 2 + 24, MARK_Y, 0]} rotation={[0, Math.PI / 2, 0]} />
      <mesh geometry={markGeo} material={markMat} position={[-D / 2 - 8, MARK_Y, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow />
      <mesh geometry={innerGeo} material={innerMat} position={[-D / 2 - 24, MARK_Y, 0]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Blue holographic plaza rings on the ground */}
      <mesh material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 2, 0]}>
        <ringGeometry args={[300, 330, 64]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 2, 0]}>
        <ringGeometry args={[360, 368, 64]} />
        <meshBasicMaterial color={BASE_HOT} transparent opacity={0.3} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* Blue beacon lighting */}
      <pointLight position={[360, MARK_Y, 0]} color={BASE} intensity={30} distance={700} decay={2} />
      <pointLight position={[60, CORNICE_Y + 80, 0]} color={BASE_HOT} intensity={22} distance={560} decay={2} />
      <pointLight position={[220, 120, 0]} color={BASE} intensity={20} distance={560} decay={2} />
    </group>
  );
}
