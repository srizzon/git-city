"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { HUD_BOX } from "./shared";
import { useSheet } from "./useSheet";

/**
 * Sheet over the city: a right-hand column on desktop, a bottom sheet on
 * phones. Slides in, slides out; Esc and the close button dismiss it.
 */
export default function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const sheet = useSheet(onClose);
  const { close } = sheet;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex max-h-[78vh] sm:inset-y-4 sm:right-4 sm:left-auto sm:max-h-none sm:w-[400px]">
      <section
        role="dialog"
        aria-label={title}
        className={`${HUD_BOX} ${sheet.className} flex w-full flex-col bg-bg/90 font-pixel uppercase text-warm`}
      >
        <header className="flex items-center justify-between border-b-2 border-border px-4 py-3">
          <h2 className="text-sm text-cream">{title}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="btn-press -mr-1.5 flex h-7 w-7 items-center justify-center text-muted transition-colors hover:text-cream"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </section>
    </div>
  );
}
