// ─── Drift boards ───────────────────────────────────────────
// One board per spot for everyone (migration 159): the world, or one
// country. Each driver's best, its ghost, where they stand. Server only.

import { getSupabaseAdmin } from "@/lib/supabase";
import type { Frames } from "./frames";
import type { SpotId } from "./spots/types";
import { moveOldRun } from "../towns/brasil-drift";

export type Scope = "world" | string;

export interface DriftRow {
  rank: number;
  login: string;
  avatar_url: string | null;
  score: number;
  country: string | null;
  set_at: string;
}

export interface DriftGhost {
  login: string;
  score: number;
  frames: Frames;
  splits: number[];
}

export interface RecordResult {
  best: number;
  improved: boolean;
  rank_world: number;
  rank_country: number;
  total_world: number;
  total_country: number;
  passed: number[];
}

const isCountry = (scope: Scope) => /^[A-Z]{2}$/.test(scope);
/** A login for ilike: case-insensitive, with "_" (a wildcard there) matched literally. */
const exact = (login: string) => login.replace(/[\\%_]/g, (c) => `\\${c}`);

type Joined = { score: number; country: string | null; set_at: string; developers: { github_login: string; avatar_url: string | null } };

export async function getBoard(spot: SpotId, scope: Scope = "world", limit = 50, offset = 0): Promise<DriftRow[]> {
  let q = getSupabaseAdmin()
    .from("drift_runs")
    .select("score, country, set_at, developers!inner(github_login, avatar_url)")
    .eq("spot", spot);
  if (isCountry(scope)) q = q.eq("country", scope);
  const { data, error } = await q
    .order("score", { ascending: false })
    .order("set_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error("[drift] board failed:", error);
    return [];
  }
  return ((data ?? []) as unknown as Joined[]).map((r, i) => ({
    rank: offset + i + 1,
    login: r.developers.github_login,
    avatar_url: r.developers.avatar_url,
    score: r.score,
    country: r.country,
    set_at: r.set_at,
  }));
}

/** How many drivers a board has. */
export async function boardSize(spot: SpotId, scope: Scope = "world"): Promise<number> {
  let q = getSupabaseAdmin().from("drift_runs").select("developer_id", { count: "exact", head: true }).eq("spot", spot);
  if (isCountry(scope)) q = q.eq("country", scope);
  const { count } = await q;
  return count ?? 0;
}

/** A driver's own row on a board, ranked, even far outside the top. */
export async function getMyRow(spot: SpotId, devId: number, scope: Scope = "world"): Promise<DriftRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("drift_runs")
    .select("score, country, set_at, developers!inner(github_login, avatar_url)")
    .eq("spot", spot)
    .eq("developer_id", devId)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Joined;
  if (isCountry(scope) && r.country !== scope) return null;
  let q = getSupabaseAdmin()
    .from("drift_runs")
    .select("developer_id", { count: "exact", head: true })
    .eq("spot", spot)
    .or(`score.gt.${r.score},and(score.eq.${r.score},set_at.lt.${r.set_at})`);
  if (isCountry(scope)) q = q.eq("country", scope);
  const { count } = await q;
  return { rank: (count ?? 0) + 1, login: r.developers.github_login, avatar_url: r.developers.avatar_url, score: r.score, country: r.country, set_at: r.set_at };
}

/** The driver just above a score on the world board: the next one to beat. */
export async function nextAbove(spot: SpotId, score: number, devId: number): Promise<DriftRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("drift_runs")
    .select("score, country, set_at, developers!inner(github_login, avatar_url)")
    .eq("spot", spot)
    .neq("developer_id", devId)
    .gt("score", score)
    .order("score", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Joined;
  const { count } = await getSupabaseAdmin()
    .from("drift_runs")
    .select("developer_id", { count: "exact", head: true })
    .eq("spot", spot)
    .gt("score", r.score);
  return { rank: (count ?? 0) + 1, login: r.developers.github_login, avatar_url: r.developers.avatar_url, score: r.score, country: r.country, set_at: r.set_at };
}

