"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Ghost as GhostIcon, Pause, Volume2, VolumeX, X } from "lucide-react";
import type { TrialStage } from "@/lib/league-city/race/trial";
import { DRIFT_SCORE, driftGrade, type SlideHint } from "@/lib/drift/score";
import { medalScores, type LiveSpot, type Medal } from "@/lib/drift/spots/types";
import type { DriftTelemetry } from "@/lib/drift/telemetry";
import { markSeen, seen } from "@/lib/drift/local";
import { Backdrop, Band, Chip } from "@/components/games/ui";

// The driving HUD in broadcast bands, on the scene as is (no blur while you
// drive). The center is the road: only the countdown, the live combo and a
// bank take it, and they leave. Top center, the combo at risk on the lime band
// with its multiplier, a grade word over it (Good, Great, Insane: Forza, CarX
// and NFS show a word, not degrees) and a bar under it that drains once you
// straighten; it turns orange and shakes as the chain runs out (Absolute
// Drift). A slide that doesn't count says why on the same spot, so a dead
// drift never looks like a scoring one. A bank pops on cream, a loss drops
// in red. Top left the banked total and the next medal; bottom right the
// speed. H hides it all, G the ghosts. Esc pauses over a blurred frame.

export const MEDAL_COLORS: Record<Medal, string> = { author: "#3ddc6b", gold: "#ffcf33", silver: "#cfd8e3", bronze: "#d98a4e" };

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export const DRIFT_CONTROLS: [string, string][] = [
  ["W A S D", "Drive"],
  ["Space + steer", "Drift"],
  ["Steer in / out", "Open / close the angle"],
  ["R", "Start over"],
  ["Enter", "Last checkpoint"],
  ["G / H", "Ghosts / HUD"],
  ["C", "Camera"],
  ["Esc", "Pause"],
];

const HINT_TEXT: Record<Exclude<SlideHint, null>, [string, string]> = {
  shallow: ["Too shallow", "Steer in to open the angle"],
  over: ["Too much angle", "Countersteer to close it"],
  slow: ["Too slow", "Carry more speed in"],
  off: ["Off the asphalt", "Back on the road"],
  wrong: ["Wrong way", "Turn around"],
  covered: ["Already driven", "Only new track scores"],
};

const FIRST_HINTS: { keys: string[]; text: string }[] = [
  { keys: ["Space", "←", "→"], text: "Hold to drift" },
  { keys: ["→"], text: "Steer in to open the angle" },
  { keys: ["↑"], text: "Straighten out to bank it" },
];
const FIRST_HINTS_TOUCH: { keys: string[]; text: string }[] = [
  { keys: ["Drift"], text: "Hold and drag to drift" },
  { keys: [], text: "Drag in to open the angle" },
  { keys: [], text: "Let go to bank it" },
];

// Sized to the shorter of height and width, so a phone held upright fits too.
const T = {
  count: "clamp(56px, min(13vh, 24vw), 150px)",
  combo: "clamp(30px, min(9vh, 10vw), 108px)",
  total: "clamp(22px, min(5vh, 7vw), 58px)",
  speed: "clamp(24px, min(5.5vh, 8vw), 64px)",
  mid: "clamp(12px, min(2.2vh, 3.4vw), 24px)",
  small: "clamp(10px, min(1.4vh, 2.6vw), 15px)",
};

/** What the center of the screen shows. */
type Center =
  | { kind: "none" }
  | { kind: "combo"; warn: boolean }
  | { kind: "hint"; hint: Exclude<SlideHint, null> }
  | { kind: "bank"; points: number; at: number }
  | { kind: "lost"; points: number; at: number };

export interface DriftHudProps {
  spot: LiveSpot;
  telemetry: DriftTelemetry;
  ready: boolean;
  stage: TrialStage;
  paused: boolean;
  muted: boolean;
  showGhosts: boolean;
  best: number | null;
  /** World board scores, best first (for the live rank). */
  boardScores: number[];
  /** The ghost you race besides your own: named under the goal, so you know who the tag ahead is. */
  rival?: { login: string; color: string; score: number } | null;
  onToggleGhosts: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onPause: (on: boolean) => void;
  onRestart: () => void;
  onRespawn: () => void;
  onExit: () => void;
  /** The pause menu's way out, when it isn't back to the spots (a town's track: back to the city). */
  exitLabel?: string;
  /** A phone: the touch controls show the speed, the prompts speak touch. */
  touch?: boolean;
  /** A room with friends: their live scores under yours, and no starting over mid-run. */
  room?: React.ReactNode;
}

