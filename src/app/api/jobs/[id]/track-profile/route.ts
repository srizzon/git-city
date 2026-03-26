import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(
  _req: NextRequest,
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

  // Track event + atomic counter increment
  await Promise.all([
    admin.from("job_listing_events").insert({
      listing_id: id,
      event_type: "profile_copy",
      developer_id: dev?.id ?? null,
    }),
    admin.rpc("increment_job_counter", {
      p_listing_id: id,
      p_column: "profile_count",
    }),
  ]);

  return NextResponse.json({ tracked: true });
}
