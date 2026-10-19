"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RallyRoute, RallyState } from "@/lib/league-city/drive/rally";
import type { ClientMsg } from "@/lib/league-city/drive/net";
import { M_TO_UNIT } from "@/lib/league-city/drive/tuning";
import { carHeading, headingFromRot, placeCar } from "@/lib/league-city/drive/vehicle";
import type { Spawn } from "@/lib/league-city/drive/spawn";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { GhostRecorder, type GhostRun } from "@/lib/league-city/race/ghost";
import { RACE_GHOST_FRAMES } from "@/lib/towns/brasil-race";
import { Ghost } from "@/components/race/Ghost";
import type { CarApi } from "./Car";
import type { BattleEvent } from "./useDrivePresence";

// A city race on your screen. The drive room runs it (lib drive/rally); this
// puts your car on its grid slot and holds it there until the lights go out,
// draws the next gates (lime arches, the finish checkered), points the arrow
// over the car at the next one, sends R back to the last gate, records your
// drive for the route's ghost, races the record's ghost when you're alone,
// and carries the room's receipt for your finish to the site.

export interface RallyApi {
  /** Start a race on this route (the room invites everyone else). */
  start: (route: RallyRoute) => void;
  /** Accept the open invite. */
  join: () => void;
}

/** What the site said about your finish. */
export type RallySaved =
  | { state: "saving" }
  | { state: "guest" }
  | { state: "error"; message: string }
  | {
      state: "saved";
      best: number;
      rank: number;
      record: { login: string; ms: number } | null;
      newRecord: boolean;
      board: { login: string; ms: number }[];
      points: number;
    };

export interface RallyView {
  rally: RallyState;
  /** serverNow = Date.now() + offset. */
  offset: number;
  you: string | null;
  /** Your finish in this race, once the room timed it. */
  saved: RallySaved | null;
}

const LIME = "#c8e64a";
const DIM = "#5d6b2a";
/** A gate: posts this far apart and this tall (m). */
const GATE_W = 18;
const GATE_H = 7;
const POST = 0.9;
/** Gates drawn ahead of the next one. */
const AHEAD = 3;

