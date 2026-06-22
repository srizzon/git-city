"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────

export type LoadingStage =
  | "init"
  | "fetching"
  | "generating"
  | "rendering"
  | "ready"
  | "done"
  | "error";

interface LoadingScreenProps {
  stage: LoadingStage;
  progress: number;
  error: string | null;
  stats?: { total_developers: number; total_contributions: number };
  onRetry: () => void;
  onFadeComplete: () => void;
}

interface TermLine {
  id: number;
  cls: "cmd" | "out" | "remote" | "step" | "welcome" | "error" | "blank";
  text: string;
  done?: boolean;
  typing?: boolean;
}

// ─── Constants ─────────────────────────────────────────────────

const LIME = "#c8e64a";

// Static facts about the baked SF map (public/maps/sf.json). The map file
// only changes when scripts/bake-sf-map.mjs reruns, so these are constants.
const BUILDINGS = 169458;
const STREETS = 4883;
const PARKS = 327;
const SF_KIB = 2724; // 2,789,497 bytes

// Fallbacks for when the snapshot stats haven't arrived yet (script reaches
// the developer lines before fetch completes on slow connections).
const FALLBACK_DEVS = 83586;
const FALLBACK_CONTRIBS = 72132124;

const EASTER_EGGS = [
  "remote: warning: 3 devs pushed to main on a Friday",
  "remote: hint: fog detected over Golden Gate, rendering anyway",
  "remote: 42 merge conflicts resolved peacefully today",
  "remote: note: someone force-pushed. the city forgives.",
  "remote: tip: tallest building belongs to whoever commits most",
];

const KEEPALIVE = [
  "remote: still receiving objects...",
  "remote: network is slow, hang tight...",
  "remote: almost there...",
];

// Script plays at this relaxed pace by default; when the real load finishes
// (stage === "ready") the clock runs at READY_BOOST so it wraps up fast.
const READY_BOOST = 10;
const TICK_MS = 40;

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

// ─── Component ─────────────────────────────────────────────────

