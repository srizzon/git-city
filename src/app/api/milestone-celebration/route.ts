import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendCommunityMilestoneNotifications } from "@/lib/notification-senders/community-milestone";

// Milestones to celebrate (every 5k after 10k)
const MILESTONES = [10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];

export async function POST(req: Request) {
  const { total_developers } = await req.json().catch(() => ({ total_developers: 0 }));
  if (!total_developers || typeof total_developers !== "number") {
    return NextResponse.json({ error: "missing total_developers" }, { status: 400 });
  }

  // Find the highest milestone that's been crossed
  const milestone = [...MILESTONES].reverse().find((m) => total_developers >= m);
  if (!milestone) {
    return NextResponse.json({ celebrated: false });
  }

  const sb = getSupabaseAdmin();

  // Idempotent: only insert if this milestone hasn't been recorded yet
  const { data, error } = await sb
    .from("milestone_celebrations")
    .upsert({ milestone, reached_at: new Date().toISOString() }, { onConflict: "milestone", ignoreDuplicates: true })
    .select()
    .single();

  if (error && !error.message.includes("duplicate")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send community milestone notifications (fire-and-forget, batch of 50)
  sendCommunityMilestoneNotifications(milestone).catch((err) => {
    console.error("[milestone] Notification send error:", err);
  });

  return NextResponse.json({ celebrated: true, milestone, reached_at: data?.reached_at });
}

// GET: return all celebrated milestones
export async function GET() {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("milestone_celebrations")
    .select("milestone, reached_at")
    .order("milestone", { ascending: false });

  return NextResponse.json(data ?? []);
}
