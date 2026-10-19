"use client";

import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import posthog from "posthog-js";
import { RALLY, rallyStandings, type RallyRoute, type RallyState } from "@/lib/league-city/drive/rally";
import type { DriveTelemetry } from "@/lib/league-city/drive/telemetry";
import { UNIT_TO_M } from "@/lib/league-city/drive/tuning";
import { formatLap } from "@/lib/league-city/race/laps";
import type { BrasilLayout } from "@/lib/towns/brasil-map";
import { cityByKey, nearestCity, parseRouteKey, pickDestination, raceRoute, toRallyRoute, type RaceLength, type RaceRoute } from "@/lib/towns/brasil-race";
import type { RallyView } from "@/components/league/drive/RallyMode";
import { Band } from "@/components/games/ui";
import { GameClock, GameInvite, GameOnBand, GameResults, GameStandings, KEYS_ONLY, Keys, LIGHTS, T, type ResultRow, type StandingRow } from "@/components/games/kit";
import { Chip } from "@/components/games/ui";

// The Brasil map's city race in the car games' kit (components/games): the
// race's step in the Games menu (how long, the route it drew, its record and
// top three), then the invite card, the race clock with the lights in it and
// the order on the left, and the centered results. Rematch races the same
// route again.

const PLACE = ["1st", "2nd", "3rd"];
const place = (n: number) => PLACE[n - 1] ?? `${n}th`;
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const LENGTH_LABEL: Record<RaceLength, [string, string]> = {
  short: ["Short", "~1 min"],
  medium: ["Medium", "~2 min"],
  long: ["Long", "~4 min"],
};
const ORDER: RaceLength[] = ["short", "medium", "long"];
/** A split shows this long after each gate (ms). */
const SPLIT_MS = 3000;

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

/** Ticks while something on screen counts. */
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return now;
}

/**
 * The race's step in the Games menu: from the city the car is in, a route of
 * the length picked (← → or 1 2 3), another city (R), the record and top three,
 * Enter to challenge, Esc back to the modes. A link (?race=) opens it on
 * that route.
 */
