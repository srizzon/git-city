"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Car, ChevronLeft, Code2, Instagram, Landmark, Map as MapIcon, MessageCircle, Trophy, UserPlus, Vote as VoteIcon, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import posthog from "posthog-js";
import { generateCityLayout, type CityBuilding, type DeveloperRecord, type LayoutNorms } from "@/lib/github";
import { leagueBuildings, scaleTownHeights } from "@/lib/league-city/buildings";
import { createTelemetry, type DriveCameraMode } from "@/lib/league-city/drive/telemetry";
import { smashStoreFor } from "@/lib/league-city/smash";
import { createCameraStore, mapNav } from "@/lib/map-nav";
import { createBrowserSupabase } from "@/lib/supabase";
import { signInWithGitHub } from "@/lib/sign-in";
import type { CrownApi, CrownView } from "@/components/league/drive/CrownMode";
import type { EmoteApi } from "@/components/league/drive/EmoteBubbles";
import { useTouch } from "@/components/towns/useDesktop";
import { createEmoteLog } from "@/lib/league-city/drive/emote-log";
import { createTouch, type TouchDrive } from "@/lib/league-city/drive/touch";
import { loadVolume, saveVolume } from "@/lib/league-city/drive/volume";
import { M_TO_UNIT } from "@/lib/league-city/drive/tuning";
import { useDriveWatch } from "@/components/league/drive/useDriveWatch";
import { useTownsLive } from "@/components/towns/live";
import { applyRoomDamage } from "@/lib/league-city/smash-net";
import { inTown } from "@/lib/towns/live";
import type { DriverInfo } from "@/lib/league-city/drive/net";
import BuildingCard from "@/components/league/hud/BuildingCard";
import GuestGate from "@/components/league/hud/drive/GuestGate";
import AwayCard from "@/components/towns/AwayCard";
import { fmt } from "@/components/league/hud/shared";
import MapNavControls from "@/components/MapNavControls";
import BrasilScene, { cityKey, type CameraApi } from "@/components/towns/brasil/BrasilScene";
import { BRASIL_DRIFT, useBrasilDrift } from "@/components/towns/brasil/BrasilDrift";
import { courseOf } from "@/lib/drift/spots";
import { DRIFT_EXIT, DRIFT_SIGN_LOT, clearOfStart, crossedStart } from "@/lib/towns/brasil-drift";
import { pointAt } from "@/lib/league-city/race/track";
import type { Spawn } from "@/lib/league-city/drive/spawn";
import { LOT, lotToWorld } from "@/lib/league-city/grid";
import BrasilMinimap from "@/components/towns/brasil/BrasilMinimap";
import { BrasilPicker, BrasilRanking, BrasilSearchBar } from "@/components/towns/brasil/BrasilPanels";
import ElectionPanel from "@/components/towns/brasil/ElectionPanel";
import ApuracaoWidget from "@/components/towns/brasil/ApuracaoWidget";
import StateCard from "@/components/towns/brasil/StateCard";
import { stateStats, swatchOf, weekCrown, type StateStats } from "@/components/towns/brasil/stats";
import { ptState, stateOf, type BrasilLayout, type CityLayout, type UF } from "@/lib/towns/brasil-map";
import { brasilWorld, plainBuilding } from "@/lib/towns/brasil-world";
import { brasilOffices, officeLabel, type Office } from "@/lib/towns/brasil-roles";
import type { BrasilWeek } from "@/lib/towns/brasil-server";
import type { Count, ElectionView } from "@/lib/towns/brasil-election-server";
import { POINTS, totalOf, type PointsBreakdown } from "@/lib/towns/brasil-points";

// The Brasil town's page: the map of Brazil with the town's residents, each
// in their state's city, their buildings sized like everywhere in Git City.
// Over it: the counter and the top states; a bar to search the map, rank the
// states and pick your state; a state's card from its tag, a dev's from their
// building; the compass, the zoom and a minimap. ?uf=SP opens a state,
// ?at=login a building. Driving across the drift track's START line (between
// São Paulo and Rio) turns the drive into a drift run there (BrasilDrift).

export interface BrasilTownProps {
  league: { slug: string; name: string };
  layout: BrasilLayout;
  /** Every resident's city record (main-city size, lit windows). */
  cityDevs: Record<string, unknown>[];
  cityNorms: LayoutNorms;
  viewerLogin: string | null;
  /** Where the viewer lives on the map, or null when they're not on it. */
  home: UF | "island" | null;
  /** Open on a state or a building. */
  startAt: { uf: string } | { login: string } | null;
  /** ?pick=1, back from signing in after a guest's free building: open the state picker if you're not on the map. */
  startPick?: boolean;
  /** The week's points the offices come from (last closed week, or this week so far before the first one closes), and this week's. */
  week: BrasilWeek;
  /** The presidential race and who's in office (null while the presidency is off). */
  election: ElectionView | null;
  /** The presidential count for the corner widget (null while the presidency is off). */
  count?: Count | null;
  /** ?vote=34, from a shared vote: the voting machine opens with that number typed. */
  startVote?: number | null;
}

type PanelId = "states" | "election" | null;
const DriveHud = dynamic(() => import("@/components/league/hud/drive/DriveHud"), { ssr: false });
/** The drive's mute switch, shared with every town. */
const MUTE_KEY = "gc:drive-muted";
const LIME = "#c8e64a";
/** The drift track on the minimap: its sign by the gate, in world units. */
const DRIFT_TAG = { x: lotToWorld(...DRIFT_SIGN_LOT)[0], z: lotToWorld(...DRIFT_SIGN_LOT)[1] };
// The HUD's surfaces: Git City's own (near-black, its borders, muted text).
const HUD_BG = "bg-bg/90";
const HUD_EDGE = "border-border";
const HUD_SOFT = "text-muted";

