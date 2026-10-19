import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { measurePosts } from "@/lib/reel/publish";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Every hour: what the posted reels did ──────────────────────────────────
// Snapshots each reel's Instagram numbers and the devs it put on the map
// (lib/reel/publish): hourly for its first 48 hours, then daily for a week.

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, taken: await measurePosts(getSupabaseAdmin()) });
}
