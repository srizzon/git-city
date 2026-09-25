import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Milestones to celebrate (every 5k after 10k)
const MILESTONES = [10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];

// Public and unauthenticated: the count comes from city_stats, never from the
// request body, so a caller can only record a milestone the city really crossed.
export async function POST() {
  const sb = getSupabaseAdmin();
  const { data: stats } = await sb.from("city_stats").select("total_developers").eq("id", 1).single();
  const totalDevelopers = stats?.total_developers ?? 0;

  // Find the highest milestone that's been crossed
  const milestone = [...MILESTONES].reverse().find((m) => totalDevelopers >= m);
  if (!milestone) {
    return NextResponse.json({ celebrated: false });
  }

  // Idempotent: only insert if this milestone hasn't been recorded yet
  const { data, error } = await sb
    .from("milestone_celebrations")
    .upsert({ milestone, reached_at: new Date().toISOString() }, { onConflict: "milestone", ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // No row back means this milestone was already recorded
  return NextResponse.json({ celebrated: !!data, milestone, reached_at: data?.reached_at });
}

// GET: return all celebrated milestones
export async function GET() {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("milestone_celebrations")
    .select("milestone, reached_at")
    .order("milestone", { ascending: false });

  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