function same(a: Center, b: Center): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "combo" && b.kind === "combo") return a.warn === b.warn;
  if (a.kind === "hint" && b.kind === "hint") return a.hint === b.hint;
  if ((a.kind === "bank" || a.kind === "lost") && (b.kind === "bank" || b.kind === "lost")) return a.at === b.at;
  return true;
}

export default function DriftHud(p: DriftHudProps) {
  const { telemetry: tel } = p;
  const totalBand = useRef<HTMLSpanElement>(null);
  const total = useRef<HTMLSpanElement>(null);
  const rank = useRef<HTMLSpanElement>(null);
  const goal = useRef<HTMLSpanElement>(null);
  const goalBar = useRef<HTMLSpanElement>(null);
  const risk = useRef<HTMLSpanElement>(null);
  const mult = useRef<HTMLSpanElement>(null);
  const grade = useRef<HTMLSpanElement>(null);
  const chain = useRef<HTMLSpanElement>(null);
  const comboBox = useRef<HTMLDivElement>(null);
  const speed = useRef<HTMLSpanElement>(null);
  const split = useRef<HTMLSpanElement>(null);
  const [center, setCenter] = useState<Center>({ kind: "none" });
  const [cue, setCue] = useState("");
  const [hidden, setHidden] = useState(false);
  const [hint, setHint] = useState<number | null>(null);

  const medals = medalScores(p.spot);
  const live = p.ready && (p.stage === "countdown" || p.stage === "run");

  const toggles = useRef({ ghosts: p.onToggleGhosts });
  useEffect(() => {
    toggles.current = { ghosts: p.onToggleGhosts };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      if (e.code === "KeyH") setHidden((h) => !h);
      if (e.code === "KeyG") toggles.current.ghosts();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The first run anywhere: three prompts, each at the moment it applies.
  const hintState = useRef({ on: false, step: 0, since: 0 });
  useEffect(() => {
    const h = hintState.current;
    if (p.stage === "run" && !seen("hints")) h.on = true;
    else if (p.stage === "finish" && h.on) {
      h.on = false;
      markSeen("hints");
      setHint(null);
    }
  }, [p.stage]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const d = tel.drift;
      const now = performance.now();
      const banked = d ? d.score : 0;
      if (total.current) total.current.textContent = fmt(banked);
      const running = banked + (d?.risk ?? 0);
      if (rank.current) {
        const n = p.boardScores.length;
        const above = p.boardScores.filter((s) => s > running).length;
        rank.current.textContent = n === 0 ? "" : above >= n ? `#${n}+` : `#${above + 1}`;
      }
      const next = [...medals].reverse().find(([, at]) => at > banked) ?? null;
      if (goal.current) goal.current.textContent = next ? `Next · ${next[0]} ${fmt(next[1])}` : "Author beaten";
      if (goalBar.current) {
        goalBar.current.style.transform = `scaleX(${next ? Math.min(1, banked / next[1]) : 1})`;
        goalBar.current.style.background = next ? MEDAL_COLORS[next[0]] : MEDAL_COLORS.author;
      }
      if (speed.current) speed.current.textContent = String(Math.round(Math.abs(tel.speed) * 3.6));
      if (split.current) {
        const sp = tel.split;
        const on = !!sp && now - sp.at < 2500;
        split.current.style.opacity = on ? "1" : "0";
        if (sp && on) {
          split.current.textContent = `${sp.delta >= 0 ? "+" : "−"}${fmt(Math.abs(sp.delta))}`;
          split.current.style.background = sp.delta >= 0 ? "#c8e64a" : "#ff5a52";
        }
      }

      // The center: a bank or a loss holds it for a beat, else the combo, else why a slide doesn't count.
      const f = tel.feed[0];
      let want: Center = { kind: "none" };
      if (f && f.kind === "bank" && now - f.at < 900) want = { kind: "bank", points: f.points, at: f.at };
      else if (f && f.kind === "lost" && now - f.at < 1000) want = { kind: "lost", points: f.points, at: f.at };
      else if (d && d.risk > 0) want = { kind: "combo", warn: d.gap / DRIFT_SCORE.chainMax > 0.4 };
      else if (d?.hint) want = { kind: "hint", hint: d.hint };
      setCenter((c) => (same(c, want) ? c : want));
      // The total flashes lime as a bank lands in it.
      if (totalBand.current) totalBand.current.dataset.flash = String(!!f && f.kind === "bank" && now - f.at < 600);

      if (d && d.risk > 0) {
        if (risk.current) risk.current.textContent = fmt(d.risk);
        if (mult.current) mult.current.textContent = `×${d.mult.toFixed(1)}`;
        if (grade.current) grade.current.textContent = d.drifting ? `${driftGrade(d.angle, d.kmh)} drift` : "Link the next one";
        const left = d.gap / DRIFT_SCORE.chainMax;
        if (chain.current) chain.current.style.transform = `scaleX(${d.drifting ? 1 : Math.max(0, 1 - left)})`;
        if (comboBox.current) {
          const shake = left > 0.4 ? (left - 0.4) * 10 : 0;
          comboBox.current.style.transform = shake ? `translate(${(Math.random() - 0.5) * shake}px, ${(Math.random() - 0.5) * shake}px)` : "";
        }
      }

      const h = hintState.current;
      if (h.on && d) {
        let step = h.step;
        if (h.step === 0 && d.drifting) step = 1;
        if (h.step === 1 && now - h.since > 3500) step = 2;
        if (h.step === 2 && now - h.since > 3500 && d.risk === 0) step = 3;
        if (step !== h.step) {
          h.step = step;
          h.since = now;
        }
        setHint((cur) => {
          const nx = h.step < FIRST_HINTS.length ? h.step : null;
          return cur === nx ? cur : nx;
        });
      }
      const n = tel.countdown;
      const nextCue = n !== null && n > 0 ? String(n) : now - tel.goAt < 800 ? "Go" : "";
      setCue((c) => (c === nextCue ? c : nextCue));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // medals come from the spot, which doesn't change on the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tel, p.boardScores]);

  const btn = "flex h-11 items-center gap-2 bg-[#141417] px-3 text-cream shadow-[0_6px_0_rgba(0,0,0,0.35)] hover:text-lime";

  return (
    <div className="pointer-events-none fixed inset-0 z-30 font-pixel uppercase">
      {/* Countdown: a square band, cream for the numbers, lime for GO */}
      {cue && (
        <div className="absolute left-1/2 top-[27%] -translate-x-1/2 -translate-y-1/2">
          <span
            key={cue}
            className={`flex animate-[drift-pop_0.32s_ease-out_both] items-center justify-center px-[0.3em] leading-none shadow-[0_10px_0_rgba(0,0,0,0.35)] ${cue === "Go" ? "bg-lime text-bg" : "bg-cream text-bg"}`}
            style={{ fontSize: T.count, minWidth: "1.5em", height: "1.4em" }}
          >
            {cue}
          </span>
        </div>
      )}

      {live && !hidden && (
        <>
          {/* Banked total, the next medal, the live rank, a split */}
          <div className="absolute left-[3vw] top-[4vh] flex flex-col items-stretch">
            <span ref={totalBand} data-flash="false" className="flex items-baseline justify-between gap-5 bg-[#141417] px-4 py-2 text-cream shadow-[0_6px_0_rgba(0,0,0,0.35)] transition-colors duration-200 data-[flash=true]:bg-lime data-[flash=true]:text-bg">
              <span ref={total} className="leading-none tabular-nums" style={{ fontSize: T.total }}>
                0
              </span>
              <span ref={rank} className="opacity-60" style={{ fontSize: T.small }} />
            </span>
            <Band animate={false} className="flex-col items-stretch gap-1.5 px-4 pb-2 pt-1.5">
              <span ref={goal} className="text-muted" style={{ fontSize: T.small }} />
              <span className="block h-1 w-full bg-bg">
                <span ref={goalBar} className="block h-full w-full origin-left" />
              </span>
            </Band>
            {p.rival && p.showGhosts && (
              <Band animate={false} className="items-center justify-between gap-4 px-4 py-1.5" style={{ fontSize: T.small }}>
                <span className="flex items-center gap-2">
                  <span className="block h-2.5 w-2.5" style={{ background: p.rival.color }} />
                  <span className="text-muted">vs</span>
                  <span className="text-cream">@{p.rival.login}</span>
                </span>
                <span className="text-muted tabular-nums">{fmt(p.rival.score)}</span>
              </Band>
            )}
            {p.room}
            <span ref={split} className="mt-2 self-start px-3 py-1 text-bg tabular-nums opacity-0 shadow-[0_6px_0_rgba(0,0,0,0.35)] transition-opacity" style={{ fontSize: T.mid }} />
          </div>

          {/* The center */}
          <div className={`absolute left-1/2 flex -translate-x-1/2 flex-col items-center ${p.touch ? "top-[19vh]" : "top-[5vh]"}`}>
            {center.kind === "combo" && (
              <div ref={comboBox} className="flex flex-col items-stretch">
                <Band animate={false} className={`justify-center px-4 py-1.5 ${center.warn ? "text-[#ff9a3c]" : "text-lime"}`} style={{ fontSize: T.mid }}>
                  <span ref={grade} />
                </Band>
                <Band animate={false} tone={center.warn ? "orange" : "lime"} className="items-baseline justify-center gap-4 px-6 py-2">
                  <span ref={risk} className="leading-none tabular-nums" style={{ fontSize: T.combo }} />
                  <span ref={mult} className="tabular-nums" style={{ fontSize: `calc(${T.combo} * 0.42)` }} />
                </Band>
                <span className="block h-2.5 bg-[#141417] shadow-[0_6px_0_rgba(0,0,0,0.35)]">
                  <span ref={chain} className={`block h-full w-full origin-left ${center.warn ? "bg-[#ff9a3c]" : "bg-cream"}`} />
                </span>
              </div>
            )}
            {center.kind === "bank" && (
              <div key={center.at} className="flex animate-[drift-pop_0.3s_ease-out_both] flex-col items-stretch">
                <Band animate={false} className="justify-center px-4 py-1.5 text-lime" style={{ fontSize: T.mid }}>
                  Banked
                </Band>
                <Band animate={false} tone="cream" className="px-6 py-2 leading-none tabular-nums" style={{ fontSize: T.combo }}>
                  +{fmt(center.points)}
                </Band>
              </div>
            )}
            {center.kind === "lost" && (
              <div key={center.at} className="flex animate-[drift-drop_1s_ease-in_both] flex-col items-stretch">
                <Band animate={false} className="justify-center px-4 py-1.5 text-[#ff5a52]" style={{ fontSize: T.mid }}>
                  Lost
                </Band>
                <Band animate={false} tone="red" className="px-6 py-2 leading-none tabular-nums line-through decoration-[6px]" style={{ fontSize: T.combo }}>
                  {fmt(center.points)}
                </Band>
              </div>
            )}
            {center.kind === "hint" && (
              <div className="flex flex-col items-center">
                <Band animate={false} tone="orange" className="px-5 py-2" style={{ fontSize: T.mid }}>
                  {HINT_TEXT[center.hint][0]}
                </Band>
                <Band animate={false} className="px-4 py-1.5 normal-case" style={{ fontSize: T.small }}>
                  {HINT_TEXT[center.hint][1]}
                </Band>
              </div>
            )}
          </div>

          {/* Speed (the touch controls show it on a phone) */}
          <div className={`absolute bottom-[5vh] right-[3vw] ${p.touch ? "hidden" : ""}`}>
            <Band animate={false} className="items-baseline gap-3 px-4 py-2.5">
              <span ref={speed} className="w-[3ch] text-right leading-none tabular-nums" style={{ fontSize: T.speed }}>
                0
              </span>
              <span className="text-muted" style={{ fontSize: T.small }}>
                km/h
              </span>
            </Band>
          </div>

          {/* First-run prompts */}
          {hint !== null && (
            <div className={`absolute left-1/2 -translate-x-1/2 ${p.touch ? "bottom-[150px]" : "bottom-[8vh]"}`}>
              <Band className="gap-3 whitespace-nowrap px-4 py-3" style={{ fontSize: T.mid }}>
                {(p.touch ? FIRST_HINTS_TOUCH : FIRST_HINTS)[hint].keys.map((k) => (
                  <Chip key={k}>{k}</Chip>
                ))}
                <span>{(p.touch ? FIRST_HINTS_TOUCH : FIRST_HINTS)[hint].text}</span>
              </Band>
            </div>
          )}
        </>
      )}

      {/* Buttons */}
      {live && !hidden && p.touch && (
        <div className="pointer-events-auto absolute right-[3vw] top-[4vh]">
          <button type="button" onClick={() => p.onPause(true)} title="Pause" className={`${btn} text-[11px]`}>
            <Pause size={14} /> Pause
          </button>
        </div>
      )}
      {live && !hidden && !p.touch && (
        <div className="pointer-events-auto absolute right-[3vw] top-[4vh] flex gap-1">
          <button type="button" onClick={p.onToggleGhosts} title="Ghosts (G)" className={`${btn} ${p.showGhosts ? "" : "text-muted"}`}>
            <GhostIcon size={16} />
          </button>
          <button type="button" onClick={p.onToggleCamera} title="Camera (C)" className={btn}>
            <Camera size={16} />
          </button>
          <button type="button" onClick={p.onToggleMute} title="Sound" className={btn}>
            {p.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button type="button" onClick={() => p.onPause(true)} title="Pause (Esc)" className={`${btn} text-[11px]`}>
            <X size={14} /> Exit
          </button>
        </div>
      )}

      {p.paused && <PauseMenu {...p} medals={medals} />}
    </div>
  );
}

function PauseMenu(p: DriftHudProps & { medals: [Medal, number][] }) {
  const next = [...p.medals].reverse().find(([, at]) => p.best === null || at > p.best) ?? null;
  const items: { id: string; chip?: string; label: string; act: () => void }[] = [
    { id: "resume", chip: "Esc", label: "Resume", act: () => p.onPause(false) },
    ...(p.room ? [] : [{ id: "restart", chip: "R", label: "Start over", act: () => { p.onPause(false); p.onRestart(); } }]),
    ...(p.stage === "run" ? [{ id: "checkpoint", label: "Last checkpoint", act: () => { p.onPause(false); p.onRespawn(); } }] : []),
    { id: "spots", chip: "Q", label: p.room ? "Leave the room" : (p.exitLabel ?? "Back to spots"), act: p.onExit },
  ];
  const [sel, setSel] = useState(0);
  // A game menu: ↑↓ (or W S) choose, Enter or Space picks, the letters jump straight there. Esc lives on the page.
  const cb = useRef({ items, sel });
  useEffect(() => {
    cb.current = { items, sel };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const { items: list, sel: at } = cb.current;
      const go = (d: number) => {
        e.preventDefault();
        setSel((list.length + at + d) % list.length);
      };
      if (e.code === "ArrowUp" || e.code === "KeyW") go(-1);
      else if (e.code === "ArrowDown" || e.code === "KeyS") go(1);
      else if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
        e.preventDefault();
        list[at]?.act();
      } else if (e.code === "KeyR") {
        e.preventDefault();
        list.find((x) => x.id === "restart")?.act();
      } else if (e.code === "KeyQ") {
        e.preventDefault();
        list.find((x) => x.id === "spots")?.act();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="pointer-events-auto absolute inset-0">
      <Backdrop side="left" />
      <div className="absolute left-[6vw] top-1/2 flex -translate-y-1/2 flex-col items-start gap-5">
        <Band tone="lime" className="px-6 pb-3 pt-4 leading-none tracking-[0.08em]" style={{ fontSize: "clamp(44px, 9vh, 104px)" }}>
          Paused
        </Band>
        <div role="menu" className="flex w-[min(420px,80vw)] flex-col items-stretch" style={{ fontSize: T.mid }}>
          {items.map((it, i) => {
            const on = i === sel;
            return (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                onClick={it.act}
                onMouseEnter={() => setSel(i)}
                className={`drift-band flex items-center gap-4 px-5 py-3 text-left shadow-[0_6px_0_rgba(0,0,0,0.35)] outline-none ${on ? "bg-cream text-bg" : "bg-[#141417] text-cream"}`}
                style={{ animationDelay: `${60 + i * 50}ms` }}
              >
                <span className={`w-3 ${on ? "" : "opacity-0"}`}>▶</span>
                <span className="flex-1">{it.label}</span>
                {it.chip && <Chip tone={on ? "dark" : "cream"}>{it.chip}</Chip>}
              </button>
            );
          })}
          <Band delay={300} className="justify-center gap-3 px-5 py-2 text-muted" style={{ fontSize: T.small }}>
            <Chip>↑</Chip>
            <Chip>↓</Chip> choose <Chip>Enter</Chip> select
          </Band>
        </div>
      </div>
      <div className="absolute right-[6vw] top-1/2 flex w-[min(360px,30vw)] -translate-y-1/2 flex-col items-stretch">
        <Band delay={120} className="px-4 py-2 text-lime" style={{ fontSize: T.small }}>
          {p.spot.name}
        </Band>
        <Band delay={170} className="justify-between gap-3 px-4 py-2" style={{ fontSize: T.mid }}>
          <span className="text-muted">Your best</span>
          <span className="tabular-nums">{p.best !== null ? fmt(p.best) : "-"}</span>
        </Band>
        {next && (
          <Band delay={220} className="justify-between gap-3 px-4 py-2" style={{ fontSize: T.mid }}>
            <span style={{ color: MEDAL_COLORS[next[0]] }}>{next[0]}</span>
            <span className="tabular-nums">{fmt(next[1])}</span>
          </Band>
        )}
      </div>
    </div>
  );
}
