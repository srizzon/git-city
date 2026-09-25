"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { CarApi } from "./Car";
import type { FxSource, FxSources } from "./fx";
import { useDriveAudio } from "./useDriveAudio";
import type { useDriveInput } from "./useDriveInput";

// Pieces every drive world uses (the town's and the race track's): the camera
// key, your car as an effects source, and its sound.

export function CameraKey({ input, onToggle }: { input: ReturnType<typeof useDriveInput>; onToggle: () => void }) {
  useFrame(() => {
    if (input.current.pressed.camera) onToggle();
  });
  return null;
}

/** Your car as an effects source (tire marks, smoke, boost trail). */
export function LocalFx({ car, sources }: { car: React.MutableRefObject<CarApi | null>; sources: FxSources }) {
  const entry = useRef<FxSource | null>(null);
  useFrame(() => {
    const c = car.current;
    if (!c) return;
    entry.current ??= { group: c.group, rearWheels: [], slip: 0, boosting: false, grounded: true };
    const e = entry.current;
    e.group = c.group;
    e.rearWheels = c.wheels.slice(2, 4);
    e.slip = c.state.slip;
    e.boosting = c.state.boosting;
    e.grounded = c.controller.wheelIsInContact(2) || c.controller.wheelIsInContact(3);
    sources.current.set("local", e);
  });
  return null;
}

export function DriveAudio(props: Parameters<typeof useDriveAudio>[0]) {
  useDriveAudio(props);
  return null;
}
