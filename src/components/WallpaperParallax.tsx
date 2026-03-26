"use client";

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";

interface Props {
  controlsRef: React.RefObject<any>;
  baseTarget: [number, number, number];
}

export default function WallpaperParallax({ controlsRef, baseTarget }: Props) {
  const mouse = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, z: 0 });

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, []);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const RANGE = 25;
    const EASE = 0.03;

    const targetX = mouse.current.x * RANGE;
    const targetZ = mouse.current.y * RANGE;

    current.current.x += (targetX - current.current.x) * EASE;
    current.current.z += (targetZ - current.current.z) * EASE;

    controls.target.x = baseTarget[0] + current.current.x;
    controls.target.z = baseTarget[2] + current.current.z;
  });

  return null;
}