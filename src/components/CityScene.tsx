"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import Building3D from "./Building3D";
import type { CityBuilding } from "@/lib/github";
import type { BuildingColors } from "./CityCanvas";

const LOD_DISTANCE = 400;
const LOD_UPDATE_INTERVAL = 0.2; // seconds

// Pre-allocated temp objects to avoid GC pressure in useFrame
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

interface CitySceneProps {
  buildings: CityBuilding[];
  colors: BuildingColors;
  focusedBuilding?: string | null;
  accentColor?: string;
  onBuildingClick?: (building: CityBuilding) => void;
}

export default function CityScene({
  buildings,
  colors,
  focusedBuilding,
  accentColor,
  onBuildingClick,
}: CitySceneProps) {
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const lastUpdate = useRef(-1); // -1 so first frame triggers immediately
  const nearSetRef = useRef(new Set<string>());
  const [nearBuildings, setNearBuildings] = useState<CityBuilding[]>([]);

  // Shared geometry for far building instances (unit box, scaled per instance)
  const sharedGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  // Material for far buildings (flat color, no textures)
  const farMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    []
  );

  // Update material when theme changes
  useEffect(() => {
    farMaterial.color.set(colors.face);
    farMaterial.emissive.set(colors.roof);
    farMaterial.emissiveIntensity = 1.2;
    farMaterial.needsUpdate = true;
  }, [colors.face, colors.roof, farMaterial]);

  // Dim far buildings when one is focused
  useEffect(() => {
    if (focusedBuilding) {
      farMaterial.transparent = true;
      farMaterial.opacity = 0.55;
      farMaterial.emissiveIntensity = 0.4;
    } else {
      farMaterial.transparent = false;
      farMaterial.opacity = 1;
      farMaterial.emissiveIntensity = 1.2;
    }
    farMaterial.needsUpdate = true;
  }, [focusedBuilding, farMaterial]);

  // Force recalculation when buildings array changes
  useEffect(() => {
    lastUpdate.current = -1;
  }, [buildings]);

  // Dispose shared resources on unmount
  useEffect(() => {
    return () => {
      sharedGeo.dispose();
      farMaterial.dispose();
    };
  }, [sharedGeo, farMaterial]);

  // Centralized LOD check — one useFrame for all buildings
  useFrame(({ camera, clock }) => {
    const elapsed = clock.elapsedTime;
    if (elapsed - lastUpdate.current < LOD_UPDATE_INTERVAL) return;
    lastUpdate.current = elapsed;

    const newNearSet = new Set<string>();
    const far: CityBuilding[] = [];

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const dx = camera.position.x - b.position[0];
      const dz = camera.position.z - b.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);

      const isFocused =
        focusedBuilding != null &&
        focusedBuilding.toLowerCase() === b.login.toLowerCase();

      if (dist < LOD_DISTANCE || isFocused) {
        newNearSet.add(b.login);
      } else {
        far.push(b);
      }
    }

    // Only trigger React re-render when the near set actually changes
    let changed = newNearSet.size !== nearSetRef.current.size;
    if (!changed) {
      for (const login of newNearSet) {
        if (!nearSetRef.current.has(login)) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      nearSetRef.current = newNearSet;
      setNearBuildings(buildings.filter((b) => newNearSet.has(b.login)));
    }

    // Update instanced mesh for far buildings (no React re-render needed)
    const mesh = instancedRef.current;
    if (mesh) {
      for (let i = 0; i < far.length; i++) {
        const b = far[i];
        _position.set(b.position[0], b.height / 2, b.position[2]);
        _scale.set(b.width, b.height, b.depth);
        _matrix.compose(_position, _quaternion, _scale);
        mesh.setMatrixAt(i, _matrix);
        _color.set(b.custom_color ?? colors.face);
        mesh.setColorAt(i, _color);
      }
      mesh.count = far.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      {/* Far buildings: single instanced draw call */}
      <instancedMesh
        ref={instancedRef}
        args={[sharedGeo, farMaterial, buildings.length]}
        frustumCulled={false}
      />

      {/* Near buildings: full detail with textures, labels, effects */}
      {nearBuildings.map((b) => (
        <Building3D
          key={b.login}
          building={b}
          colors={colors}
          focused={
            focusedBuilding?.toLowerCase() === b.login.toLowerCase()
          }
          dimmed={
            !!focusedBuilding &&
            focusedBuilding.toLowerCase() !== b.login.toLowerCase()
          }
          accentColor={accentColor}
          onClick={onBuildingClick}
        />
      ))}
    </>
  );
}
