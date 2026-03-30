import { getResend } from "@/lib/resend";
import { wrapInBaseTemplate, buildButton, escapeHtml } from "@/lib/email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";
const FROM = "Git City Jobs <noreply@thegitcity.com>";

/**
 * Email sent to the company when their job listing is approved by admin.
 * Sent directly via Resend (not through notification engine, since advertiser != developer).
 */
export async function sendJobApprovedEmail(
  email: string,
  listingTitle: string,
  listingId: string,
  expiresAt: string,
) {
  const expiresDate = new Date(expiresAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Your listing is live</p>
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(listingTitle)}</h1>
    <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
      Your job listing has been approved and is now visible to developers on Git City.
    </p>
    <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">
      It will remain active until <strong>${expiresDate}</strong>. You'll receive a reminder before it expires.
    </p>
    <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 24px;" />
    <p style="margin:0 0 8px; font-size:13px; color:#999999;">What happens next:</p>
    <ul style="margin:0 0 28px; padding-left:20px; font-size:14px; color:#555555; line-height:1.8;">
      <li>You'll be notified when developers apply</li>
      <li>Review candidates and their profiles in your dashboard</li>
      <li>Mark candidates as hired to track your results</li>
    </ul>
    ${buildButton("View Dashboard", `${BASE_URL}/jobs/dashboard`)}
    <p style="margin:20px 0 0; font-size:12px; color:#999999;">
      You can also <a href="${BASE_URL}/jobs/${listingId}" style="color:#5a8a00; text-decoration:underline;">view your listing</a> as candidates see it.
    </p>
  `;

  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Your listing is live: ${listingTitle}`,
    html: wrapInBaseTemplate(bodyHtml),
  });
}
