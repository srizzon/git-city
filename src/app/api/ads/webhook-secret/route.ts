import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";

export const dynamic = "force-dynamic";

function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "gc_ws_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("advertiser_accounts")
    .select("webhook_secret")
    .eq("id", advertiser.id)
    .single();

  return NextResponse.json({ has_secret: !!data?.webhook_secret });
}

export async function POST() {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const secret = generateWebhookSecret();

  await sb
    .from("advertiser_accounts")
    .update({ webhook_secret: secret })
    .eq("id", advertiser.id);

  return NextResponse.json({ webhook_secret: secret });
}
