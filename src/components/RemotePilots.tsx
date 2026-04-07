"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RemotePilot } from "@/lib/useFlyPresence";

// ─── Constants ──────────────────────────────────────────────
const LERP_DURATION = 0.12;

// Shared geometry / materials (created once, reused across all pilots)
let sharedBodyGeo: THREE.BoxGeometry | null = null;
let sharedWingGeo: THREE.BoxGeometry | null = null;
let sharedTailGeo: THREE.BoxGeometry | null = null;
let sharedBodyMat: THREE.MeshStandardMaterial | null = null;
let sharedWingMat: THREE.MeshStandardMaterial | null = null;

function getSharedGeo() {
  if (!sharedBodyGeo) {
    sharedBodyGeo = new THREE.BoxGeometry(2, 0.6, 3);
    sharedWingGeo = new THREE.BoxGeometry(6, 0.15, 1.2);
    sharedTailGeo = new THREE.BoxGeometry(2, 1, 0.3);
    sharedBodyMat = new THREE.MeshStandardMaterial({ color: "#6090e0" });
    sharedWingMat = new THREE.MeshStandardMaterial({ color: "#4070c0" });
  }
  return { sharedBodyGeo: sharedBodyGeo!, sharedWingGeo: sharedWingGeo!, sharedTailGeo: sharedTailGeo!, sharedBodyMat: sharedBodyMat!, sharedWingMat: sharedWingMat! };
}

interface PilotEntry {
  container: THREE.Group;
  labelMap: THREE.CanvasTexture;
}

// ─── Main component (imperative for zero re-renders) ────────

export default function RemotePilots({
  pilotsRef,
}: {
  pilotsRef: React.MutableRefObject<Map<string, RemotePilot>>;
}) {
  const wrapperRef = useRef<THREE.Group>(null);
  const meshes = useRef<Map<string, PilotEntry>>(new Map());

  useFrame((_, delta) => {
    if (!wrapperRef.current) return;
    const pilots = pilotsRef.current;

    // Remove disconnected pilots
    for (const [id, entry] of meshes.current) {
      if (!pilots.has(id)) {
        wrapperRef.current.remove(entry.container);
        entry.labelMap.dispose();
        meshes.current.delete(id);
      }
    }

    // Add new / update existing
    for (const [id, pilot] of pilots) {
      let entry = meshes.current.get(id);

      if (!entry) {
        const { sharedBodyGeo: bg, sharedWingGeo: wg, sharedTailGeo: tg, sharedBodyMat: bm, sharedWingMat: wm } = getSharedGeo();

        // Container: holds position + rotation
        const container = new THREE.Group();

        // Scaled mesh sub-group (matches AirplaneFlight scale=4)
        const meshGroup = new THREE.Group();
        meshGroup.scale.set(4, 4, 4);

        const body = new THREE.Mesh(bg, bm);
        meshGroup.add(body);

        const wing = new THREE.Mesh(wg, wm);
        wing.position.set(0, 0.1, 0.3);
        meshGroup.add(wing);

        const tail = new THREE.Mesh(tg, wm);
        tail.position.set(0, 0.5, 1.4);
        meshGroup.add(tail);

        container.add(meshGroup);

        // Point light
        const light = new THREE.PointLight("#f0c870", 10, 40);
        light.position.set(0, -2, 0);
        container.add(light);

        // Username label sprite
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
        const labelMap = new THREE.CanvasTexture(canvas);
        const labelMat = new THREE.SpriteMaterial({ map: labelMap, transparent: true, depthTest: false });
        const label = new THREE.Sprite(labelMat);
        label.position.set(0, -12, 0);
        label.scale.set(20, 5, 1);
        container.add(label);

        wrapperRef.current.add(container);
        entry = { container, labelMap };
        meshes.current.set(id, entry);
      }

      // Advance lerp
      pilot.lerpTimer = Math.min(1, pilot.lerpTimer + delta / LERP_DURATION);
      const t = pilot.lerpTimer;

      const ix = pilot.prevX + (pilot.x - pilot.prevX) * t;
      const iy = pilot.prevY + (pilot.y - pilot.prevY) * t;
      const iz = pilot.prevZ + (pilot.z - pilot.prevZ) * t;
      const iyaw = lerpAngle(pilot.prevYaw, pilot.yaw, t);
      const ibank = lerpAngle(pilot.prevBank, pilot.bank, t);

      entry.container.position.set(ix, iy, iz);
      entry.container.rotation.set(0, iyaw, ibank, "YXZ");
    }
  });

  return <group ref={wrapperRef} />;
}

// ─── Helpers ────────────────────────────────────────────────

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
