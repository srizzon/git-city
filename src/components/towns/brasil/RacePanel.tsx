"use client";

import { useEffect, useState } from "react";
import { Flag, X } from "lucide-react";
import posthog from "posthog-js";
import { RALLY, rallyStandings, type RallyRoute } from "@/lib/league-city/drive/rally";
import type { DriverInfo } from "@/lib/league-city/drive/net";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { UNIT_TO_M } from "@/lib/league-city/drive/tuning";
import { formatLap } from "@/lib/league-city/race/laps";
import type { BrasilLayout } from "@/lib/towns/brasil-map";
import { LENGTHS, cityByKey, nearestCity, parseRouteKey, pickDestination, raceRoute, toRallyRoute, type RaceLength, type RaceRoute } from "@/lib/towns/brasil-race";
import type { RallyView } from "@/components/league/drive/RallyMode";
import { HUD_BOX } from "@/components/league/hud/shared";

// The race HUD on the Brasil map. Idle: a Race button; it opens the picker
// (how long, then the route it drew: its cities, length, gates and record).
// Then the invite everyone else gets, the lights, your time, gate and place
// while you race, and the results: places, your best and place on the
// route, the record, and the points it paid your state. Rematch races the
// same route again.

const PLACE = ["1st", "2nd", "3rd"];
const place = (n: number) => PLACE[n - 1] ?? `${n}th`;
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const secs = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
const LENGTH_LABEL: Record<RaceLength, [string, string]> = {
  short: ["Short", "~1 min"],
  medium: ["Medium", "~2 min"],
  long: ["Long", "~4 min"],
};

