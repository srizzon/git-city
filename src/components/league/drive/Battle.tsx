"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Howl } from "howler";
import * as THREE from "three";
import type { CityObject } from "@/lib/league-city/types";
import {
  BOMB,
  BOX_COUNT,
  BOX_REACH,
  MISSILE,
  OWN_BOMB_GRACE,
  SHOCK,
  TUMBLE,
  blastKick,
  boxPosition,
  boxSpots,
  isItem,
  missileTarget,
  stepMissile,
  type BattleItem,
  type MissileState,
} from "@/lib/league-city/drive/battle";
import type { ClientMsg } from "@/lib/league-city/drive/net";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { CHASSIS, M_TO_UNIT, UNIT_TO_M } from "@/lib/league-city/drive/tuning";
import { carHeading } from "@/lib/league-city/drive/vehicle";
import type { CarApi } from "./Car";
import type { BattleEvent, RemoteDriver } from "./useDrivePresence";
import type { DriveInputRef } from "./useDriveInput";
import { Bomb, Bursts, Crate, FIRE, Missile, SHOCK_COLORS, type VoxelBursts } from "./Voxels";
import { chime } from "@/lib/sfx/chime";

// Item boxes and attacks, in voxels. The server says which box slots are up
// and relays every attack; this draws them, takes a box when you drive
// through one, fires what you hold on F, and applies what catches *your*
// car: a shockwave, a bomb you drive over, a missile that reaches you. Every
// blast throws the car up and tumbling, and knocks the crown off its holder.

interface Fx {
  id: number;
  from: string;
  item: BattleItem;
  x: number;
  z: number;
  dx: number;
  dz: number;
  target: string | null;
  born: number;
  /** Missiles: where they are now (m). */
  m?: MissileState;
}

const LIFE: Record<BattleItem, number> = { shock: SHOCK.life, bomb: BOMB.life, missile: MISSILE.life };
const DROP_BEHIND = 4;
const THROW_AHEAD = 3.5;
/** Anyone this close (m) to a bomb or missile when it goes off is caught too. */
const SPLASH = 5;

function Bombs({ fx }: { fx: Fx }) {
  return (
    <group position={[fx.x * M_TO_UNIT, 0, fx.z * M_TO_UNIT]}>
      <Bomb armed={() => (performance.now() - fx.born) / 1000 > BOMB.arm} />
    </group>
  );
}

function Missiles({ fx, bursts }: { fx: Fx; bursts: React.MutableRefObject<VoxelBursts | null> }) {
  const ref = useRef<THREE.Group>(null);
  const lastPuff = useRef(0);
  useFrame(() => {
    const g = ref.current;
    const m = fx.m;
    if (!g || !m) return;
    g.position.set(m.x * M_TO_UNIT, 2.2, m.z * M_TO_UNIT);
    g.rotation.y = m.h;
    const now = performance.now();
    if (now - lastPuff.current > 45) {
      lastPuff.current = now;
      bursts.current?.burst(g.position.x - Math.sin(m.h) * 2.2, 2.2, g.position.z - Math.cos(m.h) * 2.2, {
        count: 2,
        speed: 3,
        colors: ["#9a9aa6", "#ffd23f", "#6a6a74"],
        size: 0.8,
        life: 0.6,
        gravity: -4,
      });
    }
  });
  return (
    <group ref={ref}>
      <Missile />
    </group>
  );
}

