"use client";

import "@/lib/silenceThreeClockWarning";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { THEMES, ThemeLights, type CityTheme } from "@/components/city/theme";
import { createRaceTelemetry, type LapNews, type RaceView, type RunResult, type TrialResult } from "@/lib/league-city/race/telemetry";
import RaceHud, { type LapFeedItem } from "@/components/race/RaceHud";
import { isDesktop } from "@/components/towns/useDesktop";
import type { RaceCameraMode } from "@/components/race/RaceCamera";
import type { DriverInfo } from "@/lib/league-city/drive/net";
import type { RoomBests } from "@/lib/league-city/race/net";
import type { BoardRow } from "@/lib/league-city/race/board";
import { pointAt, theTrack } from "@/lib/league-city/race/track";
import { M_TO_UNIT } from "@/lib/league-city/drive/tuning";
import { TRIAL, pickRival, runCounts, type TrialStage } from "@/lib/league-city/race/trial";
import type { GhostRun } from "@/lib/league-city/race/ghost";

// The town's race track: one Canvas in daylight (read at a glance from the
// high camera), the track and the race room (RaceWorld, loaded on the client
// only), and the race HUD.

const RaceWorld = dynamic(() => import("@/components/race/RaceWorld"), { ssr: false, loading: () => null });

const MUTE_KEY = "gc:drive-muted";
const totalKey = (slug: string) => `gc:race-total:${slug}`;


// A clear afternoon: blue sky, warm sun, soft fill, no fog to speak of.
const DAY: CityTheme = {
  ...THEMES[0],
  sky: [
    [0, "#2f7fd6"],
    [0.35, "#6fb2ec"],
    [0.5, "#cfe7f8"],
    [0.52, "#e8f3fb"],
    [1, "#e8f3fb"],
  ],
  fogColor: "#cfe7f8",
  fogNear: 900,
  fogFar: 4500,
  ambientColor: "#ffffff",
  ambientIntensity: 0.55,
  sunColor: "#fff1d6",
  sunIntensity: 0.95,
  sunPos: [300, 400, 200],
  fillColor: "#bcd8ff",
  fillIntensity: 0.3,
  fillPos: [-200, 150, -200],
  hemiSky: "#cfe7ff",
  hemiGround: "#5d8a45",
  hemiIntensity: 0.35,
};
const DAY_KEY = 21;
const EXPOSURE = 1.0;

