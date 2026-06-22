"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TIER_COLORS } from "@/lib/achievement-tiers";
import {
  MAX_FEATURED,
  resolveFeatured,
  sortByPrestige,
  type ShowcaseAchievement,
} from "@/lib/profile-showcase";
import PixelEmblem from "./PixelEmblem";
import EmblemBadge from "./EmblemBadge";

interface Props {
  achievements: ShowcaseAchievement[];
  /** Ids the owner explicitly pinned (already filtered to owned ones). */
  pinnedIds: string[];
  isOwner: boolean;
}

const TIER_LABELS: Record<string, string> = {
  diamond: "Diamond",
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Fixed locale + UTC keeps SSR and client output identical
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Border/glow treatment scales with rarity: diamond glows, gold is solid, lower tiers fade. */
function featuredTileStyle(tier: string): React.CSSProperties {
  const color = TIER_COLORS[tier] ?? "#8c8c9c";
  const style: React.CSSProperties = {
    background: `linear-gradient(180deg, ${color}10 0%, var(--color-bg-card) 65%)`,
  };
  if (tier === "diamond") {
    style.borderColor = color;
    style.boxShadow = `0 0 18px ${color}40`;
  } else if (tier === "gold") {
    style.borderColor = color;
  } else {
    style.borderColor = `${color}55`;
  }
  return style;
}

export default function TrophyCase({ achievements, pinnedIds, isOwner }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pinned, setPinned] = useState<string[]>(pinnedIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const byId = useMemo(
    () => new Map(achievements.map((a) => [a.achievement_id, a])),
    [achievements]
  );
  const featured = useMemo(
    () =>
      resolveFeatured(pinned, achievements)
        .map((id) => byId.get(id))
        .filter((a): a is ShowcaseAchievement => !!a),
    [pinned, achievements, byId]
  );
  const collection = useMemo(() => sortByPrestige(achievements), [achievements]);

  const togglePin = (id: string) => {
    setError(null);
    setPinned((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_FEATURED) return prev;
      return [...prev, id];
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured_achievements: pinned }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Couldn't save. Try again.");
      } else {
        setEditing(false);
        router.refresh();
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (achievements.length === 0) {
    return (
      <section className="border-[3px] border-border bg-bg-raised p-4 sm:p-6">
        <h2 className="text-sm text-cream">Trophy Case</h2>
        <p className="mt-3 text-[10px] text-muted normal-case">
          No achievements yet. Commit, star, raid — emblems will show up here.
        </p>
      </section>
    );
  }

  return (
    <section className="border-[3px] border-border bg-bg-raised p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm text-cream">
          Trophy Case
          <span className="ml-2 text-[10px] text-dim">featured</span>
        </h2>
        {isOwner && !editing && (
          <button
            onClick={() => {
              setEditing(true);
              setExpanded(true);
            }}
            className="border-2 border-border px-2.5 py-1 text-[9px] text-muted transition-colors hover:border-border-light hover:text-cream"
          >
            Edit
          </button>
        )}
        {isOwner && editing && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-dim">
              {pinned.length}/{MAX_FEATURED} pinned
            </span>
            <button
              onClick={() => {
                setEditing(false);
                setPinned(pinnedIds);
                setError(null);
              }}
              className="border-2 border-border px-2.5 py-1 text-[9px] text-muted transition-colors hover:text-cream"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="border-2 border-lime px-2.5 py-1 text-[9px] text-lime transition-colors hover:bg-lime/10 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
      {error && (
        <p className="mt-2 text-[9px] text-red-400 normal-case">{error}</p>
      )}

      {/* Featured emblems */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {featured.map((a) => {
          const color = TIER_COLORS[a.tier] ?? "#8c8c9c";
          const unlocked = formatDate(a.unlocked_at);
          const isPinned = pinned.includes(a.achievement_id);
          return (
            <div
              key={a.achievement_id}
              className="group relative border-[3px] p-4 text-center"
              style={featuredTileStyle(a.tier)}
            >
              {editing && isPinned && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 bg-lime" />
              )}
              <div className="flex h-10 items-center justify-center">
                <EmblemBadge
                  tier={a.tier}
                  glyph={a.glyph}
                  count={a.count}
                  showCount={!!a.is_counter}
                  size={40}
                />
              </div>
              <div className="mt-3 text-[10px] leading-tight text-cream">{a.name}</div>
              <div className="mt-1.5 text-[8px] tracking-wider" style={{ color }}>
                {TIER_LABELS[a.tier] ?? a.tier}
              </div>
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-48 -translate-x-1/2 border-2 border-border-light bg-bg p-2.5 text-left group-hover:block">
                {a.description && (
                  <p className="text-[9px] leading-relaxed text-warm normal-case">{a.description}</p>
                )}
                {unlocked && (
                  <p className="mt-1.5 text-[8px] text-dim normal-case">
                    Unlocked {unlocked}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full collection */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 w-full border-t border-border/50 pt-3 text-center text-[10px] text-muted transition-colors hover:text-cream"
      >
        {expanded ? "hide collection" : `view all (${achievements.length})`}
      </button>
      {expanded && (
        <div className="mt-3 space-y-5">
          {editing && (
            <p className="text-[9px] text-dim normal-case">
              Click an emblem to pin or unpin it. Pinned emblems lead your showcase;
              empty slots auto-fill with your rarest unlocks.
            </p>
          )}
          {(["diamond", "gold", "silver", "bronze"] as const)
            .filter((tier) => collection.some((a) => a.tier === tier))
            .map((tier) => {
              const color = TIER_COLORS[tier];
              const group = collection.filter((a) => a.tier === tier);
              return (
                <div key={tier}>
                  <h3 className="flex items-center gap-2 text-[9px] tracking-wider" style={{ color }}>
                    <PixelEmblem tier={tier} size={12} />
                    {TIER_LABELS[tier]}
                    <span className="text-dim">{group.length}</span>
                  </h3>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {group.map((a) => {
                      const isPinned = pinned.includes(a.achievement_id);
                      const unlocked = formatDate(a.unlocked_at);
                      const tip = [a.description, unlocked ? `Unlocked ${unlocked}` : null]
                        .filter(Boolean)
                        .join(" — ");
                      return (
                        <button
                          key={a.achievement_id}
                          onClick={editing ? () => togglePin(a.achievement_id) : undefined}
                          disabled={!editing}
                          title={tip || undefined}
                          className={`flex items-center gap-2 border-2 bg-bg-card px-2.5 py-2 text-left transition-colors ${
                            editing
                              ? "cursor-pointer hover:border-border-light"
                              : "cursor-default"
                          } ${editing && isPinned ? "" : "border-border"}`}
                          style={editing && isPinned ? { borderColor: color } : undefined}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                            <EmblemBadge tier={a.tier} glyph={a.glyph} size={16} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[9px] leading-tight text-muted">
                            {a.name}
                          </span>
                          {editing && isPinned && (
                            <span className="h-1.5 w-1.5 shrink-0 bg-lime" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}
