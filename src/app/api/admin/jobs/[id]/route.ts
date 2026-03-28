import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { validateListingFields, sanitizeDescription, sanitizeHowToApply } from "@/lib/jobs/validation";
import { LISTING_DURATION_DAYS, JOB_TIERS } from "@/lib/jobs/constants";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const body = await req.json();
  const { action } = body;

  switch (action) {
    case "pause":
      await admin
        .from("job_listings")
        .update({ status: "paused" })
        .eq("id", id)
        .in("status", ["active"]);
      break;

    case "resume":
      await admin
        .from("job_listings")
        .update({ status: "active" })
        .eq("id", id)
        .eq("status", "paused");
      break;

    case "delete":
      await admin.from("job_listings").delete().eq("id", id);
      break;

    case "edit": {
      const { fields } = body;
      if (!fields || typeof fields !== "object") {
        return NextResponse.json({ error: "fields object required" }, { status: 400 });
      }

      const updates: Record<string, unknown> = {};

      // Company reassignment
      if (fields.company_id !== undefined && typeof fields.company_id === "string") {
        updates.company_id = fields.company_id;
      }

      // Text fields with sanitization
      if (fields.title !== undefined) {
        if (typeof fields.title !== "string" || fields.title.length < 5 || fields.title.length > 100) {
          return NextResponse.json({ error: "Title must be 5-100 characters" }, { status: 400 });
        }
        updates.title = fields.title;
      }
      if (fields.description !== undefined) {
        if (typeof fields.description !== "string" || fields.description.length < 50) {
          return NextResponse.json({ error: "Description must be at least 50 characters" }, { status: 400 });
        }
        updates.description = sanitizeDescription(fields.description);
      }
      if (fields.how_to_apply !== undefined) {
        updates.how_to_apply = fields.how_to_apply ? sanitizeHowToApply(fields.how_to_apply) : null;
      }

      // Numeric fields
      if (fields.salary_min !== undefined) updates.salary_min = Number(fields.salary_min);
      if (fields.salary_max !== undefined) updates.salary_max = Number(fields.salary_max);

      // Simple string fields
      const stringFields = ["salary_currency", "salary_period", "role_type", "seniority", "contract_type", "web_type", "apply_url", "location_type", "location_restriction", "location_city", "location_timezone", "language", "language_pt_br"] as const;
      for (const f of stringFields) {
        if (fields[f] !== undefined) updates[f] = fields[f];
      }

      // Array fields
      if (fields.tech_stack !== undefined && Array.isArray(fields.tech_stack)) {
        updates.tech_stack = fields.tech_stack.map((t: string) => t.toLowerCase().trim());
      }
      if (fields.benefits !== undefined && Array.isArray(fields.benefits)) {
        updates.benefits = fields.benefits.slice(0, 15);
      }
      if (fields.location_countries !== undefined && Array.isArray(fields.location_countries)) {
        updates.location_countries = fields.location_countries.slice(0, 20);
      }

      // Boolean fields
      if (fields.badge_response_guaranteed !== undefined) updates.badge_response_guaranteed = Boolean(fields.badge_response_guaranteed);
      if (fields.badge_no_ai_screening !== undefined) updates.badge_no_ai_screening = Boolean(fields.badge_no_ai_screening);

      // Status change
      if (fields.status !== undefined) {
        updates.status = fields.status;
        if (fields.status === "active") {
          // Fetch current listing to check published_at
          const { data: current } = await admin.from("job_listings").select("published_at").eq("id", id).single();
          if (!current?.published_at) {
            updates.published_at = new Date().toISOString();
            updates.expires_at = new Date(Date.now() + LISTING_DURATION_DAYS * 86400000).toISOString();
          }
        }
      }

      // Tier change
      if (fields.tier !== undefined && fields.tier in JOB_TIERS) {
        updates.tier = fields.tier;
      }

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      const { data: listing, error } = await admin
        .from("job_listings")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Failed to edit listing:", error);
        return NextResponse.json({ error: "Failed to edit listing" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, listing });
    }

    case "change_tier": {
      const { tier } = body;
      if (!tier || !(tier in JOB_TIERS)) {
        return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
      }
      await admin.from("job_listings").update({ tier }).eq("id", id);
      break;
    }

    case "extend": {
      const { days } = body;
      const numDays = Number(days);
      if (!numDays || numDays <= 0 || numDays > 365) {
        return NextResponse.json({ error: "Days must be between 1 and 365" }, { status: 400 });
      }

      const { data: listing } = await admin
        .from("job_listings")
        .select("expires_at, status")
        .eq("id", id)
        .single();

      if (!listing) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }

      const baseDate = listing.expires_at ? new Date(listing.expires_at) : new Date();
      const newExpiry = new Date(baseDate.getTime() + numDays * 86400000).toISOString();

      const updates: Record<string, unknown> = { expires_at: newExpiry };

      // If expired or paused, reactivate
      if (listing.status === "expired" || listing.status === "paused") {
        updates.status = "active";
        if (!listing.expires_at) {
          updates.published_at = new Date().toISOString();
        }
      }

      await admin.from("job_listings").update(updates).eq("id", id);
      return NextResponse.json({ ok: true, expires_at: newExpiry });
    }

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
