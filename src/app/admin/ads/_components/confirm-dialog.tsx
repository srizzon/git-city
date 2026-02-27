"use client";

import type { ConfirmState } from "../_lib/types";

interface ConfirmDialogProps {
  state: ConfirmState;
  onClose: () => void;
}

export function ConfirmDialog({ state, onClose }: ConfirmDialogProps) {
  if (!state.open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm border-2 border-border bg-bg-raised p-6">
        <p className="text-sm text-cream">{state.title}</p>
        <p className="mt-2 text-xs text-muted">{state.message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:text-cream"
          >
            CANCEL
          </button>
          <button
            onClick={() => {
              state.onConfirm();
              onClose();
            }}
            className="cursor-pointer border-2 border-red-800 bg-red-900/20 px-4 py-2 text-xs text-red-400 transition-colors hover:bg-red-900/40"
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}
