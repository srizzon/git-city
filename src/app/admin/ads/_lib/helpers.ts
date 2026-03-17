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

export function fmtEndsIn(endsAt: string | null): string {
  if (!endsAt) return "-";
  const now = new Date();
  const end = new Date(endsAt);
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) {
    const month = end.toLocaleDateString("en", { month: "short" });
    return `${month} ${end.getDate()}`;
  }
  const days = Math.ceil(diffMs / 86400000);
  if (days === 1) return "1d left";
  if (days <= 30) return `${days}d left`;
  return `${Math.round(days / 30)}mo left`;
}

export function fmtDateShort(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}
