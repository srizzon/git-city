import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isoDay } from "./scoring";
import { loadStandings, type LeagueWeekStandings } from "./standings";

export const WINNER_XP = 100;
/** Pixel prize for winners of leagues with 5+ active members. Open question in the spec; tune later. */
export const WINNER_PIXELS = 50;
export const PIXEL_MIN_ACTIVE = 5;
export const CROWN_DAYS = 7;

export interface ClosedLeague {
  league: { id: string; slug: string; name: string; kind: string };
  week: LeagueWeekStandings;
  winnerId: number | null;
  globalRank: number | null;
  globalTotal: number;
}

/**
 * Closes one week for every league with 1+ active member: freezes standings,
 * crowns the winner, grants the emblem, XP and (5+ active) pixels. Safe to
 * run twice: league_weeks PK, the crown unique key and both claim keys make
 * every step idempotent.
 */
export async function closeWeek(start: Date): Promise<{ closed: ClosedLeague[]; errors: number }> {
  const sb = getSupabaseAdmin();
  const week = isoDay(start);
  const { data: leagues, error } = await sb.from("leagues").select("id, slug, name, kind, scoring_mode");
  if (error) throw error;

  const standings = await loadStandings(
    (leagues ?? []).map((l) => ({ id: l.id as string, scoring_mode: l.scoring_mode })),
    start,
    sb,
  );

  // Global company ranking (XP mode average, 3+ active).
  const global = (leagues ?? [])
    .filter((l) => l.kind === "company")
    .map((l) => ({ id: l.id as string, score: standings.get(l.id)?.globalScore ?? null }))
    .filter((g): g is { id: string; score: number } => g.score !== null)
    .sort((a, b) => b.score - a.score);
  const globalRank = new Map(global.map((g, i) => [g.id, i + 1]));
  const top = global[0] ?? null;

  const closed: ClosedLeague[] = [];
  let errors = 0;
  const expiresAt = new Date(Date.now() + CROWN_DAYS * 86_400_000).toISOString();

  for (const league of leagues ?? []) {
    const s = standings.get(league.id);
    if (!s || s.standings.length === 0) continue;
    try {
      const leader = s.standings[0];
      const winnerId = leader && leader.total > 0 ? leader.developer_id : null;

      await sb.from("league_weeks").upsert(
        {
          league_id: league.id,
          week_start: week,
          winner_id: winnerId,
          standings: {
            mode: s.mode,
            standings: s.standings,
            global_score: s.globalScore,
            global_rank: globalRank.get(league.id) ?? null,
            ...(top && top.id === league.id ? { global_winner: { score: top.score, rank: 1 } } : {}),
          },
        },
        { onConflict: "league_id,week_start", ignoreDuplicates: true },
      );

      // Rewards follow the frozen row, so a re-run can't pick a different winner.
      const { data: frozen } = await sb
        .from("league_weeks")
        .select("winner_id")
        .eq("league_id", league.id)
        .eq("week_start", week)
        .single();
      const frozenWinner = (frozen?.winner_id as number | null) ?? null;

      if (frozenWinner) {
        const claimKey = `league:${league.id}:${week}`;
        await sb
          .from("league_crowns")
          .upsert(
            { developer_id: frozenWinner, league_id: league.id, week_start: week, expires_at: expiresAt },
            { onConflict: "developer_id,week_start", ignoreDuplicates: true },
          );
        await sb.rpc("grant_emblem", {
          p_developer_id: frozenWinner,
          p_emblem_id: "league_champion",
          p_claim_key: claimKey,
          p_meta: { league_id: league.id, league_slug: league.slug, league_name: league.name, week_start: week },
          p_source: "league",
        });
        const { error: rewardErr } = await sb.rpc("grant_league_reward", {
          p_developer_id: frozenWinner,
          p_league_id: league.id,
          p_week_start: week,
          p_xp: WINNER_XP,
          p_pixels: s.standings.length >= PIXEL_MIN_ACTIVE ? WINNER_PIXELS : 0,
          p_claim_key: claimKey,
        });
        if (rewardErr) throw rewardErr;
      }

      closed.push({
        league: { id: league.id, slug: league.slug, name: league.name, kind: league.kind },
        week: s,
        winnerId: frozenWinner,
        globalRank: globalRank.get(league.id) ?? null,
        globalTotal: global.length,
      });
    } catch (err) {
      errors++;
      console.error(`[league-close] ${league.slug}:`, err);
    }
  }

  return { closed, errors };
}
