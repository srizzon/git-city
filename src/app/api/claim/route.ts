import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const githubLogin = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  if (!githubLogin) {
    return NextResponse.json({ error: "No GitHub username in profile" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Check that the user hasn't already claimed a different building
  const { data: alreadyClaimed } = await admin
    .from("developers")
    .select("github_login")
    .eq("claimed_by", user.id)
    .maybeSingle();

  if (alreadyClaimed) {
    return NextResponse.json({ error: "You have already claimed a building" }, { status: 409 });
  }

  // Atomic claim: eq("claimed", false) + is("claimed_by", null) prevents race conditions
  const { data, error } = await admin
    .from("developers")
    .update({
      claimed: true,
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
      fetch_priority: 1,
    })
    .eq("github_login", githubLogin)
    .eq("claimed", false)
    .is("claimed_by", null)
    .select("github_login")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Building not found or already claimed" }, { status: 404 });
  }

  // Insert feed event
  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("github_login", githubLogin)
    .single();

  if (dev) {
    await admin.from("activity_feed").insert({
      event_type: "building_claimed",
      actor_id: dev.id,
      metadata: { login: githubLogin },
    });
  }

  return NextResponse.json({ claimed: true, github_login: data.github_login });
}