export function RacePicker({
  slug,
  layout,
  telemetry,
  others,
  initial,
  onStart,
  onBack,
}: {
  slug: string;
  layout: BrasilLayout;
  telemetry: DriveTelemetry;
  /** How many others drive here (they get the invite). */
  others: number;
  /** A route key from a link. */
  initial: string | null;
  /** False: the room couldn't be reached (the menu stays, saying so). */
  onStart: (route: RallyRoute, how: string, solo?: boolean) => boolean;
  onBack: () => void;
}) {
  const [length, setLength] = useState<RaceLength>("medium");
  const [draft, setDraft] = useState<{ route: RaceRoute | null; problem: string | null; how: string }>(() => {
    const k = initial ? parseRouteKey(initial) : null;
    const r = k ? raceRoute(layout, k.from, k.to) : null;
    if (r) return { route: r, problem: r.key !== initial ? "The road between these cities changed: this is a fresh board." : null, how: "link" };
    return draw(layout, telemetry, "medium");
  });
  const board = useBoard(slug, draft.route?.key ?? null);
  const go = (route: RaceRoute, solo = false) => {
    if (!onStart(toRallyRoute(route), draft.how, solo)) setDraft((d) => ({ ...d, problem: "Can't reach the race room right now. Try again in a moment." }));
  };
  const record = board?.[0] ?? null;
  const name = (key: string) => cityByKey(layout, key)?.name ?? "?";
  const from = draft.route ? name(draft.route.from) : (nearestCity(layout, telemetry.radar.x * UNIT_TO_M, telemetry.radar.z * UNIT_TO_M)?.name ?? "here");

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // ← → and 1 2 3 pick the length (the row of lengths reads left to right); R draws another city.
      const n = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
      const step = e.code === "ArrowLeft" || e.code === "KeyA" ? -1 : e.code === "ArrowRight" || e.code === "KeyD" ? 1 : 0;
      const pick = n >= 0 ? ORDER[n] : step ? ORDER[Math.max(0, Math.min(ORDER.length - 1, ORDER.indexOf(length) + step))] : null;
      if (pick) {
        if (pick !== length) {
          setLength(pick);
          setDraft(draw(layout, telemetry, pick));
        }
      } else if (e.code === "KeyR") setDraft(draw(layout, telemetry, length));
      else if (e.code === "Enter") {
        if (draft.route) go(draft.route);
      } else if (e.code === "Escape" || e.code === "Backspace") onBack();
      else if (e.code === "KeyG") onBack();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [layout, telemetry, length, draft, go, onBack]);

  return (
    <>
      <button type="button" onClick={onBack} className="text-left outline-none active:translate-y-px">
        <Band className="w-full justify-between px-4 py-2 text-lime" style={{ fontSize: T.small }}>
          <span>‹ Race · from {from}</span>
          <span className="text-muted">Back</span>
        </Band>
      </button>
      <div className="grid grid-cols-3 gap-1.5">
        {ORDER.map((l, i) => (
          <button
            key={l}
            type="button"
            aria-pressed={l === length}
            onClick={() => {
              setLength(l);
              setDraft(draw(layout, telemetry, l));
            }}
            className="outline-none active:translate-y-px"
          >
            <Band tone={l === length ? "cream" : "dark"} delay={40 + i * 30} className="min-h-11 w-full flex-col gap-1 px-3 py-2" style={{ fontSize: T.small }}>
              <span>
                {i + 1} · {LENGTH_LABEL[l][0]}
              </span>
              <span className="normal-case opacity-70">{LENGTH_LABEL[l][1]}</span>
            </Band>
          </button>
        ))}
      </div>
      {draft.route ? (
        <>
          <Band tone="lime" delay={80} className="flex-col items-start gap-1 px-5 py-3 leading-none" style={{ fontSize: T.big }}>
            <span>{name(draft.route.from)}</span>
            <span className="opacity-60">→ {name(draft.route.to)}</span>
          </Band>
          <Band delay={140} className="flex-wrap gap-x-3 gap-y-1 px-4 py-2.5 normal-case text-muted" style={{ fontSize: T.small }}>
            <span>
              {km(draft.route.length)} · {draft.route.gates.length} gates
            </span>
            <span>
              {board === null ? "…" : record ? (
                <>
                  record <span className="text-cream">{formatLap(record.ms)}</span> @{record.login}
                </>
              ) : (
                "no record yet"
              )}
            </span>
          </Band>
          {board?.slice(0, 3).map((b, i) => (
            <Band key={b.login} delay={200 + i * 40} className="justify-between gap-6 px-4 py-2 tabular-nums" style={{ fontSize: T.small }}>
              <span className="min-w-0 truncate normal-case">
                {i + 1}. @{b.login}
              </span>
              <span>{formatLap(b.ms)}</span>
            </Band>
          ))}
        </>
      ) : null}
      {(draft.problem || !draft.route) && (
        <Band delay={140} className="px-4 py-2.5 normal-case text-muted" style={{ fontSize: T.small }}>
          {draft.problem ?? "No road from this city reaches another one. Drive to a bigger city."}
        </Band>
      )}
      <Band delay={320} className="px-4 py-2 normal-case text-dim" style={{ fontSize: T.small }}>
        {others > 0 ? `Everyone driving here gets ${RALLY.invite / 1000} s to join. Nobody does: no race.` : "Nobody else is driving here: you race the record's ghost."}
      </Band>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => setDraft(draw(layout, telemetry, length))} className="outline-none active:translate-y-px">
          <Band delay={340} className="min-h-11 w-full justify-center gap-2 px-3 py-2.5 text-cream" style={{ fontSize: T.small }}>
            <span className={KEYS_ONLY}>
              <Chip>R</Chip>
            </span>{" "}
            Other city
          </Band>
        </button>
        {draft.route && (
          <button type="button" onClick={() => draft.route && go(draft.route)} className="outline-none active:translate-y-px">
            <Band tone="lime" delay={360} className="min-h-11 w-full justify-center gap-3 px-4 py-2.5" style={{ fontSize: T.body }}>
              {others > 0 ? "Challenge" : "Race"}
            </Band>
          </button>
        )}
      </div>
      {draft.route && others > 0 && (
        <button type="button" onClick={() => draft.route && go(draft.route, true)} className="outline-none active:translate-y-px">
          <Band delay={380} className="min-h-11 w-full justify-center px-4 py-2 normal-case text-muted" style={{ fontSize: T.small }}>
            Or race it alone, against the record&apos;s ghost
          </Band>
        </button>
      )}
      <Keys
        delay={400}
        keys={[
          ["Enter", others > 0 ? "challenge" : "race"],
          ["← →", "length"],
          ["Esc", "back"],
        ]}
      />
    </>
  );
}

/** A route of this length from the city the car is in. */
function draw(layout: BrasilLayout, telemetry: DriveTelemetry, length: RaceLength): { route: RaceRoute | null; problem: string | null; how: string } {
  const r = telemetry.radar;
  const from = nearestCity(layout, r.x * UNIT_TO_M, r.z * UNIT_TO_M);
  const to = from && pickDestination(layout, from, length);
  const route = from && to ? raceRoute(layout, from.key, to.key) : null;
  if (!route || route.gates.length > RALLY.maxGates) return { route: null, problem: null, how: length };
  return { route, problem: null, how: length };
}

