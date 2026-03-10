import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export function sendStreakBrokenNotification(
  devId: number,
  login: string,
  previousStreak: number,
  date: string,
) {
  sendNotificationAsync({
    type: "streak_broken",
    category: "streak_reminders",
    developerId: devId,
    dedupKey: `streak_broken:${devId}:${date}`,
    title: `Your ${previousStreak}-day streak ended. Start fresh!`,
    body: `Your ${previousStreak}-day streak has ended. Check in today to start a new one!`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#cc4444; letter-spacing:1px; text-transform:uppercase;">Streak ended</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">Your ${previousStreak}-day streak is over.</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;">Every great streak starts with day 1. Check in now to begin again.</p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("Start Fresh", BASE_URL)}
    `,
    actionUrl: BASE_URL,
    priority: "high",
    channels: ["email"],
  });
}
