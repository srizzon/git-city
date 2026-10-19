"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Clock, Code2, Instagram, MapPin, MessageCircle, PaintRoller, Plus, Search, Trophy, UserPlus, Vote as VoteIcon, X, type LucideIcon } from "lucide-react";
import type { CityBuilding } from "@/lib/github";
import Panel from "@/components/league/hud/Panel";
import { Avatar, HUD_BOX, fmt, useCountdown } from "@/components/league/hud/shared";
import TrophyIcon from "@/components/towns/TrophyIcon";
import { PRESIDENCY_ON } from "@/lib/towns/brasil-election";
import { STATES, type CityLayout, type UF } from "@/lib/towns/brasil-map";
import type { BrCity } from "@/lib/towns/br-cities";
import { swatchOf, type StateStats } from "./stats";
import { useBrCities } from "./useBrCities";

// The Brasil town's side panels, in the towns' Panel: search the map (a
// state, any city in Brazil, a dev), the 27 states ranked by the week's
// points with how points are made, and picking your city.

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const LOGIN = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;

/**
 * The search over the map, always there: a state (name or UF), a city (on
 * the map, or any other in Brazil: nobody there yet, found it) or a GitHub
 * username. A username that isn't on the map yet gets the way to put it there.
 */
export function BrasilSearchBar({
  cities,
  island,
  buildings,
  onPickCity,
  onPickBuilding,
  onPutOnMap,
  onFound,
}: {
  cities: CityLayout[];
  island: CityLayout;
  buildings: CityBuilding[];
  onPickCity: (c: CityLayout) => void;
  onPickBuilding: (b: CityBuilding) => void;
  /** Someone typed a username that isn't on the map. */
  onPutOnMap: (login: string) => void;
  /** A city nobody lives in yet: found it. */
  onFound: (city: BrCity) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const q = fold(query.trim().replace(/^@/, ""));
  const br = useBrCities(q.length >= 2);
  const places = useMemo(() => {
    if (!q) return [];
    return [...cities, island]
      .filter((c) => {
        const st = c.uf ? STATES.find((s) => s.uf === c.uf) : null;
        return fold(c.name).includes(q) || (st && (fold(st.name).includes(q) || st.uf.toLowerCase() === q)) || (!c.uf && "island".startsWith(q));
      })
      .sort((a, b) => Number(fold(b.name).startsWith(q)) - Number(fold(a.name).startsWith(q)) || b.devs.length - a.devs.length)
      .slice(0, 5);
  }, [cities, island, q]);
  // Cities nobody lives in yet, by the same words.
  const unfounded = useMemo(() => {
    if (!br || q.length < 2) return [];
    const onMap = new Set(cities.map((c) => c.ibge));
    return br.searchCities(q, 12).filter((c) => !onMap.has(c.ibge)).slice(0, 3);
  }, [br, cities, q]);
  const devs = useMemo(() => {
    if (!q) return [];
    const starts = buildings.filter((b) => b.loginLower.startsWith(q));
    const contains = buildings.filter((b) => !b.loginLower.startsWith(q) && b.loginLower.includes(q));
    return [...starts, ...contains].slice(0, 6);
  }, [buildings, q]);
  // A word that names a city reads as the city, not as a username.
  const isCity = places.some((c) => fold(c.name) === q) || unfounded.some((c) => fold(c.name) === q);
  const missing = LOGIN.test(q) && !isCity && !buildings.some((b) => b.loginLower === q) ? q : null;
  const pick = (f: () => void) => {
    f();
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="pointer-events-auto relative w-full font-pixel sm:w-[min(420px,calc(100vw-32px))]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const exact = devs.find((b) => b.loginLower === q);
          if (exact) pick(() => onPickBuilding(exact));
          else if (places[0]) pick(() => onPickCity(places[0]));
          else if (unfounded[0]) pick(() => onFound(unfounded[0]));
          else if (devs[0]) pick(() => onPickBuilding(devs[0]));
          else if (missing) pick(() => onPutOnMap(missing));
        }}
        role="search"
        data-bwignore="true"
        className="flex items-stretch shadow-[0_6px_0_rgba(0,0,0,0.35)]"
      >
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), setOpen(false))}
          placeholder="@username, city or state"
          aria-label="Find your building: GitHub username, city or state"
          // A search, not a login: password managers (Bitwarden, 1Password, LastPass) keep their icon off it.
          type="search"
          name="brasil-find"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          data-bwignore="true"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          className="h-10 min-w-0 flex-1 border-[3px] border-border bg-bg/90 px-3 [&::-webkit-search-cancel-button]:hidden text-base normal-case text-cream outline-none backdrop-blur-sm placeholder:text-dim focus:border-lime/70 sm:text-[12px]"
        />
        <button type="submit" aria-label="Find" className="flex items-center bg-lime px-3 text-[11px] uppercase text-bg sm:px-4">
          <Search size={16} className="sm:hidden" aria-hidden />
          <span className="max-sm:hidden">Find</span>
        </button>
      </form>
      {open && q && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 flex max-h-[50vh] flex-col overflow-y-auto border-[3px] border-border bg-bg/95 uppercase backdrop-blur-sm">
          {places.map((c) => (
            <button key={c.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(() => onPickCity(c))} className="flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#141417]">
              <span className="h-2.5 w-2.5 shrink-0" style={{ background: c.uf ? swatchOf(c.uf) : "#c8e64a" }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[11px] normal-case text-cream">{c.name}</span>
              <span className="text-[9px] text-muted">
                {c.uf ?? "Island"} · {fmt(c.devs.length)}
              </span>
            </button>
          ))}
          {unfounded.map((c) => (
            <button key={c.ibge} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(() => onFound(c))} className="flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#141417]">
              <span className="h-2.5 w-2.5 shrink-0 border border-border-light" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[11px] normal-case text-cream">{c.name}</span>
              <span className="text-[9px] text-muted">
                {c.uf} · <span className="text-lime">Found it</span>
              </span>
            </button>
          ))}
          {devs.map((b) => (
            <button key={b.loginLower} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(() => onPickBuilding(b))} className="flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#141417]">
              <Avatar src={b.avatar_url ?? null} size={20} />
              <span className="min-w-0 flex-1 truncate text-[11px] normal-case text-cream">@{b.login}</span>
              <span className="text-[9px] text-muted">{fmt(b.contributions ?? 0)}</span>
            </button>
          ))}
          {missing && (
            <div className="flex items-center justify-between gap-3 border-t-2 border-border px-3 py-2">
              <span className="min-w-0 truncate text-[10px] normal-case text-muted">@{missing} isn&apos;t on the map yet</span>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(() => onPutOnMap(missing))} className="shrink-0 bg-lime px-2.5 py-1 text-[10px] text-bg">
                Put it on the map
              </button>
            </div>
          )}
          {places.length === 0 && unfounded.length === 0 && devs.length === 0 && !missing && <p className="px-3 py-2 text-[10px] normal-case text-muted">Nothing on the map called “{query.trim()}”.</p>}
        </div>
      )}
    </div>
  );
}

