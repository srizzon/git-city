"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityObject } from "@/lib/league-city/types";
import { boxPosition, boxSpots } from "@/lib/league-city/drive/battle";
import { CROWN, type CrownState } from "@/lib/league-city/drive/crown";
import { INTERP_MS, emptySnapshot, type ClientMsg } from "@/lib/league-city/drive/net";
import { M_TO_UNIT, UNIT_TO_M } from "@/lib/league-city/drive/tuning";
import { spinOut } from "@/lib/league-city/drive/vehicle";
import type { CarApi } from "./Car";
import type { BattleEvent, RemoteDriver } from "./useDrivePresence";
import { Bursts, type VoxelBursts } from "./Voxels";

// Crown Rush on your screen. The room server runs the match; this draws the
// crown (loose, with a beam of light so you can find it, or floating over
// whoever holds it), picks it up when you drive into it, reports when you
// bump the holder (with boost: a steal), drops it when a blast catches you,
// and slows you down while you hold it.

export interface CrownApi {
  /** Start a match (the crown appears at a random road or plaza). */
  start: () => void;
}

export interface CrownView {
  crown: CrownState;
  /** serverNow = Date.now() + offset. */
  offset: number;
  you: string | null;
}

const GOLD = "#ffcf33";
const GOLD_DARK = "#c98f10";
const GEM = "#ff4f7a";

