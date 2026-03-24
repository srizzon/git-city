import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

// POST /api/arcade/favorites — toggle favorite
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { room_id } = (await req.json()) as { room_id?: string };
  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Check if already favorited
  const { data: existing } = await sb
    .from("arcade_room_favorites")
    .select("room_id")
    .eq("user_id", user.id)
    .eq("room_id", room_id)
    .single();

  if (existing) {
    // Remove favorite
    await sb.from("arcade_room_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("room_id", room_id);
    return NextResponse.json({ favorited: false });
  }

  // Add favorite
  const { error } = await sb.from("arcade_room_favorites")
    .insert({ user_id: user.id, room_id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ favorited: true });
}
