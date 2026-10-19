"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useBeforePhysicsStep } from "@react-three/rapier";
import * as THREE from "three";
import { rallyBoxSpots, type RallyRoute, type RallyState } from "@/lib/league-city/drive/rally";
import { BOX_REACH } from "@/lib/league-city/drive/battle";
import { chime } from "@/lib/sfx/chime";
import { Bursts, Crate, type VoxelBursts } from "./Voxels";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { sfx } from "@/lib/league-city/race/sfx";
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
// draws the start line and the next gates (banners across the road on two
// poles: lime for the next, dark for the one after, cream FINISH over a
// checkered line), sends R back to the last gate, times you through each gate
// against the record's splits, records your drive for the route's ghost,
// races the record's ghost when you're alone, and carries the room's receipt
// for your finish to the site. The way is always readable: lime chevrons on
// the road along the whole route (Forza's driving line), the arrow over the
// car at the next gate, the line on the minimap. Item boxes sit in rows
// across the road (rally.ts): drive through one with empty hands and the
// room gives you an attack, which Battle fires on F like any other. It
// sounds like the race track: a beep a light, GO, a chime a gate (up ahead
// of the record, down behind), a sting into the last stretch, the fanfare.

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
  /** When you went through each gate (ms from lights out), and the record's at each, for the splits. */
  gateTimes: number[];
  recordSplits: number[] | null;
}

const LIME = "#c8e64a";
const DIM_BG = "#20240f";
const DIM_FG = "#6b7a35";
const CREAM = "#f4f1e8";
const INK = "#101016";
/** A gate's banner across the road on two poles (m): wide enough for a road lot, high over the cars. */
const BANNER_W = 24;
const BANNER_H = 4.4;
const POLE_H = 7.5;
/** Gates drawn ahead of the next one. */
const AHEAD = 2;

const textures = new Map<string, THREE.CanvasTexture>();

