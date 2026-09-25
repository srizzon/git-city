"use client";

import "@/lib/silenceThreeClockWarning";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { ThemeLights } from "@/components/city/theme";
import ThemeSkyFX from "@/components/ThemeSkyFX";
import { EXPOSURE, townTheme } from "@/components/league/townTheme";
import { createRaceTelemetry, type LapNews, type RaceView } from "@/lib/league-city/race/telemetry";
import RaceHud, { type LapFeedItem } from "@/components/race/RaceHud";
import { isDesktop } from "@/components/towns/useDesktop";
import type { DriveCameraMode } from "@/lib/league-city/drive/telemetry";
import type { DriverInfo } from "@/lib/league-city/drive/net";
import type { RoomBests } from "@/lib/league-city/race/net";
import type { BoardRow } from "@/lib/league-city/race/board";
import { pointAt, theTrack } from "@/lib/league-city/race/track";
import { M_TO_UNIT } from "@/lib/league-city/drive/tuning";

// The town's race track: one Canvas with the town's sky, the track and the
// race room (RaceWorld, loaded on the client only), and the race HUD.

const RaceWorld = dynamic(() => import("@/components/race/RaceWorld"), { ssr: false, loading: () => null });

const MUTE_KEY = "gc:drive-muted";

export default function RaceClient({
  slug,
  townName,
  sky,
  viewerLogin,
  board: initialBoard,
}: {
  slug: string;
  townName: string;
  sky: number;
  viewerLogin: string | null;
  board: BoardRow[];
}) {
  const router = useRouter();
  const track = useMemo(() => theTrack(), []);
  const { theme, key: themeKey, fx } = townTheme(sky);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    // Known only in the browser; null until then, so neither screen flashes.
    const check = () => setDesktop(isDesktop());
    check();
  }, []);

  const [telemetry] = useState(createRaceTelemetry);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [camera, setCamera] = useState<DriveCameraMode>("chase");
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [race, setRace] = useState<RaceView | null>(null);
  const [bests, setBests] = useState<RoomBests>([]);
  const [board, setBoard] = useState(initialBoard);
  const [feed, setFeed] = useState<LapFeedItem[]>([]);
  const [saved, setSaved] = useState<{ ms: number; rank: number; improved: boolean; at: number } | null>(null);
  const startRef = useRef<(() => void) | null>(null);
  const [guest] = useState(() => `guest-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`);
  const name = viewerLogin ?? guest;

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
  const toggleCamera = useCallback(() => setCamera((c) => (c === "chase" ? "top" : "chase")), []);
  const exit = useCallback(() => router.push(`/town/${slug}`), [router, slug]);

  // Esc pauses; Esc again on the pause menu leaves the track.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (paused) exit();
      else setPaused(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, exit]);

  const onLap = useCallback((e: LapNews) => {
    const at = Date.now();
    setFeed((f) => [{ ...e, at }, ...f].slice(0, 5));
  }, []);

  const onReceipt = useCallback(
    async (token: string) => {
      try {
        const res = await fetch(`/api/towns/${slug}/race/lap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { best_ms: number; improved: boolean; rank: number; board: BoardRow[] };
        setBoard(data.board);
        if (data.improved) setSaved({ ms: data.best_ms, rank: data.rank, improved: true, at: Date.now() });
      } catch {
        // offline: the lap still showed in the feed
      }
    },
    [slug],
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
          near: 1,
          far: 12000,
        }}
        onCreated={({ camera: c }) => c.lookAt(look.x * M_TO_UNIT, 0, look.z * M_TO_UNIT)}
        gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: EXPOSURE }}
        style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh" }}
      >
        <fog attach="fog" args={[theme.fogColor, theme.fogNear * 2, theme.fogFar * 1.2]} />
        <ThemeLights theme={theme} themeIndex={themeKey} />
        <ThemeSkyFX themeIndex={fx} theme={theme} lowSky />
        {desktop && !failed && (
          <RaceWorld
            track={track}
            slug={slug}
            title={`${townName} GP`}
            name={name}
            telemetry={telemetry}
            camera={camera}
            onCameraToggle={toggleCamera}
            muted={muted}
            paused={paused}
            onReady={onReady}
            onFail={onFail}
            onDrivers={setDrivers}
            onRace={setRace}
            onLap={onLap}
            onBests={setBests}
            onReceipt={onReceipt}
            startRef={startRef}
          />
        )}
      </Canvas>
      <RaceHud
        townName={townName}
        telemetry={telemetry}
        ready={ready}
        failed={failed}
        camera={camera}
        muted={muted}
        paused={paused}
        drivers={drivers}
        race={race}
        bests={bests}
        board={board}
        feed={feed}
        saved={saved}
        signedIn={!!viewerLogin}
        you={name}
        onStart={() => startRef.current?.()}
        onResume={() => setPaused(false)}
        onCamera={toggleCamera}
        onMute={toggleMute}
        onExit={exit}
      />
    </>
  );
}
