import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Public: returns the currently-live event (if any) plus its config so the
// client can render the boss + card. Also returns the top leaderboard rows.
// Cached briefly at the edge to absorb load during an event.

export async function GET() {
  const admin = getSupabaseAdmin();

  const { data: event } = await admin
    .from("event_instances")
    .select(
      "id, slug, kind, starts_at, ends_at, status, boss_max_hp, theme_config, boss_config, rewards_config, sponsor_brand, total_damage, total_participants",
    )
    .eq("status", "live")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!event) {
    return NextResponse.json(
      { live: false },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
    );
  }

  // Live participant count (devs who've dealt damage). total_participants on
  // the event row is only filled at wrap, so count the rows directly.
  const { count: participantCount } = await admin
    .from("event_participations")
    .select("developer_id", { count: "exact", head: true })
    .eq("event_id", event.id);

  // Live total credited damage. The event row's total_damage is only summed
  // at wrap, so sum the per-player rows here. PartyKit uses this to derive the
  // boss's remaining HP (HP = base_hp − creditedDamage) so it survives room
  // restarts/hibernation instead of resetting to full.
  const { data: dmgRows } = await admin
    .from("event_participations")
    .select("damage_dealt")
    .eq("event_id", event.id);
  const creditedDamage = (dmgRows ?? []).reduce((sum, r) => sum + (r.damage_dealt ?? 0), 0);

  // Top 10 leaderboard
  const { data: top } = await admin
    .from("event_participations")
    .select("developer_id, damage_dealt, minions_killed")
    .eq("event_id", event.id)
    .order("damage_dealt", { ascending: false })
    .limit(10);

  // Resolve logins for the leaderboard
  const ids = (top ?? []).map((r) => r.developer_id);
  let logins: Record<number, string> = {};
  if (ids.length > 0) {
    const { data: devs } = await admin
      .from("developers")
      .select("id, github_login")
      .in("id", ids);
    logins = Object.fromEntries((devs ?? []).map((d) => [d.id, d.github_login]));
  }

  const leaderboard = (top ?? []).map((r, i) => ({
    rank: i + 1,
    login: logins[r.developer_id] ?? "anon",
    damage: r.damage_dealt,
    minions: r.minions_killed,
  }));

  return NextResponse.json(
    { live: true, event, leaderboard, participants: participantCount ?? 0, creditedDamage },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } },
  );
}
