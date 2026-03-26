import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { EXPIRY_WARNING_DAYS } from "@/lib/jobs/constants";

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const warningDate = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);

  // 1. Find listings expiring in EXPIRY_WARNING_DAYS days
  const { data: expiringSoon } = await admin
    .from("job_listings")
    .select("id, title, expires_at, company:job_company_profiles(name)")
    .eq("status", "active")
    .lte("expires_at", warningDate.toISOString())
    .gt("expires_at", now.toISOString());

  // 2. Find listings that expired today
  const { data: expired } = await admin
    .from("job_listings")
    .select("id, title")
    .eq("status", "active")
    .lte("expires_at", now.toISOString());

  // Update expired listings
  if (expired && expired.length > 0) {
    const expiredIds = expired.map((l) => l.id);
    await admin
      .from("job_listings")
      .update({ status: "expired" })
      .in("id", expiredIds);
  }

  return NextResponse.json({
    expiringSoon: expiringSoon?.length ?? 0,
    expired: expired?.length ?? 0,
    timestamp: now.toISOString(),
  });
}