export default function Battle({
  objects,
  car,
  remotes,
  input,
  send,
  selfId,
  sinkRef,
  impactRef,
  telemetryRef,
  onKnocked,
  muted,
}: {
  objects: CityObject[];
  car: React.MutableRefObject<CarApi | null>;
  remotes: React.MutableRefObject<Map<string, RemoteDriver>>;
  input: React.MutableRefObject<DriveInputRef>;
  send: (msg: ClientMsg) => void;
  selfId: React.MutableRefObject<string | null>;
  /** The presence hook hands battle events to this. */
  sinkRef: React.MutableRefObject<(e: BattleEvent) => void>;
  impactRef: React.MutableRefObject<{ strength: number; at: number }>;
  telemetryRef: React.MutableRefObject<DriveTelemetry>;
  /** A blast caught your car (the crown falls off if you hold it). */
  onKnocked: () => void;
  muted: boolean;
}) {
  const spots = useMemo(() => boxSpots(objects), [objects]);
  const boxes = useRef(Array.from({ length: BOX_COUNT }, () => ({ gen: 0, at: 0 })));
  const [shown, setShown] = useState<{ i: number; gen: number }[]>([]);
  const fxs = useRef(new Map<number, Fx>());
  const [fxList, setFxList] = useState<Fx[]>([]);
  const done = useRef(new Set<number>());
  const asked = useRef(new Set<string>());
  const held = useRef<BattleItem | null>(null);
  // Mirrors `held` for rendering: boxes fade while you can't take one.
  const [holding, setHolding] = useState(false);
  // Boxes you just drove through, hidden before the server answers.
  const [taken, setTaken] = useState<Set<string>>(() => new Set());
  const bursts = useRef<VoxelBursts | null>(null);
  const boom = useRef<Howl | null>(null);
  const silent = useRef(muted);
  useEffect(() => {
    silent.current = muted;
  }, [muted]);
  const knocked = useRef(onKnocked);
  useEffect(() => {
    knocked.current = onKnocked;
  });

  useEffect(() => {
    boom.current = new Howl({ src: ["/sounds/drive/impact.ogg"], volume: 0.8 });
    return () => {
      boom.current?.unload();
      boom.current = null;
    };
  }, []);

  /** Your car's position (m), for distances. */
  const myPos = (): { x: number; z: number } | null => {
    const c = car.current;
    if (!c) return null;
    const p = c.body.translation();
    return { x: p.x, z: p.z };
  };

  const explode = (x: number, z: number, big: boolean) => {
    bursts.current?.burst(x * M_TO_UNIT, 2, z * M_TO_UNIT, { count: big ? 90 : 50, speed: big ? 55 : 40, colors: FIRE, size: big ? 2 : 1.5, life: 1.1 });
    const me = myPos();
    if (me && boom.current && !silent.current) {
      const d = Math.hypot(me.x - x, me.z - z);
      boom.current.volume(Math.max(0, 1 - d / 120) * 0.9);
      boom.current.play();
    }
  };

  /** Throw your car: shove, lift, tumble, shake. */
  const blast = (kick: [number, number, number]) => {
    const c = car.current;
    if (!c) return;
    const [kx, kz, lift] = kick;
    c.body.applyImpulse({ x: kx * CHASSIS.mass, y: lift * CHASSIS.mass, z: kz * CHASSIS.mass }, true);
    c.body.applyTorqueImpulse(
      { x: (Math.random() - 0.5) * 2 * TUMBLE, y: (Math.random() - 0.5) * TUMBLE, z: (Math.random() - 0.5) * 2 * TUMBLE },
      true,
    );
    impactRef.current = { strength: 1, at: performance.now() };
    knocked.current();
  };

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
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
        setTaken((t) => {
          const key = `${e.box}:${e.gen - 1}`;
          if (!t.has(key)) return t;
          const next = new Set(t);
          next.delete(key);
          return next;
        });
        refresh();
        later(e.wait);
      } else if (e.t === "got") {
        if (isItem(e.item)) {
          held.current = e.item;
          telemetryRef.current.held = e.item;
          telemetryRef.current.gotAt = now;
          setHolding(true);
        }
      } else if (e.t === "fx") {
        if (!isItem(e.item)) return;
        const f: Fx = { id: e.id, from: e.from, item: e.item, x: e.x, z: e.z, dx: e.dx, dz: e.dz, target: e.target ?? null, born: now };
        if (f.item === "missile") f.m = { x: f.x, z: f.z, h: Math.atan2(f.dx, f.dz) };
        fxs.current.set(e.id, f);
        if (f.item === "shock") {
          bursts.current?.burst(f.x * M_TO_UNIT, 1.2, f.z * M_TO_UNIT, { count: 110, speed: 70, colors: SHOCK_COLORS, size: 1.6, life: 0.8, flat: 1, gravity: 10 });
          const me = myPos();
          if (me && f.from !== selfId.current) {
            const k = blastKick(f.x, f.z, me.x, me.z, SHOCK);
            if (k) blast(k);
          }
          done.current.add(f.id);
        }
        setFxList([...fxs.current.values()]);
      } else if (e.t === "gone") {
        const f = fxs.current.get(e.id);
        if (!f) return;
        fxs.current.delete(e.id);
        setFxList([...fxs.current.values()]);
        // It went off: boom, and whoever's close (other than the one it caught) gets thrown too.
        const at = f.m ?? { x: f.x, z: f.z };
        explode(at.x, at.z, f.item === "bomb");
        const me = myPos();
        if (me && !done.current.has(f.id) && Math.hypot(me.x - at.x, me.z - at.z) < SPLASH) {
          done.current.add(f.id);
          const k = blastKick(at.x, at.z, me.x, me.z, { radius: SPLASH, push: BOMB.push, lift: BOMB.lift });
          if (k) blast(k);
        }
      }
    };
    return () => {
      sinkRef.current = () => {};
      for (const t of timers) clearTimeout(t);
    };
    // explode/blast/myPos read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinkRef, telemetryRef, selfId]);

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
        // Feedback right away: the box pops, cubes fly, a chime plays.
        setTaken((t) => new Set(t).add(key));
        bursts.current?.burst(pos[0] * M_TO_UNIT, 3.6, pos[1] * M_TO_UNIT, {
          count: 46,
          speed: 32,
          colors: ["#ffd23f", "#ff9a3c", "#c8e64a", "#fff2c0"],
          size: 1.3,
          life: 0.7,
        });
        if (!silent.current) chime();
        // Nobody answered (someone else got there first, the room dropped it): show it again.
        setTimeout(() => {
          setTaken((t) => {
            if (!t.has(key) || (boxes.current[i]?.gen ?? 0) > b.gen) return t;
            const next = new Set(t);
            next.delete(key);
            return next;
          });
        }, 1500);
      });
    }

    // F: use what you hold.
    const item = held.current;
    if (input.current.pressed.fire && item) {
      held.current = null;
      telemetryRef.current.held = null;
      setHolding(false);
      if (item === "shock") send({ t: "use", item, x: p.x, z: p.z, dx: fx, dz: fz });
      else if (item === "bomb") send({ t: "use", item, x: p.x - fx * DROP_BEHIND, z: p.z - fz * DROP_BEHIND, dx: fx, dz: fz });
      else {
        const cars = [...remotes.current.values()].flatMap((r) => (r.buffer.latest ? [{ id: r.id, x: r.buffer.latest.x, z: r.buffer.latest.z }] : []));
        const target = missileTarget(p.x, p.z, fx, fz, cars);
        send({ t: "use", item, x: p.x + fx * THROW_AHEAD, z: p.z + fz * THROW_AHEAD, dx: fx, dz: fz, target: target?.id });
      }
    }

    // Bombs and missiles in play.
    let changed = false;
    for (const f of fxs.current.values()) {
      const age = (now - f.born) / 1000;
      if (age > LIFE[f.item]) {
        fxs.current.delete(f.id);
        changed = true;
        if (f.item === "missile" && f.m) explode(f.m.x, f.m.z, false);
        continue;
      }
      if (done.current.has(f.id)) continue;
      const mine = f.from === me;
      if (f.item === "bomb") {
        if (age < BOMB.arm || (mine && age < OWN_BOMB_GRACE)) continue;
        if (Math.hypot(f.x - p.x, f.z - p.z) > BOMB.trigger) continue;
        done.current.add(f.id);
        const k = blastKick(f.x, f.z, p.x, p.z, { radius: BOMB.trigger + 1, push: BOMB.push, lift: BOMB.lift });
        if (k) blast(k);
        send({ t: "hit", id: f.id });
      } else if (f.item === "missile" && f.m) {
        // Steer toward the target as this screen sees it.
        let tgt: { x: number; z: number } | null = null;
        if (f.target === me) tgt = { x: p.x, z: p.z };
        else if (f.target) {
          const r = remotes.current.get(f.target)?.buffer.latest;
          if (r) tgt = { x: r.x, z: r.z };
        }
        f.m = stepMissile(f.m, tgt, dt);
        if (mine || Math.hypot(f.m.x - p.x, f.m.z - p.z) > MISSILE.hitReach) continue;
        done.current.add(f.id);
        blast([f.dx * MISSILE.push, f.dz * MISSILE.push, MISSILE.lift]);
        send({ t: "hit", id: f.id });
      }
    }
    if (changed) setFxList([...fxs.current.values()]);
  });

  return (
    <>
      <Bursts ref={bursts} />
      {shown.map((b) => {
        const pos = boxPosition(spots, b.i, b.gen, UNIT_TO_M);
        if (!pos || taken.has(`${b.i}:${b.gen}`)) return null;
        return <Crate key={`${b.i}:${b.gen}`} x={pos[0] * M_TO_UNIT} z={pos[1] * M_TO_UNIT} faded={holding} />;
      })}
      {fxList.map((f) =>
        f.item === "bomb" ? <Bombs key={f.id} fx={f} /> : f.item === "missile" ? <Missiles key={f.id} fx={f} bursts={bursts} /> : null,
      )}
    </>
  );
}
