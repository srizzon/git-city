"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CoefficientCombineRule,
  ConvexHullCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import { Fountain, ParkBench, StreetLamp } from "@/components/city/decorations";
import { CONE, CRATE } from "@/lib/league-city/toys";
import type { CityBuilding } from "@/lib/github";
import type { CityObject } from "@/lib/league-city/types";
import { buildColliders, colliderKey, type ColliderSpec } from "@/lib/league-city/drive/colliders";
import { spawnPoint } from "@/lib/league-city/drive/spawn";
import type { DriveCameraMode, DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { CHASSIS, GRAVITY, M_TO_UNIT, RESPAWN } from "@/lib/league-city/drive/tuning";
import Car, { type CarApi } from "./Car";
import DriveCamera from "./DriveCamera";
import Battle from "./Battle";
import CrownMode, { type CrownApi, type CrownView } from "./CrownMode";
import HonkFlash from "./HonkFlash";
import Lights from "./Lights";
import { BoostTrail, Smoke } from "./Particles";
import SkidMarks from "./SkidMarks";
import { useDriveAudio } from "./useDriveAudio";
import { useDrivePresence, type BattleEvent } from "./useDrivePresence";
import RemoteCars from "./RemoteCars";
import type { FxSource, FxSources } from "./fx";
import { carColor, type DriverInfo } from "@/lib/league-city/drive/net";
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
  /** Esc: physics, input and sound stop. */
  paused: boolean;
  /** Rapier and the car are loaded. */
  onReady: () => void;
  /** Rapier or the models failed to load. */
  onFail: () => void;
  /** League slug: the drive room everyone in this city shares. */
  slug: string;
  /** Your name in the room (GitHub login or guest-xxxx). */
  name: string;
  /** Who else is driving here, for the HUD. */
  onDrivers: (drivers: DriverInfo[]) => void;
  /** Honked at a teammate's building. */
  onHonk: (b: CityBuilding) => void;
  /** Crown Rush: the HUD's Start button calls into this. */
  crownApi: React.MutableRefObject<CrownApi | null>;
  /** Crown Rush state for the HUD. */
  onCrown: (v: CrownView) => void;
}

/** A bump carries this share of the hitter's relative velocity, plus a small hop (m/s). */
const BUMP_SHARE = 0.7;
const BUMP_HOP = 1.2;
/** A crash counts once, whichever side sees it first (ms). */
const BUMP_DEDUPE_MS = 500;

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
  if (shape.type === "cuboid")
    return spec.restitution ? (
      <CuboidCollider
        args={shape.half}
        position={pos}
        rotation={rotation}
        friction={0.2}
        restitution={spec.restitution}
        restitutionCombineRule={CoefficientCombineRule.Max}
      />
    ) : (
      <CuboidCollider args={shape.half} position={pos} rotation={rotation} friction={0.6} />
    );
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
  if (spec.prop === "cone")
    return (
      <mesh position={[0, drop + CONE.height / 2, 0]}>
        <coneGeometry args={[CONE.radius, CONE.height, 10]} />
        <meshStandardMaterial color="#ff7a1a" emissive="#ff7a1a" emissiveIntensity={0.45} />
      </mesh>
    );
  if (spec.prop === "crate")
    return (
      <mesh>
        <boxGeometry args={[CRATE, CRATE, CRATE]} />
        <meshStandardMaterial color="#a8743f" emissive="#5a3a1a" emissiveIntensity={0.4} roughness={0.85} />
      </mesh>
    );
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

