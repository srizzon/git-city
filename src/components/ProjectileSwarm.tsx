"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ActiveProjectile, RemotePilot, SelfPvpState } from "@/lib/useFlyPresence";

// Near-hitscan speed: 1200 u/s. Vehicle tops out around ~250 u/s so the
// tracer clearly overtakes the player. Lifespan trimmed so total range
// stays ~960u (more than enough across city blocks).
const PROJECTILE_SPEED = 1200;
const PROJECTILE_LIFE_MS = 800;
const HIT_RADIUS = 18;
const MUZZLE_FLASH_MS = 120;
const HIT_THROTTLE_MS = 200;
const DEBUG_HITS = true; // TEMP: log to console while debugging hit registration

interface Props {
  projectilesRef: React.MutableRefObject<Map<string, ActiveProjectile>>;
  pilotsRef: React.MutableRefObject<Map<string, RemotePilot>>;
  selfStateRef: React.MutableRefObject<SelfPvpState>;
  selfId: string | null;
  reportHit: (targetId: string) => void;
}

export default function ProjectileSwarm({ projectilesRef, pilotsRef, selfStateRef, selfId, reportHit }: Props) {
  const MAX_PROJECTILES = 64;
  const MAX_FLASHES = 32;
  const coreRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);
  const flashRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const quatRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const forwardRef = useRef<THREE.Vector3>(new THREE.Vector3());
  // Geometry is built along +Z so we map +Z onto the velocity direction.
  const baseAxisRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 1));
  const recentHits = useRef<Map<string, number>>(new Map());

  useFrame((state, delta) => {
    if (!coreRef.current || !glowRef.current || !flashRef.current) return;
    const dummy = dummyRef.current;
    const q = quatRef.current;
    const fwd = forwardRef.current;
    const baseAxis = baseAxisRef.current;
    const now = Date.now();
    const t = state.clock.elapsedTime;
    let coreIdx = 0;
    let flashIdx = 0;

    for (const [pid, p] of projectilesRef.current) {
      const age = now - p.bornAt;
      if (age > PROJECTILE_LIFE_MS) {
        projectilesRef.current.delete(pid);
        continue;
      }

      const nextX = p.x + p.dirX * PROJECTILE_SPEED * delta;
      const nextY = p.y + p.dirY * PROJECTILE_SPEED * delta;
      const nextZ = p.z + p.dirZ * PROJECTILE_SPEED * delta;
      const updated: ActiveProjectile = { ...p, x: nextX, y: nextY, z: nextZ };
      projectilesRef.current.set(pid, updated);

      // ─── Core voxel + outer halo (oriented along velocity) ─────
      if (coreIdx < MAX_PROJECTILES) {
        fwd.set(p.dirX, p.dirY, p.dirZ).normalize();
        q.setFromUnitVectors(baseAxis, fwd);

        // The "data packet" reads as a small, stretched green block
        // streaking through the city — Matrix-rain rain drop, basically.
        // Length shrinks over time so old tails fade naturally.
        const ageFrac = age / PROJECTILE_LIFE_MS;
        const len = 1 - ageFrac * 0.7;
        // Pulse the core so it shimmers like data being transmitted
        const pulse = 0.85 + Math.sin(t * 28 + p.bornAt * 0.01) * 0.15;

        dummy.position.set(nextX, nextY, nextZ);
        dummy.quaternion.copy(q);
        dummy.scale.set(0.9 * pulse, 0.9 * pulse, len);
        dummy.updateMatrix();
        coreRef.current.setMatrixAt(coreIdx, dummy.matrix);

        // Outer additive halo: wider and slightly longer
        dummy.scale.set(2.4 * pulse, 2.4 * pulse, len * 1.1);
        dummy.updateMatrix();
        glowRef.current.setMatrixAt(coreIdx, dummy.matrix);

        coreIdx++;
      }

      // ─── Muzzle flash (first 120ms after spawn) ─────────────
      if (age < MUZZLE_FLASH_MS && flashIdx < MAX_FLASHES) {
        const flashFrac = age / MUZZLE_FLASH_MS;
        const flashScale = (1 - flashFrac) * 5;
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(flashScale);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        flashRef.current.setMatrixAt(flashIdx, dummy.matrix);
        flashIdx++;
      }

      // ─── Local swept hit detection (shooter authority) ────
      // At 1200 u/s the projectile advances ~19u per 60fps frame, which
      // is wider than HIT_RADIUS. A point-only check at nextX/Y/Z would
      // skip over targets sitting between p.{x,y,z} and next{X,Y,Z}.
      // Instead, project each target onto the segment p→next and use
      // the closest point on that segment for the distance check.
      if (selfId && p.shooterId === selfId) {
        const segDx = nextX - p.x;
        const segDy = nextY - p.y;
        const segDz = nextZ - p.z;
        const segLenSq = segDx * segDx + segDy * segDy + segDz * segDz;
        const safeSegLenSq = segLenSq > 0.0001 ? segLenSq : 1;

        for (const [targetId, target] of pilotsRef.current) {
          if (!target.pvpEnabled) continue;
          if (target.hp <= 0) continue;
          if (target.invulnUntil > now) continue;

          // Project the target onto the segment, clamp t in [0,1]
          const tdx = target.x - p.x;
          const tdy = target.y - p.y;
          const tdz = target.z - p.z;
          let t = (tdx * segDx + tdy * segDy + tdz * segDz) / safeSegLenSq;
          if (t < 0) t = 0;
          if (t > 1) t = 1;

          const cpx = p.x + segDx * t;
          const cpy = p.y + segDy * t;
          const cpz = p.z + segDz * t;

          const ddx = target.x - cpx;
          const ddy = target.y - cpy;
          const ddz = target.z - cpz;
          const distSq = ddx * ddx + ddy * ddy + ddz * ddz;

          if (distSq < HIT_RADIUS * HIT_RADIUS) {
            const lastReport = recentHits.current.get(targetId) ?? 0;
            if (now - lastReport > HIT_THROTTLE_MS) {
              recentHits.current.set(targetId, now);
              reportHit(targetId);
              selfStateRef.current.lastHitConfirmedAt = now;
              if (DEBUG_HITS) {
                console.log(
                  `[FORCE PUSH] HIT confirmed → target=${targetId.slice(0, 8)} dist=${Math.sqrt(distSq).toFixed(1)}u target=(${target.x.toFixed(0)},${target.z.toFixed(0)}) shooter=(${p.x.toFixed(0)},${p.z.toFixed(0)})`,
                );
              }
              projectilesRef.current.delete(pid);
              break;
            }
          }
        }
      }
    }

    // Hide unused core/glow instances
    for (let i = coreIdx; i < MAX_PROJECTILES; i++) {
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      coreRef.current.setMatrixAt(i, dummy.matrix);
      glowRef.current.setMatrixAt(i, dummy.matrix);
    }
    for (let i = flashIdx; i < MAX_FLASHES; i++) {
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      flashRef.current.setMatrixAt(i, dummy.matrix);
    }

    coreRef.current.instanceMatrix.needsUpdate = true;
    glowRef.current.instanceMatrix.needsUpdate = true;
    flashRef.current.instanceMatrix.needsUpdate = true;

    if (now % 5_000 < 100) {
      for (const [tid, t2] of recentHits.current) {
        if (now - t2 > 5_000) recentHits.current.delete(tid);
      }
    }
  });

  return (
    <>
      {/* Core voxel packet — Matrix-green block, stretched along velocity */}
      <instancedMesh ref={coreRef} args={[undefined, undefined, MAX_PROJECTILES]} frustumCulled={false}>
        <boxGeometry args={[1.4, 1.4, 6]} />
        <meshBasicMaterial color="#ccffdd" toneMapped={false} />
      </instancedMesh>
      {/* Soft additive halo — Matrix green */}
      <instancedMesh ref={glowRef} args={[undefined, undefined, MAX_PROJECTILES]} frustumCulled={false}>
        <boxGeometry args={[1.4, 1.4, 6]} />
        <meshBasicMaterial color="#00ff66" transparent opacity={0.45} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
      {/* Muzzle flash burst */}
      <instancedMesh ref={flashRef} args={[undefined, undefined, MAX_FLASHES]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color="#ccffdd" transparent opacity={0.9} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
    </>
  );
}
