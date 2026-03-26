"use client";

export interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  /** Optional: show a text input for reason */
  withReason?: boolean;
}

interface ConfirmDialogProps {
  state: ConfirmState;
  onClose: () => void;
}

import { useState } from "react";

export function ConfirmDialog({ state, onClose }: ConfirmDialogProps) {
  const [reason, setReason] = useState("");

  if (!state.open) return null;

  const handleConfirm = () => {
    state.onConfirm();
    onClose();
    setReason("");
  };

  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm border-2 border-border bg-bg-raised p-6">
        <p className="text-sm text-cream">{state.title}</p>
        <p className="mt-2 text-xs text-muted">{state.message}</p>
        {state.withReason && (
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (sent to the company)..."
            rows={3}
            className="mt-3 w-full border border-border bg-bg px-3 py-2 text-xs text-cream normal-case outline-none placeholder:text-dim focus:border-lime resize-none"
          />
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={() => {
              onClose();
              setReason("");
            }}
            className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:text-cream"
          >
            CANCEL
          </button>
          <button
            onClick={handleConfirm}
            disabled={state.withReason && !reason.trim()}
            className="cursor-pointer border-2 border-red-800 bg-red-900/20 px-4 py-2 text-xs text-red-400 transition-colors hover:bg-red-900/40 disabled:opacity-30"
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}
