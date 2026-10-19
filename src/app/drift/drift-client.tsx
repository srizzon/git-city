"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { Backdrop, Band, Chip } from "@/components/games/ui";
import { PixelSelect, type PixelOption } from "@/components/ui/PixelSelect";
import { MEDAL_COLORS, fmt } from "@/components/drift/DriftHud";
import type { BoardRowLite } from "@/components/drift/DriftTitle";
import { loadRun } from "@/lib/drift/local";
import { roomCode } from "@/lib/drift/ticket";
import { SPOTS } from "@/lib/drift/spots";
import { medalFor, medalScores, type LiveSpot, type SpotId } from "@/lib/drift/spots/types";

// The drift spots, in broadcast bands over the chosen spot's photo, blurred:
// the list on the left (live spots first, the ones to come locked), the
// chosen spot's board on the right (the world or your country, your own row
// pinned even far down, any row a ghost to race). ↑↓ choose a spot, ←→ switch
// the board, Enter drifts. F opens a room with friends (a new code, a link to share).

export interface SpotBoard {
  rows: BoardRowLite[];
  total: number;
  me: BoardRowLite | null;
}

const COUNTRY = new Intl.DisplayNames(["en"], { type: "region" });
const T = { hero: "clamp(52px, 11vh, 128px)", big: "clamp(18px, 2.8vh, 30px)", body: "clamp(12px, 1.8vh, 19px)", small: "clamp(10px, 1.4vh, 15px)" };
// ISO 3166-1 alpha-2, every country, named in English and sorted by name.
const CODES = "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WS XK YE YT ZA ZM ZW".split(" ");
const flag = (cc: string) => String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
const COUNTRY_OPTIONS: PixelOption[] = CODES.map((cc) => ({ cc, name: COUNTRY.of(cc) ?? cc }))
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(({ cc, name }) => ({ value: cc, label: `${flag(cc)} ${name}`, hint: cc }));