/** A blocky crown, ~5 units across, sitting on y = 0. */
function VoxelCrown() {
  const blocks = useMemo(() => {
    const out: { p: [number, number, number]; s: number; c: string }[] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * 2;
      const z = Math.sin(a) * 2;
      out.push({ p: [x, 0.5, z], s: 1.2, c: GOLD_DARK });
      if (i % 2 === 0) {
        out.push({ p: [x, 1.6, z], s: 1, c: GOLD });
        out.push({ p: [x, 2.5, z], s: 0.6, c: GEM });
      }
    }
    return out;
  }, []);
  return (
    <group>
      {blocks.map((b, i) => (
        <mesh key={i} position={b.p}>
          <boxGeometry args={[b.s, b.s, b.s]} />
          <meshBasicMaterial color={b.c} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function CrownMode({
  objects,
  carRef,
  remotes,
  send,
  selfId,
  sinkRef,
  apiRef,
  hitRef,
  knockRef,
  onView,
}: {
  objects: CityObject[];
  carRef: React.MutableRefObject<CarApi | null>;
  remotes: React.MutableRefObject<Map<string, RemoteDriver>>;
  send: (msg: ClientMsg) => void;
  selfId: React.MutableRefObject<string | null>;
  sinkRef: React.MutableRefObject<(e: BattleEvent) => void>;
  apiRef: React.MutableRefObject<CrownApi | null>;
  /** You bumped another driver's car. */
  hitRef: React.MutableRefObject<(id: string) => void>;
  /** A blast caught your car. */
  knockRef: React.MutableRefObject<() => void>;
  onView: (v: CrownView) => void;
}) {
  const [crown, setCrown] = useState<CrownState | null>(null);
  const state = useRef<CrownState | null>(null);
  const offset = useRef(0);
  const lastGrab = useRef(0);
  const group = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const bursts = useRef<VoxelBursts | null>(null);
  const snap = useRef(emptySnapshot());
  const spots = useMemo(() => boxSpots(objects), [objects]);
  const view = useRef(onView);
  useEffect(() => {
    view.current = onView;
  });

  useEffect(() => {
    sinkRef.current = (e) => {
      if (e.t !== "crown") return;
      const prev = state.current;
      state.current = e.crown;
      offset.current = e.now - Date.now();
      setCrown(e.crown);
      view.current({ crown: e.crown, offset: offset.current, you: selfId.current });
      // Lost it: spin for a moment, like a Mario Kart hit.
      const me = selfId.current;
      if (e.crown.phase === "live" && prev?.holder === me && e.crown.holder !== me && carRef.current) spinOut(carRef.current.state, 1);
      // Confetti of gold cubes when someone wins.
      if (e.crown.phase === "over" && prev?.phase === "live" && bursts.current) {
        const at = prev.holder && prev.holder === e.crown.winner ? null : { x: e.crown.x, z: e.crown.z };
        const c = carRef.current;
        const p = e.crown.winner === selfId.current && c ? c.body.translation() : at ? { x: at.x, z: at.z } : null;
        if (p) bursts.current.burst(p.x * M_TO_UNIT, 6, p.z * M_TO_UNIT, { count: 140, speed: 50, colors: [GOLD, GOLD_DARK, GEM, "#ffffff"], size: 1.4, life: 1.8 });
      }
    };
    apiRef.current = {
      start: () => {
        const slot = Math.floor(Math.random() * 1000);
        const pos = boxPosition(spots, slot, Date.now() & 0xffff, UNIT_TO_M);
        const c = carRef.current?.body.translation();
        const [x, z] = pos ?? (c ? [c.x + 20, c.z] : [0, 0]);
        send({ t: "crown_start", x, z });
      },
    };
    hitRef.current = (id) => {
      const s = state.current;
      const c = carRef.current;
      if (!s || s.phase !== "live" || s.holder !== id || !c) return;
      send({ t: "crown_hit", victim: id, steal: c.state.boosting });
    };
    knockRef.current = () => {
      const s = state.current;
      if (s?.phase === "live" && s.holder === selfId.current) send({ t: "crown_drop" });
    };
    return () => {
      sinkRef.current = () => {};
      apiRef.current = null;
      hitRef.current = () => {};
      knockRef.current = () => {};
    };
  }, [sinkRef, apiRef, hitRef, knockRef, send, selfId, spots, carRef]);

  useFrame((three) => {
    const s = state.current;
    const c = carRef.current;
    const g = group.current;
    const me = selfId.current;
    if (c) c.state.topMul = s?.phase === "live" && s.holder === me ? CROWN.holderSpeed : 1;
    if (!g || !s) return;
    const active = s.phase === "live" || s.phase === "countdown";
    g.visible = active;
    if (!active) return;
    const t = three.clock.elapsedTime;
    const serverNow = Date.now() + offset.current;

    // Where the crown is: over the holder's car, or loose on the ground.
    let x = s.x * M_TO_UNIT;
    let z = s.z * M_TO_UNIT;
    let y = 3 + Math.sin(t * 2) * 0.8;
    // Just knocked off: it arcs from the car to where it lands.
    const flying = !s.holder && (serverNow - (s.takeAt - CROWN.loose)) / CROWN.loose;
    if (flying !== false && flying < 1) {
      const k = Math.max(0, flying);
      x = (s.fromX + (s.x - s.fromX) * k) * M_TO_UNIT;
      z = (s.fromZ + (s.z - s.fromZ) * k) * M_TO_UNIT;
      y = 6 + Math.sin(Math.PI * k) * 12;
    }
    if (s.holder) {
      if (s.holder === me && c) {
        x = c.group.position.x;
        z = c.group.position.z;
        y = c.group.position.y + 9;
      } else {
        const r = remotes.current.get(s.holder)?.buffer.sample(performance.now() - INTERP_MS, snap.current);
        if (r) {
          x = r.x * M_TO_UNIT;
          z = r.z * M_TO_UNIT;
          y = r.y * M_TO_UNIT + 9;
        }
      }
    }
    g.position.set(x, y, z);
    g.rotation.y = t * 1.5;
    if (beam.current) {
      beam.current.position.set(x, 60, z);
      beam.current.scale.set(s.holder ? 0.6 : 1, 1, s.holder ? 0.6 : 1);
    }

    // Drive into a loose crown to take it.
    const locked = s.lockId === me && serverNow < s.lockUntil;
    if (s.phase === "live" && !s.holder && c && serverNow >= s.takeAt && !locked) {
      const p = c.body.translation();
      const now = performance.now();
      if (Math.hypot(p.x - s.x, p.z - s.z) < CROWN.reach && now - lastGrab.current > 300) {
        lastGrab.current = now;
        send({ t: "crown_grab" });
      }
    }
  });

  const active = crown && (crown.phase === "live" || crown.phase === "countdown");
  return (
    <>
      <Bursts ref={bursts} />
      <group ref={group} visible={false}>
        <VoxelCrown />
      </group>
      {active && (
        <mesh ref={beam}>
          <boxGeometry args={[3, 120, 3]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      )}
    </>
  );
}
