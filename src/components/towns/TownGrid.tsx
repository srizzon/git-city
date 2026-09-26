"use client";

import { useState } from "react";
import Link from "next/link";
import type { GridTown } from "@/lib/towns/discover";
import { GridTownCard } from "./TownCard";

type Filter = "all" | "yours" | "company" | "custom";

// Every town once, in one grid. Chips filter it instead of rows repeating it.
export default function TownGrid({ towns }: { towns: GridTown[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const chips: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: "All", n: towns.length },
    { id: "yours", label: "Yours", n: towns.filter((t) => t.yours).length },
    { id: "company", label: "Companies", n: towns.filter((t) => t.kind === "company").length },
    { id: "custom", label: "Friends", n: towns.filter((t) => t.kind === "custom").length },
  ];
  const shown = towns.filter((t) => filter === "all" || (filter === "yours" ? t.yours : t.kind === filter));
  return (
    <section id="towns" className="mt-12 scroll-mt-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl text-cream sm:text-2xl">All towns</h2>
        <div role="tablist" aria-label="Filter towns" className="flex flex-wrap gap-2">
          {chips
            .filter((c) => c.id === "all" || c.n > 0)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={filter === c.id}
                onClick={() => setFilter(c.id)}
                className={`btn-press border-[3px] px-3 py-1.5 text-[11px] transition-colors ${
                  filter === c.id ? "border-lime bg-lime text-bg" : "border-border text-muted hover:text-cream"
                }`}
              >
                {c.label} <span className={filter === c.id ? "text-bg/70" : "text-dim"}>{c.n}</span>
              </button>
            ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => (
          <GridTownCard key={t.slug} town={t} />
        ))}
        {filter === "company" && (
          <Link
            href="/towns/new?kind=company"
            className="flex min-h-40 items-center justify-center border-[3px] border-dashed border-border p-6 text-center text-xs text-muted transition-colors hover:border-lime hover:text-lime"
          >
            + Start your company&apos;s town
          </Link>
        )}
      </div>
    </section>
  );
}
