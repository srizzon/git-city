import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
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
    return NextResponse.json({ applications: [] });
  }

  const { data: applications } = await admin
    .from("job_applications")
    .select("*, listing:job_listings(id, title, status, company:job_company_profiles(name, slug))")
    .eq("developer_id", dev.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ applications: applications ?? [] });
}
