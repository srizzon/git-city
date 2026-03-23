import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// POST: client heartbeat — lightweight upsert only
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
  if (!sessionId || sessionId.length > 64) {
    return NextResponse.json({ error: "invalid sessionId" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb.rpc("heartbeat_visitor", {
    p_session_id: sessionId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// GET: CDN-cached visitor count (shared across all users)
export async function GET() {
  const sb = getSupabaseAdmin();
  const { count, error } = await sb
    .from("site_visitors")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { count: count ?? 0 },
    {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
      },
    },
  );
}
