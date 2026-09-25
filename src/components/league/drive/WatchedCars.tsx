"use client";

import { Suspense, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { FLAG_BRAKE, FLAG_HORN, WATCH_INTERP_MS, emptySnapshot, type DriverInfo } from "@/lib/league-city/drive/net";
import { M_TO_UNIT, WHEEL } from "@/lib/league-city/drive/tuning";
import { WHEELS } from "@/lib/league-city/drive/vehicle";
import CarModel from "./CarModel";
import Lights from "./Lights";
import type { RemoteDriver } from "./useDrivePresence";

// Other people's cars for someone who's only looking at the city: the same
// car, name plate and brake lights as in drive mode, placed straight from the
// network snapshots (no physics, no sound). The plate flashes on a honk.

const _q = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);

function WatchedCar({ remote }: { remote: RemoteDriver }) {
  const group = useRef<THREE.Group>(null);
  const wheelRefs = useRef<(THREE.Object3D | null)[]>([]);
  const plate = useRef<HTMLDivElement>(null);
  const snap = useRef(emptySnapshot());
  const spin = useRef(0);
  const flags = useRef(0);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const s = remote.buffer.sample(performance.now() - WATCH_INTERP_MS, snap.current);
    g.visible = !!s;
    if (!s) return;
    g.position.set(s.x * M_TO_UNIT, s.y * M_TO_UNIT, s.z * M_TO_UNIT);
    g.quaternion.set(s.qx, s.qy, s.qz, s.qw);
    flags.current = s.flags;

    spin.current += (s.speed / WHEEL.radius) * dt;
    WHEELS.forEach((w, i) => {
      const obj = wheelRefs.current[i];
      if (!obj) return;
      obj.position.set(w.x * M_TO_UNIT, (WHEEL.connectionY - WHEEL.restLength * 0.8) * M_TO_UNIT, w.z * M_TO_UNIT);
      _q.setFromAxisAngle(_axisY, (w.front ? s.steer : 0) + (w.x < 0 ? Math.PI : 0));
      _spin.setFromAxisAngle(_axisX, spin.current * (w.x < 0 ? -1 : 1));
      obj.quaternion.copy(_q).multiply(_spin);
    });

    const honk = (s.flags & FLAG_HORN) !== 0;
    if (plate.current) plate.current.style.borderColor = honk ? remote.color : "";
  });

  return (
    <group ref={group} visible={false}>
      <CarModel color={remote.color} wheelRefs={wheelRefs}>
        <Lights spots={false} braking={() => (flags.current & FLAG_BRAKE) !== 0} />
      </CarModel>
      <Html position={[0, 7.5, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div
          ref={plate}
          className="flex items-center gap-1.5 whitespace-nowrap border-2 border-border bg-bg/80 px-1.5 py-0.5 font-pixel text-[9px] uppercase text-cream"
        >
          <span className="h-2 w-2" style={{ background: remote.color }} aria-hidden />
          {remote.name.startsWith("guest-") ? "guest" : `@${remote.name}`}
        </div>
      </Html>
    </group>
  );
}

export default function WatchedCars({
  remotes,
  drivers,
}: {
  remotes: React.MutableRefObject<Map<string, RemoteDriver>>;
  drivers: DriverInfo[];
}) {
  if (drivers.length === 0) return null;
  return (
    <Suspense fallback={null}>
      {drivers.map((d) => {
        const r = remotes.current.get(d.id);
        return r ? <WatchedCar key={d.id} remote={r} /> : null;
      })}
    </Suspense>
  );
}
