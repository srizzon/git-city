"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { IntroPath } from "@/lib/league-city/intro";

// Plays the town intro path: CatmullRom curves for the camera and its look
// target (the home city's IntroFlyover pattern), at constant speed along the
// path, eased in and out. It ends on the scene's camera frame, where the
// orbit controls take over.

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();

/** Smoothstep: slow start, slow landing. */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

export default function TownIntro({ path, onEnd }: { path: IntroPath; onEnd: () => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const elapsed = useRef(0);
  const ended = useRef(false);

  const curves = useMemo(() => {
    const pos = new THREE.CatmullRomCurve3(path.pos.map((p) => new THREE.Vector3(...p)), false, "centripetal");
    const look = new THREE.CatmullRomCurve3(path.look.map((p) => new THREE.Vector3(...p)), false, "centripetal");
    pos.getLength();
    look.getLength();
    return { pos, look };
  }, [path]);

  useEffect(() => {
    curves.pos.getPointAt(0, _pos);
    curves.look.getPointAt(0, _look);
    camera.position.copy(_pos);
    camera.lookAt(_look);
  }, [camera, curves]);

  const finish = () => {
    if (ended.current) return;
    ended.current = true;
    curves.look.getPointAt(1, _look);
    if (controls) {
      controls.target.copy(_look);
      controls.update();
    }
    onEnd();
  };

  // Unmounted early (skipped): hand the controls the current view.
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
    const t = ease(Math.min(elapsed.current / path.duration, 1));
    curves.pos.getPointAt(t, _pos);
    curves.look.getPointAt(t, _look);
    camera.position.copy(_pos);
    camera.lookAt(_look);
    if (elapsed.current >= path.duration) finish();
  });

  return null;
}