export default function BrasilTown({ league, layout, cityDevs, cityNorms, viewerLogin, home, startAt, startPick = false, week: officeWeek, election, count = null, startVote = null }: BrasilTownProps) {
  const router = useRouter();
  const camera = useRef<CameraApi | null>(null);
  const cameraStore = useMemo(() => createCameraStore(), []);
  const [telemetry, setTelemetry] = useState(createTelemetry);
  const crownApi = useRef<CrownApi | null>(null);
  const [driving, setDriving] = useState(false);
  /** On the drift track: the town's car is parked, a drift run is on. */
  const [drifting, setDrifting] = useState(false);
  const inCar = driving || drifting;
  /** Where the next drive starts instead of a building (to or back from the drift track: the highway by its gate). */
  const [driveSpawn, setDriveSpawn] = useState<Spawn | null>(null);
  /** Dark between the town's car and the drift run, both ways, while the next world loads. */
  const [curtain, setCurtain] = useState<"drift" | "city" | null>(null);
  const [panel, setPanel] = useState<PanelId>(startVote && election ? "election" : null);
  const [state, setState] = useState<StateStats | null>(null);
  const [focused, setFocused] = useState<CityBuilding | null>(null);
  /** The state card a building was opened from: closing the building brings it back. */
  const [backTo, setBackTo] = useState<StateStats | null>(null);
  /** The state picker under the search, for a username typed there (null: yours). */
  const [picker, setPicker] = useState<{ forLogin: string | null } | null>(null);
  const [joining, setJoining] = useState<{ pending: UF | "island" | null; error: string | null }>({
    pending: null,
    error: null,
  });
  /** Just placed: where, until the refreshed map has the building (then the camera goes there). */
  const [arriving, setArriving] = useState<{ uf: UF | null } | null>(null);
  /** The arrival the open card celebrates, and the ring under the new lot. */
  const [arrived, setArrived] = useState<{ login: string; uf: UF | null } | null>(null);
  const [pulse, setPulse] = useState<{ x: number; z: number; key: number } | null>(null);
  const [now] = useState(() => Date.now());
  /** Up close, the city the camera looks at (its cityKey). */
  const [viewKey, setViewKey] = useState<string | null>(null);
  /** Below the whole-country view, the city with people the camera looks at: where Drive starts. */
  const [lookKey, setLookKey] = useState<string | null>(null);
  /** Where the map camera opens back from the car. */
  const [cameraStart, setCameraStart] = useState<{ x: number; z: number } | null>(null);
  /** The car starts at this resident's building, fixed when the drive starts. */
  const [driveDev, setDriveDev] = useState<number | null>(null);
  const [launching, setLaunching] = useState(false);
  /** A panel takes the right side: any card closes. */
  const openPanel = (p: PanelId) => {
    setState(null);
    setFocused(null);
    setBackTo(null);
    setPicker(null);
    setPanel(p);
  };
  /** The picker takes over: cards and panels close. */
  const openPicker = (forLogin: string | null) => {
    setState(null);
    setFocused(null);
    setBackTo(null);
    setPanel(null);
    setJoining({ pending: null, error: null });
    setPicker({ forLogin });
    posthog.capture("brasil_picker_opened", { signed_in: !!viewerLogin, on_map: !!home });
  };

  const world = useMemo(() => {
    const records = generateCityLayout(cityDevs as unknown as DeveloperRecord[], undefined, cityNorms).buildings;
    const byLogin = new Map(records.map((b) => [b.loginLower, b]));
    const { objects, byDevId } = brasilWorld(layout, (dev) => byLogin.get(dev.login.toLowerCase()) ?? plainBuilding(dev.login), 1);
    const buildings = leagueBuildings(objects, scaleTownHeights(byDevId));
    const placed = new Map(buildings.map((b) => [b.loginLower, b]));
    const states = stateStats(layout, placed, now);
    const devs = [...layout.cities, layout.island].reduce((n, c) => n + c.devs.length, 0);
    const founders = layout.cities.filter((c) => !c.second && c.devs.length > 0).length;
    // Which state each resident said, for their card.
    const ufOf = new Map([...layout.cities, layout.island].flatMap((c) => c.devs.map((d) => [d.dev.login.toLowerCase(), { uf: d.dev.uf, founder: d.founder }] as const)));
    const allCities = [...layout.cities, layout.island];
    const cityByKey = new Map(allCities.map((c) => [cityKey(c), c]));
    const cityOfLogin = new Map(allCities.flatMap((c) => c.devs.map((d) => [d.dev.login.toLowerCase(), c] as const)));
    const week = weekCrown(layout, now);
    // Who arrived in the last day, newest first: the ticker over the bar and the "new" name plates.
    const arrivals = allCities
      .flatMap((c) => c.devs.map((d) => ({ login: d.dev.login, uf: d.dev.uf, at: d.at })))
      .filter((a) => now - a.at < 86_400_000)
      .sort((a, b) => b.at - a.at);
    const fresh = new Set(arrivals.map((a) => a.login.toLowerCase()));
    const offices = brasilOffices(layout, new Map(Object.entries(officeWeek.totals)), election?.president?.login ?? null);
    // Each state's points this week: its residents' points added up.
    const statePoints: Partial<Record<UF, number>> = {};
    for (const c of allCities) for (const d of c.devs) if (d.dev.uf) statePoints[d.dev.uf] = (statePoints[d.dev.uf] ?? 0) + (officeWeek.live.totals[d.dev.login.toLowerCase()] ?? 0);
    // Each holder's highest office, short, for the name plates.
    const SHORT = { president: "Pres", governor: "Gov", senator: "Sen", mayor: "Mayor" } as const;
    const plateOffice = new Map([...offices.byLogin].map(([l, os]) => [l, SHORT[os[0].kind]]));
    // Each state's place in the week's race: the States table's order.
    const racePlace = new Map([...states].sort((a, b) => (statePoints[b.uf] ?? 0) - (statePoints[a.uf] ?? 0) || b.devs - a.devs || a.name.localeCompare(b.name)).map((st, i) => [st.uf, i + 1]));
    return { objects, buildings, placed, states, devs, founders, ufOf, allCities, cityByKey, cityOfLogin, week, arrivals, fresh, offices, plateOffice, statePoints, racePlace };
  }, [layout, cityDevs, cityNorms, now, officeWeek, election]);

  const smash = useMemo(() => smashStoreFor(world.buildings), [world.buildings]);

  // The town's drive room: everyone driving sees everyone, and the map shows their cars while you look.
  const [guest] = useState(() => `guest-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  // The car's HUD, as in every town: camera, sound, reactions, Crown Rush, pause, phone controls.
  const [driveReady, setDriveReady] = useState(false);
  const [driveCamera, setDriveCamera] = useState<DriveCameraMode>("chase");
  const [paused, setPaused] = useState(false);
  // A guest's free building just fell (on their screen only): the car stops on "plant your flag".
  const [taste, setTaste] = useState<string | null>(null);
  const tasteTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (tasteTimer.current) window.clearTimeout(tasteTimer.current);
  }, []);
  const onTaste = useCallback((login: string) => {
    posthog.capture("guest_taste_down", { town: "brasil" });
    tasteTimer.current = window.setTimeout(() => setTaste(login), 1200);
  }, []);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [crownView, setCrownView] = useState<CrownView | null>(null);
  const emoteApi = useRef<EmoteApi | null>(null);
  const [emoteLog] = useState(createEmoteLog);
  const touchRef = useRef<TouchDrive>(createTouch());
  const touchUi = useTouch();
  const toggleCamera = useCallback(() => setDriveCamera((c) => (c === "chase" ? "top" : "chase")), []);
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      try {
        localStorage.setItem(MUTE_KEY, m ? "0" : "1");
      } catch {
        // storage blocked
      }
      return !m;
    });
  }, []);
  // The slider: moving it while muted turns the sound back on.
  const changeVolume = useCallback((v: number) => {
    setVolume(v);
    saveVolume(v);
    if (v > 0) {
      setMuted(false);
      try {
        localStorage.setItem(MUTE_KEY, "0");
      } catch {
        // storage blocked
      }
    }
  }, []);
  const driveSince = useRef(0);
  const exitDrive = useCallback(() => {
    if (driveSince.current) posthog.capture("brasil_drive_ended", { seconds: Math.round((performance.now() - driveSince.current) / 1000) });
    driveSince.current = 0;
    // The map opens where the car stopped.
    const r = telemetry.radar;
    setCameraStart(r && (r.x || r.z) ? { x: r.x, z: r.z } : null);
    setDriving(false);
    setPaused(false);
    setDrivers([]);
    setCrownView(null);
    emoteLog.clear();
  }, [emoteLog, telemetry]);
  // Esc pauses; Esc again on the pause menu leaves the car.
  useEffect(() => {
    if (!driving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.repeat || taste) return; // the free building's choice answers Esc itself
      e.preventDefault();
      if (paused) exitDrive();
      else setPaused(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [driving, paused, exitDrive, taste]);
  const watch = useDriveWatch(league.slug, !inCar, (msg) => applyRoomDamage(smash, msg, Date.now()));
  // Where each driver is now (units), from the room's latest state of their car.
  const driverAt = useCallback(
    (id: string) => {
      const s = watch.remotes.current.get(id)?.buffer.latest;
      return s ? { x: s.x * M_TO_UNIT, z: s.z * M_TO_UNIT } : null;
    },
    [watch.remotes],
  );
  // The drivers and where they are, refreshed every second for the list and the minimap (the pins follow every frame).
  const [carSpots, setCarSpots] = useState<{ id: string; name: string; x: number; z: number }[]>([]);
  useEffect(() => {
    if (inCar) return;
    const tick = () =>
      setCarSpots(
        watch.drivers.flatMap((d) => {
          const p = driverAt(d.id);
          return p ? [{ id: d.id, name: d.name, ...p }] : [];
        }),
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [inCar, watch.drivers, driverAt]);
  const [driversOpen, setDriversOpen] = useState(false);
  const watchedCars = useMemo(() => watch.drivers.flatMap((d) => watch.remotes.current.get(d.id) ?? []), [watch.drivers, watch.remotes]);
  // Who's here now (the drive room reports to the towns tally), plus the drivers the room just told us about.
  const live = useTownsLive()[league.slug];
  const here = Math.max(live ? inTown(live) : 0, 1);
  const drivingNow = driving ? drivers.length : watch.drivers.length;
  const noop = useCallback(() => {}, []);

  // The phone's back button walks the same steps as ‹: a building, its state, the whole country.
  const applying = useRef(false);
  const pushUrl = useCallback((q: string) => {
    if (applying.current) return;
    const next = q ? `${window.location.pathname}?${q}` : window.location.pathname;
    if (next === window.location.pathname + window.location.search) return;
    window.history.pushState({ brasil: true }, "", next);
  }, []);

  /** Closing a card: the address follows without a new step. */
  const replaceUrl = (q: string) => window.history.replaceState(window.history.state, "", q ? `${window.location.pathname}?${q}` : window.location.pathname);

  const openState = useCallback(
    (uf: UF) => {
      const s = world.states.find((x) => x.uf === uf);
      if (!s) return;
      pushUrl(`uf=${uf}`);
      setFocused(null);
      setBackTo(null);
      setPanel(null);
      setPicker(null);
      setState(s);
      camera.current?.flyTo(s.capital.center, s.capital.radius);
    },
    [world.states, pushUrl],
  );
  const openBuilding = useCallback(
    (b: CityBuilding) => {
      pushUrl(`at=${b.loginLower}`);
      posthog.capture("brasil_building_opened", { self: b.loginLower === viewerLogin?.toLowerCase() });
      setState(null);
      setPanel(null);
      setFocused(b);
      mapNav.send({ type: "flyTo", x: b.position[0], z: b.position[2], distance: 700 });
    },
    [pushUrl, viewerLogin],
  );
  /** Back to the whole country: every card closes. */
  const toBrazil = useCallback(() => {
    setState(null);
    setFocused(null);
    setBackTo(null);
    setPanel(null);
    setPicker(null);
    camera.current?.flyTo(null);
  }, []);
  // Back (the phone's, or ‹ after a step this page took): show what the address says.
  useEffect(() => {
    const onPop = () => {
      const q = new URLSearchParams(window.location.search);
      applying.current = true;
      const at = q.get("at");
      const uf = q.get("uf");
      const b = at ? world.placed.get(at.toLowerCase()) : undefined;
      if (b) openBuilding(b);
      else if (uf && world.states.some((s) => s.uf === uf)) openState(uf as UF);
      else if (state) toBrazil();
      else {
        // Back from a building opened on the map: close it, stay over its streets.
        setFocused(null);
        setBackTo(null);
      }
      applying.current = false;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [world, openBuilding, openState, toBrazil, state]);
  const openCity = useCallback(
    (c: CityLayout) => {
      if (c.uf) return openState(c.uf);
      setState(null);
      setPanel(null);
      camera.current?.flyTo(c.center, c.radius);
    },
    [openState],
  );

  // Who comes, and how: the top of the comment → visit → building funnel.
  useEffect(() => {
    posthog.capture("brasil_map_viewed", { signed_in: !!viewerLogin, on_map: !!home, link: startAt ? ("uf" in startAt ? "state" : "building") : null });
    // Once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?uf=SP or ?at=login: open there once the map is up.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !startAt) return;
    const t = setTimeout(() => {
      started.current = true;
      if ("uf" in startAt) {
        const uf = world.states.find((s) => s.uf === startAt.uf)?.uf;
        if (uf) {
          openState(uf);
          posthog.capture("brasil_state_opened", { uf, from: "link" });
        }
      } else {
        const b = world.placed.get(startAt.login);
        // Back from signing in after the free building: on the map is joining, so pick your state.
        if (startPick && viewerLogin && !home) openPicker(null);
        else if (b) openBuilding(b);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [startAt, world, openState, openBuilding, startPick, viewerLogin, home]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where you are: the building's city, the open state, or the city the camera is over.
  const place = (focused ? world.cityOfLogin.get(focused.loginLower) : undefined) ?? state?.capital ?? (viewKey ? world.cityByKey.get(viewKey) : undefined) ?? null;
  /** The building the car starts at: the open one, else the city you're over, else yours, else the biggest state's. */
  const driveStartDev = (): { id: number; login: string } | null => {
    const pickIn = (c: CityLayout | null | undefined) => (c && c.devs.length ? c.devs[0].dev : null);
    const own = viewerLogin ? world.cityOfLogin.get(viewerLogin.toLowerCase())?.devs.find((d) => d.dev.login.toLowerCase() === viewerLogin.toLowerCase())?.dev : null;
    const dev =
      (focused ? world.cityOfLogin.get(focused.loginLower)?.devs.find((d) => d.dev.login.toLowerCase() === focused.loginLower)?.dev : null) ??
      pickIn(place) ??
      pickIn(lookKey ? world.cityByKey.get(lookKey) : null) ??
      own ??
      pickIn(world.states.find((s) => s.devs > 0)?.capital) ??
      pickIn(layout.island);
    return dev ? { id: dev.id, login: dev.login } : null;
  };
  const driveFrom = driveDev;

  /** ‹: one step up. A building goes back to its state's card (or just closes), a city to the whole country, the country to the towns. */
  const closeBuilding = () => {
    setFocused(null);
    setArrived(null);
    // Opened from a state's card: back to it, and back over its city.
    if (backTo) {
      setState(backTo);
      setBackTo(null);
      camera.current?.flyTo(backTo.capital.center, backTo.capital.radius);
      replaceUrl(`uf=${backTo.uf}`);
    } else replaceUrl("");
  };
  const goUp = () => {
    if (focused) return closeBuilding();
    if (state || place) {
      toBrazil();
      replaceUrl("");
      return;
    }
    router.push("/towns");
  };
  const drive = useMemo(
    () => ({
      viewerDevId: driveFrom,
      touch: touchRef,
      telemetry,
      camera: driveCamera,
      onCameraToggle: toggleCamera,
      muted,
      volume,
      emoteApi,
      onEmoteLog: emoteLog.push,
      paused: paused || !!taste,
      stallAt: null,
      onReady: () => {
        setDriveReady(true);
        setCurtain((c) => (c === "city" ? null : c));
      },
      onFail: exitDrive,
      spawnAt: driveSpawn,
      slug: league.slug,
      name: viewerLogin ?? guest,
      onDrivers: setDrivers,
      onHonk: noop,
      crownApi,
      onCrown: setCrownView,
      onTaste: viewerLogin ? undefined : onTaste,
    }),
    [telemetry, noop, driveFrom, driveSpawn, league.slug, viewerLogin, guest, driveCamera, toggleCamera, muted, volume, emoteLog, paused, exitDrive, taste, onTaste],
  );
  // The drive minimap: the map around the car, and your building.
  const driveMap = useMemo(
    () => ({
      buildings: world.buildings,
      objects: world.objects,
      home: viewerLogin?.toLowerCase() ?? null,
    }),
    [world, viewerLogin],
  );
  /** `near`: start at the building closest to this point (driving with someone). */
  const startDrive = (near?: { x: number; z: number }) => {
    let nearest: { id: number; login: string } | null = null;
    if (near) {
      let best = Infinity;
      for (const c of world.allCities)
        for (const d of c.devs) {
          const b = world.placed.get(d.dev.login.toLowerCase());
          if (!b) continue;
          const dist = Math.hypot(b.position[0] - near.x, b.position[2] - near.z);
          if (dist < best) {
            best = dist;
            nearest = { id: d.dev.id, login: d.dev.login };
          }
        }
    }
    const dev = nearest ?? driveStartDev();
    const b = dev ? world.placed.get(dev.login.toLowerCase()) : undefined;
    if (!dev || !b || launching) return;
    setState(null);
    setFocused(null);
    setBackTo(null);
    setPanel(null);
    setPicker(null);
    setDriveDev(dev.id);
    setDriveSpawn(null);
    setLaunching(true);
    posthog.capture("brasil_drive_started", { city: world.cityOfLogin.get(dev.login.toLowerCase())?.uf ?? "island", signed_in: !!viewerLogin });
    // Down to the street first, so the car starts somewhere you just saw.
    const go = () => {
      setLaunching(false);
      beginDrive();
    };
    if (camera.current) camera.current.flyToPoint(b.position[0], b.position[2], 420, go);
    else go();
  };
  const beginDrive = () => {
    driveSince.current = performance.now();
    setDriveReady(false);
    setPaused(false);
    setTelemetry(createTelemetry());
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
      setVolume(loadVolume());
    } catch {
      // storage blocked: sound stays on
    }
    setDriving(true);
  };

  const driveFromSpawn = (spawn: Spawn) => {
    setDriveSpawn(spawn);
    beginDrive();
  };
  const backToCity = () => {
    setCurtain("city");
    setTimeout(() => {
      const [x, z] = lotToWorld(DRIFT_EXIT.x, DRIFT_EXIT.z);
      setDrifting(false);
      driveFromSpawn({ x, z, rot: DRIFT_EXIT.rot });
    }, 280);
  };
  const drift = useBrasilDrift({
    active: drifting,
    viewerLogin,
    townPath: `/town/${league.slug}`,
    camera: driveCamera,
    onCameraToggle: toggleCamera,
    muted,
    onToggleMute: toggleMute,
    touch: touchUi ? touchRef : null,
    onBack: backToCity,
    onReady: () => setCurtain((c) => (c === "drift" ? null : c)),
  });

  // The drift track's gate. Across the START line the screen goes dark, the town's car is
  // parked and the drift run sets up under the dark; it lifts on the track's card.
  const startDrift = drift.start;
  const enterDrift = useCallback(() => {
    if (driveSince.current) posthog.capture("brasil_drive_ended", { seconds: Math.round((performance.now() - driveSince.current) / 1000), to: "drift" });
    driveSince.current = 0;
    setDriving(false);
    setPaused(false);
    setDrivers([]);
    setCrownView(null);
    emoteLog.clear();
    startDrift();
    setDrifting(true);
  }, [emoteLog, startDrift]);
  useEffect(() => {
    if (!driving || !driveReady) return;
    const track = courseOf(BRASIL_DRIFT).track;
    let prev: { x: number; z: number } | null = null;
    // A car starting by the gate (back from a run) takes it again once it has driven off.
    let armed = false;
    const t = setInterval(() => {
      const r = telemetry.radar;
      if (!r || (!r.x && !r.z)) return;
      const now = { x: r.x, z: r.z };
      if (!armed) armed = clearOfStart(track, now);
      else if (prev && crossedStart(track, prev, now)) {
        clearInterval(t);
        setCurtain("drift");
        setTimeout(enterDrift, 280);
      }
      prev = now;
    }, 50);
    return () => clearInterval(t);
  }, [driving, driveReady, telemetry, enterDrift]);
  /** The track's tag on the map: down onto the start straight, stopped short of the line and facing it, so you only have to go. */
  const driveToTrack = () => {
    if (launching) return;
    const dev = driveStartDev();
    if (!dev) return;
    const p = pointAt(courseOf(BRASIL_DRIFT).track, -30);
    const [x, z] = [p.x * M_TO_UNIT, p.z * M_TO_UNIT];
    // Heading clockwise from north (-z), like every spawn.
    const rot = (Math.atan2(p.tx, -p.tz) * 180) / Math.PI;
    setState(null);
    setFocused(null);
    setBackTo(null);
    setPanel(null);
    setPicker(null);
    setDriveDev(dev.id);
    setLaunching(true);
    posthog.capture("brasil_drift_tag_clicked", { signed_in: !!viewerLogin });
    const go = () => {
      setLaunching(false);
      driveFromSpawn({ x, z, rot });
    };
    if (camera.current) camera.current.flyToPoint(x, z, 420, go);
    else go();
  };
  useEffect(() => {
    if (!curtain) return;
    const t = setTimeout(() => setCurtain(null), 5000);
    return () => clearTimeout(t);
  }, [curtain]);
  const pickState = async (uf: UF | null) => {
    setJoining({ pending: uf ?? "island", error: null });
    try {
      const res = await fetch(`/api/towns/${league.slug}/brasil/place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uf }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setJoining({ pending: null, error: body.error ?? "Couldn't put you on the map." });
      // The picker stays (saying "finding your lot") until the refreshed map has the building.
      setArriving({ uf });
      router.refresh();
    } catch {
      setJoining({ pending: null, error: "Couldn't put you on the map." });
    }
  };

  // The refreshed map has your building where you picked: fly there, ring the lot, open your card.
  useEffect(() => {
    if (!arriving || !viewerLogin) return;
    const login = viewerLogin.toLowerCase();
    const b = world.placed.get(login);
    if (!b || (world.ufOf.get(login)?.uf ?? null) !== arriving.uf) return;
    const t = setTimeout(() => {
      setArriving(null);
      setPicker(null);
      setJoining({ pending: null, error: null });
      setArrived({ login, uf: arriving.uf });
      setPulse({ x: b.position[0], z: b.position[2], key: Date.now() });
      openBuilding(b);
    }, 0);
    return () => clearTimeout(t);
  }, [arriving, viewerLogin, world, openBuilding]);
  const tasteSignIn = () => {
    const next = `/town/${league.slug}?at=${encodeURIComponent(taste ?? "")}&pick=1`;
    void signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`);
  };
  const signIn = () => {
    posthog.capture("brasil_signin_clicked", { for_login: picker?.forLogin ?? null });
    void signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=/town/${league.slug}`);
  };

  const yours = home && home !== "island" ? home : null;
  const top = world.states.filter((s) => s.devs > 0).slice(0, 3);
  const bar = "flex flex-col items-center justify-center gap-1 bg-[#141417] py-2 text-[9px] text-cream hover:text-lime sm:h-10 sm:flex-row sm:gap-2 sm:px-3 sm:py-0 sm:text-[11px]";

  return (
    <main className="fixed inset-0 bg-bg font-pixel uppercase text-cream">
      <BrasilScene
        cities={layout.cities}
        island={layout.island}
        objects={world.objects}
        buildings={world.buildings}
        cameraApi={camera}
        cameraStore={cameraStore}
        onTag={(c) => {
          if (c.uf) posthog.capture("brasil_state_opened", { uf: c.uf, from: "tag" });
          openCity(c);
        }}
        onBuildingClick={(b) => {
          // From a state's card (or a building opened from it): closing comes back to that card.
          const from = state ?? backTo;
          openBuilding(b);
          if (from) setBackTo(from);
        }}
        focused={focused?.loginLower ?? null}
        drive={driving && driveFrom !== null ? drive : undefined}
        drift={drift.world}
        driftBoard={drift.board}
        onDriftTag={driveToTrack}
        smash={smash}
        pulse={pulse}
        watching={watchedCars}
        drivers={inCar ? undefined : watch.drivers}
        driverAt={driverAt}
        crowned={world.week.crown?.uf ?? null}
        fresh={world.fresh}
        offices={world.plateOffice}
        onCity={(key, looking) => {
          setViewKey(key);
          setLookKey(looking);
        }}
        cameraStart={cameraStart}
      />

      {/* The top, one block as wide as the search: where you are (‹ one step up: a building, its city, the whole country, the towns) and who's online, the search under it. */}
      {!inCar && (
        <div className="absolute inset-x-3 top-3 z-30 sm:inset-x-auto sm:left-1/2 sm:top-4 sm:w-[min(420px,calc(100vw-32px))] sm:-translate-x-1/2">
          <div className={`flex h-9 items-stretch border-[3px] border-b-0 ${HUD_EDGE} ${HUD_BG} text-[10px] tabular-nums sm:text-[11px]`}>
            <button
              type="button"
              onClick={goUp}
              aria-label={focused ? "Close the building" : place ? "Back to Brazil" : "Back to towns"}
              className={`flex w-9 shrink-0 items-center justify-center border-r-2 ${HUD_EDGE} ${HUD_SOFT} hover:text-cream`}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <p className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap px-3">
              {place ? (
                <>
                  <span className="h-2 w-2 shrink-0 border border-border-light" style={{ background: place.uf ? swatchOf(place.uf) : LIME }} aria-hidden />
                  <span className="truncate text-cream">{place.uf ? place.name : "Island"}</span>
                  <span className={`shrink-0 ${HUD_SOFT}`}>· {fmt(place.devs.length)} devs</span>
                </>
              ) : (
                <>
                  <span style={{ color: LIME }}>Brasil</span>
                  <span className="text-cream">· {fmt(world.devs)} devs</span>
                  <span className={`truncate ${HUD_SOFT} max-sm:hidden`}>· {world.founders} of 27 states</span>
                </>
              )}
            </p>
            <span className="flex shrink-0 items-center gap-1.5 pr-3 text-cream">
              <span className="blink-dot inline-block h-1.5 w-1.5 shrink-0 bg-lime" aria-hidden />
              {fmt(here)} online
              {drivingNow > 0 && !inCar && (
                <button type="button" onClick={() => setDriversOpen((o) => !o)} className="underline decoration-lime/60 underline-offset-2 hover:text-lime">
                  · {fmt(drivingNow)} driving
                </button>
              )}
            </span>
          </div>
          {driversOpen && !inCar && (
            <DriversList
              drivers={carSpots}
              cities={world.allCities}
              onLook={(c) => {
                setDriversOpen(false);
                mapNav.send({ type: "flyTo", x: c.x, z: c.z, distance: 900 });
              }}
              onJoin={(c) => {
                setDriversOpen(false);
                posthog.capture("brasil_drive_join");
                startDrive({ x: c.x, z: c.z });
              }}
              onClose={() => setDriversOpen(false)}
            />
          )}
          <BrasilSearchBar
            cities={layout.cities}
            island={layout.island}
            buildings={world.buildings}
            onPickCity={(c) => {
              posthog.capture("brasil_search", { picked: "city", uf: c.uf });
              setPicker(null);
              openCity(c);
            }}
            onPickBuilding={(b) => {
              posthog.capture("brasil_search", { picked: "building", self: b.loginLower === viewerLogin?.toLowerCase() });
              setPicker(null);
              openBuilding(b);
            }}
            onPutOnMap={(login) => {
              posthog.capture("brasil_search", { picked: "missing", self: login === viewerLogin?.toLowerCase() });
              openPicker(login);
            }}
          />
          {picker && (
            <BrasilPicker
              signedIn={!!viewerLogin}
              viewerLogin={viewerLogin}
              forLogin={picker.forLogin}
              current={home}
              pending={joining.pending}
              error={joining.error}
              onPick={pickState}
              onSignIn={signIn}
              onClose={() => setPicker(null)}
            />
          )}
        </div>
      )}

      {top.length > 0 && !inCar && !state && !focused && !panel && (
        <div className="pointer-events-auto absolute right-4 top-4 flex flex-col gap-1 text-[11px] max-sm:hidden">
          {top.map((t, i) => (
            <button
              key={t.uf}
              type="button"
              onClick={() => openState(t.uf)}
              className={`flex justify-between gap-4 px-3 py-1 text-left ${i === 0 ? "bg-lime text-bg" : "bg-[#141417] text-cream hover:text-lime"}`}
            >
              <span>
                {i + 1}. {t.uf}
              </span>
              <span>{fmt(t.devs)}</span>
            </button>
          ))}
        </div>
      )}

      {/* While you were away: the top left is free only on a wide screen (the top bar is centered). */}
      {!inCar && !state && !focused && !panel && !picker && (
        <div className="pointer-events-auto absolute left-4 top-4 z-30 max-xl:hidden">
          <AwayCard signedIn={!!viewerLogin} />
        </div>
      )}

      {/* The compass and zoom buttons: desktop only, a phone pinches and turns with its fingers. */}
      {!inCar && (
        <div className="max-sm:hidden">
          <MapNavControls camera={cameraStore} accent={LIME} showPlaces={false} />
        </div>
      )}
      {!inCar && <BrasilMinimap cities={layout.cities} island={layout.island} camera={cameraStore} cars={carSpots} track={DRIFT_TAG} />}
      {!inCar && (
        <span className="pointer-events-none fixed bottom-1 left-1.5 z-20 text-[9px] normal-case leading-none text-muted/60 max-sm:bottom-[66px] max-sm:text-[8px]">
          Map data: IBGE · Natural Earth
        </span>
      )}

      {!inCar && !state && !focused && !panel && !picker && world.arrivals.length > 0 && (
        <Arrivals
          arrivals={world.arrivals}
          onPick={(login) => {
            const b = world.placed.get(login.toLowerCase());
            if (!b) return;
            posthog.capture("brasil_arrival_clicked");
            openBuilding(b);
          }}
        />
      )}

      {/* The bar: a row of words on a desktop, a tab bar of icons on a phone. */}
      {!inCar && (
        <nav className={`pointer-events-auto absolute inset-x-0 bottom-0 grid ${election ? "grid-cols-5" : "grid-cols-4"} gap-px border-t-2 border-border bg-border pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_0_rgba(0,0,0,0.25)] sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:flex sm:-translate-x-1/2 sm:border-t-0 sm:bg-transparent sm:pb-0 sm:shadow-[0_6px_0_rgba(0,0,0,0.35)]`}>
          <button type="button" onClick={() => openPanel("states")} className={bar}>
            <Trophy size={16} className="sm:hidden" aria-hidden />
            States
          </button>
          <button
            type="button"
            onClick={() => {
              setState(null);
              setFocused(null);
              setPanel(null);
              setPicker(null);
              camera.current?.flyTo(null);
            }}
            className={bar}
          >
            <MapIcon size={16} className="sm:hidden" aria-hidden />
            Brazil
          </button>
          {election && (
            <button type="button" onClick={() => openPanel("election")} className={bar}>
              <Landmark size={16} className="sm:hidden" aria-hidden />
              Vote
            </button>
          )}
          <button type="button" disabled={launching || world.devs === 0} onClick={() => startDrive()} className={`${bar} disabled:opacity-40`}>
            <Car size={16} className="sm:hidden" aria-hidden />
            Drive
          </button>
          <button
            type="button"
            onClick={() => {
              // On the map: to your building. Not yet: the way in.
              const mine = home && viewerLogin ? world.placed.get(viewerLogin.toLowerCase()) : undefined;
              if (mine) openBuilding(mine);
              else openPicker(null);
            }}
            className="flex flex-col items-center justify-center gap-1 bg-lime py-2 text-[9px] text-bg sm:h-10 sm:flex-row sm:gap-2 sm:px-4 sm:py-0 sm:text-[11px]"
          >
            {yours ? <span className="h-3 w-3 border border-bg/40 sm:h-2.5 sm:w-2.5" style={{ background: swatchOf(yours) }} aria-hidden /> : <Building2 size={16} className="sm:hidden" aria-hidden />}
            {home ? (
              "My building"
            ) : (
              <>
                <span className="sm:hidden">Put mine</span>
                <span className="max-sm:hidden">Put my building</span>
              </>
            )}
          </button>
        </nav>
      )}

      {drift.overlay}
      <div aria-hidden className={`pointer-events-none fixed inset-0 z-[60] bg-bg transition-opacity duration-300 ${curtain ? "opacity-100" : "opacity-0"}`} />
      {driving && driveReady && <AreaTitle telemetry={telemetry} cities={world.allCities} />}
      {driving && taste && <GuestGate reason="taste" town="Brasil" login={taste} onSignIn={tasteSignIn} onContinue={() => setTaste(null)} />}
      {driving && (
        <DriveHud
          firstRun={false}
          touchRef={touchUi ? touchRef : undefined}
          telemetry={telemetry}
          ready={driveReady}
          camera={driveCamera}
          muted={muted}
          volume={volume}
          paused={paused}
          gated={false}
          held={false}
          join={!viewerLogin ? { label: "Sign in", short: "Sign in", signIn: true, onClick: signIn } : undefined}
          drivers={drivers}
          crown={crownView}
          map={driveMap}
          emoteLog={emoteLog}
          onVolume={changeVolume}
          onEmote={(e) => emoteApi.current?.send(e)}
          onStartCrown={() => crownApi.current?.start()}
          onResume={() => setPaused(false)}
          onCamera={toggleCamera}
          onMute={toggleMute}
          onExit={exitDrive}
        />
      )}

      {panel === "states" && (
        <BrasilRanking
          states={world.states}
          points={world.statePoints}
          yours={yours}
          onPick={(s) => {
            posthog.capture("brasil_state_opened", { uf: s.uf, from: "ranking" });
            openState(s.uf);
          }}
          onClose={() => setPanel(null)}
        />
      )}

      {count && !inCar && !state && !focused && !panel && !picker && <ApuracaoWidget slug={league.slug} initial={count} onVote={() => openPanel("election")} />}

      {panel === "election" && election && (
        <ElectionPanel
          slug={league.slug}
          initial={election}
          startNumber={startVote}
          signedIn={!!viewerLogin}
          ufOf={(login) => world.ufOf.get(login.toLowerCase())?.uf ?? null}
          onSignIn={signIn}
          onPickDev={(login) => {
            const b = world.placed.get(login.toLowerCase());
            if (b) openBuilding(b);
          }}
          onPutOnMap={() => openPicker(null)}
          onClose={() => setPanel(null)}
        />
      )}

      {state && !inCar && (
        <StateCard
          key={state.uf}
          state={state}
          byLogin={world.placed}
          townPath={`/town/${league.slug}`}
          onPickDev={(login) => {
            const b = world.placed.get(login.toLowerCase());
            if (!b) return;
            openBuilding(b);
            setBackTo(state);
          }}
          onDriveHere={state.devs > 0 ? () => startDrive() : undefined}
          week={world.week}
          race={{ place: world.racePlace.get(state.uf) ?? 27, points: world.statePoints[state.uf] ?? 0 }}
          cabinet={{
            provisional: officeWeek.provisional,
            governor: world.offices.governors.get(state.uf) ?? null,
            senators: world.offices.senators.get(state.uf) ?? [],
            mayor: state.second ? (world.offices.mayors.get(state.second.name) ? { city: state.second.name, login: world.offices.mayors.get(state.second.name)!.login } : null) : null,
            totals: officeWeek.totals,
          }}
          onClose={() => {
            setState(null);
            replaceUrl("");
          }}
        />
      )}
      {focused && !inCar && (
        <BuildingCard
          key={focused.loginLower}
          building={focused}
          viewerLogin={viewerLogin}
          section={
            <>
              {arrived?.login === focused.loginLower && (
                <Arrival login={arrived.login} uf={arrived.uf} states={world.states} founder={!!world.ufOf.get(focused.loginLower)?.founder} townPath={`/town/${league.slug}`} />
              )}
              <ResidentRow
                offices={world.offices.byLogin.get(focused.loginLower) ?? []}
                weekly={officeWeek.totals[focused.loginLower] ?? 0}
                provisional={officeWeek.provisional}
                live={officeWeek.live.breakdown[focused.loginLower] ?? null}
                login={focused.loginLower}
                ufOf={world.ufOf}
                states={world.states}
                onState={openState}
                onMove={viewerLogin?.toLowerCase() === focused.loginLower ? () => openPicker(null) : undefined}
              />
            </>
          }
          onDriveTo={() => startDrive()}
          onClose={closeBuilding}
        />
      )}
    </main>
  );
}

