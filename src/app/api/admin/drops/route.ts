import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

const RARITY_POINTS: Record<string, number> = {
  common: 10,
  rare: 50,
  epic: 200,
  legendary: 500,
};

const VALID_DURATIONS = [24, 48, 72];

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const login = getGithubLoginFromUser(user);
  if (!isAdminGithubLogin(login)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { building_login, rarity, duration_hours, max_pulls, item_reward } = body;

  if (!building_login || typeof building_login !== "string") {
    return NextResponse.json({ error: "building_login is required" }, { status: 400 });
  }
  if (!rarity || !RARITY_POINTS[rarity]) {
    return NextResponse.json({ error: "Invalid rarity" }, { status: 400 });
  }
  if (!VALID_DURATIONS.includes(duration_hours)) {
    return NextResponse.json({ error: "duration_hours must be 24, 48, or 72" }, { status: 400 });
  }
  if (rarity === "legendary" && !item_reward) {
    return NextResponse.json({ error: "Legendary drops require item_reward" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Verify building exists
  const { data: dev } = await admin
    .from("developers")
    .select("id, claimed")
    .eq("github_login", building_login.toLowerCase())
    .single();

  if (!dev) return NextResponse.json({ error: "Building not found" }, { status: 404 });

  // Common, rare, epic: only on claimed buildings. Legendary: any building.
  if (rarity !== "legendary" && !dev.claimed) {
    return NextResponse.json({ error: "Non-legendary drops require a claimed building" }, { status: 400 });
  }

  // Check no active drop on this building (not expired AND not fully pulled)
  const { data: existing } = await admin
    .from("building_drops")
    .select("id, pull_count, max_pulls")
    .eq("building_id", dev.id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  // Only block if the existing drop is still pullable
  if (existing && existing.pull_count < existing.max_pulls) {
    return NextResponse.json({ error: "Building already has an active drop" }, { status: 409 });
  }

  // If item_reward specified, verify it exists
  if (item_reward) {
    const { data: item } = await admin.from("items").select("id").eq("id", item_reward).single();
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const points = RARITY_POINTS[rarity];
  const expires_at = new Date(Date.now() + duration_hours * 60 * 60 * 1000).toISOString();

  const { data: drop, error } = await admin.from("building_drops").insert({
    building_id: dev.id,
    rarity,
    points,
    item_reward: item_reward || null,
    max_pulls: max_pulls ?? 50,
    expires_at,
    created_by: login,
  }).select("id, building_id, rarity, points, expires_at, max_pulls, pull_count, item_reward").single();

  if (error) {
    return NextResponse.json({ error: "Failed to create drop" }, { status: 500 });
  }

  return NextResponse.json({ drop });
}
