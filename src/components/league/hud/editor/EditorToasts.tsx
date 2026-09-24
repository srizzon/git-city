"use client";

import { useEffect, useState } from "react";
import { Info, TriangleAlert } from "lucide-react";
import type { Notice } from "@/lib/league-city/editor/state";

/** Shows the editor's latest notice for a few seconds. */
export default function EditorToasts({ notice }: { notice: Notice | null }) {
  const [dismissed, setDismissed] = useState(0);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setDismissed(notice.seq), notice.kind === "error" ? 4500 : 2600);
    return () => clearTimeout(t);
  }, [notice]);
  const shown = notice && notice.seq !== dismissed ? notice : null;
  if (!shown) return null;
  const Icon = shown.kind === "error" ? TriangleAlert : Info;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center font-pixel uppercase">
      <div
        key={shown.seq}
        role="status"
        className={`flex animate-[fade-in_0.15s_ease-out] items-center gap-2 border-[3px] bg-bg/90 px-3 py-2 text-[10px] backdrop-blur-sm ${
          shown.kind === "error" ? "border-red-500/70 text-red-300" : "border-border text-cream"
        }`}
      >
        <Icon size={13} strokeWidth={2.5} aria-hidden />
        <span className="normal-case">{shown.message}</span>
      </div>
    </div>
  );
}
