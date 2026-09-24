"use client";

import { Move, RotateCw, Sparkles, Trash2 } from "lucide-react";
import type { CityObject } from "@/lib/league-city/types";

const BTN = "flex h-8 items-center gap-1.5 px-2.5 text-[9px] transition-colors hover:bg-white/10 [&>*]:transition-transform active:[&>*]:translate-y-px";
const ICON = { size: 13, strokeWidth: 2.5 } as const;

/** Floats over the selected object (placed with drei <Html> in the scene). */
export default function SelectionToolbar({
  object,
  onRotate,
  onMove,
  onRemove,
  onDismissNew,
}: {
  object: CityObject;
  onRotate: () => void;
  onMove: () => void;
  onRemove: () => void;
  onDismissNew: () => void;
}) {
  return (
    <div
      className="flex -translate-x-1/2 -translate-y-full animate-[fade-in_0.12s_ease-out] items-stretch divide-x-2 divide-border border-[3px] border-border bg-bg/90 font-pixel uppercase text-cream backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button type="button" onClick={onRotate} title="Rotate (R)" className={BTN}>
        <RotateCw {...ICON} aria-hidden /> <span>Rotate</span>
      </button>
      <button type="button" onClick={onMove} title="Move" className={BTN}>
        <Move {...ICON} aria-hidden /> <span>Move</span>
      </button>
      {object.kind === "item" && (
        <button type="button" onClick={onRemove} title="Delete" className={`${BTN} text-red-400`}>
          <Trash2 {...ICON} aria-hidden /> <span>Delete</span>
        </button>
      )}
      {object.is_new && (
        <button type="button" onClick={onDismissNew} className={`${BTN} text-lime`}>
          <Sparkles {...ICON} aria-hidden /> <span>Dismiss new</span>
        </button>
      )}
    </div>
  );
}
