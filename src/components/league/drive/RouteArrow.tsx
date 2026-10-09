"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import type { CarApi } from "./Car";

// Drive here: a voxel arrow floating over the car, pointing straight at the
// building you picked (like Need for Speed Underground 2's GPS arrow, in the
// city's blocks). It turns with the target, not the car, leans its face
// toward the camera so it never shows up edge-on, and clears the route once
// you get there (onArrive).

/** Over the roof, city units. */
const LIFT = 8.5;
/** How far the face leans from flat toward the camera (0 flat, 1 facing it). */
const LEAN = 0.4;
/** One voxel, city units. */
const PX = 0.3;
/** Tip at the top; 1 lime, 2 outline. */
const ARROW = [
  "....2....",
  "...212...",
  "..21112..",
  ".2111112.",
  "211111112",
  "222111222",
  "..21112..",
  "..21112..",
  "..22222..",
];
const LIME = "#c8e64a";
const OUTLINE = "#101016";
/** Side faces are this much darker than the top, so the blocks read as blocks. */
const SIDE = 0.68;

/** The arrow's cubes merged into one mesh with vertex colors: face up (+y), tip toward -z. */
function voxelArrow(): THREE.BufferGeometry {
  const w = ARROW[0].length;
  const h = ARROW.length;
  const top = new THREE.Color();
  const parts: THREE.BufferGeometry[] = [];
  ARROW.forEach((row, j) => {
    for (let i = 0; i < w; i++) {
      const c = row[i];
      if (c === ".") continue;
      const g = new THREE.BoxGeometry(PX, PX, PX).toNonIndexed();
      g.translate((i - (w - 1) / 2) * PX, 0, (j - (h - 1) / 2) * PX);
      top.set(c === "1" ? LIME : OUTLINE);
      const normal = g.getAttribute("normal");
      const colors = new Float32Array(normal.count * 3);
      for (let v = 0; v < normal.count; v++) {
        const k = Math.abs(normal.getY(v)) > 0.5 ? 1 : SIDE;
        colors[v * 3] = top.r * k;
        colors[v * 3 + 1] = top.g * k;
        colors[v * 3 + 2] = top.b * k;
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      parts.push(g);
    }
  });
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return merged;
}

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _n = new THREE.Vector3();
const _x = new THREE.Vector3();
const _back = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

export default function RouteArrow({
  car,
  telemetryRef,
  onArrive,
}: {
  car: React.MutableRefObject<CarApi | null>;
  telemetryRef: React.MutableRefObject<DriveTelemetry>;
  onArrive: (login: string) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const geometry = useMemo(() => voxelArrow(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const fresh = useRef(true);

  useFrame(({ camera }, dt) => {
    const g = ref.current;
    const c = car.current;
    const route = telemetryRef.current.route;
    if (!g) return;
    g.visible = !!route && !!c;
    if (!route || !c) {
      fresh.current = true;
      return;
    }
    const p = c.group.position;
    const dx = route.x - p.x;
    const dz = route.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < route.reach) {
      telemetryRef.current.route = null;
      onArrive(route.login);
      return;
    }
    g.position.set(p.x, p.y + LIFT + Math.sin(performance.now() / 260) * 0.25, p.z);

    // The face: between straight up and the camera. The tip: toward the
    // building, kept in that face's plane (so straight ahead it dips forward).
    _dir.set(dx / dist, 0, dz / dist);
    _cam.subVectors(camera.position, g.position).normalize();
    _n.copy(_up).lerp(_cam, LEAN).normalize();
    _dir.addScaledVector(_n, -_dir.dot(_n)).normalize();
    _back.copy(_dir).negate();
    _x.crossVectors(_n, _back);
    _m.makeBasis(_x, _n, _back);
    _q.setFromRotationMatrix(_m);
    if (fresh.current) g.quaternion.copy(_q);
    else g.quaternion.slerp(_q, Math.min(1, dt * 10));
    fresh.current = false;
  });

  return (
    <group ref={ref} visible={false}>
      <mesh geometry={geometry}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
    </group>
  );
}
