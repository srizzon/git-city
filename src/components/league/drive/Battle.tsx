"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityObject } from "@/lib/league-city/types";
import {
  BALL,
  BOX_COUNT,
  BOX_REACH,
  OIL,
  SHOCK,
  SMOKE,
  ballPosition,
  boxPosition,
  boxSpots,
  isItem,
  shockKick,
  type BattleItem,
} from "@/lib/league-city/drive/battle";
import type { ClientMsg } from "@/lib/league-city/drive/net";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { CHASSIS, M_TO_UNIT, UNIT_TO_M } from "@/lib/league-city/drive/tuning";
import { carHeading, spinOut } from "@/lib/league-city/drive/vehicle";
import type { CarApi } from "./Car";
import type { BattleEvent } from "./useDrivePresence";
import type { DriveInputRef } from "./useDriveInput";

// Item boxes and attacks. The server says which box slots are up (and their
// generation) and relays every attack; this draws them, takes a box when you
// drive through one, fires what you hold on F, and applies what hits *your*
// car: a shockwave shove, smoke over your eyes, an oil spin, a ball knock.

interface Fx {
  id: number;
  from: string;
  item: BattleItem;
  x: number;
  z: number;
  dx: number;
  dz: number;
  born: number;
}

const LIFE: Record<BattleItem, number> = { shock: SHOCK.life, smoke: SMOKE.life, oil: OIL.life, ball: BALL.life };
/** How far behind (smoke, oil) or ahead (ball) of the car an attack starts (m). */
const DROP_BEHIND = 3.5;
const THROW_AHEAD = 3;
/** Your own oil doesn't catch you for this long (ms). */
const OWN_OIL_GRACE = 1500;

const BOX_SIZE = 3.4; // city units

function ItemBox({ x, z }: { x: number; z: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.rotation.y = t * 1.6;
    g.rotation.x = Math.sin(t * 1.3) * 0.3;
    g.position.y = 3 + Math.sin(t * 2.2) * 0.6;
  });
  return (
    <group position={[x * M_TO_UNIT, 3, z * M_TO_UNIT]} ref={ref}>
      <mesh>
        <boxGeometry args={[BOX_SIZE, BOX_SIZE, BOX_SIZE]} />
        <meshBasicMaterial color="#ff5ad8" transparent opacity={0.55} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[BOX_SIZE * 0.55, BOX_SIZE * 0.55, BOX_SIZE * 0.55]} />
        <meshBasicMaterial color="#fff2ff" toneMapped={false} />
      </mesh>
    </group>
  );
}

function ShockRing({ fx }: { fx: Fx }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const m = mesh.current;
    if (!m || !mat.current) return;
    const k = Math.min(1, (performance.now() - fx.born) / 1000 / SHOCK.life);
    const r = Math.max(0.01, k * SHOCK.radius * M_TO_UNIT);
    m.scale.set(r, r, r);
    mat.current.opacity = 0.7 * (1 - k);
  });
  return (
    <mesh ref={mesh} position={[fx.x * M_TO_UNIT, 1, fx.z * M_TO_UNIT]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.85, 1, 48]} />
      <meshBasicMaterial ref={mat} color="#7ee8ff" transparent toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SmokeCloud({ fx }: { fx: Fx }) {
  const puffs = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + fx.id;
        const d = (i % 3) * 0.3 * SMOKE.radius;
        return { x: Math.cos(a) * d, z: Math.sin(a) * d, r: (0.45 + (i % 4) * 0.12) * SMOKE.radius, y: 2 + (i % 3) * 1.2 };
      }),
    [fx.id],
  );
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame(() => {
    const age = (performance.now() - fx.born) / 1000;
    const k = age < 0.4 ? age / 0.4 : age > SMOKE.life - 1 ? Math.max(0, SMOKE.life - age) : 1;
    for (const m of mats.current) if (m) m.opacity = 0.85 * k;
  });
  return (
    <group position={[fx.x * M_TO_UNIT, 0, fx.z * M_TO_UNIT]}>
      {puffs.map((p, i) => (
        <mesh key={i} position={[p.x * M_TO_UNIT, p.y * M_TO_UNIT * 0.5, p.z * M_TO_UNIT]}>
          <icosahedronGeometry args={[p.r * M_TO_UNIT * 0.6, 1]} />
          <meshStandardMaterial
            ref={(m) => {
              mats.current[i] = m;
            }}
            color="#1b1b22"
            emissive="#101014"
            transparent
            opacity={0}
            depthWrite={false}
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  );
}

function OilSlick({ fx }: { fx: Fx }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const age = (performance.now() - fx.born) / 1000;
    if (mat.current) mat.current.opacity = age > OIL.life - 2 ? Math.max(0, (OIL.life - age) / 2) * 0.95 : 0.95;
  });
  return (
    <mesh position={[fx.x * M_TO_UNIT, 0.18, fx.z * M_TO_UNIT]} rotation={[-Math.PI / 2, 0, fx.id]}>
      <circleGeometry args={[OIL.radius * M_TO_UNIT, 20]} />
      <meshStandardMaterial ref={mat} color="#0a0a0f" metalness={0.6} roughness={0.15} emissive="#1a1030" transparent depthWrite={false} />
    </mesh>
  );
}

