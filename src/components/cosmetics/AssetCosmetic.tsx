"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { resolveModelUrl } from "@/lib/cosmetics/modelBase";
import type { AssetRenderSpec, CosmeticSlot } from "@/lib/cosmetics/types";
import type { BuildingVisualOpts } from "./itemRenderers";

// ─── Generic GLB cosmetic ─────────────────────────────────────────────────
// Places a model on the building purely from data (render_spec). This is the
// renderer that lets the catalog scale: a new cosmetic is a model upload + a
// row with { model, attach, offset, scale, rotation, tint, animation } — no
// new component, no switch case. Must render under a <Suspense> boundary
// (useGLTF suspends); the preview Canvas and the live city already provide one.

/** Anchor point on the building for each slot, in world units. The asset's
 *  own origin sits here; render_spec.offset nudges from it. */
function slotAnchor(slot: CosmeticSlot, o: BuildingVisualOpts): [number, number, number] {
  const { height, depth } = o;
  switch (slot) {
    case "crown": return [0, height + 0.5, 0];
    case "roof": return [0, height, 0];
    case "aura": return [0, height / 2, 0];
    case "faces": return [0, height * 0.6, depth / 2];
    default: return [0, height, 0];
  }
}

function toScale(s: AssetRenderSpec["scale"]): [number, number, number] {
  if (s == null) return [1, 1, 1];
  return typeof s === "number" ? [s, s, s] : s;
}

export default function AssetCosmetic({
  spec,
  opts,
  slot,
}: {
  spec: AssetRenderSpec;
  opts: BuildingVisualOpts;
  /** Falls back here when spec.attach is absent. */
  slot: CosmeticSlot;
}) {
  const gltf = useGLTF(resolveModelUrl(spec.model));
  const groupRef = useRef<THREE.Group>(null);

  // Clone so the same model can appear on many buildings independently, and
  // apply the tint once per (scene, tint) pair.
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const tint = spec.tint === "accent" ? opts.color : spec.tint;
    if (tint) {
      clone.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && mesh.material) {
          const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
          if ("color" in mat) (mat.color as THREE.Color).set(tint);
          mesh.material = mat;
        }
      });
    }
    return clone;
  }, [gltf.scene, spec.tint, opts.color]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g || !spec.animation) return;
    if (spec.animation === "spin") g.rotation.y += delta * 0.8;
    else if (spec.animation === "bob") g.position.y = g.userData.baseY + Math.sin(performance.now() / 600) * 0.6;
    else if (spec.animation === "float") {
      g.position.y = g.userData.baseY + Math.sin(performance.now() / 900) * 1.1;
      g.rotation.y += delta * 0.3;
    }
  });

  const anchor = slotAnchor(spec.attach ?? slot, opts);
  const offset = spec.offset ?? [0, 0, 0];
  const position: [number, number, number] = [anchor[0] + offset[0], anchor[1] + offset[1], anchor[2] + offset[2]];

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={spec.rotation ?? [0, 0, 0]}
      scale={toScale(spec.scale)}
      onUpdate={(g) => { g.userData.baseY = position[1]; }}
    >
      <primitive object={scene} />
    </group>
  );
}
