"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import posthog from "posthog-js";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import TrackScene, { NIGHT_PALETTE } from "@/components/race/TrackScene";
import { Billboard } from "@/components/league/identity/IdentityPieces";
import { useFontReady } from "@/components/league/identity/IdentityLayer";
import DriftHud, { fmt } from "@/components/drift/DriftHud";
import type { PostResult, PostState } from "@/components/drift/DriftResults";
import type { DriftFinish } from "@/components/drift/DriftWorld";
import type { BoardRowLite } from "@/components/drift/DriftTitle";
import { TrackCard, TrackResults } from "./DriftCards";
import { useT } from "@/lib/i18n/LangProvider";
import TouchControls from "@/components/league/hud/drive/TouchControls";
import { lotToWorld } from "@/lib/league-city/grid";
import type { DriveCameraMode } from "@/lib/league-city/drive/telemetry";
import type { TouchDrive } from "@/lib/league-city/drive/touch";
import { carColor } from "@/lib/league-city/drive/net";
import type { GhostRun } from "@/lib/league-city/race/ghost";
import { TRIAL, type TrialStage } from "@/lib/league-city/race/trial";
import type { Frames } from "@/lib/drift/frames";
import { loadRun, saveRun, type LocalRun } from "@/lib/drift/local";
import { courseOf, getLiveSpot } from "@/lib/drift/spots";
import type { LiveSpot } from "@/lib/drift/spots/types";
import { createDriftTelemetry } from "@/lib/drift/telemetry";
import { DRIFT_SIGN_LOT, moveOldRun } from "@/lib/towns/brasil-drift";

// The Brasil town's drift track (Brasil Drift), out on the land between São
// Paulo and Mato Grosso do Sul. From the town it's a circuit painted on the
// ground: the asphalt and its line under the START gantry, no walls yet, and
// a DRIFT sign by the gate with the track's top five. Driving across the line
// is an event's marker in Forza Horizon: the screen goes dark, the track's
// card (DriftCards) comes up under the wide shot of the car on the grid,
// Enter drifts, Esc goes back. Then it's /drift: 3-2-1, the scorer, the HUD,
// Enter for the last checkpoint, the finish, the same card with your score.
// Again, or back to the city on the highway by the gate.

const DriftWorld = dynamic(() => import("@/components/drift/DriftWorld"), { ssr: false, loading: () => null });

export const BRASIL_DRIFT = getLiveSpot("brasil") as LiveSpot;
const COURSE = courseOf(BRASIL_DRIFT);
const LIME = "#c8e64a";
const unlit = { current: 0 };
/** Seen from farther than this (units), the site isn't drawn. */
const SITE_VIEW = 9000;

/** A billboard face: lime on the night panel, like the cities' signs. */
function signTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0b0f19";
  ctx.fillRect(0, 0, 256, 128);
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

type Tr = (en: string, pt: string) => string;

function drawSign(ctx: CanvasRenderingContext2D, t: Tr) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "56px Silkscreen, monospace";
  ctx.fillStyle = LIME;
  ctx.fillText("DRIFT", 128, 52);
  ctx.font = "16px Silkscreen, monospace";
  ctx.fillStyle = "#8a93a6";
  ctx.fillText(t("CROSS THE LINE", "CRUZE A LINHA"), 128, 100);
}

function drawTop(ctx: CanvasRenderingContext2D, board: BoardRowLite[], t: Tr) {
  const top = board.slice(0, 5);
  ctx.textBaseline = "middle";
  ctx.font = "14px Silkscreen, monospace";
  ctx.fillStyle = LIME;
  ctx.fillText("TOP 5 · BRASIL DRIFT", 12, 16);
  if (top.length === 0) {
    ctx.fillStyle = "#8a93a6";
    ctx.fillText(t("NOBODY YET", "NINGUÉM AINDA"), 12, 60);
  }
  top.forEach((r, i) => {
    const y = 38 + i * 20;
    ctx.fillStyle = i === 0 ? LIME : "#e8e4d8";
    ctx.textAlign = "left";
    let login = `${r.rank} @${r.login}`;
    while (ctx.measureText(login).width > 160 && login.length > 4) login = `${login.slice(0, -2)}…`;
    ctx.fillText(login, 12, y);
    ctx.textAlign = "right";
    ctx.fillText(fmt(r.score), 244, y);
  });
}

