import { sendNotificationAsync } from "../notifications";
import { buildButton, escapeHtml } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * Notification sent to a developer when a company marks them as hired.
 * Uses the notification engine (developer has notification preferences).
 */
export function sendJobHiredNotification(
  devId: number,
  login: string,
  companyName: string,
  listingTitle: string,
) {
  sendNotificationAsync({
    type: "job_hired",
    category: "transactional",
    developerId: devId,
    dedupKey: `job_hired:${devId}:${listingTitle}`,
    title: `You got hired!`,
    body: `${companyName} confirmed your hire for ${listingTitle}. Congratulations!`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Congratulations!</p>
      <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">You got hired!</h1>
      <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
        <strong>${escapeHtml(companyName)}</strong> confirmed your hire for <strong>${escapeHtml(listingTitle)}</strong>.
      </p>
      <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">
        Your "Hired in the City" achievement has been unlocked!
      </p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 24px;" />
      ${buildButton("View Your Profile", `${BASE_URL}/hire/${login}`)}
    `,
    actionUrl: `${BASE_URL}/hire/${login}`,
    priority: "high",
    forceSend: true,
    channels: ["email"],
  });
}