/**
 * Driving: the city's name over the road as you come into it (and when the
 * car starts), like a game naming the area you just entered. Out between
 * cities nothing shows; coming back into the same city doesn't repeat it.
 */
function AreaTitle({ telemetry, cities }: { telemetry: { radar: { x: number; z: number } }; cities: CityLayout[] }) {
  const [shown, setShown] = useState<{ city: CityLayout; at: number } | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const { x, z } = telemetry.radar;
      if (!x && !z) return;
      let here: CityLayout | null = null;
      for (const c of cities) {
        const [cx, cz] = lotToWorld(...c.center);
        if (Math.hypot(cx - x, cz - z) < (c.radius + 2) * LOT) here = c;
      }
      const key = here ? cityKey(here) : null;
      if (key && key !== last.current) setShown({ city: here!, at: Date.now() });
      if (key) last.current = key;
    }, 400);
    return () => clearInterval(id);
  }, [telemetry, cities]);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  const c = shown.city;
  return (
    <div key={shown.at} className="area-title pointer-events-none fixed inset-x-0 top-[22%] z-30 flex flex-col items-center gap-1.5 text-center font-pixel uppercase">
      {c.uf && stateOf(c.uf).name !== c.name && <span className="text-[10px] tracking-[0.3em] text-muted">{stateOf(c.uf).name}</span>}
      <span className="text-3xl text-cream [text-shadow:0_3px_0_rgba(0,0,0,0.6)] sm:text-5xl">{c.uf ? c.name : "The island"}</span>
      <span className="text-[10px] text-lime">{fmt(c.devs.length)} devs live here</span>
    </div>
  );
}

