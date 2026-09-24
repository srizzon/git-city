"use client";

import { Check, CloudOff, Expand, Eye, EyeOff, Pencil, Redo2, Shrink, TriangleAlert, Undo2 } from "lucide-react";
import PixelSpinner from "@/components/leagues/PixelSpinner";
import type { SaveStatus } from "@/lib/league-city/editor/queue";
import { HUD_BOX } from "../shared";

const SEG = "flex items-center gap-2 px-3 py-2 text-[10px] transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent [&>*]:transition-transform active:[&>*]:translate-y-px";
const ICON = { size: 14, strokeWidth: 2.5 } as const;

function Status({ status }: { status: SaveStatus }) {
  if (status === "saving")
    return (
      <span className="flex items-center gap-2 text-muted">
        <PixelSpinner size={3} /> Saving…
      </span>
    );
  if (status === "offline")
    return (
      <span className="flex items-center gap-2 text-amber-400">
        <CloudOff {...ICON} aria-hidden /> Offline, retrying
      </span>
    );
  if (status === "error")
    return (
      <span className="flex items-center gap-2 text-red-400">
        <TriangleAlert {...ICON} aria-hidden /> Not saved
      </span>
    );
  if (status === "saved")
    return (
      <span className="flex items-center gap-2 text-lime">
        <Check {...ICON} aria-hidden /> Saved
      </span>
    );
  return <span className="text-dim">All changes save automatically</span>;
}

export default function EditorTopBar({
  name,
  status,
  canUndo,
  canRedo,
  preview,
  leaving,
  onUndo,
  onRedo,
  onPreview,
  onDone,
  size,
  maxSize,
  minSize,
  shrinkNote,
  onExpand,
  onShrink,
}: {
  name: string;
  status: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  preview: boolean;
  leaving: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPreview: () => void;
  onDone: () => void;
  size: number;
  maxSize: number;
  minSize: number;
  /** What shrinking would do right now (tooltip). */
  shrinkNote: string;
  onExpand: () => void;
  onShrink: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-40 flex items-start justify-between gap-3 font-pixel uppercase">
      <div className={`${HUD_BOX} flex items-stretch divide-x-2 divide-border`}>
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Pencil {...ICON} className="text-lime" aria-hidden />
          <span className="max-w-[32vw] truncate text-[11px] text-cream">
            Editing <span className="normal-case">{name}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onExpand}
          disabled={size >= maxSize}
          title={size >= maxSize ? "The city is at its biggest size" : "Add a ring of lots around the city"}
          className={`${SEG} text-cream`}
        >
          <Expand {...ICON} aria-hidden />
          <span>
            Expand <span className="text-dim">{size}×{size}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onShrink}
          disabled={size <= minSize}
          aria-label="Shrink the city"
          title={size <= minSize ? "The city is at its smallest size" : shrinkNote}
          className={`${SEG} text-cream`}
        >
          <Shrink {...ICON} aria-hidden />
        </button>
      </div>

      <div className={`${HUD_BOX} flex items-stretch divide-x-2 divide-border`}>
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)" className={`${SEG} text-cream`}>
          <Undo2 {...ICON} aria-hidden />
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (⌘⇧Z)" className={`${SEG} text-cream`}>
          <Redo2 {...ICON} aria-hidden />
        </button>
        <div aria-live="polite" className="flex min-w-[168px] items-center px-3 text-[9px]">
          <Status status={status} />
        </div>
        <button type="button" onClick={onPreview} aria-pressed={preview} title="Preview (P)" className={`${SEG} ${preview ? "text-lime" : "text-cream"}`}>
          {preview ? <EyeOff {...ICON} aria-hidden /> : <Eye {...ICON} aria-hidden />}
          <span>{preview ? "Back to editing" : "Preview"}</span>
        </button>
        <button type="button" onClick={onDone} disabled={leaving} className={`${SEG} min-w-[84px] justify-center bg-lime/10 text-lime`}>
          {leaving ? <PixelSpinner size={3} /> : <Check {...ICON} aria-hidden />}
          <span>{leaving ? "Saving" : "Done"}</span>
        </button>
      </div>
    </div>
  );
}
