"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CuboidCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from "@react-three/rapier";
import { Howl, Howler } from "howler";
import * as THREE from "three";
import { FLAG_BOOST, FLAG_BRAKE, FLAG_HORN, INTERP_MS, emptySnapshot, type CarSnapshot } from "@/lib/league-city/drive/net";
import { startHorn } from "@/lib/league-city/drive/horn";
import { CHASSIS, M_TO_UNIT, STEER, WHEEL } from "@/lib/league-city/drive/tuning";
import { WHEELS } from "@/lib/league-city/drive/vehicle";
import type { CarApi } from "./Car";
import CarModel from "./CarModel";
import Lights from "./Lights";
import type { FxSource, FxSources } from "./fx";
import type { CarFeed } from "./useDrivePresence";

// Everyone else driving in this city. Each car follows its snapshots
// (INTERP_MS behind real time) as a dynamic body with the same mass as yours,
// steered toward where the network says it is. A crash is a real equal-mass
// hit on your side; the other driver gets pushed on theirs by a bump message
// (see DriveWorld). Plus a name tag in their color, lights, tire marks, smoke
// and sound that fades with distance.

const BASE = "/sounds/drive";

/** 1 up close, 0 past ~375 city units (150 m). */
function falloff(d: number): number {
  const k = Math.min(1, Math.max(0, 1 - (d - 25) / 350));
  return k * k;
}

/** How hard the body chases its network pose (1/s), and past what error (m) it just jumps there. */
const FOLLOW = 10;
const TURN_FOLLOW = 12;
const SNAP_DIST = 6;

const [HX, HY, HZ] = CHASSIS.half;
const M12 = CHASSIS.mass / 12;
const MASS = {
  mass: CHASSIS.mass,
  centerOfMass: { x: 0, y: CHASSIS.comY - CHASSIS.colliderY, z: 0 },
  principalAngularInertia: { x: M12 * (4 * HY * HY + 4 * HZ * HZ), y: M12 * (4 * HX * HX + 4 * HZ * HZ), z: M12 * (4 * HX * HX + 4 * HY * HY) },
  angularInertiaLocalFrame: { x: 0, y: 0, z: 0, w: 1 },
};

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
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
  remote: CarFeed;
  sources: FxSources;
  localCar: React.MutableRefObject<CarApi | null>;
  muted: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const anchor = useRef<THREE.Object3D>(null);
  const target = useRef<CarSnapshot>(emptySnapshot());
  const before = useRef<CarSnapshot>(emptySnapshot());
  const placed = useRef(false);
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

  // Each physics step: velocity toward the network pose, so contacts in
  // between are real equal-mass hits and it settles back on track after.
  useBeforePhysicsStep(() => {
    const b = body.current;
    const now = performance.now() - INTERP_MS;
    const t = remote.buffer.sample(now, target.current);
    const p0 = remote.buffer.sample(now - 50, before.current);
    if (b && (!t || !p0) && placed.current) {
      // Gone (a bot that drove out of town): park the body out of reach.
      placed.current = false;
      b.setTranslation({ x: 0, y: -50, z: 0 }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    if (!b || !t || !p0) return;
    const pos = b.translation();
    const ex = t.x - pos.x;
    const ey = t.y - pos.y;
    const ez = t.z - pos.z;
    if (!placed.current || Math.hypot(ex, ey, ez) > SNAP_DIST) {
      placed.current = true;
      b.setTranslation({ x: t.x, y: t.y, z: t.z }, true);
      b.setRotation({ x: t.qx, y: t.qy, z: t.qz, w: t.qw }, true);
      b.setLinvel({ x: (t.x - p0.x) / 0.05, y: 0, z: (t.z - p0.z) / 0.05 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    b.setLinvel(
      { x: (t.x - p0.x) / 0.05 + ex * FOLLOW, y: (t.y - p0.y) / 0.05 + ey * FOLLOW, z: (t.z - p0.z) / 0.05 + ez * FOLLOW },
      true,
    );
    // Rotation error as an axis-angle, the short way round.
    const r = b.rotation();
    _qa.set(t.qx, t.qy, t.qz, t.qw).multiply(_qb.set(r.x, r.y, r.z, r.w).invert());
    if (_qa.w < 0) _qa.set(-_qa.x, -_qa.y, -_qa.z, -_qa.w);
    const angle = 2 * Math.acos(Math.min(1, _qa.w));
    const sin = Math.sqrt(Math.max(1e-9, 1 - _qa.w * _qa.w));
    const k = (angle * TURN_FOLLOW) / sin;
    b.setAngvel({ x: _qa.x * k, y: _qa.y * k, z: _qa.z * k }, true);
  });

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const s = remote.buffer.sample(performance.now() - INTERP_MS, snap.current);
    // The body's own (interpolated) group, meters.
    const src = anchor.current?.parent;
    g.visible = !!s && placed.current;
    if (!s || !src) return;

    g.position.copy(src.position).multiplyScalar(M_TO_UNIT);
    g.quaternion.copy(src.quaternion);
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

  return (
    <>
      <RigidBody
        ref={body}
        type="dynamic"
        colliders={false}
        gravityScale={0}
        canSleep={false}
        ccd
        position={[0, -50, 0]}
        userData={{ remoteCar: remote.id }}
      >
        <object3D ref={anchor} />
        <CuboidCollider args={CHASSIS.half} position={[0, CHASSIS.colliderY, 0]} friction={0.3} massProperties={MASS} />
      </RigidBody>
      <group ref={group} visible={false}>
        <CarModel color={remote.color} wheelRefs={wheelRefs}>
          <Lights spots={false} braking={() => (flags.current & FLAG_BRAKE) !== 0} />
        </CarModel>
        <Html position={[0, 7.5, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="flex items-center gap-1.5 whitespace-nowrap border-2 border-border bg-bg/80 px-1.5 py-0.5 font-pixel text-[9px] uppercase text-cream">
            <span className="h-2 w-2" style={{ background: remote.color }} aria-hidden />
            {remote.bot ? "bot" : remote.name.startsWith("guest-") ? "guest" : `@${remote.name}`}
          </div>
        </Html>
      </group>
    </>
  );
}

/** Everyone else in the car, and the town's bots: bodies you can hit, back on course after. */
export default function RemoteCars({
  cars,
  sources,
  localCar,
  muted,
}: {
  cars: CarFeed[];
  sources: FxSources;
  localCar: React.MutableRefObject<CarApi | null>;
  muted: boolean;
}) {
  return (
    <>
      {cars.map((c) => (
        <RemoteCar key={c.id} remote={c} sources={sources} localCar={localCar} muted={muted} />
      ))}
    </>
  );
}
