import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Returns a map of slug → sky_ads ID for all active landmarks.
 * Called once on page load by SponsoredLandmark to resolve adIds for tracking.
 * Response is cached for 5 minutes to avoid hitting the DB on every page load.
 *
 * Intentionally public (no auth) — anonymous visitors need ad IDs to send
 * impression/click tracking events. The IDs are non-sensitive opaque strings.
 */
export async function GET() {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("sky_ads")
    .select("id, text")
    .eq("vehicle", "landmark")
    .eq("active", true);

  if (error) {
    return NextResponse.json({}, { status: 500 });
  }

  // text field stores the slug for landmarks
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.text] = row.id;
  }

  return NextResponse.json(map, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
