"use client";

import { useRef, useMemo, useState, useEffect, memo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─── Neon Outline ────────────────────────────────────────────
// Wireframe edges with strong emission around the building

export const NeonOutline = memo(function NeonOutline({
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
});

// ─── Particle Aura ───────────────────────────────────────────
// Floating particles around the building

const AURA_COUNT = 60;

export const ParticleAura = memo(function ParticleAura({
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
  const frameCount = useRef(0);

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
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;
    const t = state.clock.elapsedTime;

    for (let i = 0; i < AURA_COUNT; i++) {
      arr[i * 3 + 1] += speeds[i] * 0.032; // 2x dt to compensate skip
      if (arr[i * 3 + 1] > height * 1.2) {
        arr[i * 3 + 1] = 0;
      }
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
});

// ─── Searchlights (was Spotlight) ────────────────────────────
// 2 circus-style beams shooting straight up from rooftop

export const SpotlightEffect = memo(function SpotlightEffect({
  height,
  width,
  depth,
  color = "#c8e64a",
}: {
  height: number;
  width: number;
  depth: number;
  color?: string;
}) {
  const beam1 = useRef<THREE.Group>(null);
  const beam2 = useRef<THREE.Group>(null);
  const frameCount = useRef(0);

  const beamH = height * 3;
  const topR = Math.max(width, depth) * 0.4;
  const spread = Math.max(width, depth) * 0.25;

  useFrame((state) => {
    frameCount.current++;
    if (frameCount.current % 3 !== 0) return;
    const t = state.clock.elapsedTime;
    if (beam1.current) {
      beam1.current.rotation.x = Math.sin(t * 0.4) * 0.08;
      beam1.current.rotation.z = Math.cos(t * 0.3) * 0.06;
    }
    if (beam2.current) {
      beam2.current.rotation.x = Math.cos(t * 0.35) * 0.07;
      beam2.current.rotation.z = Math.sin(t * 0.45) * 0.08;
    }
  });

  const beamMat = (
    <meshBasicMaterial
      color={color}
      transparent
      opacity={0.1}
      blending={THREE.AdditiveBlending}
      depthWrite={false}
      side={THREE.DoubleSide}
    />
  );

  const glowMat = (
    <meshBasicMaterial
      color={color}
      transparent
      opacity={0.04}
      blending={THREE.AdditiveBlending}
      depthWrite={false}
      side={THREE.DoubleSide}
    />
  );

  return (
    <group position={[0, height, 0]}>
      {/* Beam 1 */}
      <group ref={beam1} position={[-spread, 0, -spread * 0.5]}>
        {/* Projector box base */}
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[2, 1.2, 2]} />
          <meshStandardMaterial color="#333340" emissive="#666666" emissiveIntensity={2} toneMapped={false} metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Inner beam */}
        <mesh position={[0, beamH / 2 + 1, 0]}>
          <coneGeometry args={[topR, beamH, 8, 1, true]} />
          {beamMat}
        </mesh>
        {/* Outer glow */}
        <mesh position={[0, beamH / 2 + 1, 0]}>
          <coneGeometry args={[topR * 1.6, beamH * 0.95, 8, 1, true]} />
          {glowMat}
        </mesh>
      </group>

      {/* Beam 2 */}
      <group ref={beam2} position={[spread, 0, spread * 0.5]}>
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[2, 1.2, 2]} />
          <meshStandardMaterial color="#333340" emissive="#666666" emissiveIntensity={2} toneMapped={false} metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, beamH / 2 + 1, 0]}>
          <coneGeometry args={[topR, beamH, 8, 1, true]} />
          {beamMat}
        </mesh>
        <mesh position={[0, beamH / 2 + 1, 0]}>
          <coneGeometry args={[topR * 1.6, beamH * 0.95, 8, 1, true]} />
          {glowMat}
        </mesh>
      </group>
    </group>
  );
});

// ─── Rooftop Fire ────────────────────────────────────────────
// Blocky contained campfire with strong orange glow

