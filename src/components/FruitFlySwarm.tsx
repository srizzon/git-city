"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import FruitFly from "./FruitFly";
import { ObstacleGrid, obstaclesFrom, spawnFly, stepFly, type FlyObstacle, type FlyState } from "@/lib/fruitFly";
import type { CityBuilding } from "@/lib/github";

/** Model units to world units. Stylized: a real fly would be sub-pixel next to a building. */
const FLY_SCALE = 5;
/** Past this camera distance a fly is a speck, so skip drawing it. */
const DRAW_DISTANCE = 900;
/** Landmark parts that start above this height (a gate's lintel, floating signs) aren't obstacles. */
const LANDMARK_IGNORE_ABOVE = 150;
/** Height of the "ground" the look ray is cut at: roughly where roofs and flies are. */
const LOOK_PLANE_Y = 70;

const _fwd = new THREE.Vector3();

/** Where the camera is looking at rooftop height, or right under it when looking up. */
function lookPoint(camera: THREE.Camera, out: { x: number; z: number }) {
  camera.getWorldDirection(_fwd);
  const p = camera.position;
  const t = _fwd.y < -0.05 && p.y > LOOK_PLANE_Y ? Math.min((LOOK_PLANE_Y - p.y) / _fwd.y, 3000) : 0;
  out.x = p.x + _fwd.x * t;
  out.z = p.z + _fwd.z * t;
}

/**
 * Landmark meshes as obstacles, one per mesh: a single box around the whole
 * plaza would be hundreds of units wide. Parts load late (models, textures),
 * so re-measure a few times.
 */
function useLandmarkObstacles(ref?: RefObject<THREE.Object3D | null>) {
  const [obstacles, setObstacles] = useState<FlyObstacle[]>([]);
  useEffect(() => {
    if (!ref) return;
    const b = new THREE.Box3();
    let tries = 0;
    let last = "";
    const measure = () => {
      const root = ref.current;
      if (!root) return;
      root.updateWorldMatrix(true, true);
      const next: FlyObstacle[] = [];
      const add = (obj: THREE.Object3D) => {
        b.setFromObject(obj);
        // Skip specks and anything overhead (a gate's lintel, floating signs):
        // obstacles are solid from the ground up, so those would wall flies off.
        if (b.isEmpty() || b.min.y > LANDMARK_IGNORE_ABOVE) return;
        if (Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) < 2) return;
        // Avoided but never landed on: a box around a sloped sign isn't a roof.
        next.push({ x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2, hw: (b.max.x - b.min.x) / 2, hd: (b.max.z - b.min.z) / 2, h: b.max.y, perch: false });
      };
      const visit = (obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          // Real shapes only: visible meshes that aren't merged draw batches
          // (their raycast is stubbed), plus the originals MergedStatic hid.
          // Invisible click hitboxes are skipped.
          const merged = mesh.raycast !== THREE.Mesh.prototype.raycast && !(mesh as THREE.InstancedMesh).isInstancedMesh;
          if ((mesh.visible && !merged) || mesh.userData.mergedAway) add(mesh);
        } else if (!obj.visible) {
          return;
        }
        for (const c of obj.children) visit(c);
      };
      visit(root);
      const key = next.map((o) => `${o.x | 0},${o.z | 0},${o.hw | 0},${o.hd | 0},${o.h | 0}`).join(";");
      if (key !== last) { last = key; setObstacles(next); }
    };
    measure();
    const id = setInterval(() => { measure(); if (++tries >= 10) clearInterval(id); }, 2000);
    return () => clearInterval(id);
  }, [ref]);
  return obstacles;
}

function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/** Autonomous fruit flies (one by default) that roam, land on roofs and take off near wherever the camera looks (#142). */
export default function FruitFlySwarm({
  buildings,
  landmarks,
  count = 1,
}: {
  buildings: Pick<CityBuilding, "position" | "width" | "depth" | "height">[];
  /** Non-building scenery to fly over (e.g. the plaza monument), measured by its bounding box. */
  landmarks?: RefObject<THREE.Object3D | null>;
  count?: number;
}) {
  const landmarkObstacles = useLandmarkObstacles(landmarks);
  const grid = useMemo(
    () => new ObstacleGrid(obstaclesFrom(buildings).concat(landmarkObstacles)),
    [buildings, landmarkObstacles],
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  const home = useRef({ x: 0, z: 0 });
  const flies = useRef<FlyState[] | null>(null);
  const scratch = useRef<number[]>([]);
  const facing = useRef<{ yaw: number; pitch: number; roll: number }[]>([]);

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05); // a backgrounded tab shouldn't teleport them
    lookPoint(camera, home.current);
    const { x: homeX, z: homeZ } = home.current;

    if (!flies.current || flies.current.length !== count) {
      flies.current = Array.from({ length: count }, () => spawnFly(homeX, homeZ, Math.random, grid));
      facing.current = flies.current.map(() => ({ yaw: 0, pitch: 0, roll: 0 }));
    }
    const all = flies.current;

    for (let i = 0; i < all.length; i++) {
      const f = all[i];
      stepFly(f, dt, { grid, homeX, homeZ, flies: all, scratch: scratch.current });

      const g = groups.current[i];
      if (!g) continue;
      g.visible = camera.position.distanceTo(g.position) < DRAW_DISTANCE;
      g.position.set(f.x, f.y, f.z);

      // Face the direction of travel; pitch with climb, bank into turns.
      const o = facing.current[i];
      const hs = Math.hypot(f.vx, f.vz);
      let yaw = o.yaw, pitch = 0, roll = 0;
      if (f.mode === "landed") {
        yaw = f.yaw;
      } else if (hs > 1) {
        yaw = Math.atan2(f.vx, f.vz);
        pitch = -Math.atan2(f.vy, hs) * 0.6;
        // How far the smoothed heading lags the true one tracks turn rate.
        roll = Math.max(-0.6, Math.min(0.6, angleDelta(o.yaw, yaw) * -1.2));
      }
      const k = 1 - Math.exp(-10 * dt);
      o.yaw += angleDelta(o.yaw, yaw) * k;
      o.pitch += (pitch - o.pitch) * k;
      o.roll += (roll - o.roll) * k;
      g.rotation.set(o.pitch, o.yaw, o.roll, "YXZ");
      // Touch down facing the way we flew in, then twitch from there.
      if (f.mode !== "landed") f.yaw = o.yaw;
    }
  });

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(g) => { groups.current[i] = g; }} scale={FLY_SCALE} visible={false}>
          <FruitFly flying={() => flies.current?.[i]?.mode !== "landed"} />
        </group>
      ))}
    </>
  );
}
