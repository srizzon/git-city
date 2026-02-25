import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { checkAchievements } from "@/lib/achievements";

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Per-user rate limit: 1 req/5s
  const { ok } = rateLimit(`checkin:${user.id}`, 1, 5000);
  if (!ok) {
    return NextResponse.json({ error: "Too fast" }, { status: 429 });
  }

  const githubLogin = (
    user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();

  if (!githubLogin) {
    return NextResponse.json({ error: "No GitHub login" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Fetch developer (must be claimed)
  const { data: dev } = await sb
    .from("developers")
    .select("id, claimed, contributions, public_repos, total_stars, kudos_count, app_streak, streak_freeze_30d_claimed")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed) {
    return NextResponse.json({ error: "Must claim building first" }, { status: 403 });
  }

  // Perform check-in via RPC
  const { data: result, error: rpcError } = await sb.rpc("perform_checkin", {
    p_developer_id: dev.id,
  });

  if (rpcError) {
    console.error("perform_checkin RPC error:", rpcError);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }

  const checkinResult = result as {
    checked_in: boolean;
    already_today?: boolean;
    streak: number;
    longest: number;
    was_frozen?: boolean;
    error?: string;
  };

  if (checkinResult.error) {
    return NextResponse.json({ error: checkinResult.error }, { status: 400 });
  }

  let newAchievements: string[] = [];

  if (checkinResult.checked_in) {
    // Check achievements with updated streak
    const referralCount = 0; // Not fetched here, achievements will check existing unlocks
    const giftsSent = 0;
    const giftsReceived = 0;

    newAchievements = await checkAchievements(dev.id, {
      contributions: dev.contributions,
      public_repos: dev.public_repos,
      total_stars: dev.total_stars,
      referral_count: referralCount,
      kudos_count: dev.kudos_count ?? 0,
      gifts_sent: giftsSent,
      gifts_received: giftsReceived,
      app_streak: checkinResult.streak,
    }, githubLogin);

    // Grant 1 free freeze at 30-day streak milestone
    if (checkinResult.streak >= 30 && !dev.streak_freeze_30d_claimed) {
      await sb.rpc("grant_streak_freeze", { p_developer_id: dev.id });
      await sb
        .from("developers")
        .update({ streak_freeze_30d_claimed: true })
        .eq("id", dev.id);
      await sb.from("streak_freeze_log").insert({
        developer_id: dev.id,
        action: "granted_milestone",
      });
    }

    // Insert feed event
    await sb.from("activity_feed").insert({
      event_type: "streak_checkin",
      actor_id: dev.id,
      metadata: {
        login: githubLogin,
        streak: checkinResult.streak,
        was_frozen: checkinResult.was_frozen ?? false,
      },
    });
  }

  // Count unseen achievements
  const { count: unseenCount } = await sb
    .from("developer_achievements")
    .select("achievement_id", { count: "exact", head: true })
    .eq("developer_id", dev.id)
    .eq("seen", false);

  // Fetch kudos received since last check-in
  const { data: recentKudos } = await sb
    .from("developer_kudos")
    .select("giver_id, given_date")
    .eq("receiver_id", dev.id)
    .order("given_date", { ascending: false })
    .limit(10);

  return NextResponse.json({
    checked_in: checkinResult.checked_in,
    already_today: checkinResult.already_today ?? false,
    streak: checkinResult.streak,
    longest: checkinResult.longest,
    was_frozen: checkinResult.was_frozen ?? false,
    new_achievements: newAchievements,
    unseen_count: unseenCount ?? 0,
    kudos_since_last: recentKudos?.length ?? 0,
  });
}
