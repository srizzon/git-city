import { NextRequest, NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // Verify ownership
  const { data: listing } = await admin
    .from("job_listings")
    .select("id, status, company:job_company_profiles!inner(id, advertiser_id)")
    .eq("id", id)
    .single();

  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comp = listing.company as unknown as { id: string; advertiser_id: string };
  if (comp.advertiser_id !== advertiser.id) {
    return NextResponse.json({ error: "Not your listing" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  switch (action) {
    case "pause":
      await admin.from("job_listings").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", id);
      break;
    case "resume": {
      // Check if listing has expired while paused
      const { data: pausedListing } = await admin
        .from("job_listings")
        .select("expires_at")
        .eq("id", id)
        .eq("status", "paused")
        .single();

      if (!pausedListing) {
        return NextResponse.json({ error: "Listing not found or not paused" }, { status: 400 });
      }

      if (pausedListing.expires_at && new Date(pausedListing.expires_at) <= new Date()) {
        await admin.from("job_listings").update({ status: "expired" }).eq("id", id);
        return NextResponse.json({ error: "Listing has expired. Repost with a new payment." }, { status: 400 });
      }

      await admin.from("job_listings").update({ status: "active" }).eq("id", id).eq("status", "paused");
      break;
    }
    case "fill":
      await admin.from("job_listings").update({ status: "filled", filled_at: new Date().toISOString() }).eq("id", id);
      // Atomic increment hired_count
      await admin.rpc("increment_hired_count", { p_company_id: comp.id });
      break;
    case "delete": {
      // Only allow deleting drafts and rejected listings
      const deletableStatuses = ["draft", "rejected"];
      if (!deletableStatuses.includes(listing.status)) {
        return NextResponse.json({ error: "Can only delete drafts and rejected listings" }, { status: 400 });
      }
      await admin.from("job_listings").delete().eq("id", id);
      break;
    }
    case "edit": {
      const updates: Record<string, unknown> = {};
      if (body.description) updates.description = body.description;
      if (body.salary_min) updates.salary_min = body.salary_min;
      if (body.salary_max) updates.salary_max = body.salary_max;
      if (body.tech_stack) updates.tech_stack = body.tech_stack;
      if (Object.keys(updates).length > 0) {
        await admin.from("job_listings").update(updates).eq("id", id);
      }
      break;
    }
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
