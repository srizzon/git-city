import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Public catalog of active pixel packages, ordered for display. Mirrors the
 * query the /pixels page runs server-side, but exposed for client components
 * (the in-city BankPanel) that can't read the DB directly.
 */
export async function GET() {
  const sb = getSupabaseAdmin();
  const { data: packages } = await sb
    .from("pixel_packages")
    .select(
      "id, name, pixels, bonus_pixels, price_usd_cents, price_brl_cents, sort_order",
    )
    .eq("is_active", true)
    .order("sort_order");

  return NextResponse.json(
    { packages: packages ?? [] },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
  );
}
