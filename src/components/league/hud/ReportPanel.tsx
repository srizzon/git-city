"use client";

import { useState } from "react";
import Panel from "./Panel";

// Opened from the portal sign by non-members. Meme logos are normal; reports
// are for inappropriate images and go to the admin queue.
export default function ReportPanel({ slug, name, logoUrl, signedIn, onClose }: { slug: string; name: string; logoUrl: string | null; signedIn: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setState("sending");
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${slug}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Couldn't send the report.");
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setError("Network error. Try again.");
      setState("idle");
    }
  };

  return (
    <Panel title={name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={`${name} logo`} width={96} height={96} className="h-24 w-24 border-2 border-border [image-rendering:pixelated]" />
        )}
        {state === "sent" ? (
          <p className="text-[11px] normal-case text-cream">Thanks. We&apos;ll take a look.</p>
        ) : !signedIn ? (
          <p className="text-[11px] normal-case text-muted">Sign in to report this logo.</p>
        ) : !logoUrl ? (
          <p className="text-[11px] normal-case text-muted">This town has no logo.</p>
        ) : (
          <>
            <p className="text-[11px] normal-case text-muted">Report this logo if it&apos;s inappropriate. Made-up and meme logos are fine.</p>
            <label className="flex flex-col gap-1.5">
              <span className="text-[9px] text-muted">What&apos;s wrong</span>
              <textarea
                value={reason}
                maxLength={280}
                rows={3}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="resize-none border-2 border-border bg-bg px-2 py-1.5 text-[16px] normal-case text-cream outline-none focus:border-lime sm:text-[11px]"
              />
            </label>
            {error && <p className="text-[10px] normal-case text-red-400">{error}</p>}
            <button
              type="button"
              disabled={!reason.trim() || state === "sending"}
              onClick={send}
              className="btn-press self-start border-2 border-red-400/70 px-4 py-2 text-[10px] text-red-300 disabled:opacity-40"
            >
              {state === "sending" ? "Sending…" : "Report logo"}
            </button>
          </>
        )}
      </div>
    </Panel>
  );
}
