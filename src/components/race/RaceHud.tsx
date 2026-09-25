"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Flag, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { HUD_BOX } from "@/components/league/hud/shared";
import PauseMenu from "@/components/league/hud/drive/PauseMenu";
import StartScreen from "@/components/league/hud/drive/StartScreen";
import CopyLink from "@/components/league/hud/drive/CopyLink";
import type { RaceCameraMode } from "./RaceCamera";
import Minimap from "./Minimap";
import { TURBO } from "@/lib/league-city/drive/tuning";
import { carColor, type DriverInfo } from "@/lib/league-city/drive/net";
import type { BoardRow } from "@/lib/league-city/race/board";
import { MEDALS, MEDAL_COLORS, medalFor } from "@/lib/league-city/race/ghost";
import { formatLap } from "@/lib/league-city/race/laps";
import type { RoomBests } from "@/lib/league-city/race/net";
import { RACE, canStart, inRace, standings } from "@/lib/league-city/race/race";
import type { LapNews, RaceTelemetry, RaceView } from "@/lib/league-city/race/telemetry";
import { theTrack } from "@/lib/league-city/race/track";

// Race track HUD, after Trackmania. Top center: the lap clock, and under it
// how you stand against your best lap at each split (green ahead, red
// behind). Top left: your best, the medals and the town record. Top right:
// camera, sound, exit, the town's board and who's on track. Bottom: speed and
// the mini-turbo charge. Center: start lights, wrong way, race results.

const SEG =
  "flex items-center transition-colors hover:bg-white/5 [&>*]:transition-transform active:[&>*]:translate-y-px";
const ICON_BTN = `${SEG} w-10 justify-center py-2 text-cream hover:text-lime`;
const ICON = { size: 14, strokeWidth: 2.5 } as const;

export type LapFeedItem = LapNews & { at: number };

const CONTROLS: [string, string][] = [
  ["W A S D", "drive"],
  ["Hold Space + steer", "drift, let go for a turbo"],
  ["R", "restart"],
  ["C", "camera"],
  ["Esc", "pause"],
];

