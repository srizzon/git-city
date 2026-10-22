"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { spawnPoint, type Spawn } from "@/lib/league-city/drive/spawn";
import type { IntroPose } from "@/lib/league-city/intro";
import type { TouchDrive } from "@/lib/league-city/drive/touch";
import type { DriveCameraMode, DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { CHASSIS, GRAVITY, M_TO_UNIT, RESPAWN } from "@/lib/league-city/drive/tuning";
import Car, { type CarApi } from "./Car";
import DriveCamera from "./DriveCamera";
import Battle from "./Battle";
import CrownMode, { type CrownApi, type CrownView } from "./CrownMode";
import RallyMode, { type RallyApi, type RallyView } from "./RallyMode";
import type { RallyRoute } from "@/lib/league-city/drive/rally";
import HonkFlash from "./HonkFlash";
import RouteArrow from "./RouteArrow";
import Lights from "./Lights";
import { BoostTrail, EngineSmoke, Smoke } from "./Particles";
import SkidMarks from "./SkidMarks";
import { useDrivePresence, type BattleEvent, type CarFeed } from "./useDrivePresence";
import RemoteCars, { type BotTarget } from "./RemoteCars";
import { useTownBots } from "./useTownBots";
import type { FxSource } from "./fx";
import { CameraKey, DriveAudio, LocalFx } from "./carFx";
import { INTERP_MS, carColor, emptySnapshot, type ClientMsg, type DriverInfo } from "@/lib/league-city/drive/net";
import { useDriveInput } from "./useDriveInput";
import EmoteBubbles, { type EmoteApi } from "./EmoteBubbles";
import type { EmoteLogEntry } from "@/lib/league-city/drive/emote-log";
import Smash, { type SmashApi, type SmashSide } from "./Smash";
import TreeBubble, { type BubbleTree } from "./TreeBubble";
import type { SmashStore } from "@/lib/league-city/smash";
import { createBrowserSupabase } from "@/lib/supabase";
import { applyRoomDamage } from "@/lib/league-city/smash-net";
import { FLOOR_DAY_CAP } from "@/lib/league-city/smash-floors";
import HeistMode, { LightBar, type HeistApi, type HeistDriveProps } from "./HeistMode";
import { isSide, kitOnly, type HeistSide } from "@/lib/towns/heist";

// Drive mode's physics world. Loaded with next/dynamic only when someone
// presses Drive, so the Rapier WASM never reaches viewers or editors.
// Fixed shapes (buildings, trees, ramps, walls, ground) share one body and
// are keyed by shape, so a city change only swaps what changed.

export interface DriveWorldProps {
  objects: CityObject[];
  buildings: CityBuilding[];
  h: number;
  viewerDevId: number | null;
  /** Start at this dev's building instead of yours (the knocked-down email's Hit back). */
  spawnDevId?: number | null;
  /** Start here instead of at a building (back from a town's drift track). */
  spawnAt?: Spawn | null;
  /** The town intro is driving the car (see Car); input and the drive camera wait for it. */
  scripted?: React.MutableRefObject<IntroPose | null>;
  /** The intro still has the camera and the controls. */
  cinematic?: boolean;
  /** The intro handed the car over: the drive camera starts where it left off. */
  seamless?: boolean;
  /** Phone controls, written by the HUD (lib drive/touch). */
  touch?: React.MutableRefObject<TouchDrive>;
  telemetry: DriveTelemetry;
  camera: DriveCameraMode;
  onCameraToggle: () => void;
  muted: boolean;
  /** Master volume 0…1 (lib drive/volume). */
  volume?: number;
  /** Quick reactions: the HUD's keys 1–6 and buttons call into this. */
  emoteApi?: React.MutableRefObject<EmoteApi | null>;
  /** Every reaction in the room, for the HUD's log. */
  onEmoteLog?: (entry: EmoteLogEntry) => void;
  /** Esc: physics, input and sound stop. */
  paused: boolean;
  /** A guest's car running out of gas since then (performance.now; lib drive/guest-gate). */
  stallAt?: number | null;
  /** Rapier and the car are loaded. */
  onReady: () => void;
  /** Rapier or the models failed to load. */
  onFail: () => void;
  /** League slug: the drive room everyone in this city shares. */
  slug: string;
  /** Where item boxes may appear, when not every road and plaza (the Brasil map: its cities' streets). */
  boxSpots?: [number, number][];
  /** Trees as a physics bubble round the car (a map with thousands: TreeBubble), instead of fixed trunks. */
  trees?: { list: BubbleTree[]; onHidden: (ids: ReadonlySet<string>) => void };
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
  /** City races (the Brasil map): the HUD starts and joins them through this; null elsewhere. */
  rally?: {
    api: React.MutableRefObject<RallyApi | null>;
    onView: (v: RallyView) => void;
    /** The route's record (ms), when the HUD knows it: a faster finish sends its ghost. */
    recordMs: React.MutableRefObject<number | null>;
    /** Where a route's start line is (m, heading deg), worked out from the map: the room's route doesn't carry it. */
    startLine?: (route: RallyRoute) => { x: number; z: number; rot: number } | null;
    /** The route's path on the road (m), from the map: the chevrons follow it. */
    routeLine?: (route: RallyRoute) => [number, number][] | null;
  };
  /** The town's floors (lib/league-city/smash). Signed in, every building but yours has no collider: the car drives through and breaks it. */
  smash?: SmashStore;
  /** Single-player preview: no drive room, no other cars. */
  offline?: boolean;
  /** Guests: one free building breaks on this screen only; called with its login once it falls. */
  onTaste?: (login: string) => void;
  /** Every room message the drive doesn't handle itself, and the welcome (the Brasil map's State War listens here). */
  onRoom?: (msg: { t: string } & Record<string, unknown>) => void;
  /** The Brasil map's city of the day (HeistMode): its ring, your side, the HUD's hooks; `token` a side the site signed mid-drive, for the room. */
  heist?: HeistDriveProps & { token: string | null; apiRef?: React.MutableRefObject<HeistApi | null> };
}

/** Your Supabase access token for the drive room (null signed out: you drive, you don't smash). */
async function smashToken(): Promise<string | null> {
  const { data } = await createBrowserSupabase().auth.getSession();
  return data.session?.access_token ?? null;
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

// ─── Minimap feed ────────────────────────────────────────────

const _fwd = new THREE.Vector3();

/** Writes where you, the other cars and the bots are for the HUD's minimap. */
function RadarFeed({
  car,
  cars,
  telemetryRef,
  ring,
}: {
  car: React.MutableRefObject<CarApi | null>;
  cars: CarFeed[];
  telemetryRef: React.MutableRefObject<DriveTelemetry>;
  /** The city of the day's ring (m), for the minimap. */
  ring?: { x: number; z: number; r: number } | null;
}) {
  const snaps = useRef<ReturnType<typeof emptySnapshot>[]>([]);
  useFrame(() => {
    const r = telemetryRef.current.radar;
    r.heist = ring ? { x: ring.x * M_TO_UNIT, z: ring.z * M_TO_UNIT, r: ring.r * M_TO_UNIT } : null;
    const c = car.current;
    if (c) {
      r.x = c.group.position.x;
      r.z = c.group.position.z;
      // The chassis faces +z; heading is clockwise from north (-z).
      _fwd.set(0, 0, 1).applyQuaternion(c.group.quaternion);
      r.heading = Math.atan2(_fwd.x, -_fwd.z);
    }
    const t = performance.now() - INTERP_MS;
    r.cars.length = 0;
    cars.forEach((f, i) => {
      const s = f.buffer.sample(t, (snaps.current[i] ??= emptySnapshot()));
      if (s) r.cars.push({ x: s.x * M_TO_UNIT, z: s.z * M_TO_UNIT, color: f.color, bot: !!f.bot, ...(f.badge ? { badge: f.badge } : {}) });
    });
  });
  return null;
}

// ─── World ───────────────────────────────────────────────────

export default function DriveWorld({
  objects,
  buildings,
  h,
  viewerDevId,
  spawnDevId = null,
  spawnAt = null,
  scripted,
  cinematic = false,
  seamless = false,
  touch,
  telemetry,
  camera,
  onCameraToggle,
  muted,
  volume = 1,
  emoteApi,
  onEmoteLog,
  paused,
  stallAt = null,
  onReady,
  onFail,
  slug,
  boxSpots,
  trees,
  name,
  onDrivers,
  onHonk,
  crownApi,
  onCrown,
  smash,
  offline = false,
  onTaste,
  onRoom,
  rally,
  heist,
}: DriveWorldProps) {
  const onRoomRef = useRef(onRoom);
  useEffect(() => {
    onRoomRef.current = onRoom;
  }, [onRoom]);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // The room tells us whether we may smash (smash_me); until then the
  // buildings are solid. Yours always is.
  // Offline (a preview) there is no room to ask: every building breaks.
  const [side, setSide] = useState<SmashSide>(offline && smash ? "smash" : "none");
  const sideRef = useRef<SmashSide>(offline && smash ? "smash" : "none");
  useEffect(() => {
    sideRef.current = side;
  }, [side]);
  // A guest's free building (Smash `taste`): until the car runs into one,
  // every building lets it in; then only that one does, standing or fallen.
  const [tasteLogin, setTasteLogin] = useState<string | null>(null);
  const [tasteUsed, setTasteUsed] = useState(false);
  const tasting = !!smash && !!onTaste && side === "none";
  const onTasteRef = useRef(onTaste);
  useEffect(() => {
    onTasteRef.current = onTaste;
  }, [onTaste]);
  const taste = useMemo(
    () =>
      tasting
        ? {
            login: tasteLogin,
            used: tasteUsed,
            lock: (login: string) => setTasteLogin(login),
            down: (login: string) => {
              setTasteUsed(true);
              onTasteRef.current?.(login);
            },
          }
        : null,
    [tasting, tasteLogin, tasteUsed],
  );
  const solid = useMemo(() => {
    if (!smash) return buildings;
    const me = name.toLowerCase();
    if (side === "smash") return buildings.filter((b) => !smash.index.has(b.loginLower) || b.loginLower === me);
    if (!tasting) return buildings;
    if (tasteLogin) return buildings.filter((b) => b.loginLower !== tasteLogin);
    return tasteUsed ? buildings : buildings.filter((b) => !smash.index.has(b.loginLower) || b.loginLower === me);
  }, [smash, side, buildings, name, tasting, tasteLogin, tasteUsed]);
  const specs = useMemo(() => buildColliders(objects, solid, h), [objects, solid, h]);
  const smashApi = useRef<SmashApi | null>(null);
  const fixed = useMemo(() => specs.filter((s) => s.body === "fixed"), [specs]);
  const dynamic = useMemo(() => specs.filter((s) => s.body === "dynamic"), [specs]);
  const spawn = useMemo(() => spawnAt ?? spawnPoint(objects, spawnDevId ?? viewerDevId, h), [spawnAt, objects, spawnDevId, viewerDevId, h]);

  const stallRef = useRef<number | null>(stallAt);
  useEffect(() => {
    stallRef.current = stallAt;
  }, [stallAt]);
  const input = useDriveInput(paused || cinematic, touch, { at: stallRef, speed: () => telemetry.speed });
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
  const rallySink = useRef<(e: BattleEvent) => void>(() => {});
  /** Where R puts the car during a city race (its last gate). */
  const respawnAt = useRef<Spawn | null>(null);
  const crownHit = useRef<(id: string) => void>(() => {});
  const crownKnock = useRef<() => void>(() => {});
  const emoteSink = useRef<(from: string, e: number) => void>(() => {});
  // The city of the day: every driver's side (the room's), the mode's message sink and its hooks.
  const heistSides = useRef(new Map<string, HeistSide>());
  const [sidesNow, setSidesNow] = useState<ReadonlyMap<string, HeistSide>>(() => new Map());
  /** The room's `send`, for callbacks handed to the presence hook before it returns. */
  const sendRef = useRef<(m: ClientMsg) => void>(() => {});
  const heistSink = useRef<(e: BattleEvent | ({ t: string } & Record<string, unknown>)) => void>(() => {});
  const ownHeistApi = useRef<HeistApi | null>(null);
  const heistApi = heist?.apiRef ?? ownHeistApi;
  const [heistFeeds, setHeistFeeds] = useState<CarFeed[]>([]);
  const authed = useRef(false);
  const heistTokenRef = useRef<string | null>(heist?.token ?? null);
  /** The kit is live (the mode's last view had it): the battle's boxes and F step aside. */
  const heistKitOn = useRef(false);
  const chatSink = useRef<(from: string, login: string, text: string) => void>(() => {});
  const ownEmoteApi = useRef<EmoteApi | null>(null);
  const telemetryRef = useRef(telemetry);
  // The car for the tree bubble: where the minimap feed last put it (units).
  const treeCar = useCallback(() => telemetryRef.current.radar, []);
  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);
  const { remotes, drivers, sendBump, send, selfId } = useDrivePresence({
    offline,
    slug,
    name,
    car,
    input,
    onBump: (from, x, z) => {
      const c = car.current;
      if (!c || performance.now() - (contacts.current.get(from) ?? 0) < BUMP_DEDUPE_MS) return;
      c.body.applyImpulse({ x: x * CHASSIS.mass, y: BUMP_HOP * CHASSIS.mass, z: z * CHASSIS.mass }, true);
      impact.current = { strength: Math.min(1, Math.hypot(x, z) / 12), at: performance.now() };
      heistApi.current?.bumped(from);
    },
    onEmote: (from, e) => emoteSink.current(from, e),
    onChat: (from, login, text) => chatSink.current(from, login, text),
    onBattle: (e) =>
      e.t === "crown"
        ? crownSink.current(e)
        : e.t === "rally" || e.t === "rally_receipt"
          ? rallySink.current(e)
          : e.t === "fx" && kitOnly(e.item)
            ? heistSink.current(e)
            : battleSink.current(e),
    // Smash: the room asks the site who you are, and has the last word on the floors.
    auth: smash ? smashToken : undefined,
    onOther: smash
      ? (msg) => {
          onRoomRef.current?.(msg);
          if (msg.t.startsWith("heist_")) {
            if (msg.t === "heist_sides" && Array.isArray(msg.list)) {
              const next = new Map<string, HeistSide>();
              for (const row of msg.list as unknown[]) if (Array.isArray(row) && typeof row[0] === "string" && isSide(row[1])) next.set(row[0], row[1]);
              heistSides.current = next;
              setSidesNow(next);
            } else heistSink.current(msg);
          }
          if (msg.t === "smash_me") {
            authed.current = true;
            if (heistTokenRef.current) sendRef.current({ t: "heist_side", token: heistTokenRef.current });
            setSide(msg.can === true ? "smash" : "none");
            telemetryRef.current.floorsToday = msg.can === true && msg.home !== true ? Number(msg.floors) || 0 : null;
          }
          if (msg.t === "floors" && typeof msg.b === "string") {
            const tele = telemetryRef.current;
            const n = Number(msg.n) || 0;
            const today = Number(msg.today) || 0;
            if (n > 0) smashApi.current?.scored(msg.b, n);
            if (today >= FLOOR_DAY_CAP && (tele.floorsToday ?? 0) < FLOOR_DAY_CAP) tele.floorsMaxedAt = performance.now();
            tele.floorsToday = today;
          }
          for (const { target, col } of applyRoomDamage(smash, msg, Date.now())) smashApi.current?.debris(target, col);
        }
      : undefined,
  });
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  // A side picked mid-drive: its signed token goes to the room once it knows who you are.
  const heistToken = heist?.token ?? null;
  useEffect(() => {
    heistTokenRef.current = heistToken;
    if (heistToken && authed.current) send({ t: "heist_side", token: heistToken });
  }, [heistToken, send]);
  // Bots fill in for missing drivers (you count as one).
  const bots = useTownBots(slug, objects, drivers.length + 1);
  // The city of the day marks each driver's side on their car.
  const badged = (r: CarFeed): CarFeed => {
    const sd = heist ? sidesNow.get(r.id) : undefined;
    return sd ? { ...r, badge: sd } : r;
  };
  const cars = [...drivers.flatMap((d) => remotes.current.get(d.id) ?? []).map(badged), ...bots, ...heistFeeds];
  const botTargets = useRef(new Map<string, BotTarget>());
  /** A blast at (x, z) meters throws every bot in reach, harder the closer. */
  const blastBots = (x: number, z: number, reach: number, power: number, fx?: { id: number; mine: boolean }) => {
    smashApi.current?.blast(x, z, reach, fx);
    // The city of the day's game cars are stunned, never thrown (they'd fly off the streets).
    heistApi.current?.blast(x, z, reach);
    for (const [id, t] of botTargets.current) {
      if (id.startsWith("bot:heist")) continue;
      const p = t.pos();
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > reach) continue;
      const k = 1 - d / reach;
      const nx = d > 0.01 ? (p.x - x) / d : 0;
      const nz = d > 0.01 ? (p.z - z) / d : 0;
      t.hit(nx * power * k, nz * power * k, power * k);
    }
  };
  const onRemoteHit = (id: string, other: RapierRigidBody) => {
    if (id.startsWith("bot:heist")) {
      heistApi.current?.contact(id);
      return;
    }
    if (id.startsWith("bot:")) {
      // Nobody to tell: the bot takes the hit here, as hard as you came in.
      const c = car.current;
      const now = performance.now();
      if (!c || now - (contacts.current.get(id) ?? 0) < BUMP_DEDUPE_MS) return;
      contacts.current.set(id, now);
      const mine = c.body.linvel();
      const theirs = other.linvel();
      const rx = mine.x - theirs.x;
      const rz = mine.z - theirs.z;
      const power = Math.hypot(rx, rz);
      if (power > 2) botTargets.current.get(id)?.hit(rx * 0.8, rz * 0.8, power);
      return;
    }
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
            scripted={scripted}
            objects={objects}
            buildings={buildings}
            h={h}
            input={input}
            telemetry={telemetry}
            apiRef={car}
            color={carColor(name)}
            onRemoteHit={onRemoteHit}
            onHonk={honk}
            impact={impact}
            respawnAt={respawnAt}
          >
            <Lights braking={() => !!car.current?.state.braking} />
            {heist?.side === "cop" && <LightBar />}
          </Car>
          <LocalFx car={car} sources={fx} />
          {trees && <TreeBubble trees={trees.list} car={treeCar} onHidden={trees.onHidden} />}
          <RemoteCars cars={cars} sources={fx} localCar={car} muted={muted || paused} botTargets={botTargets} />
          <Battle
            room={slug}
            spots={boxSpots}
            objects={objects}
            car={car}
            remotes={remotes}
            input={input}
            send={send}
            selfId={selfId}
            sinkRef={battleSink}
            impactRef={impact}
            telemetryRef={telemetryRef}
            onKnocked={() => {
              crownKnock.current();
              heistApi.current?.knocked();
            }}
            kitOn={() => !!heist?.side && !!heistKitOn.current}
            onBlast={blastBots}
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
            telemetryRef={telemetryRef}
          />
          {rally && (
            <RallyMode
              slug={slug}
              carRef={car}
              send={send}
              selfId={selfId}
              sinkRef={rallySink}
              apiRef={rally.api}
              onView={rally.onView}
              telemetryRef={telemetryRef}
              respawnAt={respawnAt}
              recordMs={rally.recordMs}
              startLine={rally.startLine}
              routeLine={rally.routeLine}
              muted={muted || paused}
            />
          )}
          {heist && (
            <HeistMode
              heist={{
                ...heist,
                onView: (v) => {
                  heistKitOn.current = !!v?.kit;
                  heist.onView(v);
                },
              }}
              car={car}
              remotes={remotes}
              sides={heistSides}
              send={send}
              selfId={selfId}
              store={smash}
              botTargets={botTargets}
              sinkRef={heistSink}
              apiRef={heistApi}
              onFeeds={setHeistFeeds}
              muted={muted || paused}
            />
          )}
          {smash && (
            <Smash
              ref={smashApi}
              store={smash}
              car={car}
              impactRef={impact}
              muted={muted || paused}
              sideRef={sideRef}
              send={send}
              me={name.toLowerCase()}
              telemetryRef={telemetryRef}
              taste={taste}
            />
          )}
          {flash && <HonkFlash key={flash.at} building={flash.b} at={flash.at} />}
          <SkidMarks sources={fx} />
          <Smoke sources={fx} />
          <BoostTrail sources={fx} />
          <EngineSmoke car={car} stallAt={stallRef} impact={impact} />
          <DriveAudio car={car} input={input} impact={impact} muted={muted || paused} volume={volume} />
          <EmoteBubbles carRef={car} remotes={remotes} send={send} apiRef={emoteApi ?? ownEmoteApi} sinkRef={emoteSink} chatSinkRef={chatSink} name={name} onLog={onEmoteLog} />
          <RadarFeed car={car} cars={cars} telemetryRef={telemetryRef} ring={heist?.ring ?? null} />
          <RouteArrow
            car={car}
            telemetryRef={telemetryRef}
            onArrive={(login) => {
              const b = buildings.find((x) => x.loginLower === login);
              if (b) setFlash({ b, at: performance.now() });
            }}
          />
          {!cinematic && <DriveCamera mode={camera} car={car} impact={impact} seamless={seamless} />}
          <CameraKey input={input} onToggle={onCameraToggle} />
          <Ready onReady={onReady} />
        </Physics>
      </Suspense>
    </Boundary>
  );
}
