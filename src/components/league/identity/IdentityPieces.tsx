"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { LOT, rotToRadians } from "@/lib/league-city/grid";
import { BILLBOARD, FLAG, PORTAL } from "@/lib/league-city/identity-geometry";

// Portal, billboard, flag, plaza floor logo and hill sign. The textures come
// from IdentityLayer (one set per city), so every piece shows the same logo.

const METAL = "#3a3f4a";

/** A lit face: the texture glows a little so it reads at night. */
function Face({ map, w, h, glow = 0.55 }: { map: THREE.Texture; w: number; h: number; glow?: number }) {
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={glow} roughness={0.9} />
    </mesh>
  );
}

// ─── Portal ──────────────────────────────────────────────────

/** The entrance arch over the main street: two pillars and a beam with the name (and logo). */
export function Portal({
  position,
  beam,
  onClick,
}: {
  position: [number, number];
  beam: THREE.Texture;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const { halfSpan, pillar, height, beam: bh } = PORTAL;
  const bw = halfSpan * 2 + pillar;
  return (
    <group position={[position[0], 0, position[1]]}>
      {[-halfSpan, halfSpan].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, height / 2, 0]}>
            <boxGeometry args={[pillar, height, pillar]} />
            <meshStandardMaterial color="#232a36" emissive="#232a36" emissiveIntensity={0.3} />
          </mesh>
          {/* Lime trim, like the HUD */}
          <mesh position={[0, height / 2, 0]}>
            <boxGeometry args={[pillar + 0.3, height * 0.92, 0.5]} />
            <meshStandardMaterial color="#c8e64a" emissive="#c8e64a" emissiveIntensity={0.9} toneMapped={false} />
          </mesh>
          <mesh position={[0, 1, 0]}>
            <boxGeometry args={[pillar + 1.4, 2, pillar + 1.4]} />
            <meshStandardMaterial color={METAL} emissive={METAL} emissiveIntensity={0.25} />
          </mesh>
        </group>
      ))}
      <group position={[0, height + bh / 2 - 1, 0]} onClick={onClick}>
        <mesh>
          <boxGeometry args={[bw + 2, bh + 1.4, 2]} />
          <meshStandardMaterial color="#1b1f27" emissive="#1b1f27" emissiveIntensity={0.2} />
        </mesh>
        {/* Arrivals read it driving north (+z side); the back reads leaving. */}
        <group position={[0, 0, 1.05]}>
          <Face map={beam} w={bw} h={bh} glow={0.8} />
        </group>
        <group position={[0, 0, -1.05]} rotation={[0, Math.PI, 0]}>
          <Face map={beam} w={bw} h={bh} glow={0.8} />
        </group>
      </group>
    </group>
  );
}

// ─── Billboard ───────────────────────────────────────────────

