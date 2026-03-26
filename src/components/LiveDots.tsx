"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import type { LiveSession } from "@/lib/useCodingPresence";

const DOT_SIZE = 4;
const CREATOR_DOT_SIZE = 5;
const CREATOR_LOGIN = "srizzon";
const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

interface LiveDotsProps {
  buildings: CityBuilding[];
  liveByLogin: Map<string, LiveSession>;
}

export default function LiveDots({ buildings, liveByLogin }: LiveDotsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const creatorMeshRef = useRef<THREE.Mesh>(null);

  // Split live buildings into regular and creator
  const { regularIndices, creatorIndex } = useMemo(() => {
    const regular: number[] = [];
    let creator: number | null = null;
    for (let i = 0; i < buildings.length; i++) {
      const login = buildings[i].login.toLowerCase();
      if (!liveByLogin.has(login)) continue;
      if (login === CREATOR_LOGIN) {
        creator = i;
      } else {
        regular.push(i);
      }
    }
    return { regularIndices: regular, creatorIndex: creator };
  }, [buildings, liveByLogin]);

  const count = regularIndices.length;

  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#4ade80",
        transparent: true,
        opacity: 1,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const creatorMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#fbbf24",
        transparent: true,
        opacity: 1,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  // Position regular dots
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    _scale.set(DOT_SIZE, DOT_SIZE, DOT_SIZE);
    for (let i = 0; i < count; i++) {
      const b = buildings[regularIndices[i]];
      _pos.set(b.position[0], b.height + 12, b.position[2]);
      _matrix.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = count;
  }, [buildings, regularIndices, count]);

  // Position creator dot
  useEffect(() => {
    const mesh = creatorMeshRef.current;
    if (!mesh || creatorIndex === null) return;
    const b = buildings[creatorIndex];
    mesh.position.set(b.position[0], b.height + 12, b.position[2]);
    mesh.scale.set(CREATOR_DOT_SIZE, CREATOR_DOT_SIZE, CREATOR_DOT_SIZE);
  }, [buildings, creatorIndex]);

  // Pulse animation
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 0.6 + 0.4 * Math.sin(t * 2);
    if (count > 0) mat.opacity = pulse;
    if (creatorIndex !== null) creatorMat.opacity = pulse;
  });

  // Cleanup
  useEffect(() => {
    return () => {
      geo.dispose();
      mat.dispose();
      creatorMat.dispose();
    };
  }, [geo, mat, creatorMat]);

  const hasAnything = count > 0 || creatorIndex !== null;
  if (!hasAnything) return null;

  return (
    <>
      {count > 0 && (
        <instancedMesh
          ref={meshRef}
          args={[geo, mat, count]}
          frustumCulled={false}
          renderOrder={999}
        />
      )}
      {creatorIndex !== null && (
        <mesh
          ref={creatorMeshRef}
          geometry={geo}
          material={creatorMat}
          frustumCulled={false}
          renderOrder={999}
        />
      )}
    </>
  );
}
