import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: ad } = await sb
    .from("sky_ads")
    .select("active")
    .eq("tracking_token", token)
    .maybeSingle();

  if (!ad) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ active: ad.active });
}
