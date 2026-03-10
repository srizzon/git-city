import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export function sendDailiesReminderNotification(
  devId: number,
  login: string,
  completedCount: number,
  date: string,
) {
  const remaining = 3 - completedCount;

  sendNotificationAsync({
    type: "dailies_reminder",
    category: "social",
    developerId: devId,
    dedupKey: `dailies_reminder:${devId}:${date}`,
    skipIfActive: true,
    title: `${remaining} daily mission${remaining > 1 ? "s" : ""} left!`,
    body: `You've done ${completedCount}/3 daily missions. Finish them before midnight!`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Daily missions</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${completedCount}/3 done &mdash; ${remaining} to go.</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;">Complete all 3 daily missions before midnight UTC to keep your dailies streak.</p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("Complete Missions", BASE_URL)}
    `,
    actionUrl: BASE_URL,
    priority: "low",
    channels: ["email"],
  });
}
