import "server-only";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

// Shared building blocks for the emblems admin API (gate + validators), so the
// list/create, update/delete, and grant routes stay consistent.

export const EMBLEM_TIERS = ["bronze", "silver", "gold", "diamond"] as const;

// Metric names a threshold emblem can reference — must match the keys of
// EmblemStats in src/lib/emblems.ts (the evaluator reads stats[metric]).
export const EMBLEM_METRICS = [
  "contributions",
  "public_repos",
  "total_stars",
  "referral_count",
  "kudos_count",
  "gifts_sent",
  "gifts_received",
  "app_streak",
  "kudos_streak",
  "raid_xp",
  "purchases",
  "dailies_completed",
] as const;

export const EMBLEM_ID_RE = /^[a-z0-9_]{2,48}$/;

/** Returns a 401/403 response if the caller isn't an admin, else null. */
export async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; msg: string };

/** Validate the single supported criteria shape, or null (push-only). */
export function parseCriteria(v: unknown): ParseResult<Record<string, unknown> | null> {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (typeof v !== "object") return { ok: false, msg: "criteria must be an object or null" };
  const c = v as Record<string, unknown>;
  if (c.type !== "threshold") return { ok: false, msg: "criteria.type must be 'threshold'" };
  if (!(EMBLEM_METRICS as readonly string[]).includes(String(c.metric))) {
    return { ok: false, msg: `criteria.metric must be one of: ${EMBLEM_METRICS.join(", ")}` };
  }
  const gte = Number(c.gte);
  if (!Number.isFinite(gte) || gte < 0) return { ok: false, msg: "criteria.gte must be a number >= 0" };
  return { ok: true, value: { type: "threshold", metric: String(c.metric), gte: Math.floor(gte) } };
}

/** Validate the milestones array ([{count,tier},...]) for counter emblems, or null. */
export function parseMilestones(v: unknown): ParseResult<Array<{ count: number; tier: string }> | null> {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (!Array.isArray(v)) return { ok: false, msg: "milestones must be an array" };
  const out: Array<{ count: number; tier: string }> = [];
  for (const m of v) {
    if (!m || typeof m !== "object") return { ok: false, msg: "each milestone must be an object" };
    const count = Number((m as Record<string, unknown>).count);
    const tier = String((m as Record<string, unknown>).tier);
    if (!Number.isInteger(count) || count < 1) return { ok: false, msg: "milestone.count must be a positive integer" };
    if (!(EMBLEM_TIERS as readonly string[]).includes(tier)) return { ok: false, msg: "milestone.tier is invalid" };
    out.push({ count, tier });
  }
  // Keep ascending by count so tier resolution reads predictably.
  out.sort((a, b) => a.count - b.count);
  return { ok: true, value: out.length ? out : null };
}
