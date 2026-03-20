"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { RaidPhase } from "@/lib/useRaidSequence";
import type { RaidExecuteResponse } from "@/lib/raid";
import type { CityBuilding } from "@/lib/github";
import { playRaidSound } from "@/lib/raidAudio";

// ─── Types ────────────────────────────────────────────────────

interface Props {
  phase: RaidPhase;
  attacker: CityBuilding | null;
  defender: CityBuilding | null;
  raidData: RaidExecuteResponse | null;
  onPhaseComplete: (phase: RaidPhase) => void;
}

// ─── Constants ────────────────────────────────────────────────

const ATTACK_DURATION = 6;
const SLOWMO_START = 4.45;
const SLOWMO_END = 5.25;
const SLOWMO_FACTOR = 0.32;
const ORBIT_RADIUS = 55;
const ORBIT_HEIGHT = 30;
const ORBIT_SPEED = 0.8;
const PROJECTILE_COUNT = 15;
const DEBRIS_COUNT = 50;
const SMOKE_COUNT = 40;

// ─── Easing ───────────────────────────────────────────────────

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// ─── Vehicle Components (all face -Z for correct lookAt) ─────

function AirplaneMesh() {
  const propRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (propRef.current) propRef.current.rotation.z += delta * 30;
  });

  return (
    <group>
      {/* Fuselage */}
      <mesh>
        <boxGeometry args={[1.2, 0.9, 5]} />
        <meshStandardMaterial color="#e0e0e0" emissive="#aaa" emissiveIntensity={0.4} />
      </mesh>
      {/* Nose taper */}
      <mesh position={[0, 0, -3]}>
        <boxGeometry args={[0.8, 0.6, 1.2]} />
        <meshStandardMaterial color="#ccc" emissive="#999" emissiveIntensity={0.3} />
      </mesh>
      {/* Nose tip */}
      <mesh position={[0, 0, -3.7]}>
        <boxGeometry args={[0.5, 0.4, 0.5]} />
        <meshStandardMaterial color="#bbb" emissive="#888" emissiveIntensity={0.3} />
      </mesh>
      {/* Cockpit glass */}
      <mesh position={[0, 0.55, -1.2]}>
        <boxGeometry args={[0.7, 0.35, 1]} />
        <meshStandardMaterial color="#3399dd" emissive="#2277bb" emissiveIntensity={0.8} />
      </mesh>
      {/* Main wings */}
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[8, 0.12, 2]} />
        <meshStandardMaterial color="#d8d8d8" emissive="#999" emissiveIntensity={0.3} />
      </mesh>
      {/* Wing tips */}
      <mesh position={[-4.2, 0.15, 0.3]}>
        <boxGeometry args={[0.6, 0.5, 0.8]} />
        <meshStandardMaterial color="#cc4444" emissive="#993333" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[4.2, 0.15, 0.3]}>
        <boxGeometry args={[0.6, 0.5, 0.8]} />
        <meshStandardMaterial color="#cc4444" emissive="#993333" emissiveIntensity={0.5} />
      </mesh>
      {/* Tail vertical stabilizer */}
      <mesh position={[0, 0.9, 2.4]}>
        <boxGeometry args={[0.12, 1.3, 1]} />
        <meshStandardMaterial color="#cc4444" emissive="#993333" emissiveIntensity={0.5} />
      </mesh>
      {/* Tail horizontal stabilizers */}
      <mesh position={[0, 0.35, 2.4]}>
        <boxGeometry args={[3, 0.1, 0.8]} />
        <meshStandardMaterial color="#d8d8d8" emissive="#999" emissiveIntensity={0.3} />
      </mesh>
      {/* Propeller hub */}
      <mesh position={[0, 0, -4]}>
        <boxGeometry args={[0.3, 0.3, 0.2]} />
        <meshStandardMaterial color="#555" emissive="#333" emissiveIntensity={0.3} />
      </mesh>
      {/* Spinning propeller */}
      <group ref={propRef} position={[0, 0, -4.1]}>
        <mesh>
          <boxGeometry args={[3, 0.25, 0.06]} />
          <meshStandardMaterial color="#666" emissive="#555" emissiveIntensity={0.4} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[3, 0.25, 0.06]} />
          <meshStandardMaterial color="#666" emissive="#555" emissiveIntensity={0.4} />
        </mesh>
      </group>
      {/* Engine glow */}
      <pointLight position={[0, 0, 2.8]} color="#ff8844" intensity={3} distance={10} />
    </group>
  );
}

