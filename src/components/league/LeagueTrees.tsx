"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { mergeBufferGeometries } from "three-stdlib";
import * as THREE from "three";
import { lotToWorld } from "@/lib/league-city/grid";
import { TREE_TYPES, type CityObject, type TreeType } from "@/lib/league-city/types";

// The 6 Kenney Nature Kit trees (CC0), loaded once and instanced per type.
// useGLTF caches per URL; each tree keeps its leaf and bark materials as
// separate submeshes.

const TREE_URL: Record<TreeType, string> = {
  tree_default: "/models/trees/tree_default.glb",
  tree_oak: "/models/trees/tree_oak.glb",
  tree_fat: "/models/trees/tree_fat.glb",
  tree_detailed: "/models/trees/tree_detailed.glb",
  tree_palm_tall: "/models/trees/tree_palmTall.glb",
  tree_pine_tall_a: "/models/trees/tree_pineTallA.glb",
};
const URLS = TREE_TYPES.map((t) => TREE_URL[t]);
useGLTF.preload(URLS);

const TREE_H = 30;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

type Variant = { subs: { geo: THREE.BufferGeometry; mat: THREE.Material }[]; scale: number };

function TreeInstances({ variant, lots }: { variant: Variant; lots: { x: number; z: number }[] }) {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  useLayoutEffect(() => {
    lots.forEach((l, i) => {
      const [wx, wz] = lotToWorld(l.x, l.z);
      const jitter = 0.85 + (Math.abs((l.x * 31 + l.z * 17) % 7) / 7) * 0.3;
      _q.setFromAxisAngle(_up, (l.x * 13.7 + l.z * 7.1) % 6.283);
      _p.set(wx, 0, wz);
      _s.setScalar(variant.scale * jitter);
      _m.compose(_p, _q, _s);
      for (const r of refs.current) r?.setMatrixAt(i, _m);
    });
    for (const r of refs.current) {
      if (!r) continue;
      r.instanceMatrix.needsUpdate = true;
      r.computeBoundingSphere();
    }
  }, [lots, variant]);
  return (
    <>
      {variant.subs.map((sub, i) => (
        <instancedMesh
          key={`${i}-${lots.length}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          args={[sub.geo, sub.mat, lots.length]}
        />
      ))}
    </>
  );
}

export default function LeagueTrees({ objects }: { objects: CityObject[] }) {
  const gltfs = useGLTF(URLS) as unknown as { scene: THREE.Group }[];
  const variants = useMemo<Variant[]>(
    () =>
      gltfs.map((g) => {
        g.scene.updateMatrixWorld(true);
        const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
        let minY = Infinity;
        let maxY = -Infinity;
        g.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const ge = mesh.geometry.clone();
          ge.applyMatrix4(mesh.matrixWorld);
          ge.computeBoundingBox();
          minY = Math.min(minY, ge.boundingBox!.min.y);
          maxY = Math.max(maxY, ge.boundingBox!.max.y);
          const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
          (groups.get(mat) ?? groups.set(mat, []).get(mat)!).push(ge);
        });
        const subs = [...groups.entries()].map(([mat, geos]) => {
          const geo = geos.length === 1 ? geos[0] : (mergeBufferGeometries(geos, false) ?? geos[0]);
          geo.translate(0, -minY, 0);
          return { geo, mat };
        });
        return { subs, scale: TREE_H / (maxY - minY || 1) };
      }),
    [gltfs],
  );
  useLayoutEffect(() => () => variants.forEach((v) => v.subs.forEach((s) => s.geo.dispose())), [variants]);

  const lotsByType = useMemo(() => {
    const out = TREE_TYPES.map(() => [] as { x: number; z: number }[]);
    for (const o of objects) {
      const i = TREE_TYPES.indexOf(o.item_type as TreeType);
      if (i >= 0) out[i].push({ x: o.x, z: o.z });
    }
    return out;
  }, [objects]);

  return (
    <group>
      {variants.map((v, i) => (lotsByType[i].length > 0 ? <TreeInstances key={i} variant={v} lots={lotsByType[i]} /> : null))}
    </group>
  );
}
