"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Car, ChevronLeft, Landmark, Map as MapIcon, Trophy } from "lucide-react";
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
import type { RallyApi, RallyView } from "@/components/league/drive/RallyMode";
import RacePanel, { RacePicker, raceActive } from "@/components/towns/brasil/RacePanel";
import { GameMenu, type GameMode } from "@/components/games/kit";
import { Crown as CrownIcon, Flag as FlagIcon, Map as DriftIcon } from "lucide-react";
import type { RallyState } from "@/lib/league-city/drive/rally";
import { Band } from "@/components/games/ui";
import { useLang, useT } from "@/lib/i18n/LangProvider";
import { PixelSocialIcon } from "@/components/SocialIcons";
import { T } from "@/components/games/kit";
import { cityByKey, parseRouteKey, raceRoute, startLine } from "@/lib/towns/brasil-race";
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
import CityCard from "@/components/towns/brasil/CityCard";
import { stateStats, swatchOf, weekCrown, type StateStats } from "@/components/towns/brasil/stats";
import { stateOf, type BrasilLayout, type CityLayout, type UF } from "@/lib/towns/brasil-map";
import type { BrCity } from "@/lib/towns/br-cities";
import { brasilWorld, plainBuilding } from "@/lib/towns/brasil-world";
import { brasilOffices, officeLabel, type Office } from "@/lib/towns/brasil-roles";
import type { BrasilWeek } from "@/lib/towns/brasil-server";
import type { Count, ElectionView } from "@/lib/towns/brasil-election-server";
import type { Blocked, CardData } from "@/lib/towns/brasil-projects-server";
import type { ProjectCard } from "@/lib/towns/brasil-projects";
import ProjectsCard from "@/components/towns/brasil/ProjectsCard";
import ProjectsBoard, { ALL_PROJECTS, type ProjectsView } from "@/components/towns/brasil/ProjectsBoard";
import ProjectSheet, { type ProjectView } from "@/components/towns/brasil/ProjectSheet";
import ShareProjectSheet from "@/components/towns/brasil/ShareProjectSheet";
import AdRequestSheet from "@/components/towns/brasil/AdRequestSheet";
import MyProjects, { ProjectWin } from "@/components/towns/brasil/MyProjects";
import HeistHud from "@/components/towns/brasil/heist/HeistHud";
import { HeistCard, HeistResultTower, SideChoice } from "@/components/towns/brasil/heist/HeistMap";
import { HeistPreviewStrip, IN_CAR, heistMock, useHeistPreview } from "@/components/towns/brasil/heist/HeistPreview";

// The Brasil town's page: the map of Brazil with the town's residents, each
// in their city, their buildings sized like everywhere in Git City. Over it:
// the counter; a bar to search the map, rank the states
// and pick your city; a state's card from a capital's tag, a dev's from their
// building; the compass, the zoom and a minimap. ?uf=SP opens a state,
// ?cidade=campinas-sp a city, ?at=login a building. A resident who only ever
// named a state is asked once which city they're from. Driving across the drift track's START line (between
// São Paulo and Rio) turns the drive into a drift run there (BrasilDrift).

export interface BrasilTownProps {
  league: { slug: string; name: string };
  layout: BrasilLayout;
  /** Every resident's city record (main-city size, lit windows). */
  cityDevs: Record<string, unknown>[];
  cityNorms: LayoutNorms;
  viewerLogin: string | null;
  /** Where the viewer lives on the map (their city's IBGE code; null: the island), and whether they named it; null when they're not on it. */
  home: { city: number | null; picked: boolean } | null;
  /** Open on a state, a city (its slug) or a building. */
  startAt: { uf: string } | { city: string } | { login: string } | null;
  /** When Brazil last grew to make room for its cities (ms), or null: the ticker says so for a day. */
  grewAt?: number | null;
  /** ?pick=1, back from signing in after a guest's free building: open the state picker if you're not on the map. */
  startPick?: boolean;
  /** The week's points the offices come from (last closed week, or this week so far before the first one closes), and this week's. */
  week: BrasilWeek;
  /** Each state's founder (login by UF): the first dev ever in it, kept when they move. */
  stateFounders?: Partial<Record<UF, string>>;
  /** The presidential race and who's in office (null while the presidency is off). */
  election: ElectionView | null;
  /** The presidential count for the corner widget (null while the presidency is off). */
  count?: Count | null;
  /** ?vote=34 / ?run=34 (a shared vote or candidacy, the count, a sign-in coming back): the voting machine opens with that number typed; "open": just opens it. */
  startVote?: number | "open" | null;
  /** This week's projects for the top-right card (null: couldn't be read). */
  projects?: CardData | null;
  /** Past weeks' winning projects by maker login (lowercase), for their building's card. */
  projectWins?: Record<string, { week: string; name: string; slug: string }>;
  /** ?project=slug (a shared project, a sign-in coming back): its sheet opens. */
  startProject?: string | null;
  /** ?share=1 / ?ad=1 / ?projects=1 (a sign-in coming back, an old link to the projects page): the share form, the ad request or every project opens. */
  startSheet?: "share" | "ad" | "projects" | null;
}

/** The projects' sheets on the right: one project, the share form (or an edit), the ad request. */
type ProjOverlay = { kind: "project"; slug: string; initial?: ProjectCard; from: string } | { kind: "share"; editing?: ProjectView; blocked?: Blocked | null } | { kind: "ad" } | null;

type PanelId = "states" | "election" | "projects" | null;
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