/** A route's board, fetched when its key changes. */
function useBoard(slug: string, key: string | null) {
  const [board, setBoard] = useState<{ key: string; rows: { login: string; ms: number }[] } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    fetch(`/api/towns/${encodeURIComponent(slug)}/brasil/race?key=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then((b: { board?: { login: string; ms: number }[] }) => live && setBoard({ key, rows: b.board ?? [] }))
      .catch(() => live && setBoard({ key, rows: [] }));
    return () => {
      live = false;
    };
  }, [slug, key]);
  return board && board.key === key ? board.rows : null;
}

export default function RacePanel({
  slug,
  layout,
  view,
  telemetry,
  drivers,
  touch = false,
  pending,
  onRecord,
  onStart,
  onJoin,
  onPendingDone,
}: {
  slug: string;
  layout: BrasilLayout;
  view: RallyView | null;
  telemetry: DriveTelemetry;
  drivers: DriverInfo[];
  touch?: boolean;
  /** A route key from a link (?race=): its card opens right away. */
  pending: string | null;
  /** The race's route record (ms) once its board is in: the car sends its ghost when it beats it. */
  onRecord: (ms: number | null) => void;
  onStart: (route: RallyRoute) => void;
  onJoin: () => void;
  onPendingDone: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<{ route: RaceRoute; length: RaceLength | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [closedRace, setClosedRace] = useState<string | null>(null);
  // The last race's results stay up after the room moves on, until closed or the next race.
  const [results, setResults] = useState<RallyView["rally"] | null>(null);
  const [seenView, setSeenView] = useState(view);
  if (seenView !== view) {
    setSeenView(view);
    const r = view?.rally;
    if (r?.phase === "over" && view?.you && r.racers[view.you]) setResults(r);
    else if (r && (r.phase === "invite" || r.phase === "countdown") && results) setResults(null);
  }

  const rally = view?.rally ?? null;
  const you = view?.you ?? null;
  const serverNow = now + (view?.offset ?? 0);
  const route = rally?.route ?? null;
  const mine = rally && you ? rally.racers[you] : undefined;
  const busy = !!rally && (rally.phase === "invite" || rally.phase === "countdown" || rally.phase === "live");
  const boardKey = draft?.route.key ?? (rally && rally.phase !== "idle" ? (route?.key ?? null) : null);
  const board = useBoard(slug, boardKey);
  const record = board?.[0] ?? null;
  useEffect(() => {
    if (route && board && boardKey === route.key) onRecord(board[0]?.ms ?? null);
  }, [route, board, boardKey, onRecord]);

  const cityName = (key: string) => cityByKey(layout, key)?.name ?? "?";
  const routeName = (r: { from: string; to: string }) => `${cityName(r.from)} → ${cityName(r.to)}`;
  const nameOf = (id: string) => (id === you ? "You" : (rally?.racers[id]?.name.replace(/^guest-.*/, "guest") ?? "someone"));

  /** Draw a route of this length from the city the car is in. */
  const draw = (length: RaceLength) => {
    const r = telemetry.radar;
    const from = nearestCity(layout, r.x * UNIT_TO_M, r.z * UNIT_TO_M);
    const to = from && pickDestination(layout, from, length);
    const built = from && to ? raceRoute(layout, from.key, to.key) : null;
    if (!built || built.gates.length > RALLY.maxGates) {
      setProblem("No road out of this city reaches another one. Drive to a bigger city.");
      return;
    }
    setProblem(null);
    setDraft({ route: built, length });
  };

  // A link to a route (a beaten record's email): its card, ready to start.
  const [seenPending, setSeenPending] = useState<string | null>(null);
  if (pending && pending !== seenPending) {
    setSeenPending(pending);
    const k = parseRouteKey(pending);
    const built = k ? raceRoute(layout, k.from, k.to) : null;
    if (built) {
      setPicking(true);
      setDraft({ route: built, length: null });
      setProblem(built.key !== pending ? "The road between these cities changed: this is a fresh board." : null);
    }
  }
  useEffect(() => {
    if (pending) onPendingDone();
  }, [pending, onPendingDone]);

  const start = (r: RaceRoute) => {
    onStart(toRallyRoute(r));
    posthog.capture("brasil_race_started", { km: Math.round(r.length / 100) / 10, gates: r.gates.length, length: draft?.length ?? "link", others: drivers.length });
    setPicking(false);
    setDraft(null);
  };

  // ── Countdown: the lights. ─────────────────────────────────
  if (rally?.phase === "countdown" && route && mine) {
    const lit = Math.max(0, Math.min(RALLY.lights, Math.floor((serverNow - rally.lightsAt) / RALLY.lightMs) + 1));
    return (
      <div className="absolute inset-x-0 top-[24%] flex flex-col items-center gap-3 text-cream">
        <p className="text-[10px] text-muted">{routeName(route)} · {km(route.length)}</p>
        <div className={`${HUD_BOX} flex gap-2 px-3 py-2`}>
          {Array.from({ length: RALLY.lights }, (_, i) => (
            <span key={i} className={`size-6 border-2 border-border ${serverNow >= rally.lightsAt && i < lit ? "bg-[#ff4f4f]" : "bg-bg"}`} />
          ))}
        </div>
        <p className="text-[9px] normal-case text-muted">{record ? `Record ${formatLap(record.ms)} by @${record.login}` : "No record on this route yet"}</p>
      </div>
    );
  }

  // ── Live. ──────────────────────────────────────────────────
  if (rally?.phase === "live" && route) {
    const t = Math.max(0, serverNow - rally.startsAt);
    if (!mine || mine.gone) {
      const n = Object.values(rally.racers).filter((r) => !r.gone).length;
      return (
        <div className={`${HUD_BOX} absolute left-1/2 top-16 max-sm:top-[7.5rem] -translate-x-1/2 whitespace-nowrap px-3 py-1.5 text-[9px] text-muted`}>
          <Flag size={11} className="mr-1.5 inline text-lime" aria-hidden />
          Race on: {routeName(route)} · {n} racing
        </div>
      );
    }
    const order = rallyStandings(rally);
    const pos = order.indexOf(you!) + 1;
    const shown = order.slice(0, 3);
    if (!shown.includes(you!)) shown[shown.length - 1] = you!;
    const gates = route.gates.length;
    const go = t < 1200;
    if (mine.ms !== null) {
      return (
        <div className={`${HUD_BOX} absolute left-1/2 top-4 max-sm:top-[4.25rem] flex -translate-x-1/2 flex-col items-center gap-1 px-4 py-2 text-cream`}>
          <p className="text-[10px] text-muted">{mine.ms > 0 ? `Finished ${place(rally.order.indexOf(you!) + 1)}` : "Finished, untimed"}</p>
          {mine.ms > 0 && <p className="text-xl tabular-nums">{formatLap(mine.ms)}</p>}
          <SavedLine saved={view?.saved ?? null} />
          <p className="text-[8px] normal-case text-dim">Results in {secs(rally.endsAt - serverNow)}s</p>
        </div>
      );
    }
    return (
      <>
        {go && <p className="absolute inset-x-0 top-[26%] text-center text-6xl text-lime [text-shadow:0_3px_0_#000]">GO</p>}
        <div className={`${HUD_BOX} absolute left-1/2 top-4 max-sm:top-[4.25rem] flex -translate-x-1/2 flex-col gap-1.5 px-3 py-2 text-[9px]`}>
          <p className="flex items-center justify-between gap-5 text-cream">
            <span className="flex items-center gap-1.5">
              <Flag size={11} className="text-lime" aria-hidden />
              {cityName(route.to)}
            </span>
            <span className="text-sm tabular-nums">{formatLap(t)}</span>
          </p>
          <p className="flex justify-between gap-5 text-muted">
            <span>
              Gate {Math.min(mine.next + 1, gates)}/{gates}
            </span>
            {order.length > 1 && (
              <span className="text-cream">
                {place(pos)} of {order.length}
              </span>
            )}
          </p>
          {order.length > 1 && (
            <ul className="flex flex-col gap-0.5 border-t-2 border-border pt-1">
              {shown.map((id) => (
                <li key={id} className={`flex justify-between gap-5 ${id === you ? "text-cream" : "text-muted"}`}>
                  <span>
                    {order.indexOf(id) + 1}. {nameOf(id)}
                  </span>
                  <span className="tabular-nums">{rally.racers[id].ms !== null ? (rally.racers[id].ms! > 0 ? formatLap(rally.racers[id].ms!) : "in") : `${rally.racers[id].next}/${gates}`}</span>
                </li>
              ))}
            </ul>
          )}
          {mine.void && <p className="normal-case text-[#ff7e7e]">Too fast somewhere: this run isn&apos;t timed.</p>}
        </div>
        {!touch && <p className="absolute bottom-20 left-1/2 -translate-x-1/2 text-[8px] normal-case text-dim">R: back to the last gate</p>}
      </>
    );
  }

  // ── Invite. ────────────────────────────────────────────────
  if (rally?.phase === "invite" && route) {
    const left = secs(rally.inviteEnds - serverNow);
    const n = Object.keys(rally.racers).length;
    if (mine) {
      return (
        <div className={`${HUD_BOX} absolute left-1/2 top-16 max-sm:top-[7.5rem] flex -translate-x-1/2 flex-col items-center gap-0.5 whitespace-nowrap px-4 py-2 text-[9px]`}>
          <p className="text-cream">{routeName(route)}</p>
          <p className="normal-case text-muted">
            Waiting for racers · {left}s · {n} in
          </p>
        </div>
      );
    }
    const by = rally.by ? rally.racers[rally.by]?.name : null;
    return (
      <div className={`${HUD_BOX} absolute left-1/2 top-16 max-sm:top-[7.5rem] flex -translate-x-1/2 items-center gap-4 px-3 py-2 text-[9px] max-sm:w-[calc(100vw-2rem)]`}>
        <span className="min-w-0 flex-1">
          <span className="block text-cream">{by && !by.startsWith("guest-") ? `@${by}` : "Someone"} started a race</span>
          <span className="block normal-case text-muted">
            {routeName(route)} · {km(route.length)}
            {record ? ` · record ${formatLap(record.ms)}` : ""}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onJoin();
            posthog.capture("brasil_race_joined", { racers: n + 1 });
          }}
          className="btn-press min-h-10 shrink-0 bg-lime px-3 text-[10px] text-bg"
        >
          Join · {left}
        </button>
      </div>
    );
  }

  // ── Results. ───────────────────────────────────────────────
  if (results?.route && you && results.racers[you] && closedRace !== results.id && !busy) {
    const rally = results;
    const route = results.route;
    const order = rallyStandings(rally);
    const myPlace = rally.order.indexOf(you) + 1;
    const saved = view?.saved ?? null;
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[14%] flex flex-col items-center gap-3 px-4 text-cream">
        <p className="text-2xl tracking-[0.15em]">{myPlace === 1 && order.length > 1 ? "You win!" : myPlace > 0 ? place(myPlace) : "Didn't finish"}</p>
        <div className={`${HUD_BOX} flex w-full max-w-[340px] flex-col gap-2 px-4 py-3 text-[10px]`}>
          <p className="flex items-center justify-between text-muted">
            <span>{routeName(route)}</span>
            <button type="button" aria-label="Close" onClick={() => setClosedRace(rally.id)} className="-mr-2 flex size-9 items-center justify-center hover:text-cream">
              <X size={14} aria-hidden />
            </button>
          </p>
          <ul className="flex flex-col gap-1">
            {order.slice(0, 8).map((id) => {
              const r = rally.racers[id];
              const fin = rally.order.indexOf(id);
              return (
                <li key={id} className={`flex justify-between gap-6 ${id === you ? "text-cream" : "text-muted"}`}>
                  <span>
                    {fin >= 0 ? `${fin + 1}.` : "–"} {nameOf(id)}
                  </span>
                  <span className="tabular-nums">{r.ms !== null && r.ms > 0 ? formatLap(r.ms) : r.ms === -1 ? "untimed" : "DNF"}</span>
                </li>
              );
            })}
          </ul>
          <div className="border-t-2 border-border pt-2">
            <SavedLine saved={saved} />
            {saved?.state === "saved" && (
              <p className="mt-1 normal-case text-muted">
                Your best {formatLap(saved.best)} · #{saved.rank} on this route
                {saved.record && !saved.newRecord ? ` · record ${formatLap(saved.record.ms)} @${saved.record.login}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              const r = raceRoute(layout, route.from, route.to);
              if (r) start(r);
            }}
            className="btn-press pointer-events-auto mt-1 min-h-10 bg-lime text-[10px] text-bg"
          >
            Rematch
          </button>
        </div>
      </div>
    );
  }

  if (busy) return null;

  // ── Idle: the button, and the picker it opens. ─────────────
  if (!picking) {
    return (
      <button
        type="button"
        onClick={() => setPicking(true)}
        className={`${HUD_BOX} btn-press absolute left-1/2 top-16 max-sm:top-[7.5rem] flex -translate-x-1/2 items-center gap-2 px-3 py-2 text-[10px] text-lime hover:text-cream`}
      >
        <Flag size={12} aria-hidden />
        Race
      </button>
    );
  }
  const close = () => {
    setPicking(false);
    setDraft(null);
    setProblem(null);
  };
  return (
    <div className={`${HUD_BOX} absolute left-1/2 top-16 max-sm:top-[7.5rem] flex w-[300px] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2 px-3 py-3 text-[10px]`}>
      <p className="flex items-center justify-between text-cream">
        <span className="flex items-center gap-1.5">
          <Flag size={12} className="text-lime" aria-hidden />
          {draft ? routeName(draft.route) : "Race to another city"}
        </span>
        <button type="button" aria-label="Close" onClick={close} className="-mr-2 flex size-9 items-center justify-center text-muted hover:text-cream">
          <X size={14} aria-hidden />
        </button>
      </p>
      {draft ? (
        <>
          <p className="normal-case text-muted">
            {km(draft.route.length)} · {draft.route.gates.length} gates · {board === null ? "…" : record ? `record ${formatLap(record.ms)} by @${record.login}` : "no record yet"}
          </p>
          {board && board.length > 1 && (
            <ol className="flex flex-col gap-0.5 normal-case text-dim">
              {board.slice(0, 3).map((b, i) => (
                <li key={b.login} className="flex justify-between">
                  <span>
                    {i + 1}. @{b.login}
                  </span>
                  <span className="tabular-nums">{formatLap(b.ms)}</span>
                </li>
              ))}
            </ol>
          )}
          {problem && <p className="normal-case text-dim">{problem}</p>}
          <p className="normal-case text-dim">{drivers.length > 0 ? `Everyone driving here gets ${RALLY.invite / 1000} s to join.` : "Nobody else is driving here: you race the record's ghost."}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => (draft.length ? draw(draft.length) : setDraft(null))} className="btn-press min-h-10 border-2 border-border text-muted hover:text-cream">
              Other city
            </button>
            <button type="button" onClick={() => start(draft.route)} className="btn-press min-h-10 bg-lime text-bg">
              Start race
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(LENGTHS) as RaceLength[]).map((l) => (
              <button key={l} type="button" onClick={() => draw(l)} className="btn-press flex min-h-12 flex-col items-center justify-center gap-0.5 border-2 border-border text-cream hover:border-lime">
                {LENGTH_LABEL[l][0]}
                <span className="text-[8px] normal-case text-muted">{LENGTH_LABEL[l][1]}</span>
              </button>
            ))}
          </div>
          {problem && <p className="normal-case text-dim">{problem}</p>}
          <p className="normal-case text-dim">From the city you&apos;re in to another, through gates. Finishing scores points for your state.</p>
        </>
      )}
    </div>
  );
}

function SavedLine({ saved }: { saved: RallyView["saved"] }) {
  if (!saved) return null;
  if (saved.state === "saving") return <p className="normal-case text-muted">Saving your time…</p>;
  if (saved.state === "guest") return <p className="normal-case text-muted">Sign in to save your time and score points.</p>;
  if (saved.state === "error") return <p className="normal-case text-[#ff7e7e]">{saved.message}</p>;
  return (
    <p className="text-lime">
      {saved.newRecord ? "New route record! " : ""}
      {saved.points > 0 ? `+${saved.points} pts for your state` : saved.newRecord ? "" : "Saved"}
    </p>
  );
}

/** For the page: whether the race HUD has the top of the screen (Crown Rush steps aside). */
export function raceActive(view: RallyView | null): boolean {
  const p = view?.rally.phase;
  return p === "invite" || p === "countdown" || p === "live";
}
