"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { HUD_BOX } from "../shared";

// First-time coach marks, one at a time. Remembered per browser; storage can
// be unavailable (private mode), so every access is guarded.

const KEY = "league-editor-tips-v1";
const TIPS: [string, string][] = [
  ["1–9", "pick an item from the hotbar, then click a lot to place it"],
  ["Drag", "with the road tool to paint a street"],
  ["R", "rotates what you selected. Click it again to move it"],
];

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function remember() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // ignore
  }
}

export default function EditorTips() {
  const [step, setStep] = useState(() => (seen() ? TIPS.length : 0));
  if (step >= TIPS.length) return null;
  const [key, text] = TIPS[step];
  const next = () => {
    if (step + 1 >= TIPS.length) remember();
    setStep(step + 1);
  };
  const skip = () => {
    remember();
    setStep(TIPS.length);
  };
  return (
    <div className="pointer-events-none fixed bottom-36 left-1/2 z-40 -translate-x-1/2 font-pixel uppercase">
      <div key={step} className={`${HUD_BOX} flex animate-[fade-in_0.18s_ease-out] items-center gap-3 px-3 py-2`}>
        <span className="border-2 border-lime px-1.5 py-0.5 text-[10px] text-lime">{key}</span>
        <span className="text-[10px] text-cream normal-case">{text}</span>
        <span className="text-[9px] text-dim">
          {step + 1}/{TIPS.length}
        </span>
        <button type="button" onClick={next} className="px-1 text-[9px] text-lime hover:text-cream">
          {step + 1 >= TIPS.length ? "Got it" : "Next"}
        </button>
        <button type="button" onClick={skip} aria-label="Hide tips" className="text-muted hover:text-cream">
          <X size={12} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}
