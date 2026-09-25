"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Flag, Volume2, VolumeX, X } from "lucide-react";
import { HUD_BOX } from "@/components/league/hud/shared";
import PauseMenu from "@/components/league/hud/drive/PauseMenu";
import StartScreen from "@/components/league/hud/drive/StartScreen";
import CopyLink from "@/components/league/hud/drive/CopyLink";
import type { DriveCameraMode } from "@/lib/league-city/drive/telemetry";
import { carColor, type DriverInfo } from "@/lib/league-city/drive/net";
import type { BoardRow } from "@/lib/league-city/race/board";
import { formatLap } from "@/lib/league-city/race/laps";
import type { RoomBests } from "@/lib/league-city/race/net";
import { RACE, canStart, inRace, standings } from "@/lib/league-city/race/race";
import type { LapNews, RaceTelemetry, RaceView } from "@/lib/league-city/race/telemetry";
import { theTrack } from "@/lib/league-city/race/track";

// Race track HUD. Top left: the lap clock (running, from the telemetry every
// animation frame), your last and best lap, and in a race your lap and place.
// Top right: camera, mute, exit. Right: the town's best laps (saved) and this
// session's. Bottom: speed and the boost tank. Center: the start lights, the
// wrong-way warning, and the results when a race ends.

const SEG = "flex items-center transition-colors hover:bg-white/5 [&>*]:transition-transform active:[&>*]:translate-y-px";
const ICON_BTN = `${SEG} w-10 justify-center py-2 text-cream hover:text-lime`;
const ICON = { size: 14, strokeWidth: 2.5 } as const;

export type LapFeedItem = LapNews & { at: number };

const CONTROLS: [string, string][] = [
  ["W A S D", "drive"],
  ["Space + steer", "drift (fills boost)"],
  ["Shift", "boost"],
  ["R", "back to last checkpoint"],
  ["C", "camera"],
  ["Esc", "pause"],
];

const who = (name: string) => (name.startsWith("guest-") ? "guest" : `@${name}`);

