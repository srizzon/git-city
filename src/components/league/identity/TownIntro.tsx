"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import CarModel from "@/components/league/drive/CarModel";
import { WHEEL, M_TO_UNIT } from "@/lib/league-city/drive/tuning";
import { WHEELS } from "@/lib/league-city/drive/vehicle";
import { INTRO_TIMING, driveProgress, type CarRoute, type Vec3 } from "@/lib/league-city/intro";

// Plays the town intro (lib/league-city/intro): a car drives the route with
// the chase camera behind it, parks, then the camera glides up on a curve to
// the scene's frame, where the orbit controls take over.

/** Chase view, city units (drive mode's chase: 7 m back, 2.8 m up). */
const BACK = 18;
const UP = 8;
const AHEAD = 14;

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _want = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);

const smooth = (u: number) => u * u * (3 - 2 * u);

export default function TownIntro({
  route,
  end,
  color,
  ceiling,
  onEnd,
}: {
  route: CarRoute;
  end: { pos: Vec3; look: Vec3 };
  color: string;
  /** Height that clears every building: the camera goes up to it before swinging out. */
  ceiling: number;
  onEnd: () => void;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const car = useRef<THREE.Group>(null);
  const wheelRefs = useRef<(THREE.Object3D | null)[]>([]);
  const state = useRef({ t: 0, ended: false, spin: 0, yaw: 0, steer: 0, ready: false });
  const cam = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), fromPos: new THREE.Vector3(), fromLook: new THREE.Vector3(), frozen: false });

  const curve = useMemo(() => {
    const c = new THREE.CatmullRomCurve3(route.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
    c.getLength();
    return c;
  }, [route]);
  const length = useMemo(() => curve.getLength(), [curve]);
  const endPos = useMemo(() => new THREE.Vector3(...end.pos), [end]);
  const endLook = useMemo(() => new THREE.Vector3(...end.look), [end]);

  /** Poses the car at route share s; returns its forward direction in _t. */
  const pose = (s: number) => {
    curve.getPointAt(s, _p);
    curve.getTangentAt(s, _t);
    _t.y = 0;
    _t.normalize();
  };

  const chase = (out: THREE.Vector3, look: THREE.Vector3) => {
    out.copy(_p).addScaledVector(_t, -BACK);
    out.y = UP;
    look.copy(_p).addScaledVector(_t, AHEAD);
    look.y = 4;
  };

  useEffect(() => {
    pose(0);
    chase(cam.current.pos, cam.current.look);
    camera.position.copy(cam.current.pos);
    camera.lookAt(cam.current.look);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, curve]);

  // Skipped: hand the controls whatever the camera looks at now.
  useEffect(
    () => () => {
      if (state.current.ended || !controls) return;
      controls.target.copy(cam.current.look);
      controls.update();
    },
    [controls],
  );

  useFrame((_, delta) => {
    const st = state.current;
    if (st.ended) return;
    const dt = Math.min(delta, 0.05);
    const prevS = driveProgress(st.t / route.duration);
    st.t += dt;
    const { hold, rise } = INTRO_TIMING;
    const driveEnd = route.duration;
    const s = driveProgress(st.t / driveEnd);

    // The car.
    pose(s);
    const g = car.current;
    if (g) {
      g.position.copy(_p);
      const yaw = Math.atan2(_t.x, _t.z);
      if (!st.ready) {
        st.yaw = yaw;
        st.ready = true;
      }
      let dyaw = yaw - st.yaw;
      if (dyaw > Math.PI) dyaw -= 2 * Math.PI;
      if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      st.yaw = yaw;
      g.rotation.set(0, yaw, 0);
      const speed = ((s - prevS) * length) / dt;
      st.spin += (speed * dt) / (WHEEL.radius * M_TO_UNIT);
      const steerWant = THREE.MathUtils.clamp((dyaw / dt) * 0.35, -0.5, 0.5);
      st.steer += (steerWant - st.steer) * Math.min(1, dt * 8);
      WHEELS.forEach((w, i) => {
        const obj = wheelRefs.current[i];
        if (!obj) return;
        obj.position.set(w.x * M_TO_UNIT, (WHEEL.connectionY - WHEEL.restLength) * M_TO_UNIT, w.z * M_TO_UNIT);
        _q.setFromAxisAngle(_axisY, (w.front ? st.steer : 0) + (w.x < 0 ? Math.PI : 0));
        _spin.setFromAxisAngle(_axisX, st.spin * (w.x < 0 ? -1 : 1));
        obj.quaternion.copy(_q).multiply(_spin);
      });
    }

    // The camera: chase while driving and parked, then the rise.
    const c = cam.current;
    if (st.t < driveEnd + hold) {
      chase(_want, _look);
      const k = 1 - Math.exp(-4 * dt);
      c.pos.lerp(_want, k);
      c.look.lerp(_look, Math.min(1, k * 1.5));
      camera.position.copy(c.pos);
      camera.lookAt(c.look);
      return;
    }
    if (!c.frozen) {
      c.fromPos.copy(c.pos);
      c.fromLook.copy(c.look);
      c.frozen = true;
    }
    const u = Math.min(1, (st.t - driveEnd - hold) / rise);
    const e = smooth(u);
    // Straight up over the parked car, clear of every roof, then out to the
    // frame (cubic Bézier: the first handle is right above the start).
    const up = Math.max(ceiling, endPos.y);
    const i = 1 - e;
    const w0 = i * i * i;
    const w1 = 3 * i * i * e;
    const w2 = 3 * i * e * e;
    const w3 = e * e * e;
    camera.position.set(
      w0 * c.fromPos.x + w1 * c.fromPos.x + w2 * endPos.x + w3 * endPos.x,
      w0 * c.fromPos.y + w1 * up + w2 * up + w3 * endPos.y,
      w0 * c.fromPos.z + w1 * c.fromPos.z + w2 * endPos.z + w3 * endPos.z,
    );
    c.look.lerpVectors(c.fromLook, endLook, e);
    camera.lookAt(c.look);
    if (u < 1) return;
    st.ended = true;
    if (controls) {
      controls.target.copy(endLook);
      controls.update();
    }
    onEnd();
  });

  return (
    <group ref={car}>
      <Suspense fallback={null}>
        <CarModel color={color} wheelRefs={wheelRefs} />
      </Suspense>
    </group>
  );
}
