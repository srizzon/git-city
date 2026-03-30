import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * Notification sent to developers who signed up for job notifications
 * when the first jobs become available.
 */
export function sendJobNotifySignupFulfilled(
  devId: number,
  jobCount: number,
) {
  sendNotificationAsync({
    type: "job_notify_fulfilled",
    category: "transactional",
    developerId: devId,
    dedupKey: `job_notify_fulfilled:${devId}`,
    title: `Jobs are here!`,
    body: `${jobCount} job${jobCount > 1 ? "s" : ""} just landed on Git City. You asked to be notified.`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">You asked, we delivered</p>
      <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">Jobs are here!</h1>
      <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
        ${jobCount} job listing${jobCount > 1 ? "s are" : " is"} now live on Git City.
        You signed up to be the first to know.
      </p>
      <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">
        Create a career profile to get matched with the best opportunities and stand out to employers.
      </p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 24px;" />
      ${buildButton("Browse Jobs", `${BASE_URL}/jobs`)}
    `,
    actionUrl: `${BASE_URL}/jobs`,
    priority: "high",
    forceSend: true,
    channels: ["email"],
  });
}
