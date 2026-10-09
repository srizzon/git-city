"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import PixelSpinner from "@/components/leagues/PixelSpinner";
import { useTownVisit } from "@/components/towns/useTownVisit";
import { useActiveTime } from "@/components/towns/useActiveTime";
import { isDesktop, useTouch } from "@/components/towns/useDesktop";
import type { TownBadges } from "@/lib/towns/milestones";
import type { JoinAction } from "@/lib/towns/joining";
import {
  generateCityLayout,
  type CityBuilding,
  type DeveloperRecord,
  type LayoutNorms,
} from "@/lib/github";
import type { LeaguePageData, TownRankingRow } from "@/lib/leagues/queries";
import type { LeagueCity } from "@/lib/league-city/service";
import { leagueBuildings, scaleTownHeights } from "@/lib/league-city/buildings";
import LeagueTitle from "@/components/league/hud/LeagueTitle";
import RaceWidget from "@/components/league/hud/RaceWidget";
import ActionBar from "@/components/league/hud/ActionBar";
import HallOfFamePanel from "@/components/league/hud/HallOfFamePanel";
import StandingsPanel from "@/components/league/hud/StandingsPanel";
import InvitePanel from "@/components/league/hud/InvitePanel";
import JoinPanel, { signInToJoin } from "@/components/league/hud/JoinPanel";
import BuildingCard from "@/components/league/hud/BuildingCard";
import FindPanel from "@/components/league/hud/FindPanel";
import EditorTopBar from "@/components/league/hud/editor/EditorTopBar";
import Hotbar, { CameraHints, toolForSlot } from "@/components/league/hud/editor/Hotbar";
import EditorToasts from "@/components/league/hud/editor/EditorToasts";
import EditorTips from "@/components/league/hud/editor/EditorTips";
import EditorOverlay from "@/components/league/editor/EditorOverlay";
import type { EditCameraApi, Pickable } from "@/components/league/editor/EditCamera";
import { useEditorController } from "@/components/league/editor/useEditorController";
import { useCityAutosave } from "@/components/league/editor/useCityAutosave";
import type { CoverApi, SceneMode } from "@/components/league/LeagueScene";
import { createTouch, type TouchDrive } from "@/lib/league-city/drive/touch";
import { createTelemetry, type DriveCameraMode, type DriveRoute, type DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import type { DriverInfo } from "@/lib/league-city/drive/net";
import type { CrownApi, CrownView } from "@/components/league/drive/CrownMode";
import type { EmoteApi } from "@/components/league/drive/EmoteBubbles";
import { createEmoteLog } from "@/lib/league-city/drive/emote-log";
import { loadVolume, saveVolume } from "@/lib/league-city/drive/volume";
import { gateDueMs, stallDone, type GateReason } from "@/lib/league-city/drive/guest-gate";
import GuestGate from "@/components/league/hud/drive/GuestGate";
import ArrivalChoice from "@/components/league/hud/drive/ArrivalChoice";
import { signInWithGitHub } from "@/lib/sign-in";
import { createBrowserSupabase } from "@/lib/supabase";
import { createEditorStore } from "@/lib/league-city/editor/store";
import { keyToAction } from "@/lib/league-city/editor/shortcuts";
import { MAX_H, START_H } from "@/lib/league-city/grid";
import { isAir } from "@/lib/league-city/catalog";
import { SKY_ACCENTS, introSeenKey } from "@/lib/league-city/identity";
import { carColor } from "@/lib/league-city/drive/net";
import type { CityIdentity, ObjectProps, SignSide } from "@/lib/league-city/types";
import { HillSignPanel, PlazaPanel, SkyPanel } from "@/components/league/hud/editor/IdentityPanel";
import ReportPanel from "@/components/league/hud/ReportPanel";
import { MobileActionBar, MobileTownHeader } from "@/components/league/hud/MobileTownHud";
import IntroOverlay, { OUTRO_MS } from "@/components/league/hud/IntroOverlay";
import { carIntro, type IntroPose } from "@/lib/league-city/intro";
import { townDisplayName } from "@/lib/towns/names";
import { ordinal, type TownPlace } from "@/lib/towns/place";
import { formatLap } from "@/lib/league-city/race/laps";
import TransitScreen from "@/components/league/hud/TransitScreen";
import TownQuest from "@/components/league/hud/TownQuest";
import { freshQuest, nextStep, parseQuest, questKey, questSteps, type QuestState, type QuestStep } from "@/lib/towns/quest";
import { chime } from "@/lib/sfx/chime";
import { useDriveWatch } from "@/components/league/drive/useDriveWatch";
import { RIVALRY } from "@/lib/towns/rivalry";
import MapNavControls from "@/components/MapNavControls";
import RadarMap from "@/components/RadarMap";
import { createCameraStore, mapNav, type MapCameraStore } from "@/lib/map-nav";
import { smashStoreFor, type DamageEntry } from "@/lib/league-city/smash";
import { applyRoomDamage } from "@/lib/league-city/smash-net";
import { useTownBots } from "@/components/league/drive/useTownBots";
import {
  HOTBAR,
  initEditor,
  objectAtSpot,
  ringContents,
  type Notice,
} from "@/lib/league-city/editor/state";

const LeagueScene = dynamic(() => import("@/components/league/LeagueScene"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center gap-3 bg-bg font-pixel text-[10px] uppercase text-muted">
      <PixelSpinner />
      Building the city
    </div>
  ),
});

// Drive mode's HUD loads with the drive world, only when someone drives.
const DriveHud = dynamic(() => import("@/components/league/hud/drive/DriveHud"), { ssr: false });

const MUTE_KEY = "gc:drive-muted";
/** Drive here: this close to the building's center (city units, a lot and a bit) and you're there. */
const ROUTE_REACH = 56;
const LIME = "#c8e64a";
/** The minimap, compass and zoom buttons: ready, off until towns grow past one screen. */
const SHOW_MAP_NAV = false;

/** The main city's minimap for the town: its buildings, the camera's view, click to fly there. */
function TownRadar({ buildings, camera }: { buildings: CityBuilding[]; camera: MapCameraStore }) {
  const cam = useSyncExternalStore(camera.subscribe, camera.get, camera.get);
  return (
    <RadarMap
      buildings={buildings}
      visible
      flyMode={false}
      playerX={0}
      playerZ={0}
      cameraX={cam.x}
      cameraZ={cam.z}
      cameraTargetX={cam.tx}
      cameraTargetZ={cam.tz}
      onWorldClick={(x, z) => mapNav.send({ type: "flyTo", x, z })}
    />
  );
}