export default function DriftClient({
  boards,
  viewerLogin,
  country: initialCountry,
  initial,
}: {
  boards: Record<string, SpotBoard>;
  viewerLogin: string | null;
  country: string | null;
  initial: string;
}) {
  const router = useRouter();
  const [sel, setSel] = useState(Math.max(0, SPOTS.findIndex((s) => s.id === initial)));
  const [tab, setTab] = useState<"world" | "country">("world");
  const [country, setCountry] = useState(initialCountry);
  const [countryBoards, setCountryBoards] = useState<Record<string, SpotBoard>>({});
  const [local, setLocal] = useState<Record<string, number>>({});
  useEffect(() => {
    const read = () => {
      const out: Record<string, number> = {};
      for (const s of SPOTS) {
        const r = s.status === "live" ? loadRun(s.id) : null;
        if (r) out[s.id] = r.score;
      }
      setLocal(out);
    };
    read();
  }, []);

  const spot = SPOTS[sel];
  const live = spot.status === "live" ? (spot as LiveSpot) : null;
  const bestOf = useCallback(
    (id: SpotId) => {
      const b = boards[id]?.me?.score ?? null;
      const l = local[id] ?? null;
      return b === null ? l : l === null ? b : Math.max(b, l);
    },
    [boards, local],
  );

  // The country board, fetched the first time it's shown.
  useEffect(() => {
    if (tab !== "country" || !live || !country) return;
    const key = `${live.id}:${country}`;
    if (countryBoards[key]) return;
    let on = true;
    fetch(`/api/drift/${live.id}/board?scope=${country}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: BoardRowLite[]; total: number; me: BoardRowLite | null }>) : null))
      .then((b) => {
        if (on && b) setCountryBoards((m) => ({ ...m, [key]: { rows: b.rows.slice(0, 10), total: b.total, me: b.me } }));
      })
      .catch(() => {
        // offline: the tab stays empty
      });
    return () => {
      on = false;
    };
  }, [tab, live, country, countryBoards]);

  const board: SpotBoard | null = live ? (tab === "world" ? boards[live.id] : country ? countryBoards[`${live.id}:${country}`] ?? null : null) : null;

  const go = useCallback((login?: string) => {
    const s = SPOTS[sel];
    if (s.status !== "live") return;
    router.push(login ? `/drift/${s.id}?ghost=${encodeURIComponent(login)}` : `/drift/${s.id}`);
  }, [router, sel]);

  const pickCountry = useCallback(
    (cc: string) => {
      setCountry(cc);
      setTab("country");
      if (viewerLogin) {
        void fetch("/api/drift/country", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country: cc }) });
      }
    },
    [viewerLogin],
  );

  const openRoom = useCallback(
    (from: "button" | "key") => {
      const code = roomCode();
      posthog.capture("drift_room_created", { code, from });
      router.push(`/drift/r/${code}`);
    },
    [router],
  );
  const keys = useRef({ go, sel, openRoom });
  useEffect(() => {
    keys.current = { go, sel, openRoom };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // The country picker takes its own keys (↑↓ Enter Esc, typing to search).
      if (e.repeat || el?.closest('[aria-haspopup="listbox"], [role="listbox"], input')) return;
      if (document.querySelector('[role="listbox"]')) return;
      if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        setSel((i) => (i + 1) % SPOTS.length);
      } else if (e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        setSel((i) => (i - 1 + SPOTS.length) % SPOTS.length);
      } else if (e.code === "ArrowLeft" || e.code === "KeyA") setTab("world");
      else if (e.code === "ArrowRight" || e.code === "KeyD") setTab("country");
      else if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        keys.current.go();
      } else if (e.code === "KeyF") keys.current.openRoom("key");
      else if (e.key === "Escape") router.push("/towns");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const medals = useMemo(() => (live ? medalScores(live) : []), [live]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg font-pixel uppercase text-cream">
      {live && (
        // eslint-disable-next-line @next/next/no-img-element -- a local still, blurred behind the bands
        <img key={live.id} src={`/drift/${live.id}.jpg`} alt="" className="absolute inset-0 h-full w-full scale-105 animate-[drift-blur-in_0.4s_ease-out_both] object-cover" />
      )}
      <Backdrop side="left" />

      <div className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[1500px] flex-col gap-10 px-[5vw] py-[5vh] lg:flex-row lg:items-center lg:justify-between">
          {/* The spots */}
          <section className="flex flex-col items-start gap-6">
            <Link href="/towns" className="text-muted hover:text-cream" style={{ fontSize: T.small }}>
              ← Towns
            </Link>
            <div className="flex flex-col items-start">
              <Band tone="lime" className="px-6 pb-3 pt-4 leading-none tracking-[0.06em]" style={{ fontSize: T.hero }}>
                Drift
              </Band>
              <Band delay={70} className="px-4 py-2.5 normal-case" style={{ fontSize: T.body }}>
                Spots outside every town. One board for everyone.
              </Band>
            </div>
            <div role="listbox" aria-label="Drift spots" className="flex w-[min(560px,90vw)] flex-col">
              {SPOTS.map((s, i) => {
                const on = i === sel;
                const best = s.status === "live" ? bestOf(s.id) : null;
                const medal = s.status === "live" ? medalFor(s as LiveSpot, best) : null;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => (on ? go() : setSel(i))}
                    onMouseEnter={() => setSel(i)}
                    className={`drift-band flex items-center gap-5 px-5 py-3.5 text-left shadow-[0_6px_0_rgba(0,0,0,0.35)] outline-none ${on ? "bg-cream text-bg" : "bg-[#141417] text-cream"} ${s.status === "soon" && !on ? "text-muted" : ""}`}
                    style={{ animationDelay: `${140 + i * 50}ms`, fontSize: T.body }}
                  >
                    <span className={`w-3 ${on ? "" : "opacity-0"}`}>▶</span>
                    <span className="w-6 tabular-nums opacity-60">{i + 1}</span>
                    <span className="flex-1">{s.name}</span>
                    {s.status === "soon" ? (
                      <span className="opacity-60" style={{ fontSize: T.small }}>
                        Soon
                      </span>
                    ) : (
                      <span className="flex items-baseline gap-3 tabular-nums">
                        {medal && (
                          <span style={{ color: on ? undefined : MEDAL_COLORS[medal], fontSize: T.small }} className={on ? "opacity-70" : ""}>
                            {medal}
                          </span>
                        )}
                        <span>{best !== null ? fmt(best) : "-"}</span>
                      </span>
                    )}
                  </button>
                );
              })}
              <Band delay={480} className="justify-center gap-3 px-5 py-2 text-muted" style={{ fontSize: T.small }}>
                <Chip>↑</Chip>
                <Chip>↓</Chip> spot <Chip>←</Chip>
                <Chip>→</Chip> board <Chip>Enter</Chip> drift
              </Band>
            </div>
            <button
              type="button"
              onClick={() => openRoom("button")}
              className="drift-band flex w-[min(560px,90vw)] items-center justify-between gap-4 bg-lime px-5 py-3.5 text-left text-bg shadow-[0_6px_0_rgba(0,0,0,0.35)] outline-none hover:bg-cream focus-visible:bg-cream"
              style={{ animationDelay: "540ms", fontSize: T.body }}
            >
              <span className="flex items-center gap-4">
                <Chip tone="dark">F</Chip> Drift with friends
              </span>
              <span className="opacity-70" style={{ fontSize: T.small }}>
                3 runs · points
              </span>
            </button>
          </section>

          {/* The chosen spot */}
          <section key={spot.id} className="flex w-[min(620px,90vw)] flex-col items-stretch">
            <Band className="justify-between px-5 py-2.5" style={{ fontSize: T.small }}>
              <span className="text-lime">{spot.name}</span>
              <span className="text-muted">{live ? `${fmt(boards[live.id]?.total ?? 0)} drivers` : "Opens soon"}</span>
            </Band>
            <Band delay={50} className="px-5 py-3 normal-case" style={{ fontSize: T.body }}>
              {spot.tagline}
            </Band>
            {live && (
              <>
                <Band delay={100} className="flex-wrap gap-x-6 gap-y-1 px-5 py-2.5">
                  {medals.map(([m, at]) => (
                    <span key={m} className="flex items-baseline gap-2">
                      <span style={{ color: MEDAL_COLORS[m], fontSize: T.small }}>{m}</span>
                      <span className="tabular-nums" style={{ fontSize: T.small }}>
                        {fmt(at)}
                      </span>
                    </span>
                  ))}
                </Band>

                <div className="mt-5 flex items-stretch" style={{ fontSize: T.small }}>
                  <button type="button" onClick={() => setTab("world")} className={`drift-band px-5 py-2.5 shadow-[0_6px_0_rgba(0,0,0,0.35)] ${tab === "world" ? "bg-lime text-bg" : "bg-[#141417] text-cream hover:text-lime"}`} style={{ animationDelay: "150ms" }}>
                    World
                  </button>
                  <button type="button" onClick={() => setTab("country")} className={`drift-band px-5 py-2.5 shadow-[0_6px_0_rgba(0,0,0,0.35)] ${tab === "country" ? "bg-lime text-bg" : "bg-[#141417] text-cream hover:text-lime"}`} style={{ animationDelay: "180ms" }}>
                    {country ? COUNTRY.of(country) ?? country : "Country"}
                  </button>
                  {/* No band animation here: its clip would cut the open menu off. */}
                  <div className="ml-auto w-[min(260px,45vw)] shadow-[0_6px_0_rgba(0,0,0,0.35)]">
                    <PixelSelect
                      value={country ?? ""}
                      onChange={pickCountry}
                      options={COUNTRY_OPTIONS}
                      placeholder="Pick your country"
                      ariaLabel="Your country"
                      searchable
                      searchPlaceholder="Search a country"
                      className="h-full [&>button]:h-full [&>button]:bg-[#141417]"
                    />
                  </div>
                </div>

                <div className="mt-2 flex flex-col">
                  {!board && tab === "country" && (
                    <Band className="px-5 py-3 text-muted" style={{ fontSize: T.body }}>
                      {country ? "Loading…" : "Pick your country to see its board"}
                    </Band>
                  )}
                  {board && board.rows.length === 0 && (
                    <Band className="px-5 py-3 text-muted" style={{ fontSize: T.body }}>
                      Nobody yet. Be first.
                    </Band>
                  )}
                  {board?.rows.map((r, i) => {
                    const mine = !!viewerLogin && r.login.toLowerCase() === viewerLogin.toLowerCase();
                    return (
                      <button
                        key={`${r.rank}-${r.login}`}
                        type="button"
                        onClick={() => go(r.login)}
                        title={`Race @${r.login}'s ghost`}
                        className={`drift-band group flex items-center justify-between gap-4 px-5 py-2 text-left tabular-nums shadow-[0_6px_0_rgba(0,0,0,0.35)] ${mine ? "bg-lime text-bg" : "bg-[#141417] text-cream hover:text-lime"}`}
                        style={{ animationDelay: `${220 + i * 40}ms`, fontSize: T.small }}
                      >
                        <span className="flex gap-5">
                          <span className={`w-6 ${mine ? "" : "text-muted"}`}>{r.rank}</span>
                          <span className="normal-case">@{r.login}</span>
                        </span>
                        <span className="flex gap-4">
                          <span className="opacity-0 group-hover:opacity-100">Race ghost</span>
                          <span>{fmt(r.score)}</span>
                        </span>
                      </button>
                    );
                  })}
                  {board?.me && !board.rows.some((r) => r.login.toLowerCase() === board.me!.login.toLowerCase()) && (
                    <Band tone="lime" className="mt-2 justify-between gap-4 px-5 py-2.5 tabular-nums" style={{ fontSize: T.body }}>
                      <span className="flex gap-5">
                        <span>{board.me.rank}</span>
                        <span className="normal-case">@{board.me.login}</span>
                      </span>
                      <span>{fmt(board.me.score)}</span>
                    </Band>
                  )}
                </div>

                <div className="mt-5 flex justify-end">
                  <button type="button" onClick={() => go()} className="drift-band flex items-center gap-3 bg-cream px-7 py-4 text-bg shadow-[0_6px_0_rgba(0,0,0,0.35)] outline-none hover:bg-lime focus-visible:bg-lime" style={{ fontSize: T.big, animationDelay: "320ms" }}>
                    <Chip tone="dark">Enter</Chip> Drift {spot.name}
                  </button>
                </div>
              </>
            )}
            {!live && (
              <Band delay={100} className="px-5 py-3 text-muted" style={{ fontSize: T.body }}>
                A new spot opens every week or two. Harbor and Touge are open now.
              </Band>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