/** The track as the town sees it, on the map's own land: asphalt and the START gantry, the DRIFT sign and the top five. */
export function DriftSite({ board }: { board: BoardRowLite[] }) {
  const group = useRef<THREE.Group>(null);
  const [sx, sz] = lotToWorld(...DRIFT_SIGN_LOT);
  useFrame(({ camera }) => {
    const g = group.current;
    if (g) g.visible = Math.hypot(camera.position.x - sx, camera.position.y, camera.position.z - sz) < SITE_VIEW;
  });
  // fontReady: drawn again once Silkscreen is in.
  const fontReady = useFontReady();
  const t = useT();
  const sign = useMemo(() => {
    void fontReady;
    return signTexture((ctx) => drawSign(ctx, t));
  }, [fontReady, t]);
  const tower = useMemo(() => {
    void fontReady;
    return signTexture((ctx) => drawTop(ctx, board, t));
  }, [fontReady, board, t]);
  useEffect(() => () => sign.dispose(), [sign]);
  useEffect(() => () => tower.dispose(), [tower]);
  return (
    <group ref={group}>
      <TrackScene track={COURSE.track} lit={unlit} title="Drift" grass={false} stands={false} trees={false} walls={false} palette={NIGHT_PALETTE} />
      <Billboard position={[sx - 18, sz]} rot={0} map={sign} />
      <Billboard position={[sx + 18, sz]} rot={0} map={tower} />
    </group>
  );
}

/** The track's tag on the map, like a city's: a click drives you to its gate. */
export function DriftTag({ record, onClick }: { record: BoardRowLite | null; onClick: () => void }) {
  const [x, z] = lotToWorld(DRIFT_SIGN_LOT[0], DRIFT_SIGN_LOT[1] + 6);
  return (
    <Html position={[x, 60, z]} center zIndexRange={[20, 0]} style={{ pointerEvents: "auto" }}>
      <button type="button" onClick={onClick} className="flex cursor-pointer items-center gap-1 whitespace-nowrap border-2 border-lime bg-bg/85 px-1 py-px font-pixel text-[9px] uppercase text-cream hover:bg-lime hover:text-bg sm:gap-1.5 sm:px-1.5 sm:py-0.5 sm:text-[11px]">
        <span aria-hidden>🏁</span>Drift
        {record && <span className="normal-case text-muted">{fmt(record.score)}</span>}
      </button>
    </Html>
  );
}

// A run driven before the track went out to sea is moved over to it.
const toGhost = (frames: Frames, splits: number[]): GhostRun => ({ ms: frames[frames.length - 4] ?? 0, splits, frames: moveOldRun(frames) });

/**
 * A drift run on the town's track: the world for the Canvas and the HUD over
 * it. `start()` sets a run up, `active` mounts both; `onBack` is "back to the
 * city" (or a load that failed). Runs post to the track's board when you're
 * signed in.
 */
