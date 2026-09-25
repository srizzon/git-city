"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import PixelSpinner from "@/components/leagues/PixelSpinner";
import { useTownVisit } from "@/components/towns/useTownVisit";
import { isDesktop } from "@/components/towns/useDesktop";
import type { TownBadges } from "@/lib/towns/milestones";
import type { JoinAction } from "@/lib/towns/joining";
import {
  generateCityLayout,
  type CityBuilding,
  type DeveloperRecord,
  type LayoutNorms,
} from "@/lib/github";
import type { LeaguePageData } from "@/lib/leagues/queries";
import type { LeagueCity } from "@/lib/league-city/service";
import { leagueBuildings, scaleTownHeights } from "@/lib/league-city/buildings";
import LeagueTitle from "@/components/league/hud/LeagueTitle";
import RaceWidget from "@/components/league/hud/RaceWidget";
import ActionBar from "@/components/league/hud/ActionBar";
import HallOfFamePanel from "@/components/league/hud/HallOfFamePanel";
import StandingsPanel from "@/components/league/hud/StandingsPanel";
import InvitePanel from "@/components/league/hud/InvitePanel";
import JoinPanel from "@/components/league/hud/JoinPanel";
import BuildingCard from "@/components/league/hud/BuildingCard";
import { HUD_BOX } from "@/components/league/hud/shared";
import EditorTopBar from "@/components/league/hud/editor/EditorTopBar";
import Hotbar, { CameraHints, toolForSlot } from "@/components/league/hud/editor/Hotbar";
import EditorToasts from "@/components/league/hud/editor/EditorToasts";
import EditorTips from "@/components/league/hud/editor/EditorTips";
import EditorOverlay from "@/components/league/editor/EditorOverlay";
import type { EditCameraApi, Pickable } from "@/components/league/editor/EditCamera";
import { useEditorController } from "@/components/league/editor/useEditorController";
import { useCityAutosave } from "@/components/league/editor/useCityAutosave";
import type { SceneMode } from "@/components/league/LeagueScene";
import type { DriveCameraMode, DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import type { DriverInfo } from "@/lib/league-city/drive/net";
import type { CrownApi, CrownView } from "@/components/league/drive/CrownMode";
import { createEditorStore } from "@/lib/league-city/editor/store";
import { keyToAction } from "@/lib/league-city/editor/shortcuts";
import { MAX_H, START_H } from "@/lib/league-city/grid";
import { isAir } from "@/lib/league-city/catalog";
import { introSeenKey } from "@/lib/league-city/identity";
import type { IntroPieces, IntroStyle } from "@/lib/league-city/intro";
import type { CityIdentity, ObjectProps, SignSide } from "@/lib/league-city/types";
import { HillSignPanel, PlazaPanel, SkyPanel } from "@/components/league/hud/editor/IdentityPanel";
import ReportPanel from "@/components/league/hud/ReportPanel";
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
/** While driving, check for city changes (an admin's Done) this often. */
const DRIVE_POLL_MS = 5000;

type PanelId = "hall" | "standings" | "invite" | "join" | "report" | null;

export default function LeagueClient({
  data,
  city,
  cityDevs,
  cityNorms,
  topCompanyLastWeek,
  invite,
  inviteToken,
  refLogin,
  startEditing = false,
  startDriving = false,
  startJoin = false,
  joinAction,
  pendingRequests,
  groupLink,
  badges,
  introStyle = "reveal",
}: {
  data: LeaguePageData;
  city: LeagueCity;
  cityDevs: Record<string, unknown>[];
  cityNorms: LayoutNorms;
  topCompanyLastWeek: boolean;
  /** An invited member's login from ?invite=, checked on the server. */
  invite: string | null;
  /** ?t= when it matches the league's invite token. */
  inviteToken: string | null;
  refLogin: string | null;
  startEditing?: boolean;
  /** ?drive=1 (Surprise me, Discover's Drive): straight into the car on desktop. */
  startDriving?: boolean;
  /** ?join=1: back from sign-in, reopen the join panel. */
  startJoin?: boolean;
  joinAction: JoinAction;
  /** Admin: open join requests. */
  pendingRequests: number;
  /** Members: the link for a group chat. */
  groupLink: string | null;
  badges: TownBadges;
  /** Which intro plays (see lib/league-city/intro). */
  introStyle?: IntroStyle;
}) {
  const { league, members, viewer } = data;
  const isMember = viewer?.status === "active";
  const showJoinCta = !isMember && (!!invite || !!inviteToken || viewer?.status === "invited");
  const joinKind = joinAction === "join" || joinAction === "ask" || joinAction === "pending" ? joinAction : null;
  const [panel, setPanel] = useState<PanelId>(showJoinCta || (startJoin && joinKind) ? "join" : null);
  const [focused, setFocused] = useState<CityBuilding | null>(null);
  // The camera looks at a building without opening its card (a new invitee's).
  const [peek, setPeek] = useState<string | null>(null);
  const router = useRouter();
  const isAdmin = !!viewer?.is_admin;

  // ─── Editor ────────────────────────────────────────────────
  const [mode, setMode] = useState<SceneMode>(startEditing && isAdmin ? "edit" : "view");
  const editing = mode === "edit" || mode === "preview";
  const driving = mode === "drive";
  useTownVisit(league.slug, !!viewer && viewer.status !== "active" && viewer.status !== "invited", driving);
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
  // Mutated by the car every frame, read by the HUD; a fresh one per drive.
  const [telemetry, setTelemetry] = useState<DriveTelemetry>(() => ({ speed: 0, boosting: false, near: null, held: null, gotAt: 0 }));
  const [driveReady, setDriveReady] = useState(false);
  const [driveCamera, setDriveCamera] = useState<DriveCameraMode>("chase");
  const [paused, setPaused] = useState(false);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const crownApi = useRef<CrownApi | null>(null);
  const [crownView, setCrownView] = useState<CrownView | null>(null);
  // Your name in the drive room: your login, or a guest name for this visit.
  const [guest] = useState(() => `guest-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`);
  const driverName = viewer?.login ?? guest;
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
  const toggleCamera = useCallback(() => setDriveCamera((c) => (c === "chase" ? "top" : "chase")), []);
  const enterDrive = () => {
    setFocused(null);
    setPanel(null);
    setDriveReady(false);
    setTelemetry({ speed: 0, boosting: false, near: null, held: null, gotAt: 0 });
    setPaused(false);
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {
      // storage blocked: sound stays on
    }
    setMode("drive");
  };
  const autoDrove = useRef(false);
  useEffect(() => {
    if (!startDriving || autoDrove.current) return;
    autoDrove.current = true;
    window.history.replaceState(null, "", `/town/${league.slug}`);
    // After the first paint, from a callback: the scene mounts in view mode first.
    if (isDesktop()) window.setTimeout(enterDrive, 0);
  }, [startDriving, league.slug]);
  const exitDrive = useCallback(() => {
    setMode((m) => (m === "drive" ? "view" : m));
    setDrivers([]);
    setCrownView(null);
  }, []);
  const onDriveReady = useCallback(() => setDriveReady(true), []);
  const onDriveFail = useCallback(() => {
    setMode((m) => (m === "drive" ? "view" : m));
    setViewNotice({ kind: "error", message: "Couldn't start the car.", seq: Date.now() });
  }, []);

  // Esc pauses; Esc again on the pause menu leaves the car.
  useEffect(() => {
    if (!driving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (focused) return; // the building card closes itself
      if (paused) exitDrive();
      else setPaused(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [driving, paused, exitDrive, focused]);

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

  const driveProps = useMemo(
    () =>
      driving
        ? {
            viewerDevId,
            telemetry,
            camera: driveCamera,
            onCameraToggle: toggleCamera,
            muted,
            paused,
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
    [driving, viewerDevId, telemetry, driveCamera, toggleCamera, muted, paused, onDriveReady, onDriveFail, league.slug, driverName],
  );

  const newBuildings = useMemo(
    () => sceneObjects.filter((o) => o.kind === "building" && o.is_new),
    [sceneObjects],
  );

  // ─── Intro ─────────────────────────────────────────────────
  // First visit to each town (localStorage, like the home), the ▶ button
  // replays it. Click or Esc skips. Lands on your building, else this
  // week's leader.
  const [intro, setIntro] = useState<{ pieces: IntroPieces; style: IntroStyle; n: number } | null>(null);
  const playIntro = useCallback(() => {
    setFocused(null);
    setPanel(null);
    const portal = [...store.getState().objects.values()].find((o) => o.item_type === "portal");
    setIntro((prev) => ({
      pieces: {
        h: store.getState().h,
        portal: portal && portal.px !== null && portal.pz !== null ? [portal.px, portal.pz] : null,
        tallest: Math.max(0, ...[...byDevId.values()].map((b) => b.height)),
      },
      style: introStyle,
      n: (prev?.n ?? 0) + 1,
    }));
  }, [store, byDevId, introStyle]);
  const endIntro = useCallback(() => setIntro(null), []);
  const skipIntro = useCallback(() => setIntro(null), []);
  const introChecked = useRef(false);
  useEffect(() => {
    if (introChecked.current || startEditing || startDriving || showJoinCta) return;
    introChecked.current = true;
    let seen = false;
    try {
      seen = localStorage.getItem(introSeenKey(league.slug)) === "1";
      localStorage.setItem(introSeenKey(league.slug), "1");
    } catch {
      // storage blocked: the intro plays every visit
    }
    // After the first paint, from a callback: the scene mounts first.
    if (!seen) window.setTimeout(playIntro, 0);
  }, [league.slug, playIntro, startEditing, startDriving, showJoinCta]);
  useEffect(() => {
    if (!intro) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipIntro();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [intro, skipIntro]);

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
    !isMember && !showJoinCta && viewer && league.kind === "company" ? "/towns/verify" : null;
  const close = () => setPanel(null);
  // No card: the invite panel stays open with the link to send.
  const onInviteePlaced = useCallback((login: string) => {
    setFocused(null);
    setPeek(login);
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg font-pixel uppercase text-warm" onPointerDown={intro ? skipIntro : undefined}>
      <LeagueScene
        h={es.h}
        identity={identity}
        name={league.name}
        intro={intro}
        onIntroEnd={endIntro}
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

      {driving && (
        <DriveHud
          telemetry={telemetry}
          ready={driveReady}
          camera={driveCamera}
          muted={muted}
          paused={paused}
          drivers={drivers}
          crown={crownView}
          onStartCrown={() => crownApi.current?.start()}
          onResume={() => setPaused(false)}
          onCamera={toggleCamera}
          onMute={toggleMute}
          onExit={exitDrive}
        />
      )}

      {/* HUD: the wrappers ignore the pointer so the city stays draggable. */}
      {!editing && !driving && !intro && (
        <>
          <div className="pointer-events-none fixed left-4 top-4 z-30">
            <LeagueTitle data={data} topCompanyLastWeek={topCompanyLastWeek} badges={badges} pendingRequests={pendingRequests} />
          </div>

          <div
            className={`pointer-events-none fixed right-4 top-4 z-30 hidden transition-opacity duration-200 sm:block ${focused || panel ? "opacity-0" : ""}`}
          >
            <RaceWidget
              data={data}
              onHallOfFame={() => setPanel("hall")}
              onStandings={() => setPanel("standings")}
            />
          </div>

          <div
            className={`pointer-events-none fixed inset-x-4 bottom-4 z-30 flex flex-col items-center gap-2 ${focused ? "max-sm:hidden" : ""}`}
          >
            <div className="pointer-events-none flex w-full items-end justify-center gap-2">
              <div className="sm:hidden">
                <button
                  type="button"
                  onClick={() => setPanel("standings")}
                  className={`${HUD_BOX} btn-press px-3 py-2 text-[10px] text-cream`}
                >
                  Race
                </button>
              </div>
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
                onDrive={enterDrive}
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

      {intro && (
        <button
          type="button"
          onClick={skipIntro}
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 bg-bg/70 px-3 py-1.5 text-[9px] text-muted backdrop-blur-sm hover:text-cream"
        >
          Click or Esc to skip
        </button>
      )}
      {panel === "report" && (
        <ReportPanel slug={league.slug} name={league.name} logoUrl={identity.logoUrl} signedIn={!!viewer} onClose={close} />
      )}
      {panel === "hall" && <HallOfFamePanel data={data} onClose={close} />}
      {panel === "standings" && <StandingsPanel data={data} onClose={close} />}
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
          onClose={close}
        />
      )}
      {focused && (
        <BuildingCard
          key={focused.loginLower}
          building={focused}
          data={data}
          driving={driving}
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
          onClose={close}
        />
      )}
    </main>
  );
}
