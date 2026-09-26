"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ghost as GhostIcon, Swords } from "lucide-react";
import { HUD_BOX } from "@/components/league/hud/shared";
import CopyLink from "@/components/league/hud/drive/CopyLink";
import { carColor, type DriverInfo } from "@/lib/league-city/drive/net";
import type { BoardRow } from "@/lib/league-city/race/board";
import { MEDALS, MEDAL_COLORS, medalFor } from "@/lib/league-city/race/ghost";
import { formatLap } from "@/lib/league-city/race/laps";
import { RACE, type RaceState } from "@/lib/league-city/race/race";
import { LobbyStatus } from "./RaceLobby";
import { RUN_LAPS } from "@/lib/league-city/race/telemetry";

// The race track's menu, over the hero shot between the letterbox bars, after
// Trackmania's: the list on the left, what it opens on the right. Time trial
// (your best, your rival's ghost, the medals), the live race (who's on track),
// the town's leaderboard (this week's season and all time, a ghost to race on
// every row), the town's drivers (challenge one with your lap), and the way
// back to town. ↑↓ choose, Enter picks, ←→ switch the leaderboard's tab.

type ItemId = "trial" | "live" | "board" | "drivers" | "exit";
type Tab = "week" | "all";

const signed = (ms: number) => `${ms < 0 ? "-" : "+"}${(Math.abs(ms) / 1000).toFixed(3)}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export interface RaceMenuProps {
  slug: string;
  townName: string;
  you: string;
  signedIn: boolean;
  /** Your best lap from any source (ms). */
  pb: number | null;
  board: BoardRow[];
  week: BoardRow[];
  lastWinner: BoardRow | null;
  ghosts: string[];
  members: { login: string; avatar_url: string | null }[];
  drivers: DriverInfo[];
  rival: { login: string; ms: number } | null;
  /** The room's race and lobby, your connection id and the server's clock. */
  race: RaceState | null;
  me: string | null;
  serverNow: number;
  /** The item selected when the menu opens. */
  focus?: "trial" | "live";
  onBegin: () => void;
  onRaceGhost: (login: string) => void;
  /** In or out for the next live race. */
  onReady: (on: boolean) => void;
  onExit: () => void;
}

export default function RaceMenu(p: RaceMenuProps) {
  const items: { id: ItemId; label: string }[] = [
    { id: "trial", label: "Time trial" },
    { id: "live", label: `Live race${p.drivers.length ? ` (${p.drivers.length + 1})` : ""}` },
    { id: "board", label: "Leaderboard" },
    { id: "drivers", label: "Drivers" },
    { id: "exit", label: "Back to town" },
  ];
  const [sel, setSel] = useState(p.focus === "live" ? 1 : 0);
  const [tab, setTab] = useState<Tab>("week");
  const cur = items[sel].id;

  const act = useRef<(id: ItemId) => void>(() => {});
  useEffect(() => {
    act.current = (id) => {
      if (id === "trial") p.onBegin();
      else if (id === "live" && p.drivers.length > 0 && p.race?.phase !== "countdown" && p.race?.phase !== "live")
        p.onReady(!(p.me && p.race?.ready.includes(p.me)));
      else if (id === "exit") p.onExit();
    };
  });
  const selRef = useRef(sel);
  useEffect(() => {
    selRef.current = sel;
  }, [sel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && (e.code === "Enter" || e.code === "Space")) return;
      if (e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        setSel((s) => (s + 4) % 5);
      } else if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        setSel((s) => (s + 1) % 5);
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "KeyA" || e.code === "KeyD") {
        setTab((t) => (t === "week" ? "all" : "week"));
      } else if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        act.current(["trial", "live", "board", "drivers", "exit"][selRef.current] as ItemId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(16vh,96px)] top-[11vh] flex items-center justify-between gap-8 px-[6vw]">
      {/* A scrim from the left edge: the list reads over any part of the track. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[46vw] bg-gradient-to-r from-bg/90 via-bg/60 to-transparent" aria-hidden />
      <nav className="pointer-events-auto relative flex flex-col gap-5" aria-label="Race menu">
        <p className="text-xs text-muted">{p.townName} GP</p>
        <ul className="flex flex-col gap-3" role="menu">
          {items.map((it, i) => (
            <li key={it.id} role="none">
              <button
                type="button"
                role="menuitem"
                onMouseEnter={() => setSel(i)}
                onClick={() => {
                  setSel(i);
                  act.current(it.id);
                }}
                className={`flex items-center gap-3 text-xl transition-colors ${sel === i ? "text-lime" : "text-cream/70 hover:text-cream"}`}
              >
                <span aria-hidden className={`w-4 text-base ${sel === i ? "animate-pulse" : "invisible"}`}>
                  ▶
                </span>
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {cur !== "exit" && (
        <section
          key={cur}
          className={`${HUD_BOX} flex max-h-full w-[420px] shrink-0 animate-[fade-in_0.15s_ease-out] flex-col px-5 py-4`}
        >
          {cur === "trial" && <TrialPanel {...p} />}
          {cur === "live" && <LivePanel {...p} />}
          {cur === "board" && <BoardPanel {...p} tab={tab} setTab={setTab} />}
          {cur === "drivers" && <DriversPanel {...p} />}
        </section>
      )}
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm text-cream">{children}</h2>;
}

function TrialPanel({ pb, board, week, you, rival, onBegin, signedIn }: RaceMenuProps) {
  const medal = medalFor(pb);
  const weekRank = week.find((b) => same(b.login, you))?.rank ?? null;
  const allRank = board.find((b) => same(b.login, you))?.rank ?? null;
  return (
    <>
      <PanelTitle>Time trial · {RUN_LAPS} laps</PanelTitle>
      <div className="flex items-end justify-between border-b-2 border-border pb-3">
        <div>
          <p className="text-[11px] text-muted">Your best lap</p>
          <p className="mt-1 text-3xl text-cream tabular-nums">{pb !== null ? formatLap(pb) : "-:--.---"}</p>
        </div>
        {medal && (
          <span className="border-[3px] px-2 py-0.5 text-[11px]" style={{ borderColor: MEDAL_COLORS[medal], color: MEDAL_COLORS[medal] }}>
            {medal}
          </span>
        )}
      </div>
      <p className="mt-3 flex gap-5 text-[11px] text-muted">
        <span>
          This week <span className="text-cream">{weekRank ? `#${weekRank}` : "-"}</span>
        </span>
        <span>
          All time <span className="text-cream">{allRank ? `#${allRank}` : "-"}</span>
        </span>
      </p>

      <div className="mt-4 border-2 border-border px-3 py-2.5">
        <p className="flex items-center gap-2 text-[11px] text-muted">
          <GhostIcon size={12} strokeWidth={2.5} aria-hidden /> Rival ghost
        </p>
        {rival ? (
          <p className="mt-1.5 flex items-baseline justify-between text-xs">
            <span className="normal-case" style={{ color: carColor(rival.login) }}>
              @{rival.login}
            </span>
            <span className="tabular-nums text-cream">
              {formatLap(rival.ms)}
              {pb !== null && <span className={`ml-2 text-[11px] ${pb <= rival.ms ? "text-lime" : "text-[#ff6b6b]"}`}>{signed(pb - rival.ms)}</span>}
            </span>
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] normal-case text-dim">
            {allRank === 1 ? "You hold the record. Only your own ghost is out there." : "Nobody's ghost to race yet. Set the first lap."}
          </p>
        )}
      </div>

      <ul className="mt-4 flex gap-4 text-[11px]">
        {MEDALS.map(([m, t]) => (
          <li key={m} className="flex items-center gap-1.5" style={{ color: pb !== null && pb <= t ? MEDAL_COLORS[m] : undefined }}>
            <span className="h-2.5 w-2.5 border-2" style={{ borderColor: MEDAL_COLORS[m], background: pb !== null && pb <= t ? MEDAL_COLORS[m] : "transparent" }} aria-hidden />
            <span className={pb !== null && pb <= t ? "" : "text-dim"}>{formatLap(t)}</span>
          </li>
        ))}
      </ul>

      {!signedIn && <p className="mt-3 text-[11px] normal-case text-dim">Sign in to put your laps on the town&apos;s board.</p>}
      <button
        type="button"
        onClick={onBegin}
        className="mt-5 flex items-center justify-center gap-3 bg-lime px-4 py-3 text-xs text-bg transition-[filter] hover:brightness-110 active:translate-y-px"
      >
        Start <span className="border-2 border-bg px-1.5 text-[10px]">Enter</span>
      </button>
    </>
  );
}