export const RooftopFire = memo(function RooftopFire({
  height,
  width,
  depth,
}: {
  height: number;
  width: number;
  depth: number;
}) {
  const flamesRef = useRef<THREE.Group>(null);
  const frameCount = useRef(0);

  useFrame((state) => {
    if (!flamesRef.current) return;
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;
    const t = state.clock.elapsedTime;
    flamesRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const phase = i * 1.3;
      mesh.scale.y = 0.7 + Math.sin(t * 4 + phase) * 0.3;
      mesh.position.y = mesh.userData.baseY + Math.sin(t * 3 + phase) * 1;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 3 + Math.sin(t * 5 + phase) * 1.5;
    });
  });

  const fireW = Math.min(width, depth) * 0.4;

  // 5 blocky flame columns in a cluster
  const flames = useMemo(() => [
    { x: 0, z: 0, h: 8, color: "#ff6622" },
    { x: fireW * 0.3, z: fireW * 0.2, h: 6, color: "#ff8833" },
    { x: -fireW * 0.25, z: -fireW * 0.15, h: 7, color: "#ff5511" },
    { x: fireW * 0.1, z: -fireW * 0.3, h: 5, color: "#ffaa44" },
    { x: -fireW * 0.2, z: fireW * 0.25, h: 5.5, color: "#ff7722" },
  ], [fireW]);

  return (
    <group position={[0, height, 0]}>
      {/* Fire pit base */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[fireW * 0.6, fireW * 0.7, 1.5, 8]} />
        <meshStandardMaterial color="#333340" roughness={0.8} />
      </mesh>
      {/* Blocky flame columns */}
      <group ref={flamesRef}>
        {flames.map((f, i) => (
          <mesh
            key={i}
            position={[f.x, 1.5 + f.h / 2, f.z]}
            userData={{ baseY: 1.5 + f.h / 2 }}
          >
            <boxGeometry args={[2, f.h, 2]} />
            <meshStandardMaterial
              color={f.color}
              emissive={f.color}
              emissiveIntensity={3}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
});

// ─── Helipad ─────────────────────────────────────────────────
// Flat cylinder on rooftop with "H" marking + glowing border

export const Helipad = memo(function Helipad({
  height,
  width,
  depth,
}: {
  height: number;
  width: number;
  depth: number;
}) {
  const borderRef = useRef<THREE.Mesh>(null);
  const frameCount = useRef(0);
  const padSize = Math.min(width, depth) * 0.35;

  useFrame((state) => {
    if (!borderRef.current) return;
    frameCount.current++;
    if (frameCount.current % 3 !== 0) return;
    const mat = borderRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 2 + Math.sin(state.clock.elapsedTime * 2) * 0.8;
  });

  return (
    <group position={[-width * 0.45, height + 0.5, depth * 0.45]}>
      {/* Glowing border ring */}
      <mesh ref={borderRef} position={[0, 0.3, 0]}>
        <torusGeometry args={[padSize / 2 + 0.3, 0.4, 8, 24]} />
        <meshStandardMaterial
          color="#ff4444"
          emissive="#ff4444"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
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
});

// ─── Solar Panels (was Antenna Array) ────────────────────────
// 2×3 grid of tilted solar panels on rooftop center

export const AntennaArray = memo(function AntennaArray({
  height,
  width,
  depth,
}: {
  height: number;
  width: number;
  depth: number;
}) {
  const panelRef = useRef<THREE.Group>(null);
  const frameCount = useRef(0);

  useFrame((state) => {
    if (!panelRef.current) return;
    frameCount.current++;
    if (frameCount.current % 4 !== 0) return;
    const t = state.clock.elapsedTime;
    panelRef.current.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissiveIntensity !== undefined) {
          mat.emissiveIntensity = 0.3 + Math.sin(t * 0.8) * 0.15;
        }
      }
    });
  });

  const panelW = 3;
  const panelD = 2;
  const cols = 3;
  const rows = 2;
  const gapX = 0.6;
  const gapZ = 0.5;
  const totalW = cols * panelW + (cols - 1) * gapX;
  const totalD = rows * panelD + (rows - 1) * gapZ;

  return (
    <group position={[0, height, 0]}>
      {/* Metal frame base */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[totalW + 1.5, 0.4, totalD + 1.5]} />
        <meshStandardMaterial color="#555566" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Solar panels 2×3 grid */}
      <group ref={panelRef}>
        {Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const x = -totalW / 2 + panelW / 2 + c * (panelW + gapX);
            const z = -totalD / 2 + panelD / 2 + r * (panelD + gapZ);
            return (
              <mesh
                key={`${r}-${c}`}
                position={[x, 1.2, z]}
                rotation={[-0.44, 0, 0]} // ~25° tilt
              >
                <boxGeometry args={[panelW, 0.2, panelD]} />
                <meshStandardMaterial
                  color="#223355"
                  emissive="#334477"
                  emissiveIntensity={0.3}
                  metalness={0.8}
                  roughness={0.2}
                />
              </mesh>
            );
          })
        )}
      </group>
      {/* Support struts under each row */}
      {Array.from({ length: rows }).map((_, r) => {
        const z = -totalD / 2 + panelD / 2 + r * (panelD + gapZ);
        return (
          <mesh key={`strut-${r}`} position={[0, 0.7, z]}>
            <boxGeometry args={[totalW, 0.2, 0.2]} />
            <meshStandardMaterial color="#555566" metalness={0.6} roughness={0.4} />
          </mesh>
        );
      })}
    </group>
  );
});

// ─── Rooftop Garden ──────────────────────────────────────────
// Green base with cubic Minecraft-style trees (box geometry)

