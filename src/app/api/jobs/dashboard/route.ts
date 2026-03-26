import { NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // Get company
  const { data: company } = await admin
    .from("job_company_profiles")
    .select("id, last_dashboard_visit")
    .eq("advertiser_id", advertiser.id)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ company: null, listings: [] });
  }

  // Get listings
  const { data: listings } = await admin
    .from("job_listings")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });

  // Update last_dashboard_visit
  await admin
    .from("job_company_profiles")
    .update({ last_dashboard_visit: new Date().toISOString() })
    .eq("id", company.id);

  return NextResponse.json({
    company,
    listings: listings ?? [],
    lastVisit: company.last_dashboard_visit,
  });
}
