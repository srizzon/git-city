"use client";

import { useEffect, useState } from "react";
import { medalScores, type LiveSpot } from "@/lib/drift/spots/types";
import { DRIFT_CONTROLS, MEDAL_COLORS, fmt } from "./DriftHud";
import { Backdrop, Band, Chip } from "@/components/games/ui";

// Before the run, over the camera's wide shot, blurred and darkened so the
// bands carry the contrast: the spot's name on the lime band (like the start
// gantry's sign), what it is, the four medals, and your best; the world's top
// three on the right like a timing tower; one prompt. Loading is the same
// left column on black, with a block bar and the controls.

export interface BoardRowLite {
  rank: number;
  login: string;
  score: number;
}

// Sized to the shorter of height and width, so a phone held upright fits too.
const TEXT = { hero: "clamp(40px, min(11vh, 15vw), 128px)", big: "clamp(16px, min(3vh, 4.4vw), 34px)", body: "clamp(11px, min(1.7vh, 3.2vw), 18px)", small: "clamp(10px, min(1.4vh, 2.6vw), 15px)" };

function SpotBands({ spot, delay = 0 }: { spot: LiveSpot; delay?: number }) {
  return (
    <div className="flex flex-col items-start">
      <Band delay={delay} className="px-4 py-2 text-lime" style={{ fontSize: TEXT.small }}>
        Drift spot
      </Band>
      <Band tone="lime" delay={delay + 70} className="px-6 pb-3 pt-4 leading-none tracking-[0.04em]" style={{ fontSize: TEXT.hero }}>
        {spot.name}
      </Band>
      <Band delay={delay + 140} className="px-4 py-2.5 normal-case" style={{ fontSize: TEXT.body }}>
        {spot.tagline}
      </Band>
    </div>
  );
}

