import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { touchLastActive } from "@/lib/notification-helpers";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { building_login } = await request.json();
  if (!building_login || typeof building_login !== "string") {
    return NextResponse.json({ error: "Missing building_login" }, { status: 400 });
  }

  // Per-user rate limit
  const { ok } = rateLimit(`visit:${user.id}`, 2, 1000);
  if (!ok) {
    return NextResponse.json({ error: "Too fast" }, { status: 429 });
  }

  const admin = getSupabaseAdmin();

  const githubLogin = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  // Fetch visitor
  const { data: visitor } = await admin
    .from("developers")
    .select("id")
    .eq("github_login", githubLogin)
    .single();

  if (!visitor) {
    return NextResponse.json({ error: "Not a registered developer" }, { status: 403 });
  }

  // Fetch building owner
  const { data: building } = await admin
    .from("developers")
    .select("id")
    .eq("github_login", building_login.toLowerCase())
    .single();

  if (!building) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  // Track activity
  touchLastActive(visitor.id);

  // No self-visits
  if (visitor.id === building.id) {
    return NextResponse.json({ ok: true }); // silent success
  }

  // Check daily limit (50/day)
  const today = new Date().toISOString().split("T")[0];
  const { count } = await admin
    .from("building_visits")
    .select("visitor_id", { count: "exact", head: true })
    .eq("visitor_id", visitor.id)
    .eq("visit_date", today);

  if ((count ?? 0) >= 50) {
    return NextResponse.json({ ok: true }); // silent, no error needed
  }

  // Insert (ON CONFLICT DO NOTHING via PK constraint)
  const { error: insertError } = await admin
    .from("building_visits")
    .insert({
      visitor_id: visitor.id,
      building_id: building.id,
      visit_date: today,
    });

  if (!insertError) {
    await admin.rpc("increment_visit_count", { target_dev_id: building.id });

    // Check if building crossed visit milestone (>5 visits today)
    const { count: todayVisits } = await admin
      .from("building_visits")
      .select("visitor_id", { count: "exact", head: true })
      .eq("building_id", building.id)
      .eq("visit_date", today);

    if ((todayVisits ?? 0) >= 10) {
      // Only insert once per building per day
      const { data: existing } = await admin
        .from("activity_feed")
        .select("id")
        .eq("event_type", "visit_milestone")
        .eq("target_id", building.id)
        .gte("created_at", `${today}T00:00:00Z`)
        .maybeSingle();

      if (!existing) {
        await admin.from("activity_feed").insert({
          event_type: "visit_milestone",
          target_id: building.id,
          metadata: { login: building_login.toLowerCase(), visit_count: todayVisits },
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
