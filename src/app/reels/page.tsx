import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { existsSync, readFileSync } from "node:fs";
import { boardDay, reelDays } from "@/lib/reel/board";
import { inHome, reelsHome } from "@/lib/reel/home";
import { RefreshWhileQueued, StateTag } from "./ui";

// The reels board (dev only): one day's reels, the main first, each with
// its state, hook and latest render. A reel opens its review page.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reels - Git City",
  robots: { index: false, follow: false },
};

interface Facts {
  total: number;
  new24h: number;
  island: number;
  statesWithFounder: number;
  gaps: { ahead: string; behind: string; gap: number }[];
}

export default async function ReelsBoard({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  if (!reelsHome()) notFound();
  const days = reelDays();
  const { date: asked } = await searchParams;
  const date = asked && days.includes(asked) ? asked : days[0];
  const reels = date ? boardDay(date) : [];
  const factsFile = date ? inHome(`days/${date}/facts.json`) : null;
  const facts = factsFile && existsSync(factsFile) ? (JSON.parse(readFileSync(factsFile, "utf8")) as Facts) : null;

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <RefreshWhileQueued queued={reels.some((r) => r.status.queued)} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-sm text-cream">Reels{date ? ` · ${date}` : ""}</h1>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
            {days.slice(0, 10).map((d) => (
              <Link key={d} href={`/reels?date=${d}`} className={d === date ? "text-lime" : "text-muted hover:text-cream"}>
                {d.slice(5)}
              </Link>
            ))}
          </div>
        </div>

        {facts && (
          <div className="grid grid-cols-2 gap-px border border-border bg-border text-center sm:grid-cols-4">
            {[
              ["Devs", facts.total.toLocaleString("en-US")],
              ["New in 24h", `+${facts.new24h.toLocaleString("en-US")}`],
              ["Island", String(facts.island)],
              ["Closest race", facts.gaps[0] ? `${facts.gaps[0].ahead} ${facts.gaps[0].gap} · ${facts.gaps[0].behind}` : "–"],
            ].map(([k, v]) => (
              <div key={k} className="bg-bg-raised py-2">
                <div className="text-sm text-lime">{v}</div>
                <div className="text-[9px] uppercase text-muted">{k}</div>
              </div>
            ))}
          </div>
        )}

        {!reels.length ? (
          <p className="text-[11px] text-muted">No reels for this day yet. `npm run reel -- facts`, then ask Claude for the day&apos;s scripts.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {reels.map((r) => {
              const video = r.files.final ?? r.files.draft;
              return (
                <Link key={r.id} href={`/reels/${r.id}`} className="flex flex-col border border-border bg-bg-raised hover:border-lime">
                  <div className="relative aspect-[9/16] overflow-hidden bg-bg">
                    {video ? (
                      <video src={video} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    ) : (
                      <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-[11px] normal-case text-muted">
                        {r.spec?.lines[0]?.show.replace(/\*/g, "") ?? r.error}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] uppercase text-cream">{r.spec?.kind === "main" ? "Main" : `Trial · ${r.slot}`}</span>
                      <span className="text-[10px] text-muted">{r.length ? `${r.length.toFixed(1)}s` : ""}</span>
                    </div>
                    <span className="truncate text-[10px] normal-case text-muted">{r.spec?.preset ?? "–"}</span>
                    <StateTag status={r.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
