"use client";

import { useEffect, useState, useRef } from "react";
import type { RaidPhase } from "@/lib/useRaidSequence";
import type { RaidExecuteResponse } from "@/lib/raid";

interface Props {
  phase: RaidPhase;
  raidData: RaidExecuteResponse | null;
  onSkip: () => void;
  onExit: () => void;
}

function AnimatedScore({ target, duration = 1200 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (target <= 0) return;
    startRef.current = null;

    function animate(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }, [target, duration]);

  return <span>{value}</span>;
}

export default function RaidOverlay({ phase, raidData, onSkip, onExit }: Props) {
  const [barsVisible, setBarsVisible] = useState(false);
  const [revealStep, setRevealStep] = useState(0);
  const [flashPhase, setFlashPhase] = useState<"none" | "peak" | "fading">("none");

  // Cinema bars shown during cinematic phases, retract on share
  const showBars = phase !== "idle" && phase !== "preview" && phase !== "done" && phase !== "share";
  const showText = phase === "intro" || phase === "flight" || phase === "attack" || phase === "outro_win" || phase === "outro_lose";
  const showScore = phase === "share";

  useEffect(() => {
    if (showBars) {
      requestAnimationFrame(() => setBarsVisible(true));
    } else {
      setBarsVisible(false);
    }
  }, [showBars]);

  // Screen flash on explosion
  useEffect(() => {
    if (phase === "outro_win") {
      setFlashPhase("peak");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFlashPhase("fading");
        });
      });
      const timer = setTimeout(() => setFlashPhase("none"), 700);
      return () => clearTimeout(timer);
    } else {
      setFlashPhase("none");
    }
  }, [phase]);

  // Staggered reveal for result screen
  useEffect(() => {
    if (!showScore) {
      setRevealStep(0);
      return;
    }

    // Layer 1 (0ms): dark backdrop
    setRevealStep(1);

    // Layer 2 (300ms): headline
    const t1 = setTimeout(() => setRevealStep(2), 300);
    // Layer 3 (800ms): score counters
    const t2 = setTimeout(() => setRevealStep(3), 800);
    // Layer 4 (1800ms): XP + actions
    const t3 = setTimeout(() => setRevealStep(4), 1800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [showScore]);

  if (!showBars && !showText && !showScore) return null;

  const attackerLogin = raidData?.attacker?.login ?? "???";
  const defenderLogin = raidData?.defender?.login ?? "???";
  const isWin = raidData?.success;

  let phaseText = "";
  switch (phase) {
    case "intro":
      phaseText = `${attackerLogin} vs ${defenderLogin}`;
      break;
    case "flight":
      phaseText = `Approaching target`;
      break;
    case "attack":
      phaseText = `Engaging`;
      break;
    case "outro_win":
      phaseText = `${defenderLogin} has fallen`;
      break;
    case "outro_lose":
      phaseText = `Attack repelled`;
      break;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[55]">
      {/* Screen flash on explosion */}
      {flashPhase !== "none" && (
        <div
          className="fixed inset-0 z-[60] bg-white"
          style={{
            opacity: flashPhase === "peak" ? 0.9 : 0,
            transition: flashPhase === "fading" ? "opacity 0.6s ease-out" : "none",
          }}
        />
      )}

      {/* Cinema bars - retract on share phase */}
      <div
        className="absolute left-0 right-0 top-0 bg-black"
        style={{
          height: barsVisible ? "12vh" : 0,
          transition: "height 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 bg-black"
        style={{
          height: barsVisible ? "12vh" : 0,
          transition: "height 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />

      {/* Phase text (cinematic phases only) */}
      {showText && (
        <div
          className="absolute left-1/2 top-[14vh] -translate-x-1/2"
          style={{
            opacity: barsVisible ? 1 : 0,
            transform: `translateX(-50%) translateY(${barsVisible ? "0" : "10px"})`,
            transition: "opacity 0.5s ease-in-out, transform 0.5s ease-in-out",
          }}
        >
          <p className="font-silkscreen text-center text-sm tracking-wide text-cream drop-shadow-lg md:text-base">
            {phaseText}
          </p>
        </div>
      )}

      {/* ── Full-Screen Result Reveal ── */}
      {showScore && raidData && (
        <>
          {/* Layer 1: Dark backdrop */}
          <div
            className="fixed inset-0 bg-black/80"
            style={{
              opacity: revealStep >= 1 ? 1 : 0,
              transition: "opacity 0.4s ease-out",
            }}
          />

          {/* Centered content container */}
          <div className="pointer-events-auto fixed inset-0 flex flex-col items-center justify-center px-4">
            {/* Layer 2: Headline */}
            <div
              style={{
                opacity: revealStep >= 2 ? 1 : 0,
                transform: `scale(${revealStep >= 2 ? 1 : 1.5})`,
                transition: "opacity 0.4s ease-out, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <h1
                className={`font-silkscreen text-center text-4xl tracking-wider drop-shadow-lg md:text-6xl ${
                  isWin ? "text-red-400" : "text-blue-400"
                }`}
              >
                {isWin ? "CONQUERED" : "DEFENDED"}
              </h1>
              <p className="mt-2 text-center font-silkscreen text-xs tracking-wide text-cream/60 md:text-sm">
                {isWin
                  ? `${attackerLogin} raided ${defenderLogin}`
                  : `${defenderLogin} held the line`}
              </p>
            </div>

            {/* Layer 3: Score Counters */}
            <div
              className="mt-8 flex items-center justify-center gap-8 md:gap-12"
              style={{
                opacity: revealStep >= 3 ? 1 : 0,
                transform: `translateY(${revealStep >= 3 ? "0" : "20px"})`,
                transition: "opacity 0.5s ease-out, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <div className="text-center">
                <p className="text-[9px] uppercase tracking-wider text-muted/60">Attack</p>
                <p className="font-silkscreen text-5xl text-red-400 md:text-7xl">
                  <AnimatedScore target={raidData.attack_score} />
                </p>
                <div className="mt-1 space-y-0.5 text-[9px] text-muted/60">
                  <p>{raidData.attack_breakdown.commits} commits</p>
                  <p>{raidData.attack_breakdown.streak} streak</p>
                  <p>{raidData.attack_breakdown.kudos} kudos</p>
                  {raidData.attack_breakdown.boost ? <p>{raidData.attack_breakdown.boost} boost</p> : null}
                </div>
              </div>

              <span className="font-silkscreen text-2xl text-muted/40 md:text-3xl">vs</span>

              <div className="text-center">
                <p className="text-[9px] uppercase tracking-wider text-muted/60">Defense</p>
                <p className="font-silkscreen text-5xl text-blue-400 md:text-7xl">
                  <AnimatedScore target={raidData.defense_score} />
                </p>
                <div className="mt-1 space-y-0.5 text-[9px] text-muted/60">
                  <p className="whitespace-pre-line">{raidData.defense_breakdown.commits} commits \n 获得{raidData.defense_breakdown.commits} 提交</p>
                  <p className="whitespace-pre-line">{raidData.defense_breakdown.streak} streak \n 获得{raidData.defense_breakdown.streak} 连胜</p>
                  <p className="whitespace-pre-line">{raidData.defense_breakdown.kudos} kudos \n 获得{raidData.defense_breakdown.kudos} kudos</p>
                </div>
              </div>
            </div>

            {/* Layer 4: XP + Actions */}
            <div
              className="mt-8 flex w-full max-w-xs flex-col items-center gap-3"
              style={{
                opacity: revealStep >= 4 ? 1 : 0,
                transform: `translateY(${revealStep >= 4 ? "0" : "15px"})`,
                transition: "opacity 0.5s ease-out, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              {/* XP earned */}
              {raidData.xp_earned > 0 && (
                <p className="text-center text-sm text-orange-300">
                  +{raidData.xp_earned} Raid XP | 获得{raidData.xp_earned} XP
                  {raidData.new_title && ` · Title: ${raidData.new_title}`}
                </p>
              )}

              {/* Stacked full-width buttons */}
              <button
                onClick={onExit}
                className="btn-press w-full border-[2px] border-cream/20 px-4 py-3 text-sm text-cream transition-colors hover:border-cream/40"
              >
                Back to City | 返回城市
              </button>
              <button
                onClick={() => {
                  const text = raidData.success
                    ? `I just raided ${defenderLogin}'s building on Git City! ${raidData.attack_score} vs ${raidData.defense_score}`
                    : `${defenderLogin} defended against my raid on Git City! ${raidData.attack_score} vs ${raidData.defense_score}`;
                  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://thegitcity.com")}`;
                  window.open(url, "_blank");
                }}
                className="btn-press w-full border-[2px] border-blue-400/40 px-4 py-3 text-sm text-blue-400 transition-colors hover:bg-blue-400/10"
              >
                Share on X | 分享到X
              </button>
            </div>
          </div>
        </>
      )}

      {/* ESC hint during animation phases */}
      {(phase === "flight" || phase === "attack") && (
        <div className="pointer-events-auto absolute bottom-[14vh] left-1/2 -translate-x-1/2">
          <button
            onClick={onSkip}
            className="text-[9px] text-muted/50 transition-colors hover:text-muted"
          >
            Press ESC to skip | 按ESC跳过
          </button>
        </div>
      )}
    </div>
  );
}
