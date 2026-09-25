"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import CarModel from "@/components/league/drive/CarModel";
import { WHEEL, M_TO_UNIT } from "@/lib/league-city/drive/tuning";
import { WHEELS } from "@/lib/league-city/drive/vehicle";
import { carAt, type CarIntro } from "@/lib/league-city/intro";

type Vec3 = [number, number, number];

// Plays the town intro (lib/league-city/intro): a car drives in from far out
// on the approach with the chase camera behind it; just past the arch the
// camera lifts on a curve to the scene's frame while the car brakes to a stop,
// and the orbit controls take over.

/** Chase view, city units (drive mode's chase: 7 m back, 2.8 m up). */
const BACK = 18;
const UP = 8;
const AHEAD = 14;

const _want = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);

const smooth = (u: number) => u * u * (3 - 2 * u);

/** Chase camera behind a car heading north (−z) at (x, z). Portrait screens sit further back. */
function chase(x: number, z: number, pos: THREE.Vector3, look: THREE.Vector3, far = 1) {
  pos.set(x, UP * far, z + BACK * far);
  look.set(x, 4, z - AHEAD);
}

export default function TownIntro({
  intro,
  end,
  color,
  ceiling,
  onEnd,
  onTick,
}: {
  intro: CarIntro;
  end: { pos: Vec3; look: Vec3 };
  color: string;
  /** Height that clears every building: the camera goes up to it before swinging out. */
  ceiling: number;
  onEnd: () => void;
  /** Seconds into the intro, every frame (the title follows this clock). */
  onTick?: (t: number) => void;
}) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const far = aspect < 1 ? 1.6 : 1;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const car = useRef<THREE.Group>(null);
  const wheelRefs = useRef<(THREE.Object3D | null)[]>([]);
  const state = useRef({ t: 0, ended: false, spin: 0 });
  const cam = useRef({ look: new THREE.Vector3(), fromPos: new THREE.Vector3(), fromLook: new THREE.Vector3() });
  const endPos = useMemo(() => new THREE.Vector3(...end.pos), [end]);
  const endLook = useMemo(() => new THREE.Vector3(...end.look), [end]);

  useEffect(() => {
    chase(intro.x, intro.startZ, _want, _look, far);
    camera.position.copy(_want);
    camera.lookAt(_look);
    cam.current.look.copy(_look);
    // The camera lets go of the car here.
    chase(intro.x, intro.switchZ, cam.current.fromPos, cam.current.fromLook, far);
  }, [camera, intro, far]);

  // Skipped: cut straight to the city frame, as games do.
  useEffect(
    () => () => {
      if (state.current.ended) return;
      camera.position.copy(endPos);
      camera.lookAt(endLook);
      if (controls) {
        controls.target.copy(endLook);
        controls.update();
      }
    },
    [camera, controls, endPos, endLook],
  );

  useFrame((_, delta) => {
    const st = state.current;
    if (st.ended) return;
    const dt = Math.min(delta, 0.05);
    st.t += dt;
    onTick?.(st.t);
    const { z, speed } = carAt(intro, st.t);

    // The car, heading north; wheels roll with its speed.
    const g = car.current;
    if (g) {
      g.position.set(intro.x, 0, z);
      g.rotation.set(0, Math.PI, 0);
      st.spin += (speed * dt) / (WHEEL.radius * M_TO_UNIT);
      WHEELS.forEach((w, i) => {
        const obj = wheelRefs.current[i];
        if (!obj) return;
        obj.position.set(w.x * M_TO_UNIT, (WHEEL.connectionY - WHEEL.restLength) * M_TO_UNIT, w.z * M_TO_UNIT);
        _q.setFromAxisAngle(_axisY, w.x < 0 ? Math.PI : 0);
        _spin.setFromAxisAngle(_axisX, st.spin * (w.x < 0 ? -1 : 1));
        obj.quaternion.copy(_q).multiply(_spin);
      });
    }

    const c = cam.current;
    if (st.t <= intro.cruise) {
      chase(intro.x, z, _want, c.look, far);
      camera.position.copy(_want);
      camera.lookAt(c.look);
      return;
    }

    // Straight up, clear of every roof, then out to the frame (cubic Bézier
    // whose first handle is right above where the camera let go).
    const u = Math.min(1, (st.t - intro.cruise) / intro.rise);
    const e = smooth(u);
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
