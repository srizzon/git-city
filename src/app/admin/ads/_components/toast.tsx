"use client";

import type { Toast as ToastType } from "../_lib/use-toast";

interface ToastContainerProps {
  toasts: ToastType[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 border px-4 py-3 text-xs shadow-lg animate-in fade-in slide-in-from-right-2 ${
            toast.type === "success"
              ? "border-lime/30 bg-lime/10 text-lime"
              : "border-red-800/30 bg-red-900/20 text-red-400"
          }`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="cursor-pointer text-current opacity-60 hover:opacity-100"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
