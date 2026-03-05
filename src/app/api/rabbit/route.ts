import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";

// POST - Record rabbit sighting encounter
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { ok } = rateLimit(`rabbit:${user.id}`, 2, 1000);
  if (!ok) {
    return NextResponse.json({ error: "Too fast" }, { status: 429 });
  }

  const { sighting } = await request.json();
  if (typeof sighting !== "number" || sighting < 1 || sighting > 5) {
    return NextResponse.json({ error: "Invalid sighting" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const githubLogin = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  // Fetch developer (must have claimed building)
  const { data: dev } = await admin
    .from("developers")
    .select("id, claimed, rabbit_progress, rabbit_completed")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed) {
    return NextResponse.json({ error: "Must claim building first" }, { status: 403 });
  }

  if (dev.rabbit_completed) {
    return NextResponse.json({ progress: 5, completed: true });
  }

  // Must be sequential: no skipping
  if (sighting !== (dev.rabbit_progress ?? 0) + 1) {
    return NextResponse.json({ error: "Wrong sighting order" }, { status: 400 });
  }

  if (sighting === 5) {
    // Final sighting: complete the quest
    const { error } = await admin
      .from("developers")
      .update({
        rabbit_progress: 5,
        rabbit_completed: true,
        rabbit_completed_at: new Date().toISOString(),
      })
      .eq("id", dev.id);

    if (error) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    // Grant achievement
    await admin
      .from("developer_achievements")
      .upsert(
        { developer_id: dev.id, achievement_id: "white_rabbit" },
        { onConflict: "developer_id,achievement_id" },
      );

    // Grant white_rabbit item (free purchase record, skip if already owned)
    const { data: existingPurchase } = await admin
      .from("purchases")
      .select("id")
      .eq("developer_id", dev.id)
      .eq("item_id", "white_rabbit")
      .eq("status", "completed")
      .maybeSingle();

    if (!existingPurchase) {
      await admin.from("purchases").insert({
        developer_id: dev.id,
        item_id: "white_rabbit",
        provider: "system",
        amount_cents: 0,
        currency: "usd",
        status: "completed",
      });
    }

    return NextResponse.json({ progress: 5, completed: true });
  }

  // Sightings 1-4
  const updates: Record<string, unknown> = {
    rabbit_progress: sighting,
  };
  if (sighting === 1) {
    updates.rabbit_started_at = new Date().toISOString();
  }

  const { error } = await admin.from("developers").update(updates).eq("id", dev.id);

  if (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ progress: sighting, completed: false });
}

// GET - Hall of completers (public) or progress check (authenticated)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const admin = getSupabaseAdmin();

  // Check personal progress
  if (searchParams.has("check")) {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ progress: 0, completed: false });
    }

    const githubLogin = (
      user.user_metadata.user_name ??
      user.user_metadata.preferred_username ??
      ""
    ).toLowerCase();

    const { data: dev } = await admin
      .from("developers")
      .select("rabbit_progress, rabbit_completed, rabbit_completed_at")
      .eq("github_login", githubLogin)
      .single();

    return NextResponse.json({
      progress: dev?.rabbit_progress ?? 0,
      completed: dev?.rabbit_completed ?? false,
      completed_at: dev?.rabbit_completed_at ?? null,
    });
  }

  // Hall of completers
  const { data: completers } = await admin
    .from("developers")
    .select("github_login, avatar_url, name, rabbit_completed_at")
    .eq("rabbit_completed", true)
    .order("rabbit_completed_at", { ascending: true })
    .limit(100);

  const hall = (completers ?? []).map((c, i) => ({
    position: i + 1,
    login: c.github_login,
    avatar_url: c.avatar_url,
    name: c.name,
    completed_at: c.rabbit_completed_at,
  }));

  return NextResponse.json(
    { completers: hall },
    {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    },
  );
}
