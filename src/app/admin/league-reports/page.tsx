"use client";

import { useCallback, useEffect, useState } from "react";

interface Report {
  asset_id: string;
  league: { id: string; slug: string; name: string } | null;
  url: string | null;
  status: string;
  reasons: string[];
  last: string;
}

// Reported town logos. Meme logos are normal use; take down only
// inappropriate images. A takedown keeps the town's objects (they show name
// plates) and the admin uploads another logo.
export default function LeagueReportsPage() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/league-reports", { cache: "no-store" });
    const json = (await res.json()) as { reports?: Report[] };
    setReports(json.reports ?? []);
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/league-reports", { cache: "no-store" })
      .then((res) => res.json() as Promise<{ reports?: Report[] }>)
      .then((json) => live && setReports(json.reports ?? []))
      .catch(() => live && setReports([]));
    return () => {
      live = false;
    };
  }, []);

  const act = async (assetId: string, action: "takedown" | "dismiss") => {
    setBusy(assetId);
    await fetch("/api/admin/league-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId, action }),
    });
    setBusy(null);
    await load();
  };

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-sm text-cream">Town logo reports</h1>
        <p className="mt-1 text-[11px] text-muted">Meme logos are fine. Take down only inappropriate images.</p>

        {reports === null && <p className="mt-8 text-[11px] text-muted">Loading…</p>}
        {reports?.length === 0 && <p className="mt-8 text-[11px] text-muted">No open reports.</p>}

        <div className="mt-6 space-y-3">
          {reports?.map((r) => (
            <div key={r.asset_id} className="flex gap-4 border border-border bg-bg-raised p-4">
              {r.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.url} alt="" width={96} height={96} className="h-24 w-24 shrink-0 border border-border [image-rendering:pixelated]" />
              ) : (
                <div className="h-24 w-24 shrink-0 border border-border" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <a href={`/town/${r.league?.slug ?? ""}`} className="truncate text-xs text-cream hover:text-lime">
                    {r.league?.name ?? "Deleted town"}
                  </a>
                  <span className="shrink-0 text-[10px] text-dim">
                    {r.reasons.length} report{r.reasons.length === 1 ? "" : "s"} · {r.status}
                  </span>
                </div>
                <ul className="mt-2 space-y-1 text-[11px] text-muted">
                  {r.reasons.slice(0, 5).map((reason, i) => (
                    <li key={i} className="break-words">“{reason}”</li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy === r.asset_id || r.status === "removed"}
                    onClick={() => act(r.asset_id, "takedown")}
                    className="border border-red-400/60 px-3 py-1 text-[11px] text-red-300 disabled:opacity-40"
                  >
                    Take down
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.asset_id}
                    onClick={() => act(r.asset_id, "dismiss")}
                    className="border border-border px-3 py-1 text-[11px] text-cream disabled:opacity-40"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
