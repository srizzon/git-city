import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { publishDue } from "@/lib/reel/publish";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Every 5 minutes: the reels whose slot has come ─────────────────────────
// Posts each scheduled reel (lib/reel/publish) once its time comes, so a reel
// goes out on time with the laptop closed. Nothing due: nothing to do.

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await publishDue(getSupabaseAdmin())) });
}
