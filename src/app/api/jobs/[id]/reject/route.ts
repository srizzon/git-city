import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { sendJobRejectedEmail } from "@/lib/notification-senders/job-rejected";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const reason = body.reason ?? "Does not meet listing standards";

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("job_listings")
    .update({
      status: "rejected",
      rejection_reason: reason,
    })
    .eq("id", id)
    .eq("status", "pending_review");

  if (error) {
    return NextResponse.json({ error: "Failed to reject" }, { status: 500 });
  }

  // Send rejection email to company
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
        sendJobRejectedEmail(advertiser.email, listing.title, reason).catch((err) =>
          console.error("[job-notify] Failed to send rejected email:", err),
        );
      }
    }
  }

  return NextResponse.json({ rejected: true });
}
