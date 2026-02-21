import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=no_code`);
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/?error=auth_failed`);
  }

  const githubLogin = (
    data.user.user_metadata.user_name ??
    data.user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  const admin = getSupabaseAdmin();

  if (githubLogin) {
    // Auto-claim: if building exists and not yet claimed, claim it
    await admin
      .from("developers")
      .update({
        claimed: true,
        claimed_by: data.user.id,
        claimed_at: new Date().toISOString(),
        fetch_priority: 1,
      })
      .eq("github_login", githubLogin)
      .eq("claimed", false);
  }

  // Support ?next= param for post-login redirect (e.g. /shop)
  const next = searchParams.get("next");
  if (next === "/shop" && githubLogin) {
    // Ensure developer exists in the database before redirecting to shop
    const { data: dev } = await admin
      .from("developers")
      .select("github_login")
      .eq("github_login", githubLogin)
      .single();

    if (!dev) {
      // Developer not in the city yet — redirect to homepage to create their building first
      return NextResponse.redirect(`${origin}/?user=${githubLogin}`);
    }

    return NextResponse.redirect(`${origin}/shop/${githubLogin}`);
  }

  return NextResponse.redirect(`${origin}/?user=${githubLogin}`);
}
