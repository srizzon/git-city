import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getDailyMissions, getTodayStr, trackDailyMission } from "@/lib/dailies";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const githubLogin = (
    user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();

  const admin = getSupabaseAdmin();

  const { data: dev } = await admin
    .from("developers")
    .select("id, claimed, dailies_completed, dailies_streak, last_dailies_date, last_checkin_date")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed) {
    return NextResponse.json({ error: "Must claim building first" }, { status: 403 });
  }

  const today = getTodayStr();

  // Auto-track checkin if user already checked in today (catches pre-deploy sessions)
  if (dev.last_checkin_date === today) {
    await trackDailyMission(dev.id, "checkin");
  }

  const missions = getDailyMissions(dev.id, today);

  // Fetch today's progress
  const { data: progressRows } = await admin
    .from("daily_mission_progress")
    .select("mission_id, progress, completed")
    .eq("developer_id", dev.id)
    .eq("mission_date", today);

  const progressMap = new Map(
    (progressRows ?? []).map((r) => [r.mission_id, r]),
  );

  const missionData = missions.map((m) => {
    const prog = progressMap.get(m.id);
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      threshold: m.threshold,
      progress: prog?.progress ?? 0,
      completed: prog?.completed ?? false,
    };
  });

  const completedCount = missionData.filter((m) => m.completed).length;
  const allCompleted = completedCount === 3;
  const alreadyClaimedToday = dev.last_dailies_date === today;

  // Check if user owns github_star item
  const { data: starPurchase } = await admin
    .from("purchases")
    .select("id")
    .eq("developer_id", dev.id)
    .eq("item_id", "github_star")
    .eq("status", "completed")
    .maybeSingle();

  return NextResponse.json({
    missions: missionData,
    completed_count: completedCount,
    all_completed: allCompleted,
    reward_claimed: alreadyClaimedToday,
    dailies_streak: dev.dailies_streak ?? 0,
    dailies_completed: dev.dailies_completed ?? 0,
    has_github_star: !!starPurchase,
  });
}
