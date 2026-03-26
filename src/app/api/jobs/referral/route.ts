import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { randomBytes } from "crypto";

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("claimed_by", user.id)
    .maybeSingle();

  if (!dev) {
    return NextResponse.json({ error: "No developer profile" }, { status: 400 });
  }

  // Check if already has a referral code
  const { data: existing } = await admin
    .from("job_referrals")
    .select("referral_code")
    .eq("referrer_dev_id", dev.id)
    .is("advertiser_id", null)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ code: existing.referral_code });
  }

  // Generate new code
  const code = randomBytes(6).toString("hex");

  await admin
    .from("job_referrals")
    .insert({
      referrer_dev_id: dev.id,
      referral_code: code,
    });

  return NextResponse.json({ code });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Code required" }, { status: 400 });
  }

  // Just validate the code exists
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("job_referrals")
    .select("referral_code")
    .eq("referral_code", code)
    .maybeSingle();

  return NextResponse.json({ valid: !!data });
}
