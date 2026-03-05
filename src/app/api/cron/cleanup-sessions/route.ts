import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const now = Date.now();
  const idleCutoff = new Date(now - 5 * 60_000).toISOString();
  const offlineCutoff = new Date(now - 15 * 60_000).toISOString();

  // Mark sessions offline if no heartbeat in 15 minutes
  const { data: offlinedRows } = await sb
    .from("developer_sessions")
    .update({ status: "offline", ended_at: new Date().toISOString() })
    .in("status", ["active", "idle"])
    .lt("last_heartbeat_at", offlineCutoff)
    .select("id");

  // Mark sessions idle if no heartbeat in 5 minutes
  const { data: idledRows } = await sb
    .from("developer_sessions")
    .update({ status: "idle" })
    .eq("status", "active")
    .lt("last_heartbeat_at", idleCutoff)
    .select("id");

  return NextResponse.json({
    ok: true,
    offlined: offlinedRows?.length ?? 0,
    idled: idledRows?.length ?? 0,
  });
}
