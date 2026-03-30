import { sendCompanyEmail } from "@/lib/jobs/send-company-email";
import { buildButton, escapeHtml } from "@/lib/email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

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

  await sendCompanyEmail({
    to: email,
    subject: `Listing not approved: ${listingTitle}`,
    html: bodyHtml,
    text: `Listing not approved: ${listingTitle}\n\nYour job listing was not approved after review.\n\nReason: ${reason}\n\nYou can edit your listing and resubmit it for review from your dashboard.\n\nEdit Listing: ${BASE_URL}/jobs/dashboard\n\nIf you think this was a mistake, reply to this email and we'll take another look.`,
    replyTo: "support@thegitcity.com",
  });
}
