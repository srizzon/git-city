"use client";

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { CHASSIS, GRAVITY, M_TO_UNIT, SURFACE, TURBO, UNIT_TO_M } from "@/lib/league-city/drive/tuning";
import {
  carHeading,
  headingFromRot,
  newCarState,
  placeCar,
  turboLevel,
} from "@/lib/league-city/drive/vehicle";
import { carColor, type DriverInfo } from "@/lib/league-city/drive/net";
import { TRACK, locate, pointAt, type Track } from "@/lib/league-city/race/track";
import { curbRuns, wallSegments } from "@/lib/league-city/race/layout";
import { newLapState, restartLaps, stepLaps } from "@/lib/league-city/race/laps";
import { RACE, idleRace, inRace, litLights, type RaceState } from "@/lib/league-city/race/race";
import type { RaceServerMsg, RaceWelcome, RoomBests } from "@/lib/league-city/race/net";
import TrackScene from "./TrackScene";
import RaceCamera, { type RaceCameraMode, type RaceShot } from "./RaceCamera";
import { autopilot, type AutopilotState } from "@/lib/league-city/race/autopilot";
import { sfx } from "@/lib/league-city/race/sfx";
import { TRIAL, countdownBeat, judgeLaunch, trialLights, type TrialStage } from "@/lib/league-city/race/trial";
import { DriftSparks, Ghost } from "./Ghost";
import {
  GhostRecorder,
  ghostAt,
  loadGhost,
  saveGhost,
  type GhostRun,
} from "@/lib/league-city/race/ghost";
import {
  RUN_LAPS,
  type LapNews,
  type RaceTelemetry,
  type RaceView,
  type RunResult,
} from "@/lib/league-city/race/telemetry";

// The race track's physics world and game: the walls, your car (boost from a
// tank that drifting fills), everyone else's, and the race room. The room
// times the laps; this runs the same lap logic locally only for the running
// clock, the wrong-way warning and where R puts you (the last checkpoint).
//
// The time trial runs through stages (trial.ts) the page sets: the car waits
// on the grid through the title and the flyover, is held through 3-2-1 (the
// throttle only judges the rocket start), runs three laps timed from GO, and
// past the line drives itself while the results show.

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
  /** The HUD's Restart button calls this (R does the same). */
  restartRef: React.MutableRefObject<(() => void) | null>;
  /** A time trial run ended (its laps and total), or null when a new one starts. */
  onRun: (r: RunResult | null) => void;
  /** The trial stage, when it began (performance.now) and the countdown's beat (ms). */
  stage: TrialStage;
  stageAt: number;
  beatMs: number;
  /** Move the trial on (the countdown's end, the finish, a restart). */
  onStage: (stage: TrialStage, beatMs?: number) => void;
  /** The results are up: the camera keeps the car to the left. */
  frameLeft: boolean;
}

const BUMP_SHARE = 0.7;
const BUMP_HOP = 1.2;
const BUMP_DEDUPE_MS = 500;
const U = M_TO_UNIT;
const NONE: never[] = [];

