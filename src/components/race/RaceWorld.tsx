"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import Car, { type CarApi } from "@/components/league/drive/Car";
import Lights from "@/components/league/drive/Lights";
import { BoostTrail, Smoke } from "@/components/league/drive/Particles";
import RemoteCars from "@/components/league/drive/RemoteCars";
import SkidMarks from "@/components/league/drive/SkidMarks";
import { CameraKey, DriveAudio, LocalFx } from "@/components/league/drive/carFx";
import type { FxSource } from "@/components/league/drive/fx";
import { useDriveInput } from "@/components/league/drive/useDriveInput";
import { useDrivePresence } from "@/components/league/drive/useDrivePresence";
import type { Spawn } from "@/lib/league-city/drive/spawn";
import type { SurfaceGrip } from "@/lib/league-city/drive/surface";
import { CHASSIS, GRAVITY, M_TO_UNIT, SURFACE, UNIT_TO_M } from "@/lib/league-city/drive/tuning";
import { carHeading, placeCar, turboLevel } from "@/lib/league-city/drive/vehicle";
import { carColor, type DriverInfo } from "@/lib/league-city/drive/net";
import { TRACK, locate, pointAt, type Track } from "@/lib/league-city/race/track";
import { curbRuns, wallSegments } from "@/lib/league-city/race/layout";
import { newLapState, restartLaps, stepLaps } from "@/lib/league-city/race/laps";
import { idleRace, inRace, litLights, type RaceState } from "@/lib/league-city/race/race";
import type { RaceServerMsg, RaceWelcome, RoomBests } from "@/lib/league-city/race/net";
import TrackScene from "./TrackScene";
import RaceCamera, { type RaceCameraMode } from "./RaceCamera";
import { DriftSparks, Ghost } from "./Ghost";
import { GhostRecorder, loadGhost, saveGhost, type GhostRun } from "@/lib/league-city/race/ghost";
import type { LapNews, RaceTelemetry, RaceView } from "@/lib/league-city/race/telemetry";

// The race track's physics world and game: the walls, your car (boost from a
// tank that drifting fills), everyone else's, and the race room. The room
// times the laps; this runs the same lap logic locally only for the running
// clock, the wrong-way warning and where R puts you (the last checkpoint).

export interface RaceWorldProps {
  track: Track;
  slug: string;
  title: string;
  name: string;
  telemetry: RaceTelemetry;
  camera: RaceCameraMode;
  onCameraToggle: () => void;
  muted: boolean;
  paused: boolean;
  onReady: () => void;
  onFail: () => void;
  onDrivers: (d: DriverInfo[]) => void;
  onRace: (v: RaceView) => void;
  onLap: (e: LapNews) => void;
  onBests: (b: RoomBests) => void;
  /** A signed receipt for your valid lap. */
  onReceipt: (token: string) => void;
  /** The HUD's Start race button calls this. */
  startRef: React.MutableRefObject<(() => void) | null>;
  /** Your best lap in this browser changed (ms). */
  onGhost: (ms: number | null) => void;
}

const BUMP_SHARE = 0.7;
const BUMP_HOP = 1.2;
const BUMP_DEDUPE_MS = 500;
const U = M_TO_UNIT;
const NONE: never[] = [];

class Boundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error("[race]", err);
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

/** A car's heading as a spawn's rot (degrees clockwise from north). */
const rotOf = (heading: number) => ((Math.PI - heading) * 180) / Math.PI;

function spotSpawn(x: number, z: number, heading: number): Spawn {
  return { x: x * U, z: z * U, rot: rotOf(heading) };
}

/** Surface under a point in city units: asphalt, curbs (plaza grip) or the grass runoff. */
function trackSurface(track: Track): (wx: number, wz: number) => SurfaceGrip {
  const curbs = curbRuns(track);
  const onCurb = (s: number) => curbs.some(([a, b]) => s >= a && s <= b);
  const road: SurfaceGrip = { surface: "road", ...SURFACE.road };
  const curb: SurfaceGrip = { surface: "plaza", ...SURFACE.plaza };
  const grass: SurfaceGrip = { surface: "grass", ...SURFACE.grass };
  return (wx, wz) => {
    const spot = locate(track, wx * UNIT_TO_M, wz * UNIT_TO_M, 24);
    if (!spot) return grass;
    const d = Math.abs(spot.lateral);
    if (d <= TRACK.width / 2) return road;
    if (d <= TRACK.width / 2 + TRACK.curb && onCurb(spot.s)) return curb;
    return grass;
  };
}

function Walls({ track }: { track: Track }) {
  const segs = useMemo(() => wallSegments(track), [track]);
  const h = TRACK.wallHeight / 2;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[2000, 1, 2000]} position={[0, -1, 0]} friction={0.6} />
      {segs.map((w) => (
        <CuboidCollider
          key={`${w.side}:${w.i}`}
          args={[TRACK.wallThickness / 2, h, w.len / 2]}
          position={[w.x, h, w.z]}
          rotation={[0, w.rotY, 0]}
          friction={0.1}
          restitution={0.2}
        />
      ))}
    </RigidBody>
  );
}

