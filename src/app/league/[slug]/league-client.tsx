"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import PixelSpinner from "@/components/leagues/PixelSpinner";
import {
  generateCityLayout,
  type CityBuilding,
  type DeveloperRecord,
  type LayoutNorms,
} from "@/lib/github";
import type { LeaguePageData } from "@/lib/leagues/queries";
import type { LeagueCity } from "@/lib/league-city/service";
import { leagueBuildings } from "@/lib/league-city/buildings";
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
import { createEditorStore } from "@/lib/league-city/editor/store";
import { keyToAction } from "@/lib/league-city/editor/shortcuts";
import { MAX_SIZE, START_SIZE } from "@/lib/league-city/grid";
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

type PanelId = "hall" | "standings" | "invite" | "join" | null;

export default function LeagueClient({
  data,
  city,
  cityDevs,
  cityNorms,
  topCompanyLastWeek,
  invite,
  refLogin,
  startEditing = false,
}: {
  data: LeaguePageData;
  city: LeagueCity;
  cityDevs: Record<string, unknown>[];
  cityNorms: LayoutNorms;
  topCompanyLastWeek: boolean;
  invite: string | null;
  refLogin: string | null;
  startEditing?: boolean;
}) {
  const { league, members, viewer } = data;
  const isMember = viewer?.status === "active";
  const invitedMember = invite ? members.find((m) => m.login.toLowerCase() === invite) : undefined;
  const showJoinCta = !isMember && (!!invite || viewer?.status === "invited");
  const [panel, setPanel] = useState<PanelId>(showJoinCta ? "join" : null);
  const [focused, setFocused] = useState<CityBuilding | null>(null);
  const router = useRouter();
  const isAdmin = !!viewer?.is_admin;

  // ─── Editor ────────────────────────────────────────────────
  const [mode, setMode] = useState<SceneMode>(startEditing && isAdmin ? "edit" : "view");
  const editing = mode === "edit" || mode === "preview";
  const driving = mode === "drive";
  const [store] = useState(() => createEditorStore(initEditor(city)));
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
    return map;
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
    window.history.replaceState(null, "", `/league/${league.slug}`);
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
    window.history.replaceState(null, "", `/league/${league.slug}?edit=1`);
  };
  const done = async () => {
    setLeaving(true);
    await autosave.drain();
    setLeaving(false);
    setMode("view");
    window.history.replaceState(null, "", `/league/${league.slug}`);
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

  const sceneSize = es.size;
  const shrinkNote = useMemo(() => {
    if (!editing) return "";
    const ring = ringContents(es);
    if (ring.blocked) return "Move the buildings off the edge first";
    return ring.removes.length > 0
      ? `Remove the outer ring and the ${ring.removes.length} item${ring.removes.length === 1 ? "" : "s"} on it`
      : "Remove the outer ring of lots";
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
    const mid: Partial<Record<string, number>> = { lamp: 9, bench: 1.5, fountain: 4 };
    pickables.current = [...es.objects.values()].flatMap((o) =>
      o.px !== null && o.pz !== null && o.item_type
        ? [{ id: o.id, x: o.px, y: mid[o.item_type] ?? 16, z: o.pz }]
        : [],
    );
  }, [es.objects]);
  // ─── Drive ─────────────────────────────────────────────────
  const viewerDevId = useMemo(
    () => (viewer ? (members.find((m) => m.login.toLowerCase() === viewer.login.toLowerCase())?.developer_id ?? null) : null),
    [viewer, members],
  );
  // Mutated by the car every frame, read by the HUD; a fresh one per drive.
  const [telemetry, setTelemetry] = useState<DriveTelemetry>(() => ({ speed: 0, boost: 1, boosting: false }));
  const [driveReady, setDriveReady] = useState(false);
  const [driveCamera, setDriveCamera] = useState<DriveCameraMode>("chase");
  const [paused, setPaused] = useState(false);
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
    setTelemetry({ speed: 0, boost: 1, boosting: false });
    setPaused(false);
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {
      // storage blocked: sound stays on
    }
    setMode("drive");
  };
  const exitDrive = useCallback(() => setMode((m) => (m === "drive" ? "view" : m)), []);
  const onDriveReady = useCallback(() => setDriveReady(true), []);
  const onDriveFail = useCallback(() => {
    setMode((m) => (m === "drive" ? "view" : m));
    setViewNotice({ kind: "error", message: "Couldn't start the car.", seq: Date.now() });
  }, []);

  // Esc pauses (and resumes); leaving is the Exit button.
  useEffect(() => {
    if (!driving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [driving]);

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
          }
        : undefined,
    [driving, viewerDevId, telemetry, driveCamera, toggleCamera, muted, paused, onDriveReady, onDriveFail],
  );

  const newBuildings = useMemo(
    () => sceneObjects.filter((o) => o.kind === "building" && o.is_new),
    [sceneObjects],
  );

  const verifyHref =
    !isMember && !showJoinCta && viewer && league.kind === "company" ? "/leagues/verify" : null;
  const close = () => setPanel(null);

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg font-pixel uppercase text-warm">
      <LeagueScene
        size={sceneSize}
        objects={sceneObjects}
        buildings={buildings}
        focused={focused?.login ?? null}
        onBuildingClick={(b) => {
          setPanel(null);
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
            size={es.size}
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
            size={es.size}
            maxSize={MAX_SIZE}
            onExpand={() => store.dispatch({ type: "expand" })}
            minSize={START_SIZE}
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
          onResume={() => setPaused(false)}
          onCamera={toggleCamera}
          onMute={toggleMute}
          onExit={exitDrive}
        />
      )}

      {/* HUD: the wrappers ignore the pointer so the city stays draggable. */}
      {!editing && !driving && (
        <>
          <div className="pointer-events-none fixed left-4 top-4 z-30">
            <LeagueTitle data={data} topCompanyLastWeek={topCompanyLastWeek} />
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
              />
            </div>
          </div>
        </>
      )}

      {panel === "hall" && <HallOfFamePanel data={data} onClose={close} />}
      {panel === "standings" && <StandingsPanel data={data} onClose={close} />}
      {panel === "invite" && isMember && viewer && (
        <InvitePanel
          slug={league.slug}
          viewerLogin={viewer.login}
          pending={members.filter((m) => m.status === "invited")}
          onClose={close}
        />
      )}
      {focused && (
        <BuildingCard
          key={focused.loginLower}
          building={focused}
          data={data}
          onClose={() => setFocused(null)}
        />
      )}
      {panel === "join" && (
        <JoinPanel
          leagueSlug={league.slug}
          leagueKind={league.kind}
          signedIn={!!viewer}
          invitee={invitedMember?.login ?? invite}
          refLogin={refLogin}
          onClose={close}
        />
      )}
    </main>
  );
}