export const RooftopGarden = memo(function RooftopGarden({
  height,
  width,
  depth,
}: {
  height: number;
  width: number;
  depth: number;
}) {
  const hw = width * 0.32;
  const hd = depth * 0.32;

  const { trees, bushes, flowers } = useMemo(() => {
    const greens = ["#2d5a1e", "#1e6b2e", "#39d353"];
    const flowerColors = ["#ff69b4", "#ffdd44", "#ffffff", "#ff9999", "#ddaaff"];

    // Trees: 4-6, varied sizes
    const treeCount = 4 + Math.floor(Math.random() * 3);
    const treeList = [];
    for (let i = 0; i < treeCount; i++) {
      treeList.push({
        x: (Math.random() - 0.5) * hw * 2,
        z: (Math.random() - 0.5) * hd * 2,
        trunkH: 1.5 + Math.random() * 3,
        canopySize: 2.5 + Math.random() * 2.5,
        color: greens[i % greens.length],
      });
    }

    // Bushes: 4-6 flat green spheres
    const bushCount = 4 + Math.floor(Math.random() * 3);
    const bushList = [];
    for (let i = 0; i < bushCount; i++) {
      bushList.push({
        x: (Math.random() - 0.5) * hw * 2,
        z: (Math.random() - 0.5) * hd * 2,
        size: 1 + Math.random() * 1,
        color: greens[Math.floor(Math.random() * greens.length)],
      });
    }

    // Flowers: 6-10 tiny colorful spheres
    const flowerCount = 6 + Math.floor(Math.random() * 5);
    const flowerList = [];
    for (let i = 0; i < flowerCount; i++) {
      flowerList.push({
        x: (Math.random() - 0.5) * hw * 2,
        z: (Math.random() - 0.5) * hd * 2,
        color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
      });
    }

    return { trees: treeList, bushes: bushList, flowers: flowerList };
  }, [hw, hd]);

  return (
    <group position={[0, height, 0]}>
      {/* Green base (grass block) */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[width * 0.85, 0.8, depth * 0.85]} />
        <meshStandardMaterial color="#2d5a1e" emissive="#1a3a10" emissiveIntensity={0.3} />
      </mesh>
      {/* Cubic Minecraft-style trees */}
      {trees.map((t, i) => (
        <group key={`t${i}`} position={[t.x, 0.8, t.z]}>
          {/* Trunk */}
          <mesh position={[0, t.trunkH / 2, 0]}>
            <boxGeometry args={[1.2, t.trunkH, 1.2]} />
            <meshStandardMaterial color="#5a3a1a" />
          </mesh>
          {/* Foliage */}
          <mesh position={[0, t.trunkH + t.canopySize / 2 - 0.5, 0]}>
            <boxGeometry args={[t.canopySize, t.canopySize, t.canopySize]} />
            <meshStandardMaterial color={t.color} emissive={t.color} emissiveIntensity={0.3} />
          </mesh>
          {/* Small top cube */}
          <mesh position={[0, t.trunkH + t.canopySize + 0.5, 0]}>
            <boxGeometry args={[t.canopySize * 0.6, t.canopySize * 0.5, t.canopySize * 0.6]} />
            <meshStandardMaterial color={t.color} emissive={t.color} emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}
      {/* Bushes — flat squished cubes */}
      {bushes.map((b, i) => (
        <mesh key={`b${i}`} position={[b.x, 0.8 + b.size * 0.35, b.z]}>
          <boxGeometry args={[b.size * 1.4, b.size * 0.7, b.size * 1.4]} />
          <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={0.2} />
        </mesh>
      ))}
      {/* Flowers — tiny colorful cubes */}
      {flowers.map((f, i) => (
        <mesh key={`f${i}`} position={[f.x, 1.1, f.z]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial
            color={f.color}
            emissive={f.color}
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}
    </group>
  );
});

// ─── Water Tower (was Spire) ─────────────────────────────────
// Pixel water tower on corner of rooftop

export const Spire = memo(function Spire({
  height,
  width,
  depth,
}: {
  height: number;
  width: number;
  depth: number;
}) {
  const legH = 8;
  const tankR = 4;
  const tankH = 4;

  return (
    <group position={[-width * 0.45, height, -depth * 0.45]}>
      {/* 4 legs */}
      {[
        [1.5, 0, 1.5],
        [-1.5, 0, 1.5],
        [1.5, 0, -1.5],
        [-1.5, 0, -1.5],
      ].map(([x, _, z], i) => (
        <mesh key={i} position={[x, legH / 2, z]}>
          <cylinderGeometry args={[0.3, 0.3, legH, 6]} />
          <meshStandardMaterial color="#666677" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* Cross braces */}
      {[
        { pos: [0, legH * 0.35, 1.5] as const, size: [3, 0.3, 0.3] as const },
        { pos: [0, legH * 0.35, -1.5] as const, size: [3, 0.3, 0.3] as const },
        { pos: [1.5, legH * 0.35, 0] as const, size: [0.3, 0.3, 3] as const },
        { pos: [-1.5, legH * 0.35, 0] as const, size: [0.3, 0.3, 3] as const },
      ].map((b, i) => (
        <mesh key={`b${i}`} position={[b.pos[0], b.pos[1], b.pos[2]]}>
          <boxGeometry args={[b.size[0], b.size[1], b.size[2]]} />
          <meshStandardMaterial color="#555566" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {/* Tank */}
      <mesh position={[0, legH + tankH / 2, 0]}>
        <cylinderGeometry args={[tankR, tankR, tankH, 8]} />
        <meshStandardMaterial color="#556688" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Tank band */}
      <mesh position={[0, legH + tankH * 0.3, 0]}>
        <cylinderGeometry args={[tankR + 0.15, tankR + 0.15, 0.5, 8]} />
        <meshStandardMaterial color="#445577" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Conical roof */}
      <mesh position={[0, legH + tankH + 1.2, 0]}>
        <coneGeometry args={[tankR + 0.5, 2.4, 8]} />
        <meshStandardMaterial color="#667799" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Ladder (boxes stacked on one side) */}
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={`l${i}`} position={[tankR - 0.5, 1.5 + i * 1.5, 0]}>
          <boxGeometry args={[0.4, 0.25, 1.2]} />
          <meshStandardMaterial color="#777788" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* Ladder rails */}
      {[-0.5, 0.5].map((z, i) => (
        <mesh key={`r${i}`} position={[tankR - 0.5, legH / 2 + 1, z]}>
          <boxGeometry args={[0.2, legH + 2, 0.2]} />
          <meshStandardMaterial color="#777788" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
});

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

export const Billboards = memo(function Billboards({
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
});

// ─── Flag ────────────────────────────────────────────────────
// Animated flag on corner of building (front-right)

export const Flag = memo(function Flag({
  height,
  width,
  depth,
  color = "#c8e64a",
}: {
  height: number;
  width: number;
  depth: number;
  color?: string;
}) {
  const flagRef = useRef<THREE.Mesh>(null);
  const frameCount = useRef(0);

  useFrame((state) => {
    if (!flagRef.current) return;
    frameCount.current++;
    if (frameCount.current % 3 !== 0) return;
    const t = state.clock.elapsedTime;
    flagRef.current.rotation.y = Math.sin(t * 2) * 0.2;
    flagRef.current.position.x = Math.sin(t * 3) * 0.2 + 2.5;
  });

  const poleHeight = 10;

  return (
    <group position={[width * 0.45, height, depth * 0.45]}>
      {/* Pole */}
      <mesh position={[0, poleHeight / 2, 0]}>
        <cylinderGeometry args={[0.25, 0.35, poleHeight, 6]} />
        <meshStandardMaterial color="#888899" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Flag cloth */}
      <mesh ref={flagRef} position={[2.5, poleHeight - 1.5, 0]}>
        <planeGeometry args={[5, 3]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Pole tip */}
      <mesh position={[0, poleHeight + 0.4, 0]}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshStandardMaterial color="#ccccdd" metalness={0.8} />
      </mesh>
    </group>
  );
});

// ─── Neon Trim (aura zone) ───────────────────────────────────
// Glowing neon outlines on all 12 building edges + scanning band

export const NeonTrim = memo(function NeonTrim({
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
  const edgesRef = useRef<THREE.Group>(null);
  const scanRef = useRef<THREE.Group>(null);
  const frameCount = useRef(0);

  const w2 = width / 2;
  const d2 = depth / 2;
  const lw = 0.5;

  // 12 edges of the building box
  const edges = useMemo(() => {
    const e: { pos: [number, number, number]; size: [number, number, number] }[] = [];
    // 4 vertical corner edges
    for (const [x, z] of [[w2, d2], [-w2, d2], [w2, -d2], [-w2, -d2]] as [number, number][]) {
      e.push({ pos: [x, height / 2, z], size: [lw, height + lw, lw] });
    }
    // 4 bottom horizontals
    e.push({ pos: [0, 0, d2], size: [width, lw, lw] });
    e.push({ pos: [0, 0, -d2], size: [width, lw, lw] });
    e.push({ pos: [w2, 0, 0], size: [lw, lw, depth] });
    e.push({ pos: [-w2, 0, 0], size: [lw, lw, depth] });
    // 4 top horizontals
    e.push({ pos: [0, height, d2], size: [width, lw, lw] });
    e.push({ pos: [0, height, -d2], size: [width, lw, lw] });
    e.push({ pos: [w2, height, 0], size: [lw, lw, depth] });
    e.push({ pos: [-w2, height, 0], size: [lw, lw, depth] });
    return e;
  }, [w2, d2, width, depth, height]);

  useFrame((state) => {
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;
    const t = state.clock.elapsedTime;
    const pulse = 0.45 + Math.sin(t * 1.8) * 0.2;

    if (edgesRef.current) {
      edgesRef.current.children.forEach((g) => {
        const eg = g as THREE.Group;
        const solid = (eg.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        const glow = (eg.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        solid.opacity = pulse;
        glow.opacity = pulse * 0.15;
      });
    }

    if (scanRef.current) {
      const phase = (t / 3.5) % 1;
      scanRef.current.position.y = phase * height;
      const intensity = 0.7 - Math.abs(phase - 0.5) * 0.4;
      const ch = scanRef.current.children;
      for (let i = 0; i < 4; i++) {
        ((ch[i] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = intensity;
      }
      ((ch[4] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = intensity * 0.12;
    }
  });

  return (
    <group>
      {/* Neon edge outlines */}
      <group ref={edgesRef}>
        {edges.map((edge, i) => (
          <group key={i}>
            <mesh position={edge.pos}>
              <boxGeometry args={edge.size} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.45}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            <mesh position={edge.pos}>
              <boxGeometry args={[edge.size[0] + 1.2, edge.size[1] + 0.3, edge.size[2] + 1.2]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.07}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* Scanning band that sweeps upward */}
      <group ref={scanRef}>
        <mesh position={[0, 0, d2]}>
          <boxGeometry args={[width + 1, 0.6, 0.6]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, -d2]}>
          <boxGeometry args={[width + 1, 0.6, 0.6]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh position={[w2, 0, 0]}>
          <boxGeometry args={[0.6, 0.6, depth + 1]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh position={[-w2, 0, 0]}>
          <boxGeometry args={[0.6, 0.6, depth + 1]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        {/* Glow plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width + 3, depth + 3]} />
          <meshBasicMaterial color={color} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>

    </group>
  );
});

// ─── Satellite Dish (crown zone) ─────────────────────────────

export const SatelliteDish = memo(function SatelliteDish({
  height,
  width,
  depth,
  color = "#c8e64a",
}: {
  height: number;
  width: number;
  depth: number;
  color?: string;
}) {
  const dishRef = useRef<THREE.Group>(null);
  const frameCount = useRef(0);

  useFrame((state) => {
    if (!dishRef.current) return;
    frameCount.current++;
    if (frameCount.current % 3 !== 0) return;
    dishRef.current.rotation.y = state.clock.elapsedTime * 0.3;
  });

  const dishSize = Math.min(width, depth) * 0.25;

  return (
    <group position={[width * 0.45, height, -depth * 0.45]}>
      {/* Support pole */}
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[0.5, 0.8, 6, 6]} />
        <meshStandardMaterial color="#666677" metalness={0.7} roughness={0.3} />
      </mesh>
      <group ref={dishRef} position={[0, 7, 0]} rotation={[0.4, 0, 0]}>
        {/* Dish bowl (half sphere approximation) */}
        <mesh>
          <cylinderGeometry args={[dishSize * 0.3, dishSize, 3, 12]} />
          <meshStandardMaterial color="#aaaabb" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Feed horn */}
        <mesh position={[0, 3, 0]}>
          <cylinderGeometry args={[0.3, 0.6, 4, 6]} />
          <meshStandardMaterial color="#888899" />
        </mesh>
        {/* Signal light */}
        <mesh position={[0, 5.5, 0]}>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
});

// ─── Crown Item (crown zone — premium) ──────────────────────

export const CrownItem = memo(function CrownItem({
  height,
  color = "#ffd700",
  focused,
}: {
  height: number;
  color?: string;
  focused?: boolean;
}) {
  const crownRef = useRef<THREE.Group>(null);
  const frameCount = useRef(0);
  // Above label when not focused, closer to roof when focused (label hidden)
  const targetY = focused ? height + 14 : height + 24;

  useFrame((state) => {
    if (!crownRef.current) return;
    frameCount.current++;
    if (frameCount.current % 3 !== 0) return;
    const t = state.clock.elapsedTime;
    crownRef.current.position.y += (targetY + Math.sin(t * 1.5) * 1.5 - crownRef.current.position.y) * 0.15;
    crownRef.current.rotation.y = t * 0.5;
  });

  const S = 4.5; // half-size of crown square
  const bH = 3.5; // band height
  const bW = 1; // band wall thickness
  const pH = 5; // tall prong height above band
  const pW = 1.6; // prong width
  const gemColors = ["#ff1133", "#3366ff", "#11dd55", "#ff8800"];

  return (
    <group ref={crownRef} position={[0, height + 24, 0]}>
      {/* Band — 4 walls forming a hollow square */}
      <mesh position={[0, bH / 2, S]}>
        <boxGeometry args={[S * 2 + bW, bH, bW]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} toneMapped={false} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, bH / 2, -S]}>
        <boxGeometry args={[S * 2 + bW, bH, bW]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} toneMapped={false} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[S, bH / 2, 0]}>
        <boxGeometry args={[bW, bH, S * 2 - bW]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} toneMapped={false} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[-S, bH / 2, 0]}>
        <boxGeometry args={[bW, bH, S * 2 - bW]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} toneMapped={false} metalness={0.6} roughness={0.3} />
      </mesh>

      {/* 4 tall corner prongs + gems */}
      {([[S, S], [-S, S], [S, -S], [-S, -S]] as [number, number][]).map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, bH + pH / 2, z]}>
            <boxGeometry args={[pW, pH, pW]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} toneMapped={false} metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[x, bH + pH + 0.6, z]}>
            <boxGeometry args={[1.1, 1.1, 1.1]} />
            <meshStandardMaterial color={gemColors[i]} emissive={gemColors[i]} emissiveIntensity={3} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* 4 shorter mid-wall prongs (zigzag crown silhouette) */}
      {([[0, S], [0, -S], [S, 0], [-S, 0]] as [number, number][]).map(([x, z], i) => (
        <mesh key={`m${i}`} position={[x, bH + pH * 0.35, z]}>
          <boxGeometry args={[pW * 0.7, pH * 0.45, pW * 0.7]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} toneMapped={false} metalness={0.6} roughness={0.3} />
        </mesh>
      ))}

    </group>
  );
});

// ─── Pool Party (roof zone — premium) ───────────────────────

export const PoolParty = memo(function PoolParty({
  height,
  width,
  depth,
}: {
  height: number;
  width: number;
  depth: number;
}) {
  const waterRef = useRef<THREE.Mesh>(null);
  const frameCount = useRef(0);

  useFrame((state) => {
    if (!waterRef.current) return;
    frameCount.current++;
    if (frameCount.current % 3 !== 0) return;
    const mat = waterRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 1.5 + Math.sin(state.clock.elapsedTime * 2) * 0.3;
  });

  const poolW = width * 0.7;
  const poolD = depth * 0.5;

  return (
    <group position={[0, height, 0]}>
      {/* Pool rim */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[poolW + 2, 1.5, poolD + 2]} />
        <meshStandardMaterial color="#c0c0c8" />
      </mesh>
      {/* Water */}
      <mesh ref={waterRef} position={[0, 1, 0]}>
        <boxGeometry args={[poolW, 0.8, poolD]} />
        <meshStandardMaterial
          color="#40b0e0"
          emissive="#2080c0"
          emissiveIntensity={1.5}
          toneMapped={false}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Lounge chairs (pixelated blocks) */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (poolW / 2 + 2.5), 0.5, 0]}>
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[2, 0.4, 4]} />
            <meshStandardMaterial color="#e0d0a0" />
          </mesh>
          <mesh position={[side * 0.8, 1.2, -1.5]} rotation={[0.3 * side, 0, 0]}>
            <boxGeometry args={[1.5, 1.5, 0.3]} />
            <meshStandardMaterial color="#e0d0a0" />
          </mesh>
        </group>
      ))}
    </group>
  );
});

// ─── Holo Shield (was Hologram Ring) ─────────────────────────
// Wireframe force field wrapping building + 2 orbiting data rings

export const HologramRing = memo(function HologramRing({
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
  const shieldRef = useRef<THREE.Mesh>(null);
  const dataRing1 = useRef<THREE.Mesh>(null);
  const dataRing2 = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const frameCount = useRef(0);

  // Shield must enclose the building — use diagonal + padding
  const diag = Math.sqrt(width * width + depth * depth) * 0.5;
  const shieldR = Math.max(diag, height * 0.5) + 3;
  const ringR = shieldR + 2;

  useFrame((state) => {
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;
    const t = state.clock.elapsedTime;
    if (shieldRef.current) {
      const pulse = 1 + Math.sin(t * 2) * 0.015;
      shieldRef.current.scale.set(pulse, pulse, pulse);
      const mat = shieldRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.12 + Math.sin(t * 3) * 0.04;
    }
    if (dataRing1.current) dataRing1.current.rotation.y = t * 0.7;
    if (dataRing2.current) dataRing2.current.rotation.y = -t * 0.5;
    if (haloRef.current) {
      const mat = haloRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.03 + Math.sin(t * 1.5) * 0.015;
    }
  });

  return (
    <group position={[0, height * 0.5, 0]}>
      {/* Wireframe force field */}
      <mesh ref={shieldRef}>
        <sphereGeometry args={[shieldR, 10, 8]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Inner fill glow */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[shieldR * 0.97, 10, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.03}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Data ring 1 — tilted orbit */}
      <group rotation={[1.2, 0, 0]}>
        <mesh ref={dataRing1}>
          <torusGeometry args={[ringR, 0.4, 6, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.45}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Data ring 2 — counter-tilted */}
      <group rotation={[-0.8, 0, 0.5]}>
        <mesh ref={dataRing2}>
          <torusGeometry args={[ringR * 0.9, 0.35, 6, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.35}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

    </group>
  );
});

// ─── Electric Storm (was Lightning Aura) ─────────────────────
// Storm clouds + zig-zag lightning bolts + rain + flash

const RAIN_COUNT = 20;
const BOLT_SEGS = 4;
const BOLT_SLOTS = 3;

export const LightningAura = memo(function LightningAura({
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
  const rainRef = useRef<THREE.Group>(null);
  const boltsRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Group>(null);
  const nextStrike = useRef(0);
  const strikeEnd = useRef(0);

  const spread = Math.max(width, depth) * 1.2;
  const cloudY = height * 1.1;
  const rainTop = cloudY - 2;
  const rainBot = -height * 0.5 - 2;

  // Cloud blocks
  const clouds = useMemo(() => {
    const arr: { x: number; z: number; y: number; w: number; h: number; d: number }[] = [];
    for (let i = 0; i < 4; i++) {
      arr.push({
        x: (Math.random() - 0.5) * spread * 1.6,
        z: (Math.random() - 0.5) * spread * 1.6,
        y: cloudY + (Math.random() - 0.5) * 3,
        w: 4 + Math.random() * 8, h: 2 + Math.random() * 2, d: 4 + Math.random() * 8,
      });
    }
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = spread * (0.6 + Math.random() * 0.5);
      arr.push({
        x: Math.cos(a) * r, z: Math.sin(a) * r,
        y: cloudY + (Math.random() - 0.5) * 2,
        w: 3 + Math.random() * 5, h: 1.5 + Math.random() * 1.5, d: 3 + Math.random() * 5,
      });
    }
    return arr;
  }, [spread, cloudY]);

  // Rain
  const drops = useMemo(() => {
    const arr: { x: number; z: number; y: number; speed: number; len: number }[] = [];
    for (let i = 0; i < RAIN_COUNT; i++) {
      arr.push({
        x: (Math.random() - 0.5) * spread * 2,
        z: (Math.random() - 0.5) * spread * 2,
        y: rainBot + Math.random() * (rainTop - rainBot),
        speed: 25 + Math.random() * 20,
        len: 1.0 + Math.random() * 1.2,
      });
    }
    return arr;
  }, [spread, rainTop, rainBot]);

  // Bolt zig-zag state
  const boltState = useMemo(() => {
    const slots = [];
    for (let b = 0; b < BOLT_SLOTS; b++) {
      const segs = [];
      for (let s = 0; s < BOLT_SEGS; s++) {
        segs.push({ x: 0, y: 0, z: 0, rZ: 0, len: 3 });
      }
      slots.push(segs);
    }
    return slots;
  }, []);

  const generateBolt = (segs: typeof boltState[0]) => {
    let cx = (Math.random() - 0.5) * spread;
    let cy = cloudY - 2;
    let cz = (Math.random() - 0.5) * spread;
    const targetY = -height * 0.5 + height * Math.random() * 0.3;
    const stepY = (cy - targetY) / BOLT_SEGS;
    for (let s = 0; s < BOLT_SEGS; s++) {
      const nx = cx + (Math.random() - 0.5) * 6;
      const ny = cy - stepY;
      const nz = cz + (Math.random() - 0.5) * 6;
      const dx = nx - cx;
      const dy = ny - cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      segs[s].x = (cx + nx) / 2;
      segs[s].y = (cy + ny) / 2;
      segs[s].z = (cz + nz) / 2;
      segs[s].rZ = -Math.atan2(dx, dy);
      segs[s].len = len;
      cx = nx; cy = ny; cz = nz;
    }
  };

  const accDelta = useRef(0);
  const frameCount = useRef(0);

  useFrame((state, delta) => {
    accDelta.current += delta;
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;
    const dt = accDelta.current;
    accDelta.current = 0;
    const t = state.clock.elapsedTime;

    // Cloud bob
    if (cloudsRef.current) cloudsRef.current.position.y = Math.sin(t * 0.3) * 0.5;

    // Rain (using accumulated delta for correct speed)
    if (rainRef.current) {
      const ch = rainRef.current.children;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const d = drops[i];
        const m = ch[i] as THREE.Mesh;
        if (!m) continue;
        d.y -= d.speed * dt;
        if (d.y < rainBot) {
          d.y = rainTop;
          d.x = (Math.random() - 0.5) * spread * 2;
          d.z = (Math.random() - 0.5) * spread * 2;
        }
        m.position.set(d.x, d.y, d.z);
      }
    }

    // Strike timing
    const striking = t < strikeEnd.current;
    if (t > nextStrike.current) {
      nextStrike.current = t + 0.5 + Math.random() * 2;
      strikeEnd.current = t + 0.07 + Math.random() * 0.06;
      boltState.forEach((segs) => generateBolt(segs));
    }

    // Bolt meshes
    if (boltsRef.current) {
      const ch = boltsRef.current.children;
      for (let b = 0; b < BOLT_SLOTS; b++) {
        for (let s = 0; s < BOLT_SEGS; s++) {
          const m = ch[b * BOLT_SEGS + s] as THREE.Mesh;
          if (!m) continue;
          const seg = boltState[b][s];
          m.position.set(seg.x, seg.y, seg.z);
          m.rotation.set(0, 0, seg.rZ);
          m.scale.y = seg.len / 3;
          (m.material as THREE.MeshBasicMaterial).opacity = striking ? 0.9 : 0;
        }
      }
    }

    // Cloud flash glow (emissive replaces pointLights)
    if (cloudsRef.current) {
      cloudsRef.current.children.forEach((c) => {
        const mat = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = striking ? 4.0 : 0;
        mat.toneMapped = !striking;
      });
    }
  });

  return (
    <group position={[0, height * 0.5, 0]}>
      {/* Storm clouds — dark pixel blocks */}
      <group ref={cloudsRef}>
        {clouds.map((c, i) => (
          <mesh key={i} position={[c.x, c.y, c.z]}>
            <boxGeometry args={[c.w, c.h, c.d]} />
            <meshStandardMaterial
              color="#1a1a28"
              emissive={color}
              emissiveIntensity={0}
              transparent
              opacity={0.85}
            />
          </mesh>
        ))}
      </group>

      {/* Lightning bolts — 3 slots × 6 zig-zag segments */}
      <group ref={boltsRef}>
        {Array.from({ length: BOLT_SLOTS * BOLT_SEGS }).map((_, i) => (
          <mesh key={i}>
            <boxGeometry args={[0.5, 3, 0.5]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* Rain */}
      <group ref={rainRef}>
        {drops.map((d, i) => (
          <mesh key={i} position={[d.x, d.y, d.z]}>
            <boxGeometry args={[0.1, d.len, 0.1]} />
            <meshBasicMaterial
              color="#8899bb"
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

    </group>
  );
});

// ─── LED Banner (faces zone) ─────────────────────────────────
// Scrolling marquee segments around building — Times Square style

const LED_SEGS = 8; // segments per face

export const LEDBanner = memo(function LEDBanner({
  height,
  width,
  depth,
  color = "#c8e64a",
}: {
  height: number;
  width: number;
  depth: number;
  color?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const frameCount = useRef(0);

  const bannerH = 3;
  const y = height * 0.45;
  const hw = width / 2 + 0.3;
  const hd = depth / 2 + 0.3;

  // Build face configs: each face has LED_SEGS scrolling blocks
  const faces = useMemo(() => [
    { axis: "x" as const, faceW: width, pos: [0, y, hd] as const, rot: 0 },      // front
    { axis: "x" as const, faceW: width, pos: [0, y, -hd] as const, rot: 0 },     // back
    { axis: "z" as const, faceW: depth, pos: [hw, y, 0] as const, rot: 0 },      // right
    { axis: "z" as const, faceW: depth, pos: [-hw, y, 0] as const, rot: 0 },     // left
  ], [width, depth, y, hw, hd]);

  useFrame((state) => {
    if (!groupRef.current) return;
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;
    const t = state.clock.elapsedTime;
    const children = groupRef.current.children;
    let idx = 0;
    for (let f = 0; f < faces.length; f++) {
      const face = faces[f];
      const segW = face.faceW / LED_SEGS;
      for (let s = 0; s < LED_SEGS; s++) {
        const mesh = children[idx] as THREE.Mesh;
        if (!mesh) { idx++; continue; }
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const phase = (s / LED_SEGS + f * 0.25 + t * 0.4) % 1;
        const brightness = 0.3 + Math.pow(Math.sin(phase * Math.PI), 2) * 2.5;
        mat.emissiveIntensity = brightness;
        const scale = 1 + (brightness > 2 ? 0.05 : 0);
        mesh.scale.y = scale;
        idx++;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {faces.flatMap((face, f) => {
        const segW = face.faceW / LED_SEGS;
        return Array.from({ length: LED_SEGS }, (_, s) => {
          const offset = -face.faceW / 2 + segW / 2 + s * segW;
          const gap = 0.3;
          const px = face.axis === "x" ? face.pos[0] + offset : face.pos[0];
          const pz = face.axis === "z" ? face.pos[2] + offset : face.pos[2];
          const sizeX = face.axis === "x" ? segW - gap : 0.5;
          const sizeZ = face.axis === "z" ? segW - gap : 0.5;
          return (
            <mesh key={`${f}-${s}`} position={[px, face.pos[1], pz]}>
              <boxGeometry args={[sizeX, bannerH, sizeZ]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.5}
                toneMapped={false}
              />
            </mesh>
          );
        });
      })}
    </group>
  );
});

// ─── Streak Glow ──────────────────────────────────────────
// Vertical neon strips on building edges. Height scales with streak.
// Uses theme accent color. No conflict with roof/crown items.

export const StreakFlame = memo(function StreakFlame({
  height,
  width,
  depth,
  streakDays,
  color = "#c8e64a",
}: {
  height: number;
  width: number;
  depth: number;
  streakDays: number;
  color?: string;
}) {
  // Streak determines how far up the strips go (10% to 100%)
  const fillPct = Math.min(1, streakDays <= 1 ? 0.1 : streakDays < 7 ? streakDays / 30 : streakDays < 14 ? 0.5 : streakDays < 30 ? 0.75 : 1);
  const stripH = height * fillPct;
  const intensity = streakDays >= 30 ? 5 : streakDays >= 14 ? 4 : streakDays >= 7 ? 3 : 2;
  const stripW = 1.2;

  // 4 corner positions
  const corners = useMemo(() => {
    const hw = width / 2;
    const hd = depth / 2;
    return [
      { x: -hw, z: -hd },
      { x: hw, z: -hd },
      { x: hw, z: hd },
      { x: -hw, z: hd },
    ];
  }, [width, depth]);

  return (
    <group>
      {corners.map((c, i) => (
        <mesh key={i} position={[c.x, stripH / 2, c.z]}>
          <boxGeometry args={[stripW, stripH, stripW]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={intensity}
            toneMapped={false}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
});
