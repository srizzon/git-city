import { NextRequest, NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendJobHiredNotification } from "@/lib/notification-senders/job-hired";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { developer_id, status } = await req.json();

  if (!developer_id || !["applied", "hired"].includes(status)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Verify listing belongs to this advertiser
  const { data: listing } = await admin
    .from("job_listings")
    .select("id, company_id, company:job_company_profiles!inner(advertiser_id)")
    .eq("id", id)
    .single();

  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comp = listing.company as unknown as { advertiser_id: string };
  if (comp.advertiser_id !== advertiser.id) {
    return NextResponse.json({ error: "Not your listing" }, { status: 403 });
  }

  // Update application status
  const { error: updateError } = await admin
    .from("job_applications")
    .update({
      status,
      status_changed_at: new Date().toISOString(),
    })
    .eq("listing_id", id)
    .eq("developer_id", developer_id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  // If marking as hired, increment company hired_count and notify developer
  if (status === "hired") {
    await admin.rpc("increment_hired_count", { p_company_id: listing.company_id });

    // Get developer and listing info for notification
    const [devResult, listingResult] = await Promise.all([
      admin.from("developers").select("id, github_login").eq("id", developer_id).single(),
      admin
        .from("job_listings")
        .select("title, company:job_company_profiles!inner(name)")
        .eq("id", id)
        .single(),
    ]);

    if (devResult.data && listingResult.data) {
      const companyName = (listingResult.data.company as unknown as { name: string }).name;
      sendJobHiredNotification(
        devResult.data.id,
        devResult.data.github_login,
        companyName,
        listingResult.data.title,
      );

      // Award achievement
      await Promise.all([
        admin.rpc("grant_xp", { p_developer_id: developer_id, p_source: "job_hired", p_amount: 500 }),
        admin.rpc("grant_emblem", {
          p_developer_id: developer_id,
          p_emblem_id: "hired_in_the_city",
          p_claim_key: `threshold:hired_in_the_city:${developer_id}`,
          p_meta: {},
          p_source: "job",
        }),
      ]);
    }
  }

  return NextResponse.json({ ok: true });
}
