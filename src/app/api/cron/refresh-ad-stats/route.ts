import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();

  try {
    await sb.rpc("refresh_sky_ad_stats");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to refresh ad stats:", err);
    return NextResponse.json({ ok: true, warning: "refresh failed" });
  }
}
