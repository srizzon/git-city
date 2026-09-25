"use client";

import { QUEST_TEXT, nextStep, type QuestState, type QuestStep } from "@/lib/towns/quest";
import { HUD_BOX } from "./shared";

const ACTION: Record<QuestStep, string> = {
  drive: "Drive",
  build: "Build",
  place: "Build",
  invite: "Invite",
};

/**
 * A new town's first steps, in the corner, never in the way: only the next
 * step is lit, with the button that does it. Done shows "Town ready".
 */
export default function TownQuest({
  state,
  steps,
  onStep,
  onDismiss,
}: {
  state: QuestState;
  steps: readonly QuestStep[];
  onStep: (s: QuestStep) => void;
  onDismiss: () => void;
}) {
  const next = nextStep(state, steps);
  return (
    <section className={`${HUD_BOX} w-full px-4 py-3 sm:w-[300px]`} style={{ animation: "slide-up 0.4s ease-out both" }}>
      <div className="flex items-center justify-between text-[10px]">
        <span className={next ? "text-cream" : "text-lime"}>{next ? "Your town" : "Town ready"}</span>
        <button type="button" onClick={onDismiss} aria-label="Hide first steps" className="px-1 text-muted transition-colors hover:text-cream">
          ✕
        </button>
      </div>
      <ol className="mt-2.5 space-y-2">
        {steps.map((s) => {
          const done = state[s];
          const lit = s === next;
          return (
            <li key={s} className="flex min-h-7 items-center gap-2.5 text-[11px] normal-case">
              <span
                aria-hidden
                className={`flex h-4 w-4 shrink-0 items-center justify-center border-2 text-[9px] leading-none ${
                  done ? "border-lime bg-lime text-bg" : lit ? "border-cream" : "border-border"
                }`}
                style={done ? { animation: "fade-in 0.25s ease-out both" } : undefined}
              >
                {done ? "✓" : ""}
              </span>
              <span className={`flex-1 ${done ? "text-muted line-through decoration-2" : lit ? "text-cream" : "text-dim"}`}>
                {QUEST_TEXT[s]}
                <span className="sr-only">{done ? " (done)" : ""}</span>
              </span>
              {lit && (
                <button
                  type="button"
                  onClick={() => onStep(s)}
                  className="btn-press shrink-0 bg-lime px-2.5 py-1 text-[10px] uppercase tracking-wider text-bg"
                >
                  {ACTION[s]}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