const SHOTS: Record<TrialStage, RaceShot> = { title: "title", intro: "intro", countdown: "follow", run: "follow", finish: "tv" };

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
  restartRef,
  onRun,
  stage,
  stageAt,
  beatMs,
  onStage,
  frameLeft,
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
  // A time trial run is RUN_LAPS laps from GO. `lead`: GO to the first crossing of the line, part of lap 1.
  const run = useRef<{
    start: number | null;
    lead: number;
    laps: { ms: number; valid: boolean }[];
    done: boolean;
  }>({ start: null, lead: 0, laps: [], done: false });
  // No hands on the title, the flyover and past the finish (the autopilot drives).
  const input = useDriveInput(paused || frozen || stage === "title" || stage === "intro" || stage === "finish");
  const stageRef = useRef({ stage, at: stageAt, beat: beatMs });
  useEffect(() => {
    stageRef.current = { stage, at: stageAt, beat: beatMs };
  }, [stage, stageAt, beatMs]);
  // The countdown: the beat last shown, and since when the throttle has been down (ms in).
  const count = useRef({ at: 0, beat: -1, heldFrom: null as number | null });
  const stallUntil = useRef(0);
  const pilot = useRef<AutopilotState>({ s: null });
  const raceLaps = useRef(0);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  const say = useCallback((play: () => void) => {
    if (!mutedRef.current && !document.hidden) play();
  }, []);
  const car = useRef<CarApi | null>(null);
  const impact = useRef({ strength: 0, at: 0 });
  const fx = useRef(new Map<string, FxSource>());
  const lit = useRef(0);
  const laps = useRef(newLapState());
  const race = useRef<RaceState>(idleRace());
  const offset = useRef(0);
  const placedFor = useRef(0);
  const contacts = useRef(new Map<string, number>());

  const cb = useRef({ onRace, onLap, onBests, onReceipt, onGhost, onRun, onStage });
  useEffect(() => {
    cb.current = { onRace, onLap, onBests, onReceipt, onGhost, onRun, onStage };
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
    cb.current.onRace({
      race: race.current,
      offset: offset.current,
      you: selfRef.current,
      progress: progressRef.current,
    });
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
    Object.assign(c.state, {
      drifting: false,
      spinLeft: 0,
      recovering: 0,
      driftCharge: 0,
      turboLeft: 0,
    });
    recorder.current.clear();
    respawnAt.current = spotSpawn(g.x, g.z, g.heading);
    restartLaps(laps.current);
    laps.current.s = null;
    raceLaps.current = 0;
    run.current = { start: null, lead: 0, laps: [], done: false };
    cb.current.onRun(null);
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
      const was = race.current;
      race.current = m.race;
      progressRef.current = m.progress;
      takeSlot();
      const me = selfRef.current;
      setFrozen(!!me && m.race.phase === "countdown" && inRace(m.race, me));
      // A race you're in takes over the trial; your finish in it is a finish like any other.
      const st = stageRef.current.stage;
      if (me && inRace(m.race, me) && m.race.phase === "countdown" && st !== "run") cb.current.onStage("run");
      const done = (r: RaceState) => !!me && r.finished.some((f) => f.id === me);
      if (done(m.race) && !done(was) && m.race.startsAt === was.startsAt) {
        say(sfx.finish);
        pilot.current = { s: null };
        send({ t: "auto" });
        cb.current.onStage("finish");
      }
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
      c.body.applyImpulse(
        { x: x * CHASSIS.mass, y: BUMP_HOP * CHASSIS.mass, z: z * CHASSIS.mass },
        true,
      );
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
    run.current = { start: null, lead: 0, laps: [], done: false };
    tel.current.runLap = 1;
    tel.current.runStart = null;
    cb.current.onRun(null);
    // Straight back to a short countdown, like Trackmania.
    if (stageRef.current.stage !== "title" && stageRef.current.stage !== "intro")
      cb.current.onStage("countdown", TRIAL.retryBeatMs);
  };

  // The HUD button: what R does, from outside the car.
  useEffect(() => {
    restartRef.current = () => {
      const c = car.current;
      if (!c) return;
      if (racingNow()) {
        if (stageRef.current.stage === "finish") return;
        const at = respawnAt.current;
        if (at) placeCar(c.body, at.x * UNIT_TO_M, at.z * UNIT_TO_M, headingFromRot(at.rot));
        return;
      }
      placeCar(c.body, spawn.x * UNIT_TO_M, spawn.z * UNIT_TO_M, headingFromRot(spawn.rot));
      Object.assign(c.state, newCarState(), { turbo: true });
      onReset();
    };
    return () => void (restartRef.current = null);
  });

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
    const now = performance.now();
    const sg = stageRef.current;
    hud.countdown = null;
    if (sg.stage === "countdown" && !racingNow()) {
      // 3-2-1-GO on the gantry and a beep a beat. The car is held; the throttle only judges the launch.
      const cd = count.current;
      if (cd.at !== sg.at) Object.assign(cd, { at: sg.at, beat: -1, heldFrom: null });
      const el = now - sg.at;
      const beat = countdownBeat(el, sg.beat);
      const raw = input.current.input;
      if (raw.throttle > 0) cd.heldFrom ??= el;
      else cd.heldFrom = null;
      input.current.input = { ...raw, throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
      lit.current = trialLights(beat);
      hud.lights = 0;
      hud.countdown = beat;
      if (beat !== cd.beat) {
        cd.beat = beat;
        if (beat > 0) say(sfx.beep);
      }
      if (beat === 0) {
        say(sfx.go);
        hud.goAt = now;
        const launch = judgeLaunch(cd.heldFrom, sg.beat);
        hud.launch = { kind: launch, at: now };
        if (launch === "rocket") {
          const lv = TRIAL.rocketLevel;
          Object.assign(c.state, { pushLevel: lv, turboLeft: TURBO.seconds[lv], turboPush: TURBO.push, turboFired: lv });
          say(sfx.rocket);
        } else if (launch === "early") stallUntil.current = now + TRIAL.stallMs;
        run.current = { start: serverNow, lead: 0, laps: [], done: false };
        cb.current.onStage("run");
      }
    }
    // A jumped launch: the wheels spin for a moment.
    if (now < stallUntil.current) input.current.input = { ...input.current.input, throttle: 0 };
    // Past the finish the car drives itself.
    if (sg.stage === "finish") {
      const p0 = c.body.translation();
      input.current.input = autopilot(track, pilot.current, p0.x, p0.z, carHeading(c.body), c.state.speed);
    }
    // What Shift would fire: the banked turbo, or the one this drift is charging.
    hud.driftLevel = Math.max(
      c.state.turboStored,
      c.state.drifting ? turboLevel(c.state.driftCharge) : 0,
    );
    hud.turboReady = c.state.turboStored > 0;
    hud.turbo = c.state.turboLeft > 0;
    if (c.state.turboFired) {
      hud.turboFlash = { level: c.state.turboFired, at: performance.now() };
      c.state.turboFired = 0;
    }
    // The minimap's dots.
    const me = c.body.translation();
    hud.pos = { x: me.x, z: me.z };
    const lapStart = laps.current.lapStart;
    const g =
      best.current && lapStart !== null && !racingNow()
        ? ghostAt(best.current, serverNow - lapStart)
        : null;
    hud.ghostPos = g ? { x: g.x, z: g.z } : null;
    hud.others = [];
    for (const d of remotes.current.values()) {
      const s = d.buffer.latest;
      if (s) hud.others.push({ x: s.x, z: s.z, color: d.color });
    }
    // The grid slot, in case the race news came before the car existed.
    if (r.phase === "countdown") takeSlot();
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
          if (sg.stage === "run") say(() => sfx.chime(hud.split!.delta <= 0));
        }
      }
      if (e.t === "lap") {
        if (best.current && sg.stage === "run") {
          hud.split = { delta: e.ms - best.current.ms, at: performance.now() };
          say(() => sfx.chime(hud.split!.delta <= 0));
        }
        if (racing && ++raceLaps.current === RACE.laps - 1) {
          hud.finalLapAt = performance.now();
          say(sfx.finalLap);
        }
        const lap = rec.finish(e.ms);
        const pb = e.valid && !!lap && (!best.current || e.ms < best.current.ms);
        if (pb && lap) {
          best.current = lap;
          saveGhost(slug, lap);
          cb.current.onGhost(lap.ms);
        }
        // The run: RUN_LAPS laps from the first crossing, then the flag.
        const rn = run.current;
        if (!racing && !rn.done && rn.start !== null && sg.stage === "run") {
          // Lap 1 runs from GO: the roll up to the line is part of it.
          rn.laps.push({ ms: rn.laps.length === 0 ? e.ms + rn.lead : e.ms, valid: e.valid });
          if (rn.laps.length === RUN_LAPS - 1) {
            hud.finalLapAt = performance.now();
            say(sfx.finalLap);
          }
          if (rn.laps.length >= RUN_LAPS) {
            rn.done = true;
            say(sfx.finish);
            pilot.current = { s: null };
            send({ t: "auto" });
            cb.current.onStage("finish");
            cb.current.onRun({ laps: [...rn.laps], total: Math.round(e.at - rn.start) });
          }
        }
      }
      if (e.t === "start" && !racing && !run.current.done) {
        // After a race, practice has no countdown: the run starts at the line.
        if (run.current.start === null) run.current = { start: e.at, lead: 0, laps: [], done: false };
        else run.current.lead = Math.max(0, e.at - run.current.start);
      }
      if (e.t === "start" || e.t === "lap") rec.begin(e.at);
    }
    if (!racing && !respawnAt.current) respawnAt.current = spawn;
    // In a race the clock runs from lights out; otherwise it's the lap under way.
    const rn = run.current;
    hud.lapStart =
      racing && r.phase === "live"
        ? r.startsAt
        : rn.done || sg.stage === "countdown"
          ? null
          : rn.start !== null && rn.laps.length === 0
            ? rn.start
            : l.lapStart;
    hud.runLap = Math.min(RUN_LAPS, run.current.laps.length + 1);
    hud.runStart = racing || run.current.done ? null : run.current.start;
    hud.wrongWay = l.wrongWay;
  });

  return (
    <Boundary onFail={onFail}>
      <TrackScene track={track} lit={lit} title={title} />
      <Suspense fallback={null}>
        <Physics
          timeStep={1 / 60}
          interpolate
          paused={hidden || paused}
          gravity={[0, GRAVITY, 0]}
          updatePriority={-50}
        >
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
          <Ghost
            run={best}
            lapStart={() => laps.current.lapStart}
            offset={() => offset.current}
            show={() => !racingNow() && stageRef.current.stage !== "finish"}
          />
          <RaceCamera mode={camera} car={car} track={track} shot={SHOTS[stage]} shotAt={stageAt} frameLeft={frameLeft} />
          <CameraKey input={input} onToggle={onCameraToggle} />
          <Ready onReady={onReady} />
        </Physics>
      </Suspense>
    </Boundary>
  );
}