/** Your car as an effects source (tire marks, smoke, boost trail). */
function LocalFx({ car, sources }: { car: React.MutableRefObject<CarApi | null>; sources: FxSources }) {
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

function DriveAudio(props: Parameters<typeof useDriveAudio>[0]) {
  useDriveAudio(props);
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
  muted,
  paused,
  onReady,
  onFail,
  slug,
  name,
  onDrivers,
  onHonk,
  crownApi,
  onCrown,
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

  const input = useDriveInput(paused);
  const car = useRef<CarApi | null>(null);
  const impact = useRef({ strength: 0, at: 0 });
  const fx = useRef(new Map<string, FxSource>());
  const [flash, setFlash] = useState<{ b: CityBuilding; at: number } | null>(null);
  const honk = (b: CityBuilding) => {
    setFlash({ b, at: performance.now() });
    onHonk(b);
  };
  // Crashes with other drivers. Whoever sees the contact tells the other one
  // how to move; a bump for a crash you already felt locally is dropped.
  const contacts = useRef(new Map<string, number>());
  const battleSink = useRef<(e: BattleEvent) => void>(() => {});
  const crownSink = useRef<(e: BattleEvent) => void>(() => {});
  const crownHit = useRef<(id: string) => void>(() => {});
  const crownKnock = useRef<() => void>(() => {});
  const telemetryRef = useRef(telemetry);
  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);
  const { remotes, drivers, sendBump, send, selfId } = useDrivePresence({
    slug,
    name,
    car,
    input,
    onBump: (from, x, z) => {
      const c = car.current;
      if (!c || performance.now() - (contacts.current.get(from) ?? 0) < BUMP_DEDUPE_MS) return;
      c.body.applyImpulse({ x: x * CHASSIS.mass, y: BUMP_HOP * CHASSIS.mass, z: z * CHASSIS.mass }, true);
      impact.current = { strength: Math.min(1, Math.hypot(x, z) / 12), at: performance.now() };
    },
    onBattle: (e) => (e.t === "crown" ? crownSink.current(e) : battleSink.current(e)),
  });
  const onRemoteHit = (id: string, other: RapierRigidBody) => {
    crownHit.current(id);
    const c = car.current;
    const now = performance.now();
    const last = contacts.current.get(id) ?? 0;
    contacts.current.set(id, now);
    if (!c || now - last < BUMP_DEDUPE_MS) return;
    // The car you hit picks up part of your speed relative to it.
    const mine = c.body.linvel();
    const theirs = other.linvel();
    sendBump(id, (mine.x - theirs.x) * BUMP_SHARE, (mine.z - theirs.z) * BUMP_SHARE);
  };
  useEffect(() => onDrivers(drivers), [drivers, onDrivers]);

  return (
    <Boundary onFail={onFail}>
      <Suspense fallback={null}>
        <Physics timeStep={1 / 60} interpolate paused={hidden || paused} gravity={[0, GRAVITY, 0]} updatePriority={-50}>
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
            color={carColor(name)}
            onRemoteHit={onRemoteHit}
            onHonk={honk}
            impact={impact}
          >
            <Lights braking={() => !!car.current?.state.braking} />
          </Car>
          <LocalFx car={car} sources={fx} />
          <RemoteCars remotes={remotes} drivers={drivers} sources={fx} localCar={car} muted={muted || paused} />
          <Battle
            objects={objects}
            car={car}
            remotes={remotes}
            input={input}
            send={send}
            selfId={selfId}
            sinkRef={battleSink}
            impactRef={impact}
            telemetryRef={telemetryRef}
            onKnocked={() => crownKnock.current()}
            muted={muted || paused}
          />
          <CrownMode
            objects={objects}
            carRef={car}
            remotes={remotes}
            send={send}
            selfId={selfId}
            sinkRef={crownSink}
            apiRef={crownApi}
            hitRef={crownHit}
            knockRef={crownKnock}
            onView={onCrown}
          />
          {flash && <HonkFlash key={flash.at} building={flash.b} at={flash.at} />}
          <SkidMarks sources={fx} />
          <Smoke sources={fx} />
          <BoostTrail sources={fx} />
          <DriveAudio car={car} input={input} impact={impact} muted={muted || paused} />
          <DriveCamera mode={camera} car={car} impact={impact} />
          <CameraKey input={input} onToggle={onCameraToggle} />
          <Ready onReady={onReady} />
        </Physics>
      </Suspense>
    </Boundary>
  );
}
