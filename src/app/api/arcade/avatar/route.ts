import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("arcade_avatars")
    .select("config")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ config: data?.config ?? null }, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { sprite_id: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const spriteId = Number(body.sprite_id);
  if (!Number.isInteger(spriteId) || spriteId < 0 || spriteId > 5) {
    return NextResponse.json(
      { error: "sprite_id must be an integer 0-5" },
      { status: 400 },
    );
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("arcade_avatars").upsert(
    {
      user_id: user.id,
      config: { sprite_id: spriteId },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("Arcade avatar upsert error:", error);
    return NextResponse.json(
      { error: "Failed to save avatar" },
      { status: 500 },
    );
  }

  return NextResponse.json({ config: { sprite_id: spriteId } });
}
