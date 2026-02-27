"use client";

interface BatchToolbarProps {
  count: number;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BatchToolbar({
  count,
  onPause,
  onResume,
  onDelete,
  onClear,
}: BatchToolbarProps) {
  if (count === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-3 border-2 border-lime/30 bg-lime/5 px-4 py-3">
      <span className="text-xs text-lime">{count} selected</span>
      <div className="h-4 w-px bg-lime/30" />
      <button
        onClick={onPause}
        className="cursor-pointer border border-border px-3 py-1 text-[11px] text-muted transition-colors hover:text-cream"
      >
        PAUSE
      </button>
      <button
        onClick={onResume}
        className="cursor-pointer border border-border px-3 py-1 text-[11px] text-muted transition-colors hover:text-cream"
      >
        RESUME
      </button>
      <button
        onClick={onDelete}
        className="cursor-pointer border border-red-800/50 px-3 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-900/20"
      >
        DELETE
      </button>
      <button
        onClick={onClear}
        className="ml-auto cursor-pointer text-[11px] text-dim transition-colors hover:text-cream"
      >
        Clear selection
      </button>
    </div>
  );
}
