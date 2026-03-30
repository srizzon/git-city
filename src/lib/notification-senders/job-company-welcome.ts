import { getResend } from "@/lib/resend";
import { wrapInBaseTemplate, buildButton, escapeHtml } from "@/lib/email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";
const FROM = "Git City Jobs <noreply@thegitcity.com>";

/**
 * Welcome email sent to a company when an admin links their advertiser account.
 * Sent directly via Resend (advertiser != developer, so no notification engine).
 */
export async function sendJobCompanyWelcomeEmail(
  email: string,
  companyName: string,
) {
  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Welcome aboard</p>
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">Welcome to Git City Jobs</h1>
    <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
      Hi <strong>${escapeHtml(companyName)}</strong>, your company account is now set up on Git City Jobs.
    </p>
    <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">
      You can post job listings to reach thousands of developers who build in public on Git City. Manage your listings, review applicants, and track results from your dashboard.
    </p>
    <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 24px;" />
    <p style="margin:0 0 8px; font-size:13px; color:#999999;">Here's how to get started:</p>
    <ul style="margin:0 0 28px; padding-left:20px; font-size:14px; color:#555555; line-height:1.8;">
      <li>Post your first job listing from the dashboard</li>
      <li>Candidates apply with their Git City profiles</li>
      <li>Review applications and reach out directly</li>
    </ul>
    ${buildButton("Go to Dashboard", `${BASE_URL}/jobs/dashboard`)}
    <p style="margin:20px 0 0; font-size:12px; color:#999999;">
      Ready to hire? <a href="${BASE_URL}/jobs/dashboard/new" style="color:#5a8a00; text-decoration:underline;">Post your first job</a>.
    </p>
  `;

  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Welcome to Git City Jobs",
    html: wrapInBaseTemplate(bodyHtml),
  });
}
