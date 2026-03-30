import { sendCompanyEmail } from "@/lib/jobs/send-company-email";
import { buildButton, escapeHtml } from "@/lib/email-template";
import { getAdminNotificationEmail } from "@/lib/jobs/admin-email";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * Email sent to the company when their listing is auto-paused due to reports.
 */
export async function sendJobReportedEmail(
  companyEmail: string,
  listingTitle: string,
) {
  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#f59e0b; letter-spacing:1px; text-transform:uppercase;">Listing paused for review</p>
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(listingTitle)}</h1>
    <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
      Your listing has been temporarily paused after receiving multiple reports from the community.
    </p>
    <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">
      Our team will review it shortly. If everything checks out, it will be reactivated automatically.
      If changes are needed, we'll reach out with details.
    </p>
    ${buildButton("View Dashboard", `${BASE_URL}/jobs/dashboard`)}
    <p style="margin:20px 0 0; font-size:12px; color:#999999;">
      If you think this was a mistake, reply to this email.
    </p>
  `;

  await sendCompanyEmail({
    to: companyEmail,
    subject: `Your listing was paused for review: ${listingTitle}`,
    html: bodyHtml,
    text: `Your listing was paused for review: ${listingTitle}\n\nYour listing has been temporarily paused after receiving multiple reports from the community.\n\nOur team will review it shortly. If everything checks out, it will be reactivated automatically. If changes are needed, we'll reach out with details.\n\nView Dashboard: ${BASE_URL}/jobs/dashboard\n\nIf you think this was a mistake, reply to this email.`,
    replyTo: "support@thegitcity.com",
  });
}

/**
 * Email sent to admin when a listing is auto-paused due to reports.
 */
export async function sendJobReportedAdminEmail(
  listingTitle: string,
  companyName: string,
  reportCount: number,
  listingId: string,
) {
  const adminEmail = await getAdminNotificationEmail();
  if (!adminEmail) return;

  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#ef4444; letter-spacing:1px; text-transform:uppercase;">Moderation alert</p>
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(listingTitle)}</h1>
    <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
      Listing by <strong>${escapeHtml(companyName)}</strong> was auto-paused after <strong>${reportCount} reports</strong>.
    </p>
    ${buildButton("Review in Admin", `${BASE_URL}/admin/jobs`)}
  `;

  await sendCompanyEmail({
    to: adminEmail,
    subject: `[Moderation] Job auto-paused: ${listingTitle} (${reportCount} reports)`,
    html: bodyHtml,
    text: `[Moderation] Job auto-paused: ${listingTitle} (${reportCount} reports)\n\nListing by ${companyName} was auto-paused after ${reportCount} reports.\n\nReview in Admin: ${BASE_URL}/admin/jobs`,
  });
}
