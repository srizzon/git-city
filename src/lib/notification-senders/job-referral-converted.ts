import { sendNotificationAsync } from "../notifications";
import { buildButton, escapeHtml } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * Notification sent to a developer when their referral code is used
 * and the referred company posts a job.
 */
export function sendJobReferralConvertedNotification(
  devId: number,
  login: string,
  companyName: string,
) {
  sendNotificationAsync({
    type: "job_referral_converted",
    category: "jobs_updates",
    developerId: devId,
    dedupKey: `job_referral:${devId}:${companyName}`,
    title: `Your referral posted a job!`,
    body: `${companyName} posted a job through your referral. You earned 1,000 XP!`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Referral converted</p>
      <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">Your referral posted a job!</h1>
      <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
        <strong>${escapeHtml(companyName)}</strong> just posted a job listing through your referral link.
        You've earned <strong>1,000 XP</strong> and the "City Recruiter" achievement!
      </p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 24px;" />
      ${buildButton("View Your Profile", `${BASE_URL}/?user=${login}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${login}`,
    priority: "high",
    channels: ["email"],
  });
}
