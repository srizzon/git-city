import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { checkAchievements } from "@/lib/achievements";
import { touchLastActive } from "@/lib/notification-helpers";
import { sendRaidAlertNotification } from "@/lib/notification-senders/raid";
import {
  calculateAttackScore,
  calculateDefenseScore,
  getRaidTitle,
  MAX_RAIDS_PER_DAY,
  RAID_TAG_DURATION_DAYS,
  XP_WIN_ATTACKER,
  XP_WIN_DEFENDER,
  XP_LOSE_DEFENDER,
} from "@/lib/raid";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Strict per-user rate limit: 1 execute per 30s
  const { ok } = rateLimit(`raid-execute:${user.id}`, 1, 30_000);
  if (!ok) {
    return NextResponse.json({ error: "Too fast, wait before raiding again" }, { status: 429 });
  }

  const body = await request.json();
  const { target_login, boost_purchase_id, vehicle_id } = body as {
    target_login: string;
    boost_purchase_id?: number;
    vehicle_id?: string;
  };

  if (!target_login || typeof target_login !== "string") {
    return NextResponse.json({ error: "Missing target_login" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const githubLogin = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  // Fetch attacker + defender in parallel
  const raidColumns = "id, claimed, github_login, avatar_url, contributions, public_repos, total_stars, kudos_count, app_streak, raid_xp, current_week_contributions, current_week_kudos_given, current_week_kudos_received";
  const [attackerRes, defenderRes] = await Promise.all([
    admin
      .from("developers")
      .select(raidColumns)
      .eq("github_login", githubLogin)
      .single(),
    admin
      .from("developers")
      .select(raidColumns)
      .eq("github_login", target_login.toLowerCase())
      .single(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attacker = attackerRes.data as Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defender = defenderRes.data as Record<string, any> | null;

  if (!attacker || !attacker.claimed) {
    return NextResponse.json({ error: "Must claim building first" }, { status: 403 });
  }
  if (!defender) {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }
  if (attacker.id === defender.id) {
    return NextResponse.json({ error: "Cannot raid yourself" }, { status: 409 });
  }

  // Check daily raid count + weekly cooldown (raids table may not exist yet)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  try {
    const { count: raidsToday } = await admin
      .from("raids")
      .select("id", { count: "exact", head: true })
      .eq("attacker_id", attacker.id)
      .gte("created_at", todayStart.toISOString());

    if ((raidsToday ?? 0) >= MAX_RAIDS_PER_DAY) {
      return NextResponse.json({ error: "Daily raid limit reached" }, { status: 429 });
    }

    // Check weekly cooldown
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

    if ((weeklyPairCount ?? 0) > 0) {
      return NextResponse.json({ error: "Already raided this target this week" }, { status: 429 });
    }
  } catch {
    // raids table may not exist yet - allow raid
  }

  // Handle consumable boost
  let boostBonus = 0;
  let boostItemId: string | null = null;
  let boostPurchaseIdToConsume: number | null = null;

  if (boost_purchase_id) {
    const { data: boostPurchase } = await admin
      .from("purchases")
      .select("id, item_id, status, items!inner(metadata)")
      .eq("id", boost_purchase_id)
      .eq("developer_id", attacker.id)
      .eq("status", "completed")
      .single();

    if (boostPurchase) {
      const meta = (boostPurchase.items as unknown as { metadata: { type: string; bonus: number } })?.metadata;
      if (meta?.type === "raid_boost" && meta.bonus > 0) {
        boostBonus = meta.bonus;
        boostItemId = boostPurchase.item_id;
        boostPurchaseIdToConsume = boostPurchase.id;
      }
    }
  }

  // Calculate scores
  const attack = calculateAttackScore({
    weeklyContributions: attacker.current_week_contributions ?? 0,
    appStreak: attacker.app_streak ?? 0,
    weeklyKudosGiven: attacker.current_week_kudos_given ?? 0,
    boostBonus,
  });

  const defense = calculateDefenseScore({
    weeklyContributions: defender.current_week_contributions ?? 0,
    appStreak: defender.app_streak ?? 0,
    weeklyKudosReceived: defender.current_week_kudos_received ?? 0,
  });

  const success = attack.total > defense.total;

  // Add boost info to breakdown
  if (boostItemId) {
    attack.breakdown.boost_item = boostItemId;
  }

  // Determine vehicle + tag style from saved loadout (or override from request)
  const [{ data: raidLoadoutRow }, { data: ownedVehiclePurchases }] = await Promise.all([
    admin
      .from("developer_customizations")
      .select("config")
      .eq("developer_id", attacker.id)
      .eq("item_id", "raid_loadout")
      .maybeSingle(),
    admin
      .from("purchases")
      .select("item_id, items!inner(metadata)")
      .eq("developer_id", attacker.id)
      .eq("status", "completed"),
  ]);

  const ownedSet = new Set((ownedVehiclePurchases ?? []).map((p) => p.item_id));
  const savedLoadout = (raidLoadoutRow?.config as { vehicle?: string; tag?: string } | null) ?? {};

  // Vehicle: use request override > saved loadout > default
  let vehicle = "airplane";
  if (vehicle_id) {
    if (vehicle_id === "airplane" || ownedSet.has(vehicle_id)) {
      vehicle = vehicle_id;
    }
  } else {
    const saved = savedLoadout.vehicle ?? "airplane";
    vehicle = saved === "airplane" || ownedSet.has(saved) ? saved : "airplane";
  }

  // Tag: use saved loadout
  let tagStyle = "default";
  const savedTag = savedLoadout.tag ?? "default";
  tagStyle = savedTag === "default" || ownedSet.has(savedTag) ? savedTag : "default";

  // Atomic insert with race condition prevention
  const { data: raidRow, error: raidError } = await admin.rpc("execute_raid", {
    p_attacker_id: attacker.id,
    p_defender_id: defender.id,
    p_attack_score: attack.total,
    p_defense_score: defense.total,
    p_success: success,
    p_attack_breakdown: attack.breakdown,
    p_defense_breakdown: defense.breakdown,
    p_vehicle: vehicle,
    p_tag_style: tagStyle,
  });

  // If RPC doesn't exist yet, fall back to direct insert
  if (raidError?.message?.includes("execute_raid")) {
    // Direct insert with a subquery guard
    const { data: inserted, error: insertErr } = await admin
      .from("raids")
      .insert({
        attacker_id: attacker.id,
        defender_id: defender.id,
        attack_score: attack.total,
        defense_score: defense.total,
        success,
        attack_breakdown: attack.breakdown,
        defense_breakdown: defense.breakdown,
        attacker_vehicle: vehicle,
        attacker_tag_style: tagStyle,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Raid insert error:", insertErr);
      return NextResponse.json({ error: "Raid failed" }, { status: 500 });
    }

    const raidId = inserted.id;

    // Consume boost
    if (boostPurchaseIdToConsume) {
      await admin
        .from("purchases")
        .update({ status: "consumed" })
        .eq("id", boostPurchaseIdToConsume);
    }

    // XP + tags + feed
    if (success) {
      // Delete existing active tag on target, insert new
      // Deactivate existing active tag on target
      await admin
        .from("raid_tags")
        .update({ active: false })
        .eq("building_id", defender.id)
        .eq("active", true);

      await admin.from("raid_tags").insert({
        raid_id: raidId,
        building_id: defender.id,
        attacker_id: attacker.id,
        attacker_login: attacker.github_login,
        tag_style: tagStyle,
        expires_at: new Date(Date.now() + RAID_TAG_DURATION_DAYS * 86400000).toISOString(),
      });

      // Grant XP
      await Promise.all([
        admin
          .from("developers")
          .update({ raid_xp: (attacker.raid_xp ?? 0) + XP_WIN_ATTACKER })
          .eq("id", attacker.id),
        admin
          .from("developers")
          .update({ raid_xp: (defender.raid_xp ?? 0) + XP_WIN_DEFENDER })
          .eq("id", defender.id),
      ]);
    } else {
      // Defender gets XP for successful defense
      await admin
        .from("developers")
        .update({ raid_xp: (defender.raid_xp ?? 0) + XP_LOSE_DEFENDER })
        .eq("id", defender.id);
    }

    // Activity feed
    await admin.from("activity_feed").insert({
      event_type: success ? "raid_success" : "raid_failed",
      actor_id: attacker.id,
      target_id: defender.id,
      metadata: {
        attacker_login: attacker.github_login,
        defender_login: defender.github_login,
        attack_score: attack.total,
        defense_score: defense.total,
      },
    });

    // Track activity + notify defender
    touchLastActive(attacker.id);
    sendRaidAlertNotification(
      defender.id,
      defender.github_login,
      attacker.github_login,
      raidId,
      success,
      attack.total,
      defense.total,
    );

    // Check achievements for both
    const newAttackerXp = (attacker.raid_xp ?? 0) + (success ? XP_WIN_ATTACKER : 0);
    const newDefenderXp = (defender.raid_xp ?? 0) + (success ? XP_WIN_DEFENDER : XP_LOSE_DEFENDER);

    const [attackerAchievements] = await Promise.all([
      checkAchievements(
        attacker.id,
        {
          contributions: attacker.contributions ?? 0,
          public_repos: attacker.public_repos ?? 0,
          total_stars: attacker.total_stars ?? 0,
          referral_count: 0,
          kudos_count: attacker.kudos_count ?? 0,
          gifts_sent: 0,
          gifts_received: 0,
          raid_xp: newAttackerXp,
        },
        attacker.github_login,
      ),
      checkAchievements(
        defender.id,
        {
          contributions: defender.contributions ?? 0,
          public_repos: defender.public_repos ?? 0,
          total_stars: defender.total_stars ?? 0,
          referral_count: 0,
          kudos_count: defender.kudos_count ?? 0,
          gifts_sent: 0,
          gifts_received: 0,
          raid_xp: newDefenderXp,
        },
        defender.github_login,
      ),
    ]);

    // Build building position approximations (will be overridden client-side)
    const xpEarned = success ? XP_WIN_ATTACKER : 0;

    return NextResponse.json({
      raid_id: raidId,
      success,
      attack_score: attack.total,
      defense_score: defense.total,
      attack_breakdown: attack.breakdown,
      defense_breakdown: defense.breakdown,
      attacker: {
        login: attacker.github_login,
        avatar: attacker.avatar_url,
        position: [0, 0, 0] as [number, number, number],
        height: Math.max(20, Math.min(300, (attacker.contributions ?? 0) * 0.15)),
      },
      defender: {
        login: defender.github_login,
        avatar: defender.avatar_url,
        position: [0, 0, 0] as [number, number, number],
        height: Math.max(20, Math.min(300, (defender.contributions ?? 0) * 0.15)),
      },
      xp_earned: xpEarned,
      new_raid_xp: newAttackerXp,
      new_title: getRaidTitle(newAttackerXp),
      new_achievements: attackerAchievements,
      vehicle,
      tag_style: tagStyle,
    });
  }

  // If RPC succeeded (future-proofing)
  return NextResponse.json(raidRow);
}