function HelicopterMesh() {
  const rotorRef = useRef<THREE.Group>(null);
  const tailRotorRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (rotorRef.current) rotorRef.current.rotation.y += delta * 20;
    if (tailRotorRef.current) tailRotorRef.current.rotation.z += delta * 25;
  });

  return (
    <group>
      {/* Body */}
      <mesh>
        <boxGeometry args={[1.8, 1.6, 4]} />
        <meshStandardMaterial color="#556677" emissive="#334455" emissiveIntensity={0.5} />
      </mesh>
      {/* Nose */}
      <mesh position={[0, -0.2, -2.3]}>
        <boxGeometry args={[1.4, 1, 1]} />
        <meshStandardMaterial color="#4a5a6a" emissive="#334455" emissiveIntensity={0.5} />
      </mesh>
      {/* Cockpit glass */}
      <mesh position={[0, 0.2, -2.5]}>
        <boxGeometry args={[1.2, 0.6, 0.6]} />
        <meshStandardMaterial color="#44aadd" emissive="#3388bb" emissiveIntensity={0.8} />
      </mesh>
      {/* Tail boom */}
      <mesh position={[0, 0.3, 3]}>
        <boxGeometry args={[0.5, 0.5, 2.5]} />
        <meshStandardMaterial color="#445566" emissive="#334455" emissiveIntensity={0.4} />
      </mesh>
      {/* Tail fin */}
      <mesh position={[0, 0.9, 4]}>
        <boxGeometry args={[0.1, 1, 0.6]} />
        <meshStandardMaterial color="#cc5555" emissive="#993333" emissiveIntensity={0.5} />
      </mesh>
      {/* Skids */}
      <mesh position={[-0.8, -1.2, 0]}>
        <boxGeometry args={[0.15, 0.15, 3.5]} />
        <meshStandardMaterial color="#444" emissive="#222" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.8, -1.2, 0]}>
        <boxGeometry args={[0.15, 0.15, 3.5]} />
        <meshStandardMaterial color="#444" emissive="#222" emissiveIntensity={0.3} />
      </mesh>
      {/* Skid struts */}
      <mesh position={[-0.8, -0.7, -0.8]}>
        <boxGeometry args={[0.12, 1, 0.12]} />
        <meshStandardMaterial color="#444" emissive="#222" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.8, -0.7, -0.8]}>
        <boxGeometry args={[0.12, 1, 0.12]} />
        <meshStandardMaterial color="#444" emissive="#222" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[-0.8, -0.7, 0.8]}>
        <boxGeometry args={[0.12, 1, 0.12]} />
        <meshStandardMaterial color="#444" emissive="#222" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.8, -0.7, 0.8]}>
        <boxGeometry args={[0.12, 1, 0.12]} />
        <meshStandardMaterial color="#444" emissive="#222" emissiveIntensity={0.3} />
      </mesh>
      {/* Rotor mast */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.2, 0.5, 0.2]} />
        <meshStandardMaterial color="#555" emissive="#333" emissiveIntensity={0.3} />
      </mesh>
      {/* Main rotor */}
      <group ref={rotorRef} position={[0, 1.4, 0]}>
        <mesh>
          <boxGeometry args={[7, 0.08, 0.4]} />
          <meshStandardMaterial color="#888" emissive="#666" emissiveIntensity={0.4} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[7, 0.08, 0.4]} />
          <meshStandardMaterial color="#888" emissive="#666" emissiveIntensity={0.4} />
        </mesh>
      </group>
      {/* Tail rotor */}
      <mesh ref={tailRotorRef} position={[0.3, 0.9, 4.1]}>
        <boxGeometry args={[0.06, 1.5, 0.06]} />
        <meshStandardMaterial color="#888" emissive="#666" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function DroneMesh() {
  const rotorsRef = useRef<THREE.Group[]>([]);

  useFrame((_, delta) => {
    rotorsRef.current.forEach((r) => {
      if (r) r.rotation.y += delta * 25;
    });
  });

  return (
    <group>
      {/* Center body */}
      <mesh>
        <boxGeometry args={[1.5, 0.4, 1.5]} />
        <meshStandardMaterial color="#222" emissive="#111" emissiveIntensity={0.5} />
      </mesh>
      {/* Camera eye */}
      <mesh position={[0, -0.25, -0.5]}>
        <boxGeometry args={[0.4, 0.2, 0.4]} />
        <meshStandardMaterial color="#00ccff" emissive="#00aaff" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      {/* Arms + motors + rotors */}
      {([
        [-1.8, 0, -1.8],
        [1.8, 0, -1.8],
        [-1.8, 0, 1.8],
        [1.8, 0, 1.8],
      ] as [number, number, number][]).map((pos, i) => (
        <group key={i}>
          <mesh position={[pos[0] * 0.5, 0, pos[2] * 0.5]}>
            <boxGeometry args={[
              Math.abs(pos[0]) > 0 ? Math.abs(pos[0]) : 0.15,
              0.15,
              Math.abs(pos[2]) > 0 ? 0.15 : Math.abs(pos[2]),
            ]} />
            <meshStandardMaterial color="#333" emissive="#222" emissiveIntensity={0.4} />
          </mesh>
          <mesh position={pos}>
            <boxGeometry args={[0.5, 0.3, 0.5]} />
            <meshStandardMaterial color="#333" emissive="#222" emissiveIntensity={0.4} />
          </mesh>
          <group
            position={[pos[0], 0.2, pos[2]]}
            ref={(el) => { if (el) rotorsRef.current[i] = el; }}
          >
            <mesh>
              <boxGeometry args={[2, 0.05, 0.2]} />
              <meshStandardMaterial color="#00ccff" emissive="#00aadd" emissiveIntensity={1.5} toneMapped={false} />
            </mesh>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[2, 0.05, 0.2]} />
              <meshStandardMaterial color="#00ccff" emissive="#00aadd" emissiveIntensity={1.5} toneMapped={false} />
            </mesh>
          </group>
          <pointLight position={[pos[0], 0.3, pos[2]]} color="#00ccff" intensity={1} distance={5} />
        </group>
      ))}
    </group>
  );
}