/** How points are made, the same table the reels show: icon, one word, one plain line, the points and how often. */
const EARN: { icon: LucideIcon; pts: number; word: string; hint: string; cap: string }[] = [
  { icon: UserPlus, pts: 50, word: "Friend", hint: "Tag a friend in a comment. They join, you score.", cap: "10/week" },
  { icon: Instagram, pts: 20, word: "Story", hint: "Post a story tagging @samuelrizzondev.", cap: "1/day" },
  { icon: MapPin, pts: 20, word: "Join", hint: "Put your building on the map.", cap: "1×" },
  { icon: Code2, pts: 10, word: "Code", hint: "Commit on GitHub that day.", cap: "1/day" },
  { icon: VoteIcon, pts: 10, word: "Vote", hint: "Vote for president.", cap: "1×" },
  { icon: MessageCircle, pts: 5, word: "Comment", hint: "Comment on a reel.", cap: "1/day" },
  { icon: PaintRoller, pts: 1, word: "Paint", hint: "Drive a circle for your state. 1 per 20 lots of land.", cap: "20/day" },
];

export function PointsRules({ compact = false }: { compact?: boolean }) {
  return (
    <ul className="flex flex-col gap-1">
      {EARN.filter((e) => PRESIDENCY_ON || e.word !== "Vote").map((e) => (
        <li key={e.word} className={`flex items-center gap-3 border-2 border-border px-3 ${compact ? "py-2" : "py-2.5"}`}>
          <e.icon size={18} className="shrink-0 text-cream" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] text-cream">{e.word}</span>
            <span className="block text-[9px] normal-case text-muted">{e.hint}</span>
          </span>
          <span className="text-right">
            <span className="block text-sm tabular-nums text-lime">+{e.pts}</span>
            <span className="block text-[8px] text-dim">{e.cap}</span>
          </span>
        </li>
      ))}
      <li className="mt-2 px-1 text-[9px] normal-case text-muted">Your points → your state. #1 in each state = governor.</li>
    </ul>
  );
}

