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
    .from("arcade_discoveries")
    .select("commands")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ commands: data?.commands ?? [] }, {
    headers: { "Cache-Control": "private, max-age=10" },
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

  let body: { command: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const command = String(body.command ?? "").trim().toLowerCase();
  if (!command || command.length > 50) {
    return NextResponse.json({ error: "Invalid command" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Get current discoveries
  const { data: existing } = await sb
    .from("arcade_discoveries")
    .select("commands")
    .eq("user_id", user.id)
    .maybeSingle();

  const current: string[] = existing?.commands ?? [];

  // Already discovered
  if (current.includes(command)) {
    return NextResponse.json({ commands: current, new: false });
  }

  const updated = [...current, command];

  const { error } = await sb.from("arcade_discoveries").upsert(
    {
      user_id: user.id,
      commands: updated,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("Discoveries upsert error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ commands: updated, new: true });
}
