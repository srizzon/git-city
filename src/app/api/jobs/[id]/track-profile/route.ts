import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CLAIMED_DEVELOPER_LIMIT, pickClaimedDeveloper } from "@/lib/auth-identity";

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

  const { data: devRows } = await admin
    .from("developers")
    .select("id, github_login")
    .eq("claimed_by", user.id)
    .order("claimed_at", { ascending: true })
    .limit(CLAIMED_DEVELOPER_LIMIT);
  const dev = pickClaimedDeveloper(devRows, user);

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
