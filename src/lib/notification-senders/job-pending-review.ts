import { getResend } from "@/lib/resend";
import { wrapInBaseTemplate, buildButton, escapeHtml } from "@/lib/email-template";
import { getAdminNotificationEmail } from "@/lib/jobs/admin-email";

const FROM = "Git City Jobs <noreply@thegitcity.com>";
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * Email sent to admin when a new job listing needs review.
 * Uses direct Resend send (admin is not a developer in the notification engine).
 */
export async function sendJobPendingReviewEmail(
  listingTitle: string,
  companyName: string,
  tier: string,
  listingId: string,
) {
  const adminEmail = await getAdminNotificationEmail();
  if (!adminEmail) return;

  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#f59e0b; letter-spacing:1px; text-transform:uppercase;">Needs review</p>
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(listingTitle)}</h1>
    <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
      <strong>${escapeHtml(companyName)}</strong> submitted a new <strong>${escapeHtml(tier)}</strong> job listing.
    </p>
    ${buildButton("Review in Admin", `${BASE_URL}/admin/jobs`)}
  `;

  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: adminEmail,
    subject: `[Review] New job listing: ${listingTitle} (${companyName})`,
    html: wrapInBaseTemplate(bodyHtml),
  });
}
