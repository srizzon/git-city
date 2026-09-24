import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CLAIMED_DEVELOPER_LIMIT, pickClaimedDeveloper } from "@/lib/auth-identity";

export async function GET() {
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

  if (!dev) {
    return NextResponse.json({ applications: [] });
  }

  const { data: applications } = await admin
    .from("job_applications")
    .select("*, listing:job_listings(id, title, status, salary_min, salary_max, salary_currency, salary_period, seniority, role_type, location_type, contract_type, company:job_company_profiles(name, slug, website))")
    .eq("developer_id", dev.id)
    .eq("type", "native")
    .order("created_at", { ascending: false });

  return NextResponse.json({ applications: applications ?? [] });
}
