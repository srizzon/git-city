import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { LISTING_DURATION_DAYS } from "@/lib/jobs/constants";
import { sendJobApprovedEmail } from "@/lib/notification-senders/job-approved";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const expires = new Date(now.getTime() + LISTING_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await admin
    .from("job_listings")
    .update({
      status: "active",
      published_at: now.toISOString(),
      expires_at: expires.toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending_review");

  if (error) {
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }

  // Send approval email to company
  const { data: listing } = await admin
    .from("job_listings")
    .select("title, company:job_company_profiles!inner(advertiser_id)")
    .eq("id", id)
    .single();

  if (listing) {
    const comp = listing.company as unknown as { advertiser_id: string | null };
    if (comp.advertiser_id) {
      const { data: advertiser } = await admin
        .from("advertiser_accounts")
        .select("email")
        .eq("id", comp.advertiser_id)
        .single();

      if (advertiser?.email) {
        sendJobApprovedEmail(
          advertiser.email,
          listing.title,
          id,
          expires.toISOString(),
        ).catch((err) => console.error("[job-notify] Failed to send approved email:", err));
      }
    }
  }

  return NextResponse.json({ approved: true });
}