/** A banner's face from a canvas, pixel type on a flat color; cached by its words and colors. */
function bannerTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const key = `${text}|${bg}|${fg}`;
  const hit = textures.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = Math.round((512 * BANNER_H) / BANNER_W);
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.font = `${Math.round(c.height * 0.56)}px Silkscreen, monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2 + c.height * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  textures.set(key, t);
  return t;
}

/** The banner gate (picked in the prototype): a band across the top on two thin poles, the road open under it. */
function Banner({ text, bright, finish }: { text: string; bright: boolean; finish: boolean }) {
  const w = BANNER_W * M_TO_UNIT;
  const h = BANNER_H * M_TO_UNIT;
  const pole = POLE_H * M_TO_UNIT;
  const map = useMemo(() => (finish ? bannerTexture(text, CREAM, INK) : bright ? bannerTexture(text, LIME, INK) : bannerTexture(text, DIM_BG, DIM_FG)), [text, bright, finish]);
  return (
    <group>
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[(sd * w) / 2, (pole + h) / 2, 0]}>
          <boxGeometry args={[0.8, pole + h, 0.8]} />
          <meshBasicMaterial color="#2b2f36" />
        </mesh>
      ))}
      <mesh position={[0, pole + h / 2, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={map} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {finish && <Checker />}
    </group>
  );
}

/** A checkered strip across the road at the line (start and finish). */
function Checker() {
  const w = (BANNER_W - 2) * M_TO_UNIT;
  const n = 14;
  const cell = w / n;
  return (
    <group position={[0, 0.06, 0]}>
      {Array.from({ length: n * 2 }, (_, k) => {
        const i = k % n;
        const j = Math.floor(k / n);
        return (
          <mesh key={k} rotation-x={-Math.PI / 2} position={[-w / 2 + (i + 0.5) * cell, 0, (j - 0.5) * cell]}>
            <planeGeometry args={[cell, cell]} />
            <meshBasicMaterial color={(i + j) % 2 ? INK : CREAM} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Where a gate stands (units), the way through it (deg clockwise from north, as a spawn), and the yaw that turns a banner's face to the cars coming. */
function gatePose(route: RallyRoute, k: number): { x: number; z: number; rot: number; face: number } {
  const [x, z, rot] = route.gates[k];
  return { x: x * M_TO_UNIT, z: z * M_TO_UNIT, rot, face: (-rot * Math.PI) / 180 };
}

/** The start line (units, facing the grid): from the map when the page knows it, else just ahead of the front row. */
function startPose(route: RallyRoute, fromMap: { x: number; z: number; rot: number } | null): { x: number; z: number; face: number } {
  const [x, z, rot] = route.grid[0];
  const [x2, z2] = route.grid[1] ?? route.grid[0];
  const p = fromMap ?? { x: (x + x2) / 2, z: (z + z2) / 2, rot };
  const r = (p.rot * Math.PI) / 180;
  const fx = Math.sin(r);
  const fz = -Math.cos(r);
  const lead = fromMap ? 0 : 4;
  return { x: (p.x + fx * lead) * M_TO_UNIT, z: (p.z + fz * lead) * M_TO_UNIT, face: Math.atan2(-fx, -fz) };
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
  startLine,
  routeLine,
  muted = false,
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
  /** Where the route's start line is (m), from the map. */
  startLine?: (route: RallyRoute) => { x: number; z: number; rot: number } | null;
  /** The route's path on the road (m), from the map: the chevrons follow it. */
  routeLine?: (route: RallyRoute) => [number, number][] | null;
  muted?: boolean;
}) {
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  const say = (f: () => void) => {
    if (!mutedRef.current) f();
  };
  const cue = useRef({ lit: 0, go: false, last: false });
  const boxSpots = useRef<[number, number][]>([]);
  const asked = useRef(new Set<string>());
  const [takenBoxes, setTakenBoxes] = useState<Set<string>>(() => new Set());
  const bursts = useRef<VoxelBursts | null>(null);
  const [rally, setRally] = useState<RallyState | null>(null);
  const state = useRef<RallyState | null>(null);
  const offset = useRef(0);
  const saved = useRef<RallySaved | null>(null);
  /** The race your finish belongs to (the room's state goes back to idle after the results). */
  const raceId = useRef("");
  const recorder = useRef(new GhostRecorder(RACE_GHOST_FRAMES));
  const ghost = useRef<GhostRun | null>(null);
  const [ghostName, setGhostName] = useState<string | null>(null);
  const gateTimes = useRef<number[]>([]);
  const recordSplits = useRef<number[] | null>(null);
  /** The route's record (ms), from its ghost: a faster finish sends its own ghost along. */
  const recordGhostMs = useRef<number | null>(null);
  const view = useRef(onView);
  useEffect(() => {
    view.current = onView;
  });
  const publish = () => {
    const s = state.current;
    if (s) view.current({ rally: s, offset: offset.current, you: selfId.current, saved: saved.current, gateTimes: gateTimes.current, recordSplits: recordSplits.current });
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
        const record = recordMs?.current ?? recordGhostMs.current;
        saved.current = { state: "saving" };
        publish();
        void saveFinish(slug, e.token, run && (record === null || ms! < record) ? run : null).then((res) => {
          if (raceId.current !== e.race) return;
          saved.current = res;
          publish();
          if (res.state === "saved" && res.newRecord) say(sfx.record);
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
        gateTimes.current = [];
        recordSplits.current = null;
        recordGhostMs.current = null;
        setGhostName(null);
      }
      offset.current = e.now - Date.now();
      // Gates you just went through: their time, for the split and the ghost's.
      const meId = selfId.current;
      const before = meId ? (prev?.id === e.rally.id ? prev.racers[meId]?.next : 0) : undefined;
      const after = meId ? e.rally.racers[meId]?.next : undefined;
      if (meId && prev?.id === e.rally.id && prev.racers[meId]?.ms === null && e.rally.racers[meId]?.ms != null) stopCar.current = true;
      if (before !== undefined && after !== undefined && after > before && e.rally.phase === "live") {
        const at = e.now;
        for (let k = before; k < after; k++) {
          gateTimes.current = [...gateTimes.current];
          gateTimes.current[k] = Math.max(0, at - e.rally.startsAt);
          recorder.current.checkpoint(k, at);
        }
        const gates = e.rally.route?.gates.length ?? 0;
        const theirs = recordSplits.current?.[after - 1];
        const mineAt = gateTimes.current[after - 1];
        if (after >= gates) say(sfx.finish);
        else if (after === gates - 1 && !cue.current.last) {
          cue.current.last = true;
          say(sfx.finalLap);
        } else say(() => sfx.chime(theirs === undefined || mineAt === undefined || mineAt <= theirs));
      }
      state.current = e.rally;
      setRally(e.rally);
      publish();
      // On the grid: the record's run, for the splits; alone, its ghost races with you.
      const me = selfId.current;
      const r = e.rally;
      if (r.phase === "countdown" && prev?.phase !== "countdown" && me && r.racers[me] && r.route) {
        const id = r.id;
        const solo = Object.keys(r.racers).length === 1;
        void fetch(`/api/towns/${encodeURIComponent(slug)}/brasil/race?key=${encodeURIComponent(r.route.key)}&ghost=1`)
          .then((res) => res.json())
          .then((b: { ghost?: { login: string; ms: number; ghost: GhostRun } | null }) => {
            if (state.current?.id !== id || !b.ghost) return;
            recordSplits.current = b.ghost.ghost.splits ?? null;
            recordGhostMs.current = b.ghost.ms;
            publish();
            if (!solo) return;
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

  // Held on your slot until the lights go out: before every physics step, so
  // revving on the grid never moves the car (snapping it back after a frame
  // made it hop).
  const placed = useRef<string | null>(null);
  /** Past the line: the car stops dead (the results are up). */
  const stopCar = useRef(false);
  useBeforePhysicsStep(() => {
    const car = carRef.current;
    if (stopCar.current && car) {
      stopCar.current = false;
      const v = car.body.linvel();
      car.body.setLinvel({ x: 0, y: Math.min(0, v.y), z: 0 }, true);
      car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    const s = state.current;
    const c = carRef.current;
    const me = selfId.current;
    const mine = s && me ? s.racers[me] : undefined;
    if (!s || !c || !mine || !s.route || s.phase !== "countdown") {
      placed.current = null;
      return;
    }
    const [x, z, rot] = s.route.grid[mine.slot] ?? s.route.grid[0];
    if (placed.current !== s.id) {
      placeCar(c.body, x, z, headingFromRot(rot));
      placed.current = s.id;
      return;
    }
    const p = c.body.translation();
    c.body.setTranslation({ x, y: p.y, z }, true);
    const v = c.body.linvel();
    c.body.setLinvel({ x: 0, y: v.y, z: 0 }, true);
    c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  });

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
      // Only the race's own pointer (the drift track's, from the Games menu, stays).
      if (tele.route?.race) tele.route = null;
      tele.radar.raceLine = null;
      respawnAt.current = null;
      return;
    }
    const next = Math.min(mine.next, route.gates.length - 1);
    const [gx, gz] = route.gates[next];
    tele.route = { login: "", x: gx * M_TO_UNIT, z: gz * M_TO_UNIT, reach: 0, race: true };
    if (!tele.radar.raceLine) tele.radar.raceLine = route.gates.map(([x, z]) => [x * M_TO_UNIT, z * M_TO_UNIT] as [number, number]);
    if (mine.next > 0) {
      const g = gatePose(route, mine.next - 1);
      respawnAt.current = { x: g.x, z: g.z, rot: g.rot };
    } else {
      const [x, z, rot] = route.grid[mine.slot] ?? route.grid[0];
      respawnAt.current = { x: x * M_TO_UNIT, z: z * M_TO_UNIT, rot };
    }

    if (!c) return;
    const serverNow = Date.now() + offset.current;
    // The lights: a beep as each comes on, GO as they go out.
    if (s.phase === "countdown") {
      const lit = Math.max(0, Math.min(5, Math.floor((serverNow - s.lightsAt) / 1000) + 1));
      if (serverNow >= s.lightsAt && lit > cue.current.lit) say(sfx.beep);
      cue.current.lit = serverNow >= s.lightsAt ? lit : 0;
      cue.current.go = false;
      cue.current.last = false;
      return;
    }
    if (!cue.current.go && serverNow >= s.startsAt) {
      cue.current.go = true;
      say(sfx.go);
    }
    // Live: record your drive for the ghost, from lights out.
    if (!recorder.current.running && serverNow >= s.startsAt) recorder.current.begin(s.startsAt);
    const p = c.body.translation();
    recorder.current.push(serverNow, p.x, p.z, carHeading(c.body));

    // Drive through a box with empty hands: ask the room for it (once a generation).
    if (s.phase !== "live" || tele.held) return;
    if (boxSpots.current.length !== s.boxGen.length) boxSpots.current = rallyBoxSpots(route);
    boxSpots.current.forEach(([bx, bz], i) => {
      if (serverNow < (s.boxUntil[i] ?? 0) || Math.hypot(bx - p.x, bz - p.z) > BOX_REACH) return;
      const key = `${s.id}:${i}:${s.boxGen[i]}`;
      if (asked.current.has(key)) return;
      asked.current.add(key);
      send({ t: "rally_take", box: i, gen: s.boxGen[i] });
      setTakenBoxes((t) => new Set(t).add(key));
      bursts.current?.burst(bx * M_TO_UNIT, 3.6, bz * M_TO_UNIT, { count: 46, speed: 32, colors: ["#ffd23f", "#ff9a3c", "#c8e64a", "#fff2c0"], size: 1.3, life: 0.7 });
      if (!muted) chime();
    });
  });

  const route = rally?.route ?? null;
  const solo = ghostName !== null;
  const me = rally && selfIdNow(selfId) ? rally.racers[selfIdNow(selfId)!] : undefined;
  const racing = !!(rally && route && me && !me.gone && (rally.phase === "countdown" || (rally.phase === "live" && me.ms === null)));
  const next = me ? Math.min(me.next, (route?.gates.length ?? 1) - 1) : 0;
  const start = useMemo(() => (route ? startPose(route, startLine?.(route) ?? null) : null), [route, startLine]);
  const serverNowRender = Date.now() + offset.current;
  const crates =
    racing && route && rally?.phase === "live"
      ? rallyBoxSpots(route).flatMap(([x, z], i) => {
          const key = `${rally.id}:${i}:${rally.boxGen[i]}`;
          return serverNowRender < (rally.boxUntil[i] ?? 0) || takenBoxes.has(key) ? [] : [{ key, x, z }];
        })
      : [];
  return (
    <>
      <Bursts ref={bursts} />
      {racing && route && <Chevrons line={routeLine?.(route) ?? null} />}
      {crates.map((b) => (
        <Crate key={b.key} x={b.x * M_TO_UNIT} z={b.z * M_TO_UNIT} size={6} />
      ))}
      {racing && route && start && rally?.phase === "countdown" && (
        <group position={[start.x, 0, start.z]} rotation={[0, start.face, 0]}>
          <Checker />
        </group>
      )}
      {racing &&
        route &&
        Array.from({ length: AHEAD }, (_, i) => next + i)
          .filter((k) => k < route.gates.length)
          .map((k, i) => {
            const p = gatePose(route, k);
            const finish = k === route.gates.length - 1;
            return (
              <group key={k} position={[p.x, 0, p.z]} rotation={[0, p.face, 0]}>
                <Banner text={finish ? "FINISH" : `CHECKPOINT ${k + 1}`} bright={i === 0} finish={finish} />
              </group>
            );
          })}
      {racing && route && next + AHEAD <= route.gates.length - 1 && next >= route.gates.length - 1 - 4 && (
        <FinishBanner route={route} />
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

/** One chevron on the road, its point toward -z (city units): two flat bars in a V. */
function chevronGeometry(): THREE.BufferGeometry {
  const arm = 9;
  const bar = 2.2;
  const parts = [-1, 1].map((s) => {
    const g = new THREE.BoxGeometry(bar, 0.2, arm);
    g.rotateY(s * 0.75);
    g.translate(s * arm * 0.33, 0, -arm * 0.18);
    return g;
  });
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return merged;
}

const CHEVRON_EVERY = 10;

/** The route painted on the road, a lime chevron every CHEVRON_EVERY m from start to finish, all in one draw. */
function Chevrons({ line }: { line: [number, number][] | null }) {
  const geometry = useMemo(() => chevronGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const spots = useMemo(() => {
    const out: { x: number; z: number; yaw: number }[] = [];
    if (!line || line.length < 2) return out;
    let carry = 0;
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1];
      const [bx, bz] = line[i];
      const len = Math.hypot(bx - ax, bz - az);
      if (len === 0) continue;
      const yaw = Math.atan2(bx - ax, bz - az);
      for (let d = carry; d < len; d += CHEVRON_EVERY) out.push({ x: (ax + ((bx - ax) * d) / len) * M_TO_UNIT, z: (az + ((bz - az) * d) / len) * M_TO_UNIT, yaw });
      carry = (carry - len) % CHEVRON_EVERY;
      if (carry < 0) carry += CHEVRON_EVERY;
    }
    return out;
  }, [line]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    spots.forEach((p, i) => {
      o.position.set(p.x, 0.18, p.z);
      // The V's point is at -z in its geometry: turn it to point along the road.
      o.rotation.set(0, p.yaw + Math.PI, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.count = spots.length;
    m.instanceMatrix.needsUpdate = true;
  }, [spots]);
  if (!spots.length) return null;
  return (
    <instancedMesh key={spots.length} ref={mesh} args={[geometry, undefined, spots.length]} frustumCulled={false}>
      <meshBasicMaterial color={LIME} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/** Who you are in the room (read while rendering: the room's state re-renders this on every change). */
function selfIdNow(ref: React.MutableRefObject<string | null>): string | null {
  return ref.current;
}

/** The finish banner, from a few gates out: you see where it ends. */
function FinishBanner({ route }: { route: RallyRoute }) {
  const p = useMemo(() => gatePose(route, route.gates.length - 1), [route]);
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, p.face, 0]}>
      <Banner text="FINISH" bright={false} finish />
    </group>
  );
}

/** Lights out is the race's clock zero: how far into it (ms), or null before. */
export function raceClock(s: RallyState, serverNow: number): number | null {
  return s.phase === "live" && serverNow >= s.startsAt ? serverNow - s.startsAt : null;
}
