import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("claimed_by", user.id)
    .maybeSingle();

  if (!dev) {
    return NextResponse.json({ error: "No developer profile" }, { status: 400 });
  }

  const body = await req.json();
  const { reason, details } = body;

  if (!reason) {
    return NextResponse.json({ error: "Reason required" }, { status: 400 });
  }

  // Upsert report
  await admin
    .from("job_reports")
    .upsert(
      {
        listing_id: id,
        developer_id: dev.id,
        reason,
        details: details ?? null,
      },
      { onConflict: "listing_id,developer_id" },
    );

  // Check if >= 3 reports → auto-pause
  const { count } = await admin
    .from("job_reports")
    .select("*", { count: "exact", head: true })
    .eq("listing_id", id);

  if (count && count >= 3) {
    await admin
      .from("job_listings")
      .update({ status: "paused", paused_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "active");
  }

  return NextResponse.json({ reported: true });
}