const who = (name: string) => (name.startsWith("guest-") ? "guest" : `@${name}`);
const signed = (ms: number) => `${ms < 0 ? "-" : "+"}${(Math.abs(ms) / 1000).toFixed(3)}`;

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
  ghostMs,
  you,
  onStart,
  onRestart,
  onResume,
  onCamera,
  onMute,
  onExit,
}: {
  townName: string;
  telemetry: RaceTelemetry;
  ready: boolean;
  failed: boolean;
  camera: RaceCameraMode;
  muted: boolean;
  paused: boolean;
  drivers: DriverInfo[];
  race: RaceView | null;
  bests: RoomBests;
  board: BoardRow[];
  feed: LapFeedItem[];
  saved: { ms: number; rank: number; at: number } | null;
  signedIn: boolean;
  /** Your best lap in this browser (the ghost's), ms. */
  ghostMs: number | null;
  you: string;
  onStart: () => void;
  onRestart: () => void;
  onResume: () => void;
  onCamera: () => void;
  onMute: () => void;
  onExit: () => void;
}) {
  const clock = useRef<HTMLSpanElement>(null);
  const speed = useRef<HTMLSpanElement>(null);
  const split = useRef<HTMLSpanElement>(null);
  const pips = useRef<(HTMLSpanElement | null)[]>([]);
  const turbo = useRef<HTMLSpanElement>(null);
  const flash = useRef<HTMLSpanElement>(null);
  const wrong = useRef<HTMLDivElement>(null);
  const [lights, setLights] = useState(0);
  const [go, setGo] = useState(false);
  // The race timers and the feed's fading read this; it ticks once a second.
  const [now, setNow] = useState(() => Date.now());
  const [hints, setHints] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setHints(false), 10000);
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
      const t = Date.now() + telemetry.offset;
      if (clock.current)
        clock.current.textContent =
          telemetry.lapStart !== null && t >= telemetry.lapStart
            ? formatLap(t - telemetry.lapStart)
            : "0:00.000";
      if (speed.current)
        speed.current.textContent = String(Math.round(Math.abs(telemetry.speed) * 3.6));
      if (split.current) {
        const sp = telemetry.split;
        const on = !!sp && performance.now() - sp.at < 2500;
        split.current.dataset.on = String(on);
        if (sp && on) {
          split.current.textContent = signed(sp.delta);
          split.current.dataset.ahead = String(sp.delta <= 0);
        }
      }
      pips.current.forEach((p, i) => {
        if (p)
          p.style.background =
            telemetry.driftLevel > i ? TURBO.colors[telemetry.driftLevel] : "transparent";
      });
      if (turbo.current) turbo.current.dataset.on = String(telemetry.turbo);
      if (flash.current) {
        const f = telemetry.turboFlash;
        const age = f ? performance.now() - f.at : Infinity;
        flash.current.style.opacity = age < 700 ? String(1 - age / 700) : "0";
        if (f && age < 700) {
          flash.current.style.color = TURBO.colors[f.level];
          flash.current.style.transform = `translateX(-50%) scale(${1 + f.level * 0.15 + (1 - age / 700) * 0.4})`;
        }
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

  const serverNow = now + (race?.offset ?? 0);
  const startable = !!r && canStart(r, serverNow);
  const order =
    r && (r.phase === "live" || r.phase === "over")
      ? standings(r, race?.progress ?? {}, theTrack().length)
      : [];
  const place = me ? order.indexOf(me) + 1 : 0;
  const lapNow = r && me ? Math.min(RACE.laps, (r.laps[me] ?? 0) + 1) : 0;
  const recent = feed.filter((f) => now - f.at < 8000);
  const voided = recent.find((f) => f.t === "void");
  const justSaved = saved && now - saved.at < 6000 ? saved : null;
  const roomBest = bests.find(([n]) => n === you.toLowerCase())?.[1] ?? null;
  const boardBest = board.find((b) => b.login.toLowerCase() === you.toLowerCase())?.best_ms ?? null;
  const pb = [ghostMs, roomBest, boardBest].reduce<number | null>(
    (a, b) => (b === null ? a : a === null ? b : Math.min(a, b)),
    null,
  );
  const medal = medalFor(pb);
  const record = board[0] ?? null;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 font-pixel uppercase">
      {/* Clock and split */}
      {ready && (
        <div className="absolute left-1/2 top-4 flex -translate-x-1/2 flex-col items-center gap-1.5">
          <div className={`${HUD_BOX} flex flex-col items-center px-5 py-2`}>
            <span className="text-[9px] text-muted">
              {racing ? `Race · lap ${lapNow}/${RACE.laps}` : "Time trial"}
              {racing && place > 0 && r?.phase === "live" && (
                <span className="text-lime">
                  {" "}
                  · P{place}/{order.length}
                </span>
              )}
            </span>
            <span ref={clock} className="text-3xl text-cream tabular-nums">
              0:00.000
            </span>
          </div>
          <span
            ref={split}
            data-on="false"
            data-ahead="true"
            className="border-[3px] border-bg px-3 py-1 text-base text-white tabular-nums opacity-0 transition-opacity data-[ahead=false]:bg-[#e0323c] data-[ahead=true]:bg-[#1f9d55] data-[on=true]:opacity-100"
          />
          {voided && (
            <span className={`${HUD_BOX} px-3 py-1 text-[10px] text-[#ff6b6b]`}>
              Lap doesn&apos;t count
            </span>
          )}
          {justSaved && (
            <span className={`${HUD_BOX} px-3 py-1 text-[10px] text-lime`}>
              New best {formatLap(justSaved.ms)} · #{justSaved.rank} in {townName}
            </span>
          )}
          {(lights > 0 || go) && (
            <div className="mt-2 flex gap-2" aria-live="polite">
              {Array.from({ length: RACE.lights }, (_, i) => (
                <span
                  key={i}
                  className={`h-9 w-9 border-[3px] border-bg ${go ? "bg-[#1a1d24]" : i < lights ? "bg-[#ff2a2a] shadow-[0_0_24px_#ff2a2a]" : "bg-[#2a1416]"}`}
                />
              ))}
            </div>
          )}
          {go && <span className="text-4xl text-lime drop-shadow-[0_2px_0_#000]">Go</span>}
        </div>
      )}

      {/* Your best, the medals and the map */}
      {ready && (
        <div className="absolute left-4 top-4 flex w-[210px] flex-col gap-3">
          <section className={`${HUD_BOX} px-3 py-2.5`}>
            <p className="flex items-baseline justify-between text-[9px] text-muted">
              <span>Your best</span>
              <span className="text-sm text-cream tabular-nums">
                {pb !== null ? formatLap(pb) : "-:--.---"}
              </span>
            </p>
            <ul className="mt-2 space-y-1 border-t-2 border-border pt-2">
              {MEDALS.map(([m, t]) => {
                const got = pb !== null && pb <= t;
                return (
                  <li
                    key={m}
                    className={`flex items-center gap-2 text-[10px] ${got ? "text-cream" : "text-dim"}`}
                  >
                    <span
                      className="h-3 w-3 border-2"
                      style={{
                        borderColor: MEDAL_COLORS[m],
                        background: got ? MEDAL_COLORS[m] : "transparent",
                      }}
                      aria-hidden
                    />
                    <span className="flex-1">{m}</span>
                    <span className="tabular-nums">{formatLap(t)}</span>
                  </li>
                );
              })}
              <li className="flex items-center gap-2 pt-1 text-[10px] text-lime">
                <Flag size={11} strokeWidth={2.5} aria-hidden />
                <span className="min-w-0 flex-1 truncate normal-case">
                  {record ? `@${record.login}` : "Town record"}
                </span>
                <span className="tabular-nums">{record ? formatLap(record.best_ms) : "-"}</span>
              </li>
            </ul>
            {medal && (
              <p className="mt-2 text-[9px] normal-case" style={{ color: MEDAL_COLORS[medal] }}>
                You hold {medal}.
              </p>
            )}
            {!signedIn && (
              <p className="mt-2 text-[8px] normal-case text-dim">
                Sign in to put your laps on the town&apos;s board.
              </p>
            )}
          </section>
          <div className={`${HUD_BOX} flex justify-center p-2`}>
            <Minimap telemetry={telemetry} />
          </div>
        </div>
      )}

      {/* Top right */}
      <div
        className={`${HUD_BOX} absolute right-4 top-4 flex items-stretch divide-x-2 divide-border`}
      >
        <button
          type="button"
          onClick={onCamera}
          aria-label="Camera (C)"
          title="Camera (C)"
          className={ICON_BTN}
        >
          <Camera {...ICON} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onMute}
          aria-label={muted ? "Sound on" : "Mute"}
          aria-pressed={muted}
          className={ICON_BTN}
        >
          {muted ? <VolumeX {...ICON} aria-hidden /> : <Volume2 {...ICON} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={onExit}
          className={`${SEG} gap-2 px-3 py-2 text-[10px] text-cream hover:text-lime`}
        >
          <X {...ICON} aria-hidden />
          <span>Exit</span>
        </button>
      </div>

      {ready && (
        <div className="absolute right-4 top-20 flex w-[230px] flex-col gap-3">
          <section className={`${HUD_BOX} px-3 py-2.5`}>
            <p className="text-[9px] text-cream">{townName} best laps</p>
            <ol className="mt-2 space-y-1">
              {board.slice(0, 8).map((b) => (
                <li
                  key={b.login}
                  className={`flex items-center gap-2 text-[10px] ${b.login.toLowerCase() === you.toLowerCase() ? "text-lime" : "text-cream"}`}
                >
                  <span className="w-4 text-right text-muted">{b.rank}</span>
                  <span className="min-w-0 flex-1 truncate normal-case">@{b.login}</span>
                  <span className="tabular-nums">{formatLap(b.best_ms)}</span>
                </li>
              ))}
              {board.length === 0 && (
                <li className="text-[9px] normal-case text-muted">
                  No laps yet. Set the first one.
                </li>
              )}
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
                      <span
                        className="h-2 w-2"
                        style={{ background: carColor(d.name) }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate normal-case">{who(d.name)}</span>
                      {b && <span className="tabular-nums text-cream">{formatLap(b)}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {startable && drivers.length > 0 && (
              <button
                type="button"
                onClick={onStart}
                className="pointer-events-auto mt-2.5 flex w-full items-center justify-center gap-2 bg-lime px-3 py-2 text-[10px] text-bg transition-[filter] hover:brightness-110 active:translate-y-px"
              >
                <Flag {...ICON} aria-hidden />
                Race them · {RACE.laps} laps
              </button>
            )}
            {r?.phase === "countdown" && (
              <p className="mt-2.5 text-center text-[9px] text-lime">Grid forming…</p>
            )}
            {r?.phase === "live" && !racing && (
              <p className="mt-2.5 text-center text-[9px] text-muted">
                Race on. Next one after the flag.
              </p>
            )}
          </section>

          {recent.some((f) => f.t === "lap") && (
            <ul className={`${HUD_BOX} space-y-1 px-3 py-2 text-[9px]`}>
              {recent.map((f, i) =>
                f.t === "lap" ? (
                  <li
                    key={`${f.at}-${i}`}
                    className="flex items-center gap-1.5 normal-case text-muted"
                  >
                    <span
                      className="h-2 w-2 shrink-0"
                      style={{ background: carColor(f.name) }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{who(f.name)}</span>
                    <span
                      className={`tabular-nums ${f.valid ? (f.pb ? "text-lime" : "text-cream") : "text-dim line-through"}`}
                    >
                      {formatLap(f.ms)}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </div>
      )}

      {/* Wrong way */}
      {ready && (
        <div
          ref={wrong}
          data-on="false"
          className="absolute left-1/2 top-[40%] -translate-x-1/2 border-[3px] border-[#ff6b6b] bg-bg/80 px-4 py-2 text-sm text-[#ff6b6b] opacity-0 transition-opacity data-[on=true]:opacity-100"
        >
          Wrong way
        </div>
      )}

      {/* Results */}
      {r?.phase === "over" && r.finished.length > 0 && serverNow - r.endsAt < 20_000 && (
        <section
          className={`${HUD_BOX} absolute left-1/2 top-[30%] w-[300px] -translate-x-1/2 px-4 py-3`}
        >
          <p className="text-center text-[10px] text-lime">Chequered flag</p>
          <ol className="mt-2 space-y-1">
            {r.finished.map((f, i) => (
              <li
                key={f.id}
                className={`flex items-center gap-2 text-[10px] ${f.id === me ? "text-lime" : "text-cream"}`}
              >
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
                  <span className="min-w-0 flex-1 truncate normal-case">
                    {who(r.names[id] ?? id)}
                  </span>
                  <span>DNF</span>
                </li>
              ))}
          </ol>
        </section>
      )}

      {/* Mini-turbo fired */}
      <span
        ref={flash}
        className="absolute bottom-24 left-1/2 text-3xl opacity-0 drop-shadow-[0_3px_0_#000]"
        style={{ transform: "translateX(-50%)" }}
        aria-hidden
      >
        Turbo!
      </span>

      {/* Speed and mini-turbo */}
      {ready && (
        <div
          className={`${HUD_BOX} absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4 px-4 py-2`}
        >
          <div className="flex items-baseline gap-1.5 tabular-nums">
            <span ref={speed} className="w-[3ch] text-right text-lg text-cream">
              0
            </span>
            <span className="text-[9px] text-muted">km/h</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span
                ref={turbo}
                data-on="false"
                className="w-10 text-[9px] text-cream data-[on=true]:text-lime"
              >
                Turbo
              </span>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  ref={(el) => void (pips.current[i] = el)}
                  className="h-3 w-5 border-2 border-border"
                />
              ))}
            </div>
            <span className="text-[8px] normal-case text-muted">
              Drift to charge, let go to fire
            </span>
          </div>
        </div>
      )}

      {ready && (
        <div
          className={`${HUD_BOX} absolute bottom-4 right-4 px-3 py-2 text-right text-[9px] leading-loose text-muted transition-opacity duration-700 ${hints ? "opacity-100" : "opacity-0"}`}
        >
          {CONTROLS.map(([k, v]) => (
            <div key={k}>
              <span className="text-cream">{k}</span> {v}
            </div>
          ))}
        </div>
      )}
      {ready && !hints && (
        <button
          type="button"
          onClick={onRestart}
          className={`${HUD_BOX} absolute bottom-4 right-4 flex items-center gap-2.5 px-3 py-2 text-[11px] text-cream transition-colors hover:text-lime`}
        >
          <span className="border-2 border-lime px-1.5 text-lime">R</span>
          <RotateCcw size={13} strokeWidth={2.5} aria-hidden />
          {racing ? "Last checkpoint" : "Restart"}
        </button>
      )}

      {failed && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg/90">
          <p className="text-xs text-cream">Couldn&apos;t start the car.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-press border-2 border-lime px-4 py-2 text-[11px] text-lime"
          >
            Try again
          </button>
        </div>
      )}

      <StartScreen ready={ready} />
      {paused && ready && (
        <PauseMenu
          camera={camera === "high" ? "top" : "chase"}
          muted={muted}
          onResume={onResume}
          onCamera={onCamera}
          onMute={onMute}
          onExit={onExit}
        />
      )}
    </div>
  );
}
