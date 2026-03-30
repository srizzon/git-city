import { NextRequest, NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createJobCheckoutSession } from "@/lib/jobs/stripe";
import { FREE_LISTING_LIMIT, LISTING_DURATION_DAYS } from "@/lib/jobs/constants";
import type { JobTier } from "@/lib/jobs/types";
import { sendJobPendingReviewEmail } from "@/lib/notification-senders/job-pending-review";

const VALID_TIERS: JobTier[] = ["free", "standard", "featured", "premium"];

export async function POST(req: NextRequest) {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { listing_id, tier } = body;

  if (!listing_id) return NextResponse.json({ error: "listing_id required" }, { status: 400 });
  if (!VALID_TIERS.includes(tier)) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });

  const admin = getSupabaseAdmin();

  // Verify listing belongs to this advertiser's company
  const { data: listing } = await admin
    .from("job_listings")
    .select("id, status, company_id, company:job_company_profiles!inner(id, advertiser_id)")
    .eq("id", listing_id)
    .single();

  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  const comp = listing.company as unknown as { advertiser_id: string; id: string };
  if (comp.advertiser_id !== advertiser.id) {
    return NextResponse.json({ error: "Not your listing" }, { status: 403 });
  }

  // Only allow checkout for draft and expired listings
  const payableStatuses = ["draft", "expired"];
  if (!payableStatuses.includes(listing.status)) {
    return NextResponse.json({ error: "Listing is not in a payable state" }, { status: 400 });
  }

  // ── Free tier: check limit and auto-activate ──
  if (tier === "free") {
    // Count how many free listings this company already used
    const { count } = await admin
      .from("job_listings")
      .select("*", { count: "exact", head: true })
      .eq("company_id", listing.company_id)
      .eq("tier", "free")
      .neq("status", "draft");

    if ((count ?? 0) >= FREE_LISTING_LIMIT) {
      return NextResponse.json(
        { error: "Free listing limit reached. Upgrade to a paid tier." },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + LISTING_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await admin
      .from("job_listings")
      .update({
        tier: "free",
        status: "pending_review",
        published_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .eq("id", listing_id);

    // Notify admin that a new listing needs review
    const { data: pendingListing } = await admin
      .from("job_listings")
      .select("title, company:job_company_profiles!inner(name)")
      .eq("id", listing_id)
      .single();

    if (pendingListing) {
      const compName = (pendingListing.company as unknown as { name: string }).name;
      sendJobPendingReviewEmail(pendingListing.title, compName, "free", listing_id).catch((err) =>
        console.error("[job-notify] Failed to send pending review email:", err),
      );
    }

    return NextResponse.json({ url: `/jobs/dashboard?published=free` });
  }

  // ── Paid tiers: Stripe checkout ──
  await admin
    .from("job_listings")
    .update({ tier })
    .eq("id", listing_id);

  const { url } = await createJobCheckoutSession(
    listing_id,
    tier as JobTier,
    advertiser.id,
    advertiser.email,
  );

  return NextResponse.json({ url });
}
