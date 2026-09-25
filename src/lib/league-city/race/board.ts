// ─── Town lap board ─────────────────────────────────────────
// Best laps per town and track (migration 150), this week's (151), each
// driver's ghost of their best, and last week's winner. Server only.

import { getSupabaseAdmin } from "@/lib/supabase";
import { isoDay, weekStart } from "@/lib/leagues/scoring";
import type { GhostRun } from "./ghost";

export interface BoardRow {
  rank: number;
  login: string;
  avatar_url: string | null;
  best_ms: number;
  laps: number;
}

export async function getLapBoard(leagueId: string, track: string, limit = 50): Promise<BoardRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("town_race_laps")
    .select("best_ms, laps, developers!inner(github_login, avatar_url)")
    .eq("league_id", leagueId)
    .eq("track", track)
    .order("best_ms", { ascending: true })
    .order("set_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[race] board failed:", error);
    return [];
  }
  type Row = { best_ms: number; laps: number; developers: { github_login: string; avatar_url: string | null } };
  return ((data ?? []) as unknown as Row[]).map((r, i) => ({
    rank: i + 1,
    login: r.developers.github_login,
    avatar_url: r.developers.avatar_url,
    best_ms: r.best_ms,
    laps: r.laps,
  }));
}

/** This week's best laps (the season), from Monday 00:00 UTC. */
export async function getWeekBoard(leagueId: string, track: string, week = thisWeek(), limit = 50): Promise<BoardRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("town_race_week_laps")
    .select("best_ms, developers!inner(github_login, avatar_url)")
    .eq("league_id", leagueId)
    .eq("track", track)
    .eq("week", week)
    .order("best_ms", { ascending: true })
    .order("set_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[race] week board failed:", error);
    return [];
  }
  type Row = { best_ms: number; developers: { github_login: string; avatar_url: string | null } };
  return ((data ?? []) as unknown as Row[]).map((r, i) => ({
    rank: i + 1,
    login: r.developers.github_login,
    avatar_url: r.developers.avatar_url,
    best_ms: r.best_ms,
    laps: 0,
  }));
}

/** Monday of this week (UTC), as the week key. */
export function thisWeek(now = new Date()): string {
  return isoDay(weekStart(now));
}

/** Last week's fastest lap: the week's winner, or null. */
export async function getLastWeekWinner(leagueId: string, track: string): Promise<BoardRow | null> {
  const last = new Date(weekStart(new Date()).getTime() - 86_400_000);
  const rows = await getWeekBoard(leagueId, track, thisWeek(last), 1);
  return rows[0] ?? null;
}

export interface RaceLapResult {
  best_ms: number;
  improved: boolean;
  rank: number;
  week_best_ms: number;
  week_improved: boolean;
  week_rank: number;
  /** Developer ids this lap passed on the all-time board, closest first. */
  passed: number[];
}

/** Records a valid lap on both boards (record_town_race_lap, migration 151). */
export async function recordRaceLap(leagueId: string, track: string, devId: number, ms: number): Promise<RaceLapResult | null> {
  const { data, error } = await getSupabaseAdmin().rpc("record_town_race_lap", {
    p_league_id: leagueId,
    p_track: track,
    p_dev_id: devId,
    p_ms: ms,
    p_week: thisWeek(),
  });
  if (error) {
    console.error("[race] record_town_race_lap failed:", error);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as (Omit<RaceLapResult, "passed"> & { passed: (number | string)[] | null }) | undefined;
  return row ? { ...row, passed: (row.passed ?? []).map(Number) } : null;
}

/** Keeps the ghost of a driver's best lap. Call only when that lap set their best. */
export async function saveBestGhost(leagueId: string, track: string, devId: number, ghost: GhostRun): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("town_race_ghosts")
    .upsert({
      league_id: leagueId,
      track,
      developer_id: devId,
      ms: ghost.ms,
      ghost: { splits: ghost.splits, frames: ghost.frames },
      set_at: new Date().toISOString(),
    });
  if (error) console.error("[race] ghost save failed:", error);
}

/** A driver's best-lap ghost in this town, by login. */
export async function getBestGhost(leagueId: string, track: string, login: string): Promise<(GhostRun & { login: string }) | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("town_race_ghosts")
    .select("ms, ghost, developers!inner(github_login)")
    .eq("league_id", leagueId)
    .eq("track", track)
    .ilike("developers.github_login", login)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as { ms: number; ghost: { splits: number[]; frames: number[] }; developers: { github_login: string } };
  return { ms: r.ms, splits: r.ghost.splits, frames: r.ghost.frames, login: r.developers.github_login };
}

/** Logins in this town with a ghost saved (who you can race). */
export async function getGhostLogins(leagueId: string, track: string): Promise<string[]> {
  const { data } = await getSupabaseAdmin()
    .from("town_race_ghosts")
    .select("developers!inner(github_login)")
    .eq("league_id", leagueId)
    .eq("track", track)
    .limit(200);
  return ((data ?? []) as unknown as { developers: { github_login: string } }[]).map((r) => r.developers.github_login);
}

export async function recordLap(
  leagueId: string,
  track: string,
  devId: number,
  ms: number,
): Promise<{ best_ms: number; improved: boolean; rank: number } | null> {
  const { data, error } = await getSupabaseAdmin().rpc("record_town_lap", { p_league_id: leagueId, p_track: track, p_dev_id: devId, p_ms: ms });
  if (error) {
    console.error("[race] record_town_lap failed:", error);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { best_ms: number; improved: boolean; rank: number } | undefined;
  return row ?? null;
}
