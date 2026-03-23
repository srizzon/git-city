import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { generateApiKey, revokeApiKey } from "@/lib/advertiser-api-auth";

export async function GET() {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const { data: keys } = await sb
    .from("advertiser_api_keys")
    .select("id, key_prefix, label, created_at, revoked_at")
    .eq("advertiser_id", advertiser.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ keys: keys ?? [] }, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}

export async function POST(request: NextRequest) {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const label = body.label?.trim() || "Default";
  if (label.length > 100) {
    return NextResponse.json({ error: "Label too long" }, { status: 400 });
  }

  // Limit to 10 active keys
  const sb = getSupabaseAdmin();
  const { count } = await sb
    .from("advertiser_api_keys")
    .select("id", { count: "exact", head: true })
    .eq("advertiser_id", advertiser.id)
    .is("revoked_at", null);

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: "Maximum 10 active API keys" }, { status: 400 });
  }

  const { key, id } = await generateApiKey(advertiser.id, label);
  return NextResponse.json({ key, id });
}

export async function DELETE(request: NextRequest) {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyId = request.nextUrl.searchParams.get("id");
  if (!keyId) {
    return NextResponse.json({ error: "Missing key id" }, { status: 400 });
  }

  const revoked = await revokeApiKey(keyId, advertiser.id);
  if (!revoked) {
    return NextResponse.json({ error: "Key not found or already revoked" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
