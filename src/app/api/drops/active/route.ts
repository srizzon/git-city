import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

export async function GET() {
  // Admin-only: used by /admin/drops page
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const login = getGithubLoginFromUser(user);
  if (!isAdminGithubLogin(login)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("building_drops")
    .select("id, building_id, rarity, points, max_pulls, pull_count, expires_at, developers!inner(github_login, avatar_url)")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch drops" }, { status: 500 });
  }

  const active = (data ?? []).filter((d) => d.pull_count < d.max_pulls);

  return NextResponse.json({ drops: active });
}
