import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CLAIMED_DEVELOPER_LIMIT, pickClaimedDeveloper } from "@/lib/auth-identity";

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

  const { data: devRows } = await sb
    .from("developers")
    .select("city_theme, github_login")
    .eq("claimed_by", user.id)
    .order("claimed_at", { ascending: true })
    .limit(CLAIMED_DEVELOPER_LIMIT);
  const dev = pickClaimedDeveloper(devRows, user);

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

  const { error } = await sb
    .from("developers")
    .update({ city_theme: theme })
    .eq("claimed_by", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ city_theme: theme });
}