/** Wide panel on two legs: logo and town name on both faces. */
export function Billboard({ position, rot, map }: { position: [number, number]; rot: number; map: THREE.Texture }) {
  const { w, h, bottom, legX, leg } = BILLBOARD;
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotToRadians(rot), 0]}>
      {[-legX, legX].map((x) => (
        <mesh key={x} position={[x, (bottom + 1) / 2, 0]}>
          <boxGeometry args={[leg, bottom + 1, leg]} />
          <meshStandardMaterial color={METAL} emissive={METAL} emissiveIntensity={0.25} />
        </mesh>
      ))}
      <mesh position={[0, bottom + h / 2, 0]}>
        <boxGeometry args={[w + 1.6, h + 1.6, 1.4]} />
        <meshStandardMaterial color="#1b1f27" emissive="#1b1f27" emissiveIntensity={0.2} />
      </mesh>
      <group position={[0, bottom + h / 2, -0.75]} rotation={[0, Math.PI, 0]}>
        <Face map={map} w={w} h={h} />
      </group>
      <group position={[0, bottom + h / 2, 0.75]}>
        <Face map={map} w={w} h={h} />
      </group>
      {[-w / 3, w / 3].map((x) => (
        <mesh key={x} position={[x, bottom - 0.4, 1.6]}>
          <boxGeometry args={[1.4, 0.6, 1]} />
          <meshStandardMaterial color="#fff3c4" emissive="#fff3c4" emissiveIntensity={1.5} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Flag ────────────────────────────────────────────────────

const SEG_X = 16;
const SEG_Y = 8;

/** Flag on a pole, the cloth waving on a sine. Both sides read left to right. */
export function Flag({ position, rot, map, phase = 0 }: { position: [number, number]; rot: number; map: THREE.Texture; phase?: number }) {
  const { poleH, pole, clothW: cw, clothH: ch } = FLAG;
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(cw, ch, SEG_X, SEG_Y);
    g.translate(cw / 2, 0, 0);
    return g;
  }, [cw, ch]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  const back = useMemo(() => {
    const t = map.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.x = -1;
    t.needsUpdate = true;
    return t;
  }, [map]);
  useEffect(
    () => () => {
      geo.dispose();
      back.dispose();
    },
    [geo, back],
  );

  const cloth = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const g = cloth.current?.geometry;
    if (!g) return;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime * 3 + phase;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const k = x / cw; // pinned at the pole, freer toward the end
      pos.setZ(i, Math.sin(x * 0.5 - t) * 1.1 * k + Math.sin(y * 0.4 + t * 0.7) * 0.3 * k);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  });

  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotToRadians(rot), 0]}>
      <mesh position={[0, poleH / 2, 0]}>
        <cylinderGeometry args={[pole * 0.7, pole, poleH, 6]} />
        <meshStandardMaterial color="#c9ccd2" emissive="#c9ccd2" emissiveIntensity={0.15} metalness={0.4} />
      </mesh>
      <mesh position={[0, poleH + 0.5, 0]}>
        <sphereGeometry args={[0.7, 6, 4]} />
        <meshStandardMaterial color="#e8c547" emissive="#e8c547" emissiveIntensity={0.4} />
      </mesh>
      <group position={[0.3, poleH - ch / 2 - 0.5, 0]}>
        <mesh ref={cloth} geometry={geo}>
          <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.45} roughness={1} />
        </mesh>
        <mesh geometry={geo}>
          <meshStandardMaterial map={back} emissiveMap={back} emissive="#ffffff" emissiveIntensity={0.45} side={THREE.BackSide} roughness={1} />
        </mesh>
      </group>
    </group>
  );
}

// ─── Plaza floor logo ────────────────────────────────────────

/** The logo laid into a plaza lot's paving, filling the lot. */
export function FloorLogo({ lot, map }: { lot: [number, number]; map: THREE.Texture }) {
  const size = LOT - 6;
  return (
    <mesh position={[lot[0] * LOT, 0.62, lot[1] * LOT]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.25} roughness={0.95} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

// ─── Hill sign ───────────────────────────────────────────────

/**
 * The town name in giant letters on a hill just outside the grid. `at` is the
 * hill's foot on the city edge, `facing` the direction the letters face
 * (toward the city), in radians about y.
 */
export function HillSign({ at, facing, letters, aspect, hillColor }: { at: [number, number]; facing: number; letters: THREE.Texture; aspect: number; hillColor: string }) {
  const letterH = 26;
  const letterW = Math.min(letterH * aspect, 420);
  const hillW = letterW + 120;
  // The hill: a half ellipsoid centered HILL_Z back from its foot. The letters
  // stand on its front slope, bottom edge just above the surface.
  const HILL_Z = -80;
  const HILL_H = 50;
  const HILL_D = 70;
  const lz = -34;
  const surface = HILL_H * Math.sqrt(Math.max(0, 1 - ((lz - HILL_Z) / HILL_D) ** 2)) - 6;
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, facing, 0]}>
      <mesh position={[0, -6, HILL_Z]} scale={[hillW / 2, HILL_H, HILL_D]}>
        <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={hillColor} emissive={hillColor} emissiveIntensity={0.25} roughness={1} flatShading />
      </mesh>
      {/* Letters on the slope, tilted back like the Hollywood sign. */}
      <group position={[0, surface + letterH / 2 - 2, lz]} rotation={[-0.3, 0, 0]}>
        <mesh>
          <planeGeometry args={[letterW, letterH]} />
          <meshStandardMaterial map={letters} emissiveMap={letters} emissive="#ffffff" emissiveIntensity={0.7} transparent alphaTest={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
