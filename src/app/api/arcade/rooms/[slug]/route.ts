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

// PUT /api/arcade/rooms/[slug] — update map_json (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Auth check — must be logged in
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check
  const login = (
    user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();
  const admins = (process.env.ADMIN_GITHUB_LOGINS ?? "")
    .split(",")
    .map((l: string) => l.trim().toLowerCase())
    .filter(Boolean);
  if (!admins.includes(login)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.map_json) {
    return NextResponse.json({ error: "map_json required" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("arcade_rooms")
    .update({ map_json: body.map_json, updated_at: new Date().toISOString() })
    .eq("slug", slug);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Invalidate PartyKit cache
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  if (host) {
    const base = host.startsWith("http") ? host : `https://${host}`;
    try {
      await fetch(`${base}/parties/main/${slug}/invalidate`, { method: "POST" });
    } catch {
      // Best-effort
    }
  }

  return NextResponse.json({ ok: true });
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
