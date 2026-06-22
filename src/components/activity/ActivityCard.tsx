"use client";

import { useState } from "react";
import { tierFromLevel } from "@/lib/xp";
import {
  type FeedEvent,
  eventMeta,
  formatEvent,
  feedAction,
  primaryLogin,
  devFor,
  relativeTime,
} from "./feed";

type Variant = "pulse" | "row";

interface Props {
  event: FeedEvent;
  viewerLogin?: string | null;
  variant: Variant;
  onNavigate?: (login: string) => void;
  onCounterAttack?: (login: string) => void;
}

export default function ActivityCard({
  event: e,
  viewerLogin,
  variant,
  onNavigate,
  onCounterAttack,
}: Props) {
  const [kudos, setKudos] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const meta = eventMeta(e);
  const nav = primaryLogin(e, viewerLogin);
  const dev = devFor(e, nav);
  const action = feedAction(e, viewerLogin);

  // Tie the avatar frame to the dev's XP tier, exactly like the profile.
  const tierColor = dev?.level ? tierFromLevel(dev.level).color : "var(--color-border, #2a2a2a)";
  // Only surface rank when it's a real flex (top 1000), otherwise it's noise.
  const rank = dev?.rank != null && dev.rank <= 1000 ? dev.rank : null;

  const sendKudos = async (login: string) => {
    if (kudos === "sending" || kudos === "sent") return;
    setKudos("sending");
    try {
      const res = await fetch("/api/interactions/kudos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiver_login: login }),
      });
      setKudos(res.ok ? "sent" : "error");
    } catch {
      setKudos("error");
    }
  };

  const stop = (fn: () => void) => (ev: React.MouseEvent) => {
    ev.stopPropagation();
    fn();
  };

  // Clicking the card (toast or feed row) goes to that dev's building, like
  // tapping a notification takes you to its content — not to a panel elsewhere.
  const handleBody = () => {
    if (nav) onNavigate?.(nav);
  };

  const avatar = dev?.avatar_url ?? null;

  return (
    <div
      onClick={handleBody}
      className={[
        "group relative flex cursor-pointer items-center gap-2.5",
        variant === "pulse"
          ? "w-72 border border-border bg-bg-raised p-2 pl-2.5 shadow-lg shadow-black/40"
          : "px-3 py-2 hover:bg-bg-card/50",
      ].join(" ")}
    >
      {/* Category accent dot */}
      <span
        className="absolute left-0 top-0 h-full w-[2px]"
        style={{ backgroundColor: meta.color }}
      />

      {/* Avatar with tier frame (clicking the row flies to the building) */}
      <div className="relative shrink-0" title={nav ? `@${nav}` : undefined}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt={nav ?? ""}
            className="h-8 w-8 border-2"
            style={{ imageRendering: "pixelated", borderColor: tierColor }}
          />
        ) : (
          <div className="h-8 w-8 border-2 bg-bg-card" style={{ borderColor: tierColor }} />
        )}
      </div>

      {/* Text + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] leading-tight text-cream normal-case">
          {formatEvent(e, viewerLogin)}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[8px] text-dim">
          <span style={{ color: meta.color }}>{meta.label}</span>
          {rank != null && (
            <>
              <span className="text-dim/50">·</span>
              <span style={{ color: tierColor }}>#{rank.toLocaleString()}</span>
            </>
          )}
          <span className="text-dim/50">·</span>
          <span>{relativeTime(e.created_at)}</span>
        </div>
      </div>

      {/* Reciprocity action (only when relevant) */}
      {action?.kind === "counter_attack" && onCounterAttack && (
        <button
          onClick={stop(() => onCounterAttack(action.login))}
          className="shrink-0 border px-2 py-1 text-[9px] text-red-400 transition-colors hover:bg-red-500/10"
          style={{ borderColor: "#ef444455" }}
        >
          Hit back
        </button>
      )}
      {action?.kind === "kudos_back" && (
        <button
          onClick={stop(() => sendKudos(action.login))}
          disabled={kudos === "sent" || kudos === "sending"}
          className="shrink-0 border px-2 py-1 text-[9px] transition-colors disabled:opacity-60"
          style={{
            borderColor: kudos === "error" ? "#f8717155" : "#c8e64a55",
            color: kudos === "error" ? "#f87171" : "#c8e64a",
          }}
        >
          {kudos === "sent" ? "Sent" : kudos === "sending" ? "..." : kudos === "error" ? "Retry" : "+1 back"}
        </button>
      )}
    </div>
  );
}
