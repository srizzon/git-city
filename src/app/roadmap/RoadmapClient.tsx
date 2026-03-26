"use client";

import { useCallback, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase";
import { ROADMAP_PHASES, VOTABLE_ITEM_IDS } from "@/lib/roadmap-data";
import type { RoadmapPhase, RoadmapItem, ItemStatus } from "@/lib/roadmap-data";
import { toggleVote } from "./actions";

const ACCENT = "#c8e64a";
const CREAM = "#e8dcc8";
const MUTED = "#8c8c9c";

/* ─── status config ─── */
const STATUS_CONFIG: Record<
  ItemStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  done: {
    label: "DONE",
    color: "#4ade80",
    bg: "rgba(74, 222, 128, 0.08)",
    border: "#2d6a3f",
  },
  building: {
    label: "BUILDING",
    color: ACCENT,
    bg: "rgba(200, 230, 74, 0.08)",
    border: ACCENT,
  },
  planned: {
    label: "PLANNED",
    color: MUTED,
    bg: "rgba(140, 140, 156, 0.05)",
    border: "#2a2a30",
  },
};

/* ─── helpers ─── */
function totalItems() {
  return ROADMAP_PHASES.reduce((sum, p) => sum + p.items.length, 0);
}

function doneItems() {
  return ROADMAP_PHASES.reduce(
    (sum, p) => sum + p.items.filter((i) => i.status === "done").length,
    0
  );
}

/* ─── main component ─── */
interface Props {
  voteCounts: Record<string, number>;
  userVotes: string[];
  isLoggedIn: boolean;
}

export default function RoadmapClient({
  voteCounts,
  userVotes,
  isLoggedIn,
}: Props) {
  const total = totalItems();
  const done = doneItems();
  const pct = Math.round((done / total) * 100);
  const [showSignIn, setShowSignIn] = useState(false);

  const handleSignIn = useCallback(async () => {
    const supabase = createBrowserSupabase();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }, []);

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs text-muted transition-colors hover:text-cream"
          >
            &larr; Back to City
          </Link>
        </div>

        <div className="mt-6 text-center">
          <h1 className="text-3xl text-cream md:text-4xl">
            Road<span style={{ color: ACCENT }}>map</span>
          </h1>
          <p className="mt-3 text-xs text-muted normal-case">
            What we've built, what we're building, and what's coming next
          </p>
        </div>

        {/* Progress bar */}
        <div className="mt-8 border-[3px] border-border bg-bg-card p-4">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted">Overall Progress</span>
            <span style={{ color: ACCENT }}>
              {done}/{total} features ({pct}%)
            </span>
          </div>
          <div className="mt-2 h-3 border-2 border-border bg-bg">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: ACCENT,
                imageRendering: "pixelated",
              }}
            />
          </div>
        </div>

        {/* Timeline */}
        <div className="relative mt-10">
          {/* Vertical line */}
          <div
            className="absolute left-2.75 top-0 h-full w-0.75"
            style={{ backgroundColor: "#2a2a30" }}
          />

          {ROADMAP_PHASES.map((phase, phaseIdx) => (
            <PhaseBlock
              key={phase.id}
              phase={phase}
              isLast={phaseIdx === ROADMAP_PHASES.length - 1}
              voteCounts={voteCounts}
              userVotes={userVotes}
              isLoggedIn={isLoggedIn}
              onSignInPrompt={() => setShowSignIn(true)}
            />
          ))}
        </div>

        {/* Sign-in modal */}
        {showSignIn && (
          <SignInPrompt
            onClose={() => setShowSignIn(false)}
            onSignIn={handleSignIn}
          />
        )}

        {/* Footer */}
        <div className="mt-10 text-center">
          <Link
            href="/"
            className="btn-press pixel-shadow-lime inline-block px-7 py-3.5 text-sm text-bg"
            style={{ backgroundColor: ACCENT }}
          >
            Enter the City
          </Link>

          <p className="mt-6 text-[9px] text-muted normal-case">
            built by{" "}
            <a
              href="https://x.com/samuelrizzondev"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-cream"
              style={{ color: ACCENT }}
            >
              @samuelrizzondev
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

