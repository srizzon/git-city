"use client";

import { useMemo, useState } from "react";
import type { CityBuilding } from "@/lib/github";
import Panel from "./Panel";
import { Avatar } from "./shared";

// Find a building by GitHub username: type, pick, and the camera flies to it
// with its card open (where Drive here is).

const MAX = 40;

export default function FindPanel({
  buildings,
  onPick,
  onClose,
}: {
  buildings: CityBuilding[];
  onPick: (b: CityBuilding) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().replace(/^@/, "").toLowerCase();
  // Logins that start with what you typed first, then the rest that contain it; by rank within each.
  const found = useMemo(() => {
    const byRank = [...buildings].sort((a, b) => a.rank - b.rank);
    if (!q) return byRank.slice(0, MAX);
    const starts = byRank.filter((b) => b.loginLower.startsWith(q));
    const contains = byRank.filter((b) => !b.loginLower.startsWith(q) && (b.loginLower.includes(q) || !!b.name?.toLowerCase().includes(q)));
    return [...starts, ...contains].slice(0, MAX);
  }, [buildings, q]);

  return (
    <Panel title="Find a building" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (found[0]) onPick(found[0]);
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="GitHub username"
          aria-label="GitHub username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="w-full border-2 border-border bg-bg px-3 py-2 text-base normal-case text-cream outline-none placeholder:text-dim focus:border-lime/60 sm:text-[11px]"
        />
      </form>
      {found.length === 0 ? (
        <p className="mt-4 text-[10px] normal-case text-muted">No building for @{q} in this town.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {found.map((b) => (
            <li key={b.loginLower}>
              <button
                type="button"
                onClick={() => onPick(b)}
                className="flex w-full items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-white/5"
              >
                <Avatar src={b.avatar_url} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] normal-case text-cream">@{b.login}</span>
                  {b.name && <span className="block truncate text-[9px] normal-case text-muted">{b.name}</span>}
                </span>
                <span className="shrink-0 text-[9px] text-dim">#{b.rank}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