const STEP = 10;

/** When the week's points close (Monday 00:00 UTC, Sunday 21h in Brasília), in plain words. */
function WeekEnds() {
  const left = useCountdown();
  return (
    <p className="flex items-center gap-1.5 px-1 text-[9px] text-muted">
      <Clock size={12} aria-hidden /> Week ends in <span className="tabular-nums text-cream">{left}</span>
    </p>
  );
}

/** The table: 10 at a time and back, your state pinned under it while it's further down. */
function StatesTable({ ranked, points, yours, onPick }: { ranked: StateStats[]; points: Partial<Record<UF, number>>; yours: UF | null; onPick: (s: StateStats) => void }) {
  const [shown, setShown] = useState(STEP);
  const yourIndex = yours ? ranked.findIndex((s) => s.uf === yours) : -1;
  const left = ranked.length - shown;
  const row = (s: StateStats, i: number) => {
    const mine = s.uf === yours;
    return (
      <li key={s.uf}>
        <button
          type="button"
          onClick={() => onPick(s)}
          className={`flex w-full items-center gap-2 px-2 py-1.5 text-left ${mine ? "bg-lime text-bg" : `${i % 2 ? "" : "bg-white/[0.02]"} text-cream hover:text-lime`}`}
        >
          <span className={`flex w-5 justify-center text-[9px] tabular-nums ${mine ? "" : "text-muted"}`}>
            {i === 0 && (points[s.uf] ?? 0) > 0 ? <TrophyIcon size={11} className={mine ? "" : "text-lime"} label="First place" /> : i + 1}
          </span>
          <span className="w-6 text-[10px]">{s.uf}</span>
          <span className={`min-w-0 flex-1 truncate text-[9px] normal-case ${mine ? "" : "text-muted"}`}>{s.name}</span>
          {mine && <span className="bg-bg px-1.5 py-0.5 text-[8px] text-lime">You</span>}
          <span className={`w-10 text-right text-[9px] tabular-nums ${mine ? "" : "text-muted"}`}>{fmt(s.devs)}</span>
          <span className="w-14 text-right text-[11px] tabular-nums">{fmt(points[s.uf] ?? 0)}</span>
        </button>
      </li>
    );
  };
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b-2 border-border px-2 pb-1.5 text-[8px] text-dim">
        <span className="w-5 text-center">#</span>
        <span className="flex-1">State</span>
        <span className="w-10 text-right">Devs</span>
        <span className="w-14 text-right">Points</span>
      </div>
      <ol className="flex flex-col">{ranked.slice(0, shown).map(row)}</ol>
      {yourIndex >= shown && <ol className="mt-1 border-t-2 border-dashed border-border pt-1">{row(ranked[yourIndex], yourIndex)}</ol>}
      {(left > 0 || shown > STEP) && (
        <div className="mt-2 flex gap-1">
          {left > 0 && (
            <button type="button" onClick={() => setShown((n) => n + STEP)} className="btn-press flex min-h-10 flex-1 items-center justify-center gap-2 border-2 border-border text-[10px] text-cream hover:border-lime/60">
              <ChevronDown size={13} aria-hidden /> Show more <span className="text-dim">({left})</span>
            </button>
          )}
          {shown > STEP && (
            <button type="button" onClick={() => setShown(STEP)} className="btn-press flex min-h-10 flex-1 items-center justify-center gap-2 border-2 border-border text-[10px] text-muted hover:text-cream">
              <ChevronUp size={13} aria-hidden /> Show less
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Wider than a phone: the board in the middle. */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * A board over the dimmed map, in the middle of a wide screen: for things
 * read side by side (the table and how to score). Esc, the close button and
 * the dimmed map close it. It sits over the site's own notices (the email
 * card), which wait behind the dim until it closes: it renders on <body>,
 * since the map's page is a fixed layer whose children can't rise above them.
 */
export function Board({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const boxRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Focus moves into the board (not onto a button, which would show its ring before anyone touched a key).
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center p-6 font-pixel uppercase text-cream">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <section ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`${HUD_BOX} sheet-in relative outline-none flex max-h-[86vh] w-[min(820px,100%)] flex-col bg-bg/95 font-pixel uppercase text-warm`}>
        <header className="flex items-center justify-between border-b-2 border-border px-5 py-3">
          <h2 className="text-sm text-cream">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-press -mr-1.5 flex h-8 w-8 items-center justify-center text-muted transition-colors hover:text-cream">
            <X size={16} strokeWidth={2.5} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

/**
 * The 27 states by this week's points (devs break ties), your state picked
 * out. A board with the table and how to score side by side on a wide
 * screen; the sheet with two tabs on a phone.
 */
export function BrasilRanking({
  states,
  points,
  yours,
  onPick,
  onClose,
}: {
  states: StateStats[];
  /** Each state's points this week. */
  points: Partial<Record<UF, number>>;
  yours: UF | null;
  onPick: (s: StateStats) => void;
  onClose: () => void;
}) {
  const wide = useWide();
  const [tab, setTab] = useState<"table" | "points">("table");
  const ranked = useMemo(() => [...states].sort((a, b) => (points[b.uf] ?? 0) - (points[a.uf] ?? 0) || b.devs - a.devs || a.name.localeCompare(b.name)), [states, points]);
  const table = <StatesTable ranked={ranked} points={points} yours={yours} onPick={onPick} />;

  if (wide) {
    return (
      <Board title="States" onClose={onClose}>
        <div className="grid grid-cols-[1fr_300px] gap-5">
          <div className="flex min-w-0 flex-col gap-2">
            <WeekEnds />
            {table}
          </div>
          <div className="flex flex-col gap-2">
            <p className="px-1 text-[9px] text-muted">How to score</p>
            <PointsRules compact />
          </div>
        </div>
      </Board>
    );
  }
  return (
    <Panel title="States" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <div role="tablist" className="grid grid-cols-2 border-2 border-border">
          {(
            [
              ["table", Trophy, "Ranking"],
              ["points", Plus, "Points"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} className={`flex min-h-10 items-center justify-center gap-2 text-[10px] ${tab === id ? "bg-lime text-bg" : "text-muted hover:text-cream"}`}>
              <Icon size={13} aria-hidden /> {label}
            </button>
          ))}
        </div>
        <WeekEnds />
        {tab === "table" ? table : <PointsRules />}
      </div>
    </Panel>
  );
}

/**
 * Pick your city (or none: the island), right under the search: where you
 * typed your name is where you choose. Type it, or tap a state to see its
 * cities. A city nobody lives in yet is founded by whoever picks it first.
 * Moving gives you a new lot in the new city.
 */
export function BrasilPicker({
  signedIn,
  viewerLogin,
  forLogin,
  cities,
  current,
  pending,
  error,
  initialQuery = "",
  firstPick = false,
  onPick,
  onSignIn,
  onClose,
}: {
  signedIn: boolean;
  viewerLogin: string | null;
  /** Opened for a username typed in the search (maybe someone else's). */
  forLogin: string | null;
  /** The cities on the map, for who lives where. */
  cities: CityLayout[];
  /** Where you live now: a city's IBGE code, "island", or null when you're not on the map. */
  current: number | "island" | null;
  /** The city being placed in right now. */
  pending: { ibge: number | null; name: string } | null;
  error: string | null;
  /** Opened from the search for a city nobody lives in yet: its name. */
  initialQuery?: string;
  /** On the map with only a state: this pick is their city, free (not a move). */
  firstPick?: boolean;
  onPick: (city: { ibge: number | null; name: string }) => void;
  onSignIn: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !pending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);
  const [query, setQuery] = useState(initialQuery);
  const [state, setState] = useState<UF | null>(null);
  const br = useBrCities(signedIn);
  const someoneElse = !!forLogin && !!viewerLogin && forLogin !== viewerLogin.toLowerCase();
  const who = forLogin ?? viewerLogin?.toLowerCase() ?? null;
  const busy = pending !== null;
  const onMap = useMemo(() => new Map(cities.map((c) => [c.ibge, c])), [cities]);
  const q = query.trim();
  const results = useMemo((): { ibge: number; name: string; uf: UF }[] => {
    if (q.length >= 2 && br) return br.searchCities(q, 20, (ibge) => onMap.get(ibge)?.devs.length ?? 0).filter((c) => !state || c.uf === state).slice(0, 8);
    if (state) {
      // A state's cities on the map, biggest first, its capital among them.
      return cities
        .filter((c) => c.uf === state && c.ibge !== null)
        .sort((a, b) => b.devs.length - a.devs.length || Number(b.capital) - Number(a.capital))
        .slice(0, 8)
        .map((c) => ({ ibge: c.ibge!, name: c.name, uf: c.uf! }));
    }
    return [];
  }, [q, br, state, cities, onMap]);

  const row = (c: { ibge: number; name: string; uf: UF }) => {
    const here = onMap.get(c.ibge);
    const n = here?.devs.length ?? 0;
    const founder = here?.devs.find((d) => d.founder)?.dev.login;
    const mine = current === c.ibge;
    const now = pending?.ibge === c.ibge;
    return (
      <li key={c.ibge}>
        <button
          type="button"
          disabled={busy || mine}
          onClick={() => onPick({ ibge: c.ibge, name: c.name })}
          className={`flex w-full items-center gap-2.5 border-2 px-2.5 py-2 text-left transition-opacity ${now ? "border-lime bg-lime text-bg" : mine ? "border-lime text-lime" : "border-border text-cream hover:border-lime/60"} ${busy && !now ? "opacity-30" : ""} disabled:cursor-default`}
        >
          <span className="h-2 w-2 shrink-0 border border-border-light" style={{ background: swatchOf(c.uf) }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[11px] normal-case">
            {c.name} <span className={now ? "" : "text-muted"}>{c.uf}</span>
          </span>
          <span className={`shrink-0 text-[9px] normal-case ${now ? "" : n ? "text-muted" : "text-lime"}`}>{mine ? "You live here" : n ? `${fmt(n)} dev${n === 1 ? "" : "s"}${founder ? ` · @${founder}` : ""}` : "Nobody yet · found it"}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="pointer-events-auto mt-1 w-full border-[3px] sm:w-[min(420px,calc(100vw-32px))] border-border bg-bg/95 p-3 font-pixel uppercase text-cream shadow-[0_6px_0_rgba(0,0,0,0.35)] backdrop-blur-sm">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[11px]">
          {current && !someoneElse ? (firstPick ? "Pick your city" : "Move to another city") : who ? <>Put <span className="normal-case text-lime">@{who}</span> on the map</> : "Put your building on the map"}
        </p>
        <button type="button" disabled={busy} onClick={onClose} className="shrink-0 text-[10px] text-muted hover:text-cream disabled:opacity-40">
          ESC
        </button>
      </div>

      {someoneElse ? (
        <p className="text-[10px] normal-case text-muted">
          Only @{forLogin} can put their building here: they sign in with GitHub on this page, or comment their @ and city on the reel. You&apos;re signed in as @{viewerLogin}.
        </p>
      ) : !signedIn ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-[10px] normal-case text-muted">{forLogin ? `Is @${forLogin} you? ` : ""}Sign in with GitHub, pick your city, and your building goes up there.</p>
          <button type="button" onClick={onSignIn} className="btn-press border-2 border-lime bg-lime py-2 text-[11px] text-bg">
            Sign in with GitHub
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] normal-case text-muted">
            {current && !firstPick ? "Your building moves to a new lot there. You can move once a week." : "Your building goes up in your city. Nobody from there yet? You found it."}
          </p>
          <div className="flex items-stretch">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={state ? `A city in ${state}` : "Your city"}
              aria-label="Your city"
              type="search"
              name="brasil-city"
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              className="h-10 min-w-0 flex-1 border-2 border-border bg-bg px-3 text-base normal-case text-cream outline-none placeholder:text-dim focus:border-lime/70 sm:text-[12px] [&::-webkit-search-cancel-button]:hidden"
            />
            {state && (
              <button type="button" onClick={() => setState(null)} className="flex items-center gap-1.5 border-2 border-l-0 border-border px-2 text-[10px] text-cream" aria-label={`Any state (now ${state})`}>
                {state} <X size={12} aria-hidden />
              </button>
            )}
          </div>
          {results.length > 0 ? (
            <ul className="flex flex-col gap-1">{results.map(row)}</ul>
          ) : q.length >= 2 ? (
            <p className="px-1 text-[10px] normal-case text-muted">{br ? `No city called “${q}”.` : "Loading the cities…"}</p>
          ) : (
            <>
              <p className="px-1 text-[9px] text-dim">Or pick your state</p>
              <div className="grid grid-cols-7 gap-1">
                {STATES.map((s) => (
                  <button
                    key={s.uf}
                    type="button"
                    title={s.name}
                    disabled={busy}
                    onClick={() => setState(s.uf)}
                    className={`flex items-center justify-center gap-1 border-2 py-1.5 text-[10px] ${state === s.uf ? "border-lime text-lime" : "border-border text-cream hover:border-lime/60"}`}
                  >
                    <span className="h-2 w-2 shrink-0 border border-border-light" style={{ background: swatchOf(s.uf) }} aria-hidden />
                    {s.uf}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            type="button"
            disabled={busy || current === "island"}
            onClick={() => onPick({ ibge: null, name: "the island" })}
            className={`border-2 py-1.5 text-[10px] transition-opacity ${
              pending && pending.ibge === null ? "border-lime bg-lime text-bg" : current === "island" ? "border-lime text-lime" : "border-border text-muted hover:text-cream"
            } ${busy && pending?.ibge !== null ? "opacity-30" : ""}`}
          >
            No city · live on the island
          </button>
          {busy && (
            <div className="flex flex-col gap-1.5 pt-1">
              <p className="text-[10px] normal-case text-lime">Finding your lot in {pending!.name}…</p>
              <div className="h-1 animate-pulse bg-lime" />
            </div>
          )}
          {error && <p className="text-[10px] normal-case text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
