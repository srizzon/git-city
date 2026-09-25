"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Two materials that would render the same are merged into one draw call.
function materialKey(m: THREE.Material): string {
  const a = m as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  return [
    m.type, a.color?.getHexString(), a.emissive?.getHexString(), a.emissiveIntensity,
    a.roughness, a.metalness, a.map?.uuid, a.emissiveMap?.uuid, a.flatShading, a.wireframe,
    m.transparent, m.opacity, m.toneMapped, m.side, m.depthWrite, m.depthTest, m.blending,
  ].join("|");
}

// mergeGeometries needs the same attribute set and indexing on every input.
function geometryKey(g: THREE.BufferGeometry): string {
  return `${g.index ? "i" : "n"}:${Object.keys(g.attributes).sort().join(",")}`;
}

/**
 * Draws its static children as one mesh per look. Every mesh is a draw call,
 * and iOS Safari pays heavily per call: a landmark built from 20 boxes becomes
 * 3-4 calls. Merges once, at mount, relative to this group. Anything that
 * animates on its own (a ref'd mesh, a pulsing material) belongs outside it;
 * the originals stay in the tree, hidden, so raycasts and unmount still work.
 */
export default function MergedStatic({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert();

    const buckets = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[] }>();
    root.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return;
      const k = `${materialKey(mesh.material)}#${geometryKey(mesh.geometry)}`;
      const b = buckets.get(k) ?? { material: mesh.material, meshes: [] };
      b.meshes.push(mesh);
      buckets.set(k, b);
    });

    const merged: THREE.Mesh[] = [];
    const hidden: THREE.Mesh[] = [];
    for (const { material, meshes } of buckets.values()) {
      if (meshes.length < 2) continue;
      const geos = meshes.map((m) =>
        m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld)),
      );
      const geo = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, material);
      mesh.raycast = () => {}; // clicks still hit the hidden originals
      root.add(mesh);
      merged.push(mesh);
      for (const m of meshes) { m.visible = false; hidden.push(m); }
    }

    return () => {
      for (const m of merged) { root.remove(m); m.geometry.dispose(); }
      for (const m of hidden) m.visible = true;
    };
  }, []);

  return <group ref={ref}>{children}</group>;
}