export default function RaceHud({
  townName,
  telemetry,
  ready,
  failed,
  camera,
  muted,
  paused,
  drivers,
  race,
  bests,
  board,
  feed,
  saved,
  signedIn,
  you,
  onStart,
  onResume,
  onCamera,
  onMute,
  onExit,
}: {
  townName: string;
  telemetry: RaceTelemetry;
  ready: boolean;
  failed: boolean;
  camera: DriveCameraMode;
  muted: boolean;
  paused: boolean;
  drivers: DriverInfo[];
  race: RaceView | null;
  bests: RoomBests;
  board: BoardRow[];
  feed: LapFeedItem[];
  saved: { ms: number; rank: number; at: number } | null;
  signedIn: boolean;
  /** Your name in the room. */
  you: string;
  onStart: () => void;
  onResume: () => void;
  onCamera: () => void;
  onMute: () => void;
  onExit: () => void;
}) {
  const clock = useRef<HTMLSpanElement>(null);
  const speed = useRef<HTMLSpanElement>(null);
  const tank = useRef<HTMLDivElement>(null);
  const wrong = useRef<HTMLDivElement>(null);
  const [lights, setLights] = useState(0);
  const [go, setGo] = useState(false);
  // The race timers and the feed's fading read this; it ticks once a second.
  const [now, setNow] = useState(() => Date.now());
  const [hints, setHints] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setHints(false), 8000);
    return () => clearTimeout(t);
  }, [ready]);

  const r = race?.race ?? null;
  const me = race?.you ?? null;
  const racing = !!(r && me && inRace(r, me));

  // Numbers from the telemetry every animation frame.
  useEffect(() => {
    let raf = 0;
    let lastLights = 0;
    const loop = () => {
      const now = Date.now() + telemetry.offset;
      if (clock.current) clock.current.textContent = telemetry.lapStart !== null && now >= telemetry.lapStart ? formatLap(now - telemetry.lapStart) : "-:--.---";
      if (speed.current) speed.current.textContent = String(Math.round(Math.abs(telemetry.speed) * 3.6));
      if (tank.current) {
        tank.current.style.transform = `scaleX(${telemetry.fuel})`;
        tank.current.dataset.on = String(telemetry.boosting);
      }
      if (wrong.current) wrong.current.dataset.on = String(telemetry.wrongWay);
      if (telemetry.lights !== lastLights) {
        if (lastLights === RACE.lights && telemetry.lights === 0) setGo(true);
        lastLights = telemetry.lights;
        setLights(telemetry.lights);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [telemetry]);

  useEffect(() => {
    if (!go) return;
    const t = setTimeout(() => setGo(false), 1200);
    return () => clearTimeout(t);
  }, [go]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const mine = feed.filter((f) => f.t === "void" || (f.t === "lap" && f.id === me));
  const lastLap = mine.find((f) => f.t === "lap");
  const myBest = bests.find(([n]) => n === you.toLowerCase())?.[1] ?? null;
  const serverNow = now + (race?.offset ?? 0);
  const startable = !!r && canStart(r, serverNow);
  const order = r && (r.phase === "live" || r.phase === "over") ? standings(r, race?.progress ?? {}, theTrack().length) : [];
  const place = me ? order.indexOf(me) + 1 : 0;
  const lapNow = r && me ? Math.min(RACE.laps, (r.laps[me] ?? 0) + 1) : 0;
  const recent = feed.filter((f) => now - f.at < 8000);
  const voided = recent.find((f) => f.t === "void");
  const justSaved = saved && now - saved.at < 6000 ? saved : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 font-pixel uppercase">
      {/* Lap clock */}
      {ready && (
        <div className={`${HUD_BOX} absolute left-4 top-4 min-w-[220px] px-3 py-2`}>
          <div className="flex items-baseline justify-between text-[9px] text-muted">
            <span>{racing ? `Race · lap ${lapNow}/${RACE.laps}` : "Practice"}</span>
            {racing && place > 0 && r?.phase === "live" && (
              <span className="text-lime">
                P{place}/{order.length}
              </span>
            )}
          </div>
          <span ref={clock} className="mt-1 block text-2xl text-cream tabular-nums">
            -:--.---
          </span>
          <div className="mt-1.5 flex justify-between gap-3 border-t-2 border-border pt-1.5 text-[9px] tabular-nums">
            <span className="text-muted">
              Last <span className={lastLap && lastLap.t === "lap" && !lastLap.valid ? "text-dim line-through" : "text-cream"}>{lastLap && lastLap.t === "lap" ? formatLap(lastLap.ms) : "-"}</span>
            </span>
            <span className="text-muted">
              Best <span className="text-lime">{myBest ? formatLap(myBest) : "-"}</span>
            </span>
          </div>
          {voided && <p className="mt-1.5 text-[9px] text-[#ff6b6b]">Lap doesn&apos;t count</p>}
          {justSaved && (
            <p className="mt-1.5 text-[9px] text-lime">
              Saved {formatLap(justSaved.ms)} · #{justSaved.rank} in {townName}
            </p>
          )}
          {!signedIn && <p className="mt-1.5 max-w-[200px] text-[8px] normal-case text-dim">Sign in to put your laps on the town&apos;s board.</p>}
        </div>
      )}

      {/* Top right */}
      <div className={`${HUD_BOX} absolute right-4 top-4 flex items-stretch divide-x-2 divide-border`}>
        <button type="button" onClick={onCamera} aria-label="Camera (C)" title="Camera (C)" className={ICON_BTN}>
          <Camera {...ICON} aria-hidden />
        </button>
        <button type="button" onClick={onMute} aria-label={muted ? "Sound on" : "Mute"} aria-pressed={muted} className={ICON_BTN}>
          {muted ? <VolumeX {...ICON} aria-hidden /> : <Volume2 {...ICON} aria-hidden />}
        </button>
        <button type="button" onClick={onExit} className={`${SEG} gap-2 px-3 py-2 text-[10px] text-cream hover:text-lime`}>
          <X {...ICON} aria-hidden />
          <span>Exit</span>
        </button>
      </div>

      {/* Boards and the race button */}
      {ready && (
        <div className="absolute right-4 top-20 flex w-[240px] flex-col gap-3">
          <section className={`${HUD_BOX} px-3 py-2.5`}>
            <p className="flex items-center justify-between text-[9px]">
              <span className="text-cream">{townName} best laps</span>
              <span className="text-dim">Interlagos</span>
            </p>
            <ol className="mt-2 space-y-1">
              {board.slice(0, 8).map((b) => (
                <li key={b.login} className={`flex items-center gap-2 text-[10px] ${b.login.toLowerCase() === you.toLowerCase() ? "text-lime" : "text-cream"}`}>
                  <span className="w-4 text-right text-muted">{b.rank}</span>
                  <span className="min-w-0 flex-1 truncate normal-case">@{b.login}</span>
                  <span className="tabular-nums">{formatLap(b.best_ms)}</span>
                </li>
              ))}
              {board.length === 0 && <li className="text-[9px] normal-case text-muted">No laps yet. Set the first one.</li>}
            </ol>
          </section>

          <section className={`${HUD_BOX} px-3 py-2.5`}>
            <p className="flex items-center gap-2 text-[9px] text-cream">
              <span className="h-1.5 w-1.5 animate-pulse bg-lime" aria-hidden />
              {drivers.length + 1} on track
            </p>
            {drivers.length === 0 ? (
              <div className="mt-2 flex flex-col items-start gap-1.5">
                <p className="text-[9px] normal-case text-dim">Share the link to race your team.</p>
                <CopyLink />
              </div>
            ) : (
              <ul className="mt-2 space-y-1">
                {drivers.slice(0, 6).map((d) => {
                  const b = bests.find(([n]) => n === d.name.toLowerCase())?.[1];
                  return (
                    <li key={d.id} className="flex items-center gap-1.5 text-[9px] text-muted">
                      <span className="h-2 w-2" style={{ background: carColor(d.name) }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate normal-case">{who(d.name)}</span>
                      {b && <span className="tabular-nums text-cream">{formatLap(b)}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {startable && (
              <button
                type="button"
                onClick={onStart}
                className="pointer-events-auto mt-2.5 flex w-full items-center justify-center gap-2 bg-lime px-3 py-2 text-[10px] text-bg transition-[filter] hover:brightness-110 active:translate-y-px"
              >
                <Flag {...ICON} aria-hidden />
                Start a {RACE.laps}-lap race
              </button>
            )}
            {r?.phase === "countdown" && <p className="mt-2.5 text-center text-[9px] text-lime">Grid forming…</p>}
            {r?.phase === "live" && !racing && <p className="mt-2.5 text-center text-[9px] text-muted">Race on. Next one after the flag.</p>}
          </section>

          {recent.filter((f) => f.t === "lap").length > 0 && (
            <ul className={`${HUD_BOX} space-y-1 px-3 py-2 text-[9px]`}>
              {recent.map((f, i) =>
                f.t === "lap" ? (
                  <li key={`${f.at}-${i}`} className="flex items-center gap-1.5 normal-case text-muted">
                    <span className="h-2 w-2 shrink-0" style={{ background: carColor(f.name) }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{who(f.name)}</span>
                    <span className={`tabular-nums ${f.valid ? (f.pb ? "text-lime" : "text-cream") : "text-dim line-through"}`}>{formatLap(f.ms)}</span>
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </div>
      )}

      {/* Start lights */}
      {(lights > 0 || go) && (
        <div className="absolute left-1/2 top-6 flex -translate-x-1/2 gap-3" aria-live="polite">
          {Array.from({ length: RACE.lights }, (_, i) => (
            <span
              key={i}
              className={`h-10 w-10 border-[3px] border-bg ${go ? "bg-[#1a1d24]" : i < lights ? "bg-[#ff2a2a] shadow-[0_0_24px_#ff2a2a]" : "bg-[#2a1416]"}`}
            />
          ))}
          {go && <span className="absolute left-1/2 top-14 -translate-x-1/2 text-3xl text-lime">Go</span>}
        </div>
      )}

      {/* Wrong way */}
      {ready && (
        <div
          ref={wrong}
          data-on="false"
          className="absolute left-1/2 top-[30%] -translate-x-1/2 border-[3px] border-[#ff6b6b] bg-bg/80 px-4 py-2 text-sm text-[#ff6b6b] opacity-0 transition-opacity data-[on=true]:opacity-100"
        >
          Wrong way
        </div>
      )}

      {/* Results */}
      {r?.phase === "over" && r.finished.length > 0 && serverNow - r.endsAt < 20_000 && (
        <section className={`${HUD_BOX} absolute left-1/2 top-[22%] w-[300px] -translate-x-1/2 px-4 py-3`}>
          <p className="text-center text-[10px] text-lime">Chequered flag</p>
          <ol className="mt-2 space-y-1">
            {r.finished.map((f, i) => (
              <li key={f.id} className={`flex items-center gap-2 text-[10px] ${f.id === me ? "text-lime" : "text-cream"}`}>
                <span className="w-5 text-muted">P{i + 1}</span>
                <span className="min-w-0 flex-1 truncate normal-case">{who(f.name)}</span>
                {r.penalty[f.id] ? <span className="text-[8px] text-[#ff6b6b]">+5s</span> : null}
                <span className="tabular-nums">{formatLap(f.ms)}</span>
              </li>
            ))}
            {r.grid
              .filter((id) => !r.finished.some((f) => f.id === id))
              .map((id) => (
                <li key={id} className="flex items-center gap-2 text-[10px] text-dim">
                  <span className="w-5">-</span>
                  <span className="min-w-0 flex-1 truncate normal-case">{who(r.names[id] ?? id)}</span>
                  <span>DNF</span>
                </li>
              ))}
          </ol>
        </section>
      )}

      {/* Speed and boost */}
      {ready && (
        <div className={`${HUD_BOX} absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4 px-4 py-2`}>
          <div className="flex items-baseline gap-1.5 tabular-nums">
            <span ref={speed} className="w-[3ch] text-right text-lg text-cream">
              0
            </span>
            <span className="text-[9px] text-muted">km/h</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[8px] text-muted">Boost · drift to fill</span>
            <div className="h-2.5 w-36 border-2 border-border">
              <div
                ref={tank}
                data-on="false"
                className="h-full origin-left bg-[#7ee8ff] data-[on=true]:bg-white"
                style={{ transform: "scaleX(0.3)" }}
              />
            </div>
          </div>
        </div>
      )}

      {ready && (
        <div className={`absolute bottom-6 left-6 text-[9px] leading-loose text-muted transition-opacity duration-700 ${hints ? "opacity-100" : "opacity-0"}`}>
          {CONTROLS.map(([k, v]) => (
            <div key={k}>
              <span className="text-cream">{k}</span> {v}
            </div>
          ))}
        </div>
      )}

      {failed && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg/90">
          <p className="text-xs text-cream">Couldn&apos;t start the car.</p>
          <button type="button" onClick={() => window.location.reload()} className="btn-press border-2 border-lime px-4 py-2 text-[11px] text-lime">
            Try again
          </button>
        </div>
      )}

      {/* ODbL: the layout comes from OpenStreetMap, so its credit stays on screen. */}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto absolute bottom-2 right-3 text-[8px] normal-case text-dim hover:text-muted"
      >
        Layout after Interlagos · © OpenStreetMap contributors
      </a>

      <StartScreen ready={ready} />
      {paused && ready && <PauseMenu camera={camera} muted={muted} onResume={onResume} onCamera={onCamera} onMute={onMute} onExit={onExit} />}
    </div>
  );
}
