"use client";

import { useEffect } from "react";
import { Check, Flag, RotateCcw } from "lucide-react";
import { carColor, type DriverInfo } from "@/lib/league-city/drive/net";
import { formatLap } from "@/lib/league-city/race/laps";
import { RACE, type RaceState } from "@/lib/league-city/race/race";

// The live race around a race: who's ready for the next one and when it
// starts (the menu and the HUD's side panel), and the results after it.

const who = (name: string) => (name.startsWith("guest-") ? "guest" : `@${name}`);

/** Everyone on the track, you first, with who's ready; your Ready button; what happens next. */
export function LobbyStatus({
  race,
  me,
  you,
  drivers,
  serverNow,
  onReady,
  big = false,
}: {
  race: RaceState | null;
  /** Your connection id (null until the room answers). */
  me: string | null;
  /** Your name. */
  you: string;
  drivers: DriverInfo[];
  serverNow: number;
  onReady: (on: boolean) => void;
  /** The menu's panel: larger type. */
  big?: boolean;
}) {
  const r = race;
  const ready = new Set(r?.ready ?? []);
  const mineReady = !!me && ready.has(me);
  const running = r?.phase === "countdown" || r?.phase === "live";
  const inIt = !!me && !!r && r.grid.includes(me) && running;
  const rows = [{ id: me ?? "you", name: you, self: true }, ...drivers.map((d) => ({ id: d.id, name: d.name, self: false }))];
  const readyCount = rows.filter((x) => ready.has(x.id)).length;
  const left = r && r.lobbyStartsAt > 0 ? Math.max(0, Math.ceil((r.lobbyStartsAt - serverNow) / 1000)) : null;
  const text = big ? "text-xs" : "text-[9px]";

  const status = running
    ? inIt
      ? r?.phase === "countdown"
        ? "Lining up…"
        : "Race on"
      : "Race on. Ready up for the next one."
    : drivers.length === 0
      ? "Nobody else here yet. Share the link to race your team."
      : left !== null
        ? `Starting in ${left}s`
        : readyCount === 0
          ? `Ready up. It starts when ${RACE.minRacers} are ready.`
          : `${readyCount} ready. Waiting for ${RACE.minRacers - readyCount} more.`;

  return (
    <div className="flex flex-col gap-2">
      <ul className="space-y-1">
        {rows.map((x) => {
          const on = ready.has(x.id) || (running && !!r?.grid.includes(x.id));
          return (
            <li key={x.id} className={`flex items-center gap-2 ${text} ${x.self ? "text-lime" : "text-cream"}`}>
              <span className="h-2.5 w-2.5 shrink-0" style={{ background: carColor(x.name) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate normal-case">
                {who(x.name)}
                {x.self ? " (you)" : ""}
              </span>
              <span className={`shrink-0 ${on ? "text-lime" : "text-dim"}`}>{on ? (running ? "Racing" : "Ready") : "—"}</span>
            </li>
          );
        })}
      </ul>
      <p className={`${text} normal-case ${left !== null ? "text-lime" : "text-muted"}`} aria-live="polite">
        {status}
      </p>
      {!running && drivers.length > 0 && (
        <button
          type="button"
          onClick={() => onReady(!mineReady)}
          aria-pressed={mineReady}
          className={`pointer-events-auto flex items-center justify-center gap-2 px-3 ${big ? "py-3 text-xs" : "py-2 text-[10px]"} transition-[filter] hover:brightness-110 active:translate-y-px ${
            mineReady ? "border-2 border-lime text-lime" : "bg-lime text-bg"
          }`}
        >
          {mineReady ? (
            <>
              <Check size={13} strokeWidth={2.5} aria-hidden /> Ready · click to cancel
            </>
          ) : (
            <>
              <Flag size={13} strokeWidth={2.5} aria-hidden /> Ready · {RACE.laps} laps
            </>
          )}
        </button>
      )}
    </div>
  );
}

/** A race's results, for everyone who was on its grid: live while others finish, final at the flag. */
export function RaceResults({
  race,
  me,
  serverNow,
  onAgain,
  onMenu,
}: {
  race: RaceState;
  me: string | null;
  serverNow: number;
  /** Ready for the next race (and off to the lobby). */
  onAgain: () => void;
  onMenu: () => void;
}) {
  const r = race;
  const over = r.phase === "over";
  const winner = r.finished[0]?.ms ?? null;
  const mine = r.finished.findIndex((f) => f.id === me);
  const left = r.phase === "live" && r.finished.length > 0 ? Math.max(0, Math.ceil((r.endsAt - serverNow) / 1000)) : null;
  const rest = r.grid.filter((id) => !r.finished.some((f) => f.id === id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Enter" || e.code === "KeyR") {
        e.preventDefault();
        onAgain();
      } else if (e.code === "KeyM") onMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAgain, onMenu]);

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-bg/55">
      <section className="w-[min(520px,92vw)] animate-[race-card-in_0.35s_ease-out_both] border-[3px] border-border bg-bg/95">
        <div className="h-3 bg-[repeating-conic-gradient(#0b0d12_0_25%,#f4efe6_0_50%)] bg-[length:12px_12px]" aria-hidden />
        <div className="px-6 py-5">
          <p className="text-[10px] text-muted">{over ? "Race results" : "You're in. The others are still racing"}</p>
          <p className="mt-1 text-3xl text-cream">
            {mine >= 0 ? (
              <>
                P{mine + 1}
                <span className="text-lg text-muted"> / {r.grid.length}</span>
              </>
            ) : over ? (
              "DNF"
            ) : (
              "Racing"
            )}
          </p>
          {left !== null && <p className="mt-1 text-[10px] text-lime">The flag falls in {left}s</p>}

          <ol className="mt-5 space-y-1.5">
            {r.finished.map((f, i) => (
              <li
                key={f.id}
                className={`flex items-center gap-3 border-l-[3px] px-2 py-1.5 text-xs ${f.id === me ? "border-lime bg-lime/10 text-lime" : "border-transparent text-cream"}`}
              >
                <span className="w-7 text-muted">P{i + 1}</span>
                <span className="h-2.5 w-2.5 shrink-0" style={{ background: carColor(f.name) }} aria-hidden />
                <span className="min-w-0 flex-1 truncate normal-case">{who(f.name)}</span>
                {r.penalty[f.id] ? <span className="text-[9px] text-[#ff6b6b]">+{r.penalty[f.id] / 1000}s</span> : null}
                <span className="w-24 text-right tabular-nums">
                  {i === 0 || winner === null ? formatLap(f.ms) : `+${((f.ms - winner) / 1000).toFixed(3)}`}
                </span>
              </li>
            ))}
            {rest.map((id) => (
              <li key={id} className={`flex items-center gap-3 border-l-[3px] border-transparent px-2 py-1.5 text-xs ${id === me ? "text-lime" : "text-dim"}`}>
                <span className="w-7">-</span>
                <span className="h-2.5 w-2.5 shrink-0" style={{ background: carColor(r.names[id] ?? id) }} aria-hidden />
                <span className="min-w-0 flex-1 truncate normal-case">{who(r.names[id] ?? id)}</span>
                <span className="w-24 text-right">
                  {r.out.includes(id) ? "Left" : over ? "DNF" : `Lap ${Math.min(RACE.laps, (r.laps[id] ?? 0) + 1)}/${RACE.laps}`}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={onAgain}
              className="flex flex-1 items-center justify-center gap-2 bg-lime px-4 py-3 text-xs text-bg transition-[filter] hover:brightness-110 active:translate-y-px"
            >
              <RotateCcw size={13} strokeWidth={2.5} aria-hidden /> Race again
            </button>
            <button
              type="button"
              onClick={onMenu}
              className="border-[3px] border-border px-4 py-3 text-xs text-cream transition-colors hover:text-lime"
            >
              Menu
            </button>
          </div>
          <p className="mt-3 text-center text-[9px] text-dim">
            <span className="text-cream">Enter</span> race again · <span className="text-cream">M</span> menu
          </p>
        </div>
      </section>
    </div>
  );
}
