import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { LISTING_DURATION_DAYS } from "@/lib/jobs/constants";
import { sendJobApprovedEmail } from "@/lib/notification-senders/job-approved";
import { sendJobReferralConvertedNotification } from "@/lib/notification-senders/job-referral-converted";

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

  // Check if this company was referred (first approved listing triggers referral reward)
  if (listing) {
    const comp = listing.company as unknown as { advertiser_id: string | null };
    if (comp.advertiser_id) {
      const { data: referral } = await admin
        .from("job_referrals")
        .select("referrer_dev_id, converted")
        .eq("advertiser_id", comp.advertiser_id)
        .eq("converted", false)
        .maybeSingle();

      if (referral) {
        // Mark referral as converted
        await admin
          .from("job_referrals")
          .update({ converted: true, converted_at: new Date().toISOString() })
          .eq("referrer_dev_id", referral.referrer_dev_id)
          .eq("advertiser_id", comp.advertiser_id);

        // Get referrer info and notify
        const { data: referrer } = await admin
          .from("developers")
          .select("id, github_login")
          .eq("id", referral.referrer_dev_id)
          .single();

        if (referrer) {
          // Award XP + achievement
          await Promise.all([
            admin.rpc("grant_xp", { p_developer_id: referrer.id, p_source: "referral_converted", p_amount: 1000 }),
            admin.from("developer_achievements").upsert(
              { developer_id: referrer.id, achievement_id: "city_recruiter", name: "City Recruiter", tier: "silver" },
              { onConflict: "developer_id,achievement_id" },
            ),
          ]);

          const { data: companyInfo } = await admin
            .from("job_company_profiles")
            .select("name")
            .eq("advertiser_id", comp.advertiser_id)
            .single();

          sendJobReferralConvertedNotification(
            referrer.id,
            referrer.github_login,
            companyInfo?.name ?? "A company",
          );
        }
      }
    }
  }

  return NextResponse.json({ approved: true });
}