export default function BrasilTown({ league, layout, cityDevs, cityNorms, viewerLogin, home, startAt, startPick = false, grewAt = null, week: officeWeek, election, count = null, startVote = null, stateFounders = {}, projects = null, projectWins = {}, startProject = null, startSheet = null }: BrasilTownProps) {
  const { lang, setLang, t } = useLang();
  const router = useRouter();
  const camera = useRef<CameraApi | null>(null);
  const cameraStore = useMemo(() => createCameraStore(), []);
  const [telemetry, setTelemetry] = useState(createTelemetry);
  const crownApi = useRef<CrownApi | null>(null);
  // City races: the HUD starts and joins them through the drive room; the record decides whether your ghost goes up.
  const rallyApi = useRef<RallyApi | null>(null);
  const [rallyView, setRallyView] = useState<RallyView | null>(null);
  const raceRecordRef = useRef<number | null>(null);
  /** A race's start line, from the map's own route between its cities. */
  const raceLine = useCallback((r: { from: string; to: string }) => raceRoute(layout, r.from, r.to)?.line ?? null, [layout]);
  const raceStartLine = useCallback(
    (r: { from: string; to: string }) => {
      const built = raceRoute(layout, r.from, r.to);
      return built ? startLine(built) : null;
    },
    [layout],
  );
  /** ?race=<route>: a beaten record's email opens that route's race. */
  const [pendingRace, setPendingRace] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("race")));
  /** The Games menu (G): closed, its list of modes, or the race's step (with a route from a link). */
  const [games, setGames] = useState<null | { step: "modes" } | { step: "race"; initial: string | null }>(null);
  const closeGames = useCallback(() => setGames(null), []);
  /** A race's results are on screen: the car stands still under them. */
  const [raceResults, setRaceResults] = useState(false);
  /** On the grid or between the gates: the Games menu waits. */
  const racing = raceActive(rallyView);
  // Joined a race from inside the menu (its invite shows over it): the menu closes for the grid.
  const [wasRacing, setWasRacing] = useState(racing);
  if (wasRacing !== racing) {
    setWasRacing(racing);
    if (racing && games) setGames(null);
  }
  const [driving, setDriving] = useState(false);
  /** On the drift track: the town's car is parked, a drift run is on. */
  const [drifting, setDrifting] = useState(false);
  const inCar = driving || drifting;
  // Local only (?heist=1): made-up city-of-the-day states over the real page.
  const [heistStep, setHeistStep] = useHeistPreview();
  const heist = useMemo(() => (heistStep ? heistMock(heistStep) : null), [heistStep]);
  const heistInCar = !!heistStep && IN_CAR.includes(heistStep);
  /** Where the next drive starts instead of a building (to or back from the drift track: the highway by its gate). */
  const [driveSpawn, setDriveSpawn] = useState<Spawn | null>(null);
  /** Dark between the town's car and the drift run, both ways, while the next world loads. */
  const [curtain, setCurtain] = useState<"drift" | "city" | null>(null);
  // The election as last read by the machine, so the count's corner card knows your vote after you close it.
  const [electionNow, setElectionNow] = useState(election);
  const [panel, setPanel] = useState<PanelId>(startVote && election ? "election" : null);
  /** The number the voting machine opens with, and a key to open it fresh with another. */
  const [vote, setVote] = useState<{ number: number | null; key: number }>({ number: typeof startVote === "number" ? startVote : null, key: 0 });
  /** Sent to put a building on the map from the voting machine: come back to it (with this number) once it's there. */
  const backToVote = useRef<{ number: number | null } | null>(null);
  const [state, setState] = useState<StateStats | null>(null);
  /** A city's card (not a capital: a capital opens its state). */
  const [city, setCity] = useState<CityLayout | null>(null);
  const [focused, setFocused] = useState<CityBuilding | null>(null);
  /** The state card a building was opened from: closing the building brings it back. */
  const [backTo, setBackTo] = useState<StateStats | null>(null);
  /** The city picker under the search, for a username typed there (null: yours), maybe opened on a city to found. */
  const [picker, setPicker] = useState<{ forLogin: string | null; query?: string } | null>(null);
  const [proj, setProj] = useState<ProjOverlay>(null);
  /** The projects board's tab and filters, and whether a sheet opened from it goes back to it on close. */
  const [projectsView, setProjectsView] = useState<ProjectsView>(ALL_PROJECTS);
  const [fromBoard, setFromBoard] = useState(false);
  /** A project sheet closes: back to the board when it was opened from there. */
  const closeProj = () => {
    setProj(null);
    if (fromBoard) setPanel("projects");
    setFromBoard(false);
  };
  /** Bumped when a project was posted, edited, voted or taken down: the card and your list read again. */
  const [projectsKey, setProjectsKey] = useState(0);
  const [joining, setJoining] = useState<{ pending: { ibge: number | null; name: string } | null; error: string | null }>({
    pending: null,
    error: null,
  });
  /** Just placed: in which city (null: the island), until the refreshed map has the building (then the camera goes there). */
  const [arriving, setArriving] = useState<{ city: number | null } | null>(null);
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
  /** The voting machine, with a number typed or empty. */
  const openVote = (number: number | null = null) => {
    setVote((v) => ({ number, key: v.key + 1 }));
    openPanel("election");
  };
  const openPanel = (p: PanelId) => {
    setState(null);
    setFocused(null);
    setBackTo(null);
    setPicker(null);
    setProj(null);
    setCity(null);
    setPanel(p);
  };
  /** The picker takes over: cards and panels close. */
  const openPicker = (forLogin: string | null, query?: string) => {
    setState(null);
    setFocused(null);
    setBackTo(null);
    setPanel(null);
    setProj(null);
    setCity(null);
    setJoining({ pending: null, error: null });
    setPicker({ forLogin, query });
    posthog.capture("brasil_picker_opened", { signed_in: !!viewerLogin, on_map: !!home });
  };

  const world = useMemo(() => {
    const records = generateCityLayout(cityDevs as unknown as DeveloperRecord[], undefined, cityNorms).buildings;
    const byLogin = new Map(records.map((b) => [b.loginLower, b]));
    const { objects, byDevId } = brasilWorld(layout, (dev) => byLogin.get(dev.login.toLowerCase()) ?? plainBuilding(dev.login), 1);
    const buildings = leagueBuildings(objects, scaleTownHeights(byDevId));
    const placed = new Map(buildings.map((b) => [b.loginLower, b]));
    const states = stateStats(layout, placed, now, stateFounders);
    // The state each founder founded (login lowercase), for their card's seal.
    const foundedState = new Map(Object.entries(stateFounders).map(([uf, login]) => [login!.toLowerCase(), uf as UF]));
    const devs = [...layout.cities, layout.island].reduce((n, c) => n + c.devs.length, 0);
    const founded = layout.cities.filter((c) => c.devs.length > 0).length;
    // Each resident's state and whether they founded their city, for their card.
    const ufOf = new Map([...layout.cities, layout.island].flatMap((c) => c.devs.map((d) => [d.dev.login.toLowerCase(), { uf: c.uf, founder: d.founder }] as const)));
    const allCities = [...layout.cities, layout.island];
    const cityByKey = new Map(allCities.map((c) => [cityKey(c), c]));
    const cityBySlug = new Map(allCities.filter((c) => c.slug).map((c) => [c.slug!, c]));
    const cityOfLogin = new Map(allCities.flatMap((c) => c.devs.map((d) => [d.dev.login.toLowerCase(), c] as const)));
    const week = weekCrown(layout, now);
    // Who arrived in the last day, newest first: the ticker over the bar and the "new" name plates.
    const arrivals = allCities
      .flatMap((c) => c.devs.map((d) => ({ login: d.dev.login, where: c.ibge === null ? "island" : c.name, at: d.at })))
      .filter((a) => now - a.at < 86_400_000)
      .sort((a, b) => b.at - a.at);
    const fresh = new Set(arrivals.map((a) => a.login.toLowerCase()));
    const offices = brasilOffices(layout, new Map(Object.entries(officeWeek.totals)), election?.president?.login ?? null);
    // Each state's points this week: its residents' points added up.
    const statePoints: Partial<Record<UF, number>> = {};
    for (const c of allCities) for (const d of c.devs) if (d.dev.uf) statePoints[d.dev.uf] = (statePoints[d.dev.uf] ?? 0) + (officeWeek.live.totals[d.dev.login.toLowerCase()] ?? 0);
    // Each state's place in the week's race: the States table's order.
    const racePlace = new Map([...states].sort((a, b) => (statePoints[b.uf] ?? 0) - (statePoints[a.uf] ?? 0) || b.devs - a.devs || a.name.localeCompare(b.name)).map((st, i) => [st.uf, i + 1]));
    return { objects, buildings, placed, states, devs, founded, ufOf, allCities, cityByKey, cityBySlug, cityOfLogin, week, arrivals, fresh, offices, statePoints, racePlace, foundedState };
  }, [layout, cityDevs, cityNorms, now, officeWeek, election, stateFounders]);
  // Each holder's highest office, short, for the name plates.
  const plateOffice = useMemo(() => {
    const short = lang === "pt" ? ({ president: "Pres", governor: "Gov", senator: "Sen", mayor: "Pref" } as const) : ({ president: "Pres", governor: "Gov", senator: "Sen", mayor: "Mayor" } as const);
    return new Map([...world.offices.byLogin].map(([l, os]) => [l, short[os[0].kind]]));
  }, [world.offices, lang]);

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
    setRallyView(null);
    setRaceResults(false);
    setGames(null);
    emoteLog.clear();
  }, [emoteLog, telemetry]);
  // Esc pauses; Esc again on the pause menu leaves the car.
  useEffect(() => {
    if (!driving) return;
    const onKey = (e: KeyboardEvent) => {
      // G opens the Games menu (it answers its own keys, Esc included, while it's open).
      if (e.code === "KeyG" && !e.repeat && !paused && !taste && driveReady && !games && !racing && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setGames({ step: "modes" });
        return;
      }
      if (e.key !== "Escape" || e.repeat || taste || games) return; // the free building's choice answers Esc itself
      e.preventDefault();
      if (paused) exitDrive();
      else setPaused(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [driving, paused, exitDrive, taste, games, driveReady, racing]);
  // From the map (not driving): the room's races too, for the "Live" card.
  const [watchRace, setWatchRace] = useState<{ rally: RallyState; offset: number } | null>(null);
  const watch = useDriveWatch(league.slug, !inCar, (msg) => {
    if (msg.t === "rally") return setWatchRace({ rally: msg.rally as RallyState, offset: Number(msg.now) - Date.now() });
    applyRoomDamage(smash, msg, Date.now());
  });
  /** "Drive and join" from the map: the race to join once the car is in the room. */
  const [joinRace, setJoinRace] = useState<string | null>(null);
  /** The race on the map's Live card: one still taking racers. */
  const liveRace = watchRace && watchRace.rally.phase === "invite" && watchRace.rally.route && Date.now() + watchRace.offset < watchRace.rally.inviteEnds ? watchRace.rally : null;
  // In the car for a race from the Live card: join it as soon as the room shows it, or let it go.
  useEffect(() => {
    if (!joinRace) return;
    const r = rallyView?.rally;
    if (r?.id === joinRace) {
      if (r.phase === "invite" && rallyApi.current?.join()) setJoinRace(null);
      else if (r.phase !== "invite") setJoinRace(null);
    }
    const t = setTimeout(() => setJoinRace(null), 20_000);
    return () => clearTimeout(t);
  }, [joinRace, rallyView]);
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
      setProj(null);
      setCity(null);
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
      setProj(null);
      setCity(null);
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
    setProj(null);
    setCity(null);
    camera.current?.flyTo(null);
  }, []);
  // Back (the phone's, or ‹ after a step this page took): show what the address says.
  useEffect(() => {
    const onPop = () => {
      const q = new URLSearchParams(window.location.search);
      applying.current = true;
      const at = q.get("at");
      const uf = q.get("uf");
      const cidade = q.get("cidade");
      const b = at ? world.placed.get(at.toLowerCase()) : undefined;
      const city = cidade ? world.cityBySlug.get(cidade) : undefined;
      if (b) openBuilding(b);
      else if (city) openCity(city);
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
  }, [world, openBuilding, openState, toBrazil, state]); // eslint-disable-line react-hooks/exhaustive-deps
  /** A capital opens its state's card; any other city, the camera over it and its link. */
  const openCity = useCallback(
    (c: CityLayout) => {
      if (c.uf && c.capital) return openState(c.uf);
      if (c.slug) pushUrl(`cidade=${c.slug}`);
      setState(null);
      setFocused(null);
      setPanel(null);
      setPicker(null);
      setProj(null);
      setCity(c);
      camera.current?.flyTo(c.center, c.radius);
    },
    [openState, pushUrl],
  );

  // Who comes, and how: the top of the comment → visit → building funnel.
  useEffect(() => {
    posthog.capture("brasil_map_viewed", { signed_in: !!viewerLogin, on_map: !!home, link: startAt ? ("uf" in startAt ? "state" : "city" in startAt ? "city" : "building") : null });
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
      } else if ("city" in startAt) {
        const c = world.cityBySlug.get(startAt.city);
        if (c) {
          openCity(c);
          posthog.capture("brasil_city_opened", { city: c.ibge, from: "link" });
        }
      } else {
        const b = world.placed.get(startAt.login);
        // Back from signing in after the free building: on the map is joining, so pick your city.
        if (startPick && viewerLogin && !home) openPicker(null);
        else if (b) openBuilding(b);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [startAt, world, openState, openCity, openBuilding, startPick, viewerLogin, home]); // eslint-disable-line react-hooks/exhaustive-deps

  // ?project=slug: the project's sheet, once the map is up.
  useEffect(() => {
    if (!startProject) return;
    const t = setTimeout(() => setProj({ kind: "project", slug: startProject, from: "link" }), 600);
    return () => clearTimeout(t);
  }, [startProject]);
  useEffect(() => {
    if (!startSheet) return;
    // The page read whether they can post with the card: the form opens on the right screen.
    const t = setTimeout(() => (startSheet === "projects" ? setPanel("projects") : setProj(startSheet === "ad" ? { kind: "ad" } : { kind: "share", blocked: projects?.me ? projects.me.blocked : undefined })), 600);
    return () => clearTimeout(t);
  }, [startSheet, projects]);

  // ?race=<route>: straight into the car at the route's start city; the race card opens once it's ready.
  const raceStarted = useRef(false);
  useEffect(() => {
    if (raceStarted.current || !pendingRace) return;
    const from = cityByKey(layout, parseRouteKey(pendingRace)?.from ?? "");
    raceStarted.current = true;
    if (!from) {
      setPendingRace(null);
      return;
    }
    const t = setTimeout(() => startDrive({ x: from.hub[0] * LOT, z: from.hub[1] * LOT }), 700);
    return () => clearTimeout(t);
  }, [pendingRace, layout]); // eslint-disable-line react-hooks/exhaustive-deps
  // Once the car is ready, the link's route opens in the Games menu.
  useEffect(() => {
    if (!pendingRace || !driving || !driveReady) return;
    const key = pendingRace;
    const t = setTimeout(() => {
      setGames({ step: "race", initial: key });
      setPendingRace(null);
    }, 300);
    return () => clearTimeout(t);
  }, [pendingRace, driving, driveReady]);

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
      paused: paused || !!taste || !!games || raceResults,
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
      rally: { api: rallyApi, onView: setRallyView, recordMs: raceRecordRef, startLine: raceStartLine, routeLine: raceLine },
    }),
    [telemetry, noop, driveFrom, driveSpawn, league.slug, viewerLogin, guest, driveCamera, toggleCamera, muted, volume, emoteLog, paused, exitDrive, taste, onTaste, games, raceStartLine, raceResults, raceLine],
  );
  /** Your state, from your city. */
  const homeCity = viewerLogin ? world.cityOfLogin.get(viewerLogin.toLowerCase()) : undefined;
  const yours = homeCity?.uf ?? null;
  // The drive minimap: the map around the car and your building.
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
    setRallyView(null);
    setRaceResults(false);
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
  const pickCity = async (city: { ibge: number | null; name: string }) => {
    setJoining({ pending: city, error: null });
    try {
      const res = await fetch(`/api/towns/${league.slug}/brasil/place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city.ibge }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setJoining({ pending: null, error: body.error ?? t("Couldn't put you on the map.", "Não deu pra te colocar no mapa.") });
      // The picker stays (saying "finding your lot") until the refreshed map has the building.
      setArriving({ city: city.ibge });
      router.refresh();
    } catch {
      setJoining({ pending: null, error: t("Couldn't put you on the map.", "Não deu pra te colocar no mapa.") });
    }
  };

  // The refreshed map has your building where you picked: fly there, ring the lot, open your card.
  useEffect(() => {
    if (!arriving || !viewerLogin) return;
    const login = viewerLogin.toLowerCase();
    const b = world.placed.get(login);
    if (!b || (world.cityOfLogin.get(login)?.ibge ?? null) !== arriving.city) return;
    const t = setTimeout(() => {
      setArriving(null);
      setPicker(null);
      setJoining({ pending: null, error: null });
      setPulse({ x: b.position[0], z: b.position[2], key: Date.now() });
      // Came from the voting machine: back to it, the number still typed, now able to vote.
      if (backToVote.current) {
        const n = backToVote.current.number;
        backToVote.current = null;
        setVote((v) => ({ number: n, key: v.key + 1 }));
        setPanel("election");
        return;
      }
      openBuilding(b);
    }, 0);
    return () => clearTimeout(t);
  }, [arriving, viewerLogin, world, openBuilding]);
  const tasteSignIn = () => {
    const next = `/town/${league.slug}?at=${encodeURIComponent(taste ?? "")}&pick=1`;
    void signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`);
  };
  /** Sign in from the voting machine, and come back to it with the number typed. */
  const signInToVote = (n: number | null) => {
    posthog.capture("brasil_signin_clicked", { from: "vote" });
    const next = `/town/${league.slug}?vote=${n ?? "open"}`;
    void signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`);
  };
  /** Sign in from a project (to upvote, report or post), and come back to it. */
  const signInForProject = (slug: string | null) => {
    posthog.capture("brasil_signin_clicked", { from: slug ? "project" : "share_project" });
    const next = slug ? `/town/${league.slug}?project=${encodeURIComponent(slug)}` : `/town/${league.slug}?share=1`;
    void signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`);
  };
  /** A project's sheet takes the right side: any card closes. */
  const openProject = (slug: string, from: string, initial?: ProjectCard) => {
    setState(null);
    setFocused(null);
    setBackTo(null);
    setPanel(null);
    setPicker(null);
    setCity(null);
    setProj({ kind: "project", slug, from, initial });
  };
  const openShare = (editing?: ProjectView, blocked?: Blocked | null) => {
    setState(null);
    setFocused(null);
    setBackTo(null);
    setPanel(null);
    setPicker(null);
    setCity(null);
    setProj({ kind: "share", editing, blocked });
  };
  const signIn = () => {
    posthog.capture("brasil_signin_clicked", { for_login: picker?.forLogin ?? null });
    void signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=/town/${league.slug}`);
  };

  // The Games menu's modes: a city race, Crown Rush (with someone else here), the drift track (the arrow takes you).
  const raceBusy = !!rallyView && (rallyView.rally.phase === "invite" || rallyView.rally.phase === "countdown" || rallyView.rally.phase === "live");
  const crownBusy = !!crownView && (crownView.crown.phase === "countdown" || crownView.crown.phase === "live");
  // The loading band's live line: a race still taking racers, else how many drive here.
  const startNote = liveRace?.route
    ? t(`${here} driving · race to ${cityByKey(layout, liveRace.route.to)?.name ?? "?"} open`, `${here} dirigindo · corrida pra ${cityByKey(layout, liveRace.route.to)?.name ?? "?"} aberta`)
    : here > 1
      ? t(`${here} driving here now`, `${here} dirigindo aqui agora`)
      : null;
  const gameModes: GameMode[] = [
    {
      id: "race",
      icon: FlagIcon,
      name: t("Race", "Corrida"),
      line: t("To another city. Everyone starts together.", "Até outra cidade. Todo mundo larga junto."),
      need: "1+",
      blocked: raceBusy ? t("A race is on. Join the next one.", "Tem corrida rolando. Entra na próxima.") : crownBusy ? t("Crown rush is on.", "Crown rush rolando.") : null,
    },
    {
      id: "crown",
      icon: CrownIcon,
      name: "Crown rush",
      line: t("Hold the crown 30 s. Bump to steal it.", "Segura a coroa 30 s. Bate pra roubar."),
      need: "2+",
      blocked: drivers.length === 0 ? t("Needs someone else driving here.", "Precisa de mais alguém dirigindo aqui.") : raceBusy ? t("A race is on.", "Tem corrida rolando.") : crownBusy ? t("One is on now.", "Já tem uma rolando.") : null,
    },
    { id: "drift", icon: DriftIcon, name: t("Drift track", "Pista de drift"), line: t("Off the coast between SP and RJ. The map shows the way.", "No mar entre SP e RJ. O mapa mostra o caminho."), need: "1" },
  ];
  /** Sends the race to the room; false (and the menu stays) when the room can't be reached. */
  const startRace = (route: Parameters<NonNullable<typeof rallyApi.current>["start"]>[0], how: string, solo = false): boolean => {
    if (!rallyApi.current?.start(route, solo)) return false;
    posthog.capture("brasil_race_started", { km: Math.round(route.length / 100) / 10, gates: route.gates.length, how, solo, others: drivers.length });
    setGames(null);
    return true;
  };
  const pickGame = (id: string) => {
    if (id === "race") setGames({ step: "race", initial: null });
    else if (id === "crown") {
      crownApi.current?.start();
      setGames(null);
    } else if (id === "drift") {
      // The drift track's start: on the minimap, the way there.
      const p = pointAt(courseOf(BRASIL_DRIFT).track, -30);
      telemetry.route = { login: "", x: p.x * M_TO_UNIT, z: p.z * M_TO_UNIT, reach: 30 };
      setGames(null);
    }
  };
  /** On the map with only a state: asked once which city (until they pick one or wave it off). */
  const [askCity, setAskCity] = useState(() => {
    if (!home || home.picked || home.city === null) return false;
    try {
      return window.localStorage.getItem("gc:brasil-ask-city") !== "no";
    } catch {
      return true;
    }
  });
  const dismissAsk = () => {
    setAskCity(false);
    try {
      window.localStorage.setItem("gc:brasil-ask-city", "no");
    } catch {
      // private mode: asked again next time
    }
  };
  const bar = "flex min-h-[60px] flex-col items-center justify-center gap-1.5 bg-[#141417] py-2 text-[9px] text-cream hover:text-lime sm:h-10 sm:min-h-0 sm:flex-row sm:gap-2 sm:px-3 sm:py-0 sm:text-[11px]";

  const pickHeist = (step: NonNullable<typeof heistStep>) => {
    setHeistStep(step);
    if (IN_CAR.includes(step) && !inCar) startDrive();
  };

  return (
    <main className="fixed inset-0 bg-bg font-pixel uppercase text-cream">
      <BrasilScene
        scale={layout.scale}
        cities={layout.cities}
        island={layout.island}
        objects={world.objects}
        buildings={world.buildings}
        cameraApi={camera}
        cameraStore={cameraStore}
        onTag={(c) => {
          if (c.uf && c.capital) posthog.capture("brasil_state_opened", { uf: c.uf, from: "tag" });
          else posthog.capture("brasil_city_opened", { city: c.ibge, from: "tag" });
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
        offices={plateOffice}
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
              aria-label={focused ? t("Close the building", "Fechar o prédio") : place ? t("Back to Brazil", "Voltar pro Brasil") : t("Back to towns", "Voltar pras towns")}
              className={`flex w-9 shrink-0 items-center justify-center border-r-2 ${HUD_EDGE} ${HUD_SOFT} hover:text-cream`}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <p className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap px-3">
              {place ? (
                <>
                  <span className="h-2 w-2 shrink-0 border border-border-light" style={{ background: place.uf ? swatchOf(place.uf) : LIME }} aria-hidden />
                  <span className="truncate text-cream">{place.ibge !== null ? place.name : t("Island", "Ilha")}</span>
                  <span className={`shrink-0 ${HUD_SOFT}`}>· {fmt(place.devs.length)} {place.devs.length === 1 ? "dev" : "devs"}</span>
                </>
              ) : (
                <>
                  <span className="text-cream">{fmt(world.devs)} devs</span>
                  <span className={`truncate ${HUD_SOFT} max-sm:hidden`}>· {fmt(world.founded)} {t("cities", "cidades")}</span>
                </>
              )}
            </p>
            <span className="flex shrink-0 items-center gap-1.5 pr-3 text-cream">
              <span className="blink-dot inline-block h-1.5 w-1.5 shrink-0 bg-lime" aria-hidden />
              {fmt(here)} online
              {drivingNow > 0 && !inCar && (
                <button type="button" onClick={() => setDriversOpen((o) => !o)} className="underline decoration-lime/60 underline-offset-2 hover:text-lime">
                  · {fmt(drivingNow)} {t("driving", "dirigindo")}
                </button>
              )}
            </span>
            {/* The map's language: Portuguese or English, kept in a cookie. */}
            <span role="group" aria-label={t("Language", "Idioma")} className={`flex shrink-0 items-center border-l-2 ${HUD_EDGE} px-2 text-[9px] sm:text-[10px]`}>
              {(["pt", "en"] as const).map((l, i) => (
                <span key={l} className="flex items-center">
                  {i > 0 && <span className={`px-1 ${HUD_SOFT}`} aria-hidden>·</span>}
                  <button type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={lang === l ? "text-lime" : `${HUD_SOFT} hover:text-cream`}>
                    {l}
                  </button>
                </span>
              ))}
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
            onFound={(c: BrCity) => {
              posthog.capture("brasil_search", { picked: "unfounded", uf: c.uf });
              openPicker(null, c.name);
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
              key={picker.query ?? ""}
              signedIn={!!viewerLogin}
              viewerLogin={viewerLogin}
              forLogin={picker.forLogin}
              cities={layout.cities}
              current={home ? (home.city === null ? "island" : home.city) : null}
              pending={joining.pending}
              error={joining.error}
              initialQuery={picker.query}
              firstPick={!!home && !home.picked}
              onPick={(c) => {
                posthog.capture("brasil_city_picked", { city: c.ibge, founding: c.ibge !== null && !layout.cities.some((x) => x.ibge === c.ibge && x.devs.length > 0) });
                setAskCity(false);
                void pickCity(c);
              }}
              onSignIn={signIn}
              onClose={() => {
                backToVote.current = null;
                setPicker(null);
              }}
            />
          )}
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
      {!inCar && askCity && !picker && !state && !focused && !panel && (
        <div className="pointer-events-auto absolute bottom-[110px] left-1/2 z-20 flex w-[min(420px,calc(100vw-24px))] -translate-x-1/2 items-center gap-3 border-[3px] border-lime bg-bg/95 px-3 py-2 sm:bottom-[76px]">
          <p className="min-w-0 flex-1 text-[11px] text-cream">{t("Which city are you from?", "De qual cidade você é?")}</p>
          <button type="button" onClick={() => openPicker(null)} className="btn-press shrink-0 bg-lime px-2.5 py-1.5 text-[10px] text-bg">
            {t("Pick my city", "Escolher cidade")}
          </button>
          <button type="button" onClick={dismissAsk} aria-label={t("Not now", "Agora não")} className="shrink-0 text-[10px] text-muted hover:text-cream">
            ✕
          </button>
        </div>
      )}
      {!inCar && <BrasilMinimap scale={layout.scale} cities={layout.cities} island={layout.island} camera={cameraStore} cars={carSpots} track={DRIFT_TAG} />}
      {!inCar && (
        <span className="pointer-events-none fixed bottom-1 left-1.5 z-20 text-[9px] normal-case leading-none text-muted/60 max-sm:bottom-[calc(66px+env(safe-area-inset-bottom))] max-sm:max-w-[130px] max-sm:text-[8px] max-sm:leading-tight">
          {t("Map data: IBGE · Natural Earth", "Dados do mapa: IBGE · Natural Earth")}
        </span>
      )}

      {!inCar && !state && !focused && !panel && !picker && !askCity && !liveRace && (world.arrivals.length > 0 || (grewAt !== null && now - grewAt < 86_400_000)) && (
        <Arrivals
          arrivals={world.arrivals}
          grew={grewAt !== null && now - grewAt < 86_400_000 ? { scale: layout.scale, at: grewAt } : null}
          onBrazil={() => camera.current?.flyTo(null)}
          onPick={(login) => {
            const b = world.placed.get(login.toLowerCase());
            if (!b) return;
            posthog.capture("brasil_arrival_clicked");
            openBuilding(b);
          }}
        />
      )}

      {/* Over the bar: a race anyone can still join. */}
      {!inCar && !state && !focused && !panel && !picker && liveRace && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(108px+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 sm:bottom-[112px]">
          <LiveRace
            race={liveRace}
            offset={watchRace?.offset ?? 0}
            name={(k) => cityByKey(layout, k)?.name ?? "?"}
            onJoin={() => {
              const from = cityByKey(layout, liveRace.route?.from ?? "");
              posthog.capture("brasil_live_race_clicked", { racers: Object.keys(liveRace.racers).length });
              setJoinRace(liveRace.id);
              startDrive(from ? { x: from.hub[0] * LOT, z: from.hub[1] * LOT } : undefined);
            }}
          />
        </div>
      )}

      {/* The city of the day takes the live race's spot over the bar when no race is open. */}
      {!inCar && !state && !focused && !panel && !picker && !liveRace && heist?.view && heistStep?.startsWith("card") && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(108px+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 sm:bottom-[112px]">
          <HeistCard city={heist.view.city} side={heist.view.side} resident={heist.view.resident} onPick={() => setHeistStep(heist.view?.side === "cop" || heist.view?.resident ? "cop" : "robber")} />
        </div>
      )}
      {!inCar && heist?.result && <HeistResultTower result={heist.result} onClose={() => setHeistStep("card")} />}
      {heistStep && <HeistPreviewStrip step={heistStep} onStep={pickHeist} />}

      {/* The bar: a row of words on a desktop, a tab bar of icons on a phone; Drive raised in the middle. */}
      {!inCar && (
        <nav className={`pointer-events-auto absolute inset-x-0 bottom-0 grid ${election ? "grid-cols-5" : "grid-cols-4"} items-end gap-px border-t-2 border-border bg-border pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_0_rgba(0,0,0,0.25)] sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:flex sm:-translate-x-1/2 sm:items-end sm:border-t-0 sm:bg-transparent sm:pb-0 sm:shadow-[0_6px_0_rgba(0,0,0,0.35)]`}>
          <button type="button" onClick={() => openPanel("states")} className={bar}>
            <Trophy size={18} className="sm:hidden" aria-hidden />
            {t("States", "Estados")}
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
            <MapIcon size={18} className="sm:hidden" aria-hidden />
            {t("Brazil", "Brasil")}
          </button>
          {/* Drive is the bar's middle, lime and raised over it: the one thing to do here. */}
          <button
            type="button"
            disabled={launching || world.devs === 0}
            onClick={() => {
              posthog.capture("brasil_drive_button_clicked");
              startDrive();
            }}
            className="-mt-5 flex min-h-[80px] flex-col items-center justify-center gap-1.5 bg-lime text-[10px] text-bg shadow-[0_-6px_0_rgba(0,0,0,0.25)] transition-[filter] hover:brightness-110 active:translate-y-px disabled:opacity-40 sm:mt-0 sm:h-10 sm:min-h-0 sm:flex-row sm:gap-2 sm:px-6 sm:text-[11px] sm:shadow-none"
          >
            <Car size={24} className="sm:size-4" aria-hidden />
            {t("Drive", "Dirigir")}
          </button>
          {election && (
            <button type="button" onClick={() => openVote()} className={`${bar} relative`}>
              {election.phase === "voting" && <span className="absolute right-[30%] top-3 h-1.5 w-1.5 animate-pulse bg-red-500 sm:static sm:order-first" aria-hidden />}
              <Landmark size={18} className="sm:hidden" aria-hidden />
              {t("Vote", "Votar")}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              // On the map: to your building. Not yet: the way in.
              const mine = home && viewerLogin ? world.placed.get(viewerLogin.toLowerCase()) : undefined;
              if (mine) openBuilding(mine);
              else openPicker(null);
            }}
            className={bar}
          >
            {/* The building, like every tab's icon; your state's color as a corner on it. */}
            <span className="relative sm:hidden" aria-hidden>
              <Building2 size={18} />
              {yours && <span className="absolute -bottom-1 -right-1.5 h-2 w-2 border border-border-light" style={{ background: swatchOf(yours) }} />}
            </span>
            {yours && <span className="h-2.5 w-2.5 border border-border-light max-sm:hidden" style={{ background: swatchOf(yours) }} aria-hidden />}
            {home ? (
              <>
                <span className="sm:hidden">{t("Mine", "Meu")}</span>
                <span className="max-sm:hidden">{t("My building", "Meu prédio")}</span>
              </>
            ) : (
              <span className="text-lime">
                <span className="sm:hidden">{t("Put mine", "Pôr o meu")}</span>
                <span className="max-sm:hidden">{t("Put my building", "Pôr meu prédio")}</span>
              </span>
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
          join={!viewerLogin ? { label: t("Sign in", "Entrar"), short: t("Sign in", "Entrar"), signIn: true, onClick: signIn } : undefined}
          drivers={drivers}
          crown={crownView}
          map={driveMap}
          emoteLog={emoteLog}
          onVolume={changeVolume}
          onEmote={(e) => emoteApi.current?.send(e)}
          // Signed in, and no menu that answers Enter itself is open.
          onChat={viewerLogin && !games && !taste ? (text) => emoteApi.current?.say(text) : undefined}
          onStartCrown={() => crownApi.current?.start()}
          gameOn={racing || !!games}
          startNote={startNote}
          onGames={racing ? undefined : () => setGames({ step: "modes" })}
          onResume={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onCamera={toggleCamera}
          onMute={toggleMute}
          onExit={exitDrive}
          kit={heistInCar && heist?.view?.kit && heist.view.side ? { slots: heist.view.kit, side: heist.view.side } : null}
        >
          {heistInCar && heist?.view && (heistStep === "pick" ? <SideChoice city={heist.view.city} onPick={(side) => setHeistStep(side === "cop" ? "cop" : "robber")} /> : <HeistHud view={heist.view} />)}
          {games && (
            <GameMenu title={t(`Games · ${drivers.length + 1} driving here`, `Jogos · ${drivers.length + 1} dirigindo aqui`)} modes={gameModes} onPick={pickGame} onClose={closeGames}>
              {games.step === "race" ? (
                <RacePicker
                  slug={league.slug}
                  layout={layout}
                  telemetry={telemetry}
                  others={drivers.length}
                  initial={games.initial}
                  onStart={(route, how, solo) => startRace(route, how, solo)}
                  onBack={() => setGames(games.initial ? null : { step: "modes" })}
                />
              ) : undefined}
            </GameMenu>
          )}
          {/* After the menu, so an invite that comes in while it's open shows over it. */}
          <RacePanel layout={layout} view={rallyView} yourUf={yours} onJoin={() => rallyApi.current?.join()} onRematch={(route) => startRace(route, "rematch")} onAlone={(route) => startRace(route, "alone", true)} onResults={setRaceResults} />
        </DriveHud>
      )}

      {panel === "states" && (
        <BrasilRanking
          states={world.states}
          points={world.statePoints}
          yours={yours}
          races={{
            slug: league.slug,
            cityName: (key) => cityByKey(layout, key)?.name ?? "?",
            you: viewerLogin,
            onRace: () => {
              posthog.capture("brasil_race_board_drive");
              startDrive();
            },
          }}
          onPick={(s) => {
            posthog.capture("brasil_state_opened", { uf: s.uf, from: "ranking" });
            openState(s.uf);
          }}
          onClose={() => setPanel(null)}
        />
      )}

      {count && !inCar && !state && !focused && !panel && !picker && <ApuracaoWidget slug={league.slug} initial={count} myVote={electionNow?.viewer?.votedFor?.number ?? null} onVote={(n) => openVote(n)} />}

      {!inCar && !state && !city && !focused && !panel && !picker && !proj && (
        <ProjectsCard
          slug={league.slug}
          initial={projects}
          signedIn={!!viewerLogin}
          viewerLogin={viewerLogin}
          refreshKey={projectsKey}
          onOpen={(p) => openProject(p.slug, "card", p)}
          onShare={(blocked) => openShare(undefined, blocked)}
          onOpenSlug={(slug) => openProject(slug, "card_mine")}
          onOffer={() => {
            setPanel(null);
            setProj({ kind: "ad" });
          }}
          onSeeAll={() => openPanel("projects")}
          onSignIn={() => signInForProject(null)}
        />
      )}
      {proj?.kind === "project" && !inCar && (
        <ProjectSheet
          key={proj.slug}
          slug={league.slug}
          projectSlug={proj.slug}
          initial={proj.initial}
          from={proj.from}
          signedIn={!!viewerLogin}
          onSignIn={() => signInForProject(proj.slug)}
          onClose={closeProj}
          onVisitBuilding={(login) => {
            const b = world.placed.get(login.toLowerCase());
            if (b) openBuilding(b);
          }}
          onEdit={(p) => openShare(p)}
          onChanged={() => setProjectsKey((k) => k + 1)}
        />
      )}
      {proj?.kind === "share" && !inCar && (
        <ShareProjectSheet
          slug={league.slug}
          signedIn={!!viewerLogin}
          editing={proj.editing}
          blocked={proj.blocked}
          onSignIn={() => signInForProject(null)}
          onPutOnMap={() => openPicker(null)}
          onOpenProject={(slug) => openProject(slug, "share_blocked")}
          onClose={closeProj}
          onDone={() => setProjectsKey((k) => k + 1)}
        />
      )}
      {proj?.kind === "ad" && !inCar && <AdRequestSheet slug={league.slug} onClose={closeProj} />}

      {panel === "projects" && !inCar && (
        <ProjectsBoard
          slug={league.slug}
          ad={projects?.ad ?? null}
          viewerLogin={viewerLogin}
          view={projectsView}
          onView={setProjectsView}
          onOpen={(p) => {
            openProject(p.slug, `list_${projectsView.tab}`, p);
            setFromBoard(true);
          }}
          onShare={() => {
            openShare(undefined, projects?.me ? projects.me.blocked : undefined);
            setFromBoard(true);
          }}
          onOffer={() => {
            setPanel(null);
            setProj({ kind: "ad" });
            setFromBoard(true);
          }}
          onSignIn={() => {
            posthog.capture("brasil_signin_clicked", { from: "projects_list" });
            void signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/town/${league.slug}?projects=1`)}`);
          }}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === "election" && election && (
        <ElectionPanel
          key={vote.key}
          slug={league.slug}
          initial={electionNow ?? election}
          onVoted={setElectionNow}
          startNumber={vote.number}
          signedIn={!!viewerLogin}
          ufOf={(login) => {
            const r = world.ufOf.get(login.toLowerCase());
            return r ? r.uf : undefined;
          }}
          onSignIn={signInToVote}
          onPutOnMap={(n) => {
            backToVote.current = { number: n };
            openPicker(null);
          }}
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
          race={{ place: world.racePlace.get(state.uf) ?? 27, points: world.statePoints[state.uf] ?? 0 }}
          governor={world.offices.governors.get(state.uf) ?? null}
          topDevs={world.allCities
            .flatMap((c) => c.devs.filter((d) => d.dev.uf === state.uf).map((d) => ({ login: d.dev.login, points: officeWeek.totals[d.dev.login.toLowerCase()] ?? 0 })))
            .filter((d) => d.points > 0)
            .sort((a, b) => b.points - a.points || a.login.localeCompare(b.login))
            .slice(0, 3)}
          onClose={() => {
            setState(null);
            replaceUrl("");
          }}
        />
      )}
      {city && !inCar && !focused && (
        <CityCard
          key={city.key}
          city={city}
          byLogin={world.placed}
          townPath={`/town/${league.slug}`}
          mayor={world.offices.mayors.get(city.key)?.login ?? null}
          totals={officeWeek.totals}
          place={city.uf ? layout.cities.filter((x) => x.uf === city.uf && x.devs.length > 0).sort((a, b) => b.devs.length - a.devs.length).findIndex((x) => x.key === city.key) + 1 || null : null}
          now={now}
          onPickDev={(login) => {
            const b = world.placed.get(login.toLowerCase());
            if (b) openBuilding(b);
          }}
          onState={(uf) => {
            posthog.capture("brasil_state_opened", { uf, from: "city_card" });
            openState(uf);
          }}
          onDriveHere={() => startDrive()}
          onClose={() => {
            setCity(null);
            replaceUrl("");
          }}
        />
      )}
      {focused && !inCar && (
        <BuildingCard
          key={focused.loginLower}
          building={focused}
          viewerLogin={viewerLogin}
          lean
          section={
            <>
            <PlaceRow
              login={focused.loginLower}
              city={world.cityOfLogin.get(focused.loginLower) ?? null}
              offices={world.offices.byLogin.get(focused.loginLower) ?? []}
              foundedState={world.foundedState.get(focused.loginLower) ?? null}
              onCity={openCity}
              onState={openState}
              onMove={viewerLogin?.toLowerCase() === focused.loginLower ? () => openPicker(null) : undefined}
            />
            {(projectWins[focused.loginLower] || viewerLogin?.toLowerCase() === focused.loginLower) && (
              <div className="mx-4 mb-3 flex flex-col gap-2">
                {projectWins[focused.loginLower] && <ProjectWin win={projectWins[focused.loginLower]} onOpen={(slug) => openProject(slug, "building")} />}
                {viewerLogin?.toLowerCase() === focused.loginLower && <MyProjects slug={league.slug} refreshKey={projectsKey} onOpen={(slug) => openProject(slug, "my_building")} onShare={(blocked) => openShare(undefined, blocked)} />}
              </div>
            )}
            </>
          }
          stats={[
            { label: t("Pts this week", "Pts na semana"), value: fmt(officeWeek.live.totals[focused.loginLower] ?? 0) },
            { label: t("Rank", "Rank"), value: `#${fmt(focused.rank ?? 0)}` },
            { label: t("Contribs", "Contribs"), value: fmt(focused.contributions ?? 0) },
            { label: t("Stars", "Estrelas"), value: fmt(focused.total_stars ?? 0) },
            { label: "+1s", value: fmt(focused.kudos_count ?? 0) },
            { label: t("Visits", "Visitas"), value: fmt(focused.visit_count ?? 0) },
          ]}
          primary={
            <>
              <InviteButton login={focused.loginLower} city={world.cityOfLogin.get(focused.loginLower) ?? null} founder={!!world.ufOf.get(focused.loginLower)?.founder} townPath={`/town/${league.slug}`} onPickCity={() => openPicker(null)} />
              <GroupLink />
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
  const t = useT();
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
    const timer = setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(timer);
  }, [shown]);
  if (!shown) return null;
  const c = shown.city;
  return (
    <div key={shown.at} className="area-title pointer-events-none fixed inset-x-0 top-[22%] z-30 flex flex-col items-center gap-1.5 text-center font-pixel uppercase">
      {c.uf && stateOf(c.uf).name !== c.name && <span className="text-[10px] tracking-[0.3em] text-muted">{stateOf(c.uf).name}</span>}
      <span className="text-3xl text-cream [text-shadow:0_3px_0_rgba(0,0,0,0.6)] sm:text-5xl">{c.ibge !== null ? c.name : t("The island", "A ilha")}</span>
      <span className="text-[10px] text-lime">{t(`${fmt(c.devs.length)} devs live here`, `${fmt(c.devs.length)} devs moram aqui`)}</span>
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
  const t = useT();
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
    const name = best.ibge !== null ? best.name : t("the island", "a ilha");
    return bestD < (best.radius + 12) * LOT ? name : t(`near ${name}`, `perto de ${name}`);
  };
  return (
    <div className="pointer-events-auto border-[3px] border-b-0 border-border bg-bg/95 px-3 py-2 font-pixel uppercase text-cream backdrop-blur-sm">
      <div className="mb-1.5 flex items-baseline justify-between text-[9px] text-muted">
        <span>{t("Driving now", "Dirigindo agora")}</span>
        <button type="button" onClick={onClose} className="hover:text-cream">
          ESC
        </button>
      </div>
      {drivers.length === 0 ? (
        <p className="py-1 text-[10px] normal-case text-muted">{t("Finding them…", "Procurando…")}</p>
      ) : (
        <ul className="flex flex-col">
          {drivers.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-1 text-[10px]">
              <span aria-hidden>🚗</span>
              <span className="min-w-0 flex-1 truncate normal-case">
                @{d.name} <span className="text-muted">· {where(d.x, d.z)}</span>
              </span>
              <button type="button" onClick={() => onLook(d)} className="shrink-0 border border-border px-2 py-0.5 text-[9px] text-cream hover:border-lime hover:text-lime">
                {t("Look", "Ver")}
              </button>
              <button type="button" onClick={() => onJoin(d)} className="shrink-0 bg-lime px-2 py-0.5 text-[9px] text-bg">
                {t("Drive here", "Dirigir aqui")}
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
 * Who just arrived, one at a time over the bar: "@login just arrived · Campinas · 3m",
 * a tap away from their building. Whoever commented on the reel opens the map
 * and sees their name go by. When Brazil grew in the last day to make room
 * for its cities, that goes by first.
 */
function Arrivals({ arrivals, grew, onPick, onBrazil }: { arrivals: { login: string; where: string; at: number }[]; grew: { scale: number; at: number } | null; onPick: (login: string) => void; onBrazil: () => void }) {
  const tr = useT();
  const [i, setI] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const n = Math.min(arrivals.length, 12) + (grew ? 1 : 0);
  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => {
      setI((k) => (k + 1) % n);
      setNow(Date.now());
    }, 4000);
    return () => clearInterval(t);
  }, [n]);
  const k = i % n;
  if (grew && k === 0)
    return (
      <button
        key="grew"
        type="button"
        onClick={onBrazil}
        className="pointer-events-auto absolute bottom-[calc(96px+env(safe-area-inset-bottom))] left-1/2 z-20 flex max-w-[calc(100vw-24px)] -translate-x-1/2 animate-[fade-in_0.4s_ease-out] items-center gap-2 bg-bg/90 px-3 py-1.5 font-pixel text-[10px] uppercase text-muted hover:text-cream sm:bottom-[72px]"
      >
        <span className="blink-dot h-1.5 w-1.5 shrink-0 bg-lime" aria-hidden />
        <span className="shrink-0 text-cream">{tr("Brazil grew", "O Brasil cresceu")}</span>
        <span className="shrink-0 text-lime">{grew.scale}x</span>
        <span className="shrink-0">{ago(grew.at, now)}</span>
      </button>
    );
  const a = arrivals[(k - (grew ? 1 : 0)) % arrivals.length];
  return (
    <button
      key={a.login}
      type="button"
      onClick={() => onPick(a.login)}
      className="pointer-events-auto absolute bottom-[calc(96px+env(safe-area-inset-bottom))] left-1/2 z-20 flex max-w-[calc(100vw-24px)] -translate-x-1/2 animate-[fade-in_0.4s_ease-out] items-center gap-2 bg-bg/90 px-3 py-1.5 font-pixel text-[10px] uppercase text-muted hover:text-cream sm:bottom-[72px]"
    >
      <span className="blink-dot h-1.5 w-1.5 shrink-0 bg-lime" aria-hidden />
      <span className="truncate normal-case text-cream">@{a.login}</span>
      <span className="shrink-0">{tr("just arrived", "acabou de chegar")}</span>
      <span className="min-w-0 truncate text-lime">{a.where === "island" ? tr("island", "ilha") : a.where}</span>
      <span className="shrink-0">{ago(a.at, now)}</span>
    </button>
  );
}

/** The one filled button on your own building: invite people to your city (or pick one, on the island). */
function InviteButton({ login, city, founder, townPath, onPickCity }: { login: string; city: CityLayout | null; founder: boolean; townPath: string; onPickCity: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  if (!city || city.ibge === null)
    return (
      <button type="button" onClick={onPickCity} className="btn-press w-full bg-lime py-2 text-[10px] text-bg">
        {t("Pick your city", "Escolha sua cidade")}
      </button>
    );
  const invite = () => {
    // A founder shares their city (its card names them); anyone else, their own building.
    const url = founder && city.slug ? `${window.location.origin}${townPath}?cidade=${city.slug}` : `${window.location.origin}${townPath}?at=${login}`;
    // Shared on WhatsApp and stories, by and to Brazilians: Portuguese, one line, the link does the rest.
    const text = founder ? `Fundei ${city.name} no mapa dos devs 🇧🇷 Bora morar aqui: ${url}` : `Tô em ${city.name} no mapa dos devs 🇧🇷 ${url}`;
    posthog.capture("brasil_invite_copied", { uf: city.uf, city: city.ibge, from: "building" });
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return (
    <button type="button" onClick={invite} className="btn-press w-full bg-lime py-2 text-[10px] text-bg">
      {copied ? t("Invite copied", "Convite copiado") : t(`Invite to ${city.name}`, `Convidar pra ${city.name}`)}
    </button>
  );
}

/** The map's WhatsApp group, under the invite on your own building. */
const BRASIL_GROUP_URL = "https://chat.whatsapp.com/JCeLSyoG6P6JjCGNOIsvCJ";

function GroupLink() {
  const t = useT();
  return (
    <a
      href={BRASIL_GROUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => posthog.capture("brasil_group_clicked", { from: "building" })}
      className="btn-press flex w-full items-center justify-center gap-2 border-2 border-border py-2 text-[10px] text-cream transition-colors hover:border-lime/60"
    >
      <PixelSocialIcon name="whatsapp" size={12} />
      {t("Join the WhatsApp group", "Entrar no grupo do WhatsApp")}
    </a>
  );
}

/** Where a resident lives, said once: their city (a click flies there), its state, Move on yours, and what they are there as seals. */
function PlaceRow({ login, city, offices, foundedState = null, onCity, onState, onMove }: { login: string; city: CityLayout | null; offices: Office[]; foundedState?: UF | null; onCity: (c: CityLayout) => void; onState: (uf: UF) => void; onMove?: () => void }) {
  const { lang, t } = useLang();
  const island = !city || city.ibge === null;
  const at = city ? city.devs.findIndex((d) => d.dev.login.toLowerCase() === login) : -1;
  const founder = !island && at >= 0 && city!.devs[at].founder;
  // The city is on the line above: a mayor's seal needs no name.
  // The state they founded (forever, wherever they live now), then the city they founded.
  const seals = [...(foundedState ? [t(`Founder ${foundedState}`, `Fundador ${foundedState}`)] : []), ...(founder ? [t("Founder", "Fundador")] : []), ...offices.map((o) => (o.kind === "mayor" ? t("Mayor", "Prefeito") : officeLabel(o, lang)))];
  return (
    <div className="mx-4 mb-3 border-2 border-border px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        {island ? (
          <span className="text-[11px] text-cream">{t("The island", "A ilha")}</span>
        ) : (
          <button type="button" onClick={() => onCity(city!)} className="min-w-0 truncate text-left text-[11px] normal-case text-cream hover:text-lime">
            {city!.name}
          </button>
        )}
        <span className="flex shrink-0 items-baseline gap-2 text-[9px] text-muted">
          {!island && city!.uf && (
            <button type="button" onClick={() => onState(city!.uf!)} className="hover:text-lime">
              {city!.uf}
            </button>
          )}
          {onMove && (
            <button type="button" onClick={onMove} className="text-cream underline decoration-dotted underline-offset-2 hover:text-lime">
              {island ? t("Pick a city", "Escolher cidade") : t("Move", "Mudar")}
            </button>
          )}
        </span>
      </div>
      {(seals.length > 0 || (!island && at >= 0)) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {seals.map((seal) => (
            <span key={seal} className="bg-lime px-1.5 py-0.5 text-[8px] text-bg">
              {seal}
            </span>
          ))}
          {!founder && !island && at >= 0 && <span className="border border-border px-1.5 py-0.5 text-[8px] text-muted">Dev #{fmt(at + 1)}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * The map's Live card (picked in the phone prototype): a race still taking
 * racers, its route and who started it, and one lime button that starts
 * your car and joins it. Its clock runs out with the invite.
 */
function LiveRace({ race, offset, name, onJoin }: { race: RallyState; offset: number; name: (key: string) => string; onJoin: () => void }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.ceil((race.inviteEnds - now - offset) / 1000));
  if (!race.route || left <= 0) return null;
  const by = race.by ? race.racers[race.by]?.name : null;
  const n = Object.keys(race.racers).length;
  return (
    <div className="pointer-events-auto flex w-[min(380px,100%)] flex-col gap-1">
      <Band className="flex-col items-start gap-1 px-4 py-3" style={{ fontSize: T.small }}>
        <span className="flex items-center gap-2 text-lime">
          <span className="h-1.5 w-1.5 animate-pulse bg-red-500" aria-hidden /> {t("Live · race", "Ao vivo · corrida")}
        </span>
        <span className="normal-case text-cream" style={{ fontSize: T.body }}>
          {name(race.route.from)} → {name(race.route.to)}
        </span>
        <span className="normal-case text-muted">
          {by && !by.startsWith("guest-") ? `@${by}` : t("Someone", "Alguém")} · {t(`${n} in · starts in ${left}s`, `${n} dentro · larga em ${left}s`)}
        </span>
      </Band>
      <button type="button" onClick={onJoin} className="flex min-h-11 items-center justify-between bg-lime px-4 text-bg shadow-[0_6px_0_rgba(0,0,0,0.35)] transition-[filter] hover:brightness-110 active:translate-y-px" style={{ fontSize: T.body }}>
        <span className="flex items-center gap-2">
          <Car size={16} aria-hidden /> {t("Drive and join", "Dirigir e entrar")}
        </span>
        <span className="tabular-nums">{left}s</span>
      </button>
    </div>
  );
}
