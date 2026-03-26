import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import {
  calculateAttackScore,
  calculateDefenseScore,
  getStrengthEstimate,
  getEffectiveMaxRaids,
  isWeeklyCooldownActive,
  isFridayThe13th,
} from "@/lib/raid";
import type { RaidBoostItem } from "@/lib/raid";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { ok } = rateLimit(`raid-preview:${user.id}`, 5, 10_000);
  if (!ok) {
    return NextResponse.json({ error: "Too fast" }, { status: 429 });
  }

  const { target_login } = await request.json();
  if (!target_login || typeof target_login !== "string") {
    return NextResponse.json({ error: "Missing target_login" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const githubLogin = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  // Fetch attacker
  const attackerRes = await admin
    .from("developers")
    .select("id, claimed, app_streak, github_login, avatar_url, current_week_contributions, current_week_kudos_given")
    .eq("github_login", githubLogin)
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attacker = attackerRes.data as Record<string, any> | null;

  if (!attacker || !attacker.claimed) {
    return NextResponse.json({ error: "Must claim building first" }, { status: 403 });
  }

  // Fetch defender
  const defenderRes = await admin
    .from("developers")
    .select("id, claimed, app_streak, avatar_url, github_login, contributions, current_week_contributions, current_week_kudos_received")
    .eq("github_login", target_login.toLowerCase())
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defender = defenderRes.data as Record<string, any> | null;

  if (!defender) {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }

  // No self-raid
  if (attacker.id === defender.id) {
    return NextResponse.json({ error: "Cannot raid yourself" }, { status: 409 });
  }

  // Check daily raid count
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const maxRaids = getEffectiveMaxRaids();
  let raidsToday = 0;
  let targetRaidedThisWeek = false;
  try {
    const { count } = await admin
      .from("raids")
      .select("id", { count: "exact", head: true })
      .eq("attacker_id", attacker.id)
      .gte("created_at", todayStart.toISOString());
    raidsToday = count ?? 0;

    if (raidsToday >= maxRaids) {
      return NextResponse.json({ error: "Daily raid limit reached" }, { status: 429 });
    }

    // Check weekly cooldown for this target (skipped during special events)
    if (isWeeklyCooldownActive()) {
      const now = new Date();
      const isoWeekStart = new Date(now);
      const dayOfWeek = now.getDay();
      isoWeekStart.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
      isoWeekStart.setHours(0, 0, 0, 0);

      const { count: weeklyPairCount } = await admin
        .from("raids")
        .select("id", { count: "exact", head: true })
        .eq("attacker_id", attacker.id)
        .eq("defender_id", defender.id)
        .gte("created_at", isoWeekStart.toISOString());

      targetRaidedThisWeek = (weeklyPairCount ?? 0) > 0;
      if (targetRaidedThisWeek) {
        return NextResponse.json({ error: "Already raided this target this week" }, { status: 429 });
      }
    }
  } catch {
    // raids table may not exist yet - allow raid
  }

  // Calculate scores
  const attack = calculateAttackScore({
    weeklyContributions: attacker.current_week_contributions ?? 0,
    appStreak: attacker.app_streak ?? 0,
    weeklyKudosGiven: attacker.current_week_kudos_given ?? 0,
  });

  const defense = calculateDefenseScore({
    weeklyContributions: defender.current_week_contributions ?? 0,
    appStreak: defender.app_streak ?? 0,
    weeklyKudosReceived: defender.current_week_kudos_received ?? 0,
  });

  // Fetch available boosts, owned vehicles, and saved raid loadout
  const [{ data: boostPurchases }, { data: vehiclePurchases }, { data: raidLoadoutRow }] = await Promise.all([
    admin
      .from("purchases")
      .select("id, item_id, items!inner(name, metadata)")
      .eq("developer_id", attacker.id)
      .eq("status", "completed")
      .eq("items.metadata->>type", "raid_boost"),
    admin
      .from("purchases")
      .select("item_id, items!inner(metadata)")
      .eq("developer_id", attacker.id)
      .eq("status", "completed")
      .eq("items.metadata->>type", "raid_vehicle"),
    admin
      .from("developer_customizations")
      .select("config")
      .eq("developer_id", attacker.id)
      .eq("item_id", "raid_loadout")
      .maybeSingle(),
  ]);

  const availableBoosts: RaidBoostItem[] = (boostPurchases ?? []).map((p) => {
    const item = p.items as unknown as { name: string; metadata: { bonus: number } };
    return {
      purchase_id: p.id,
      item_id: p.item_id,
      name: item.name,
      bonus: item.metadata?.bonus ?? 0,
    };
  });

  // Build available vehicles list (always includes default airplane)
  const VEHICLE_META: Record<string, { name: string; emoji: string }> = {
    airplane: { name: "Airplane", emoji: "✈️" },
    raid_helicopter: { name: "Helicopter", emoji: "🚁" },
    raid_drone: { name: "Stealth Drone", emoji: "🛸" },
    raid_rocket: { name: "Rocket", emoji: "🚀" },
  };

  const ownedVehicleIds = new Set((vehiclePurchases ?? []).map((p) => p.item_id));
  const available_vehicles = [
    { item_id: "airplane", name: "Airplane", emoji: "✈️" },
    ...Array.from(ownedVehicleIds)
      .filter((id) => VEHICLE_META[id])
      .map((id) => ({ item_id: id, ...VEHICLE_META[id] })),
  ];

  // Use saved selection, fallback to airplane
  const savedLoadout = (raidLoadoutRow?.config as { vehicle?: string } | null) ?? {};
  let vehicle = savedLoadout.vehicle ?? "airplane";
  // Validate saved vehicle is still owned
  if (vehicle !== "airplane" && !ownedVehicleIds.has(vehicle)) {
    vehicle = "airplane";
  }

  // Estimate building height from contributions
  const defenderHeight = Math.max(20, Math.min(300, defender.contributions * 0.15));

  return NextResponse.json({
    can_raid: true,
    raids_today: raidsToday ?? 0,
    raids_max: maxRaids,
    target_raided_this_week: false,
    special_event: isFridayThe13th() ? "friday13" : null,
    attack_estimate: getStrengthEstimate(attack.total),
    defense_estimate: getStrengthEstimate(defense.total),
    attack_score: attack.total,
    defense_score: defense.total,
    attack_breakdown: attack.breakdown,
    defense_breakdown: defense.breakdown,
    attacker_login: attacker.github_login,
    defender_login: defender.github_login,
    attacker_avatar: attacker.avatar_url ?? null,
    defender_avatar: defender.avatar_url ?? null,
    defender_building_height: defenderHeight,
    available_boosts: availableBoosts,
    available_vehicles,
    vehicle,
  });
}
