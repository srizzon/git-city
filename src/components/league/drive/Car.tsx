"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";
import { LOT } from "@/lib/league-city/grid";
import type { CityObject } from "@/lib/league-city/types";
import { nearestFreeLot, type Spawn } from "@/lib/league-city/drive/spawn";
import { surfaceAt, surfaceIndex } from "@/lib/league-city/drive/surface";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { CHASSIS, M_TO_UNIT, TOYS, UNIT_TO_M, WHEEL } from "@/lib/league-city/drive/tuning";
import { honkTarget, padKick } from "@/lib/league-city/drive/reactions";
import { padAt } from "@/lib/league-city/toys";
import {
  WHEELS,
  carHeading,
  createVehicle,
  headingFromRot,
  newCarState,
  placeCar,
  stepCar,
  type CarState,
  type VehicleController,
} from "@/lib/league-city/drive/vehicle";
import CarModel from "./CarModel";
import type { DriveInputRef } from "./useDriveInput";

// The drivable sedan. Physics runs in meters on a collider-only rigid body;
// the visible car (city units) copies its interpolated pose every frame.

// Box inertia for the chassis, around its center of mass.
const [HX, HY, HZ] = CHASSIS.half;
const M12 = CHASSIS.mass / 12;
const INERTIA = { x: M12 * (4 * HY * HY + 4 * HZ * HZ), y: M12 * (4 * HX * HX + 4 * HZ * HZ), z: M12 * (4 * HX * HX + 4 * HY * HY) };

/** Contact force (N) that counts as a hit, and the force of a full-strength crash. */
const IMPACT_MIN = 40000;
const IMPACT_FULL = 400000;

export interface CarApi {
  /** The visible car, city units. */
  group: THREE.Group;
  body: RapierRigidBody;
  controller: VehicleController;
  state: CarState;
  /** Wheel meshes (FL, FR, RL, RR), for skid marks and smoke. */
  wheels: THREE.Object3D[];
}

const _q = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _spin = new THREE.Quaternion();