/** One arch, its opening facing +z: two posts and a bar, the finish's bar checkered. */
function Arch({ finish }: { finish: boolean }) {
  const w = GATE_W * M_TO_UNIT;
  const h = GATE_H * M_TO_UNIT;
  const p = POST * M_TO_UNIT;
  const squares = finish ? 12 : 0;
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * w) / 2, h / 2, 0]} userData={{ part: "post" }}>
          <boxGeometry args={[p, h, p]} />
          <meshBasicMaterial color={LIME} toneMapped={false} />
        </mesh>
      ))}
      {finish ? (
        Array.from({ length: squares }, (_, i) => (
          <group key={i}>
            {[0, 1].map((row) => (
              <mesh key={row} position={[-w / 2 + (w / squares) * (i + 0.5), h - p * (row + 0.5) * 1.6, 0]}>
                <boxGeometry args={[w / squares, p * 1.6, p * 0.6]} />
                <meshBasicMaterial color={(i + row) % 2 ? "#101016" : "#f4f1e8"} toneMapped={false} />
              </mesh>
            ))}
          </group>
        ))
      ) : (
        <mesh position={[0, h - p / 2, 0]} userData={{ part: "bar" }}>
          <boxGeometry args={[w + p, p * 1.4, p]} />
          <meshBasicMaterial color={LIME} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Where a gate stands and which way it faces (radians about y), units. */
function gatePose(route: RallyRoute, k: number): { x: number; z: number; yaw: number } {
  const [x, z] = route.gates[k];
  const [px, pz] = k > 0 ? route.gates[k - 1] : [route.grid[0][0], route.grid[0][1]];
  return { x: x * M_TO_UNIT, z: z * M_TO_UNIT, yaw: Math.atan2(x - px, z - pz) };
}

async function saveFinish(slug: string, token: string, ghost: GhostRun | null): Promise<RallySaved> {
  try {
    const res = await fetch(`/api/towns/${encodeURIComponent(slug)}/brasil/race`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ghost ? { token, ghost } : { token }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 401) return { state: "guest" };
    if (!res.ok) return { state: "error", message: typeof body.error === "string" ? body.error : "Couldn't save your time." };
    return { state: "saved", ...(body as Omit<Extract<RallySaved, { state: "saved" }>, "state">) };
  } catch {
    return { state: "error", message: "Couldn't save your time." };
  }
}

export default function RallyMode({
  slug,
  carRef,
  send,
  selfId,
  sinkRef,
  apiRef,
  onView,
  telemetryRef,
  respawnAt,
  recordMs,
}: {
  slug: string;
  carRef: React.MutableRefObject<CarApi | null>;
  send: (msg: ClientMsg) => void;
  selfId: React.MutableRefObject<string | null>;
  sinkRef: React.MutableRefObject<(e: BattleEvent) => void>;
  apiRef: React.MutableRefObject<RallyApi | null>;
  onView: (v: RallyView) => void;
  telemetryRef: React.MutableRefObject<DriveTelemetry>;
  /** Where R puts the car: the last gate you crossed during a race. */
  respawnAt: React.MutableRefObject<Spawn | null>;
  /** The route's record (ms) when known: a faster finish sends its ghost along. */
  recordMs?: React.MutableRefObject<number | null>;
}) {
  const [rally, setRally] = useState<RallyState | null>(null);
  const state = useRef<RallyState | null>(null);
  const offset = useRef(0);
  const saved = useRef<RallySaved | null>(null);
  /** The race your finish belongs to (the room's state goes back to idle after the results). */
  const raceId = useRef("");
  const recorder = useRef(new GhostRecorder(RACE_GHOST_FRAMES));
  const ghost = useRef<GhostRun | null>(null);
  const [ghostName, setGhostName] = useState<string | null>(null);
  const gates = useRef<(THREE.Group | null)[]>([]);
  const view = useRef(onView);
  useEffect(() => {
    view.current = onView;
  });
  const publish = () => {
    const s = state.current;
    if (s) view.current({ rally: s, offset: offset.current, you: selfId.current, saved: saved.current });
  };

  useEffect(() => {
    sinkRef.current = (e) => {
      if (e.t === "rally_receipt") {
        const s = state.current;
        if (!s || e.race !== s.id) return;
        raceId.current = e.race;
        const me = selfId.current ? s.racers[selfId.current] : undefined;
        const ms = me?.ms ?? null;
        const run = ms !== null && ms > 0 ? recorder.current.finish(ms) : null;
        const record = recordMs?.current ?? null;
        saved.current = { state: "saving" };
        publish();
        void saveFinish(slug, e.token, run && (record === null || ms! < record) ? run : null).then((res) => {
          if (raceId.current !== e.race) return;
          saved.current = res;
          publish();
          // The rest of the race's points land as the others save theirs.
          if (res.state === "saved" && s.route) {
            const key = s.route.key;
            setTimeout(() => {
              void fetch(`/api/towns/${encodeURIComponent(slug)}/brasil/race?race=${encodeURIComponent(e.race)}&key=${encodeURIComponent(key)}`)
                .then((r) => r.json())
                .then((b: { points?: number }) => {
                  const cur = saved.current;
                  if (raceId.current === e.race && cur?.state === "saved" && typeof b.points === "number") {
                    saved.current = { ...cur, points: b.points };
                    publish();
                  }
                })
                .catch(() => {});
            }, 6000);
          }
        });
        return;
      }
      if (e.t !== "rally") return;
      const prev = state.current;
      if (e.rally.id && prev?.id !== e.rally.id) {
        raceId.current = e.rally.id;
        saved.current = null;
        recorder.current.clear();
        ghost.current = null;
        setGhostName(null);
      }
      state.current = e.rally;
      offset.current = e.now - Date.now();
      setRally(e.rally);
      publish();
      // Alone on the route: the record's ghost races with you.
      const me = selfId.current;
      const r = e.rally;
      if (r.phase === "countdown" && prev?.phase !== "countdown" && me && r.racers[me] && Object.keys(r.racers).length === 1 && r.route) {
        const id = r.id;
        void fetch(`/api/towns/${encodeURIComponent(slug)}/brasil/race?key=${encodeURIComponent(r.route.key)}&ghost=1`)
          .then((res) => res.json())
          .then((b: { ghost?: { login: string; ghost: GhostRun } | null }) => {
            if (state.current?.id !== id || !b.ghost) return;
            ghost.current = b.ghost.ghost;
            setGhostName(b.ghost.login);
          })
          .catch(() => {});
      }
    };
    apiRef.current = {
      start: (route) => send({ t: "rally_start", route }),
      join: () => send({ t: "rally_join" }),
    };
    return () => {
      sinkRef.current = () => {};
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinkRef, apiRef, send, selfId, slug, recordMs]);

  const ghostColor = useMemo(() => "#9bf6ff", []);

  useFrame(() => {
    const s = state.current;
    const c = carRef.current;
    const me = selfId.current;
    const tele = telemetryRef.current;
    const mine = s && me ? s.racers[me] : undefined;
    const route = s?.route ?? null;
    const racing = !!(s && route && mine && !mine.gone && (s.phase === "countdown" || (s.phase === "live" && mine.ms === null)));

    // The arrow, the minimap's line, R.
    if (!racing || !route || !mine) {
      if (tele.route?.login === "") tele.route = null;
      tele.radar.raceLine = null;
      respawnAt.current = null;
      for (const g of gates.current) if (g) g.visible = false;
      return;
    }
    const next = Math.min(mine.next, route.gates.length - 1);
    const [gx, gz] = route.gates[next];
    tele.route = { login: "", x: gx * M_TO_UNIT, z: gz * M_TO_UNIT, reach: 0 };
    if (!tele.radar.raceLine) tele.radar.raceLine = route.gates.map(([x, z]) => [x * M_TO_UNIT, z * M_TO_UNIT] as [number, number]);
    if (mine.next > 0) {
      const g = gatePose(route, mine.next - 1);
      respawnAt.current = { x: g.x, z: g.z, rot: 180 - (g.yaw * 180) / Math.PI };
    } else {
      const [x, z, rot] = route.grid[mine.slot] ?? route.grid[0];
      respawnAt.current = { x: x * M_TO_UNIT, z: z * M_TO_UNIT, rot };
    }

    // The next gates.
    gates.current.forEach((g, i) => {
      if (!g) return;
      const k = next + i;
      // The finish is drawn on its own (FinishArch).
      g.visible = k < route.gates.length - 1;
      if (!g.visible) return;
      const p = gatePose(route, k);
      g.position.set(p.x, 0, p.z);
      g.rotation.set(0, p.yaw, 0);
      const bright = i === 0;
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.userData.part) (m.material as THREE.MeshBasicMaterial).color.set(bright ? LIME : DIM);
      });
    });

    if (!c) return;
    const serverNow = Date.now() + offset.current;
    // Held on your slot until the lights go out.
    if (s.phase === "countdown") {
      const [x, z, rot] = route.grid[mine.slot] ?? route.grid[0];
      const p = c.body.translation();
      if (Math.hypot(p.x - x, p.z - z) > 0.4 || Math.hypot(c.body.linvel().x, c.body.linvel().z) > 0.5) placeCar(c.body, x, z, headingFromRot(rot));
      return;
    }
    // Live: record your drive for the ghost, from lights out.
    if (!recorder.current.running && serverNow >= s.startsAt) recorder.current.begin(s.startsAt);
    const p = c.body.translation();
    recorder.current.push(serverNow, p.x, p.z, carHeading(c.body));
  });

  const route = rally?.route ?? null;
  const solo = ghostName !== null;
  return (
    <>
      {Array.from({ length: AHEAD }, (_, i) => (
        <group key={i} ref={(g) => void (gates.current[i] = g)} visible={false}>
          <Arch finish={false} />
        </group>
      ))}
      {route && (
        <FinishArch
          route={route}
          show={() => {
            const s = state.current;
            const me = selfId.current;
            const mine = s && me ? s.racers[me] : undefined;
            return !!(mine && s && (s.phase === "countdown" || s.phase === "live") && mine.ms === null && mine.next >= route.gates.length - AHEAD);
          }}
        />
      )}
      {solo && (
        <Ghost
          run={ghost}
          lapStart={() => (state.current?.phase === "live" ? state.current.startsAt : null)}
          offset={() => offset.current}
          show={() => state.current?.phase === "live"}
          color={ghostColor}
          label={`@${ghostName} · record`}
          near={() => {
            const c = carRef.current;
            return c ? { x: c.group.position.x, z: c.group.position.z } : null;
          }}
        />
      )}
    </>
  );
}

/** The finish line, checkered, once it's among the next gates. */
function FinishArch({ route, show }: { route: RallyRoute; show: () => boolean }) {
  const ref = useRef<THREE.Group>(null);
  const pose = useMemo(() => gatePose(route, route.gates.length - 1), [route]);
  useFrame(() => {
    if (ref.current) ref.current.visible = show();
  });
  return (
    <group ref={ref} position={[pose.x, 0, pose.z]} rotation={[0, pose.yaw, 0]} visible={false}>
      <Arch finish />
    </group>
  );
}

/** Lights out is the race's clock zero: how far into it (ms), or null before. */
export function raceClock(s: RallyState, serverNow: number): number | null {
  return s.phase === "live" && serverNow >= s.startsAt ? serverNow - s.startsAt : null;
}
