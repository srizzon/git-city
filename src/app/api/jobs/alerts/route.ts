import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CLAIMED_DEVELOPER_LIMIT, pickClaimedDeveloper } from "@/lib/auth-identity";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * POST /api/jobs/alerts — Subscribe to recurring job alerts.
 * Works for both authenticated and unauthenticated users.
 * Authenticated users are auto-verified; anonymous users auto-verified during launch.
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

  if (user) {
    const { data: devRows } = await admin
      .from("developers")
      .select("id, github_login")
      .eq("claimed_by", user.id)
      .order("claimed_at", { ascending: true })
      .limit(CLAIMED_DEVELOPER_LIMIT);
    const dev = pickClaimedDeveloper(devRows, user);
    developerId = dev?.id ?? null;
  }

  // Try insert first; if email already exists, update tech_stack instead
  const { error: insertError } = await admin
    .from("job_alert_subscriptions")
    .insert({
      email,
      tech_stack: cleanStack,
      verified: true,
      developer_id: developerId,
    });

  if (insertError) {
    // Email already exists (unique index on lower(email)) — update preferences
    await admin
      .from("job_alert_subscriptions")
      .update({
        tech_stack: cleanStack,
        ...(developerId ? { developer_id: developerId } : {}),
      })
      .eq("email", email);
  }

  return NextResponse.json({ subscribed: true });
}
