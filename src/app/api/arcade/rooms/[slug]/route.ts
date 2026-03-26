import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";

// GET /api/arcade/rooms/[slug] — get room with full map_json + track visit
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("arcade_rooms")
    .select("id, slug, name, room_type, floor_number, max_players, visibility, category, description, is_featured, portals, map_json, created_at, updated_at")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  // Track visit (best-effort, don't block response)
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      void sb.rpc("upsert_arcade_visit", { p_user_id: user.id, p_room_id: data.id });
    }
  } catch {
    // Not authenticated — skip visit tracking
  }

  return NextResponse.json({ room: data }, {
    headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
  });
}

// POST /api/arcade/rooms/[slug] — invalidate PartyKit cache (admin only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const authHeader = req.headers.get("authorization");
  const expectedKey = process.env.ARCADE_ADMIN_KEY;
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  if (!host) {
    return NextResponse.json({ error: "PartyKit host not configured" }, { status: 500 });
  }

  const base = host.startsWith("http") ? host : `https://${host}`;
  try {
    const res = await fetch(`${base}/parties/main/${slug}/invalidate`, {
      method: "POST",
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to reach PartyKit" }, { status: 502 });
  }
}
