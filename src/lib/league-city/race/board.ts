// ─── Town lap board ─────────────────────────────────────────
// Best laps per town and track (migration 149). Server only.

import { getSupabaseAdmin } from "@/lib/supabase";

export interface BoardRow {
  rank: number;
  login: string;
  avatar_url: string | null;
  best_ms: number;
  laps: number;
}

export async function getLapBoard(leagueId: string, track: string, limit = 10): Promise<BoardRow[]> {
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
