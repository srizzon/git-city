import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const adId = request.nextUrl.searchParams.get("ad_id");
  if (!adId) {
    return NextResponse.json({ error: "Missing ad_id" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: ad } = await sb
    .from("sky_ads")
    .select("active")
    .eq("id", adId)
    .maybeSingle();

  if (!ad) {
    return NextResponse.json({ status: "not_found" });
  }

  return NextResponse.json(
    { status: ad.active ? "active" : "pending" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
