"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import BossPreview, { type BossVariant } from "./BossPreview";
import BossMinions from "./BossMinions";
import { bossEventStore, computePhase } from "@/lib/bossEventStore";
import type { ActiveProjectile } from "@/lib/useFlyPresence";
import type { BossTuning } from "@/lib/events/schema";

// ─── Boss Event ────────────────────────────────────────────────
//
// Client-side experience POC. Mounts boss + minions + attack VFX.
// Handles:
//   • boss orbital motion (phase-driven)
//   • combat tells (lean forward / recoil on attack)
//   • projectile → boss hit detection
//   • attack scheduler with 2 types (laser, shockwave)
//   • laser TRACKS player position at telegraph snapshot
//   • shockwave radiates from boss outward
//   • player damage feedback when attack lands
//   • boss death VFX + golden city-wide pulse
//
// Player position is approximated from camera position (camera follows
// the plane in fly mode). Hit checks happen on the local client only.

const BOSS_BASE = new THREE.Vector3(0, 800, 0);
const ORBIT_RADIUS = 300;
const BOSS_HIT_RADIUS = 130;
const DAMAGE_PER_HIT = 30;
const MINION_KILL_BONUS = 50;

const TELEGRAPH_MS = 1500;
const DEATH_DURATION_MS = 2500;
const LASER_FX_MS = 350;
const SHOCKWAVE_FX_MS = 900;

// Laser hit radius on the ground (XZ distance from telegraph center)
const LASER_HIT_RADIUS = 120;
// Shockwave hit "shell" — player within R±W at fires_at time gets hit
const SHOCKWAVE_PEAK_RADIUS = 900;
const SHOCKWAVE_SHELL_WIDTH = 140;

const PROJECTILE_SPEED = 1200;
const PROJECTILE_LIFE_S = 0.8;

// Phase-driven orbit speed (radians/sec)
const ORBIT_SPEED: Record<1 | 2 | 3 | 4, number> = {
  1: 0.04, // gentle drift
  2: 0.09,
  3: 0.16,
  4: 0.28, // chaotic
};

// Phase-driven attack interval (ms)
const ATTACK_INTERVAL: Record<1 | 2 | 3 | 4, number> = {
  1: 7500,
  2: 6000,
  3: 4500,
  4: 3000,
};

interface Props {
  variant: BossVariant;
  projectilesRef?: React.MutableRefObject<Map<string, ActiveProjectile>> | null;
  // Server-authoritative mode (real live event). When set, boss HP comes
  // from PartyKit (bossStateRef) and hits are sent to the server rather than
  // simulated locally. When absent, runs the standalone local POC simulation.
  serverAuthoritative?: boolean;
  maxHp?: number;
  bossStateRef?: React.MutableRefObject<import("@/lib/useFlyPresence").BossLiveState>;
  engageBoss?: (maxHp: number) => void;
  sendBossHit?: (kind: "boss" | "minion") => void;
  sendBossSelfHit?: () => void;
  // Combat balance, config-driven from event_instances.boss_config. Each field
  // falls back to the literal defaults below — tunable live, no deploy.
  tuning?: BossTuning;
}

