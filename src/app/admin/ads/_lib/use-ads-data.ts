"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { AdStats, AdsFilters, SortKey, SortDir, AdForm } from "./types";
import { getAdStatus, getStatusOrder, generateSlug } from "./helpers";

interface UseAdsDataOptions {
  filters: AdsFilters;
  onToast: (message: string, type: "success" | "error") => void;
}

export function useAdsData({ filters, onToast }: UseAdsDataOptions) {
  const [ads, setAds] = useState<AdStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const hasFetchedRef = useRef(false);

  const fetchStats = useCallback(async () => {
    // Keep stale data visible (don't clear ads)
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sky-ads/analytics?period=${filters.period}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAds(data.ads ?? []);
      hasFetchedRef.current = true;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters.period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Filter + sort
  const filteredAndSorted = useMemo(() => {
    let result = [...ads];

    // Search
    if (filters.q.trim()) {
      const q = filters.q.toLowerCase();
      result = result.filter(
        (ad) =>
          ad.brand.toLowerCase().includes(q) ||
          ad.id.toLowerCase().includes(q) ||
          ad.text.toLowerCase().includes(q) ||
          (ad.purchaser_email?.toLowerCase().includes(q) ?? false),
      );
    }

    // Status filter
    if (filters.status !== "all") {
      result = result.filter((ad) => getAdStatus(ad) === filters.status);
    }

    // Vehicle filter
    if (filters.vehicle !== "all") {
      result = result.filter((ad) => ad.vehicle === filters.vehicle);
    }

    // Source filter
    if (filters.source !== "all") {
      result = result.filter((ad) =>
        filters.source === "paid" ? !!ad.plan_id : !ad.plan_id,
      );
    }

    // Sort - user's choice is the ONLY sort (no forced "active first")
    const dir = filters.dir === "asc" ? 1 : -1;
    result.sort((a, b) => {
      switch (filters.sort) {
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
          return dir * (getStatusOrder(getAdStatus(a)) - getStatusOrder(getAdStatus(b)));
        default:
          return 0;
      }
    });

    return result;
  }, [ads, filters]);

  // Totals
  const totals = useMemo(() => {
    const t = ads.reduce(
      (acc, a) => ({
        impressions: acc.impressions + a.impressions,
        clicks: acc.clicks + a.clicks,
        cta_clicks: acc.cta_clicks + a.cta_clicks,
      }),
      { impressions: 0, clicks: 0, cta_clicks: 0 },
    );
    const totalCtr =
      t.impressions > 0
        ? (((t.clicks + t.cta_clicks) / t.impressions) * 100).toFixed(2) + "%"
        : "0%";
    return { ...t, ctr: totalCtr };
  }, [ads]);

  const activeCount = useMemo(
    () => ads.filter((a) => getAdStatus(a) === "active").length,
    [ads],
  );
  const paidCount = useMemo(() => ads.filter((a) => !!a.plan_id).length, [ads]);

  // Toggle active/paused (optimistic)
  const handleToggle = useCallback(
    async (id: string, currentActive: boolean) => {
      const newActive = !currentActive;
      // Optimistic update
      setAds((prev) =>
        prev.map((ad) => (ad.id === id ? { ...ad, active: newActive } : ad)),
      );
      try {
        const res = await fetch("/api/sky-ads/manage", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, active: newActive }),
        });
        if (!res.ok) throw new Error("Failed to toggle");
        onToast(newActive ? "Ad resumed" : "Ad paused", "success");
      } catch {
        // Revert
        setAds((prev) =>
          prev.map((ad) =>
            ad.id === id ? { ...ad, active: currentActive } : ad,
          ),
        );
        onToast("Failed to toggle ad", "error");
      }
    },
    [onToast],
  );

  // Delete
  const handleDelete = useCallback(
    async (id: string) => {
      const prev = ads;
      setAds((a) => a.filter((ad) => ad.id !== id));
      try {
        const res = await fetch(`/api/sky-ads/manage?id=${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete");
        onToast("Ad deleted", "success");
      } catch {
        setAds(prev);
        onToast("Failed to delete ad", "error");
      }
    },
    [ads, onToast],
  );

  // Create
  const handleCreate = useCallback(
    async (form: AdForm) => {
      setSaving(true);
      try {
        const payload = {
          ...form,
          id: generateSlug(form.brand),
          description: form.description || null,
          link: form.link || null,
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
          onToast(data.error ?? "Failed to create ad", "error");
          return false;
        }
        onToast("Ad created", "success");
        fetchStats();
        return true;
      } catch {
        onToast("Failed to create ad", "error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [fetchStats, onToast],
  );

  // Edit
  const handleEdit = useCallback(
    async (id: string, form: AdForm) => {
      setSaving(true);
      try {
        const res = await fetch("/api/sky-ads/manage", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            brand: form.brand,
            text: form.text,
            description: form.description || null,
            color: form.color,
            bg_color: form.bg_color,
            link: form.link || null,
            vehicle: form.vehicle,
            priority: form.priority,
            starts_at: form.starts_at || null,
            ends_at: form.ends_at || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          onToast(data.error ?? "Failed to save", "error");
          return false;
        }
        onToast("Ad updated", "success");
        fetchStats();
        return true;
      } catch {
        onToast("Failed to save ad", "error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [fetchStats, onToast],
  );

  // Batch operations
  const handleBatch = useCallback(
    async (ids: string[], action: "pause" | "resume" | "delete") => {
      setSaving(true);
      try {
        const res = await fetch("/api/sky-ads/manage", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, action }),
        });
        if (!res.ok) {
          const data = await res.json();
          onToast(data.error ?? "Batch operation failed", "error");
          return false;
        }
        onToast(`${ids.length} ads ${action === "delete" ? "deleted" : action === "pause" ? "paused" : "resumed"}`, "success");
        fetchStats();
        return true;
      } catch {
        onToast("Batch operation failed", "error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [fetchStats, onToast],
  );

  return {
    ads,
    filteredAndSorted,
    loading,
    error,
    saving,
    totals,
    activeCount,
    paidCount,
    hasFetched: hasFetchedRef.current,
    fetchStats,
    handleToggle,
    handleDelete,
    handleCreate,
    handleEdit,
    handleBatch,
  };
}
