import { getResend } from "@/lib/resend";
import { wrapInBaseTemplate, buildButton, buildStatsTable, escapeHtml } from "@/lib/email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";
const FROM = "Git City Jobs <noreply@thegitcity.com>";

/**
 * Email sent when a job listing is about to expire (5 days warning).
 */
export async function sendJobExpiringEmail(
  email: string,
  listingTitle: string,
  daysLeft: number,
  stats: { views: number; applies: number },
) {
  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#f59e0b; letter-spacing:1px; text-transform:uppercase;">Expiring soon</p>
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(listingTitle)}</h1>
    <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
      Your listing expires in <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong>.
      Here's how it performed so far:
    </p>
    ${buildStatsTable([
      { label: "Views", value: stats.views.toLocaleString() },
      { label: "Applications", value: stats.applies.toLocaleString() },
    ])}
    <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">
      After expiration, your listing will no longer appear in search results.
      You can repost it anytime from your dashboard.
    </p>
    ${buildButton("View Dashboard", `${BASE_URL}/jobs/dashboard`)}
  `;

  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Your listing expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}: ${listingTitle}`,
    html: wrapInBaseTemplate(bodyHtml),
  });
}

/**
 * Email sent when a job listing has expired, with final stats.
 */
export async function sendJobExpiredEmail(
  email: string,
  listingTitle: string,
  stats: { views: number; applies: number; hires: number },
) {
  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#999999; letter-spacing:1px; text-transform:uppercase;">Listing ended</p>
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(listingTitle)}</h1>
    <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
      Your listing has expired. Here are the final numbers:
    </p>
    ${buildStatsTable([
      { label: "Views", value: stats.views.toLocaleString() },
      { label: "Applications", value: stats.applies.toLocaleString() },
      { label: "Hires", value: stats.hires.toLocaleString() },
    ])}
    <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">
      Still hiring? Repost your listing to reach more developers.
    </p>
    ${buildButton("Repost Listing", `${BASE_URL}/jobs/dashboard`)}
  `;

  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Final results for: ${listingTitle}`,
    html: wrapInBaseTemplate(bodyHtml),
  });
}