/** A driver's best run on a spot, by login: the ghost to race. */
export async function getGhost(spot: SpotId, login: string): Promise<DriftGhost | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("drift_runs")
    .select("score, ghost, developers!inner(github_login)")
    .eq("spot", spot)
    .ilike("developers.github_login", exact(login))
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as { score: number; ghost: { frames: Frames; splits: number[] }; developers: { github_login: string } };
  // The Brasil track went out to sea: a run driven where it was is moved over.
  const frames = spot === "brasil" ? moveOldRun(r.ghost.frames) : r.ghost.frames;
  return { login: r.developers.github_login, score: r.score, frames, splits: r.ghost.splits };
}

/** Each spot's record (the top of the world board). */
export async function getRecords(): Promise<Partial<Record<SpotId, DriftRow>>> {
  const { data } = await getSupabaseAdmin()
    .from("drift_runs")
    .select("spot, score, country, set_at, developers!inner(github_login, avatar_url)")
    .order("score", { ascending: false })
    .order("set_at", { ascending: true })
    .limit(500);
  const out: Partial<Record<SpotId, DriftRow>> = {};
  for (const r of (data ?? []) as unknown as (Joined & { spot: SpotId })[]) {
    if (out[r.spot]) continue;
    out[r.spot] = { rank: 1, login: r.developers.github_login, avatar_url: r.developers.avatar_url, score: r.score, country: r.country, set_at: r.set_at };
  }
  return out;
}

/** A driver's best score on every spot they've run. */
export async function getMyBests(devId: number): Promise<Partial<Record<SpotId, number>>> {
  const { data } = await getSupabaseAdmin().from("drift_runs").select("spot, score").eq("developer_id", devId);
  const out: Partial<Record<SpotId, number>> = {};
  for (const r of (data ?? []) as { spot: SpotId; score: number }[]) out[r.spot] = r.score;
  return out;
}

export async function recordRun(spot: SpotId, devId: number, score: number, country: string | null, ghost: { frames: Frames; splits: number[] }): Promise<RecordResult | null> {
  const { data, error } = await getSupabaseAdmin().rpc("record_drift_run", {
    p_spot: spot,
    p_dev_id: devId,
    p_score: score,
    p_country: country,
    p_ghost: ghost,
  });
  if (error) {
    console.error("[drift] record_drift_run failed:", error);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as (Omit<RecordResult, "passed"> & { passed: (number | string)[] | null }) | undefined;
  return row ? { ...row, passed: (row.passed ?? []).map(Number) } : null;
}

/** The country a driver's runs count for, or null when never set. */
export async function getDriftCountry(devId: number): Promise<string | null> {
  const { data } = await getSupabaseAdmin().from("developers").select("drift_country").eq("id", devId).maybeSingle();
  return (data as { drift_country: string | null } | null)?.drift_country ?? null;
}

/** Moves a driver (and every run of theirs) to another country's boards. */
export async function setDriftCountry(devId: number, country: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("developers").update({ drift_country: country }).eq("id", devId);
  if (error) {
    console.error("[drift] set country failed:", error);
    return false;
  }
  const { error: runs } = await sb.from("drift_runs").update({ country }).eq("developer_id", devId);
  if (runs) console.error("[drift] move runs failed:", runs);
  return !runs;
}

/** Takes a driver's run off a spot's board (admins). */
export async function removeRun(spot: SpotId, login: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const { data: dev } = await sb.from("developers").select("id").ilike("github_login", exact(login)).maybeSingle();
  if (!dev) return false;
  const { error } = await sb.from("drift_runs").delete().eq("spot", spot).eq("developer_id", (dev as { id: number }).id);
  if (error) console.error("[drift] remove failed:", error);
  return !error;
}
