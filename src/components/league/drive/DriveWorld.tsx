"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import {
  ConvexHullCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import { Fountain, ParkBench, StreetLamp } from "@/components/city/decorations";
import type { CityBuilding } from "@/lib/github";
import type { CityObject } from "@/lib/league-city/types";
import { buildColliders, colliderKey, type ColliderSpec } from "@/lib/league-city/drive/colliders";
import { spawnPoint } from "@/lib/league-city/drive/spawn";
import type { DriveCameraMode, DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { GRAVITY, M_TO_UNIT, RESPAWN } from "@/lib/league-city/drive/tuning";
import Car, { type CarApi } from "./Car";
import DriveCamera from "./DriveCamera";
import { useDriveInput } from "./useDriveInput";

// Drive mode's physics world. Loaded with next/dynamic only when someone
// presses Drive, so the Rapier WASM never reaches viewers or editors.
// Fixed shapes (buildings, trees, ramps, walls, ground) share one body and
// are keyed by shape, so a city change only swaps what changed.

export interface DriveWorldProps {
  objects: CityObject[];
  buildings: CityBuilding[];
  size: number;
  viewerDevId: number | null;
  telemetry: DriveTelemetry;
  camera: DriveCameraMode;
  onCameraToggle: () => void;
  muted: boolean;
  /** Rapier and the car are loaded. */
  onReady: () => void;
  /** Rapier or the models failed to load. */
  onFail: () => void;
}

class Boundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error("[drive]", err);
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

function SpecCollider({ spec }: { spec: ColliderSpec }) {
  const { shape, pos, rotY } = spec;
  const rotation: [number, number, number] = [0, rotY, 0];
  if (shape.type === "cuboid") return <CuboidCollider args={shape.half} position={pos} rotation={rotation} friction={0.6} />;
  if (shape.type === "cylinder")
    return <CylinderCollider args={[shape.halfHeight, shape.radius]} position={pos} rotation={rotation} friction={0.6} />;
  return <ConvexHullCollider args={[shape.points]} position={pos} friction={0.8} />;
}

// ─── Knock-over props ────────────────────────────────────────

/** Visual base offset (city units) under each prop's collider center. */
function PropVisual({ spec }: { spec: ColliderSpec }) {
  const drop = -spec.pos[1] * M_TO_UNIT;
  if (spec.prop === "lamp") return <StreetLamp position={[0, drop, 0]} />;
  if (spec.prop === "bench") return <ParkBench position={[0, drop, 0]} rotation={0} />;
  return <Fountain position={[0, drop, 0]} />;
}

function DynamicProp({ spec }: { spec: ColliderSpec }) {
  const body = useRef<RapierRigidBody>(null);
  const anchor = useRef<THREE.Object3D>(null);
  const visual = useRef<THREE.Group>(null);
  const hitAt = useRef(0);
  const home = useMemo(
    () => ({ t: { x: spec.pos[0], y: spec.pos[1], z: spec.pos[2] }, q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spec.rotY) }),
    [spec],
  );

  useFrame(() => {
    const src = anchor.current?.parent;
    const v = visual.current;
    if (!src || !v) return;
    v.position.copy(src.position).multiplyScalar(M_TO_UNIT);
    v.quaternion.copy(src.quaternion);
    const b = body.current;
    if (b && hitAt.current && performance.now() / 1000 - hitAt.current > RESPAWN.propReset) {
      hitAt.current = 0;
      b.setTranslation(home.t, false);
      b.setRotation(home.q, false);
      b.setLinvel({ x: 0, y: 0, z: 0 }, false);
      b.setAngvel({ x: 0, y: 0, z: 0 }, false);
      b.sleep();
    }
  });

  const { shape } = spec;
  return (
    <>
      <RigidBody
        ref={body}
        type="dynamic"
        colliders={false}
        position={spec.pos}
        rotation={[0, spec.rotY, 0]}
        userData={{ prop: spec.prop }}
        onCollisionEnter={({ other }) => {
          if ((other.rigidBodyObject?.userData as { car?: boolean } | undefined)?.car) hitAt.current = performance.now() / 1000;
        }}
      >
        <object3D ref={anchor} />
        {shape.type === "cuboid" && <CuboidCollider args={shape.half} mass={spec.mass} friction={0.7} />}
        {shape.type === "cylinder" && <CylinderCollider args={[shape.halfHeight, shape.radius]} mass={spec.mass} friction={0.7} />}
      </RigidBody>
      <group ref={visual}>
        <PropVisual spec={spec} />
      </group>
    </>
  );
}

function CameraKey({ input, onToggle }: { input: ReturnType<typeof useDriveInput>; onToggle: () => void }) {
  useFrame(() => {
    if (input.current.pressed.camera) onToggle();
  });
  return null;
}

// ─── World ───────────────────────────────────────────────────

export default function DriveWorld({
  objects,
  buildings,
  size,
  viewerDevId,
  telemetry,
  camera,
  onCameraToggle,
  onReady,
  onFail,
}: DriveWorldProps) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const specs = useMemo(() => buildColliders(objects, buildings, size), [objects, buildings, size]);
  const fixed = useMemo(() => specs.filter((s) => s.body === "fixed"), [specs]);
  const dynamic = useMemo(() => specs.filter((s) => s.body === "dynamic"), [specs]);
  const spawn = useMemo(() => spawnPoint(objects, viewerDevId, size), [objects, viewerDevId, size]);

  const input = useDriveInput();
  const car = useRef<CarApi | null>(null);
  const impact = useRef({ strength: 0, at: 0 });

  return (
    <Boundary onFail={onFail}>
      <Suspense fallback={null}>
        <Physics timeStep={1 / 60} interpolate paused={hidden} gravity={[0, GRAVITY, 0]} updatePriority={-50}>
          <RigidBody type="fixed" colliders={false}>
            {fixed.map((s) => (
              <SpecCollider key={colliderKey(s)} spec={s} />
            ))}
          </RigidBody>
          {dynamic.map((s) => (
            <DynamicProp key={colliderKey(s)} spec={s} />
          ))}
          <Car
            spawn={spawn}
            objects={objects}
            buildings={buildings}
            size={size}
            input={input}
            telemetry={telemetry}
            apiRef={car}
            impact={impact}
          />
          <DriveCamera mode={camera} car={car} impact={impact} />
          <CameraKey input={input} onToggle={onCameraToggle} />
          <Ready onReady={onReady} />
        </Physics>
      </Suspense>
    </Boundary>
  );
}
