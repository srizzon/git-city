import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

// Aggregated metrics for one event: summary, funnel, tier distribution,
// DAU lift, participant retention split, and the top leaderboard.

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const admin = getSupabaseAdmin();

  const [summary, funnel, tiers, lift, retention, board, bossCfg, dmgRows] = await Promise.all([
    admin.from("v_event_summary").select("*").eq("id", id).maybeSingle(),
    admin.rpc("event_funnel", { p_event_id: id }),
    admin.rpc("event_tier_distribution", { p_event_id: id }),
    admin.rpc("event_dau_lift", { p_event_id: id }),
    admin.rpc("event_retention_split", { p_event_id: id }),
    admin
      .from("event_participations")
      .select("developer_id, damage_dealt, minions_killed, final_rank, reward_tier, flagged_outlier")
      .eq("event_id", id)
      .order("damage_dealt", { ascending: false })
      .limit(20),
    admin.from("event_instances").select("boss_config").eq("id", id).maybeSingle(),
    admin.from("event_participations").select("damage_dealt").eq("event_id", id),
  ]);

  // Live boss HP control values. base_hp (boss_config) is the live HP cap;
  // remaining HP = base_hp − creditedDamage. The view's total_damage is only
  // filled at wrap, so sum the per-player rows for a live figure.
  const bossConfig = (bossCfg.data?.boss_config ?? {}) as { base_hp?: number };
  const baseHp = Number(bossConfig.base_hp) || null;
  const creditedDamage = (dmgRows.data ?? []).reduce((sum, r) => sum + (r.damage_dealt ?? 0), 0);

  // Resolve logins for the leaderboard
  const ids = (board.data ?? []).map((r) => r.developer_id);
  let logins: Record<number, string> = {};
  if (ids.length > 0) {
    const { data: devs } = await admin.from("developers").select("id, github_login").in("id", ids);
    logins = Object.fromEntries((devs ?? []).map((d) => [d.id, d.github_login]));
  }
  const leaderboard = (board.data ?? []).map((r) => ({
    rank: r.final_rank,
    login: logins[r.developer_id] ?? `#${r.developer_id}`,
    damage: r.damage_dealt,
    minions: r.minions_killed,
    tier: r.reward_tier,
    flagged: r.flagged_outlier,
  }));

  return NextResponse.json({
    summary: summary.data ?? null,
    funnel: funnel.data ?? null,
    tiers: tiers.data ?? {},
    lift: lift.data ?? null,
    retention: retention.data ?? null,
    leaderboard,
    baseHp,
    creditedDamage,
  });
}
