import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

const MAX_THEME = 3;

/**
 * GET /api/preferences/theme
 * Returns the authenticated user's saved city theme index.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const githubLogin = (
    user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();

  const { data: dev } = await sb
    .from("developers")
    .select("city_theme")
    .eq("github_login", githubLogin)
    .single();

  if (!dev) {
    return NextResponse.json({ city_theme: 0 });
  }

  return NextResponse.json({ city_theme: dev.city_theme ?? 0 });
}

/**
 * PATCH /api/preferences/theme
 * Update the authenticated user's city theme.
 * Body: { city_theme: number }
 */
export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const theme = body.city_theme;

  if (typeof theme !== "number" || theme < 0 || theme > MAX_THEME || !Number.isInteger(theme)) {
    return NextResponse.json({ error: "Invalid theme index" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const githubLogin = (
    user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();

  const { error } = await sb
    .from("developers")
    .update({ city_theme: theme })
    .eq("github_login", githubLogin);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ city_theme: theme });
}