export function DriftLoading({ spot, ready }: { spot: LiveSpot; ready: boolean }) {
  const [progress, setProgress] = useState(0);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (ready) {
      const t = setTimeout(() => setGone(true), 450);
      return () => clearTimeout(t);
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setProgress(0.9 * (1 - Math.exp(-(now - start) / 1500)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);
  if (gone) return null;
  const filled = Math.round((ready ? 1 : progress) * 16);
  return (
    <div role="status" aria-live="polite" className={`fixed inset-0 z-50 flex items-center bg-bg px-[6vw] font-pixel uppercase transition-opacity duration-300 ${ready ? "opacity-0" : "opacity-100"}`}>
      <div className="flex flex-col gap-8">
        <SpotBands spot={spot} />
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className={`h-4 w-5 ${i < filled ? "bg-lime" : "bg-[#141417]"}`} />
          ))}
        </div>
        <div className="flex w-[min(460px,80vw)] flex-col items-stretch">
          {DRIFT_CONTROLS.map(([k, v], i) => (
            <Band key={k} delay={300 + i * 40} className="gap-6 px-4 py-2" style={{ fontSize: TEXT.small }}>
              <span className="w-[16ch] text-cream">{k}</span>
              <span className="text-muted">{v}</span>
            </Band>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DriftTitle({
  spot,
  best,
  board,
  you,
  challenger,
  rival,
  onStart,
  onSpots,
  exitLabel = "Spots",
}: {
  spot: LiveSpot;
  best: number | null;
  /** The world board, best first. */
  board: BoardRowLite[];
  you: string | null;
  challenger: string | null;
  rival: string | null;
  onStart: () => void;
  onSpots: () => void;
  /** The way out when it isn't the spots (a town's track: back to the city). */
  exitLabel?: string;
}) {
  const medals = medalScores(spot);
  const top = board.slice(0, 3);
  const mine = you ? board.find((r) => r.login.toLowerCase() === you.toLowerCase()) ?? null : null;
  return (
    <div className="pointer-events-none fixed inset-0 z-30 font-pixel uppercase">
      <Backdrop side="left" />

      {/* The spot */}
      <div className="absolute bottom-[16vh] left-4 right-4 flex flex-col items-start gap-5 md:bottom-[14vh] md:left-[6vw] md:right-auto md:max-w-[60vw]">
        {challenger && (
          <Band tone="cream" className="px-4 py-2 normal-case" style={{ fontSize: TEXT.body }}>
            @{challenger} challenges you
          </Band>
        )}
        <SpotBands spot={spot} delay={challenger ? 60 : 0} />
        <Band delay={260} className="flex-wrap gap-x-7 gap-y-2 px-5 py-3">
          {medals.map(([m, at]) => (
            <span key={m} className="flex items-baseline gap-2.5">
              <span style={{ color: MEDAL_COLORS[m], fontSize: TEXT.small }}>{m}</span>
              <span className="tabular-nums" style={{ fontSize: TEXT.body }}>
                {fmt(at)}
              </span>
            </span>
          ))}
        </Band>
        <div className="flex flex-wrap">
          <Band delay={480} className="gap-3 px-4 py-2" style={{ fontSize: TEXT.body }}>
            <span className="text-muted">Your best</span>
            <span className="tabular-nums">{best !== null ? fmt(best) : "no run yet"}</span>
          </Band>
          {rival && (
            <Band delay={520} className="gap-3 px-4 py-2 normal-case" style={{ fontSize: TEXT.body }}>
              <span className="uppercase text-muted">Ghost</span>@{rival}
            </Band>
          )}
        </div>
      </div>

      {/* The world's top three */}
      <div className="absolute right-[6vw] top-1/2 hidden w-[min(440px,34vw)] -translate-y-1/2 flex-col md:flex">
        <Band delay={200} className="justify-between px-4 py-2 text-lime" style={{ fontSize: TEXT.small }}>
          <span>World</span>
          <span className="text-muted">Top 3</span>
        </Band>
        {top.length === 0 && (
          <Band delay={260} className="px-4 py-3 text-muted" style={{ fontSize: TEXT.body }}>
            Nobody yet. Be first.
          </Band>
        )}
        {top.map((r, i) => {
          const me = !!you && r.login.toLowerCase() === you.toLowerCase();
          return (
            <Band key={r.login} tone={me ? "lime" : "dark"} delay={260 + i * 60} className="justify-between gap-4 px-4 py-2.5 tabular-nums" style={{ fontSize: TEXT.body }}>
              <span className="flex gap-4">
                <span className={me ? "" : "text-muted"}>{r.rank}</span>
                <span className="normal-case">@{r.login}</span>
              </span>
              <span>{fmt(r.score)}</span>
            </Band>
          );
        })}
        {mine && mine.rank > 3 && (
          <Band tone="lime" delay={460} className="mt-2 justify-between gap-4 px-4 py-2.5 tabular-nums" style={{ fontSize: TEXT.body }}>
            <span className="flex gap-4">
              <span>{mine.rank}</span>
              <span className="normal-case">@{mine.login}</span>
            </span>
            <span>{fmt(mine.score)}</span>
          </Band>
        )}
      </div>

      {/* What to do */}
      <div className="pointer-events-auto absolute bottom-[4vh] left-4 right-4 flex items-stretch md:bottom-[6vh] md:left-auto md:right-[6vw]">
        <button type="button" onClick={onSpots} className="drift-band flex items-center gap-3 bg-[#141417] px-5 text-cream shadow-[0_6px_0_rgba(0,0,0,0.35)] hover:text-lime" style={{ fontSize: TEXT.body, animationDelay: "560ms" }}>
          <Chip>Esc</Chip> {exitLabel}
        </button>
        <button type="button" onClick={onStart} autoFocus className="drift-band flex flex-1 items-center justify-center gap-3 bg-cream px-7 py-4 text-bg shadow-[0_6px_0_rgba(0,0,0,0.35)] outline-none hover:bg-lime focus-visible:bg-lime" style={{ fontSize: TEXT.big, animationDelay: "600ms" }}>
          <Chip tone="dark">Enter</Chip> Drift
        </button>
      </div>
      <div className="absolute bottom-[6vh] left-[6vw] hidden md:block">
        <Band delay={640} className="gap-3 px-4 py-2 text-muted" style={{ fontSize: TEXT.small }}>
          <Chip>Space</Chip> + steer to drift
        </Band>
      </div>
    </div>
  );
}