export default function LoadingScreen({
  stage,
  error,
  stats,
  onRetry,
  onFadeComplete,
}: LoadingScreenProps) {
  const [lines, setLines] = useState<TermLine[]>([]);
  const [showCursor, setShowCursor] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [fading, setFading] = useState(false);

  const lineIdRef = useRef(0);
  const stageRef = useRef(stage);
  const statsRef = useRef(stats);
  const [restartKey, setRestartKey] = useState(0);

  const isError = stage === "error";

  useEffect(() => {
    stageRef.current = stage;
    statsRef.current = stats;
  }, [stage, stats]);

  // ── Line helpers ──────────────────────────────────────────────

  const addLine = useCallback((cls: TermLine["cls"], text: string, extra?: Partial<TermLine>) => {
    const id = ++lineIdRef.current;
    setLines((prev) => [...prev, { id, cls, text, ...extra }]);
    return id;
  }, []);

  const updateLine = useCallback((id: number, patch: Partial<TermLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  // ── Script engine ─────────────────────────────────────────────

  useEffect(() => {
    let aborted = false;
    const alive = () => !aborted && stageRef.current !== "error";

    // Sleeps `virtualMs` of script time; real time shrinks when the city is
    // already loaded so the script fast-forwards instead of holding the user.
    // Boosted ticks overshoot small sleeps (e.g. per-character typing), so the
    // surplus carries over as credit — without it every sleep would still cost
    // a full real tick and the fast-forward would crawl.
    let credit = 0;
    const vsleep = async (virtualMs: number) => {
      if (credit >= virtualMs) {
        credit -= virtualMs;
        return;
      }
      let remaining = virtualMs - credit;
      credit = 0;
      while (remaining > 0) {
        if (!alive()) throw new Error("aborted");
        await new Promise((r) => setTimeout(r, TICK_MS));
        const speed = stageRef.current === "ready" ? READY_BOOST : 1;
        remaining -= TICK_MS * speed;
      }
      credit = -remaining;
    };

    const typeCmd = async (text: string) => {
      const id = addLine("cmd", "", { typing: true });
      let typed = "";
      for (const ch of text) {
        typed += ch;
        updateLine(id, { text: typed });
        await vsleep(12 + Math.random() * 14);
      }
      updateLine(id, { typing: false });
    };

    const progressLine = async (
      cls: TermLine["cls"],
      render: (p: number) => string,
      virtualMs: number,
    ) => {
      const id = addLine(cls, render(0));
      let consumed = 0;
      while (consumed < virtualMs) {
        await vsleep(60);
        consumed += 60;
        // occasional stall, like a real network
        if (Math.random() < 0.15) continue;
        updateLine(id, { text: render(Math.min(1, consumed / virtualMs)) });
      }
      updateLine(id, { text: render(1) });
    };

    const task = async (label: string, virtualMs: number) => {
      const id = addLine("step", label);
      await vsleep(virtualMs);
      updateLine(id, { done: true });
    };

    async function run() {
      setLines([]);
      setShowCursor(false);
      setFlashing(false);
      setFading(false);

      const devs = () => statsRef.current?.total_developers || FALLBACK_DEVS;
      const contribs = () => statsRef.current?.total_contributions || FALLBACK_CONTRIBS;

      await typeCmd("git clone git@git.city:world/san-francisco.git");
      await vsleep(150);
      addLine("out", "Cloning into 'san-francisco'...");
      await vsleep(200);

      addLine("remote", `remote: Enumerating buildings: ${fmt(BUILDINGS)}, done.`);
      await vsleep(180);
      await progressLine(
        "remote",
        (p) =>
          `remote: Counting developers: ${Math.floor(p * 100)}% (${fmt(p * devs())}/${fmt(devs())})${p >= 1 ? ", done." : ""}`,
        300,
      );

      if (Math.random() < 0.6) {
        await vsleep(120);
        addLine("remote", EASTER_EGGS[Math.floor(Math.random() * EASTER_EGGS.length)]);
      }
      await vsleep(150);

      await progressLine(
        "out",
        (p) => {
          const kib = p * SF_KIB;
          const size = kib >= 1024 ? `${(kib / 1024).toFixed(2)} MiB` : `${Math.floor(kib)} KiB`;
          const tail = p >= 1 ? "done." : `${(1.4 + Math.random() * 1.2).toFixed(2)} MiB/s`;
          return `Receiving objects: ${Math.floor(p * 100)}% (${fmt(p * BUILDINGS)}/${fmt(BUILDINGS)}), ${size} | ${tail}`;
        },
        800,
      );

      await progressLine(
        "out",
        (p) =>
          `Resolving streets: ${Math.floor(p * 100)}% (${fmt(p * STREETS)}/${fmt(STREETS)})${p >= 1 ? ", done." : ""}`,
        350,
      );

      addLine("out", "Checking out the skyline... done.");
      await vsleep(180);
      addLine("blank", "");

      await typeCmd("cd san-francisco && npm run city");
      await vsleep(150);

      await task("compiling shaders", 200);
      await task(`planting ${fmt(PARKS)} parks`, 180);
      await task(`indexing ${fmt(contribs())} contributions`, 200);
      await task(`turning on ${fmt(BUILDINGS)} lights`, 250);

      addLine("blank", "");
      addLine("welcome", `Welcome to GIT CITY — population ${fmt(devs())}`);
      setShowCursor(true);

      // Script finished before the real load? Blink and drop a keep-alive
      // line every few seconds so it never looks frozen.
      let waited = 0;
      let keepaliveIdx = 0;
      while (stageRef.current !== "ready") {
        if (!alive()) throw new Error("aborted");
        await new Promise((r) => setTimeout(r, TICK_MS));
        waited += TICK_MS;
        if (waited >= 4000 && keepaliveIdx < KEEPALIVE.length) {
          addLine("remote", KEEPALIVE[keepaliveIdx++]);
          waited = 0;
        }
      }
      await vsleep(500 * READY_BOOST); // brief hold on the welcome line (real ms × boost)

      // Exit: the terminal "executes" the city — flash, then fade out.
      if (!alive()) throw new Error("aborted");
      setShowCursor(false);
      setFlashing(true);
      await new Promise((r) => setTimeout(r, 120));
      if (!alive()) throw new Error("aborted");
      setFading(true);
    }

    run().catch(() => { /* aborted: unmount, error stage, or retry */ });

    return () => {
      aborted = true;
    };
  }, [restartKey, addLine, updateLine]);

  // On error the script self-aborts (alive() checks stageRef every tick) and
  // the fatal lines render declaratively below. Retry replays from the top.
  const handleRetry = useCallback(() => {
    setRestartKey((k) => k + 1);
    onRetry();
  }, [onRetry]);

  const handleTransitionEnd = useCallback(() => {
    if (fading) onFadeComplete();
  }, [fading, onFadeComplete]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      className={`fixed inset-0 z-100 bg-bg transition-opacity duration-400 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      onTransitionEnd={handleTransitionEnd}
    >
      <style>{`
        @keyframes gc-cursor { 50% { opacity: 0; } }
        @keyframes gc-flicker { 0%, 97%, 99%, 100% { opacity: 1; } 98% { opacity: 0.92; } }
        @keyframes gc-flash { 0% { opacity: 0; } 15% { opacity: 0.9; } 100% { opacity: 0; } }
      `}</style>

      <div className="flex h-full items-center justify-center p-6">
        <div
          className="w-full max-w-2xl overflow-hidden font-pixel text-[11px] leading-[1.9] tracking-wide sm:text-xs"
          style={{
            fontVariantNumeric: "tabular-nums",
            textShadow: `0 0 6px ${LIME}40`,
            animation: "gc-flicker 4s infinite",
          }}
        >
          {lines.map((l) => (
            <div key={l.id} className="min-h-[1.9em] whitespace-pre-wrap break-all">
              {l.cls === "cmd" && (
                <>
                  <span style={{ color: LIME }}>$ </span>
                  <span className="text-neutral-300">{l.text}</span>
                  {l.typing && <Cursor />}
                </>
              )}
              {l.cls === "out" && <span className="text-neutral-300">{l.text}</span>}
              {l.cls === "remote" && <span className="text-neutral-500">{l.text}</span>}
              {l.cls === "step" && (
                <span className="text-neutral-500">
                  {"  ▸ "}{l.text}...{l.done && <span style={{ color: LIME }}> done</span>}
                </span>
              )}
              {l.cls === "welcome" && <span style={{ color: LIME }}>{l.text}</span>}
              {l.cls === "error" && <span className="text-[#e05252]">{l.text}</span>}
            </div>
          ))}

          {showCursor && !isError && (
            <div className="min-h-[1.9em]">
              <span style={{ color: LIME }}>$ </span>
              <Cursor />
            </div>
          )}

          {isError && (
            <>
              <div className="min-h-[1.9em]" />
              <div className="min-h-[1.9em] text-[#e05252]">
                {`fatal: unable to access 'git.city': ${error ?? "something went wrong"}`}
              </div>
              <div className="min-h-[1.9em] text-[#e05252]">
                hint: check your connection and try again
              </div>
              <button
                onClick={handleRetry}
                className="btn-press mt-4 px-6 py-2 font-pixel text-xs text-bg"
                style={{ backgroundColor: LIME }}
              >
                RETRY
              </button>
            </>
          )}
        </div>
      </div>

      {/* CRT scanlines + vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0.18) 4px)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Exit flash */}
      {flashing && (
        <div
          className="pointer-events-none absolute inset-0 bg-white"
          style={{ animation: "gc-flash 500ms ease-out forwards" }}
        />
      )}
    </div>
  );
}

function Cursor() {
  return (
    <span
      className="inline-block h-[1.1em] w-2 align-text-bottom"
      style={{ backgroundColor: LIME, animation: "gc-cursor 1s steps(1) infinite" }}
    />
  );
}