function RocketMesh() {
  const flameRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (flameRef.current) {
      const flicker = 0.8 + Math.sin(clock.elapsedTime * 20) * 0.2 + Math.sin(clock.elapsedTime * 33) * 0.15;
      flameRef.current.scale.set(flicker, flicker, 1 + Math.sin(clock.elapsedTime * 15) * 0.3);
    }
  });

  return (
    <group>
      {/* Nose cone */}
      <mesh position={[0, 0, -3]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.7, 1.8, 6]} />
        <meshStandardMaterial color="#cc3333" emissive="#aa2222" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 0, -1.5]}>
        <boxGeometry args={[1.2, 1.2, 1.5]} />
        <meshStandardMaterial color="#dddddd" emissive="#aaa" emissiveIntensity={0.4} />
      </mesh>
      <mesh>
        <boxGeometry args={[1.4, 1.4, 3]} />
        <meshStandardMaterial color="#eeeeee" emissive="#aaa" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.45, 1.45, 0.4]} />
        <meshStandardMaterial color="#cc3333" emissive="#992222" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0, 1.8]}>
        <boxGeometry args={[1.3, 1.3, 0.8]} />
        <meshStandardMaterial color="#888" emissive="#555" emissiveIntensity={0.4} />
      </mesh>
      {/* Fins */}
      {([
        [0, -0.8, 2, 0],
        [0, 0.8, 2, 0],
        [-0.8, 0, 2, Math.PI / 2],
        [0.8, 0, 2, Math.PI / 2],
      ] as [number, number, number, number][]).map(([x, y, z, rot], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, 0, rot]}>
          <boxGeometry args={[0.1, 1.5, 1.2]} />
          <meshStandardMaterial color="#cc3333" emissive="#992222" emissiveIntensity={0.6} />
        </mesh>
      ))}
      {/* Engine flame */}
      <mesh ref={flameRef} position={[0, 0, 2.5]}>
        <boxGeometry args={[0.6, 0.6, 1.2]} />
        <meshStandardMaterial color="#ff6600" emissive="#ff4400" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0, 3]} color="#ff6600" intensity={8} distance={15} />
    </group>
  );
}

export function VehicleMesh({ type }: { type: string }) {
  switch (type) {
    case "raid_helicopter": return <HelicopterMesh />;
    case "raid_drone": return <DroneMesh />;
    case "raid_rocket": return <RocketMesh />;
    default: return <AirplaneMesh />;
  }
}

// ─── Smoke Trail ──────────────────────────────────────────────

function SmokeTrail({ vehicleRef, active }: {
  vehicleRef: React.RefObject<THREE.Group | null>;
  active: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particles = useRef<{
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    age: number;
    maxAge: number;
  }[]>([]);
  const _matrix = useMemo(() => new THREE.Matrix4(), []);
  const _scale = useMemo(() => new THREE.Vector3(), []);
  const _worldPos = useMemo(() => new THREE.Vector3(), []);
  const _backward = useMemo(() => new THREE.Vector3(), []);
  const spawnTimer = useRef(0);

  useEffect(() => {
    if (!active) particles.current = [];
  }, [active]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    if (active && vehicleRef.current) {
      spawnTimer.current += delta;
      if (spawnTimer.current >= 0.03) {
        spawnTimer.current = 0;
        vehicleRef.current.getWorldPosition(_worldPos);
        _backward.set(0, 0, 1).applyQuaternion(vehicleRef.current.quaternion);

        const spawnPos = _worldPos.clone().add(_backward.clone().multiplyScalar(6));

        if (particles.current.length < SMOKE_COUNT) {
          particles.current.push({
            pos: spawnPos,
            vel: new THREE.Vector3(
              (Math.random() - 0.5) * 2,
              Math.random() * 3 + 1,
              (Math.random() - 0.5) * 2,
            ),
            age: 0,
            maxAge: 0.8 + Math.random() * 0.6,
          });
        } else {
          let oldest = 0;
          for (let i = 1; i < particles.current.length; i++) {
            if (particles.current[i].age > particles.current[oldest].age) oldest = i;
          }
          const p = particles.current[oldest];
          p.pos.copy(spawnPos);
          p.vel.set(
            (Math.random() - 0.5) * 2,
            Math.random() * 3 + 1,
            (Math.random() - 0.5) * 2,
          );
          p.age = 0;
          p.maxAge = 0.8 + Math.random() * 0.6;
        }
      }
    }

    for (let i = 0; i < SMOKE_COUNT; i++) {
      const p = particles.current[i];
      if (!p || p.age >= p.maxAge) {
        _matrix.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _matrix);
        continue;
      }

      p.age += delta;
      p.pos.addScaledVector(p.vel, delta);
      p.vel.y += delta * 2;
      p.vel.x += (Math.random() - 0.5) * delta * 4;
      p.vel.z += (Math.random() - 0.5) * delta * 4;

      const life = p.age / p.maxAge;
      const scale = (0.5 + life * 3) * 1.5;

      _matrix.makeTranslation(p.pos.x, p.pos.y, p.pos.z);
      _scale.setScalar(scale);
      _matrix.scale(_scale);
      meshRef.current.setMatrixAt(i, _matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SMOKE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 5, 5]} />
      <meshBasicMaterial color="#888" transparent opacity={0.12} depthWrite={false} />
    </instancedMesh>
  );
}

// ─── Shockwave Ring ──────────────────────────────────────────

function Shockwave({ active, position }: {
  active: boolean;
  position: THREE.Vector3;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useEffect(() => {
    if (active) timeRef.current = 0;
  }, [active]);

  useFrame((_, delta) => {
    if (!active || !meshRef.current) return;
    timeRef.current += delta;
    const t = timeRef.current;

    const scale = t * 60;
    meshRef.current.scale.set(scale, scale, 1);

    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 0.7 * (1 - t * 1.5));
  });

  if (!active) return null;

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.7, 1, 32]} />
      <meshBasicMaterial
        color="#ff6600"
        transparent
        opacity={0.7}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Projectile Pool (fires FROM vehicle) ────────────────────