/** The race once it's on: the invite, the clock and the order, the results. */
export default function RacePanel({
  layout,
  view,
  yourUf,
  onJoin,
  onRematch,
  onAlone,
  onResults,
}: {
  /** Run this route solo (nobody took the challenge). */
  onAlone: (route: RallyRoute) => void;
  /** The results are up (true) or gone: the car waits while they are. */
  onResults?: (open: boolean) => void;
  layout: BrasilLayout;
  view: RallyView | null;
  /** Your state (its points go up). */
  yourUf: string | null;
  onJoin: () => void;
  /** Race the same route again. */
  onRematch: (route: RallyRoute) => void;
}) {
  const rally = view?.rally ?? null;
  const you = view?.you ?? null;
  const counting = !!rally && rally.phase !== "idle";
  const now = useNow(counting);
  const serverNow = now + (view?.offset ?? 0);

  // The last race's results stay up after the room moves on, until Esc or the next race.
  const [results, setResults] = useState<RallyState | null>(() => finishedRace(view));
  const [closed, setClosed] = useState<string | null>(null);
  const [seen, setSeen] = useState(view);
  if (seen !== view) {
    setSeen(view);
    const r = view?.rally;
    const done = finishedRace(view);
    if (done) setResults(done);
    else if (r && (r.phase === "invite" || r.phase === "countdown") && results) setResults(null);
  }

  const showing = !!(results?.route && you && results.racers[you] && closed !== results.id);
  useEffect(() => {
    onResults?.(showing);
  }, [showing, onResults]);

  const cityName = (key: string) => cityByKey(layout, key)?.name ?? "?";
  const routeName = (r: { from: string; to: string }) => `${cityName(r.from)} → ${cityName(r.to)}`;

  // ── Results (and waiting for the others past the line) ─────
  if (results?.route && you && results.racers[you] && closed !== results.id) {
    const r = results.phase === "live" && rally?.id === results.id ? rally : results;
    const route = r.route!;
    const order = rallyStandings(r);
    const mine = r.racers[you];
    const myPlace = r.order.indexOf(you) + 1;
    const winner = r.order[0] ? r.racers[r.order[0]].ms : null;
    const saved = view?.saved ?? null;
    const news: [string, string][] = [];
    const pts = saved?.state === "saved" ? saved.points : 0;
    const uf = yourUf ? ` · ${yourUf}` : "";
    if (saved?.state === "saved" && saved.newRecord) news.push(["New route record", pts > 0 ? `+${pts} pts${uf}` : ""]);
    else if (pts > 0) news.push(["Points for your state", `+${pts}${uf}`]);
    const live = r.phase === "live";
    const guest = mine.name.startsWith("guest-");
    const status =
      guest && mine.ms !== null && mine.ms > 0
        ? "Sign in to save your time and score points."
        : saved?.state === "saving"
        ? "Saving your time…"
        : saved?.state === "guest"
          ? "Sign in to save your time and score points."
          : saved?.state === "error"
            ? saved.message
            : live
              ? `The others have ${Math.max(0, Math.ceil((r.endsAt - serverNow) / 1000))}s`
              : saved?.state === "saved"
                ? `Your best ${formatLap(saved.best)} · #${saved.rank} on this route`
                : null;
    const rows: ResultRow[] = order.map((id) => {
      const x = r.racers[id];
      const fin = r.order.indexOf(id);
      return {
        id,
        name: x.name,
        you: id === you,
        place: fin >= 0 ? `P${fin + 1}` : "–",
        value:
          x.ms !== null && x.ms > 0
            ? fin === 0 || winner === null
              ? formatLap(x.ms)
              : `+${((x.ms - winner) / 1000).toFixed(3)}`
            : x.ms === -1
              ? "untimed"
              : x.gone
                ? "left"
                : live
                  ? `${x.next}/${route.gates.length}`
                  : "DNF",
      };
    });
    const busy = rally?.phase === "invite" || rally?.phase === "countdown" || (rally?.phase === "live" && rally.id !== results.id);
    return (
      <GameResults
        title={routeName(route)}
        place={myPlace > 0 ? (order.length === 1 ? "Your time" : `${place(myPlace)} of ${order.length}`) : mine.ms === -1 ? "Finished, untimed" : "Didn't finish"}
        time={mine.ms !== null && mine.ms > 0 ? formatLap(mine.ms) : null}
        news={news}
        status={status}
        rows={rows}
        again="Rematch"
        onAgain={busy || live ? null : () => onRematch(route)}
        onClose={() => setClosed(results.id)}
      />
    );
  }

  if (!rally?.route) return null;
  const route = rally.route;
  const mine = you ? rally.racers[you] : undefined;
  const n = Object.keys(rally.racers).length;

  // ── Nobody took it: no race; the one who asked can run it alone ─
  if (rally.phase === "cancel") {
    if (!mine || you !== rally.by) return null;
    return (
      <GameInvite
        kind="Race"
        icon={Flag}
        title={routeName(route)}
        lines={["Nobody joined, so no race."]}
        endsAt={rally.endsAt + RALLY.over}
        serverNow={serverNow}
        total={RALLY.over}
        action="Race it alone"
        onJoin={() => onAlone(route)}
      />
    );
  }

  // ── Invite ─────────────────────────────────────────────────
  if (rally.phase === "invite") {
    const by = rally.by ? rally.racers[rally.by]?.name : null;
    return (
      <GameInvite
        kind="Race"
        icon={Flag}
        title={routeName(route)}
        lines={[`${by && !by.startsWith("guest-") ? `@${by}` : "Someone"} · ${km(route.length)} · ${n} in`]}
        endsAt={rally.inviteEnds}
        serverNow={serverNow}
        total={RALLY.invite}
        action={mine ? `Waiting for racers · ${n} in` : "Join race"}
        onJoin={
          mine
            ? null
            : () => {
                onJoin();
                posthog.capture("brasil_race_joined", { racers: n + 1 });
              }
        }
      />
    );
  }

  // ── Somebody else's race ───────────────────────────────────
  if (!mine || mine.gone) {
    if (rally.phase !== "countdown" && rally.phase !== "live") return null;
    return (
      <GameOnBand icon={Flag}>
        Race on: {routeName(route)} · {Object.values(rally.racers).filter((r) => !r.gone).length} racing
      </GameOnBand>
    );
  }

  // ── The grid and the race (past the line with the results closed: back to driving, nothing on screen) ─
  if (rally.phase !== "countdown" && rally.phase !== "live") return null;
  if (mine.ms !== null) return null;
  const order = rallyStandings(rally);
  const gates = route.gates.length;
  const grid = rally.phase === "countdown";
  const rows: StandingRow[] = (grid ? Object.entries(rally.racers).sort((a, b) => a[1].slot - b[1].slot).map(([id]) => id) : order).map((id) => {
    const x = rally.racers[id];
    return { id, name: x.name, you: id === you, value: grid ? "" : x.ms !== null ? "in" : `${x.next}/${gates}` };
  });
  const lit = grid ? Math.max(0, Math.min(LIGHTS, Math.floor((serverNow - rally.lightsAt) / RALLY.lightMs) + 1)) : null;
  const t = Math.max(0, serverNow - rally.startsAt);
  // The split at the last gate you went through, against the record's, for a moment.
  const k = mine.next - 1;
  const mineAt = k >= 0 ? view?.gateTimes[k] : undefined;
  const theirs = k >= 0 ? view?.recordSplits?.[k] : undefined;
  const split = mineAt !== undefined && theirs !== undefined && t - mineAt < SPLIT_MS ? mineAt - theirs : null;
  const pos = order.indexOf(you!) + 1;
  return (
    <>
      <GameClock
        label={grid ? `Grid · P${mine.slot + 1} of ${n}` : `Gate ${Math.min(mine.next + 1, gates)}/${gates}${n > 1 ? ` · P${pos}/${n}` : ""}`}
        lit={lit}
        ms={t}
        split={grid ? null : split}
        go={!grid && t < 1200}
        note={mine.void ? <Band className="px-3 py-1 normal-case text-[#ff7e7e]" style={{ fontSize: T.small }}>Too fast somewhere: this run isn&apos;t timed.</Band> : null}
      />
      {n > 1 && <GameStandings rows={rows} />}
    </>
  );
}

/** The race you're past the line in (or that just ended), for the results. */
function finishedRace(view: RallyView | null): RallyState | null {
  const r = view?.rally;
  const mine = r && view?.you ? r.racers[view.you] : undefined;
  return r && mine && (r.phase === "over" || (r.phase === "live" && mine.ms !== null)) ? r : null;
}

/** Whether you're racing right now, on the grid or between the gates (the drive HUD's own pieces and the Games menu step aside). */
export function raceActive(view: RallyView | null): boolean {
  const r = view?.rally;
  const mine = r && view?.you ? r.racers[view.you] : undefined;
  if (!r || !mine || mine.gone || mine.ms !== null) return false;
  return r.phase === "countdown" || r.phase === "live";
}
