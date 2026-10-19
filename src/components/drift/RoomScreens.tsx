"use client";

import { useEffect, useRef, useState } from "react";
import { carColor } from "@/lib/league-city/drive/net";
import { SERIES, standings, type Series } from "@/lib/drift/series";
import { SPOTS } from "@/lib/drift/spots";
import type { LiveSpot, SpotId } from "@/lib/drift/spots/types";
import { fmt } from "./DriftHud";
import { Backdrop, Band, Chip } from "@/components/games/ui";

// A room with friends, in the drift screens' bands. The lobby (before each
// run, and for whoever came in mid-run): the room's code, the spot, who's in
// with their points; the host picks the spot (← →) and starts (Enter). The
// results after each run: the run's places with the points they gave, then
// the series; after the third run, the champion. Esc leaves the room.

const T = { hero: "clamp(40px, min(11vh, 14vw), 128px)", big: "clamp(16px, min(3vh, 4.4vw), 34px)", body: "clamp(11px, min(1.8vh, 3.2vw), 19px)", small: "clamp(10px, min(1.4vh, 2.6vw), 15px)" };
const LIVE = SPOTS.filter((s): s is LiveSpot => s.status === "live");
const act = "drift-band flex items-center gap-3 shadow-[0_6px_0_rgba(0,0,0,0.35)]";
const same = (a: string | null, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

export interface RoomActions {
  onSpot: (spot: SpotId) => void;
  onStart: () => void;
  onFinal: () => void;
  onRematch: () => void;
  onLeave: () => void;
}

/** Keys for whatever the screen offers: Enter the main action, ← → the spot, C the link, Esc out. */
function useRoomKeys(keys: { enter?: () => void; spot?: (d: number) => void; copy?: () => void; leave: () => void }) {
  const ref = useRef(keys);
  useEffect(() => {
    ref.current = keys;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = ref.current;
      if ((e.code === "Enter" || e.code === "NumpadEnter") && k.enter) {
        e.preventDefault();
        k.enter();
      } else if ((e.code === "ArrowLeft" || e.code === "KeyA") && k.spot) k.spot(-1);
      else if ((e.code === "ArrowRight" || e.code === "KeyD") && k.spot) k.spot(1);
      else if (e.code === "KeyC" && k.copy) k.copy();
      else if (e.key === "Escape") k.leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Swatch({ login }: { login: string }) {
  return <span className="block h-2.5 w-2.5 shrink-0" style={{ background: carColor(login) }} aria-hidden />;
}

/** The series so far: everyone, most points first. */
function Table({ series, you, delay = 0 }: { series: Series; you: string; delay?: number }) {
  return (
    <div className="flex flex-col">
      {standings(series).map((p, i) => {
        const mine = same(you, p.login);
        return (
          <Band
            key={p.login}
            tone={mine ? "lime" : "dark"}
            delay={delay + i * 60}
            className={`justify-between gap-4 px-5 tabular-nums ${mine ? "py-2.5" : "py-2"}`}
            style={{ fontSize: mine ? T.body : T.small }}
          >
            <span className="flex items-center gap-4">
              <span className={mine ? "" : "text-muted"}>{i + 1}</span>
              {!mine && <Swatch login={p.login} />}
              <span className={`normal-case ${p.online ? "" : "opacity-50"}`}>@{p.login}</span>
              {same(series.host, p.login) && <span className={mine ? "" : "text-lime"}>host</span>}
            </span>
            {series.round > 0 && <span>{p.points} pts</span>}
          </Band>
        );
      })}
    </div>
  );
}

/** The host's pick of spot for the next run (← →). */
function SpotPicker({ series, onSpot }: { series: Series; onSpot: (s: SpotId) => void }) {
  return (
    <span className="pointer-events-auto flex gap-1" style={{ fontSize: T.small }}>
      {LIVE.map((s) => {
        const on = s.id === series.spot;
        return (
          <button key={s.id} type="button" onClick={() => onSpot(s.id)} className={`${act} px-4 py-2 ${on ? "bg-lime text-bg" : "bg-[#141417] text-cream hover:text-lime"}`}>
            {s.name}
          </button>
        );
      })}
    </span>
  );
}

export function RoomLobby({ series, spot, code, you, ...a }: RoomActions & { series: Series; spot: LiveSpot; code: string; you: string }) {
  const host = same(series.host, you);
  const [copied, setCopied] = useState(false);
  const running = series.phase === "countdown" || series.phase === "run";
  const next = Math.min(SERIES.rounds, series.round + 1);
  const copy = () => {
    const url = `${window.location.origin}/drift/r/${code}`;
    // A phone shares it (the group chat is one tap away); a computer copies it.
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      void navigator.share({ title: "Drift with me in Git City", url }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(url).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  const step = (d: number) => {
    const i = LIVE.findIndex((s) => s.id === series.spot);
    a.onSpot(LIVE[(i + d + LIVE.length) % LIVE.length].id);
  };
  useRoomKeys({ enter: host && !running ? a.onStart : undefined, spot: host && !running ? step : undefined, copy, leave: a.onLeave });

  return (
    <div className="pointer-events-none fixed inset-0 z-40 font-pixel uppercase">
      <Backdrop side="left" />
      <div className="absolute left-4 right-4 top-[6vh] flex flex-col items-start gap-5 md:left-[6vw] md:right-auto md:top-[12vh]">
        <div className="flex flex-col items-start">
          <Band className="px-4 py-2 text-lime" style={{ fontSize: T.small }}>
            Room {code}
          </Band>
          <Band tone="lime" delay={70} className="px-6 pb-3 pt-4 leading-none tracking-[0.04em]" style={{ fontSize: T.hero }}>
            {spot.name}
          </Band>
          <Band delay={140} className="px-4 py-2.5" style={{ fontSize: T.body }}>
            {running
              ? `Run ${series.round} of ${SERIES.rounds} under way · you race the next one`
              : series.round === 0
                ? `${SERIES.rounds} runs · points by place · most points wins`
                : `Next: run ${next} of ${SERIES.rounds}`}
          </Band>
          {!running && (
            <Band delay={210} className="px-4 py-2 text-muted" style={{ fontSize: T.small }}>
              {host ? (
                "You're the host: pick the spot, then start"
              ) : (
                <span>
                  <span className="normal-case text-cream">@{series.host}</span> picks the spot and starts
                </span>
              )}
            </Band>
          )}
        </div>
        {!running && host && <SpotPicker series={series} onSpot={a.onSpot} />}
      </div>

      <div className="absolute bottom-[22vh] left-4 right-4 flex flex-col md:bottom-auto md:left-auto md:right-[6vw] md:top-[12vh] md:w-[min(460px,36vw)]">
        <Band className="justify-between px-5 py-2.5 text-muted" style={{ fontSize: T.small }}>
          <span>In the room</span>
          <span>
            {series.players.filter((p) => p.online).length} / {SERIES.maxPlayers}
          </span>
        </Band>
        <Table series={series} you={you} delay={60} />
        {series.players.filter((p) => p.online).length === 1 && (
          <Band delay={120} className="px-5 py-2.5 normal-case text-lime" style={{ fontSize: T.small }}>
            Just you so far. Send the invite link to race your friends.
          </Band>
        )}
      </div>

      <div className="pointer-events-auto absolute bottom-[4vh] left-4 right-4 flex flex-wrap justify-end md:bottom-[6vh] md:left-auto md:right-[6vw]" style={{ fontSize: T.body }}>
        <button type="button" onClick={a.onLeave} className={`${act} bg-[#141417] px-4 py-3 text-cream hover:text-lime`}>
          <Chip>Esc</Chip> Leave
        </button>
        <button type="button" onClick={copy} className={`${act} bg-[#141417] px-4 py-3 text-cream hover:text-lime`}>
          <Chip>C</Chip> {copied ? "Link copied" : "Invite link"}
        </button>
        {!running && host && (
          <button type="button" onClick={a.onStart} className={`${act} bg-lime px-5 py-3 text-bg`}>
            <Chip tone="dark">Enter</Chip> Start run {next}
          </button>
        )}
      </div>
    </div>
  );
}

export function RoomResults({ series, spot, you, ...a }: RoomActions & { series: Series; spot: LiveSpot; you: string }) {
  const host = same(series.host, you);
  const over = series.phase === "results" || series.phase === "final";
  const final = series.phase === "final";
  const last = series.round >= SERIES.rounds;
  const champ = final ? standings(series)[0] : null;
  const step = (d: number) => {
    const i = LIVE.findIndex((s) => s.id === series.spot);
    a.onSpot(LIVE[(i + d + LIVE.length) % LIVE.length].id);
  };
  const main = !over || !host ? undefined : final ? a.onRematch : last ? a.onFinal : a.onStart;
  useRoomKeys({ enter: main, spot: host && series.phase === "results" && !last ? step : undefined, leave: a.onLeave });
  // Through the line first, the rest still out there (their live score, muted).
  const rows = over ? series.grid : [...series.grid].sort((x, y) => Number(y.done) - Number(x.done) || (y.score ?? y.live) - (x.score ?? x.live));
  const out = series.grid.filter((e) => !e.done).length;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 font-pixel uppercase">
      <Backdrop side="right" />
      <div className="absolute left-4 right-4 top-[5vh] flex flex-col items-stretch md:left-auto md:right-[6vw] md:top-[10vh] md:w-[min(620px,46vw)]">
        {final && champ ? (
          <>
            <Band className="px-5 py-2.5 text-lime" style={{ fontSize: T.small }}>
              Champion · {SERIES.rounds} runs
            </Band>
            <Band tone="lime" delay={60} className="gap-5 px-6 pb-4 pt-5 normal-case leading-none" style={{ fontSize: T.hero }}>
              @{champ.login}
            </Band>
            <div className="mt-5">
              <Table series={series} you={you} delay={200} />
            </div>
          </>
        ) : (
          <>
            <Band className="justify-between px-5 py-2.5" style={{ fontSize: T.small }}>
              <span className="text-lime">
                {spot.name} · run {series.round} of {SERIES.rounds}
              </span>
              {!over && <span className="text-muted">{out} still out</span>}
            </Band>
            <div className="flex flex-col">
              {rows.map((e, i) => {
                const mine = same(you, e.login);
                const dnf = over && e.score === null;
                return (
                  <Band
                    key={e.login}
                    tone={mine ? "lime" : "dark"}
                    delay={i * 60}
                    className={`justify-between gap-4 px-5 tabular-nums ${mine ? "py-3" : "py-2"}`}
                    style={{ fontSize: mine ? T.body : T.small }}
                  >
                    <span className="flex items-center gap-4">
                      <span className={mine ? "" : "text-muted"}>{e.done && !dnf ? i + 1 : "–"}</span>
                      {!mine && <Swatch login={e.login} />}
                      <span className="normal-case">@{e.login}</span>
                    </span>
                    <span className="flex gap-5">
                      <span className={e.done ? "" : "opacity-50"}>{dnf ? "DNF" : fmt(e.score ?? e.live)}</span>
                      {over && <span className="w-[4ch] text-right">+{e.gained}</span>}
                    </span>
                  </Band>
                );
              })}
            </div>
            {over && (
              <div className="mt-5 flex flex-col">
                <Band className="px-5 py-2.5 text-muted" style={{ fontSize: T.small }}>
                  Series
                </Band>
                <Table series={series} you={you} delay={rows.length * 60 + 120} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="pointer-events-auto absolute bottom-[4vh] left-4 right-4 flex flex-wrap items-stretch justify-end md:bottom-[6vh] md:left-auto md:right-[6vw]" style={{ fontSize: T.body }}>
        {series.phase === "results" && !last && host && <SpotPicker series={series} onSpot={a.onSpot} />}
        <button type="button" onClick={a.onLeave} className={`${act} bg-[#141417] px-4 py-3 text-cream hover:text-lime`}>
          <Chip>Esc</Chip> Leave
        </button>
        {over && host && (
          <button type="button" onClick={main} className={`${act} bg-lime px-5 py-3 text-bg`}>
            <Chip tone="dark">Enter</Chip> {final ? "Rematch" : last ? "Final standings" : `Start run ${series.round + 1}`}
          </button>
        )}
        {over && !host && (
          <span className={`${act} bg-[#141417] px-5 py-3 text-muted`}>
            Waiting for <span className="normal-case text-cream">@{series.host}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** The room in the driving HUD: everyone's live score this run. */
export function RoomStandings({ series, you }: { series: Series; you: string }) {
  const rows = [...series.grid].sort((x, y) => (y.score ?? y.live) - (x.score ?? x.live));
  return (
    <div className="mt-2 flex flex-col" style={{ fontSize: T.small }}>
      {rows.map((e, i) => {
        const mine = same(you, e.login);
        return (
          <Band key={e.login} animate={false} tone={mine ? "lime" : "dark"} className="justify-between gap-4 px-4 py-1 tabular-nums">
            <span className="flex items-center gap-2">
              <span className={mine ? "" : "text-muted"}>{i + 1}</span>
              {!mine && <Swatch login={e.login} />}
              <span className="max-w-[14ch] truncate normal-case">@{e.login}</span>
            </span>
            <span className={e.done ? "" : mine ? "" : "text-muted"}>{fmt(e.score ?? e.live)}</span>
          </Band>
        );
      })}
    </div>
  );
}
