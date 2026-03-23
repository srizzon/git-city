import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { verifyApiKey } from "@/lib/advertiser-api-auth";
import { rateLimit } from "@/lib/rate-limit";

async function getAdvertiserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer gc_ak_")) {
    return verifyApiKey(authHeader.slice(7));
  }
  const advertiser = await getAdvertiserFromCookies();
  return advertiser?.id ?? null;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { ok } = rateLimit(`api:${ip}`, 60, 60_000);
  if (!ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const advertiserId = await getAdvertiserId(request);
  if (!advertiserId) {
    return NextResponse.json({ error: "Unauthorized. Provide API key via Authorization: Bearer gc_ak_..." }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const { data: ads } = await sb
    .from("sky_ads")
    .select("id, brand, text, vehicle, active, plan_id, starts_at, ends_at, created_at")
    .eq("advertiser_id", advertiserId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ ads: ads ?? [] }, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
