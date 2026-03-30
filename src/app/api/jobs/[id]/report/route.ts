import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendJobReportedEmail, sendJobReportedAdminEmail } from "@/lib/notification-senders/job-reported";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  const body = await req.json();
  const { reason, details } = body;

  if (!reason) {
    return NextResponse.json({ error: "Reason required" }, { status: 400 });
  }

  // Upsert report
  await admin
    .from("job_reports")
    .upsert(
      {
        listing_id: id,
        developer_id: dev.id,
        reason,
        details: details ?? null,
      },
      { onConflict: "listing_id,developer_id" },
    );

  // Flag for admin review at 10+ reports (no auto-pause to prevent abuse)
  const { count } = await admin
    .from("job_reports")
    .select("*", { count: "exact", head: true })
    .eq("listing_id", id);

  if (count && count >= 10) {
    // Mark as flagged for admin review instead of auto-pausing
    const { data: updated } = await admin
      .from("job_listings")
      .update({ status: "paused", paused_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "active")
      .select("title, company:job_company_profiles!inner(name, advertiser_id)")
      .single();

    if (updated) {
      const comp = updated.company as unknown as { name: string; advertiser_id: string | null };

      // Notify admin
      sendJobReportedAdminEmail(updated.title, comp.name, count, id).catch((err) =>
        console.error("[job-notify] Failed to send report admin email:", err),
      );

      // Notify company
      if (comp.advertiser_id) {
        admin
          .from("advertiser_accounts")
          .select("email")
          .eq("id", comp.advertiser_id)
          .single()
          .then(({ data: advertiser }) => {
            if (advertiser?.email) {
              sendJobReportedEmail(advertiser.email, updated.title).catch((err) =>
                console.error("[job-notify] Failed to send report company email:", err),
              );
            }
          });
      }
    }
  }

  return NextResponse.json({ reported: true });
}
