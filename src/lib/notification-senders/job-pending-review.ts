import { sendCompanyEmail } from "@/lib/jobs/send-company-email";
import { getAdminNotificationEmail } from "@/lib/jobs/admin-email";
import { ADMIN_LINKS } from "@/lib/jobs/email-blocks";
import { JOB_TIERS } from "@/lib/jobs/constants";
import { EMAIL_BASE_URL, button, detailRows, heading, paragraph } from "@/lib/email/components";
import { renderLayout, renderText, type EmailLinks } from "@/lib/email/layout";

export interface JobPendingReviewData {
  listingTitle: string;
  companyName: string;
  tier: string;
  listingId: string;
}

export function renderJobPendingReviewEmail(d: JobPendingReviewData, links: EmailLinks = ADMIN_LINKS) {
  const tierLabel = JOB_TIERS[d.tier as keyof typeof JOB_TIERS]?.label ?? d.tier;
  const subject = `Needs review: ${d.listingTitle}`;
  const preheader = `${d.companyName} submitted a ${tierLabel.toLowerCase()} listing. It stays hidden until you approve it.`;
  const adminUrl = `${EMAIL_BASE_URL}/admin/jobs`;
  const intro = `${d.companyName} submitted a listing. It stays off the job board until you approve or reject it.`;
  const reason = "You're getting this because you moderate Git City Jobs.";
  const rows = [
    { label: "Listing", value: d.listingTitle },
    { label: "Company", value: d.companyName },
    { label: "Tier", value: tierLabel },
  ];

  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("New listing to review"), paragraph(intro), detailRows(rows), button("Review in admin", adminUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: ["New listing to review", "", intro, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", `Review in admin: ${adminUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent to the admin when a listing is submitted or resubmitted for review. */
export async function sendJobPendingReviewEmail(listingTitle: string, companyName: string, tier: string, listingId: string) {
  const adminEmail = await getAdminNotificationEmail();
  if (!adminEmail) return;
  const { subject, html, text } = renderJobPendingReviewEmail({ listingTitle, companyName, tier, listingId });
  await sendCompanyEmail({ to: adminEmail, subject, html, text, type: "job_pending_review" });
}
