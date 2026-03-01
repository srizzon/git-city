import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";

const VALID_DISTRICTS = [
  "frontend", "backend", "fullstack", "mobile", "data_ai",
  "devops", "security", "gamedev", "vibe_coder", "creator",
];

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { ok } = rateLimit(`district:${user.id}`, 2, 60_000);
  if (!ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const district_id = body.district_id as string;

  if (!district_id || !VALID_DISTRICTS.includes(district_id)) {
    return NextResponse.json({ error: "Invalid district" }, { status: 400 });
  }

  // Fetch developer
  const login = user.user_metadata?.user_name?.toLowerCase();
  if (!login) {
    return NextResponse.json({ error: "No GitHub login found" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: dev, error: devError } = await admin
    .from("developers")
    .select("id, claimed, district, district_chosen, district_changes_count, district_changed_at")
    .eq("github_login", login)
    .single();

  if (devError || !dev) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }

  if (!dev.claimed) {
    return NextResponse.json({ error: "You must claim your building first" }, { status: 403 });
  }

  const oldDistrict = dev.district;
  const isFirstChoice = !dev.district_chosen;
  const isActualChange = oldDistrict !== null && oldDistrict !== district_id;

  // Same district = no-op, just confirm
  if (oldDistrict === district_id) {
    await admin
      .from("developers")
      .update({ district_chosen: true })
      .eq("id", dev.id);
    return NextResponse.json({ ok: true, district: district_id });
  }

  // Business rules only apply to real changes (not first choice)
  if (!isFirstChoice) {
    if ((dev.district_changes_count ?? 0) >= 2) {
      return NextResponse.json(
        { error: "Paid district changes coming soon" },
        { status: 403 },
      );
    }

    if (dev.district_changed_at) {
      const lastChange = new Date(dev.district_changed_at).getTime();
      const cooldownMs = 90 * 24 * 60 * 60 * 1000;
      const remaining = lastChange + cooldownMs - Date.now();
      if (remaining > 0) {
        const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
        return NextResponse.json(
          { error: `Cooldown: wait ${days} days` },
          { status: 429 },
        );
      }
    }
  }

  // Update developer
  const { error: updateError } = await admin
    .from("developers")
    .update({
      district: district_id,
      district_chosen: true,
      // Only count actual changes, not first choice
      district_changes_count: isActualChange
        ? (dev.district_changes_count ?? 0) + 1
        : (dev.district_changes_count ?? 0),
      district_changed_at: isActualChange
        ? new Date().toISOString()
        : dev.district_changed_at,
    })
    .eq("id", dev.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update district" }, { status: 500 });
  }

  // Log the change
  await admin.from("district_changes").insert({
    developer_id: dev.id,
    from_district: oldDistrict,
    to_district: district_id,
    reason: "user_choice",
  });

  // Update district population counts
  if (oldDistrict) {
    const { data: oldDist } = await admin
      .from("districts")
      .select("population")
      .eq("id", oldDistrict)
      .single();
    if (oldDist) {
      await admin
        .from("districts")
        .update({ population: Math.max(0, (oldDist.population ?? 0) - 1) })
        .eq("id", oldDistrict);
    }
  }

  const { data: newDist } = await admin
    .from("districts")
    .select("population")
    .eq("id", district_id)
    .single();
  if (newDist) {
    await admin
      .from("districts")
      .update({ population: (newDist.population ?? 0) + 1 })
      .eq("id", district_id);
  }

  return NextResponse.json({ ok: true, district: district_id });
}
