import { sendNotificationAsync } from "../notifications";
import { buildButton, escapeHtml } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * Confirmation email sent to the developer after they apply to a job.
 */
export function sendJobApplicationConfirmedNotification(
  devId: number,
  login: string,
  listingTitle: string,
  companyName: string,
  listingId: string,
  hasProfile: boolean,
) {
  const profileNudge = hasProfile
    ? ""
    : `
      <div style="background-color:#fef3c7; border-left:4px solid #f59e0b; padding:12px 16px; margin:0 0 24px; border-radius:0 4px 4px 0;">
        <p style="margin:0; font-size:13px; color:#92400e; font-family:Helvetica,Arial,sans-serif;">
          <strong>Tip:</strong> Companies can see your career profile. <a href="${BASE_URL}/hire/edit" style="color:#92400e; text-decoration:underline;">Complete it</a> to stand out.
        </p>
      </div>`;

  sendNotificationAsync({
    type: "job_application_confirmed",
    category: "transactional",
    developerId: devId,
    dedupKey: `job_applied:${devId}:${listingId}`,
    title: `Application sent: ${listingTitle}`,
    body: `Your application to ${listingTitle} at ${companyName} was sent. The company will be notified.`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Application sent</p>
      <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(listingTitle)}</h1>
      <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
        Your application to <strong>${escapeHtml(companyName)}</strong> was sent. The company will be notified about your profile.
      </p>
      ${profileNudge}
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 24px;" />
      ${buildButton("View My Applications", `${BASE_URL}/jobs/my-applications`)}
    `,
    actionUrl: `${BASE_URL}/jobs/my-applications`,
    priority: "high",
    forceSend: true,
    channels: ["email"],
  });
}
