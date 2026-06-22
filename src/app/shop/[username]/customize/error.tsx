"use client";

import Link from "next/link";
import { useEffect } from "react";

const ACCENT = "#c8e64a";

// Error boundary for the Customize screen — a save/render failure shows a
// recoverable screen instead of a blank page.
export default function CustomizeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Customize error:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-lg px-3 py-16 text-center">
        <div className="border-[3px] border-border bg-bg-raised p-8">
          <h1 className="text-lg text-cream">Customize hit a snag</h1>
          <p className="mt-3 text-[10px] text-muted normal-case">
            {error.message || "Couldn't load your items. Your equipped look is safe."}
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button onClick={reset} className="btn-press px-6 py-3 text-xs text-bg" style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" }}>
              Try again
            </button>
            <Link href="/shop" className="text-xs text-muted normal-case transition-colors hover:text-cream">Back to Shop &rarr;</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
