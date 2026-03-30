import { sendNotificationAsync } from "../notifications";
import { buildButton, escapeHtml } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * Notification sent to developers who applied when a job gets filled.
 * Low priority, batches into digest. Skips the hired developer.
 */
export function sendJobFilledNotification(
  devId: number,
  listingTitle: string,
  companyName: string,
) {
  sendNotificationAsync({
    type: "job_filled",
    category: "jobs_updates",
    developerId: devId,
    dedupKey: `job_filled:${devId}:${listingTitle}`,
    title: `Position filled: ${listingTitle}`,
    body: `The ${listingTitle} role at ${companyName} has been filled.`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#999999; letter-spacing:1px; text-transform:uppercase;">Position update</p>
      <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">Position filled</h1>
      <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
        The <strong>${escapeHtml(listingTitle)}</strong> role at <strong>${escapeHtml(companyName)}</strong> has been filled.
      </p>
      <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">
        Keep exploring! There are more opportunities waiting for you.
      </p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 24px;" />
      ${buildButton("Browse Jobs", `${BASE_URL}/jobs`)}
    `,
    actionUrl: `${BASE_URL}/jobs`,
    priority: "low",
    channels: ["email"],
    batchKey: `job_updates:${devId}`,
    batchWindowMinutes: 60,
    batchEventData: { listing: listingTitle, company: companyName, type: "filled" },
  });
}