export function useBrasilDrift({
  active,
  viewerLogin,
  townPath,
  camera,
  onCameraToggle,
  muted,
  onToggleMute,
  touch,
  onBack,
  onReady: onWorldReady,
}: {
  active: boolean;
  viewerLogin: string | null;
  townPath: string;
  camera: DriveCameraMode;
  onCameraToggle: () => void;
  muted: boolean;
  onToggleMute: () => void;
  touch: React.MutableRefObject<TouchDrive> | null;
  onBack: () => void;
  /** The world is in (the page lifts its dark). */
  onReady?: () => void;
}) {
  const spot = BRASIL_DRIFT;
  const t = useT();
  const [telemetry] = useState(createDriftTelemetry);
  const [ready, setReady] = useState(false);
  const [paused, setPausedRaw] = useState(false);
  const [showGhosts, setShowGhosts] = useState(true);
  const [runKey, setRunKey] = useState(0);
  const respawnRef = useRef<(() => void) | null>(null);
  const [trial, setTrial] = useState<{ stage: TrialStage; at: number; beat: number }>({ stage: "menu", at: 0, beat: TRIAL.beatMs });
  const goStage = useCallback((stage: TrialStage, beat?: number) => {
    setTrial((t) => (t.stage === stage && stage !== "countdown" ? t : { stage, at: performance.now(), beat: beat ?? t.beat }));
  }, []);
  const stageNow = useRef(trial.stage);
  useEffect(() => {
    stageNow.current = trial.stage;
  }, [trial.stage]);
  // Paused in the middle of 3-2-1, the countdown starts over on the way back.
  const setPaused = useCallback(
    (on: boolean | ((v: boolean) => boolean)) => {
      setPausedRaw((v) => {
        const next = typeof on === "function" ? on(v) : on;
        if (v && !next && stageNow.current === "countdown") setTimeout(() => goStage("countdown", TRIAL.beatMs), 0);
        return next;
      });
    },
    [goStage],
  );

  // The board: the sign's top five, the results' rows, your best.
  const [board, setBoard] = useState<BoardRowLite[]>([]);
  const [serverBest, setServerBest] = useState<number | null>(null);
  const loadBoard = useCallback(() => {
    fetch(`/api/drift/${spot.id}/board`)
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: BoardRowLite[]; me: { score: number } | null }>) : null))
      .then((b) => {
        if (!b) return;
        setBoard(b.rows.map((r) => ({ rank: r.rank, login: r.login, score: r.score })));
        setServerBest(b.me?.score ?? null);
      })
      .catch(() => {
        // offline: the sign stays empty
      });
  }, [spot.id]);
  useEffect(loadBoard, [loadBoard]);
  const [local, setLocal] = useState<LocalRun | null>(null);
  useEffect(() => {
    const read = () => setLocal(loadRun(spot.id));
    read();
  }, [spot.id]);
  const best = [serverBest, local?.score ?? null].reduce<number | null>((a, b) => (b === null ? a : a === null ? b : Math.max(a, b)), null);
  const pb = useMemo(() => (local ? toGhost(local.frames, local.splits) : null), [local]);

  const [finish, setFinish] = useState<{ run: DriftFinish; before: number | null } | null>(null);
  const [post, setPost] = useState<PostState>({ status: "posting" });

  /** Starting (the gate was crossed): a fresh world on the grid, the track's card once it's in. */
  const start = useCallback(() => {
    Object.assign(telemetry, { drift: null, feed: [], split: null, countdown: null, carScreen: null });
    setReady(false);
    setPausedRaw(false);
    setFinish(null);
    setRunKey((k) => k + 1);
    setTrial({ stage: "menu", at: performance.now(), beat: TRIAL.beatMs });
    posthog.capture("brasil_drift_started", { signed_in: !!viewerLogin });
  }, [telemetry, viewerLogin]);
  // The track's card: Enter or Space drifts.
  const begin = useCallback(() => goStage("countdown", TRIAL.beatMs), [goStage]);
  useEffect(() => {
    if (!active || !ready || paused || trial.stage !== "menu") return;
    const go = (e: KeyboardEvent) => {
      if ((e.code === "Enter" || e.code === "Space") && !e.repeat) begin();
    };
    window.addEventListener("keydown", go);
    return () => window.removeEventListener("keydown", go);
  }, [active, ready, paused, trial.stage, begin]);

  const send = useCallback(
    async (run: { frames: Frames; score: number }) => {
      if (!viewerLogin) return setPost({ status: "signed-out" });
      setPost({ status: "posting" });
      const failed = () => {
        const mine = loadRun(spot.id);
        if (mine && mine.score === run.score) saveRun(spot.id, { ...mine, posted: false });
        setPost({ status: "failed" });
      };
      try {
        const res = await fetch(`/api/drift/${spot.id}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frames: run.frames, score: run.score }),
        });
        if (!res.ok) return failed();
        const result = (await res.json()) as PostResult;
        setServerBest(result.best);
        const mine = loadRun(spot.id);
        if (mine && mine.score <= result.best) saveRun(spot.id, { ...mine, posted: true });
        setPost({ status: "posted", result });
        loadBoard();
      } catch {
        failed();
      }
    },
    [viewerLogin, spot.id, loadBoard],
  );
  const onFinish = useCallback(
    (run: DriftFinish) => {
      setFinish({ run, before: best });
      posthog.capture("brasil_drift_finished", { score: run.score, best: best ?? null, signed_in: !!viewerLogin });
      const mine = loadRun(spot.id);
      if (!mine || run.score > mine.score) {
        const next = { score: run.score, frames: run.frames, splits: run.splits, posted: !!viewerLogin };
        saveRun(spot.id, next);
        setLocal(next);
      }
      void send(run);
    },
    [best, spot.id, send, viewerLogin],
  );

  const retry = useCallback(() => {
    setFinish(null);
    setPaused(false);
    Object.assign(telemetry, { drift: null, feed: [], split: null, countdown: null, carScreen: null });
    setRunKey((k) => k + 1);
    goStage("countdown", TRIAL.beatMs);
  }, [telemetry, goStage, setPaused]);

  const back = useCallback(() => {
    posthog.capture("brasil_drift_exit", { stage: stageNow.current });
    setPaused(false);
    setFinish(null);
    onBack();
  }, [onBack, setPaused]);

  // Esc: on the card, back to the city; driving, pause and resume (the results take Esc themselves).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.repeat || stageNow.current === "finish") return;
      e.preventDefault();
      if (stageNow.current === "menu") back();
      else setPaused((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, setPaused, back]);

  const readyCb = useRef(onWorldReady);
  useEffect(() => {
    readyCb.current = onWorldReady;
  });
  const onReady = useCallback(() => {
    setReady(true);
    readyCb.current?.();
  }, []);
  const toggleGhosts = useCallback(() => setShowGhosts((g) => !g), []);

  const world = active ? (
    <DriftWorld
      key={runKey}
      spot={spot}
      course={COURSE}
      title={spot.name}
      color={carColor(viewerLogin ?? "guest")}
      telemetry={telemetry}
      camera={camera}
      onCameraToggle={onCameraToggle}
      muted={muted}
      paused={paused}
      stage={trial.stage}
      stageAt={trial.at}
      beatMs={trial.beat}
      onStage={goStage}
      pb={pb}
      rival={null}
      showGhosts={showGhosts}
      onFinish={onFinish}
      onRestart={retry}
      respawnRef={respawnRef}
      onReady={onReady}
      onFail={onBack}
      touch={touch ?? undefined}
      ground={null}
      night
    />
  ) : null;

  const overlay = active ? (
    <>
      {touch && ready && (trial.stage === "countdown" || trial.stage === "run") && !paused && (
        <div className="pointer-events-none fixed inset-0 z-20 font-pixel uppercase">
          <TouchControls touchRef={touch} telemetry={telemetry} mode="drift" />
        </div>
      )}
      <DriftHud
        touch={!!touch}
        spot={spot}
        telemetry={telemetry}
        ready={ready}
        stage={trial.stage}
        paused={paused}
        muted={muted}
        showGhosts={showGhosts}
        best={best}
        boardScores={board.map((r) => r.score)}
        rival={null}
        onToggleGhosts={toggleGhosts}
        onToggleMute={onToggleMute}
        onToggleCamera={onCameraToggle}
        onPause={setPaused}
        onRestart={retry}
        onRespawn={() => respawnRef.current?.()}
        onExit={back}
        exitLabel={t("Back to the city", "Voltar pra cidade")}
      />
      {ready && trial.stage === "menu" && <TrackCard spot={spot} board={board} best={best} you={viewerLogin} onStart={begin} onBack={back} />}
      {trial.stage === "finish" && finish && (
        <TrackResults
          spot={spot}
          score={finish.run.score}
          before={finish.before}
          board={board}
          post={post}
          you={viewerLogin}
          townPath={townPath}
          onRetry={retry}
          onRetryPost={() => void send(finish.run)}
          onBack={back}
        />
      )}
    </>
  ) : null;

  return { world, overlay, board, ready, best, start };
}
