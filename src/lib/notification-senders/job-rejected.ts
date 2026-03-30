import { getResend } from "@/lib/resend";
import { wrapInBaseTemplate, buildButton, escapeHtml } from "@/lib/email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";
const FROM = "Git City Jobs <noreply@thegitcity.com>";

/**
 * Email sent to the company when their job listing is rejected by admin.
 */
export async function sendJobRejectedEmail(
  email: string,
  listingTitle: string,
  reason: string,
) {
  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#ef4444; letter-spacing:1px; text-transform:uppercase;">Listing not approved</p>
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(listingTitle)}</h1>
    <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
      Your job listing was not approved after review.
    </p>
    <div style="background-color:#fef2f2; border-left:4px solid #ef4444; padding:16px; margin:0 0 24px; border-radius:0 4px 4px 0;">
      <p style="margin:0; font-size:14px; color:#555555; line-height:1.6;">
        <strong style="color:#111111;">Reason:</strong> ${escapeHtml(reason)}
      </p>
    </div>
    <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">
      You can edit your listing and resubmit it for review from your dashboard.
    </p>
    ${buildButton("Edit Listing", `${BASE_URL}/jobs/dashboard`)}
    <p style="margin:20px 0 0; font-size:12px; color:#999999;">
      If you think this was a mistake, reply to this email and we'll take another look.
    </p>
  `;

  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    replyTo: "support@thegitcity.com",
    subject: `Listing not approved: ${listingTitle}`,
    html: wrapInBaseTemplate(bodyHtml),
  });
}
