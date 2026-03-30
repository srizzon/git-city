import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Run all queries in parallel
  const [
    sent24hResult,
    sent7dResult,
    failedResult,
    bouncedResult,
    deliveredResult,
    suppressedResult,
    recentFailuresResult,
  ] = await Promise.all([
    // Total sent last 24h
    admin
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneDayAgo),

    // Total sent last 7d
    admin
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),

    // Failed count (last 7d)
    admin
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo)
      .not("failed_at", "is", null),

    // Bounced count (last 7d, check failure_reason)
    admin
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo)
      .eq("failure_reason", "bounce"),

    // Delivered count (last 7d)
    admin
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo)
      .not("delivered_at", "is", null),

    // Total suppressed
    admin
      .from("notification_suppressions")
      .select("id", { count: "exact", head: true }),

    // Recent failures (last 20)
    admin
      .from("notification_log")
      .select("id, channel, notification_type, recipient, title, status, failure_reason, failed_at, created_at")
      .not("failed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    stats: {
      sent24h: sent24hResult.count ?? 0,
      sent7d: sent7dResult.count ?? 0,
      failed: failedResult.count ?? 0,
      bounced: bouncedResult.count ?? 0,
      delivered: deliveredResult.count ?? 0,
      suppressed: suppressedResult.count ?? 0,
    },
    recentFailures: recentFailuresResult.data ?? [],
  });
}
