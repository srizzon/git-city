import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Replaces a group's direct mesh children with one mesh per material, their
 * transforms baked in. Every mesh is its own draw call, and on iOS Safari
 * each call is expensive, so a voxel mascot of 60 cubes becomes 1-2 calls.
 * For static parts only: once merged, a child can't move on its own (the
 * group and the shared material still animate).
 */
export function mergeStaticChildren<T extends THREE.Group>(group: T): T {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material) && mesh.children.length === 0) {
      mesh.updateMatrix();
      const list = byMaterial.get(mesh.material) ?? [];
      list.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));
      byMaterial.set(mesh.material, list);
    } else {
      keep.push(child);
    }
  }
  group.clear();
  for (const k of keep) group.add(k);
  for (const [material, geos] of byMaterial) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (merged) group.add(new THREE.Mesh(merged, material));
  }
  return group;
}
