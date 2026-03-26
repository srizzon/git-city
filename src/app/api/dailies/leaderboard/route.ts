import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const revalidate = 300; // ISR: regenerate every 5 min

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ leaderboard: [], total: 0 });
  }
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("developers")
    .select("github_login, avatar_url, dailies_completed, dailies_streak")
    .eq("claimed", true)
    .gt("dailies_completed", 0)
    .order("dailies_streak", { ascending: false })
    .order("dailies_completed", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  return NextResponse.json({
    leaderboard: data ?? [],
    total: data?.length ?? 0,
  });
}