function ProjectilePool({ active, vehicleRef, targetPos, onImpact }: {
  active: boolean;
  vehicleRef: React.RefObject<THREE.Group | null>;
  targetPos: THREE.Vector3;
  onImpact: () => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);
  const projectiles = useRef<{
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    alive: boolean;
    spawned: boolean;
  }[]>([]);
  const nextSpawnIdx = useRef(0);
  const spawnTimer = useRef(0);
  const impactCount = useRef(0);
  const _matrix = useMemo(() => new THREE.Matrix4(), []);
  const _worldPos = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    projectiles.current = Array.from({ length: PROJECTILE_COUNT }, () => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      alive: false,
      spawned: false,
    }));
    nextSpawnIdx.current = 0;
    spawnTimer.current = -1.8; // 1.8s delay before first projectile
    impactCount.current = 0;
  }, [active]);

  useFrame((_, delta) => {
    if (!active || !meshRef.current) return;
    spawnTimer.current += delta;

    if (nextSpawnIdx.current < PROJECTILE_COUNT && spawnTimer.current >= 0.18) {
      spawnTimer.current = 0;
      const p = projectiles.current[nextSpawnIdx.current];
      if (p && !p.spawned && vehicleRef.current) {
        p.alive = true;
        p.spawned = true;
        vehicleRef.current.getWorldPosition(_worldPos);
        p.pos.copy(_worldPos);

        p.vel
          .copy(targetPos)
          .sub(p.pos)
          .normalize()
          .multiplyScalar(120)
          .add(new THREE.Vector3(
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 15,
          ));
      }
      nextSpawnIdx.current++;
    }

    for (let i = 0; i < projectiles.current.length; i++) {
      const p = projectiles.current[i];
      if (!p.alive) {
        _matrix.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _matrix);
        if (glowRef.current) glowRef.current.setMatrixAt(i, _matrix);
        continue;
      }

      p.vel.y -= 20 * delta;
      p.pos.addScaledVector(p.vel, delta);

      if (p.pos.distanceTo(targetPos) < 10) {
        p.alive = false;
        impactCount.current++;
        if (impactCount.current % 2 === 0) playRaidSound("impact");
        if (impactCount.current >= PROJECTILE_COUNT * 0.8) onImpact();
      }

      if (p.pos.y < 0) p.alive = false;

      _matrix.makeTranslation(p.pos.x, p.pos.y, p.pos.z);
      meshRef.current.setMatrixAt(i, _matrix);
      if (glowRef.current) glowRef.current.setMatrixAt(i, _matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (glowRef.current) glowRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {/* Core — small bright bullet */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, PROJECTILE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.6, 6, 6]} />
        <meshStandardMaterial
          color="#ffaa00"
          emissive="#ff6600"
          emissiveIntensity={8}
          toneMapped={false}
        />
      </instancedMesh>
      {/* Glow halo — larger, transparent, trails behind */}
      <instancedMesh ref={glowRef} args={[undefined, undefined, PROJECTILE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[2, 8, 8]} />
        <meshBasicMaterial
          color="#ff4400"
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

// ─── Debris Particles (enhanced with fire) ───────────────────

function DebrisParticles({ active, origin }: { active: boolean; origin: THREE.Vector3 }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);
  const particles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; alive: boolean; size: number }[]>([]);
  const _matrix = useMemo(() => new THREE.Matrix4(), []);
  const _scale = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (!active) return;
    particles.current = Array.from({ length: DEBRIS_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * 30;
      return {
        pos: origin.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          Math.random() * 5,
          (Math.random() - 0.5) * 6,
        )),
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.random() * 25 + 15,
          Math.sin(angle) * speed,
        ),
        alive: true,
        size: 0.2 + Math.random() * 0.5,
      };
    });
  }, [active, origin]);

  useFrame((_, delta) => {
    if (!active || !meshRef.current) return;

    for (let i = 0; i < particles.current.length; i++) {
      const p = particles.current[i];
      if (!p || !p.alive) {
        _matrix.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _matrix);
        if (glowRef.current) glowRef.current.setMatrixAt(i, _matrix);
        continue;
      }

      p.vel.y -= 35 * delta;
      p.vel.multiplyScalar(0.995);
      p.pos.addScaledVector(p.vel, delta);

      if (p.pos.y < 0) p.alive = false;

      _matrix.makeTranslation(p.pos.x, p.pos.y, p.pos.z);
      _scale.setScalar(p.size);
      _matrix.scale(_scale);
      meshRef.current.setMatrixAt(i, _matrix);
      if (glowRef.current) glowRef.current.setMatrixAt(i, _matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (glowRef.current) glowRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!active) return null;

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, DEBRIS_COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#555" />
      </instancedMesh>
      <instancedMesh ref={glowRef} args={[undefined, undefined, DEBRIS_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.8, 4, 4]} />
        <meshBasicMaterial color="#ff4400" transparent opacity={0.5} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

// ─── Fire Glow (post-explosion light) ────────────────────────

function FireGlow({ active, position }: { active: boolean; position: THREE.Vector3 }) {
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (!active || !lightRef.current) return;
    const flicker = 0.7
      + Math.sin(clock.elapsedTime * 15) * 0.15
      + Math.sin(clock.elapsedTime * 23) * 0.1
      + Math.sin(clock.elapsedTime * 37) * 0.05;
    lightRef.current.intensity = 30 * flicker;
  });

  if (!active) return null;

  return (
    <pointLight
      ref={lightRef}
      position={[position.x, position.y + 5, position.z]}
      color="#ff4400"
      intensity={30}
      distance={80}
      decay={2}
    />
  );
}

