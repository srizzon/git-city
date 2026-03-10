"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ListChecks, X } from "lucide-react";
import type { DailiesData } from "@/lib/useDailies";

interface Props {
  data: DailiesData | null;
  accent: string;
  shadow: string;
  isMobile: boolean;
  onClaim: () => Promise<{ ok: boolean; streak: number; total: number; freeze_granted: boolean } | null>;
  onRefresh: () => Promise<void>;
}

function getTimeUntilReset(): string {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const diff = tomorrow.getTime() - now.getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function DailiesWidget({ data, accent, shadow, isMobile, onClaim, onRefresh }: Props) {
  const [open, setOpen] = useState(!isMobile);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<{ freeze_granted: boolean } | null>(null);
  const [timeLeft, setTimeLeft] = useState(getTimeUntilReset);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeUntilReset()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // GitHub Star bonus mission state
  const [starOpened, setStarOpened] = useState(false);
  const [starVerifying, setStarVerifying] = useState(false);
  const [starVerified, setStarVerified] = useState(false);

  const verifyStarOnReturn = useCallback(async () => {
    if (starVerifying || starVerified || data?.has_github_star) return;
    setStarVerifying(true);
    try {
      const res = await fetch("/api/verify-github-star", { method: "POST" });
      if (!res.ok) { setStarVerifying(false); return; }
      const json = await res.json();
      if (json.verified) {
        setStarVerified(true);
        setStarOpened(false);
      }
    } catch { /* ignore */ }
    setStarVerifying(false);
  }, [starVerifying, starVerified, data?.has_github_star]);

  // Close on click/tap outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  // Auto-verify when tab regains focus after opening GitHub
  useEffect(() => {
    if (!starOpened) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") verifyStarOnReturn();
    };
    const onFocus = () => verifyStarOnReturn();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [starOpened, verifyStarOnReturn]);

  if (!data) return null;

  const { missions, completed_count, all_completed, reward_claimed, has_github_star } = data;
  const canClaim = all_completed && !reward_claimed;
  const showStarMission = !has_github_star && !starVerified;

  const handleClaim = async () => {
    if (claiming) return;
    setClaiming(true);
    const result = await onClaim();
    if (result) setClaimResult(result);
    setClaiming(false);
  };

  // ─── Collapsed pill ──────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`pointer-events-auto btn-press fixed z-30 flex items-center gap-1.5 border-2 border-border bg-bg/80 px-2 py-1.5 text-[10px] backdrop-blur-sm transition-all hover:border-border-light ${
          isMobile ? "top-3 right-13" : "left-4 top-1/2 -translate-y-1/2"
        }`}
        style={canClaim ? { borderColor: accent, boxShadow: `0 0 8px 2px ${accent}40` } : undefined}
      >
        <ListChecks size={13} style={{ color: accent }} />
        <span className="text-cream">{completed_count}/3</span>
      </button>
    );
  }

  // ─── Expanded panel ──────────────────────────────────────────
  const panelClasses = isMobile
    ? "pointer-events-auto fixed inset-x-0 bottom-0 z-[40] border-t-[2px] border-border bg-bg-raised/98 backdrop-blur-md"
    : "pointer-events-auto fixed left-4 top-1/2 z-[40] w-[230px] -translate-y-1/2 border-[2px] border-border bg-bg-raised/95 backdrop-blur-sm";

  return (
    <>
      {isMobile && (
        <div
          className="pointer-events-auto fixed inset-0 z-39 bg-bg/50"
          onClick={() => setOpen(false)}
        />
      )}

      <div ref={panelRef} className={panelClasses}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <ListChecks size={13} style={{ color: accent }} />
            <span className="text-[11px] font-bold tracking-wider" style={{ color: accent }}>
              DAILY MISSIONS
            </span>
            <span className="text-[9px] text-muted">{completed_count}/3</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex items-center justify-center text-muted transition-colors hover:text-cream"
          >
            <X size={14} />
          </button>
        </div>

        {/* Mission list */}
        <div className={`space-y-2.5 px-4 ${isMobile ? "py-3" : "py-2.5"}`}>
          {missions.map((m) => (
            <div key={m.id} className="flex items-start gap-2.5">
              <span
                className="mt-0.5 text-[12px] leading-none"
                style={{ color: m.completed ? accent : "#555" }}
              >
                {m.completed ? "\u2713" : "\u25CB"}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={`leading-tight ${isMobile ? "text-[12px]" : "text-[10px]"}`}
                  style={m.completed ? { color: accent, textDecoration: "line-through", opacity: 0.7 } : { color: "#e0d8cc" }}
                >
                  {m.title}
                </div>
                {!m.completed && (
                  <div className={`mt-0.5 leading-tight text-muted ${isMobile ? "text-[10px]" : "text-[9px]"}`}>
                    {m.description}
                    {m.threshold > 1 && (
                      <span style={{ color: accent, opacity: 0.8 }}>
                        {" "}({m.progress}/{m.threshold})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bonus mission: Star on GitHub */}
        {showStarMission && (
          <div className={`px-4 ${isMobile ? "pb-2" : "pb-1.5"}`}>
            <button
              onClick={() => {
                if (starOpened) {
                  verifyStarOnReturn();
                } else {
                  window.open("https://github.com/srizzon/git-city", "_blank");
                  setStarOpened(true);
                }
              }}
              disabled={starVerifying}
              className="w-full flex items-start gap-2.5 rounded border border-[#FFD700]/30 bg-[#FFD700]/5 px-3 py-2 text-left transition-colors hover:bg-[#FFD700]/10"
            >
              <span className="mt-0.5 text-[12px] leading-none" style={{ color: "#FFD700" }}>
                {starVerifying ? "\u231B" : "\u2B50"}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`leading-tight font-bold ${isMobile ? "text-[12px]" : "text-[10px]"}`} style={{ color: "#FFD700" }}>
                  {starVerifying ? "Verifying..." : starOpened ? "I starred it — Verify" : "Star on GitHub"}
                </div>
                <div className={`mt-0.5 leading-tight ${isMobile ? "text-[10px]" : "text-[9px]"}`} style={{ color: "#FFD700", opacity: 0.7 }}>
                  {starOpened ? "Click to check or wait..." : "Star the repo to unlock an exclusive item"}
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Footer */}
        <div className={`border-t border-border px-4 ${isMobile ? "py-3 pb-4" : "py-2"}`}>
          {claimResult ? (
            <div className="text-center text-[10px] font-bold" style={{ color: accent }}>
              {claimResult.freeze_granted ? "Streak freeze earned!" : "Dailies complete!"}
            </div>
          ) : canClaim ? (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className={`btn-press w-full border-2 font-bold transition-all hover:brightness-110 ${isMobile ? "px-3 py-2 text-[12px]" : "px-2 py-1.5 text-[10px]"}`}
              style={{
                borderColor: accent,
                color: "#0d0f0e",
                backgroundColor: accent,
                boxShadow: `3px 3px 0 0 ${shadow}`,
                opacity: claiming ? 0.6 : 1,
              }}
            >
              {claiming ? "Claiming..." : "Claim Reward"}
            </button>
          ) : reward_claimed && all_completed ? (
            <div className="text-center text-[10px]" style={{ color: accent, opacity: 0.7 }}>
              All done! Resets in {timeLeft}
            </div>
          ) : (
            <div className="flex items-center justify-between text-[10px] text-muted">
              <span>Resets in {timeLeft}</span>
              {completed_count === 2 && (
                <span className="font-bold" style={{ color: accent }}>1 more!</span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
