"use client";

import { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { VehicleMesh } from "./RaidSequence3D";
import type { RemotePilot } from "@/lib/useFlyPresence";

// ─── Constants ──────────────────────────────────────────────
const LERP_DURATION = 0.12;

// ─── Single remote pilot ────────────────────────────────────

function RemotePilotMesh({ pilot }: { pilot: RemotePilot }) {
  const groupRef = useRef<THREE.Group>(null);

  const labelSprite = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(4, 4, 248, 56, 8);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pilot.login.slice(0, 16), 128, 32);
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, [pilot.login]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    pilot.lerpTimer = Math.min(1, pilot.lerpTimer + delta / LERP_DURATION);
    const t = pilot.lerpTimer;

    const ix = pilot.prevX + (pilot.x - pilot.prevX) * t;
    const iy = pilot.prevY + (pilot.y - pilot.prevY) * t;
    const iz = pilot.prevZ + (pilot.z - pilot.prevZ) * t;
    const iyaw = lerpAngle(pilot.prevYaw, pilot.yaw, t);
    const ibank = lerpAngle(pilot.prevBank, pilot.bank, t);

    groupRef.current.position.set(ix, iy, iz);
    groupRef.current.rotation.set(0, iyaw, ibank, "YXZ");
  });

  return (
    <group ref={groupRef}>
      <group scale={[4, 4, 4]}>
        <VehicleMesh type={pilot.vehicle || "airplane"} />
      </group>
      <pointLight position={[0, -2, 0]} color="#f0c870" intensity={15} distance={60} />
      <pointLight position={[0, 3, -4]} color="#ffffff" intensity={5} distance={30} />
      <sprite position={[0, -12, 0]} scale={[20, 5, 1]}>
        <spriteMaterial map={labelSprite} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

// ─── Main component ─────────────────────────────────────────

export default function RemotePilots({
  pilotsRef,
}: {
  pilotsRef: React.MutableRefObject<Map<string, RemotePilot>>;
}) {
  const [tick, setTick] = useState(0);
  const prevKeysRef = useRef("");

  useFrame(() => {
    const keys = Array.from(pilotsRef.current.keys()).join(",");
    if (keys !== prevKeysRef.current) {
      prevKeysRef.current = keys;
      setTick((t) => t + 1);
    }
  });

  // tick used to trigger re-render when pilot list changes
  void tick;

  const pilots = Array.from(pilotsRef.current.entries());

  return (
    <group>
      {pilots.map(([id, pilot]) => (
        <RemotePilotMesh key={id} pilot={pilot} />
      ))}
    </group>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