export default function Car({
  spawn,
  objects,
  buildings,
  size,
  input,
  telemetry,
  apiRef,
  impact,
  color,
  onRemoteHit,
  onHonk,
  onReset,
  children,
}: {
  spawn: Spawn;
  objects: CityObject[];
  buildings: CityBuilding[];
  size: number;
  input: React.MutableRefObject<DriveInputRef>;
  telemetry: DriveTelemetry;
  apiRef: React.MutableRefObject<CarApi | null>;
  /** Set on every hard hit: strength 0…1 and when (performance.now ms). */
  impact: React.MutableRefObject<{ strength: number; at: number }>;
  /** Paint, the same color everyone else sees you in. */
  color: string;
  /** You touched another driver's car (its body, for its velocity). */
  onRemoteHit?: (id: string, other: RapierRigidBody) => void;
  /** Honked while parked in front of someone's building. */
  onHonk?: (b: CityBuilding) => void;
  /** R, or fell out of the world: back to the spawn point. */
  onReset?: () => void;
  /** Rendered inside the visible car (lights). */
  children?: React.ReactNode;
}) {
  const { world } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const rigidObj = useRef<THREE.Object3D>(null);
  const group = useRef<THREE.Group>(null);
  const wheelRefs = useRef<(THREE.Object3D | null)[]>([]);
  const state = useRef<CarState>(newCarState());
  const controller = useRef<VehicleController | null>(null);

  const surfaces = useMemo(() => surfaceIndex(objects), [objects]);
  const gripAt = useMemo(() => (wx: number, wz: number) => surfaceAt(surfaces, wx, wz), [surfaces]);
  const gripRef = useRef(gripAt);
  gripRef.current = gripAt;

  const start = useMemo(
    () => ({ pos: [spawn.x * UNIT_TO_M, 0.4, spawn.z * UNIT_TO_M] as [number, number, number], heading: headingFromRot(spawn.rot) }),
    // The car spawns once; later spawn changes only matter for R.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const pads = useMemo(() => objects.filter((o) => o.item_type === "boost_pad"), [objects]);
  const padsRef = useRef(pads);
  padsRef.current = pads;
  const lastPad = useRef(0);
  const near = useRef<CityBuilding | null>(null);
  const lastNearCheck = useRef(0);
  const spawnRef = useRef(spawn);
  spawnRef.current = spawn;

  // Vehicle controller on the chassis.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const c = createVehicle(world, body);
    controller.current = c;
    return () => {
      controller.current = null;
      world.removeVehicleController(c);
    };
  }, [world]);

  const reset = () => {
    const body = bodyRef.current;
    if (!body) return;
    const s = spawnRef.current;
    placeCar(body, s.x * UNIT_TO_M, s.z * UNIT_TO_M, headingFromRot(s.rot));
    state.current = newCarState();
    onReset?.();
  };

  useBeforePhysicsStep((w) => {
    const c = controller.current;
    const body = bodyRef.current;
    if (!c || !body) return;
    stepCar(c, state.current, input.current.input, w.timestep, gripRef.current);
    const p = body.translation();
    if (p.y < -10) reset();

    // Boost pads: up to pad speed along the arrow, once per pass.
    const pad = padAt(padsRef.current, p.x * M_TO_UNIT, p.z * M_TO_UNIT);
    const now = performance.now();
    if (pad && p.y < 1.5 && now - lastPad.current > TOYS.padCooldown * 1000) {
      lastPad.current = now;
      const v = body.linvel();
      const h = carHeading(body);
      const [dx, dz] = padKick(v.x, v.z, pad.rot, Math.sin(h), Math.cos(h));
      body.applyImpulse({ x: dx * CHASSIS.mass, y: 0, z: dz * CHASSIS.mass }, true);
    }
  });

  // A building landed on the car (admin edit in live view): push it to the nearest free lot.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const p = body.translation();
    const wx = p.x * M_TO_UNIT;
    const wz = p.z * M_TO_UNIT;
    const inside = buildings.some(
      (b) => Math.abs(wx - b.position[0]) < b.width / 2 + 4 && Math.abs(wz - b.position[2]) < b.depth / 2 + 4,
    );
    if (!inside) return;
    const lot = nearestFreeLot(objects, size, wx, wz);
    if (lot) placeCar(body, lot[0] * LOT * UNIT_TO_M, lot[1] * LOT * UNIT_TO_M, carHeading(body));
  }, [buildings, objects, size]);

  useFrame(() => {
    const body = bodyRef.current;
    const c = controller.current;
    const g = group.current;
    // The rigid body's own group carries the interpolated pose (meters).
    const src = rigidObj.current?.parent;
    if (!body || !c || !g || !src) return;
    if (input.current.pressed.reset) reset();

    // Visible car follows the interpolated body.
    g.position.copy(src.position).multiplyScalar(M_TO_UNIT);
    g.quaternion.copy(src.quaternion);

    WHEELS.forEach((w, i) => {
      const obj = wheelRefs.current[i];
      if (!obj) return;
      const susp = c.wheelSuspensionLength(i) ?? WHEEL.restLength;
      obj.position.set(w.x * M_TO_UNIT, (WHEEL.connectionY - susp) * M_TO_UNIT, w.z * M_TO_UNIT);
      _q.setFromAxisAngle(_axisY, (c.wheelSteering(i) ?? 0) + (w.x < 0 ? Math.PI : 0));
      _spin.setFromAxisAngle(_axisX, (c.wheelRotation(i) ?? 0) * (w.x < 0 ? -1 : 1));
      obj.quaternion.copy(_q).multiply(_spin);
    });

    const s = state.current;
    // The building you're parked at, a few times a second; honk opens its card.
    const t = performance.now();
    if (t - lastNearCheck.current > 150) {
      lastNearCheck.current = t;
      near.current = honkTarget(buildings, g.position.x, g.position.z, s.speed);
    }
    telemetry.near = near.current?.login ?? null;
    if (input.current.pressed.horn && near.current) onHonk?.(near.current);
    telemetry.speed = s.speed;
    telemetry.boosting = s.boosting;

    apiRef.current = { group: g, body, controller: c, state: s, wheels: wheelRefs.current.filter((o): o is THREE.Object3D => !!o) };
  });

  useEffect(() => () => void (apiRef.current = null), [apiRef]);

  return (
    <>
      <RigidBody
        ref={(b) => {
          bodyRef.current = b;
        }}
        type="dynamic"
        colliders={false}
        position={start.pos}
        rotation={[0, start.heading, 0]}
        canSleep={false}
        linearDamping={CHASSIS.linearDamping}
        angularDamping={CHASSIS.angularDamping}
        ccd
        userData={{ car: true }}
        onCollisionEnter={({ other }) => {
          const id = (other.rigidBodyObject?.userData as { remoteCar?: string } | undefined)?.remoteCar;
          if (id && other.rigidBody) onRemoteHit?.(id, other.rigidBody);
        }}
        onContactForce={({ totalForceMagnitude }) => {
          const strength = Math.min(1, totalForceMagnitude / IMPACT_FULL);
          const now = performance.now();
          // One hit per 150 ms, keeping the strongest.
          if (now - impact.current.at > 150 || strength > impact.current.strength) impact.current = { strength, at: now };
        }}
      >
        <object3D ref={rigidObj} />
        <CuboidCollider
          args={CHASSIS.half}
          position={[0, CHASSIS.colliderY, 0]}
          friction={0.3}
          ref={(col) => col?.setContactForceEventThreshold(IMPACT_MIN)}
          massProperties={{
            mass: CHASSIS.mass,
            centerOfMass: { x: 0, y: CHASSIS.comY - CHASSIS.colliderY, z: 0 },
            principalAngularInertia: INERTIA,
            angularInertiaLocalFrame: { x: 0, y: 0, z: 0, w: 1 },
          }}
        />
      </RigidBody>

      <group ref={group}>
        <CarModel color={color} wheelRefs={wheelRefs}>
          {children}
        </CarModel>
      </group>
    </>
  );
}
