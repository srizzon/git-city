import { NextRequest, NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createJobCheckoutSession } from "@/lib/jobs/stripe";
import type { JobTier } from "@/lib/jobs/types";

const VALID_TIERS: JobTier[] = ["standard", "featured", "premium"];

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
    .select("id, status, company:job_company_profiles!inner(advertiser_id)")
    .eq("id", listing_id)
    .single();

  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  const comp = listing.company as unknown as { advertiser_id: string };
  if (comp.advertiser_id !== advertiser.id) {
    return NextResponse.json({ error: "Not your listing" }, { status: 403 });
  }

  // Only allow checkout for draft and expired listings
  const payableStatuses = ["draft", "expired"];
  if (!payableStatuses.includes(listing.status)) {
    return NextResponse.json({ error: "Listing is not in a payable state" }, { status: 400 });
  }

  // Update tier on the listing
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