export default function BossEvent({
  variant,
  projectilesRef,
  serverAuthoritative = false,
  maxHp,
  bossStateRef,
  engageBoss,
  sendBossHit,
  sendBossSelfHit,
  tuning,
}: Props) {
  const { camera } = useThree();
  const engagedRef = useRef(false);

  // Effective combat tuning, kept in a ref so the useFrame loop reads fresh
  // values. Defaults = the module constants (DAMAGE_PER_HIT, ORBIT_SPEED, …).
  const tuneRef = useRef({
    damagePerHit: DAMAGE_PER_HIT,
    minionKillBonus: MINION_KILL_BONUS,
    telegraphMs: TELEGRAPH_MS,
    orbitSpeed: ORBIT_SPEED,
    attackInterval: ATTACK_INTERVAL,
  });
  tuneRef.current = {
    damagePerHit: tuning?.damage_per_hit ?? DAMAGE_PER_HIT,
    minionKillBonus: tuning?.minion_kill_bonus ?? MINION_KILL_BONUS,
    telegraphMs: tuning?.telegraph_ms ?? TELEGRAPH_MS,
    orbitSpeed: tuning?.orbit_speed ?? ORBIT_SPEED,
    attackInterval: tuning?.attack_interval ?? ATTACK_INTERVAL,
  };

  const consumed = useRef<Set<string>>(new Set());
  const lastAttackScheduledAt = useRef<number>(Date.now());
  const attackIdCounter = useRef<number>(0);
  const lastAttackType = useRef<"laser" | "shockwave">("shockwave"); // so first is laser

  const bossWrapperRef = useRef<THREE.Group>(null);
  const bossWorldPos = useRef(new THREE.Vector3().copy(BOSS_BASE));
  const targetLeanRef = useRef(0); // smoothed forward lean (combat tells)

  const telegraphRef = useRef<THREE.Mesh>(null);
  const shockwaveTelegraphRef = useRef<THREE.Mesh>(null);
  const laserBeamRef = useRef<THREE.Mesh>(null);
  const laserImpactRef = useRef<THREE.Mesh>(null);
  const shockwaveFxRef = useRef<THREE.Mesh>(null);
  const explosionRef = useRef<THREE.Group>(null);
  const goldPulseRef = useRef<THREE.Mesh>(null);

  const lastAttackPos = useRef({ x: 0, z: 0 });
  const lastAttackFiredAt = useRef<number>(0);
  const lastFiredType = useRef<"laser" | "shockwave">("laser");
  const deathStartedAt = useRef<number>(0);

  useEffect(() => {
    bossEventStore.reset();
    consumed.current.clear();
    lastAttackScheduledAt.current = Date.now();
    deathStartedAt.current = 0;
    targetLeanRef.current = 0;
    engagedRef.current = false;
    // In server-authoritative mode, seed HP from the event config and ask
    // PartyKit to spin up the shared boss.
    if (serverAuthoritative && maxHp && maxHp > 0) {
      bossEventStore.set({ hp: maxHp, maxHp });
    }
    return () => {
      bossEventStore.reset();
    };
  }, [variant, serverAuthoritative, maxHp]);

  useFrame((state) => {
    const now = Date.now();
    const t = state.clock.elapsedTime;

    // ─── SERVER-AUTHORITATIVE SYNC ──────────────────────────
    // Mirror PartyKit boss state into the local store so the HUD shows the
    // real shared HP/phase. Engage the boss once on first frame.
    if (serverAuthoritative && bossStateRef) {
      if (!engagedRef.current && engageBoss && maxHp) {
        engageBoss(maxHp);
        engagedRef.current = true;
      }
      const bs = bossStateRef.current;
      const cur = bossEventStore.get();
      if (bs.defeated && cur.status === "engage") {
        deathStartedAt.current = now;
        bossEventStore.set({ hp: 0, phase: 4, status: "dying" });
      } else if (bs.active && cur.status === "engage") {
        const phase = computePhase(bs.hp, bs.maxHp || cur.maxHp);
        bossEventStore.set({ hp: bs.hp, maxHp: bs.maxHp || cur.maxHp, phase });
      }
    }

    const s = bossEventStore.get();

    // ─── BOSS WORLD POSITION (orbit + shake) ────────────────
    const orbitSpeed = tuneRef.current.orbitSpeed[s.phase];
    const angle = t * orbitSpeed;
    const orbitX = Math.cos(angle) * ORBIT_RADIUS;
    const orbitZ = Math.sin(angle) * ORBIT_RADIUS;

    // Shake on recent hit
    const sinceHit = now - s.lastHitFlashAt;
    const shakeAmp = sinceHit < 180 ? 4 * (1 - sinceHit / 180) : 0;
    const shakeX = (Math.random() - 0.5) * shakeAmp;
    const shakeZ = (Math.random() - 0.5) * shakeAmp;

    bossWorldPos.current.set(
      BOSS_BASE.x + orbitX + shakeX,
      BOSS_BASE.y,
      BOSS_BASE.z + orbitZ + shakeZ,
    );

    // ─── COMBAT TELLS (lean forward when charging, recoil after firing) ──
    const isCharging = !!s.incomingAttack;
    const sinceFire = now - lastAttackFiredAt.current;
    let lean = 0;
    if (isCharging) {
      // Lean forward proportional to how close to firing
      const tg = s.incomingAttack!;
      const k = 1 - Math.max(0, (tg.firesAt - now) / tuneRef.current.telegraphMs);
      lean = -0.35 * k;
    } else if (sinceFire < 400) {
      // Recoil
      const k = 1 - sinceFire / 400;
      lean = 0.45 * k;
    }
    // Smooth lean
    targetLeanRef.current += (lean - targetLeanRef.current) * 0.25;

    if (bossWrapperRef.current) {
      bossWrapperRef.current.position.copy(bossWorldPos.current);
      // The boss faces tangent to its orbit (looks like flying)
      // Yaw: angle + 90deg so it faces forward along orbit direction
      bossWrapperRef.current.rotation.y = angle + Math.PI / 2;
      bossWrapperRef.current.rotation.x = targetLeanRef.current;
    }

    // ─── ENGAGE: shoot detection + attack scheduling ────────
    if (s.status === "engage") {
      if (consumed.current.size > 300) consumed.current.clear();

      // Projectile hit on boss
      const projectiles = projectilesRef?.current;
      if (projectiles) {
        projectiles.forEach((p, pid) => {
          if (consumed.current.has(pid)) return;
          const age = (now - p.bornAt) / 1000;
          if (age > PROJECTILE_LIFE_S) return;
          const px = p.x + p.dirX * PROJECTILE_SPEED * age;
          const py = p.y + p.dirY * PROJECTILE_SPEED * age;
          const pz = p.z + p.dirZ * PROJECTILE_SPEED * age;
          const dx = px - bossWorldPos.current.x;
          const dy = py - bossWorldPos.current.y;
          const dz = pz - bossWorldPos.current.z;
          if (dx * dx + dy * dy + dz * dz < BOSS_HIT_RADIUS * BOSS_HIT_RADIUS) {
            consumed.current.add(pid);
            if (serverAuthoritative) {
              // Server decrements HP + credits damage; we just report + show
              // optimistic local damage tally and the hit flash.
              sendBossHit?.("boss");
              bossEventStore.set({
                playerDamage: s.playerDamage + tuneRef.current.damagePerHit,
                lastHitFlashAt: now,
              });
            } else {
              const newHp = Math.max(0, s.hp - tuneRef.current.damagePerHit);
              const newPhase = computePhase(newHp, s.maxHp);
              const newStatus = newHp <= 0 ? "dying" : "engage";
              bossEventStore.set({
                hp: newHp,
                playerDamage: s.playerDamage + tuneRef.current.damagePerHit,
                phase: newPhase,
                status: newStatus,
                lastHitFlashAt: now,
              });
              if (newStatus === "dying") {
                deathStartedAt.current = now;
              }
            }
          }
        });
      }

      // Schedule next attack (phase-driven cadence)
      if (
        !s.incomingAttack &&
        now - lastAttackScheduledAt.current > tuneRef.current.attackInterval[s.phase]
      ) {
        // Alternate attack types so player learns both
        const type: "laser" | "shockwave" =
          lastAttackType.current === "laser" ? "shockwave" : "laser";
        lastAttackType.current = type;

        let targetX: number;
        let targetZ: number;
        if (type === "laser") {
          // Snapshot player position — must move to dodge
          targetX = camera.position.x;
          targetZ = camera.position.z;
        } else {
          // Shockwave radiates from boss
          targetX = bossWorldPos.current.x;
          targetZ = bossWorldPos.current.z;
        }

        attackIdCounter.current += 1;
        bossEventStore.set({
          incomingAttack: {
            id: attackIdCounter.current,
            type,
            firesAt: now + tuneRef.current.telegraphMs,
            targetX,
            targetZ,
          },
        });
        lastAttackScheduledAt.current = now;
      }

      // Fire pending attack
      if (s.incomingAttack && now >= s.incomingAttack.firesAt) {
        const atk = s.incomingAttack;
        lastAttackFiredAt.current = now;
        lastAttackPos.current = { x: atk.targetX, z: atk.targetZ };
        lastFiredType.current = atk.type;

        // Damage check based on attack type
        let hit = false;
        if (atk.type === "laser") {
          const dx = camera.position.x - atk.targetX;
          const dz = camera.position.z - atk.targetZ;
          if (dx * dx + dz * dz < LASER_HIT_RADIUS * LASER_HIT_RADIUS) {
            hit = true;
          }
        } else {
          // Shockwave: at fires_at moment, ring is at SHOCKWAVE_PEAK_RADIUS
          const dx = camera.position.x - atk.targetX;
          const dz = camera.position.z - atk.targetZ;
          const distToWave = Math.sqrt(dx * dx + dz * dz);
          if (
            distToWave > SHOCKWAVE_PEAK_RADIUS - SHOCKWAVE_SHELL_WIDTH &&
            distToWave < SHOCKWAVE_PEAK_RADIUS + SHOCKWAVE_SHELL_WIDTH
          ) {
            hit = true;
          }
        }

        if (hit) {
          const cur = bossEventStore.get();
          // Route real damage into the shared fly HP / destruction / respawn
          // system (server applies it + i-frames). The hearts live in the fly
          // HUD now — this just fires the local "you were hit" feedback flash.
          if (serverAuthoritative) {
            sendBossSelfHit?.();
          }
          bossEventStore.set({
            incomingAttack: null,
            lastAttackFlashAt: now,
            lastPlayerHitAt: now,
            playerHits: cur.playerHits + 1,
          });
        } else {
          bossEventStore.set({
            incomingAttack: null,
            lastAttackFlashAt: now,
          });
        }
      }
    }

    // ─── TELEGRAPH MARKERS ──────────────────────────────────
    // Laser ground ring
    if (telegraphRef.current) {
      if (s.incomingAttack && s.incomingAttack.type === "laser") {
        telegraphRef.current.visible = true;
        telegraphRef.current.position.set(
          s.incomingAttack.targetX,
          8,
          s.incomingAttack.targetZ,
        );
        const tLeft = (s.incomingAttack.firesAt - now) / tuneRef.current.telegraphMs;
        const expand = 1 + (1 - Math.max(0, Math.min(1, tLeft))) * 0.6;
        telegraphRef.current.scale.set(expand, expand, expand);
        const mat = telegraphRef.current.material as THREE.MeshBasicMaterial;
        if (mat) mat.opacity = 0.4 + Math.abs(Math.sin(t * 18)) * 0.5;
      } else {
        telegraphRef.current.visible = false;
      }
    }
    // Shockwave telegraph: pulsing ring at boss base
    if (shockwaveTelegraphRef.current) {
      if (s.incomingAttack && s.incomingAttack.type === "shockwave") {
        shockwaveTelegraphRef.current.visible = true;
        shockwaveTelegraphRef.current.position.set(
          s.incomingAttack.targetX,
          8,
          s.incomingAttack.targetZ,
        );
        // Grow toward SHOCKWAVE_PEAK_RADIUS as fires_at approaches
        const tLeft = (s.incomingAttack.firesAt - now) / tuneRef.current.telegraphMs;
        const k = 1 - Math.max(0, Math.min(1, tLeft));
        const radius = 60 + k * (SHOCKWAVE_PEAK_RADIUS - 60);
        shockwaveTelegraphRef.current.scale.set(radius, 1, radius);
        const mat = shockwaveTelegraphRef.current.material as THREE.MeshBasicMaterial;
        if (mat) mat.opacity = 0.3 + Math.abs(Math.sin(t * 12)) * 0.4;
      } else {
        shockwaveTelegraphRef.current.visible = false;
      }
    }

    // ─── LASER BEAM (after fire, brief flash) ───────────────
    if (laserBeamRef.current && laserImpactRef.current) {
      const sinceL = now - lastAttackFiredAt.current;
      if (sinceL < LASER_FX_MS && lastFiredType.current === "laser") {
        const opacity = 1 - sinceL / LASER_FX_MS;
        const start = new THREE.Vector3(
          bossWorldPos.current.x,
          bossWorldPos.current.y - 30,
          bossWorldPos.current.z,
        );
        const end = new THREE.Vector3(lastAttackPos.current.x, 5, lastAttackPos.current.z);
        const dir = end.clone().sub(start);
        const len = dir.length();
        const mid = start.clone().add(end).multiplyScalar(0.5);

        laserBeamRef.current.visible = true;
        laserBeamRef.current.position.copy(mid);
        laserBeamRef.current.scale.set(20, len, 20);
        laserBeamRef.current.lookAt(end);
        laserBeamRef.current.rotateX(Math.PI / 2);
        const beamMat = laserBeamRef.current.material as THREE.MeshBasicMaterial;
        if (beamMat) beamMat.opacity = opacity;

        laserImpactRef.current.visible = true;
        laserImpactRef.current.position.set(lastAttackPos.current.x, 6, lastAttackPos.current.z);
        const impMat = laserImpactRef.current.material as THREE.MeshBasicMaterial;
        if (impMat) impMat.opacity = opacity;
      } else {
        laserBeamRef.current.visible = false;
        laserImpactRef.current.visible = false;
      }
    }

    // ─── SHOCKWAVE FX (after fire, expanding disc) ──────────
    if (shockwaveFxRef.current) {
      const sinceS = now - lastAttackFiredAt.current;
      if (sinceS < SHOCKWAVE_FX_MS && lastFiredType.current === "shockwave") {
        const k = sinceS / SHOCKWAVE_FX_MS;
        shockwaveFxRef.current.visible = true;
        shockwaveFxRef.current.position.set(lastAttackPos.current.x, 10, lastAttackPos.current.z);
        const radius = SHOCKWAVE_PEAK_RADIUS * (0.5 + k * 0.8);
        shockwaveFxRef.current.scale.set(radius, 1, radius);
        const mat = shockwaveFxRef.current.material as THREE.MeshBasicMaterial;
        if (mat) mat.opacity = 0.7 * (1 - k);
      } else {
        shockwaveFxRef.current.visible = false;
      }
    }

    // ─── DEATH SEQUENCE ─────────────────────────────────────
    if (s.status === "dying" || s.status === "victory") {
      const sinceDeath = now - deathStartedAt.current;
      if (explosionRef.current) {
        explosionRef.current.visible = sinceDeath < 1800;
        explosionRef.current.position.copy(bossWorldPos.current);
        const k = Math.min(1, sinceDeath / 1800);
        explosionRef.current.scale.setScalar(1 + k * 25);
        explosionRef.current.children.forEach((child) => {
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          if (mat) mat.opacity = 1 - k;
        });
        explosionRef.current.rotation.y = t * 2;
      }
      if (goldPulseRef.current) {
        const k = Math.min(1, sinceDeath / DEATH_DURATION_MS);
        goldPulseRef.current.visible = sinceDeath < DEATH_DURATION_MS;
        goldPulseRef.current.position.copy(bossWorldPos.current);
        const radius = 80 + k * 6000;
        goldPulseRef.current.scale.setScalar(radius);
        const mat = goldPulseRef.current.material as THREE.MeshBasicMaterial;
        if (mat) mat.opacity = 0.5 * (1 - k);
      }
      if (s.status === "dying" && sinceDeath > DEATH_DURATION_MS) {
        bossEventStore.set({ status: "victory", endedAt: now });
      }
    } else {
      if (explosionRef.current) explosionRef.current.visible = false;
      if (goldPulseRef.current) goldPulseRef.current.visible = false;
    }
  });

  const currentPhase = bossEventStore.get().phase;
  const hideBoss = bossEventStore.get().status !== "engage";

  return (
    <>
      {/* Boss wrapper handles position + rotation; BossPreview renders at local origin */}
      <group ref={bossWrapperRef}>
        {!hideBoss && (
          <BossPreview
            variant={variant}
            phase={currentPhase}
            position={[0, 0, 0]}
            scale={15}
            rotationY={variant === "duck" ? Math.PI : 0}
          />
        )}
      </group>

      {/* Minions */}
      {!hideBoss && (
        <BossMinions
          projectilesRef={projectilesRef}
          onKill={() => {
            const cur = bossEventStore.get();
            if (cur.status !== "engage") return;
            if (serverAuthoritative) {
              // Server applies minion bonus to shared HP + credits damage.
              sendBossHit?.("minion");
              bossEventStore.set({
                minionKills: cur.minionKills + 1,
                playerDamage: cur.playerDamage + tuneRef.current.minionKillBonus,
                lastHitFlashAt: Date.now(),
              });
              return;
            }
            const newHp = Math.max(0, cur.hp - tuneRef.current.minionKillBonus);
            const newPhase = computePhase(newHp, cur.maxHp);
            const newStatus = newHp <= 0 ? "dying" : "engage";
            bossEventStore.set({
              hp: newHp,
              minionKills: cur.minionKills + 1,
              playerDamage: cur.playerDamage + MINION_KILL_BONUS,
              phase: newPhase,
              status: newStatus,
              lastHitFlashAt: Date.now(),
            });
            if (newStatus === "dying") {
              deathStartedAt.current = Date.now();
            }
          }}
        />
      )}

      {/* Laser ground telegraph */}
      <mesh ref={telegraphRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[LASER_HIT_RADIUS - 30, LASER_HIT_RADIUS, 48]} />
        <meshBasicMaterial color="#ff0033" transparent opacity={0.6} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Shockwave expanding-ring telegraph */}
      <mesh ref={shockwaveTelegraphRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.92, 1.0, 64]} />
        <meshBasicMaterial color="#ff7733" transparent opacity={0.5} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Laser beam (post-fire) */}
      <mesh ref={laserBeamRef} visible={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={1} toneMapped={false} />
      </mesh>

      {/* Laser impact splash */}
      <mesh ref={laserImpactRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[40, 100, 32]} />
        <meshBasicMaterial color="#ffaa00" transparent opacity={1} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Shockwave expanding disc (post-fire) */}
      <mesh ref={shockwaveFxRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.88, 1.0, 64]} />
        <meshBasicMaterial color="#ff5500" transparent opacity={1} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Death explosion */}
      <group ref={explosionRef} visible={false}>
        {Array.from({ length: 20 }).map((_, i) => {
          const a = (i / 20) * Math.PI * 2;
          const r = 6 + (i % 4) * 4;
          const yOff = ((i * 7) % 10) - 5;
          const col = i % 4 === 0 ? "#ffd700" : i % 4 === 1 ? "#ff8800" : i % 4 === 2 ? "#ff2244" : "#ffffff";
          return (
            <mesh key={i} position={[Math.cos(a) * r, yOff, Math.sin(a) * r]}>
              <boxGeometry args={[6, 6, 6]} />
              <meshBasicMaterial color={col} transparent opacity={1} toneMapped={false} />
            </mesh>
          );
        })}
      </group>

      {/* Golden city-wide pulse */}
      <mesh ref={goldPulseRef} position={BOSS_BASE} visible={false}>
        <sphereGeometry args={[1, 24, 12]} />
        <meshBasicMaterial color="#ffdd33" transparent opacity={0.5} side={THREE.BackSide} toneMapped={false} depthWrite={false} />
      </mesh>
    </>
  );
}

