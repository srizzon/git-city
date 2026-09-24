"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { Howl, Howler } from "howler";
import * as THREE from "three";
import { FLAG_BOOST, FLAG_BRAKE, FLAG_HORN, INTERP_MS, emptySnapshot, type DriverInfo } from "@/lib/league-city/drive/net";
import { startHorn } from "@/lib/league-city/drive/horn";
import { CHASSIS, M_TO_UNIT, STEER, WHEEL } from "@/lib/league-city/drive/tuning";
import { WHEELS } from "@/lib/league-city/drive/vehicle";
import type { CarApi } from "./Car";
import CarModel from "./CarModel";
import Lights from "./Lights";
import type { FxSource, FxSources } from "./fx";
import type { RemoteDriver } from "./useDrivePresence";

// Everyone else driving in this city. Each car is drawn INTERP_MS behind
// real time between two snapshots, carries a kinematic collider (you bump
// into it, it doesn't bump back: each player sees their own car react), a
// name tag in their color, lights, tire marks and smoke, and sound that fades
// with distance.

const BASE = "/sounds/drive";

/** 1 up close, 0 past ~375 city units (150 m). */
function falloff(d: number): number {
  const k = Math.min(1, Math.max(0, 1 - (d - 25) / 350));
  return k * k;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _spin = new THREE.Quaternion();

function RemoteCar({
  remote,
  sources,
  localCar,
  muted,
}: {
  remote: RemoteDriver;
  sources: FxSources;
  localCar: React.MutableRefObject<CarApi | null>;
  muted: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const wheelRefs = useRef<(THREE.Object3D | null)[]>([]);
  const snap = useRef(emptySnapshot());
  const spin = useRef(0);
  const flags = useRef(0);
  const fx = useRef<FxSource | null>(null);
  const audio = useRef<{ engine: Howl; skid: Howl; gain: GainNode | null; horn: (() => void) | null } | null>(null);
  const silent = useRef(muted);
  silent.current = muted;

  // Tire marks, smoke and boost trail come from the shared effect pools.
  useEffect(() => {
    const key = `r:${remote.id}`;
    const map = sources.current;
    return () => {
      map.delete(key);
    };
  }, [remote.id, sources]);

  useEffect(() => {
    const engine = new Howl({ src: [`${BASE}/engine.ogg`], loop: true, volume: 0 });
    const skid = new Howl({ src: [`${BASE}/skid.ogg`], loop: true, volume: 0 });
    engine.play();
    skid.play();
    let gain: GainNode | null = null;
    if (Howler.ctx && Howler.masterGain) {
      gain = Howler.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(Howler.masterGain);
    }
    audio.current = { engine, skid, gain, horn: null };
    return () => {
      audio.current?.horn?.();
      engine.unload();
      skid.unload();
      gain?.disconnect();
      audio.current = null;
    };
  }, []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const s = remote.buffer.sample(performance.now() - INTERP_MS, snap.current);
    g.visible = !!s;
    if (!s) return;

    g.position.set(s.x * M_TO_UNIT, s.y * M_TO_UNIT, s.z * M_TO_UNIT);
    g.quaternion.set(s.qx, s.qy, s.qz, s.qw);
    const b = body.current;
    if (b) {
      b.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
      b.setNextKinematicRotation({ x: s.qx, y: s.qy, z: s.qz, w: s.qw });
    }
    flags.current = s.flags;

    // Wheels: steer from the snapshot, spin from speed, suspension at rest.
    spin.current += (s.speed / WHEEL.radius) * dt;
    WHEELS.forEach((w, i) => {
      const obj = wheelRefs.current[i];
      if (!obj) return;
      obj.position.set(w.x * M_TO_UNIT, (WHEEL.connectionY - WHEEL.restLength * 0.8) * M_TO_UNIT, w.z * M_TO_UNIT);
      _q.setFromAxisAngle(_axisY, (w.front ? s.steer : 0) + (w.x < 0 ? Math.PI : 0));
      _spin.setFromAxisAngle(_axisX, spin.current * (w.x < 0 ? -1 : 1));
      obj.quaternion.copy(_q).multiply(_spin);
    });

    const rear = [wheelRefs.current[2], wheelRefs.current[3]].filter((o): o is THREE.Object3D => !!o);
    fx.current ??= { group: g, rearWheels: rear, slip: 0, boosting: false, grounded: true };
    fx.current.rearWheels = rear;
    fx.current.slip = s.slip;
    fx.current.boosting = (s.flags & FLAG_BOOST) !== 0;
    fx.current.grounded = s.y < 1.2;
    sources.current.set(`r:${remote.id}`, fx.current);

    // Sound: louder the closer it is to your car.
    const a = audio.current;
    if (!a) return;
    const me = localCar.current?.group;
    const near = me ? falloff(me.getWorldPosition(_p).distanceTo(g.position)) : 0;
    const vol = silent.current ? 0 : near;
    const speedT = Math.min(1.4, Math.abs(s.speed) / STEER.topSpeed);
    a.engine.volume(vol * 0.3);
    a.engine.rate(0.7 + speedT * 1.1 + ((s.flags & FLAG_BOOST) !== 0 ? 0.25 : 0));
    a.skid.volume(vol * Math.min(0.6, s.slip * 0.7));
    if (a.gain) a.gain.gain.value = vol;
    const horn = (s.flags & FLAG_HORN) !== 0 && vol > 0;
    if (horn && !a.horn && Howler.ctx && a.gain) a.horn = startHorn(Howler.ctx, a.gain);
    else if (!horn && a.horn) {
      a.horn();
      a.horn = null;
    }
  });

  const [hx, hy, hz] = CHASSIS.half;
  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} userData={{ remoteCar: remote.id }}>
        <CuboidCollider args={[hx, hy, hz]} position={[0, CHASSIS.colliderY, 0]} friction={0.3} />
      </RigidBody>
      <group ref={group} visible={false}>
        <CarModel color={remote.color} wheelRefs={wheelRefs}>
          <Lights spots={false} braking={() => (flags.current & FLAG_BRAKE) !== 0} />
        </CarModel>
        <Html position={[0, 7.5, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="flex items-center gap-1.5 whitespace-nowrap border-2 border-border bg-bg/80 px-1.5 py-0.5 font-pixel text-[9px] uppercase text-cream">
            <span className="h-2 w-2" style={{ background: remote.color }} aria-hidden />
            {remote.name.startsWith("guest-") ? "guest" : `@${remote.name}`}
          </div>
        </Html>
      </group>
    </>
  );
}

export default function RemoteCars({
  remotes,
  drivers,
  sources,
  localCar,
  muted,
}: {
  remotes: React.MutableRefObject<Map<string, RemoteDriver>>;
  drivers: DriverInfo[];
  sources: FxSources;
  localCar: React.MutableRefObject<CarApi | null>;
  muted: boolean;
}) {
  return (
    <>
      {drivers.map((d) => {
        const r = remotes.current.get(d.id);
        return r ? <RemoteCar key={d.id} remote={r} sources={sources} localCar={localCar} muted={muted} /> : null;
      })}
    </>
  );
}