// ─── Shield Dome ──────────────────────────────────────────────

function ShieldDome({ active, position, size, strength, hitIntensity }: {
  active: boolean;
  position: THREE.Vector3;
  size: number;
  strength: "weak" | "medium" | "strong";
  hitIntensity: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!active || !meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    const basePulse = Math.sin(clock.elapsedTime * 4) * 0.05;
    const hitPulse = hitIntensity * 0.3;
    const baseOpacity = strength === "strong" ? 0.15 : strength === "medium" ? 0.1 : 0.05;
    mat.opacity = baseOpacity + basePulse + hitPulse;

    if (wireRef.current) {
      const wireMat = wireRef.current.material as THREE.MeshBasicMaterial;
      wireMat.opacity = (strength === "strong" ? 0.35 : strength === "medium" ? 0.2 : 0.1) + hitPulse * 0.5;
    }
  });

  if (!active) return null;

  const radius = size * 0.8;
  const color = strength === "strong" ? "#4080ff" : strength === "medium" ? "#40a0ff" : "#6060ff";

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 20, 20]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={wireRef}>
        <sphereGeometry args={[radius * 1.01, 20, 20]} />
        <meshBasicMaterial color="#00ccff" wireframe transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function RaidSequence3D({ phase, attacker, defender, raidData, onPhaseComplete }: Props) {
  const { camera } = useThree();
  const vehicleRef = useRef<THREE.Group>(null);
  const phaseTimeRef = useRef(0);
  const prevPhaseRef = useRef<RaidPhase>("idle");

  // Camera shake state (sine-based)
  const shakeRef = useRef({ intensity: 0, elapsed: 0 });

  const flightProgress = useRef(0);
  const soundPlayed = useRef(false);
  const climaxTriggered = useRef(false);
  const projectilesActive = useRef(false);
  const debrisActive = useRef(false);
  const shockwaveActive = useRef(false);
  const hitIntensityRef = useRef(0);
  const cameraSnapped = useRef(false);

  // Force re-render when refs that gate JSX visibility change
  const [, forceRender] = useState(0);

  // ── Positions ──

  const attackerPos = useMemo(() => {
    if (!attacker) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(attacker.position[0], attacker.height + 10, attacker.position[2]);
  }, [attacker]);

  const defenderTopPos = useMemo(() => {
    if (!defender) return new THREE.Vector3(100, 80, 0);
    return new THREE.Vector3(defender.position[0], defender.height + 5, defender.position[2]);
  }, [defender]);

  // Orbit entry: arrive from the attacker's direction
  const orbitStartAngle = useMemo(() => {
    return Math.atan2(
      attackerPos.z - defenderTopPos.z,
      attackerPos.x - defenderTopPos.x,
    );
  }, [attackerPos, defenderTopPos]);

  const orbitEntryPos = useMemo(() => {
    return new THREE.Vector3(
      defenderTopPos.x + Math.cos(orbitStartAngle) * ORBIT_RADIUS,
      defenderTopPos.y + ORBIT_HEIGHT,
      defenderTopPos.z + Math.sin(orbitStartAngle) * ORBIT_RADIUS,
    );
  }, [defenderTopPos, orbitStartAngle]);

  // Direction from attacker toward defender (horizontal)
  const flightDir = useMemo(() => {
    return new THREE.Vector3(
      defenderTopPos.x - attackerPos.x,
      0,
      defenderTopPos.z - attackerPos.z,
    ).normalize();
  }, [attackerPos, defenderTopPos]);

  // Where the intro liftoff ends (must match intro phase final position)
  const liftEndPos = useMemo(() => {
    const rooftopY = attackerPos.y - 10;
    return new THREE.Vector3(
      attackerPos.x + flightDir.x * 8,
      rooftopY + 8,
      attackerPos.z + flightDir.z * 8,
    );
  }, [attackerPos, flightDir]);

  // Flight path: starts where intro ends, high cruise, descend to orbit entry
  const flightCurve = useMemo(() => {
    const cruiseHeight = Math.max(liftEndPos.y, orbitEntryPos.y) + 80;
    const mid = new THREE.Vector3().lerpVectors(liftEndPos, orbitEntryPos, 0.5);
    mid.y = cruiseHeight;

    // Depart forward + up (not straight up)
    const depart = liftEndPos.clone()
      .add(flightDir.clone().multiplyScalar(35))
      .setY(liftEndPos.y + 25);

    // Approach from behind orbit entry, slightly above
    const approach = orbitEntryPos.clone()
      .add(flightDir.clone().multiplyScalar(-25))
      .setY(orbitEntryPos.y + 15);

    return new THREE.CatmullRomCurve3([
      liftEndPos.clone(),
      depart,
      mid,
      approach,
      orbitEntryPos.clone(),
    ]);
  }, [liftEndPos, orbitEntryPos, flightDir]);

  // Defense strength
  const defenseStrength = useMemo((): "weak" | "medium" | "strong" => {
    if (!raidData) return "medium";
    const ds = raidData.defense_score;
    if (ds <= 15) return "weak";
    if (ds <= 40) return "medium";
    return "strong";
  }, [raidData]);

  // Phase change reset
  useEffect(() => {
    if (phase !== prevPhaseRef.current) {
      phaseTimeRef.current = 0;
      prevPhaseRef.current = phase;
      flightProgress.current = 0;
      soundPlayed.current = false;
      climaxTriggered.current = false;
      projectilesActive.current = false;
      hitIntensityRef.current = 0;
      cameraSnapped.current = false;

      // Keep explosion effects alive through outro phases
      if (phase !== "outro_win" && phase !== "outro_lose") {
        debrisActive.current = false;
        shockwaveActive.current = false;
      }
    }
  }, [phase]);

  const triggerShake = (intensity: number) => {
    shakeRef.current.intensity = Math.max(shakeRef.current.intensity, intensity);
    shakeRef.current.elapsed = 0;
  };

  // Reusable vectors (avoid GC)
  const _camTarget = useMemo(() => new THREE.Vector3(), []);
  const _tempVec = useMemo(() => new THREE.Vector3(), []);
  const _vehicleTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    phaseTimeRef.current += delta;
    const t = phaseTimeRef.current;

    // ── Camera Shake: sine oscillation with exponential decay ──
    const s = shakeRef.current;
    if (s.intensity > 0.01) {
      s.elapsed += delta;
      const decay = Math.exp(-s.elapsed * 5);
      camera.position.x += Math.sin(s.elapsed * 25) * s.intensity * decay;
      camera.position.y += Math.cos(s.elapsed * 30) * s.intensity * 0.6 * decay;
      camera.rotation.z += Math.sin(s.elapsed * 20) * s.intensity * 0.012 * decay;

      if (decay < 0.01) s.intensity = 0;
    }

    // ── Decay hit intensity ──
    if (hitIntensityRef.current > 0) {
      hitIntensityRef.current *= 0.92;
      if (hitIntensityRef.current < 0.01) hitIntensityRef.current = 0;
    }

    switch (phase) {
      // ───────── INTRO: camera focuses, vehicle parked, then lifts off ─────────
      case "intro": {
        const rooftopY = attackerPos.y - 10; // attackerPos is height+10, rooftop is height

        // Phase 1 (0-2.5s): camera dolly in, vehicle parked on rooftop
        // Phase 2 (2.5-4.5s): vehicle lifts off
        const camProgress = Math.min(t / 2.5, 1);
        const camEase = smoothstep(camProgress);

        // Camera: start behind attacker, dolly in
        const camBehindX = -flightDir.x;
        const camBehindZ = -flightDir.z;
        const camStartDist = 90 - camEase * 45;
        const camStartY = attackerPos.y + 50 - camEase * 25;

        _camTarget.set(
          attackerPos.x + camBehindX * camStartDist,
          camStartY,
          attackerPos.z + camBehindZ * camStartDist,
        );

        // First frame: snap camera instantly (don't lerp from orbit controls position)
        if (!cameraSnapped.current) {
          cameraSnapped.current = true;
          camera.position.copy(_camTarget);
        } else {
          camera.position.lerp(_camTarget, 0.06);
        }
        camera.lookAt(attackerPos);

        // Vehicle: parked above rooftop until 2.5s, then gently lifts off forward
        if (vehicleRef.current) {
          const liftProgress = Math.max(0, Math.min((t - 2.5) / 2, 1));
          const liftEase = smoothstep(liftProgress);

          const startY = rooftopY + 6; // above rooftop, clear of items
          vehicleRef.current.position.set(
            attackerPos.x + flightDir.x * liftEase * 8,
            startY + liftEase * 8,
            attackerPos.z + flightDir.z * liftEase * 8,
          );

          // Face toward defender
          _vehicleTarget.set(
            defenderTopPos.x,
            rooftopY + liftEase * 10,
            defenderTopPos.z,
          );
          vehicleRef.current.lookAt(_vehicleTarget);
          vehicleRef.current.rotateY(Math.PI); // nose is -Z
          vehicleRef.current.rotateX(liftProgress * 0.08); // slight nose-up tilt
          vehicleRef.current.scale.setScalar(2);
        }

        if (t >= 4.5) onPhaseComplete("intro");
        break;
      }

      // ───────── FLIGHT: follow spline, trailing camera ─────────
      case "flight": {
        flightProgress.current = Math.min(flightProgress.current + delta * 0.16, 1);
        const fp = flightProgress.current;
        const eased = smoothstep(fp);

        const point = flightCurve.getPoint(eased);
        const lookAhead = flightCurve.getPoint(Math.min(eased + 0.05, 0.99));
        const tangent = flightCurve.getTangent(eased).normalize();

        if (vehicleRef.current) {
          vehicleRef.current.position.copy(point);
          vehicleRef.current.lookAt(lookAhead);
          vehicleRef.current.rotateY(Math.PI); // flip: lookAt makes +Z face target, but nose is -Z
          vehicleRef.current.scale.setScalar(2);

          // Banking: gentle lean during middle of flight (sign flipped due to rotateY)
          const bankAmount = Math.sin(fp * Math.PI) * -0.12;
          vehicleRef.current.rotateZ(bankAmount);
        }

        // Camera: behind-and-side, always above vehicle for clear view
        // Use horizontal tangent only (ignore vertical component for camera trail)
        const hTangentLen = Math.sqrt(tangent.x * tangent.x + tangent.z * tangent.z) || 1;
        const hTanX = tangent.x / hTangentLen;
        const hTanZ = tangent.z / hTangentLen;
        const perpX = -hTanZ;
        const perpZ = hTanX;

        const trailDist = 50 + (1 - fp) * 20;
        const trailHeight = 20 + Math.sin(fp * Math.PI) * 15;
        const sideDist = 20 + Math.sin(fp * Math.PI) * 10;

        _camTarget.set(
          point.x - hTanX * trailDist + perpX * sideDist,
          point.y + trailHeight,
          point.z - hTanZ * trailDist + perpZ * sideDist,
        );
        camera.position.lerp(_camTarget, 0.1);

        // Look slightly ahead of the vehicle
        _tempVec.lerpVectors(point, lookAhead, 0.5);
        camera.lookAt(_tempVec);

        if (fp >= 1.0) onPhaseComplete("flight");
        break;
      }

      // ───────── ATTACK: orbiting gun run ─────────
      case "attack": {
        const topX = defenderTopPos.x;
        const topY = defenderTopPos.y;
        const topZ = defenderTopPos.z;

        // Slow-mo finisher window around the climax for successful raids
        const shouldSlowMo = !!raidData?.success && t >= SLOWMO_START;
        const slowMoTime = shouldSlowMo
          ? t <= SLOWMO_END
            ? SLOWMO_START + (t - SLOWMO_START) * SLOWMO_FACTOR
            : SLOWMO_START + (SLOWMO_END - SLOWMO_START) * SLOWMO_FACTOR + (t - SLOWMO_END)
          : t;
        const slowMoBlend = shouldSlowMo && t <= SLOWMO_END
          ? Math.min(1, (t - SLOWMO_START) / (SLOWMO_END - SLOWMO_START))
          : 0;

        // Vehicle position on orbit circle
        const orbitAngle = orbitStartAngle - slowMoTime * ORBIT_SPEED;
        const vehicleX = topX + Math.cos(orbitAngle) * ORBIT_RADIUS;
        const vehicleZ = topZ + Math.sin(orbitAngle) * ORBIT_RADIUS;
        const vehicleY = topY + ORBIT_HEIGHT + Math.sin(slowMoTime * 2) * 3;

        // Orbit tangent (direction of travel for counter-clockwise)
        const tangentX = Math.sin(orbitAngle);
        const tangentZ = -Math.cos(orbitAngle);

        if (vehicleRef.current) {
          vehicleRef.current.position.set(vehicleX, vehicleY, vehicleZ);
          vehicleRef.current.scale.setScalar(2);

          // Look along orbit tangent (direction of travel)
          _vehicleTarget.set(
            vehicleX + tangentX * 30,
            vehicleY - 2,
            vehicleZ + tangentZ * 30,
          );
          vehicleRef.current.lookAt(_vehicleTarget);
          vehicleRef.current.rotateY(Math.PI); // flip: nose faces travel direction

          // Bank into the turn (sign flipped due to rotateY)
          vehicleRef.current.rotateZ(0.25);
        }

        // ── Smooth continuous camera (no discrete act jumps) ──
        const ap = slowMoTime / ATTACK_DURATION; // 0 → 1

        // Camera orbit: offset behind vehicle, slowly sweeping
        const camOrbitOffset = Math.PI * 0.5;
        const camAngle = orbitAngle + camOrbitOffset + ap * Math.PI * 0.25;

        // Camera distance: wide enough to see over neighboring buildings
        const camDist = THREE.MathUtils.lerp(ORBIT_RADIUS * 1.5, ORBIT_RADIUS * 0.95, slowMoBlend);

        // Camera height: above building top to clear skyline, cinematic angle ~20-25°
        const camY = topY + 30 + ap * 10 - slowMoBlend * 8;

        _camTarget.set(
          topX + Math.cos(camAngle) * camDist,
          camY,
          topZ + Math.sin(camAngle) * camDist,
        );
        camera.position.lerp(_camTarget, 0.06);

        // LookAt: always toward defender building (slight vehicle blend early on)
        const vehicleBlend = Math.max(0, 0.25 - ap * 0.4);
        _tempVec.set(
          vehicleX * vehicleBlend + topX * (1 - vehicleBlend),
          vehicleY * vehicleBlend + topY * (1 - vehicleBlend),
          vehicleZ * vehicleBlend + topZ * (1 - vehicleBlend),
        );
        camera.lookAt(_tempVec);

        // ── Event triggers (don't affect camera smoothness) ──

        // Sound at 1s
        if (t >= 1.0 && !soundPlayed.current) {
          soundPlayed.current = true;
          playRaidSound("shoot");
        }

        // Progressive shake during strafing (2s+)
        if (t >= 2.0 && t < 4.5) {
          const strafeProgress = (t - 2.0) / 2.5;
          triggerShake((0.15 + strafeProgress * 0.4) * delta * 8);
        }

        // Climax at 4.5s
        if (t >= 4.5 && !climaxTriggered.current) {
          climaxTriggered.current = true;
          if (raidData?.success) {
            triggerShake(4.0);
            playRaidSound("explosion");
            debrisActive.current = true;
            shockwaveActive.current = true;
          } else {
            triggerShake(1.5);
            playRaidSound("shield_hit");
            hitIntensityRef.current = 1;
          }
          forceRender(n => n + 1);
        }

        // Vehicle rises after climax
        if (climaxTriggered.current && vehicleRef.current) {
          if (raidData?.success) {
            vehicleRef.current.position.y += delta * 15;
          } else {
            vehicleRef.current.rotation.z += Math.sin(t * 12) * delta * 2;
            vehicleRef.current.position.y += delta * 5;
          }
        }

        if (t >= ATTACK_DURATION) onPhaseComplete("attack");
        break;
      }

      // ───────── OUTRO WIN: dramatic crane shot ─────────
      case "outro_win": {
        const progress = Math.min(t / 3.5, 1);
        const ease = easeOutCubic(progress);
        const riseY = defenderTopPos.y + 15 + ease * 35;
        const slowAngle = t * 0.15;
        const dist = ORBIT_RADIUS * 1.6;

        _camTarget.set(
          defenderTopPos.x + Math.cos(slowAngle) * dist,
          riseY,
          defenderTopPos.z + Math.sin(slowAngle) * dist,
        );
        camera.position.lerp(_camTarget, 0.07);
        camera.lookAt(defenderTopPos);

        // Vehicle circles in victory
        if (vehicleRef.current) {
          const victoryAngle = orbitStartAngle - (phaseTimeRef.current + ATTACK_DURATION) * ORBIT_SPEED * 0.3;
          const victoryDist = ORBIT_RADIUS * 1.5;
          vehicleRef.current.position.set(
            defenderTopPos.x + Math.cos(victoryAngle) * victoryDist,
            defenderTopPos.y + ORBIT_HEIGHT + 20 + t * 5,
            defenderTopPos.z + Math.sin(victoryAngle) * victoryDist,
          );

          const vTangentX = Math.sin(victoryAngle);
          const vTangentZ = -Math.cos(victoryAngle);
          _vehicleTarget.set(
            vehicleRef.current.position.x + vTangentX * 30,
            vehicleRef.current.position.y,
            vehicleRef.current.position.z + vTangentZ * 30,
          );
          vehicleRef.current.lookAt(_vehicleTarget);
          vehicleRef.current.rotateY(Math.PI);
          vehicleRef.current.rotateZ(0.15);
        }
        break;
      }

      // ───────── OUTRO LOSE: vehicle retreats ─────────
      case "outro_lose": {
        const progress = Math.min(t / 3, 1);

        if (vehicleRef.current) {
          // Fly away back towards attacker direction
          _tempVec.set(
            attackerPos.x - defenderTopPos.x,
            0,
            attackerPos.z - defenderTopPos.z,
          ).normalize();

          vehicleRef.current.position.addScaledVector(_tempVec, delta * 40);
          vehicleRef.current.position.y += delta * 8;

          // Damaged wobble
          vehicleRef.current.rotation.z = Math.sin(t * 8) * 0.3 * (1 - progress);

          // Face retreat direction
          _vehicleTarget.copy(vehicleRef.current.position).addScaledVector(_tempVec, 20);
          _vehicleTarget.y = vehicleRef.current.position.y;
          vehicleRef.current.lookAt(_vehicleTarget);
          vehicleRef.current.rotateY(Math.PI);

          const scale = Math.max(0.01, 2 * (1 - progress * 0.5));
          vehicleRef.current.scale.setScalar(scale);

          if (progress < 0.6) {
            camera.lookAt(vehicleRef.current.position);
          }
        }

        // Gentle rise + pull back for cinematic reveal
        const loseAngle = t * 0.12;
        const loseDist = ORBIT_RADIUS * 1.4;
        const loseY = defenderTopPos.y + 20 + progress * 25;
        _camTarget.set(
          defenderTopPos.x + Math.cos(loseAngle) * loseDist,
          loseY,
          defenderTopPos.z + Math.sin(loseAngle) * loseDist,
        );
        camera.position.lerp(_camTarget, 0.05);

        if (progress > 0.6) {
          camera.lookAt(defenderTopPos);
        }
        break;
      }

      default:
        break;
    }
  });

  if (phase === "idle" || phase === "preview" || phase === "done") return null;

  const vehicleType = raidData?.vehicle ?? "airplane";
  const isAttack = phase === "attack";
  const isOutro = phase === "outro_win" || phase === "outro_lose";
  const showSmoke = phase === "flight" || isAttack;

  return (
    <group>
      {/* Vehicle */}
      <group ref={vehicleRef} position={[attackerPos.x, attackerPos.y - 4, attackerPos.z]} scale={2}>
        <VehicleMesh type={vehicleType} />
      </group>

      {/* Smoke Trail */}
      <SmokeTrail vehicleRef={vehicleRef} active={showSmoke} />

      {/* Red targeting light on defender */}
      {(phase === "flight" || phase === "attack") && (
        <group position={[defenderTopPos.x, defenderTopPos.y + 30, defenderTopPos.z]}>
          <pointLight color="#ff2020" intensity={8} distance={60} />
        </group>
      )}

      {/* Projectiles from vehicle */}
      <ProjectilePool
        active={isAttack}
        vehicleRef={vehicleRef}
        targetPos={defenderTopPos}
        onImpact={() => {
          triggerShake(0.8);
          hitIntensityRef.current = 0.5;
        }}
      />

      {/* Shield dome */}
      <ShieldDome
        active={isAttack && defenseStrength !== "weak"}
        position={defenderTopPos}
        size={Math.max(defender?.width ?? 10, defender?.depth ?? 10)}
        strength={defenseStrength}
        hitIntensity={hitIntensityRef.current}
      />

      {/* Shockwave ring */}
      <Shockwave active={(isAttack || isOutro) && !!raidData?.success && climaxTriggered.current} position={defenderTopPos} />

      {/* Debris */}
      <DebrisParticles active={(isAttack || isOutro) && !!raidData?.success && climaxTriggered.current} origin={defenderTopPos} />

      {/* Fire glow */}
      <FireGlow active={(isAttack || isOutro) && !!raidData?.success && climaxTriggered.current} position={defenderTopPos} />
    </group>
  );
}