/** While driving, check for city changes (an admin's Done) this often. */
const DRIVE_POLL_MS = 5000;

type PanelId = "hall" | "standings" | "invite" | "join" | "report" | "find" | null;

export default function LeagueClient({
  data,
  city,
  cityDevs,
  cityNorms,
  invite,
  inviteToken,
  refLogin,
  startEditing = false,
  startDriving = false,
  spawnAt = null,
  startJoin = false,
  startQuest = false,
  joinAction,
  pendingRequests,
  groupLink,
  badges,
  place = null,
  ranking = [],
  raceRecord = null,
  coverDue = false,
}: {
  data: LeaguePageData;
  /** A member's page takes the town's automatic Discover cover now. */
  coverDue?: boolean;
  /** The race track's record, for the race gate and the Race button. */
  raceRecord?: { login: string; best_ms: number } | null;
  city: LeagueCity;
  cityDevs: Record<string, unknown>[];
  cityNorms: LayoutNorms;
  /** An invited member's login from ?invite=, checked on the server. */
  invite: string | null;
  /** ?t= when it matches the league's invite token. */
  inviteToken: string | null;
  refLogin: string | null;
  startEditing?: boolean;
  /** ?drive=1 (Surprise me, Discover's Drive): straight into the car on desktop. */
  startDriving?: boolean;
  /** ?at=<login> with ?drive=1 (the knocked-down email's Hit back): the car starts at their building. */
  spawnAt?: string | null;
  /** ?join=1: back from sign-in, reopen the join panel. */
  startJoin?: boolean;
  /** ?new=1 from /towns/new: the admin's first steps start. */
  startQuest?: boolean;
  joinAction: JoinAction;
  /** Admin: open join requests. */
  pendingRequests: number;
  /** Members: the link for a group chat. */
  groupLink: string | null;
  badges: TownBadges;
  /** This week's place among towns (null for hidden towns or a failed read). */
  place?: TownPlace | null;
  /** This week's ranked towns, best first (empty for hidden towns or a failed read). */
  ranking?: TownRankingRow[];
}) {
  const { league, members, viewer } = data;
  const isMember = viewer?.status === "active";
  // Where the explore camera looks, for the compass (set by LeagueScene's camera).
  const [navCamera] = useState(() => createCameraStore());
  const showJoinCta = !isMember && (!!invite || !!inviteToken || viewer?.status === "invited");
  const joinKind = joinAction === "join" || joinAction === "ask" || joinAction === "pending" ? joinAction : null;
  const [panel, setPanel] = useState<PanelId>(showJoinCta || (startJoin && joinKind) ? "join" : null);
  const [focused, setFocused] = useState<CityBuilding | null>(null);
  // The camera looks at a building without opening its card (a new invitee's).
  const [peek, setPeek] = useState<string | null>(null);
  const router = useRouter();

  // ─── Race track ────────────────────────────────────────────
  // The gate on the approach road (click it, or drive out through it) and the
  // Race button take you to the town's track; a screen covers the load.
  const [goingRace, setGoingRace] = useState(false);
  const goRace = useCallback(() => {
    setGoingRace(true);
    router.push(`/town/${league.slug}/race`);
  }, [router, league.slug]);
  const isAdmin = !!viewer?.is_admin;

  // ─── Editor ────────────────────────────────────────────────
  const [mode, setMode] = useState<SceneMode>(startEditing && isAdmin ? "edit" : "view");
  const editing = mode === "edit" || mode === "preview";
  const driving = mode === "drive";
  // The town intro (below). Where you can drive (desktop) it is the drive's
  // opening shot, as in Forza Horizon's prologue: drive mode starts with it,
  // so the car loads while it plays, the car you watch is the one you get, and
  // you get it still rolling when the bars pull back (skip lands on that
  // moment). Until then it has the camera and the controls (cinematic).
  const [intro, setIntro] = useState<{ n: number; color: string; drive: boolean; skip: number } | null>(null);
  const introPose = useRef<IntroPose | null>(null);
  const [cinematic, setCinematic] = useState(false);
  useTownVisit(league.slug, !!viewer && viewer.status !== "active" && viewer.status !== "invited", driving);
  // Time in the car, for the Towns and Partners dashboards (members and guests too).
  useActiveTime("town_drive_ended", { town_slug: league.slug }, driving);
  const [store] = useState(() => createEditorStore(initEditor(city, !!city.identity.logoUrl)));
  // Identity from the server, with the hill sign side applied optimistically.
  // The override holds until the server's value changes (a refresh brings the truth).
  const [signOverride, setSignOverride] = useState<{ side: SignSide | null; base: SignSide | null } | null>(null);
  const identity: CityIdentity = useMemo(
    () =>
      signOverride && signOverride.base === city.identity.signSide ? { ...city.identity, signSide: signOverride.side } : city.identity,
    [city.identity, signOverride],
  );
  useEffect(() => store.dispatch({ type: "setHasLogo", hasLogo: !!city.identity.logoUrl }), [city.identity.logoUrl, store]);
  const cameraApi = useRef<EditCameraApi | null>(null);
  const coverApi = useRef<CoverApi | null>(null);
  const pickables = useRef<Pickable[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [viewNotice, setViewNotice] = useState<Notice | null>(null);

  // Building sizes come from the main city's formulas; positions from the lots.
  const byDevId = useMemo(() => {
    const layout = generateCityLayout(
      cityDevs as unknown as DeveloperRecord[],
      undefined,
      cityNorms,
    );
    const byLogin = new Map(layout.buildings.map((b) => [b.loginLower, b]));
    const map = new Map<number, CityBuilding>();
    for (const d of cityDevs as unknown as DeveloperRecord[]) {
      const b = byLogin.get(d.github_login.toLowerCase());
      if (b) map.set(d.id, b);
    }
    return scaleTownHeights(map);
  }, [cityDevs, cityNorms]);

  const togglePreview = useCallback(
    () => setMode((m) => (m === "edit" ? "preview" : m === "preview" ? "edit" : m)),
    [],
  );
  const editor = useEditorController({
    store,
    active: mode === "edit",
    buildingByDev: byDevId,
    cameraApi,
    onPreview: togglePreview,
  });
  const es = editor.state;

  const onForbidden = useCallback(() => {
    setMode("view");
    window.history.replaceState(null, "", `/town/${league.slug}`);
    setViewNotice({
      kind: "error",
      message: "You're no longer the admin, so the editor closed.",
      seq: Date.now(),
    });
    router.refresh();
  }, [league.slug, router]);
  const autosave = useCityAutosave(league.slug, store, { enabled: editing, onForbidden });

  // In preview the editor's keys are off; P (and Esc) still bring you back.
  useEffect(() => {
    if (mode !== "preview") return;
    const onKey = (e: KeyboardEvent) => {
      const k = keyToAction(e);
      if (k?.type === "preview" || k?.type === "cancel") {
        e.preventDefault();
        setMode("edit");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const enterEdit = () => {
    setFocused(null);
    setPanel(null);
    if (city.version > store.getState().version) store.dispatch({ type: "resync", city });
    setMode("edit");
    window.history.replaceState(null, "", `/town/${league.slug}?edit=1`);
  };
  const done = async () => {
    setLeaving(true);
    await autosave.drain();
    setLeaving(false);
    setMode("view");
    window.history.replaceState(null, "", `/town/${league.slug}`);
    router.refresh();
  };

  // A resync brought a building we have no data for (someone was invited
  // mid-edit): reload the page data so it can be drawn.
  const missing = useMemo(
    () =>
      [...es.objects.values()].some(
        (o) => o.kind === "building" && o.developer_id !== null && !byDevId.has(o.developer_id),
      ),
    [es.objects, byDevId],
  );
  const refreshedFor = useRef(0);
  useEffect(() => {
    if ((!editing && !driving) || !missing || refreshedFor.current === es.version) return;
    refreshedFor.current = es.version;
    router.refresh();
  }, [editing, driving, missing, es.version, router]);

  // While carried (and the cursor is on the city), the object only shows as
  // the ghost under the cursor.
  // The city on screen always comes from the editor store, so Done shows the
  // edits right away; fresher server data (router.refresh) syncs in below.
  const carrying = mode === "edit" && es.held && editor.hover ? es.held : null;
  const replacing =
    mode === "edit" && editor.ghost?.fit.ok ? (editor.ghost.fit.replaces?.id ?? null) : null;
  const sceneObjects = useMemo(
    () => [...es.objects.values()].filter((o) => o.id !== carrying && o.id !== replacing),
    [es.objects, carrying, replacing],
  );

  const shrinkNote = useMemo(() => {
    if (!editing) return "";
    const ring = ringContents(es);
    if (ring.blocked) return "Move the buildings off the edge first";
    return ring.removes.length > 0
      ? `Remove the edge lots and the ${ring.removes.length} item${ring.removes.length === 1 ? "" : "s"} on them`
      : "Remove a column each side and two rows north";
  }, [editing, es]);

  // Server data changed (refresh after Done, an invite): take it if it's not older.
  const lastCity = useRef(city);
  useEffect(() => {
    if (lastCity.current === city) return;
    lastCity.current = city;
    const s = store.getState();
    if (city.version >= s.version && s.pending.length === 0 && !s.inflight)
      store.dispatch({ type: "resync", city });
  }, [city, store]);
  const buildings = useMemo(() => leagueBuildings(sceneObjects, byDevId), [sceneObjects, byDevId]);
  // Anyone signed in drives through the buildings (not their own) and knocks
  // their floors out (lib/league-city/smash). Everyone sees the damage.
  const smashStore = useMemo(() => smashStoreFor(buildings), [buildings]);
  // The broken part's outline: the rivalry side's color, else the town's sky accent.
  const smashColor = RIVALRY.find((r) => r.slug === league.slug)?.color ?? (SKY_ACCENTS[identity.sky] ?? SKY_ACCENTS[1]).accent;
  const smashTown = useMemo(() => ({ store: smashStore, color: smashColor }), [smashStore, smashColor]);
  // The saved damage, once per store (the drive room sends changes from then on).
  useEffect(() => {
    let live = true;
    fetch(`/api/towns/${league.slug}/smash`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { damage?: DamageEntry[] } | null) => {
        if (live && body?.damage) smashStore.load(body.damage, Date.now());
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [smashStore, league.slug]);
  // Where each prop's body is, for picking it on screen in the editor.
  useEffect(() => {
    const mid: Partial<Record<string, number>> = {
      lamp: 9, bench: 1.5, fountain: 4, ramp: 3, ramp_big: 5, boost_pad: 0.5, speed_bump: 0.5, cone: 1.2, crates: 5, tire_wall: 2.5,
      portal: 32, billboard: 19, flag: 24,
    };
    // Planes and blimps are picked where they fly (a plane circles; its center marks it).
    pickables.current = [...es.objects.values()].flatMap((o) =>
      o.px !== null && o.pz !== null && o.item_type
        ? [{ id: o.id, x: o.px, y: isAir(o.item_type) ? Number(o.props?.alt ?? 160) : (mid[o.item_type] ?? 16), z: o.pz }]
        : [],
    );
  }, [es.objects]);
  // ─── Drive ─────────────────────────────────────────────────
  const viewerDevId = useMemo(
    () => (viewer ? (members.find((m) => m.login.toLowerCase() === viewer.login.toLowerCase())?.developer_id ?? null) : null),
    [viewer, members],
  );
  const spawnDevId = useMemo(
    () => (spawnAt ? (members.find((m) => m.login.toLowerCase() === spawnAt)?.developer_id ?? null) : null),
    [spawnAt, members],
  );
  // Mutated by the car every frame, read by the HUD; a fresh one per drive.
  const [telemetry, setTelemetry] = useState<DriveTelemetry>(createTelemetry);
  const [driveReady, setDriveReady] = useState(false);
  const [driveCamera, setDriveCamera] = useState<DriveCameraMode>("chase");
  const [paused, setPaused] = useState(false);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const crownApi = useRef<CrownApi | null>(null);
  const [crownView, setCrownView] = useState<CrownView | null>(null);
  // Your name in the drive room: your login, or a guest name for this visit.
  const [guest] = useState(() => `guest-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`);
  const driverName = viewer?.login ?? guest;
  // Guests get pulled over now and then (lib drive/guest-gate): the car runs out of gas, rolls to a stop,
  // and the terminal holds it until they sign in or drive on.
  const [gate, setGate] = useState<{ reason: GateReason; stops: number; drivenMs: number; stallAt: number; open: boolean } | null>(null);
  const guestDriven = useRef(0);
  const guestStops = useRef(0);
  const gateClosedAt = useRef(0);
  const [muted, setMuted] = useState(false);
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
  const [volume, setVolume] = useState(1);
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
  const emoteApi = useRef<EmoteApi | null>(null);
  // Outside React state: a reaction must not re-render the town (lib drive/emote-log).
  const [emoteLog] = useState(createEmoteLog);
  const toggleCamera = useCallback(() => setDriveCamera((c) => (c === "chase" ? "top" : "chase")), []);
  // The drive started from the intro: its HUD teaches the controls and comes in on your first move.
  const [firstDrive, setFirstDrive] = useState(false);
  // Newcomers: the intro's handoff stops on a choice (ArrivalChoice), put your building here or just drive.
  const offerJoin = !isMember && (joinAction === "join" || joinAction === "ask" || joinAction === "verify");
  const joinLabel = joinAction === "ask" ? "Ask to move in" : joinAction === "verify" ? "Work here? Move in" : "Add your building";
  const joinDetail =
    joinAction === "verify"
      ? "Show you're in the org on GitHub and your building moves in."
      : joinAction === "ask"
        ? `${viewer ? "Ask" : "Sign in with GitHub and ask"} the admin to let your building in.`
        : `${viewer ? "Move" : "Sign in with GitHub and move"} into the skyline. Race with the town every week.`;
  const [arriving, setArriving] = useState(false);
  // Phone controls (lib drive/touch): on screen on touch devices, read by the car.
  const touchRef = useRef<TouchDrive>(createTouch());
  const touchUi = useTouch();
  const enterDrive = useCallback((route: DriveRoute | null = null) => {
    setFocused(null);
    setPanel(null);
    setFirstDrive(false);
    setArriving(false);
    setDriveReady(false);
    setTelemetry(createTelemetry(route));
    setPaused(false);
    setGate(null);
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
      setVolume(loadVolume());
    } catch {
      // storage blocked: sound stays on
    }
    setMode("drive");
  }, []);
  const autoDrove = useRef(false);
  useEffect(() => {
    if (!startDriving || autoDrove.current) return;
    autoDrove.current = true;
    window.history.replaceState(null, "", `/town/${league.slug}`);
    // After the first paint, from a callback: the scene mounts in view mode first.
    window.setTimeout(() => enterDrive(), 0);
  }, [startDriving, league.slug, enterDrive]);
  // Drive here (the building card): the car starts as usual, an arrow over it
  // points at the building, and it's marked on the minimap until you get there.
  const driveTo = useCallback(
    (b: CityBuilding) => enterDrive({ login: b.loginLower, x: b.position[0], z: b.position[2], reach: ROUTE_REACH }),
    [enterDrive],
  );
  const exitDrive = useCallback(() => {
    setMode((m) => (m === "drive" ? "view" : m));
    setFirstDrive(false);
    setArriving(false);
    setDrivers([]);
    setCrownView(null);
    emoteLog.clear();
  }, [emoteLog]);
  const onDriveReady = useCallback(() => setDriveReady(true), []);
  const onDriveFail = useCallback(() => {
    setMode((m) => (m === "drive" ? "view" : m));
    // Mid-intro: the orbit flies home and the city's HUD comes back.
    setIntro(null);
    setCinematic(false);
    setViewNotice({ kind: "error", message: "Couldn't start the car.", seq: Date.now() });
  }, []);

  // Esc pauses; Esc again on the pause menu leaves the car.
  useEffect(() => {
    if (!driving || cinematic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (focused) return; // the building card closes itself
      if (gate || arriving) return; // the gate and the arrival choice answer Esc themselves
      // A held Esc (or a double tap) that just closed the gate doesn't go on to pause and leave.
      if (e.repeat || performance.now() - gateClosedAt.current < 600) return;
      if (paused) exitDrive();
      else setPaused(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [driving, cinematic, paused, exitDrive, focused, gate, arriving]);

  // Guest driving time, counted only while actually driving (not paused, hidden or mid crown rush).
  const crownLive = crownView?.crown.phase === "live" || crownView?.crown.phase === "countdown";
  useEffect(() => {
    if (viewer || !driving || !driveReady || cinematic || arriving || paused || gate || crownLive) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      guestDriven.current += 1000;
      if (guestDriven.current >= gateDueMs(guestStops.current)) {
        setGate({ reason: "time", stops: guestStops.current, drivenMs: guestDriven.current, stallAt: performance.now(), open: false });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [viewer, driving, driveReady, cinematic, arriving, paused, gate, crownLive]);

  // A guest who wins a crown rush is stopped right after the win shows.
  const crownWonAt = crownView && crownView.crown.phase === "over" && crownView.crown.winner && crownView.crown.winner === crownView.you ? crownView.crown.endsAt : null;
  const creditedWin = useRef<number | null>(null);
  useEffect(() => {
    if (viewer || !driving || crownWonAt === null || creditedWin.current === crownWonAt) return;
    creditedWin.current = crownWonAt;
    const t = window.setTimeout(() => setGate((g) => g ?? { reason: "crown", stops: guestStops.current, drivenMs: guestDriven.current, stallAt: performance.now(), open: false }), 2500);
    return () => window.clearTimeout(t);
  }, [viewer, driving, crownWonAt]);

  // Out of gas: the terminal opens once the car has rolled to a stop.
  const stalling = !!gate && !gate.open;
  useEffect(() => {
    if (!stalling) return;
    const id = window.setInterval(() => {
      setGate((g) => (g && !g.open && stallDone(performance.now() - g.stallAt, telemetry.speed) ? { ...g, open: true } : g));
    }, 100);
    return () => window.clearInterval(id);
  }, [stalling, telemetry]);

  const gateContinue = useCallback(() => {
    guestStops.current += 1;
    // The next stop is a full interval away from now, whatever stopped you.
    guestDriven.current = Math.min(guestDriven.current, gateDueMs(guestStops.current - 1));
    gateClosedAt.current = performance.now();
    setGate(null);
  }, []);
  const gateSignIn = useCallback(() => {
    // A town you can move into: come back to the join panel, not the car.
    if (joinAction === "join" || joinAction === "ask") {
      void signInToJoin({ leagueSlug: league.slug, refLogin, inviteToken, invitee: invite });
      return;
    }
    const params = new URLSearchParams({ next: `/town/${league.slug}?drive=1` });
    void signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?${params.toString()}`);
  }, [league.slug, joinAction, refLogin, inviteToken, invite]);
  // Put your building here, from the arrival choice or the drive HUD: a guest
  // signs in straight away (and comes back to the join panel); anyone else
  // leaves the car for the join panel.
  const joinFromCar = useCallback(() => {
    if (!viewer && (joinAction === "join" || joinAction === "ask")) {
      void signInToJoin({ leagueSlug: league.slug, refLogin, inviteToken, invitee: invite });
      return;
    }
    exitDrive();
    setPanel("join");
  }, [viewer, joinAction, league.slug, refLogin, inviteToken, invite, exitDrive]);

  // Live city while driving: pick up an admin's changes (walls, buildings, props).
  useEffect(() => {
    if (!driving) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/leagues/${league.slug}/city`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const next = (await res.json()) as LeagueCity;
        const s = store.getState();
        if (next.version > s.version && s.pending.length === 0 && !s.inflight) store.dispatch({ type: "resync", city: next });
      } catch {
        // offline: keep driving on what we have
      }
    };
    const id = setInterval(poll, DRIVE_POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [driving, league.slug, store]);

  // The drive minimap: the town and your building.
  const viewerLogin = viewer?.login.toLowerCase() ?? null;
  const driveMap = useMemo(() => ({ buildings, objects: sceneObjects, home: viewerLogin }), [buildings, sceneObjects, viewerLogin]);
  const driveProps = useMemo(
    () =>
      driving
        ? {
            viewerDevId,
            spawnDevId,
            scripted: introPose,
            cinematic,
            seamless: firstDrive,
            touch: touchRef,
            telemetry,
            camera: driveCamera,
            onCameraToggle: toggleCamera,
            muted,
            volume,
            emoteApi,
            onEmoteLog: emoteLog.push,
            // The arrival choice freezes the game: nobody drives before choosing.
            paused: paused || !!gate?.open || arriving,
            stallAt: gate && !gate.open ? gate.stallAt : null,
            onReady: onDriveReady,
            onFail: onDriveFail,
            slug: league.slug,
            name: driverName,
            onDrivers: setDrivers,
            onHonk: (b: CityBuilding) => setFocused(b),
            crownApi,
            onCrown: setCrownView,
          }
        : undefined,
    [driving, viewerDevId, spawnDevId, cinematic, firstDrive, telemetry, driveCamera, toggleCamera, muted, volume, emoteLog, paused, gate, arriving, onDriveReady, onDriveFail, league.slug, driverName],
  );

  // Everyone out driving, drawn in view mode too (the drive room takes over in the car).
  const watch = useDriveWatch(league.slug, mode === "view", (msg) => applyRoomDamage(smashStore, msg, Date.now()));
  // Bots fill the streets when few people are driving (lib/league-city/drive/bots).
  const bots = useTownBots(league.slug, sceneObjects, watch.drivers.length, mode === "view");
  const watchedCars = useMemo(
    () => [...watch.drivers.flatMap((d) => watch.remotes.current.get(d.id) ?? []), ...bots],
    [watch.drivers, watch.remotes, bots],
  );

  const newBuildings = useMemo(
    () => sceneObjects.filter((o) => o.kind === "building" && o.is_new),
    [sceneObjects],
  );

  // ─── Intro ─────────────────────────────────────────────────
  // First visit to each town (localStorage, like the home), the ▶ button
  // replays it, Esc or the Skip button skips. A car drives in through the
  // portal (TownIntro); the overlay adds the fade, letterbox and title (the
  // state lives up by the drive's, which it can start).
  const [hudEnter, setHudEnter] = useState(false);

  // ─── Cover ─────────────────────────────────────────────────
  // The Discover card's picture: taken here, like a game's world icon, once
  // the city has drawn and nothing is moving in front of it. The server says
  // when it's due (a first one, or a day-old one of a changed city).
  const coverTaken = useRef(false);
  const sendCover = useCallback(
    async (framed: boolean, pinned: boolean): Promise<boolean> => {
      const blob = await coverApi.current?.take(framed);
      if (!blob) return false;
      const form = new FormData();
      form.append("file", blob, "cover.jpg");
      if (pinned) form.append("pinned", "1");
      try {
        const res = await fetch(`/api/leagues/${league.slug}/cover`, { method: "POST", body: form });
        return res.ok;
      } catch {
        return false;
      }
    },
    [league.slug],
  );
  // Dev only: lets a local script photograph any town it has open.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __townCover?: () => Promise<Blob | null> }).__townCover = () => coverApi.current?.take(true) ?? Promise.resolve(null);
  }, []);
  useEffect(() => {
    if (!coverDue || coverTaken.current || intro || mode !== "view") return;
    // Trees and buildings stream in: give them a few seconds, then shoot.
    const id = window.setTimeout(() => {
      if (document.visibilityState !== "visible" || coverTaken.current) return;
      coverTaken.current = true;
      void sendCover(true, false);
    }, 6000);
    return () => window.clearTimeout(id);
  }, [coverDue, intro, mode, sendCover]);
  // Seconds into the intro, from the scene: the title follows it.
  const introClock = useRef(0);
  // When the intro car passes under the arch: the title's beat.
  const introCrossAt = useMemo(
    () => carIntro([...es.objects.values()].find((o) => o.item_type === "portal")?.pz ?? undefined).crossAt,
    [es.objects],
  );
  const onIntroTick = useCallback((t: number) => {
    introClock.current = t;
  }, []);
  const playIntro = useCallback(() => {
    setFocused(null);
    setPanel(null);
    introClock.current = 0;
    setHudEnter(false);
    // Every screen drives now (touch controls on phones): the intro always hands over the car.
    introPose.current = null;
    enterDrive();
    setCinematic(true);
    setIntro((prev) => ({ n: (prev?.n ?? 0) + 1, color: carColor(driverName), drive: true, skip: 0 }));
  }, [driverName, enterDrive]);
  // After the scene: the title fades and the bars pull back (outro), then the
  // HUD comes in piece by piece (hudEnter).
  const [outro, setOutro] = useState<number | null>(null);
  const outroTimer = useRef<number | undefined>(undefined);
  // The lo-fi player stays out of the cutscene.
  const cutscene = !!intro || outro !== null;
  useEffect(() => {
    const detail = { hidden: cutscene };
    (window as unknown as Record<string, unknown>).__gcRadioMode = detail;
    window.dispatchEvent(new CustomEvent("gc:radio-mode", { detail }));
  }, [cutscene]);
  useEffect(() => () => window.clearTimeout(outroTimer.current), []);
  const endIntro = useCallback(() => {
    const cur = intro;
    if (!cur) return;
    setIntro(null);
    setOutro(cur.n);
    window.clearTimeout(outroTimer.current);
    outroTimer.current = window.setTimeout(() => {
      setOutro(null);
      setHudEnter(true);
    }, OUTRO_MS);
    if (cur.drive) {
      // Your turn: the car is already yours and rolling (a newcomer's stops on the arrival choice).
      setCinematic(false);
      setFirstDrive(true);
      if (offerJoin) setArriving(true);
    }
  }, [intro, offerJoin]);
  const skipIntro = useCallback(() => {
    if (intro?.drive) setIntro({ ...intro, skip: intro.skip + 1 });
    else endIntro();
  }, [intro, endIntro]);
  const sceneIntro = useMemo(
    () =>
      intro
        ? {
            n: intro.n,
            color: intro.color,
            handoff: intro.drive ? { pose: introPose, ready: driveReady, skip: intro.skip } : undefined,
          }
        : null,
    [intro, driveReady],
  );
  const introChecked = useRef(false);
  useEffect(() => {
    // Back from sign-in to join (?join=1): straight to the join panel, no intro and no car.
    if (introChecked.current || startEditing || startDriving || showJoinCta || startJoin) return;
    introChecked.current = true;
    let seen = false;
    try {
      seen = localStorage.getItem(introSeenKey(league.slug)) === "1";
      localStorage.setItem(introSeenKey(league.slug), "1");
    } catch {
      // storage blocked: the intro plays every visit
    }
    // ?capture=1 hides the replay button, so every load plays the intro again.
    if (document.documentElement.dataset.capture === "1") seen = false;
    // After the first paint, from a callback: the scene mounts first.
    if (!seen) window.setTimeout(playIntro, 0);
  }, [league.slug, playIntro, startEditing, startDriving, showJoinCta, startJoin]);
  useEffect(() => {
    if (!intro) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipIntro();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [intro, skipIntro]);

  // ─── First steps ───────────────────────────────────────────
  // A new town's quest (lib/towns/quest): each step ticks itself when it
  // happens, with a chime; done, it says so and goes away.
  const [quest, setQuest] = useState<QuestState | null>(null);
  const questRef = useRef<QuestState | null>(null);
  const [questDesktop, setQuestDesktop] = useState(true);
  const steps = useMemo(() => questSteps(questDesktop), [questDesktop]);
  const saveQuest = useCallback(
    (q: QuestState | null) => {
      questRef.current = q;
      setQuest(q);
      try {
        localStorage.setItem(questKey(league.slug), q ? JSON.stringify(q) : "done");
      } catch {
        // storage blocked: the quest lasts this visit
      }
    },
    [league.slug],
  );
  const markQuest = useCallback(
    (step: QuestStep) => {
      const q = questRef.current;
      if (!q || q[step]) return;
      saveQuest({ ...q, [step]: true });
      chime();
    },
    [saveQuest],
  );
  // From a callback after the first paint, like the intro: storage is client-only.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setQuestDesktop(isDesktop());
      if (!isAdmin) return;
      if (startQuest) {
        saveQuest(freshQuest());
        const url = new URL(window.location.href);
        url.searchParams.delete("new");
        window.history.replaceState(null, "", url.pathname + url.search);
        return;
      }
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(questKey(league.slug));
      } catch {
        // storage blocked
      }
      const q = parseQuest(stored);
      questRef.current = q;
      setQuest(q);
    }, 0);
    return () => window.clearTimeout(id);
  }, [isAdmin, startQuest, league.slug, saveQuest]);
  useEffect(() => {
    // Once you have the car: not while the intro drives it.
    if (mode === "drive" && !cinematic) markQuest("drive");
    if (mode === "edit") markQuest("build");
  }, [mode, cinematic, markQuest]);
  useEffect(() => {
    if (mode === "edit" && es.undo.length > 0) markQuest("place");
  }, [mode, es.undo.length, markQuest]);
  const questComplete = !!quest && nextStep(quest, steps) === null;
  useEffect(() => {
    if (!questComplete) return;
    const id = window.setTimeout(() => saveQuest(null), 2600);
    return () => window.clearTimeout(id);
  }, [questComplete, saveQuest]);

  // ─── Identity panels (editor) ──────────────────────────────
  const [hillPanel, setHillPanel] = useState(false);
  const [hillSaving, setHillSaving] = useState(false);
  const [hillError, setHillError] = useState<string | null>(null);
  const pickHillSide = async (side: SignSide | null) => {
    setHillSaving(true);
    setHillError(null);
    const before = identity.signSide;
    const base = city.identity.signSide;
    setSignOverride({ side, base });
    try {
      const res = await fetch(`/api/leagues/${league.slug}/identity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sign_side: side }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setSignOverride({ side: before, base });
        setHillError(json.error ?? "Couldn't save.");
      }
    } catch {
      setSignOverride({ side: before, base });
      setHillError("Network error. Try again.");
    }
    setHillSaving(false);
  };
  const panelId = es.held ?? es.selection;
  const panelObj = mode === "edit" && panelId ? es.objects.get(panelId) : undefined;
  const panelType = panelObj?.item_type;
  const setProps = (props: ObjectProps) => panelObj && store.dispatch({ type: "setProps", id: panelObj.id, props });
  const closeObjPanel = () => store.dispatch({ type: "select", id: null });

  const leave = async (): Promise<string | null> => {
    try {
      const res = await fetch(`/api/leagues/${league.slug}/leave`, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        return json.error ?? "Couldn't leave. Try again.";
      }
      router.refresh();
      return null;
    } catch {
      return "Network error. Try again.";
    }
  };

  const verifyHref =
    !isMember && !showJoinCta && viewer && league.kind === "company" ? `/towns/new?kind=company&org=${encodeURIComponent(league.github_org ?? "")}` : null;
  const close = () => setPanel(null);
  // Find a building by username: the search button, or / anywhere in the city.
  const openFind = useCallback(() => {
    setFocused(null);
    setPanel("find");
  }, []);
  useEffect(() => {
    if (mode !== "view" || intro || panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      openFind();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, intro, panel, openFind]);
  const questStep = (step: QuestStep) => {
    if (step === "drive") enterDrive();
    else if (step === "invite") {
      setFocused(null);
      setPanel("invite");
    } else enterEdit();
  };
  const questCard = quest ? <TownQuest state={quest} steps={steps} onStep={questStep} onDismiss={() => saveQuest(null)} /> : null;
  // No card: the invite panel stays open with the link to send.
  const onInviteePlaced = useCallback((login: string) => {
    setFocused(null);
    setPeek(login);
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg font-pixel uppercase text-warm">
      {goingRace && <TransitScreen title={`${townDisplayName(league.name)} GP`} line="Heading to the track…" />}
      <LeagueScene
        h={es.h}
        identity={identity}
        name={league.name}
        intro={sceneIntro}
        onIntroEnd={endIntro}
        onIntroTick={onIntroTick}
        onPortalClick={!isMember ? () => {
          setFocused(null);
          setPanel("report");
        } : undefined}
        objects={sceneObjects}
        buildings={buildings}
        focused={focused?.login ?? peek}
        onBuildingClick={(b) => {
          setPanel(null);
          setPeek(null);
          setFocused(b);
        }}
        mode={mode}
        onLot={editor.onLot}
        editApiRef={cameraApi}
        editPickables={pickables}
        drive={driveProps}
        smash={smashTown}
        watching={watchedCars}
        coverRef={coverApi}
        navCamera={navCamera}
      >
        {mode === "edit" && (
          <EditorOverlay
            h={es.h}
            objects={sceneObjects}
            buildingByDev={byDevId}
            grid={editor.grid}
            hover={editor.hover}
            hovered={
              es.tool.kind === "select" && !es.held && editor.hover
                ? objectAtSpot(es.objects, editor.hover)
                : undefined
            }
            ghost={editor.ghost}
            roadPath={editor.roadPath}
          />
        )}
      </LeagueScene>

      {editing && (
        <>
          <EditorTopBar
            name={league.name}
            status={autosave.status}
            canUndo={es.undo.length > 0}
            canRedo={es.redo.length > 0}
            preview={mode === "preview"}
            leaving={leaving}
            onUndo={() => store.dispatch({ type: "undo" })}
            onRedo={() => store.dispatch({ type: "redo" })}
            onPreview={togglePreview}
            onDone={done}
            h={es.h}
            maxSize={MAX_H}
            onExpand={() => store.dispatch({ type: "expand" })}
            minSize={START_H}
            shrinkNote={shrinkNote}
            onShrink={() => store.dispatch({ type: "shrink" })}
          />
          {mode === "edit" && (
            <>
              <Hotbar
                tab={es.hotbarTab}
                slot={es.slot}
                tool={es.tool}
                newBuildings={newBuildings}
                buildingByDev={byDevId}
                held={es.held}
                onTab={(tab) => {
                  store.dispatch({ type: "setTab", tab });
                  const tool = toolForSlot(tab, 0);
                  if (tool) store.dispatch({ type: "setTool", tool });
                }}
                onSlot={editor.selectSlot}
                onTool={(tool) => store.dispatch({ type: "setTool", tool })}
                onPickBuilding={editor.pickBuilding}
                hint={editor.hint}
                objects={es.objects}
                hasLogo={es.hasLogo}
                hasHillSign={identity.signSide !== null}
                onHillSign={() => {
                  closeObjPanel();
                  setHillError(null);
                  setHillPanel(true);
                }}
                onWheel={(dir) => {
                  const n =
                    es.hotbarTab === "buildings"
                      ? Math.min(9, newBuildings.length)
                      : HOTBAR[es.hotbarTab].length;
                  if (n > 0) editor.selectSlot((es.slot + dir + n) % n);
                }}
              />
              <EditorTips />
              <CameraHints />
              {(panelType === "plane" || panelType === "blimp") && panelObj && (
                <SkyPanel key={`${panelObj.id}:${String(panelObj.props?.text ?? "")}`} object={panelObj} onChange={setProps} onClose={closeObjPanel} />
              )}
              {panelType === "plaza" && panelObj && (
                <PlazaPanel key={panelObj.id} object={panelObj} hasLogo={es.hasLogo} onChange={setProps} onClose={closeObjPanel} />
              )}
              {hillPanel && !panelObj && (
                <HillSignPanel side={identity.signSide} saving={hillSaving} error={hillError} onPick={pickHillSide} onClose={() => setHillPanel(false)} />
              )}
            </>
          )}
          <EditorToasts notice={es.notice} />
        </>
      )}
      {!editing && <EditorToasts notice={viewNotice} />}

      {driving && !cinematic && (
        <DriveHud
          firstRun={firstDrive}
          touchRef={touchUi ? touchRef : undefined}
          telemetry={telemetry}
          ready={driveReady}
          camera={driveCamera}
          muted={muted}
          volume={volume}
          paused={paused}
          gated={!!gate}
          held={arriving}
          join={offerJoin && !arriving ? { label: joinLabel, onClick: joinFromCar } : undefined}
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
      {driving && !cinematic && arriving && (
        <div className="pointer-events-none fixed inset-0 z-30 font-pixel uppercase">
          <ArrivalChoice
            town={townDisplayName(league.name)}
            label={joinLabel}
            detail={joinDetail}
            onJoin={joinFromCar}
            onDrive={() => setArriving(false)}
          />
        </div>
      )}
      {driving && !cinematic && gate?.open && !viewer && (
        <GuestGate
          key={`${gate.reason}-${gate.stops}`}
          reason={gate.reason}
          stops={gate.stops}
          guest={guest}
          drivenMs={gate.drivenMs}
          onSignIn={gateSignIn}
          onContinue={gateContinue}
        />
      )}

      {/* HUD: the wrappers ignore the pointer so the city stays draggable. */}
      {!editing && !driving && !intro && outro === null && (
        <>
          {/* The main city's minimap (desktop), compass and zoom buttons: hidden
              while towns are small enough to see at once (SHOW_MAP_NAV). */}
          {SHOW_MAP_NAV && (
            <>
              <div className="hidden sm:block">
                <TownRadar buildings={buildings} camera={navCamera} />
              </div>
              <MapNavControls camera={navCamera} accent={RIVALRY.find((r) => r.slug === league.slug)?.color ?? LIME} showPlaces={false} />
            </>
          )}
          {/* The main city's controls hints. */}
          <div className="pointer-events-none fixed bottom-20 left-4 z-30 hidden font-pixel text-[9px] uppercase leading-loose text-muted sm:block">
            <div><span className="text-cream">Drag</span> move</div>
            <div><span className="text-cream">Scroll</span> zoom</div>
            <div><span className="text-cream">Right-drag</span> rotate</div>
            <div><span className="text-cream">2-finger swipe</span> rotate</div>
            <div><span className="text-cream">Double-click</span> zoom in</div>
            {focused ? (
              <div><span className="text-lime">ESC</span> close</div>
            ) : (
              <div><span className="text-cream">Click</span> building</div>
            )}
          </div>
          <div className="pointer-events-none fixed left-4 top-4 z-30 flex flex-col gap-3 max-sm:hidden" style={hudEnter ? { animation: "fade-in 0.45s ease-out both" } : undefined}>
            <LeagueTitle data={data} badges={badges} logoUrl={identity.logoUrl} place={place} pendingRequests={pendingRequests} />
            {questCard}
          </div>
          {/* Phones: one compact header row. */}
          <div
            className={`pointer-events-none fixed inset-x-3 top-3 z-30 sm:hidden ${focused ? "hidden" : ""}`}
            style={hudEnter ? { animation: "fade-in 0.45s ease-out both" } : undefined}
          >
            <MobileTownHeader
              data={data}
              badges={badges}
              logoUrl={identity.logoUrl}
              pendingRequests={pendingRequests}
              place={place}
              onRace={() => setPanel("standings")}
            />
            {questCard && !panel && <div className="mt-2">{questCard}</div>}
          </div>
          {/* The lo-fi player's spot: above the bar on phones, bottom left on desktop. */}
          <div
            id="gc-radio-slot"
            className={`pointer-events-auto fixed bottom-[68px] left-3 z-30 sm:bottom-4 sm:left-4 ${focused ? "max-sm:hidden" : ""}`}
            style={hudEnter ? { animation: "slide-up 0.45s ease-out 0.3s both" } : undefined}
          />

          <div
            className={`pointer-events-none fixed right-4 top-4 z-30 hidden transition-opacity duration-200 sm:block ${focused || panel ? "opacity-0" : ""}`}
            style={hudEnter ? { animation: "fade-in 0.45s ease-out 0.12s both" } : undefined}
          >
            <RaceWidget data={data} ranking={ranking} onOpen={() => setPanel("standings")} />
          </div>

          <div
            className={`pointer-events-none fixed inset-x-3 bottom-3 z-30 flex flex-col items-center gap-2 sm:inset-x-4 sm:bottom-4 ${focused ? "max-sm:hidden" : ""}`}
            style={hudEnter ? { animation: "slide-up 0.45s ease-out 0.24s both" } : undefined}
          >
            {/* Phones: one full-width bar, the main action first. */}
            <div className="pointer-events-none w-full sm:hidden">
              <MobileActionBar
                slug={league.slug}
                canInvite={isMember}
                isAdmin={isAdmin}
                verifyHref={verifyHref}
                onInvite={() => {
                  setFocused(null);
                  setPanel("invite");
                }}
                onLeave={isMember ? leave : undefined}
                join={
                  joinKind
                    ? {
                        kind: joinKind,
                        onClick: () => {
                          setFocused(null);
                          setPanel("join");
                        },
                      }
                    : undefined
                }
                requests={pendingRequests}
                onDrive={() => enterDrive()}
                onFind={openFind}
                onReplay={playIntro}
              />
            </div>
            <div className="pointer-events-none flex w-full items-end justify-center gap-2 max-sm:hidden">
              <ActionBar
                slug={league.slug}
                canInvite={isMember}
                isAdmin={isAdmin}
                verifyHref={verifyHref}
                onInvite={() => {
                  setFocused(null);
                  setPanel("invite");
                }}
                onEdit={isAdmin ? enterEdit : undefined}
                onCover={isAdmin ? () => sendCover(false, true) : undefined}
                onDrive={() => enterDrive()}
                onFind={openFind}
                onRace={goRace}
                raceRecord={raceRecord ? `Record @${raceRecord.login} ${formatLap(raceRecord.best_ms)}` : null}
                drivingNow={watch.drivers.length}
                onLeave={isMember ? leave : undefined}
                join={
                  joinKind
                    ? {
                        kind: joinKind,
                        onClick: () => {
                          setFocused(null);
                          setPanel("join");
                        },
                      }
                    : undefined
                }
                requests={pendingRequests}
                onReplay={playIntro}
              />
            </div>
          </div>
        </>
      )}

      {(intro || outro !== null) && (
        <IntroOverlay
          key={intro?.n ?? outro ?? 0}
          clock={introClock}
          crossAt={introCrossAt}
          outro={!intro}
          name={townDisplayName(league.name)}
          race={
            place?.rank
              ? `${ordinal(place.rank)} of ${place.total} towns this week`
              : data.week.standings[0]
                ? `@${data.week.standings[0].login} leads this week`
                : null
          }
          logoUrl={identity.logoUrl}
          accent={(SKY_ACCENTS[identity.sky] ?? SKY_ACCENTS[1]).accent}
          shadow={(SKY_ACCENTS[identity.sky] ?? SKY_ACCENTS[1]).shadow}
          onSkip={skipIntro}
        />
      )}
      {panel === "report" && (
        <ReportPanel slug={league.slug} name={league.name} logoUrl={identity.logoUrl} signedIn={!!viewer} onClose={close} />
      )}
      {panel === "hall" && <HallOfFamePanel data={data} onClose={close} />}
      {panel === "standings" && <StandingsPanel data={data} ranking={ranking} onHallOfFame={() => setPanel("hall")} onClose={close} />}
      {panel === "invite" && isMember && viewer && (
        <InvitePanel
          slug={league.slug}
          viewerLogin={viewer.login}
          pending={members.filter((m) => m.status === "invited")}
          groupLink={groupLink}
          kind={league.kind}
          joinMode={league.join_mode}
          isAdmin={isAdmin}
          inCity={(login) => buildings.some((b) => b.loginLower === login.toLowerCase())}
          onShow={(login) => {
            const b = buildings.find((x) => x.loginLower === login.toLowerCase());
            setPanel(null);
            setPeek(null);
            if (b) setFocused(b);
          }}
          onPlaced={onInviteePlaced}
          onShared={() => markQuest("invite")}
          onClose={close}
        />
      )}
      {panel === "find" && (
        <FindPanel
          buildings={buildings}
          onPick={(b) => {
            setPanel(null);
            setFocused(b);
          }}
          onClose={close}
        />
      )}
      {focused && (
        <BuildingCard
          key={focused.loginLower}
          building={focused}
          data={data}
          onDriveTo={mode === "view" && focused.loginLower !== viewerLogin ? () => driveTo(focused) : undefined}
          onClose={() => setFocused(null)}
        />
      )}
      {panel === "join" && (
        <JoinPanel
          leagueSlug={league.slug}
          action={joinAction === "member" || joinAction === "none" ? "join" : joinAction}
          signedIn={!!viewer}
          invitee={invite}
          refLogin={refLogin}
          inviteToken={inviteToken}
          org={league.github_org}
          onClose={close}
        />
      )}
    </main>
  );
}