export default function RaceWorld({
  track,
  slug,
  title,
  name,
  telemetry,
  camera,
  onCameraToggle,
  muted,
  paused,
  onReady,
  onFail,
  onDrivers,
  onRace,
  onLap,
  onBests,
  onReceipt,
  startRef,
  onGhost,
}: RaceWorldProps) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const surface = useMemo(() => trackSurface(track), [track]);
  // Your start spot: a random grid slot, so two arrivals don't stack. R in practice brings you back here.
  const [spawn] = useState(() => {
    const g = track.grid[Math.floor(Math.random() * track.grid.length)];
    return spotSpawn(g.x, g.z, g.heading);
  });
  const respawnAt = useRef<Spawn | null>(null);

  // Held on the grid until the lights go out.
  const [frozen, setFrozen] = useState(false);
  const input = useDriveInput(paused || frozen);
  const car = useRef<CarApi | null>(null);
  const impact = useRef({ strength: 0, at: 0 });
  const fx = useRef(new Map<string, FxSource>());
  const lit = useRef(0);
  const laps = useRef(newLapState());
  const race = useRef<RaceState>(idleRace());
  const offset = useRef(0);
  const placedFor = useRef(0);
  const contacts = useRef(new Map<string, number>());

  const cb = useRef({ onRace, onLap, onBests, onReceipt, onGhost });
  useEffect(() => {
    cb.current = { onRace, onLap, onBests, onReceipt, onGhost };
  });
  // Your best lap here: the ghost, its splits and time.
  const best = useRef<GhostRun | null>(null);
  const recorder = useRef(new GhostRecorder());
  useEffect(() => {
    best.current = loadGhost(slug);
    cb.current.onGhost(best.current?.ms ?? null);
  }, [slug]);

  const tel = useRef(telemetry);
  useEffect(() => {
    tel.current = telemetry;
  }, [telemetry]);
  const selfRef = useRef<string | null>(null);
  const progressRef = useRef<Record<string, number>>({});
  const publish = useCallback(() => {
    cb.current.onRace({ race: race.current, offset: offset.current, you: selfRef.current, progress: progressRef.current });
  }, []);

  /** On the grid for a race that's counting down: put the car on its slot, once. */
  const takeSlot = useCallback(() => {
    const r = race.current;
    const me = selfRef.current;
    const c = car.current;
    if (!me || !c || r.phase !== "countdown" || placedFor.current === r.startsAt) return;
    const slot = r.grid.indexOf(me);
    if (slot < 0) return;
    const g = track.grid[slot];
    placedFor.current = r.startsAt;
    placeCar(c.body, g.x, g.z, g.heading);
    Object.assign(c.state, { drifting: false, spinLeft: 0, recovering: 0, driftCharge: 0, turboLeft: 0 });
    recorder.current.clear();
    respawnAt.current = spotSpawn(g.x, g.z, g.heading);
    restartLaps(laps.current);
    laps.current.s = null;
  }, [track]);

  const onOther = (msg: { t: string } & Record<string, unknown>) => {
    if (msg.t === "welcome") {
      const w = msg as unknown as RaceWelcome;
      offset.current = w.now - Date.now();
      if (w.race) race.current = w.race;
      cb.current.onBests(w.bests ?? []);
      publish();
      return;
    }
    const m = msg as unknown as RaceServerMsg;
    if (m.t === "race") {
      offset.current = m.now - Date.now();
      race.current = m.race;
      progressRef.current = m.progress;
      takeSlot();
      const me = selfRef.current;
      setFrozen(!!me && m.race.phase === "countdown" && inRace(m.race, me));
      publish();
    } else if (m.t === "lap" || m.t === "void") {
      cb.current.onLap(m);
    } else if (m.t === "bests") {
      cb.current.onBests(m.bests);
    } else if (m.t === "receipt") {
      cb.current.onReceipt(m.token);
    }
  };

  const { remotes, drivers, sendBump, send, selfId } = useDrivePresence({
    slug,
    name,
    car,
    input,
    party: "race",
    onOther,
    onBump: (from, x, z) => {
      const c = car.current;
      if (!c || performance.now() - (contacts.current.get(from) ?? 0) < BUMP_DEDUPE_MS) return;
      c.body.applyImpulse({ x: x * CHASSIS.mass, y: BUMP_HOP * CHASSIS.mass, z: z * CHASSIS.mass }, true);
      impact.current = { strength: Math.min(1, Math.hypot(x, z) / 12), at: performance.now() };
    },
    onBattle: () => {},
  });
  useEffect(() => onDrivers(drivers), [drivers, onDrivers]);
  const cars = drivers.flatMap((d) => remotes.current.get(d.id) ?? []);

  useEffect(() => {
    startRef.current = () => send({ t: "race_start" });
    return () => void (startRef.current = null);
  }, [send, startRef]);

  const onRemoteHit = (id: string, other: RapierRigidBody) => {
    const c = car.current;
    const now = performance.now();
    const last = contacts.current.get(id) ?? 0;
    contacts.current.set(id, now);
    if (!c || now - last < BUMP_DEDUPE_MS) return;
    const mine = c.body.linvel();
    const theirs = other.linvel();
    sendBump(id, (mine.x - theirs.x) * BUMP_SHARE, (mine.z - theirs.z) * BUMP_SHARE);
  };

  const racingNow = () => {
    const r = race.current;
    const me = selfRef.current;
    return !!me && (r.phase === "countdown" || r.phase === "live") && inRace(r, me);
  };
  // R. In a race: back to the last checkpoint (Car does it). In practice: a
  // fresh attempt from your start spot; the server's lap starts over too.
  const onReset = () => {
    if (racingNow()) return;
    send({ t: "restart" });
    restartLaps(laps.current);
    recorder.current.clear();
    tel.current.lapStart = null;
    tel.current.split = null;
  };

  // Local lap logic, the lights and the HUD's numbers.
  const lastStep = useRef(0);
  useFrame(() => {
    selfRef.current = selfId.current;
    const serverNow = Date.now() + offset.current;
    const r = race.current;
    const hud = tel.current;
    lit.current = litLights(r, serverNow);
    hud.lights = lit.current;
    hud.offset = offset.current;
    // Lights out on this clock, not when the news arrives.
    if (frozen && r.phase !== "countdown") setFrozen(false);
    if (frozen && serverNow >= r.startsAt) setFrozen(false);
    const c = car.current;
    if (!c) return;
    hud.driftLevel = c.state.drifting ? turboLevel(c.state.driftCharge) : 0;
    hud.turbo = c.state.turboLeft > 0;
    // The grid slot, in case the race news came before the car existed.
    if (r.phase === "countdown") takeSlot();
    const now = performance.now();
    if (now - lastStep.current < 66) return;
    lastStep.current = now;
    const p = c.body.translation();
    const l = laps.current;
    const racing = racingNow();
    const rec = recorder.current;
    rec.push(serverNow, p.x, p.z, carHeading(c.body));
    for (const e of stepLaps(track, l, p.x, p.z, serverNow)) {
      if (e.t === "start" || e.t === "lap" || e.t === "checkpoint") {
        // In a race R brings you back to the checkpoint you last crossed, facing the right way.
        const s = e.t === "checkpoint" ? track.checkpoints[e.k] : 0;
        const q = pointAt(track, s);
        respawnAt.current = racing ? spotSpawn(q.x, q.z, Math.atan2(q.tx, q.tz)) : spawn;
      }
      if (e.t === "checkpoint") {
        rec.checkpoint(e.k, e.at);
        const pb = best.current?.splits[e.k];
        if (TRACK.splits.includes(e.k) && pb !== undefined && l.lapStart !== null && l.valid) {
          hud.split = { delta: Math.round(e.at - l.lapStart - pb), at: performance.now() };
        }
      }
      if (e.t === "lap") {
        const run = rec.finish(e.ms);
        if (e.valid && run && (!best.current || e.ms < best.current.ms)) {
          best.current = run;
          saveGhost(slug, run);
          cb.current.onGhost(run.ms);
        }
        if (best.current) hud.split = { delta: e.ms - best.current.ms, at: performance.now() };
      }
      if (e.t === "start" || e.t === "lap") rec.begin(e.at);
    }
    if (!racing && !respawnAt.current) respawnAt.current = spawn;
    // In a race the clock runs from lights out; otherwise it's the lap under way.
    hud.lapStart = racing && r.phase === "live" ? r.startsAt : l.lapStart;
    hud.wrongWay = l.wrongWay;
  });

  return (
    <Boundary onFail={onFail}>
      <TrackScene track={track} lit={lit} title={title} />
      <Suspense fallback={null}>
        <Physics timeStep={1 / 60} interpolate paused={hidden || paused} gravity={[0, GRAVITY, 0]} updatePriority={-50}>
          <Walls track={track} />
          <Car
            spawn={spawn}
            objects={NONE}
            buildings={NONE}
            h={0}
            input={input}
            telemetry={telemetry}
            apiRef={car}
            color={carColor(name)}
            onRemoteHit={onRemoteHit}
            impact={impact}
            surface={surface}
            respawnAt={respawnAt}
            onReset={onReset}
            turbo
          >
            <Lights braking={() => !!car.current?.state.braking} />
          </Car>
          <LocalFx car={car} sources={fx} />
          <RemoteCars cars={cars} sources={fx} localCar={car} muted={muted || paused} />
          <SkidMarks sources={fx} />
          <Smoke sources={fx} />
          <BoostTrail sources={fx} />
          <DriveAudio car={car} input={input} impact={impact} muted={muted || paused} />
          <DriftSparks car={car} />
          <Ghost run={best} lapStart={() => laps.current.lapStart} offset={() => offset.current} show={() => !racingNow()} />
          <RaceCamera mode={camera} car={car} />
          <CameraKey input={input} onToggle={onCameraToggle} />
          <Ready onReady={onReady} />
        </Physics>
      </Suspense>
    </Boundary>
  );
}
