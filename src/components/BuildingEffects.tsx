"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─── Neon Outline ────────────────────────────────────────────
// Wireframe edges with strong emission around the building

export function NeonOutline({
  width,
  height,
  depth,
  color = "#c8e64a",
}: {
  width: number;
  height: number;
  depth: number;
  color?: string;
}) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const frameCount = useRef(0);

  useFrame((state) => {
    if (!lineRef.current) return;
    frameCount.current++;
    if (frameCount.current % 3 !== 0) return;
    const mat = lineRef.current.material as THREE.LineBasicMaterial;
    mat.opacity = 0.6 + Math.sin(state.clock.elapsedTime * 3) * 0.2;
  });

  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(width + 1, height + 1, depth + 1);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [width, height, depth]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  return (
    <lineSegments ref={lineRef} geometry={geometry} position={[0, height / 2, 0]}>
      <lineBasicMaterial color={color} transparent opacity={0.8} linewidth={2} />
    </lineSegments>
  );
}

// ─── Particle Aura ───────────────────────────────────────────
// Floating particles around the building

const AURA_COUNT = 60;

export function ParticleAura({
  width,
  height,
  depth,
  color = "#c8e64a",
}: {
  width: number;
  height: number;
  depth: number;
  color?: string;
}) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, speeds } = useMemo(() => {
    const pos = new Float32Array(AURA_COUNT * 3);
    const spd = new Float32Array(AURA_COUNT);
    const spread = Math.max(width, depth) * 0.8;

    for (let i = 0; i < AURA_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = spread / 2 + Math.random() * spread * 0.4;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = Math.random() * height;
      pos[i * 3 + 2] = Math.sin(angle) * radius;
      spd[i] = 5 + Math.random() * 15;
    }
    return { positions: pos, speeds: spd };
  }, [width, height, depth]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;
    const t = state.clock.elapsedTime;

    for (let i = 0; i < AURA_COUNT; i++) {
      arr[i * 3 + 1] += speeds[i] * 0.016;
      if (arr[i * 3 + 1] > height * 1.2) {
        arr[i * 3 + 1] = 0;
      }
      // Gentle horizontal drift
      arr[i * 3] += Math.sin(t + i) * 0.02;
      arr[i * 3 + 2] += Math.cos(t + i * 0.7) * 0.02;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={2.5}
        transparent
        opacity={0.7}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// ─── Spotlight ───────────────────────────────────────────────
// Permanent spotlight cone from the rooftop pointing to sky

export function SpotlightEffect({
  height,
  width,
  depth,
  color = "#ffffcc",
}: {
  height: number;
  width: number;
  depth: number;
  color?: string;
}) {
  const coneRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!coneRef.current) return;
    const mat = coneRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.06 + Math.sin(state.clock.elapsedTime * 0.8) * 0.02;
  });

  const coneHeight = 200;
  const coneRadius = Math.max(width, depth) * 0.5;

  return (
    <group>
      <mesh ref={coneRef} position={[0, height + coneHeight / 2, 0]}>
        <cylinderGeometry args={[0, coneRadius, coneHeight, 16, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ─── Rooftop Fire ────────────────────────────────────────────
// Stylized flames (particles) rising from the rooftop

const FIRE_COUNT = 40;

export function RooftopFire({
  height,
  width,
  depth,
}: {
  height: number;
  width: number;
  depth: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(FIRE_COUNT * 3);
    const vel = new Float32Array(FIRE_COUNT);
    const halfW = width * 0.3;
    const halfD = depth * 0.3;

    for (let i = 0; i < FIRE_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * halfW * 2;
      pos[i * 3 + 1] = height + Math.random() * 15;
      pos[i * 3 + 2] = (Math.random() - 0.5) * halfD * 2;
      vel[i] = 10 + Math.random() * 20;
    }
    return { positions: pos, velocities: vel };
  }, [height, width, depth]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;
    const halfW = width * 0.3;
    const halfD = depth * 0.3;

    for (let i = 0; i < FIRE_COUNT; i++) {
      arr[i * 3 + 1] += velocities[i] * 0.016;
      // Add some horizontal wobble
      arr[i * 3] += (Math.random() - 0.5) * 0.3;
      arr[i * 3 + 2] += (Math.random() - 0.5) * 0.3;

      if (arr[i * 3 + 1] > height + 25) {
        arr[i * 3] = (Math.random() - 0.5) * halfW * 2;
        arr[i * 3 + 1] = height;
        arr[i * 3 + 2] = (Math.random() - 0.5) * halfD * 2;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#ff6622"
          size={3}
          transparent
          opacity={0.8}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

// ─── Helipad ─────────────────────────────────────────────────
// Flat cylinder on rooftop with "H" marking

export function Helipad({
  height,
  width,
  depth,
}: {
  height: number;
  width: number;
  depth: number;
}) {
  const padSize = Math.min(width, depth) * 0.6;

  return (
    <group position={[0, height + 0.5, 0]}>
      {/* Pad base */}
      <mesh>
        <cylinderGeometry args={[padSize / 2, padSize / 2, 1, 16]} />
        <meshStandardMaterial color="#444455" roughness={0.7} />
      </mesh>
      {/* H marking - vertical bars */}
      <mesh position={[-padSize * 0.15, 0.6, 0]}>
        <boxGeometry args={[padSize * 0.06, 0.2, padSize * 0.4]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={1}
        />
      </mesh>
      <mesh position={[padSize * 0.15, 0.6, 0]}>
        <boxGeometry args={[padSize * 0.06, 0.2, padSize * 0.4]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={1}
        />
      </mesh>
      {/* H marking - horizontal bar */}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[padSize * 0.36, 0.2, padSize * 0.06]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={1}
        />
      </mesh>
    </group>
  );
}

// ─── Antenna Array ───────────────────────────────────────────
// Multiple thin cylinders with blinking tip lights

export function AntennaArray({
  height,
}: {
  height: number;
}) {
  const lightRef = useRef<THREE.Group>(null);
  const frameCount = useRef(0);

  useFrame((state) => {
    if (!lightRef.current) return;
    frameCount.current++;
    if (frameCount.current % 3 !== 0) return;
    const t = state.clock.elapsedTime;
    lightRef.current.children.forEach((child, i) => {
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = Math.sin(t * 3 + i * 1.5) > 0.3 ? 4 : 0.2;
      }
    });
  });

  const antennas = [
    { x: -3, z: -2, h: 12 },
    { x: 2, z: -3, h: 16 },
    { x: -1, z: 3, h: 10 },
    { x: 4, z: 1, h: 14 },
  ];

  return (
    <group position={[0, height, 0]}>
      {antennas.map((a, i) => (
        <group key={i} position={[a.x, 0, a.z]}>
          {/* Antenna pole */}
          <mesh position={[0, a.h / 2, 0]}>
            <cylinderGeometry args={[0.3, 0.5, a.h, 6]} />
            <meshStandardMaterial color="#666677" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* Blinking tip lights */}
      <group ref={lightRef}>
        {antennas.map((a, i) => (
          <mesh key={i} position={[a.x, a.h + 0.5, a.z]}>
            <sphereGeometry args={[0.8, 8, 8]} />
            <meshStandardMaterial
              color="#ff2222"
              emissive="#ff0000"
              emissiveIntensity={4}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── Rooftop Garden ──────────────────────────────────────────
// Green plane on top with mini tree cones

export function RooftopGarden({
  height,
  width,
  depth,
}: {
  height: number;
  width: number;
  depth: number;
}) {
  const trees = useMemo(() => {
    const result = [];
    const count = 4 + Math.floor(Math.random() * 4);
    const hw = width * 0.35;
    const hd = depth * 0.35;
    for (let i = 0; i < count; i++) {
      result.push({
        x: (Math.random() - 0.5) * hw * 2,
        z: (Math.random() - 0.5) * hd * 2,
        scale: 0.6 + Math.random() * 0.6,
      });
    }
    return result;
  }, [width, depth]);

  return (
    <group position={[0, height, 0]}>
      {/* Green base */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[width * 0.85, 0.6, depth * 0.85]} />
        <meshStandardMaterial color="#2d5a1e" roughness={0.9} />
      </mesh>
      {/* Mini trees */}
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0.6, t.z]} scale={t.scale}>
          {/* Trunk */}
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.3, 0.4, 3, 6]} />
            <meshStandardMaterial color="#5a3a1a" />
          </mesh>
          {/* Foliage */}
          <mesh position={[0, 4, 0]}>
            <coneGeometry args={[2, 4, 6]} />
            <meshStandardMaterial color="#39d353" emissive="#1a5a10" emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Spire ───────────────────────────────────────────────────
// Tall cone tapering from rooftop (Empire State style)

export function Spire({
  height,
  width,
  depth,
}: {
  height: number;
  width: number;
  depth: number;
}) {
  const spireHeight = Math.min(width, depth) * 1.5;
  const baseRadius = Math.min(width, depth) * 0.12;

  return (
    <group position={[0, height, 0]}>
      {/* Base platform */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[baseRadius * 5, 2, baseRadius * 5]} />
        <meshStandardMaterial color="#888899" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Spire cone */}
      <mesh position={[0, 2 + spireHeight / 2, 0]}>
        <coneGeometry args={[baseRadius, spireHeight, 8]} />
        <meshStandardMaterial color="#aaaabb" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Tip light */}
      <mesh position={[0, spireHeight + 3, 0]}>
        <sphereGeometry args={[0.6, 8, 8]} />
        <meshStandardMaterial
          color="#ff2222"
          emissive="#ff0000"
          emissiveIntensity={3}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// ─── Billboard (Multi / Times Square) ────────────────────────
// Each purchase = one billboard slot distributed across building faces

function useBillboardTexture(imageUrl?: string | null) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const texRef = useRef<THREE.Texture | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      if (texRef.current) {
        texRef.current.dispose();
        texRef.current = null;
      }
      setTexture(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    let cancelled = false;

    loader.load(
      imageUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        // Dispose previous texture before setting new one
        if (texRef.current) texRef.current.dispose();
        tex.colorSpace = THREE.SRGBColorSpace;
        texRef.current = tex;
        setTexture(tex);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Dispose on unmount
  useEffect(() => {
    return () => {
      if (texRef.current) {
        texRef.current.dispose();
        texRef.current = null;
      }
    };
  }, []);

  return texture;
}

// Single billboard panel (internal component)
function BillboardSingle({
  imageUrl,
  billW,
  billH,
  position,
  rotation,
  color = "#c8e64a",
}: {
  imageUrl?: string | null;
  billW: number;
  billH: number;
  position: [number, number, number];
  rotation: [number, number, number];
  color?: string;
}) {
  const tex = useBillboardTexture(imageUrl);

  return (
    <group position={position} rotation={rotation}>
      {/* Billboard frame */}
      <mesh>
        <boxGeometry args={[billW + 1, billH + 1, 0.5]} />
        <meshStandardMaterial color="#222233" />
      </mesh>
      {/* Billboard face */}
      <mesh position={[0, 0, 0.3]}>
        <planeGeometry args={[billW, billH]} />
        {tex ? (
          <meshBasicMaterial map={tex} toneMapped={false} />
        ) : (
          // Empty slot or no-image — glowing accent placeholder
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={imageUrl === undefined ? 0.4 : 1.5}
            toneMapped={false}
            opacity={imageUrl === undefined ? 0.6 : 1}
            transparent={imageUrl === undefined}
          />
        )}
      </mesh>
    </group>
  );
}

// Seeded random for deterministic billboard placement
function billboardSeeded(seed: number): number {
  const s = (seed * 16807) % 2147483647;
  return (s - 1) / 2147483646;
}

export function Billboards({
  height,
  width,
  depth,
  images,
  color = "#c8e64a",
}: {
  height: number;
  width: number;
  depth: number;
  images: string[];
  color?: string;
}) {
  const slots = useMemo(() => {
    const MIN_BILL_W = 10;
    const MIN_BILL_H = 8;
    const totalFaceArea = 2 * (width + depth) * height;
    const maxSlots = Math.max(1, Math.floor(totalFaceArea / (MIN_BILL_W * MIN_BILL_H * 6)));
    const slotCount = Math.max(images.length, 1);
    const count = Math.min(slotCount, maxSlots);

    // Face definitions: [normalAxis, offset, faceWidth, rotation]
    const faces: Array<{
      faceWidth: number;
      getPos: (along: number, y: number) => [number, number, number];
      rotation: [number, number, number];
    }> = [
      {
        // Front (+Z)
        faceWidth: width,
        getPos: (along, y) => [along, y, depth / 2 + 0.5],
        rotation: [0, 0, 0],
      },
      {
        // Right (+X)
        faceWidth: depth,
        getPos: (along, y) => [width / 2 + 0.5, y, along],
        rotation: [0, -Math.PI / 2, 0],
      },
      {
        // Back (-Z)
        faceWidth: width,
        getPos: (along, y) => [-along, y, -(depth / 2 + 0.5)],
        rotation: [0, Math.PI, 0],
      },
      {
        // Left (-X)
        faceWidth: depth,
        getPos: (along, y) => [-(width / 2 + 0.5), y, -along],
        rotation: [0, Math.PI / 2, 0],
      },
    ];

    const result: Array<{
      position: [number, number, number];
      rotation: [number, number, number];
      billW: number;
      billH: number;
      imageUrl: string | undefined;
    }> = [];

    for (let i = 0; i < count; i++) {
      const face = faces[i % 4];
      const seed = i * 7919 + 42;

      // Fixed aspect ratio 1.4:1 (landscape billboard)
      const ASPECT = 1.4;
      // Billboard fills ~95% of face width (covers the wall)
      const billW = Math.max(8, face.faceWidth * 0.95);
      const billH = billW / ASPECT;

      // Y position: start from the TOP and go down (top is most visible)
      const tier = Math.floor(i / 4);
      const topY = height - billH / 2 - 2; // just below the roofline
      const y = Math.max(billH / 2 + 2, topY - tier * (billH + 4));

      // Horizontal offset along face
      const along = (billboardSeeded(seed + 4) - 0.5) * Math.max(0, face.faceWidth - billW) * 0.6;

      const img = images[i];

      result.push({
        position: face.getPos(along, y),
        rotation: face.rotation,
        billW,
        billH,
        imageUrl: img && img.length > 0 ? img : undefined,
      });
    }

    return result;
  }, [height, width, depth, images]);

  return (
    <group>
      {slots.map((slot, i) => (
        <BillboardSingle
          key={i}
          imageUrl={slot.imageUrl}
          billW={slot.billW}
          billH={slot.billH}
          position={slot.position}
          rotation={slot.rotation}
          color={color}
        />
      ))}
    </group>
  );
}

// ─── Flag ────────────────────────────────────────────────────
// Animated flag on top of the building

export function Flag({
  height,
  color = "#c8e64a",
}: {
  height: number;
  color?: string;
}) {
  const flagRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!flagRef.current) return;
    const t = state.clock.elapsedTime;
    flagRef.current.rotation.y = Math.sin(t * 2) * 0.2;
    flagRef.current.position.x = Math.sin(t * 3) * 0.3 + 3;
  });

  const poleHeight = 15;

  return (
    <group position={[0, height, 0]}>
      {/* Pole */}
      <mesh position={[0, poleHeight / 2, 0]}>
        <cylinderGeometry args={[0.3, 0.4, poleHeight, 6]} />
        <meshStandardMaterial color="#888899" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Flag cloth */}
      <mesh ref={flagRef} position={[3, poleHeight - 2, 0]}>
        <planeGeometry args={[6, 4]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Pole tip */}
      <mesh position={[0, poleHeight + 0.5, 0]}>
        <sphereGeometry args={[0.6, 8, 8]} />
        <meshStandardMaterial color="#ccccdd" metalness={0.8} />
      </mesh>
    </group>
  );
}
