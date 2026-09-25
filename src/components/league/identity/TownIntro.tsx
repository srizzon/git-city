"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { IntroPath } from "@/lib/league-city/intro";

// Plays the town intro path: CatmullRom curves for the camera and its look
// target (the home city's IntroFlyover pattern). Each waypoint gets the same
// time (getPoint, not arc length), so the short low pass through the portal
// isn't rushed by the long descent. On the last frame the orbit controls take
// over looking where it ended.

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();

/** Gentle in and out, near-linear in the middle. */
function ease(t: number): number {
  return t * t * (3 - 2 * t) * 0.5 + t * 0.5;
}

export default function TownIntro({ path, onEnd }: { path: IntroPath; onEnd: () => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const elapsed = useRef(0);
  const ended = useRef(false);

  const curves = useMemo(() => {
    const pos = new THREE.CatmullRomCurve3(path.pos.map((p) => new THREE.Vector3(...p)), false, "centripetal");
    const look = new THREE.CatmullRomCurve3(path.look.map((p) => new THREE.Vector3(...p)), false, "centripetal");
    return { pos, look };
  }, [path]);

  useEffect(() => {
    curves.pos.getPoint(0, _pos);
    curves.look.getPoint(0, _look);
    camera.position.copy(_pos);
    camera.lookAt(_look);
  }, [camera, curves]);

  const finish = () => {
    if (ended.current) return;
    ended.current = true;
    curves.look.getPoint(1, _look);
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
    curves.pos.getPoint(t, _pos);
    curves.look.getPoint(t, _look);
    camera.position.copy(_pos);
    camera.lookAt(_look);
    if (elapsed.current >= path.duration) finish();
  });

  return null;
}
