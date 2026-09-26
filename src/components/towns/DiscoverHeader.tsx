"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NO_AUTOFILL } from "@/components/league/hud/shared";
import type { TownCard } from "@/lib/towns/rows";
import { TownMeta } from "./TownCard";

const BTN = "btn-press flex items-center justify-center gap-2 border-[3px] px-4 py-2.5 text-xs whitespace-nowrap";

export default function DiscoverHeader() {
  return (
    <header className="mx-auto max-w-6xl px-4 pt-6 pb-8 sm:px-6">
      <nav className="flex items-center justify-between gap-3">
        <Link href="/" className="shrink-0 whitespace-nowrap text-sm text-muted transition-colors hover:text-cream">
          &larr; City
        </Link>
        <Link href="/towns/new" className={`${BTN} border-lime bg-lime text-bg`}>
          + Create a town
        </Link>
      </nav>

      <div className="mt-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl leading-none text-cream sm:text-5xl">
            To<span className="text-lime">wns</span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted normal-case">
            Your group&apos;s own place in Git City. Built together, open to anyone to visit and drive.
          </p>
        </div>
        <div className="w-full md:w-96">
          <Search />
        </div>
      </div>
    </header>
  );
}

function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TownCard[] | null>(null);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const mine = ++seq.current;
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/towns/search?q=${encodeURIComponent(term)}`);
        const json = (await res.json()) as { results?: TownCard[] };
        if (mine === seq.current) setResults(json.results ?? []);
      } catch {
        if (mine === seq.current) setResults([]);
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [q]);

  const shown = q.trim().length >= 2 ? results : null;

  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <input
        {...NO_AUTOFILL}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Search a town or GitHub org"
        aria-label="Search towns"
        className="w-full border-[3px] border-border bg-bg-card px-4 py-3 text-base text-cream normal-case outline-none placeholder:text-dim focus:border-lime sm:text-sm"
      />
      {open && shown && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-96 overflow-y-auto border-[3px] border-border bg-bg-raised">
          {shown.length === 0 && <li className="px-4 py-3 text-sm text-muted normal-case">No town matches that.</li>}
          {shown.map((r) => (
            <li key={r.slug}>
              <Link href={`/town/${r.slug}`} className="block px-4 py-3 hover:bg-bg-card focus:bg-bg-card focus:outline-none">
                <span className="text-sm text-cream normal-case">{r.name}</span>
                <TownMeta card={r} className="mt-1" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