export default function RaceClient({
  slug,
  townName,
  viewerLogin,
  board: initialBoard,
  week: initialWeek,
  lastWinner,
  ghosts: initialGhosts,
  members,
}: {
  slug: string;
  townName: string;
  viewerLogin: string | null;
  board: BoardRow[];
  /** This week's board (the season) and last week's winner. */
  week: BoardRow[];
  lastWinner: BoardRow | null;
  /** Logins with a ghost to race. */
  ghosts: string[];
  /** The town's members, for the drivers list. */
  members: { login: string; avatar_url: string | null }[];
}) {
  const router = useRouter();
  const track = useMemo(() => theTrack(), []);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    // Known only in the browser; null until then, so neither screen flashes.
    const check = () => setDesktop(isDesktop());
    check();
  }, []);

  const [telemetry] = useState(createRaceTelemetry);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [camera, setCamera] = useState<RaceCameraMode>("high");
  const [ghostMs, setGhostMs] = useState<number | null>(null);
  const [run, setRun] = useState<TrialResult | null>(null);
  // Title → flyover → countdown → run → finish; R goes back to a short countdown.
  const [trial, setTrial] = useState<{ stage: TrialStage; at: number; beat: number }>({
    stage: "menu",
    at: 0,
    beat: TRIAL.beatMs,
  });
  // After the line: 0 FINISH, 1 banner gone, 2 results in.
  const [finishBeat, setFinishBeat] = useState(0);
  const goStage = useCallback((stage: TrialStage, beat?: number) => {
    setFinishBeat(0);
    setTrial((t) =>
      t.stage === stage && stage !== "countdown" ? t : { stage, at: performance.now(), beat: beat ?? t.beat },
    );
  }, []);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [race, setRace] = useState<RaceView | null>(null);
  const [bests, setBests] = useState<RoomBests>([]);
  const [board, setBoard] = useState(initialBoard);
  const [week, setWeek] = useState(initialWeek);
  const [ghosts, setGhosts] = useState(initialGhosts);
  // Your rival: the ghost you asked for (?ghost=, the leaderboard), else pickRival's.
  const [asked, setAsked] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setAsked(new URLSearchParams(window.location.search).get("ghost"));
    read();
  }, []);
  const [rival, setRival] = useState<{ login: string; run: GhostRun } | null>(null);
  const recentLaps = useRef<GhostRun[]>([]);
  const menuRef = useRef<(() => void) | null>(null);
  const introSeen = useRef(false);
  const [feed, setFeed] = useState<LapFeedItem[]>([]);
  const [saved, setSaved] = useState<{ ms: number; rank: number; improved: boolean; at: number } | null>(null);
  const startRef = useRef<(() => void) | null>(null);
  const restartRef = useRef<(() => void) | null>(null);
  const [guest] = useState(() => `guest-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`);
  const name = viewerLogin ?? guest;
  const rivalLogin = pickRival(board, name, ghosts, asked);
  useEffect(() => {
    if (!rivalLogin) {
      const clear = () => setRival(null);
      clear();
      return;
    }
    let live = true;
    fetch(`/api/towns/${slug}/race/ghost?login=${encodeURIComponent(rivalLogin)}`)
      .then((r) => (r.ok ? (r.json() as Promise<GhostRun & { login: string }>) : null))
      .then((g) => {
        if (live) setRival(g ? { login: g.login, run: g } : null);
      })
      .catch(() => {
        // offline: race your own ghost only
      });
    return () => {
      live = false;
    };
  }, [rivalLogin, slug]);

  useEffect(() => {
    const read = () => {
      try {
        setMuted(localStorage.getItem(MUTE_KEY) === "1");
      } catch {
        // storage blocked: sound stays on
      }
    };
    read();
  }, []);
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
  const toggleCamera = useCallback(() => setCamera((c) => (c === "high" ? "close" : "high")), []);
  // Leaving shows a screen at once and stops the car: the town takes a few seconds to load.
  const [leaving, setLeaving] = useState(false);
  const exit = useCallback(() => {
    setLeaving(true);
    router.push(`/town/${slug}`);
  }, [router, slug]);
  useEffect(() => router.prefetch(`/town/${slug}`), [router, slug]);

  // Past the line the autopilot has the car, so R (again) and M (menu) come from here.
  useEffect(() => {
    if (trial.stage !== "finish") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "KeyR") restartRef.current?.();
      if (e.code === "KeyM") menuRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    const t1 = setTimeout(() => setFinishBeat(1), TRIAL.bannerMs);
    const t2 = setTimeout(() => setFinishBeat(2), TRIAL.resultsMs);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [trial.stage]);

  // Time trial from the menu: the flyover the first time (any key skips it), then straight to 3-2-1.
  const begin = useCallback(() => {
    if (introSeen.current) return goStage("countdown", TRIAL.beatMs);
    introSeen.current = true;
    goStage("intro");
  }, [goStage]);
  /** Race a driver's ghost from the leaderboard: they become your rival, and the run starts. */
  const raceGhost = useCallback(
    (login: string) => {
      setAsked(login);
      begin();
    },
    [begin],
  );
  const toMenu = useCallback(() => {
    setPaused(false);
    menuRef.current?.();
  }, []);
  useEffect(() => {
    if (!ready || paused) return;
    if (trial.stage === "intro") {
      const skip = (e: KeyboardEvent) => {
        if (e.key !== "Escape" && !e.repeat) goStage("countdown", TRIAL.beatMs);
      };
      window.addEventListener("keydown", skip);
      const t = setTimeout(() => goStage("countdown", TRIAL.beatMs), TRIAL.introMs);
      return () => {
        window.removeEventListener("keydown", skip);
        clearTimeout(t);
      };
    }
  }, [ready, paused, trial.stage, goStage]);

  const onRun = useCallback(
    (r: RunResult | null) => {
      if (!r) return setRun(null);
      let prevBest: number | null = null;
      try {
        const v = Number(localStorage.getItem(totalKey(slug)));
        prevBest = v > 0 ? v : null;
      } catch {
        // storage blocked: every run is a first
      }
      const record = runCounts(r.laps) && (prevBest === null || r.total < prevBest);
      if (record) {
        try {
          localStorage.setItem(totalKey(slug), String(r.total));
        } catch {
          // storage blocked
        }
      }
      setRun({ ...r, prevBest, record });
    },
    [slug],
  );

  // Esc pauses; Esc again on the pause menu leaves the track.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || leaving) return;
      e.preventDefault();
      if (paused) exit();
      else setPaused(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, exit, leaving]);

  const onLap = useCallback((e: LapNews) => {
    const at = Date.now();
    setFeed((f) => [{ ...e, at }, ...f].slice(0, 5));
  }, []);

  const boardRef = useRef(board);
  useEffect(() => {
    boardRef.current = board;
  }, [board]);
  const onReceipt = useCallback(
    async (token: string) => {
      // The lap's path goes along when it beats your best on the board (the receipt says its time).
      let ghost: GhostRun | null = null;
      try {
        const ms = (JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { ms: number }).ms;
        const mine = boardRef.current.find((b) => b.login.toLowerCase() === name.toLowerCase())?.best_ms ?? Infinity;
        const lap = recentLaps.current.find((g) => Math.abs(g.ms - ms) < 600);
        if (lap && ms < mine) ghost = { ...lap, ms };
      } catch {
        // an odd token: the lap goes without its ghost
      }
      try {
        const res = await fetch(`/api/towns/${slug}/race/lap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, ghost }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          best_ms: number;
          improved: boolean;
          rank: number;
          ghost_saved: boolean;
          board: BoardRow[];
          week: BoardRow[];
        };
        setBoard(data.board);
        setWeek(data.week);
        if (data.ghost_saved) setGhosts((g) => (g.some((x) => x.toLowerCase() === name.toLowerCase()) ? g : [...g, name]));
        if (data.improved) setSaved({ ms: data.best_ms, rank: data.rank, improved: true, at: Date.now() });
      } catch {
        // offline: the lap still showed in the feed
      }
    },
    [slug, name],
  );

  const onReady = useCallback(() => setReady(true), []);
  const onFail = useCallback(() => setFailed(true), []);

  // First frame: the camera over the grid, looking down the straight.
  const start = pointAt(track, -30);
  const look = pointAt(track, 20);

  if (desktop === false) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-bg px-6 text-center font-pixel uppercase">
        <p className="text-xs text-cream">The race track needs a keyboard or a gamepad.</p>
        <p className="text-[10px] normal-case text-muted">Open it on a computer to race.</p>
        <button type="button" onClick={exit} className="btn-press border-2 border-lime px-4 py-2 text-[11px] text-lime">
          Back to {townName}
        </button>
      </div>
    );
  }

  return (
    <>
      <Canvas
        shadows={false}
        dpr={[1, 1.5]}
        camera={{
          position: [(start.x - start.tx * 10) * M_TO_UNIT, 40, (start.z - start.tz * 10) * M_TO_UNIT],
          fov: 60,
          near: 2,
          far: 8000,
        }}
        onCreated={({ camera: c }) => c.lookAt(look.x * M_TO_UNIT, 0, look.z * M_TO_UNIT)}
        gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: EXPOSURE }}
        style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh" }}
      >
        <fog attach="fog" args={[DAY.fogColor, DAY.fogNear, DAY.fogFar]} />
        <ThemeLights theme={DAY} themeIndex={DAY_KEY} />
        {desktop && !failed && (
          <RaceWorld
            track={track}
            slug={slug}
            title={`${townName} GP`}
            name={name}
            telemetry={telemetry}
            camera={camera}
            onCameraToggle={toggleCamera}
            muted={muted || leaving}
            paused={paused || leaving}
            onReady={onReady}
            onFail={onFail}
            onDrivers={setDrivers}
            onRace={setRace}
            onLap={onLap}
            onBests={setBests}
            onReceipt={onReceipt}
            startRef={startRef}
            onGhost={setGhostMs}
            restartRef={restartRef}
            onRun={onRun}
            stage={trial.stage}
            stageAt={trial.at}
            beatMs={trial.beat}
            onStage={goStage}
            frameLeft={trial.stage === "finish" && finishBeat === 2}
            rival={rival}
            recentLaps={recentLaps}
            menuRef={menuRef}
          />
        )}
      </Canvas>
      <RaceHud
        slug={slug}
        townName={townName}
        telemetry={telemetry}
        ready={ready}
        failed={failed}
        camera={camera}
        muted={muted}
        paused={paused}
        leaving={leaving}
        drivers={drivers}
        race={race}
        bests={bests}
        board={board}
        feed={feed}
        saved={saved}
        signedIn={!!viewerLogin}
        ghostMs={ghostMs}
        run={run}
        stage={trial.stage}
        finishBeat={finishBeat}
        onBegin={begin}
        onMenu={toMenu}
        onRaceGhost={raceGhost}
        week={week}
        lastWinner={lastWinner}
        ghosts={ghosts}
        members={members}
        rival={rival ? { login: rival.login, ms: rival.run.ms } : null}
        you={name}
        onStart={() => startRef.current?.()}
        onRestart={() => restartRef.current?.()}
        onResume={() => setPaused(false)}
        onCamera={toggleCamera}
        onMute={toggleMute}
        onExit={exit}
      />
    </>
  );
}
