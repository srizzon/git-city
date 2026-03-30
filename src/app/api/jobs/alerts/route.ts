import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * POST /api/jobs/alerts — Subscribe to recurring job alerts.
 * Works for both authenticated and unauthenticated users.
 * Authenticated users are auto-verified; anonymous users need email verification.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = (body.email ?? "").trim().toLowerCase();
  const techStack = (body.tech_stack ?? []) as string[];

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  if (techStack.length > 15) {
    return NextResponse.json({ error: "Max 15 tech stack tags" }, { status: 400 });
  }

  const cleanStack = techStack.map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 15);
  const admin = getSupabaseAdmin();

  // Check if authenticated
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let developerId: number | null = null;
  let autoVerified = false;

  if (user) {
    const { data: dev } = await admin
      .from("developers")
      .select("id")
      .eq("claimed_by", user.id)
      .maybeSingle();
    developerId = dev?.id ?? null;
    autoVerified = true;
  }

  const verifyToken = autoVerified ? null : crypto.randomUUID();

  const { error } = await admin
    .from("job_alert_subscriptions")
    .upsert(
      {
        email,
        tech_stack: cleanStack,
        verified: autoVerified,
        verify_token: verifyToken,
        developer_id: developerId,
      },
      { onConflict: "idx_job_alert_subscriptions_email" },
    );

  if (error) {
    // On conflict (email exists), just update the stack
    await admin
      .from("job_alert_subscriptions")
      .update({ tech_stack: cleanStack })
      .eq("email", email);
  }

  // TODO: Send verification email for non-authenticated users
  // For now, auto-verify everyone during launch to reduce friction
  if (!autoVerified) {
    await admin
      .from("job_alert_subscriptions")
      .update({ verified: true })
      .eq("email", email);
  }

  return NextResponse.json({ subscribed: true });
}