/* ─── Phase Block ─── */
function PhaseBlock({
  phase,
  isLast,
  voteCounts,
  userVotes,
  isLoggedIn,
  onSignInPrompt,
}: {
  phase: RoadmapPhase;
  isLast: boolean;
  voteCounts: Record<string, number>;
  userVotes: string[];
  isLoggedIn: boolean;
  onSignInPrompt: () => void;
}) {
  const cfg = STATUS_CONFIG[phase.status];
  const isBuilding = phase.status === "building";

  return (
    <div className={`relative pb-10 ${isLast ? "pb-0" : ""}`}>
      {/* Timeline node */}
      <div
        className="absolute left-0 top-0 z-10 h-6.25 w-6.25 border-[3px]"
        style={{
          backgroundColor: "#0d0d0f",
          borderColor: cfg.border,
          ...(isBuilding
            ? {
                animation: "pulse-node 2s ease-in-out infinite",
                boxShadow: `0 0 12px ${ACCENT}44`,
              }
            : {}),
        }}
      />

      {/* Phase header */}
      <div className="ml-10">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg text-cream">{phase.title}</h2>
          <span className="text-[10px] text-muted">{phase.quarter}</span>
          <span
            className="border-2 px-2 py-0.5 text-[9px]"
            style={{
              color: cfg.color,
              borderColor: cfg.border,
              backgroundColor: cfg.bg,
            }}
          >
            {cfg.label}
          </span>
        </div>

        {/* Items */}
        <div className="mt-3 space-y-1">
          {phase.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              votes={voteCounts[item.id] ?? 0}
              hasVoted={userVotes.includes(item.id)}
              isLoggedIn={isLoggedIn}
              onSignInPrompt={onSignInPrompt}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Item Row ─── */
function ItemRow({
  item,
  votes: initialVotes,
  hasVoted: initialHasVoted,
  isLoggedIn,
  onSignInPrompt,
}: {
  item: RoadmapItem;
  votes: number;
  hasVoted: boolean;
  isLoggedIn: boolean;
  onSignInPrompt: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const [optimistic, setOptimistic] = useOptimistic(
    { votes: initialVotes, hasVoted: initialHasVoted },
    (state, _action: "toggle") => ({
      votes: state.hasVoted ? state.votes - 1 : state.votes + 1,
      hasVoted: !state.hasVoted,
    })
  );

  function handleVote() {
    if (!isLoggedIn) {
      onSignInPrompt();
      return;
    }
    startTransition(async () => {
      setOptimistic("toggle");
      await toggleVote(item.id);
    });
  }

  const isDone = item.status === "done";
  const isMystery = item.mystery;
  const showVoteButton = VOTABLE_ITEM_IDS.has(item.id);

  return (
    <div
      className="flex items-start gap-3 border-b border-border/30 py-2.5 last:border-b-0"
      style={{ opacity: isDone ? 0.55 : 1 }}
    >
      {/* Checkbox */}
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border-2 border-border text-[8px]">
        {isDone ? (
          <span style={{ color: "#4ade80" }}>&#10003;</span>
        ) : item.status === "building" ? (
          <span className="blink-dot block h-1.5 w-1.5" style={{ backgroundColor: ACCENT }} />
        ) : null}
      </span>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p
          className="text-xs"
          style={{
            color: isMystery ? MUTED : isDone ? MUTED : CREAM,
            fontStyle: isMystery ? "italic" : "normal",
          }}
        >
          {item.name}
        </p>
        {item.description && (
          <p className="mt-0.5 text-[9px] text-muted normal-case">
            {item.description}
          </p>
        )}
      </div>

      {/* Vote button */}
      {showVoteButton && (
        <button
          onClick={handleVote}
          disabled={isPending}
          className="flex shrink-0 items-center gap-1.5 border-2 px-2 py-1 text-[10px] transition-all"
          style={{
            borderColor: optimistic.hasVoted ? ACCENT : "#2a2a30",
            color: optimistic.hasVoted ? ACCENT : MUTED,
            backgroundColor: optimistic.hasVoted
              ? "rgba(200, 230, 74, 0.08)"
              : "transparent",
            opacity: isPending ? 0.6 : 1,
            cursor: isPending ? "wait" : "pointer",
          }}
        >
          <span style={{ fontSize: "8px" }}>&#9650;</span>
          <span>{optimistic.votes}</span>
        </button>
      )}
    </div>
  );
}

/* ─── Sign In Prompt ─── */
function SignInPrompt({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xs border-[3px] border-border bg-bg-raised p-6 text-center">
        <p className="text-sm text-cream">Sign in to vote</p>
        <p className="mt-2 text-[10px] text-muted normal-case">
          Your vote helps us decide what to build next
        </p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 border-2 border-border px-3 py-2 text-[10px] text-muted transition-colors hover:border-border-light hover:text-warm"
          >
            Cancel
          </button>
          <button
            onClick={onSignIn}
            className="btn-press pixel-shadow-lime flex-1 px-3 py-2 text-[10px] text-bg"
            style={{ backgroundColor: ACCENT }}
          >
            Sign in with GitHub
          </button>
        </div>
      </div>
    </div>
  );
}