function Ball({ fx }: { fx: Fx }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const age = (performance.now() - fx.born) / 1000;
    const [x, z] = ballPosition(fx.x, fx.z, fx.dx, fx.dz, age);
    m.position.set(x * M_TO_UNIT, (BALL.radius + Math.abs(Math.sin(age * 9)) * 1.2) * M_TO_UNIT, z * M_TO_UNIT);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[BALL.radius * M_TO_UNIT, 16, 12]} />
      <meshBasicMaterial color="#ff4fd8" toneMapped={false} />
    </mesh>
  );
}

export default function Battle({
  objects,
  car,
  input,
  send,
  selfId,
  sinkRef,
  impactRef,
  telemetryRef,
}: {
  objects: CityObject[];
  car: React.MutableRefObject<CarApi | null>;
  input: React.MutableRefObject<DriveInputRef>;
  send: (msg: ClientMsg) => void;
  selfId: React.MutableRefObject<string | null>;
  /** The presence hook hands battle events to this. */
  sinkRef: React.MutableRefObject<(e: BattleEvent) => void>;
  impactRef: React.MutableRefObject<{ strength: number; at: number }>;
  telemetryRef: React.MutableRefObject<DriveTelemetry>;
}) {
  const spots = useMemo(() => boxSpots(objects), [objects]);
  const boxes = useRef(Array.from({ length: BOX_COUNT }, () => ({ gen: 0, at: 0 })));
  const [shown, setShown] = useState<{ i: number; gen: number }[]>([]);
  const fxs = useRef(new Map<number, Fx>());
  const [fxList, setFxList] = useState<Fx[]>([]);
  const applied = useRef(new Set<number>());
  const asked = useRef(new Set<string>());
  const held = useRef<BattleItem | null>(null);
  const smoke = useRef(0);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    // Boxes that are up right now.
    const refresh = () => {
      const now = performance.now();
      setShown(boxes.current.flatMap((b, i) => (now >= b.at ? [{ i, gen: b.gen }] : [])));
    };
    const later = (ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        refresh();
      }, ms + 50);
      timers.add(t);
    };
    sinkRef.current = (e) => {
      const now = performance.now();
      if (e.t === "boxes") {
        e.boxes.forEach((b, i) => {
          if (boxes.current[i]) boxes.current[i] = { gen: b.gen, at: now + b.wait };
          if (b.wait > 0) later(b.wait);
        });
        refresh();
      } else if (e.t === "box") {
        if (boxes.current[e.box]) boxes.current[e.box] = { gen: e.gen, at: now + e.wait };
        refresh();
        later(e.wait); // back again
      } else if (e.t === "got") {
        if (isItem(e.item)) {
          held.current = e.item;
          telemetryRef.current.held = e.item;
          telemetryRef.current.gotAt = now;
        }
      } else if (e.t === "fx") {
        if (!isItem(e.item)) return;
        fxs.current.set(e.id, { id: e.id, from: e.from, item: e.item, x: e.x, z: e.z, dx: e.dx, dz: e.dz, born: now });
        setFxList([...fxs.current.values()]);
      } else if (e.t === "gone") {
        if (fxs.current.delete(e.id)) setFxList([...fxs.current.values()]);
      }
    };
    return () => {
      sinkRef.current = () => {};
      for (const t of timers) clearTimeout(t);
    };
  }, [sinkRef, telemetryRef]);

  useFrame((_, dt) => {
    const c = car.current;
    if (!c) return;
    const now = performance.now();
    const p = c.body.translation();
    const h = carHeading(c.body);
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const me = selfId.current;

    // Drive through a box to take it (one ask per box generation).
    if (!held.current) {
      boxes.current.forEach((b, i) => {
        if (now < b.at) return;
        const pos = boxPosition(spots, i, b.gen, UNIT_TO_M);
        if (!pos || Math.hypot(pos[0] - p.x, pos[1] - p.z) > BOX_REACH) return;
        const key = `${i}:${b.gen}`;
        if (asked.current.has(key)) return;
        asked.current.add(key);
        send({ t: "take", box: i, gen: b.gen });
      });
    }

    // F: use what you hold.
    const item = held.current;
    if (input.current.pressed.fire && item) {
      held.current = null;
      telemetryRef.current.held = null;
      const at =
        item === "ball"
          ? { x: p.x + fx * THROW_AHEAD, z: p.z + fz * THROW_AHEAD }
          : item === "shock"
            ? { x: p.x, z: p.z }
            : { x: p.x - fx * DROP_BEHIND, z: p.z - fz * DROP_BEHIND };
      send({ t: "use", item, x: at.x, z: at.z, dx: fx, dz: fz });
    }

    // What the attacks in play do to your car.
    let inSmoke = 0;
    let changed = false;
    for (const f of fxs.current.values()) {
      const age = (now - f.born) / 1000;
      if (age > LIFE[f.item]) {
        fxs.current.delete(f.id);
        changed = true;
        continue;
      }
      const mine = f.from === me;
      if (f.item === "smoke") {
        if (Math.hypot(f.x - p.x, f.z - p.z) < SMOKE.radius) inSmoke = 1;
        continue;
      }
      if (applied.current.has(f.id)) continue;
      if (f.item === "shock") {
        applied.current.add(f.id);
        if (mine) continue;
        const k = shockKick(f.x, f.z, p.x, p.z);
        if (!k) continue;
        c.body.applyImpulse({ x: k[0] * CHASSIS.mass, y: SHOCK.hop * CHASSIS.mass, z: k[1] * CHASSIS.mass }, true);
        impactRef.current = { strength: 0.8, at: now };
      } else if (f.item === "oil") {
        if (mine && now - f.born < OWN_OIL_GRACE) continue;
        if (Math.hypot(f.x - p.x, f.z - p.z) > OIL.radius + 0.8) continue;
        applied.current.add(f.id);
        spinOut(c.state, OIL.spin);
      } else if (f.item === "ball") {
        if (mine) continue;
        const [bx, bz] = ballPosition(f.x, f.z, f.dx, f.dz, age);
        if (Math.hypot(bx - p.x, bz - p.z) > BALL.hitReach) continue;
        applied.current.add(f.id);
        c.body.applyImpulse({ x: f.dx * BALL.push * CHASSIS.mass, y: BALL.hop * CHASSIS.mass, z: f.dz * BALL.push * CHASSIS.mass }, true);
        spinOut(c.state, BALL.spin);
        impactRef.current = { strength: 1, at: now };
        fxs.current.delete(f.id);
        changed = true;
        send({ t: "hit", id: f.id });
      }
    }
    if (changed) setFxList([...fxs.current.values()]);
    smoke.current += (inSmoke - smoke.current) * Math.min(1, dt * (inSmoke ? 6 : 1.2));
    telemetryRef.current.smoke = smoke.current;
  });

  return (
    <>
      {shown.map((b) => {
        const pos = boxPosition(spots, b.i, b.gen, UNIT_TO_M);
        return pos ? <ItemBox key={`${b.i}:${b.gen}`} x={pos[0]} z={pos[1]} /> : null;
      })}
      {fxList.map((f) =>
        f.item === "shock" ? (
          <ShockRing key={f.id} fx={f} />
        ) : f.item === "smoke" ? (
          <SmokeCloud key={f.id} fx={f} />
        ) : f.item === "oil" ? (
          <OilSlick key={f.id} fx={f} />
        ) : (
          <Ball key={f.id} fx={f} />
        ),
      )}
    </>
  );
}
