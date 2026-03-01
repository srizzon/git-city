import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export function sendStreakBrokenNotification(
  devId: number,
  login: string,
  previousStreak: number,
  date: string, // YYYY-MM-DD
) {
  sendNotificationAsync({
    type: "streak_broken",
    category: "streak_reminders",
    developerId: devId,
    dedupKey: `streak_broken:${devId}:${date}`,
    title: `Your ${previousStreak}-day streak ended. Start fresh!`,
    body: `Your ${previousStreak}-day streak has ended. Check in today to start a new one!`,
    html: `
      <div style="text-align: center;">
        <p style="color: #e0d8cc; font-size: 16px;">
          Your <strong style="color: #ff6b6b;">${previousStreak}-day</strong> streak ended.
        </p>
        <p style="color: #e0d8cc;">
          Every streak starts with day 1. Check in now to begin again!
        </p>
      </div>
      ${buildButton("Start Fresh", BASE_URL)}
    `,
    actionUrl: BASE_URL,
    priority: "high",
    channels: ["email"],
  });
}
