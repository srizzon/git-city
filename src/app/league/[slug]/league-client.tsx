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
import Hotbar, { toolForSlot } from "@/components/league/hud/editor/Hotbar";
import EditorToasts from "@/components/league/hud/editor/EditorToasts";
import EditorTips from "@/components/league/hud/editor/EditorTips";
import EditorOverlay from "@/components/league/editor/EditorOverlay";
import type { EditCameraApi } from "@/components/league/editor/EditCamera";
import { useEditorController } from "@/components/league/editor/useEditorController";
import { useCityAutosave } from "@/components/league/editor/useCityAutosave";
import type { SceneMode } from "@/components/league/LeagueScene";
import { createEditorStore } from "@/lib/league-city/editor/store";
import { HOTBAR, initEditor, objectAtSpot, type Notice } from "@/lib/league-city/editor/state";

const LeagueScene = dynamic(() => import("@/components/league/LeagueScene"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center gap-3 bg-bg font-pixel text-[10px] uppercase text-muted">
      <PixelSpinner />
      Building the city
    </div>
  ),
});

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
  const editing = mode !== "view";
  const [store] = useState(() => createEditorStore(initEditor(city)));
  const cameraApi = useRef<EditCameraApi | null>(null);
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
    if (!editing || !missing || refreshedFor.current === es.version) return;
    refreshedFor.current = es.version;
    router.refresh();
  }, [editing, missing, es.version, router]);

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
            </>
          )}
          <EditorToasts notice={es.notice} />
        </>
      )}
      {!editing && <EditorToasts notice={viewNotice} />}

      {/* HUD: the wrappers ignore the pointer so the city stays draggable. */}
      {!editing && (
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
