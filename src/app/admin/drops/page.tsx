"use client";

import { useState, useEffect, useCallback } from "react";

interface Drop {
  id: string;
  building_id: number;
  rarity: string;
  points: number;
  max_pulls: number;
  pull_count: number;
  expires_at: string;
  item_reward: string | null;
  developers?: { github_login: string; avatar_url: string | null };
}

interface Item {
  id: string;
  name: string;
  category: string;
}

const RARITY_STYLES: Record<string, string> = {
  common: "bg-green-900/20 text-green-400 border-green-600/30",
  rare: "bg-blue-900/20 text-blue-400 border-blue-600/30",
  epic: "bg-purple-900/20 text-purple-400 border-purple-600/30",
  legendary: "bg-yellow-900/20 text-yellow-400 border-yellow-600/30",
};

export default function AdminDropsPage() {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [buildingLogin, setBuildingLogin] = useState("");
  const [rarity, setRarity] = useState("common");
  const [durationHours, setDurationHours] = useState(24);
  const [maxPulls, setMaxPulls] = useState(50);
  const [itemReward, setItemReward] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchDrops = useCallback(async () => {
    try {
      const res = await fetch("/api/drops/active");
      const data = await res.json();
      setDrops(data.drops ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/items");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchDrops(); fetchItems(); }, [fetchDrops, fetchItems]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/drops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_login: buildingLogin.trim().toLowerCase(),
          rarity,
          duration_hours: durationHours,
          max_pulls: maxPulls,
          item_reward: rarity === "legendary" && itemReward ? itemReward : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create drop");
        setTimeout(() => setError(null), 4000);
      } else {
        setSuccess(`Drop created on @${buildingLogin}`);
        setBuildingLogin("");
        setItemReward("");
        setTimeout(() => setSuccess(null), 3000);
        fetchDrops();
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this drop?")) return;
    try {
      await fetch(`/api/admin/drops/${id}`, { method: "DELETE" });
      fetchDrops();
    } catch { /* ignore */ }
  };

  const activeCount = drops.length;

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-sm text-cream">Creator Drops</h1>
          <p className="mt-1 text-[11px] text-muted">Plant drops on buildings for players to find</p>
        </div>

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="border border-border bg-bg-raised p-4">
            <p className="text-[11px] text-muted">Active</p>
            <p className="mt-1 text-2xl text-cream">{activeCount}</p>
          </div>
          <div className="border border-border bg-bg-raised p-4">
            <p className="text-[11px] text-muted">Total Pulls</p>
            <p className="mt-1 text-2xl text-cream">
              {drops.reduce((s, d) => s + d.pull_count, 0)}
            </p>
          </div>
        </div>

        {/* Toast */}
        {(error || success) && (
          <div className="fixed right-4 top-4 z-100">
            <div className={`flex items-center gap-3 border px-4 py-3 text-xs ${
              success
                ? "border-lime/30 bg-lime/10 text-lime"
                : "border-red-800/30 bg-red-900/20 text-red-400"
            }`}>
              {success ?? error}
            </div>
          </div>
        )}

        {/* Create form */}
        <div className="mb-8 border border-border bg-bg-raised p-5">
          <h2 className="mb-4 text-xs text-cream">Plant a Drop</h2>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="mb-1 block text-[11px] text-muted">Building</label>
              <input
                type="text"
                value={buildingLogin}
                onChange={(e) => setBuildingLogin(e.target.value)}
                className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                placeholder="github username"
                required
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] text-muted">Rarity</label>
                <select
                  value={rarity}
                  onChange={(e) => setRarity(e.target.value)}
                  className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                >
                  <option value="common">Common (10 pts)</option>
                  <option value="rare">Rare (50 pts)</option>
                  <option value="epic">Epic (200 pts)</option>
                  <option value="legendary">Legendary (500 pts)</option>
                </select>
              </div>

              <div className="flex-1">
                <label className="mb-1 block text-[11px] text-muted">Duration</label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                >
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                  <option value={72}>72 hours</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-muted">Max Pulls</label>
              <input
                type="number"
                value={maxPulls}
                onChange={(e) => setMaxPulls(Number(e.target.value))}
                className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                min={1}
                max={500}
              />
            </div>

            {rarity === "legendary" && (
              <div>
                <label className="mb-1 block text-[11px] text-muted">Item Reward</label>
                <select
                  value={itemReward}
                  onChange={(e) => setItemReward(e.target.value)}
                  className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                  required
                >
                  <option value="">Select an item...</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.category})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={creating}
              className="border-2 border-lime bg-lime/10 px-4 py-2.5 text-xs text-lime transition-colors hover:bg-lime/20 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Plant Drop"}
            </button>
          </form>
        </div>

        {/* Active drops */}
        <div>
          <h2 className="mb-3 text-xs text-cream">Active Drops ({activeCount})</h2>

          {loading ? (
            <div className="border border-border bg-bg-raised p-4">
              <div className="h-4 w-32 animate-pulse bg-border" />
            </div>
          ) : activeCount === 0 ? (
            <div className="border border-border bg-bg-raised p-6 text-center">
              <p className="text-xs text-muted">No active drops</p>
              <p className="mt-1 text-[11px] text-dim">Plant one using the form above</p>
            </div>
          ) : (
            <div>
              {drops.map((drop, i) => {
                const login = drop.developers?.github_login ?? `#${drop.building_id}`;
                const expiresIn = Math.max(0, Math.round((new Date(drop.expires_at).getTime() - Date.now()) / 3600000));
                const pullPct = Math.round((drop.pull_count / drop.max_pulls) * 100);
                return (
                  <div
                    key={drop.id}
                    className={`flex items-center justify-between border border-border bg-bg-raised px-4 py-3 transition-colors hover:bg-bg-card ${i > 0 ? "border-t-0" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`inline-block border px-2 py-0.5 text-[10px] capitalize ${RARITY_STYLES[drop.rarity] ?? ""}`}>
                        {drop.rarity}
                      </span>
                      <span className="text-xs text-cream">@{login}</span>
                      <span className="text-[10px] text-muted">
                        {drop.pull_count}/{drop.max_pulls} pulls ({pullPct}%)
                      </span>
                      <span className="text-[10px] text-dim">
                        {expiresIn}h left
                      </span>
                    </div>
                    <button
                      onClick={() => handleDelete(drop.id)}
                      className="border border-border px-1.5 py-0.5 text-[9px] text-muted transition-colors hover:border-red-800 hover:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
