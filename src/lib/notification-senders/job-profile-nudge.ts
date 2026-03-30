import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * Nudge for developers who applied to jobs but don't have a career profile.
 * Sent once per developer (dedup key prevents repeats).
 */
export function sendJobProfileNudgeNotification(
  devId: number,
  login: string,
  appliedCount: number,
) {
  sendNotificationAsync({
    type: "job_profile_nudge",
    category: "jobs_updates",
    developerId: devId,
    dedupKey: `job_profile_nudge:${devId}`,
    title: "Complete your career profile",
    body: `You applied to ${appliedCount} job${appliedCount > 1 ? "s" : ""} but don't have a career profile yet. Companies can see your profile when reviewing candidates.`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#f59e0b; letter-spacing:1px; text-transform:uppercase;">Stand out to employers</p>
      <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">Complete your career profile</h1>
      <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
        You applied to ${appliedCount} job${appliedCount > 1 ? "s" : ""} but don't have a career profile yet.
        Companies review candidate profiles when making hiring decisions.
      </p>
      <p style="margin:0 0 24px; font-size:14px; color:#555555; line-height:1.6;">
        Add your skills, experience, and preferences to get matched with the right opportunities.
      </p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 24px;" />
      ${buildButton("Create Profile", `${BASE_URL}/hire/edit`)}
    `,
    actionUrl: `${BASE_URL}/hire/edit`,
    priority: "normal",
    channels: ["email"],
  });
}
