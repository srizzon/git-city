"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import type { CarApi } from "./Car";

// Drive here: a chevron floating over the car, pointing straight at the
// building you picked (like Need for Speed Underground 2's GPS arrow). It
// turns with the target, not the car, and clears the route once you get
// there (onArrive).

const LIME = "#c8e64a";
const LIME_DARK = "#5a7a00";
/** Over the roof, under the chase camera, city units. */
const LIFT = 5.5;
/** Tip down, so the chase camera sees its top. */
const PITCH = 0.35;

/** A chevron in the XY plane pointing +y, about 5 units long. */
function chevron(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 2.6);
  s.lineTo(2.4, -0.4);
  s.lineTo(1.2, -0.4);
  s.lineTo(0, 1.1);
  s.lineTo(-1.2, -0.4);
  s.lineTo(-2.4, -0.4);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false });
  g.translate(0, -1.1, -0.4);
  // Flat on the road, tip toward -z.
  g.rotateX(-Math.PI / 2);
  return g;
}

export default function RouteArrow({
  car,
  telemetryRef,
  onArrive,
}: {
  car: React.MutableRefObject<CarApi | null>;
  telemetryRef: React.MutableRefObject<DriveTelemetry>;
  onArrive: (login: string) => void;
}) {
  const yaw = useRef<THREE.Group>(null);
  const geometry = useMemo(() => chevron(), []);
  const aim = useRef<number | null>(null);

  useFrame((_, dt) => {
    const g = yaw.current;
    const c = car.current;
    const route = telemetryRef.current.route;
    if (!g) return;
    g.visible = !!route && !!c;
    if (!route || !c) {
      aim.current = null;
      return;
    }
    const p = c.group.position;
    const dx = route.x - p.x;
    const dz = route.z - p.z;
    if (Math.hypot(dx, dz) < route.reach) {
      telemetryRef.current.route = null;
      onArrive(route.login);
      return;
    }
    // Shortest way round to the new heading, eased.
    const want = Math.atan2(-dx, -dz);
    if (aim.current === null) aim.current = want;
    const diff = Math.atan2(Math.sin(want - aim.current), Math.cos(want - aim.current));
    aim.current += diff * Math.min(1, dt * 10);
    g.position.set(p.x, p.y + LIFT + Math.sin(performance.now() / 260) * 0.3, p.z);
    g.rotation.y = aim.current;
  });

  return (
    <group ref={yaw} visible={false}>
      <group rotation={[-PITCH, 0, 0]}>
        <mesh geometry={geometry}>
          <meshBasicMaterial attach="material-0" color={LIME} toneMapped={false} />
          <meshBasicMaterial attach="material-1" color={LIME_DARK} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
