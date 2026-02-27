import type { AdStats, AdStatus } from "./types";

export function generateSlug(brand: string): string {
  const slug = brand
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  const rand = Math.random().toString(36).slice(2, 8);
  return slug ? `${slug}-${rand}` : `ad-${rand}`;
}

export function fmtDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getAdStatus(ad: AdStats): AdStatus {
  const isExpired = ad.ends_at ? new Date() > new Date(ad.ends_at) : false;
  if (isExpired) return "expired";
  return ad.active ? "active" : "paused";
}

export function getStatusOrder(status: AdStatus): number {
  const order: Record<AdStatus, number> = { active: 0, paused: 1, expired: 2 };
  return order[status];
}
