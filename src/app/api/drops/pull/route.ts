import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { ok } = rateLimit(`drops-pull:${user.id}`, 1, 5_000);
  if (!ok) return NextResponse.json({ error: "Too fast" }, { status: 429 });

  const body = await request.json();
  const { drop_id } = body;

  if (!drop_id || typeof drop_id !== "string") {
    return NextResponse.json({ error: "drop_id is required" }, { status: 400 });
  }

  const githubLogin = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  if (!githubLogin) {
    return NextResponse.json({ error: "No GitHub username" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Get developer (must have claimed building)
  const { data: dev } = await admin
    .from("developers")
    .select("id, claimed, claimed_by")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed || dev.claimed_by !== user.id) {
    return NextResponse.json({ error: "You must claim your building first" }, { status: 403 });
  }

  // Fetch the drop
  const { data: dropData } = await admin
    .from("building_drops")
    .select("id, points, rarity, item_reward, pull_count, max_pulls, expires_at")
    .eq("id", drop_id)
    .single();

  if (!dropData) return NextResponse.json({ error: "Drop not found" }, { status: 404 });

  if (new Date(dropData.expires_at) <= new Date()) {
    return NextResponse.json({ error: "Drop expired" }, { status: 410 });
  }

  if (dropData.pull_count >= dropData.max_pulls) {
    return NextResponse.json({ error: "Drop fully pulled" }, { status: 410 });
  }

  // Check if already pulled
  const { data: existingPull } = await admin
    .from("drop_pulls")
    .select("id, points_earned")
    .eq("drop_id", drop_id)
    .eq("developer_id", dev.id)
    .maybeSingle();

  if (existingPull) {
    return NextResponse.json({
      ok: true,
      already_pulled: true,
      points_earned: existingPull.points_earned,
    });
  }

  // Optimistic lock: increment pull_count only if it hasn't changed
  const { count, error: updateError } = await admin
    .from("building_drops")
    .update({ pull_count: dropData.pull_count + 1 }, { count: "exact" })
    .eq("id", drop_id)
    .eq("pull_count", dropData.pull_count)
    .lt("pull_count", dropData.max_pulls);

  if (updateError || count === 0) {
    return NextResponse.json({ error: "Race condition, try again" }, { status: 409 });
  }

  // Insert the pull record (unique constraint prevents double-pull)
  const { error: pullError } = await admin.from("drop_pulls").insert({
    drop_id,
    developer_id: dev.id,
    points_earned: dropData.points,
  });

  if (pullError) {
    if (pullError.code === "23505") {
      return NextResponse.json({
        ok: true,
        already_pulled: true,
        points_earned: dropData.points,
      });
    }
    return NextResponse.json({ error: "Failed to record pull" }, { status: 500 });
  }

  // Fire-and-forget: grant XP
  admin.rpc("grant_xp", {
    p_developer_id: dev.id,
    p_source: "drop_pull",
    p_amount: 25,
  }).then();

  // Fire-and-forget: activity feed
  admin.from("activity_feed").insert({
    event_type: "drop_pulled",
    actor_id: dev.id,
    metadata: { drop_id, rarity: dropData.rarity, points: dropData.points },
  }).then();

  // If legendary with item reward, grant the item
  if (dropData.rarity === "legendary" && dropData.item_reward) {
    admin.from("purchases").insert({
      developer_id: dev.id,
      item_id: dropData.item_reward,
      provider: "free",
      provider_tx_id: `drop_reward_${drop_id}_${dev.id}`,
      amount_cents: 0,
      currency: "usd",
      status: "completed",
    }).then();
  }

  // Get total pull stats for response
  const { data: totalData } = await admin
    .from("drop_pulls")
    .select("points_earned")
    .eq("developer_id", dev.id);

  const total_points = (totalData ?? []).reduce((sum, r) => sum + r.points_earned, 0);
  const total_pulls = (totalData ?? []).length;

  return NextResponse.json({
    ok: true,
    points_earned: dropData.points,
    rarity: dropData.rarity,
    item_reward: dropData.rarity === "legendary" ? dropData.item_reward : null,
    total_pulls,
    total_points,
  });
}
