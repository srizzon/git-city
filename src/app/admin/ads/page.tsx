"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

interface AdStats {
  id: string;
  brand: string;
  text: string;
  description: string | null;
  color: string;
  bg_color: string;
  link: string | null;
  vehicle: string;
  active: boolean;
  priority: number;
  plan_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  purchaser_email: string | null;
  tracking_token: string | null;
  created_at: string | null;
  impressions: number;
  clicks: number;
  cta_clicks: number;
  ctr: string;
}

interface AdForm {
  brand: string;
  text: string;
  description: string;
  color: string;
  bg_color: string;
  link: string;
  vehicle: "plane" | "blimp" | "billboard" | "rooftop_sign" | "led_wrap";
  priority: number;
  starts_at: string;
  ends_at: string;
}

const EMPTY_FORM: AdForm = {
  brand: "",
  text: "",
  description: "",
  color: "#f8d880",
  bg_color: "#1a1018",
  link: "",
  vehicle: "plane",
  priority: 50,
  starts_at: "",
  ends_at: "",
};

function generateSlug(brand: string): string {
  const slug = brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  const rand = Math.random().toString(36).slice(2, 8);
  return slug ? `${slug}-${rand}` : `ad-${rand}`;
}

const VEHICLE_LABELS: Record<string, string> = {
  plane: "Plane",
  blimp: "Blimp",
  billboard: "Billboard",
  rooftop_sign: "Rooftop Sign",
  led_wrap: "LED Wrap",
};

type SortKey = "brand" | "impressions" | "clicks" | "cta_clicks" | "ctr" | "priority" | "created_at" | "status";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "active" | "paused" | "expired";
type VehicleFilter = "all" | "plane" | "blimp" | "billboard" | "rooftop_sign" | "led_wrap";
type SourceFilter = "all" | "paid" | "manual";

function fmtDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateShort(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

function getAdStatus(ad: AdStats): "active" | "paused" | "expired" {
  const isExpired = ad.ends_at ? new Date() > new Date(ad.ends_at) : false;
  if (isExpired) return "expired";
  return ad.active ? "active" : "paused";
}

function StatusBadge({ status }: { status: "active" | "paused" | "expired" }) {
  const styles = {
    active: "bg-lime/15 text-lime border-lime/30",
    paused: "bg-yellow-900/20 text-yellow-400 border-yellow-600/30",
    expired: "bg-red-900/20 text-red-400 border-red-800/30",
  };
  const labels = { active: "ACTIVE", paused: "PAUSED", expired: "EXPIRED" };
  return (
    <span className={`inline-block border px-2 py-0.5 text-[10px] ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function SortButton({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer text-left text-[11px] transition-colors ${
        isActive ? "text-lime" : "text-muted hover:text-cream"
      }`}
    >
      {label}
      {isActive && (
        <span className="ml-1 text-[9px]">{currentDir === "asc" ? "\u25B2" : "\u25BC"}</span>
      )}
    </button>
  );
}

const STORAGE_KEY = "admin-ads-filters";

function loadFilters() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function AdminAdsPage() {
  const saved = useMemo(() => loadFilters(), []);

  const [ads, setAds] = useState<AdStats[]>([]);
  const [period, setPeriod] = useState<"7d" | "30d" | "all">(saved?.period ?? "30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AdForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AdForm>(EMPTY_FORM);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>(saved?.sortKey ?? "impressions");
  const [sortDir, setSortDir] = useState<SortDir>(saved?.sortDir ?? "desc");

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(saved?.statusFilter ?? "all");
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>(saved?.vehicleFilter ?? "all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(saved?.sourceFilter ?? "all");
  const [searchQuery, setSearchQuery] = useState(saved?.searchQuery ?? "");

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ period, sortKey, sortDir, statusFilter, vehicleFilter, sourceFilter, searchQuery })
    );
  }, [period, sortKey, sortDir, statusFilter, vehicleFilter, sourceFilter, searchQuery]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sky-ads/analytics?period=${period}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAds(data.ads ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = [...ads];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (ad) =>
          ad.brand.toLowerCase().includes(q) ||
          ad.id.toLowerCase().includes(q) ||
          ad.text.toLowerCase().includes(q) ||
          (ad.purchaser_email?.toLowerCase().includes(q) ?? false)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((ad) => getAdStatus(ad) === statusFilter);
    }

    // Vehicle filter
    if (vehicleFilter !== "all") {
      result = result.filter((ad) => ad.vehicle === vehicleFilter);
    }

    // Source filter
    if (sourceFilter !== "all") {
      result = result.filter((ad) =>
        sourceFilter === "paid" ? !!ad.plan_id : !ad.plan_id
      );
    }

    // Sort: always active first, then by user-chosen key
    const statusOrder = { active: 0, paused: 1, expired: 2 };
    result.sort((a, b) => {
      // Primary: active ads always first
      const statusDiff = statusOrder[getAdStatus(a)] - statusOrder[getAdStatus(b)];
      if (statusDiff !== 0) return statusDiff;

      // Secondary: user sort
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "brand":
          return dir * (a.brand || a.id).localeCompare(b.brand || b.id);
        case "impressions":
          return dir * (a.impressions - b.impressions);
        case "clicks":
          return dir * (a.clicks - b.clicks);
        case "cta_clicks":
          return dir * (a.cta_clicks - b.cta_clicks);
        case "ctr":
          return dir * (parseFloat(a.ctr) - parseFloat(b.ctr));
        case "priority":
          return dir * (a.priority - b.priority);
        case "created_at":
          return dir * ((a.created_at ?? "").localeCompare(b.created_at ?? ""));
        case "status":
          return 0; // already sorted by status above
        default:
          return 0;
      }
    });

    return result;
  }, [ads, searchQuery, statusFilter, vehicleFilter, sourceFilter, sortKey, sortDir]);

  const handleToggle = async (id: string, active: boolean) => {
    await fetch("/api/sky-ads/manage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    fetchStats();
  };

  const handleStartEdit = (ad: AdStats) => {
    setEditingId(ad.id);
    setExpandedId(ad.id);
    setEditForm({
      brand: ad.brand,
      text: ad.text,
      description: ad.description ?? "",
      color: ad.color,
      bg_color: ad.bg_color,
      link: ad.link ?? "",
      vehicle: ad.vehicle as AdForm["vehicle"],
      priority: ad.priority,
      starts_at: ad.starts_at ? ad.starts_at.slice(0, 16) : "",
      ends_at: ad.ends_at ? ad.ends_at.slice(0, 16) : "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sky-ads/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          brand: editForm.brand,
          text: editForm.text,
          description: editForm.description || null,
          color: editForm.color,
          bg_color: editForm.bg_color,
          link: editForm.link || null,
          vehicle: editForm.vehicle,
          priority: editForm.priority,
          starts_at: editForm.starts_at || null,
          ends_at: editForm.ends_at || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Failed to save");
        return;
      }
      setEditingId(null);
      fetchStats();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete ad "${id}" permanently? This removes all event data too.`))
      return;
    await fetch(`/api/sky-ads/manage?id=${id}`, { method: "DELETE" });
    fetchStats();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        id: generateSlug(form.brand),
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      };
      const res = await fetch("/api/sky-ads/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Failed to create ad");
        return;
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      fetchStats();
    } finally {
      setSaving(false);
    }
  };

  const totals = ads.reduce(
    (acc, a) => ({
      impressions: acc.impressions + a.impressions,
      clicks: acc.clicks + a.clicks,
      cta_clicks: acc.cta_clicks + a.cta_clicks,
    }),
    { impressions: 0, clicks: 0, cta_clicks: 0 }
  );
  const totalCtr =
    totals.impressions > 0
      ? (((totals.clicks + totals.cta_clicks) / totals.impressions) * 100).toFixed(2) + "%"
      : "0%";

  const activeCount = ads.filter((a) => getAdStatus(a) === "active").length;
  const paidCount = ads.filter((a) => !!a.plan_id).length;

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl text-cream">ADS</h1>
            <p className="mt-1 text-xs text-muted">
              {ads.length} ads total / {activeCount} active / {paidCount} paid
            </p>
          </div>
          <div className="flex gap-3">
            <a
              href="/"
              className="border border-border px-4 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream"
            >
              BACK
            </a>
            <button
              onClick={() => setShowForm(!showForm)}
              className="cursor-pointer border-2 border-lime px-4 py-2 text-xs text-lime transition-colors hover:bg-lime/10"
            >
              {showForm ? "CANCEL" : "+ NEW AD"}
            </button>
          </div>
        </div>

        {/* Create form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-8 border-2 border-border bg-bg-raised p-6"
          >
            <p className="mb-4 text-sm text-cream">CREATE NEW AD</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Brand *</label>
                <input
                  required
                  placeholder="Acme Inc"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] text-muted">Vehicle</label>
                <div className="flex flex-wrap">
                  {(["plane", "blimp", "billboard", "rooftop_sign", "led_wrap"] as const).map((val, i) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setForm({ ...form, vehicle: val })}
                      className={`cursor-pointer border px-3 py-2.5 text-xs transition-colors ${
                        form.vehicle === val
                          ? "border-lime bg-lime/10 text-lime"
                          : "border-border text-muted hover:text-cream"
                      } ${i > 0 ? "border-l-0" : ""}`}
                    >
                      {VEHICLE_LABELS[val]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1 block text-[11px] text-muted">Banner text * (max 80)</label>
                <input
                  required
                  placeholder="YOUR BRAND MESSAGE HERE"
                  maxLength={80}
                  value={form.text}
                  onChange={(e) => setForm({ ...form, text: e.target.value })}
                  className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1 block text-[11px] text-muted">Description</label>
                <input
                  placeholder="Internal note"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1 block text-[11px] text-muted">Link</label>
                <input
                  placeholder="https://example.com"
                  value={form.link}
                  onChange={(e) => setForm({ ...form, link: e.target.value })}
                  className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                />
              </div>
              <div className="flex items-end gap-4">
                <div>
                  <label className="mb-1 block text-[11px] text-muted">Text color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="h-9 w-9 cursor-pointer border border-border bg-bg"
                    />
                    <span className="text-xs text-dim">{form.color}</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted">BG color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.bg_color}
                      onChange={(e) => setForm({ ...form, bg_color: e.target.value })}
                      className="h-9 w-9 cursor-pointer border border-border bg-bg"
                    />
                    <span className="text-xs text-dim">{form.bg_color}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Priority</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: parseInt(e.target.value) || 50 })
                  }
                  className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Starts at</label>
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Ends at</label>
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                  className="w-full border border-border bg-bg px-3 py-2.5 text-xs text-cream outline-none focus:border-lime"
                />
              </div>
            </div>

            {/* Banner preview */}
            {form.text && (
              <div className="mt-4">
                <p className="mb-1 text-[11px] text-muted">Preview</p>
                <div
                  className="overflow-hidden px-4 py-2 text-center text-xs tracking-widest"
                  style={{
                    backgroundColor: form.bg_color,
                    color: form.color,
                    fontFamily: "monospace",
                    letterSpacing: "0.12em",
                  }}
                >
                  {form.text}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-5 cursor-pointer border-2 border-lime bg-lime/10 px-6 py-2.5 text-xs text-lime transition-colors hover:bg-lime/20 disabled:opacity-50"
            >
              {saving ? "CREATING..." : "CREATE AD"}
            </button>
          </form>
        )}

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="border border-border bg-bg-raised p-4">
            <p className="text-[11px] text-muted">IMPRESSIONS</p>
            <p className="mt-1 text-2xl text-cream">{totals.impressions.toLocaleString()}</p>
          </div>
          <div className="border border-border bg-bg-raised p-4">
            <p className="text-[11px] text-muted">3D CLICKS</p>
            <p className="mt-1 text-2xl text-cream">{totals.clicks.toLocaleString()}</p>
          </div>
          <div className="border border-border bg-bg-raised p-4">
            <p className="text-[11px] text-muted">CTA CLICKS</p>
            <p className="mt-1 text-2xl text-cream">{totals.cta_clicks.toLocaleString()}</p>
          </div>
          <div className="border border-border bg-bg-raised p-4">
            <p className="text-[11px] text-muted">CTR</p>
            <p className="mt-1 text-2xl text-lime">{totalCtr}</p>
          </div>
        </div>

        {/* Toolbar: period + filters + search */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Period */}
          <div className="flex">
            {(["7d", "30d", "all"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`cursor-pointer border px-3 py-1.5 text-[11px] transition-colors ${
                  period === p
                    ? "border-lime bg-lime/10 text-lime"
                    : "border-border text-muted hover:text-cream"
                } ${p === "7d" ? "border-r-0" : p === "all" ? "border-l-0" : ""}`}
              >
                {p === "all" ? "ALL" : p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-border" />

          {/* Status filter */}
          <div className="flex">
            {([["all", "ALL"], ["active", "ACTIVE"], ["paused", "PAUSED"], ["expired", "EXPIRED"]] as const).map(([val, label], i, arr) => (
              <button
                key={val}
                onClick={() => setStatusFilter(val as StatusFilter)}
                className={`cursor-pointer border px-3 py-1.5 text-[11px] transition-colors ${
                  statusFilter === val
                    ? "border-lime bg-lime/10 text-lime"
                    : "border-border text-muted hover:text-cream"
                } ${i > 0 ? "border-l-0" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Vehicle filter */}
          <div className="flex flex-wrap">
            {(["all", "plane", "blimp", "billboard", "rooftop_sign", "led_wrap"] as const).map((val, i) => (
              <button
                key={val}
                onClick={() => setVehicleFilter(val as VehicleFilter)}
                className={`cursor-pointer border px-3 py-1.5 text-[11px] transition-colors ${
                  vehicleFilter === val
                    ? "border-lime bg-lime/10 text-lime"
                    : "border-border text-muted hover:text-cream"
                } ${i > 0 ? "border-l-0" : ""}`}
              >
                {val === "all" ? "ALL" : (VEHICLE_LABELS[val] ?? val).toUpperCase()}
              </button>
            ))}
          </div>

          {/* Source filter */}
          <div className="flex">
            {([["all", "ALL"], ["paid", "PAID"], ["manual", "MANUAL"]] as const).map(([val, label], i) => (
              <button
                key={val}
                onClick={() => setSourceFilter(val as SourceFilter)}
                className={`cursor-pointer border px-3 py-1.5 text-[11px] transition-colors ${
                  sourceFilter === val
                    ? "border-lime bg-lime/10 text-lime"
                    : "border-border text-muted hover:text-cream"
                } ${i > 0 ? "border-l-0" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search brand, id, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ml-auto min-w-[200px] border border-border bg-bg px-3 py-1.5 text-[11px] text-cream outline-none placeholder:text-dim focus:border-lime"
          />

          {/* Refresh */}
          <button
            onClick={fetchStats}
            className="cursor-pointer border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-cream"
          >
            REFRESH
          </button>
        </div>

        {/* Results count */}
        <p className="mb-3 text-[11px] text-dim">
          {filteredAndSorted.length} of {ads.length} ads
        </p>

        {error && (
          <div className="mb-4 border border-red-800 bg-red-900/20 p-4 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Table header */}
        {!loading && filteredAndSorted.length > 0 && (
          <div className="hidden border border-border bg-bg-raised px-4 py-3 lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_80px_160px]  lg:items-center lg:gap-4">
            <SortButton label="AD" sortKey="brand" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="IMPRESSIONS" sortKey="impressions" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="3D CLICKS" sortKey="clicks" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="CTA CLICKS" sortKey="cta_clicks" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="CTR" sortKey="ctr" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortButton label="STATUS" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <span className="text-right text-[11px] text-muted">ACTIONS</span>
          </div>
        )}

        {/* Ad rows */}
        {loading ? (
          <p className="py-12 text-center text-sm text-muted">Loading...</p>
        ) : (
          <div className="space-y-0">
            {filteredAndSorted.map((ad) => {
              const status = getAdStatus(ad);
              const isPaid = !!ad.plan_id;
              const isExpanded = expandedId === ad.id;

              return (
                <div key={ad.id} className="border border-border border-t-0 first:border-t bg-bg-raised transition-colors hover:bg-bg-card">
                  {/* Main row */}
                  <div
                    className="cursor-pointer px-4 py-3 lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_80px_160px] lg:items-center lg:gap-4"
                    onClick={() => setExpandedId(isExpanded ? null : ad.id)}
                  >
                    {/* Ad info */}
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-dim">
                        {(VEHICLE_LABELS[ad.vehicle] ?? ad.vehicle).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-cream">{ad.brand || ad.id}</span>
                          {isPaid && (
                            <span className="border border-blue-600/30 bg-blue-900/20 px-1.5 py-0.5 text-[10px] text-blue-400">
                              PAID
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-dim">{ad.id}</p>
                      </div>
                    </div>

                    {/* Stats - desktop */}
                    <p className="hidden text-sm text-cream lg:block">
                      {ad.impressions.toLocaleString()}
                    </p>
                    <p className="hidden text-sm text-cream lg:block">
                      {ad.clicks.toLocaleString()}
                    </p>
                    <p className="hidden text-sm text-cream lg:block">
                      {ad.cta_clicks.toLocaleString()}
                    </p>
                    <p className="hidden text-sm text-lime lg:block">{ad.ctr}</p>
                    <div className="hidden lg:block">
                      <StatusBadge status={status} />
                    </div>

                    {/* Actions */}
                    <div className="hidden items-center justify-end gap-2 lg:flex" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleStartEdit(ad)}
                        className="cursor-pointer border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-lime hover:text-lime"
                      >
                        EDIT
                      </button>
                      <button
                        onClick={() => handleToggle(ad.id, ad.active)}
                        className="cursor-pointer border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-border-light hover:text-cream"
                      >
                        {ad.active ? "PAUSE" : "RESUME"}
                      </button>
                      <button
                        onClick={() => handleDelete(ad.id)}
                        className="cursor-pointer border border-red-800/50 px-2 py-1 text-[10px] text-red-400 transition-colors hover:border-red-800 hover:bg-red-900/20"
                      >
                        DEL
                      </button>
                    </div>

                    {/* Stats - mobile */}
                    <div className="mt-2 flex items-center gap-4 lg:hidden">
                      <StatusBadge status={status} />
                      <span className="text-xs text-cream">{ad.impressions.toLocaleString()} imp</span>
                      <span className="text-xs text-cream">{(ad.clicks + ad.cta_clicks).toLocaleString()} clicks</span>
                      <span className="text-xs text-lime">{ad.ctr}</span>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && editingId === ad.id && (
                    <div className="border-t border-lime/30 px-4 py-4">
                      {/* Edit form */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-[11px] text-muted">Brand</label>
                          <input
                            value={editForm.brand}
                            onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                            className="w-full border border-border bg-bg px-3 py-2 text-xs text-cream outline-none focus:border-lime"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-muted">Vehicle</label>
                          <div className="flex flex-wrap">
                            {(["plane", "blimp", "billboard", "rooftop_sign", "led_wrap"] as const).map((val, i) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setEditForm({ ...editForm, vehicle: val })}
                                className={`cursor-pointer border px-2 py-2 text-[10px] transition-colors ${
                                  editForm.vehicle === val
                                    ? "border-lime bg-lime/10 text-lime"
                                    : "border-border text-muted hover:text-cream"
                                } ${i > 0 ? "border-l-0" : ""}`}
                              >
                                {VEHICLE_LABELS[val]}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-muted">Priority</label>
                          <input
                            type="number"
                            value={editForm.priority}
                            onChange={(e) => setEditForm({ ...editForm, priority: parseInt(e.target.value) || 50 })}
                            className="w-full border border-border bg-bg px-3 py-2 text-xs text-cream outline-none focus:border-lime"
                          />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                          <label className="mb-1 block text-[11px] text-muted">Banner text (max 80)</label>
                          <input
                            maxLength={80}
                            value={editForm.text}
                            onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                            className="w-full border border-border bg-bg px-3 py-2 text-xs text-cream outline-none focus:border-lime"
                          />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                          <label className="mb-1 block text-[11px] text-muted">Description (shown on click dialog)</label>
                          <textarea
                            maxLength={200}
                            rows={2}
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            className="w-full border border-border bg-bg px-3 py-2 text-xs text-cream outline-none focus:border-lime"
                          />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                          <label className="mb-1 block text-[11px] text-muted">Link</label>
                          <input
                            value={editForm.link}
                            onChange={(e) => setEditForm({ ...editForm, link: e.target.value })}
                            className="w-full border border-border bg-bg px-3 py-2 text-xs text-cream outline-none focus:border-lime"
                          />
                        </div>
                        <div className="flex items-end gap-4">
                          <div>
                            <label className="mb-1 block text-[11px] text-muted">Text color</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={editForm.color}
                                onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                                className="h-9 w-9 cursor-pointer border border-border bg-bg"
                              />
                              <span className="text-xs text-dim">{editForm.color}</span>
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] text-muted">BG color</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={editForm.bg_color}
                                onChange={(e) => setEditForm({ ...editForm, bg_color: e.target.value })}
                                className="h-9 w-9 cursor-pointer border border-border bg-bg"
                              />
                              <span className="text-xs text-dim">{editForm.bg_color}</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-muted">Starts at</label>
                          <input
                            type="datetime-local"
                            value={editForm.starts_at}
                            onChange={(e) => setEditForm({ ...editForm, starts_at: e.target.value })}
                            className="w-full border border-border bg-bg px-3 py-2 text-xs text-cream outline-none focus:border-lime"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-muted">Ends at</label>
                          <input
                            type="datetime-local"
                            value={editForm.ends_at}
                            onChange={(e) => setEditForm({ ...editForm, ends_at: e.target.value })}
                            className="w-full border border-border bg-bg px-3 py-2 text-xs text-cream outline-none focus:border-lime"
                          />
                        </div>
                      </div>

                      {/* Live preview */}
                      {editForm.text && (
                        <div className="mt-4">
                          <p className="mb-1 text-[11px] text-muted">Preview</p>
                          <div
                            className="overflow-hidden px-4 py-2 text-center text-xs tracking-widest"
                            style={{
                              backgroundColor: editForm.bg_color,
                              color: editForm.color,
                              fontFamily: "monospace",
                              letterSpacing: "0.12em",
                            }}
                          >
                            {editForm.text}
                          </div>
                        </div>
                      )}

                      {/* Save / Cancel */}
                      <div className="mt-4 flex gap-3">
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="cursor-pointer border-2 border-lime bg-lime/10 px-5 py-2 text-xs text-lime transition-colors hover:bg-lime/20 disabled:opacity-50"
                        >
                          {saving ? "SAVING..." : "SAVE"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="cursor-pointer border border-border px-5 py-2 text-xs text-muted transition-colors hover:text-cream"
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  )}

                  {isExpanded && editingId !== ad.id && (
                    <div className="border-t border-border/50 px-4 py-4">
                      {/* Banner preview */}
                      <div
                        className="mb-4 overflow-hidden px-4 py-2 text-center text-xs tracking-widest"
                        style={{
                          backgroundColor: ad.bg_color,
                          color: ad.color,
                          fontFamily: "monospace",
                          letterSpacing: "0.12em",
                        }}
                      >
                        {ad.text}
                      </div>

                      {/* Details grid */}
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
                        <div>
                          <span className="text-[11px] text-dim">Colors</span>
                          <div className="mt-1 flex items-center gap-2">
                            <span
                              className="inline-block h-4 w-4 border border-border"
                              style={{ backgroundColor: ad.color }}
                            />
                            <span className="text-muted">{ad.color}</span>
                            <span
                              className="inline-block h-4 w-4 border border-border"
                              style={{ backgroundColor: ad.bg_color }}
                            />
                            <span className="text-muted">{ad.bg_color}</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-[11px] text-dim">Link</span>
                          <p className="mt-1 truncate text-muted">
                            {ad.link ? (
                              <a
                                href={ad.link}
                                target="_blank"
                                rel="noopener"
                                className="text-lime hover:underline"
                              >
                                {ad.link}
                              </a>
                            ) : (
                              "-"
                            )}
                          </p>
                        </div>
                        <div>
                          <span className="text-[11px] text-dim">Priority</span>
                          <p className="mt-1 text-cream">{ad.priority}</p>
                        </div>
                        <div>
                          <span className="text-[11px] text-dim">Plan</span>
                          <p className="mt-1 text-cream">
                            {ad.plan_id?.replace("_", " ") || "manual"}
                          </p>
                        </div>
                        <div>
                          <span className="text-[11px] text-dim">Start</span>
                          <p className="mt-1 text-cream">{fmtDate(ad.starts_at)}</p>
                        </div>
                        <div>
                          <span className="text-[11px] text-dim">End</span>
                          <p className="mt-1 text-cream">{fmtDate(ad.ends_at)}</p>
                        </div>
                        <div>
                          <span className="text-[11px] text-dim">Email</span>
                          <p className="mt-1 truncate text-cream">
                            {ad.purchaser_email || "-"}
                          </p>
                        </div>
                        <div>
                          <span className="text-[11px] text-dim">Created</span>
                          <p className="mt-1 text-cream">{fmtDate(ad.created_at)}</p>
                        </div>
                      </div>

                      {/* Stats row (mobile) + tracking link */}
                      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border/50 pt-3">
                        <div className="lg:hidden">
                          <span className="text-[11px] text-dim">Impressions: </span>
                          <span className="text-xs text-cream">{ad.impressions.toLocaleString()}</span>
                        </div>
                        <div className="lg:hidden">
                          <span className="text-[11px] text-dim">3D clicks: </span>
                          <span className="text-xs text-cream">{ad.clicks.toLocaleString()}</span>
                        </div>
                        <div className="lg:hidden">
                          <span className="text-[11px] text-dim">CTA clicks: </span>
                          <span className="text-xs text-cream">{ad.cta_clicks.toLocaleString()}</span>
                        </div>

                        {ad.tracking_token && (
                          <a
                            href={`/advertise/track/${ad.tracking_token}`}
                            target="_blank"
                            className="text-xs text-lime hover:underline"
                          >
                            Open tracking page
                          </a>
                        )}

                        {/* Mobile actions */}
                        <div className="ml-auto flex gap-2 lg:hidden">
                          <button
                            onClick={() => handleStartEdit(ad)}
                            className="cursor-pointer border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:border-lime hover:text-lime"
                          >
                            EDIT
                          </button>
                          <button
                            onClick={() => handleToggle(ad.id, ad.active)}
                            className="cursor-pointer border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-cream"
                          >
                            {ad.active ? "PAUSE" : "RESUME"}
                          </button>
                          <button
                            onClick={() => handleDelete(ad.id)}
                            className="cursor-pointer border border-red-800/50 px-3 py-1.5 text-[11px] text-red-400 transition-colors hover:bg-red-900/20"
                          >
                            DELETE
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredAndSorted.length === 0 && (
              <p className="py-12 text-center text-sm text-muted">
                {ads.length === 0 ? "No ads found" : "No ads match your filters"}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