function LivePanel({ drivers, you, race, me, serverNow, onReady }: RaceMenuProps) {
  return (
    <>
      <PanelTitle>Live race · {RACE.laps} laps</PanelTitle>
      <p className="mb-4 text-[11px] normal-case text-muted">
        Ready up and the race starts once {RACE.minRacers} of you are. Only the ready ones line up; lights out, first to the flag wins.
      </p>
      <LobbyStatus race={race} me={me} you={you} drivers={drivers} serverNow={serverNow} onReady={onReady} big />
      {drivers.length === 0 && (
        <div className="mt-3">
          <CopyLink />
        </div>
      )}
    </>
  );
}

function BoardPanel({ board, week, lastWinner, ghosts, you, onRaceGhost, tab, setTab }: RaceMenuProps & { tab: Tab; setTab: (t: Tab) => void }) {
  const rows = tab === "week" ? week : board;
  const has = useMemo(() => new Set(ghosts.map((g) => g.toLowerCase())), [ghosts]);
  const top = rows.slice(0, 10);
  const mine = rows.find((b) => same(b.login, you));
  const leader = rows[0]?.best_ms ?? 0;
  const row = (b: BoardRow) => (
    <li key={b.login} className={`flex items-center gap-2 text-xs ${same(b.login, you) ? "text-lime" : "text-cream"}`}>
      <span className="w-6 text-right text-muted">{b.rank}</span>
      <span className="min-w-0 flex-1 truncate normal-case">@{b.login}</span>
      <span className="tabular-nums">{formatLap(b.best_ms)}</span>
      <span className="w-14 text-right text-[10px] tabular-nums text-muted">{b.rank === 1 ? "" : signed(b.best_ms - leader)}</span>
      <span className="w-14 text-right">
        {has.has(b.login.toLowerCase()) && !same(b.login, you) && (
          <button
            type="button"
            onClick={() => onRaceGhost(b.login)}
            className="inline-flex items-center gap-1 border-2 border-border px-1.5 py-0.5 text-[10px] text-cream transition-colors hover:border-lime hover:text-lime"
            title={`Race @${b.login}'s ghost`}
          >
            <GhostIcon size={10} strokeWidth={2.5} aria-hidden /> Race
          </button>
        )}
      </span>
    </li>
  );
  return (
    <>
      <div className="mb-3 flex items-center gap-2" role="tablist">
        {(["week", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`border-2 px-2.5 py-1 text-[11px] transition-colors ${tab === t ? "border-lime bg-lime text-bg" : "border-border text-muted hover:text-cream"}`}
          >
            {t === "week" ? "This week" : "All time"}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-dim">← →</span>
      </div>
      {tab === "week" && (
        <p className="mb-3 text-[11px] normal-case text-muted">
          {lastWinner ? (
            <>
              Last week&apos;s winner <span className="text-[#ffcf33]">@{lastWinner.login}</span> {formatLap(lastWinner.best_ms)}. Resets Monday 00:00 UTC.
            </>
          ) : (
            "The season resets every Monday at 00:00 UTC. Fastest lap of the week wins."
          )}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-[11px] normal-case text-dim">No laps yet. Set the first one.</p>
      ) : (
        <ol className="min-h-0 space-y-1.5 overflow-y-auto">
          {top.map(row)}
          {mine && mine.rank > 10 && (
            <>
              <li className="text-center text-[10px] text-dim" aria-hidden>
                ···
              </li>
              {row(mine)}
            </>
          )}
        </ol>
      )}
    </>
  );
}

function DriversPanel({ slug, members, board, drivers, you, signedIn }: RaceMenuProps) {
  const [sent, setSent] = useState<Record<string, "sending" | "sent" | "already" | string>>({});
  const on = new Set(drivers.map((d) => d.name.toLowerCase()));
  const best = new Map(board.map((b) => [b.login.toLowerCase(), b.best_ms]));
  const iHaveLap = best.has(you.toLowerCase());
  const list = [...members]
    .filter((m) => !same(m.login, you))
    .sort((a, b) => {
      const oa = on.has(a.login.toLowerCase()) ? 0 : 1;
      const ob = on.has(b.login.toLowerCase()) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      const ba = best.get(a.login.toLowerCase()) ?? Infinity;
      const bb = best.get(b.login.toLowerCase()) ?? Infinity;
      return ba === bb ? a.login.localeCompare(b.login) : ba - bb;
    });

  const challenge = async (login: string) => {
    setSent((s) => ({ ...s, [login]: "sending" }));
    try {
      const res = await fetch(`/api/towns/${slug}/race/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      const data = (await res.json()) as { sent?: boolean; error?: string };
      setSent((s) => ({ ...s, [login]: res.ok ? (data.sent ? "sent" : "already") : (data.error ?? "Couldn't send") }));
    } catch {
      setSent((s) => ({ ...s, [login]: "Couldn't send" }));
    }
  };

  return (
    <>
      <PanelTitle>Drivers</PanelTitle>
      <p className="mb-3 text-[11px] normal-case text-muted">
        {!signedIn
          ? "Sign in to challenge your team."
          : iHaveLap
            ? "Challenge someone: they get your lap and your ghost to beat."
            : "Set a lap to challenge your team."}
      </p>
      {list.length === 0 ? (
        <p className="text-[11px] normal-case text-dim">Nobody else in this town yet.</p>
      ) : (
        <ul className="min-h-0 space-y-1.5 overflow-y-auto pr-1">
          {list.slice(0, 60).map((m) => {
            const b = best.get(m.login.toLowerCase());
            const state = sent[m.login];
            return (
              <li key={m.login} className="flex items-center gap-2 text-xs text-cream">
                <span className={`h-2 w-2 shrink-0 ${on.has(m.login.toLowerCase()) ? "animate-pulse bg-lime" : "bg-border"}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate normal-case">@{m.login}</span>
                <span className={`text-[11px] tabular-nums ${b ? "text-cream" : "text-dim normal-case"}`}>{b ? formatLap(b) : "no lap"}</span>
                <span className="w-24 text-right">
                  {signedIn && iHaveLap && (
                    state === "sent" ? (
                      <span className="text-[10px] text-lime">Sent</span>
                    ) : state === "already" ? (
                      <span className="text-[10px] text-muted">Sent today</span>
                    ) : state && state !== "sending" ? (
                      <span className="text-[10px] normal-case text-[#ff6b6b]">{state}</span>
                    ) : (
                      <button
                        type="button"
                        disabled={state === "sending"}
                        onClick={() => challenge(m.login)}
                        className="inline-flex items-center gap-1 border-2 border-border px-1.5 py-0.5 text-[10px] text-cream transition-colors hover:border-lime hover:text-lime disabled:opacity-50"
                      >
                        <Swords size={10} strokeWidth={2.5} aria-hidden /> Challenge
                      </button>
                    )
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