/** Who's out driving and where: look at them from above, or start driving right where they are. */
function DriversList({
  drivers,
  cities,
  onLook,
  onJoin,
  onClose,
}: {
  drivers: { id: string; name: string; x: number; z: number }[];
  cities: CityLayout[];
  onLook: (c: { x: number; z: number }) => void;
  onJoin: (c: { x: number; z: number }) => void;
  onClose: () => void;
}) {
  const where = (x: number, z: number) => {
    let best: CityLayout | null = null;
    let bestD = Infinity;
    for (const c of cities) {
      const [cx, cz] = lotToWorld(...c.center);
      const d = Math.hypot(cx - x, cz - z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return "";
    const name = best.uf ? best.name : "the island";
    return bestD < (best.radius + 12) * LOT ? name : `near ${name}`;
  };
  return (
    <div className="pointer-events-auto border-[3px] border-b-0 border-border bg-bg/95 px-3 py-2 font-pixel uppercase text-cream backdrop-blur-sm">
      <div className="mb-1.5 flex items-baseline justify-between text-[9px] text-muted">
        <span>Driving now</span>
        <button type="button" onClick={onClose} className="hover:text-cream">
          ESC
        </button>
      </div>
      {drivers.length === 0 ? (
        <p className="py-1 text-[10px] normal-case text-muted">Finding them…</p>
      ) : (
        <ul className="flex flex-col">
          {drivers.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-1 text-[10px]">
              <span aria-hidden>🚗</span>
              <span className="min-w-0 flex-1 truncate normal-case">
                @{d.name} <span className="text-muted">· {where(d.x, d.z)}</span>
              </span>
              <button type="button" onClick={() => onLook(d)} className="shrink-0 border border-border px-2 py-0.5 text-[9px] text-cream hover:border-lime hover:text-lime">
                Look
              </button>
              <button type="button" onClick={() => onJoin(d)} className="shrink-0 bg-lime px-2 py-0.5 text-[9px] text-bg">
                Drive here
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "3m", "2h": how long ago, short. */
function ago(at: number, now: number): string {
  const m = Math.max(1, Math.round((now - at) / 60_000));
  return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
}

/**
 * Who just arrived, one at a time over the bar: "@login just arrived · SP · 3m",
 * a tap away from their building. Whoever commented on the reel opens the map
 * and sees their name go by.
 */
function Arrivals({ arrivals, onPick }: { arrivals: { login: string; uf: UF | null; at: number }[]; onPick: (login: string) => void }) {
  const [i, setI] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (arrivals.length < 2) return;
    const t = setInterval(() => {
      setI((n) => (n + 1) % Math.min(arrivals.length, 12));
      setNow(Date.now());
    }, 4000);
    return () => clearInterval(t);
  }, [arrivals.length]);
  const a = arrivals[i % arrivals.length];
  return (
    <button
      key={a.login}
      type="button"
      onClick={() => onPick(a.login)}
      className="pointer-events-auto absolute bottom-[70px] left-1/2 z-20 flex max-w-[calc(100vw-24px)] -translate-x-1/2 animate-[fade-in_0.4s_ease-out] items-center gap-2 bg-bg/90 px-3 py-1.5 font-pixel text-[10px] uppercase text-muted hover:text-cream sm:bottom-[72px]"
    >
      <span className="blink-dot h-1.5 w-1.5 shrink-0 bg-lime" aria-hidden />
      <span className="truncate normal-case text-cream">@{a.login}</span>
      <span className="shrink-0">just arrived</span>
      <span className="shrink-0 text-lime">{a.uf ?? "island"}</span>
      <span className="shrink-0">{ago(a.at, now)}</span>
    </button>
  );
}

/** Your card right after you're placed: where you landed, what you are there, and the invite. */
function Arrival({ login, uf, states, founder, townPath }: { login: string; uf: UF | null; states: StateStats[]; founder: boolean; townPath: string }) {
  const [copied, setCopied] = useState(false);
  const s = uf ? states.find((x) => x.uf === uf) : null;
  const invite = () => {
    // Your link: its share card says where you live.
    const url = `${window.location.origin}${townPath}?at=${login}`;
    // Shared on WhatsApp and stories, by and to Brazilians: Portuguese, one line, the link does the rest.
    const text = founder && uf ? `Fundei ${ptState(uf, "the")} no mapa dos devs 🇧🇷 ${url}` : `Tô no mapa dos devs do Brasil 🇧🇷 ${url}`;
    posthog.capture("brasil_invite_copied", { uf, from: "arrival" });
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return (
    <div className="mx-4 mb-3 border-2 border-lime px-3 py-2.5">
      <p className="text-[8px] text-lime">You&apos;re on the map</p>
      <p className="mt-1 text-sm text-cream">{s ? (founder ? `Founder of ${s.name}` : `You're in ${s.name}`) : "You're on the island"}</p>
      <p className="mt-0.5 text-[9px] normal-case text-muted">
        {s ? (founder ? `The first dev in ${s.uf}. Everyone after you lives in your city.` : `Dev #${fmt(s.devs)} in ${s.uf} · #${s.place} of 27 states`) : "No state yet. Pick one anytime with Move."}
      </p>
      <button type="button" onClick={invite} className="btn-press mt-2 w-full border-2 border-lime bg-lime py-1.5 text-[10px] text-bg">
        {copied ? "Invite copied" : s ? `Invite to ${s.uf}` : "Invite a friend"}
      </button>
    </div>
  );
}

/** A resident's state on their building card: the state (a click opens it), founder, place there. */
function ResidentRow({
  login,
  ufOf,
  states,
  onState,
  onMove,
  offices,
  weekly,
  provisional,
  live,
}: {
  /** What they hold this week, and the points that elected them. */
  offices: Office[];
  weekly: number;
  provisional: boolean;
  /** Their points this week so far, by where they came from. */
  live: PointsBreakdown | null;
  login: string;
  ufOf: ReadonlyMap<string, { uf: UF | null; founder: boolean }>;
  states: StateStats[];
  onState: (uf: UF) => void;
  /** Your own building: change state. */
  onMove?: () => void;
}) {
  const r = ufOf.get(login);
  const s = r?.uf ? states.find((x) => x.uf === r.uf) : null;
  const inState = s ? s.top.findIndex((l) => l.toLowerCase() === login) : -1;
  return (
    <>
      {offices.length > 0 && (
        <div className="mx-4 mb-2 flex flex-col gap-1 border-2 border-lime px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {offices.map((o) => (
              <span key={officeLabel(o)} className="bg-lime px-1.5 py-0.5 text-[9px] text-bg">
                {officeLabel(o)}
              </span>
            ))}
          </div>
          <p className="text-[9px] normal-case text-muted">
            {offices.some((o) => o.kind === "president")
              ? "Voted in by Brazil's devs."
              : provisional
                ? `Leading this week with ${fmt(weekly)} points. Offices change Sunday 21h.`
                : `Elected by ${fmt(weekly)} points last week. Holds it until Sunday 21h.`}
          </p>
        </div>
      )}
      {live && totalOf(live) > 0 && <PointsLine b={live} />}
      <div className="mx-4 mb-3 flex items-center justify-between gap-2 border-2 border-border px-3 py-2">
        {s ? (
          <button type="button" onClick={() => onState(s.uf)} className="flex items-center gap-2 text-[9px] text-cream hover:text-lime">
            <span className="h-2.5 w-2.5" style={{ background: swatchOf(s.uf) }} aria-hidden />
            {stateOf(s.uf).name}
          </button>
        ) : (
          <span className="text-[9px] text-muted">The island · no state</span>
        )}
        <span className="flex items-center gap-2 text-[9px] text-muted">
          {r?.founder ? <span className="text-lime">Founder</span> : inState >= 0 ? `Top ${inState + 1} in ${s?.uf}` : ""}
          {onMove && (
            <button type="button" onClick={onMove} className="text-cream underline hover:text-lime">
              Move
            </button>
          )}
        </span>
      </div>
    </>
  );
}

/** A resident's points this week and where they came from, on their building card: the total, then an icon and a count per source. */
function PointsLine({ b }: { b: PointsBreakdown }) {
  const n = (k: "invite" | "story" | "comment" | "coded") => b[k] / POINTS[k];
  const parts: { icon: LucideIcon; count: number; label: string }[] = [
    { icon: UserPlus, count: n("invite"), label: "friends who joined" },
    { icon: Instagram, count: n("story"), label: "stories" },
    { icon: MessageCircle, count: n("comment"), label: "comments" },
    { icon: Code2, count: n("coded"), label: "days coding" },
    { icon: VoteIcon, count: b.vote ? 1 : 0, label: "voted" },
  ].filter((p) => p.count > 0);
  return (
    <div className="mx-4 mb-2 flex items-center justify-between gap-3 border-2 border-border px-3 py-2">
      <span className="text-[9px] text-cream">
        <span className="text-sm text-lime">{fmt(totalOf(b))}</span> pts this week
      </span>
      <span className="flex items-center gap-2.5">
        {parts.map((p) => (
          <span key={p.label} title={`${p.count} ${p.label}`} aria-label={`${p.count} ${p.label}`} className="flex items-center gap-1 text-[9px] tabular-nums text-muted">
            <p.icon size={12} aria-hidden />
            {p.count}
          </span>
        ))}
      </span>
    </div>
  );
}
