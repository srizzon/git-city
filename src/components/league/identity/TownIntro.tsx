"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { IntroPath } from "@/lib/league-city/intro";

// Plays the town intro: each phase is a pair of CatmullRom curves (camera and
// look target, the home city's IntroFlyover pattern) at constant speed, with
// its own easing and an optional hold. It ends on the scene's camera frame,
// where the orbit controls take over.

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();

const EASE = {
  out: (t: number) => 1 - (1 - t) ** 3,
  inout: (t: number) => t * t * (3 - 2 * t),
};

export default function TownIntro({ path, onEnd }: { path: IntroPath; onEnd: () => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const elapsed = useRef(0);
  const ended = useRef(false);

  const phases = useMemo(
    () =>
      path.phases.map((ph) => {
        const pos = new THREE.CatmullRomCurve3(ph.pos.map((p) => new THREE.Vector3(...p)), false, "centripetal");
        const look = new THREE.CatmullRomCurve3(ph.look.map((p) => new THREE.Vector3(...p)), false, "centripetal");
        pos.getLength();
        look.getLength();
        return { pos, look, duration: ph.duration, hold: ph.hold ?? 0, ease: EASE[ph.ease] };
      }),
    [path],
  );

  /** Camera and target at `s` seconds into the intro. Returns false past the end. */
  const sample = (s: number): boolean => {
    let rest = s;
    for (const ph of phases) {
      if (rest <= ph.duration + ph.hold) {
        const t = ph.ease(Math.min(1, rest / ph.duration));
        ph.pos.getPointAt(t, _pos);
        ph.look.getPointAt(t, _look);
        return true;
      }
      rest -= ph.duration + ph.hold;
    }
    const last = phases[phases.length - 1];
    last.pos.getPointAt(1, _pos);
    last.look.getPointAt(1, _look);
    return false;
  };

  useEffect(() => {
    sample(0);
    camera.position.copy(_pos);
    camera.lookAt(_look);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, phases]);

  // Skipped: hand the controls the current view.
  useEffect(
    () => () => {
      if (ended.current || !controls) return;
      controls.target.copy(_look);
      controls.update();
    },
    [controls],
  );

  useFrame((_, delta) => {
    if (ended.current) return;
    elapsed.current += Math.min(delta, 0.05);
    const running = sample(elapsed.current);
    camera.position.copy(_pos);
    camera.lookAt(_look);
    if (running) return;
    ended.current = true;
    if (controls) {
      controls.target.copy(_look);
      controls.update();
    }
    onEnd();
  });

  return null;
}
