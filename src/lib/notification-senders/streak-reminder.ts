import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export function sendStreakReminderNotification(
  devId: number,
  login: string,
  currentStreak: number,
  hasFreezeAvailable: boolean,
  date: string, // YYYY-MM-DD
) {
  const freezeNote = hasFreezeAvailable
    ? `<p style="color: #666; font-size: 13px;">You have a streak freeze, but don't waste it!</p>`
    : "";

  sendNotificationAsync({
    type: "streak_reminder",
    category: "streak_reminders",
    developerId: devId,
    dedupKey: `streak_reminder:${devId}:${date}`,
    skipIfActive: true, // Don't remind if they're online
    title: `Don't lose your ${currentStreak}-day streak!`,
    body: `You haven't checked in today. Don't break your ${currentStreak}-day streak!`,
    html: `
      <div style="text-align: center;">
        <p style="color: #ff6b6b; font-size: 20px; font-weight: bold;">
          Your ${currentStreak}-day streak is at risk!
        </p>
        <p style="color: #e0d8cc;">
          You haven't checked in today. Check in before midnight to keep your streak alive.
        </p>
        ${freezeNote}
      </div>
      ${buildButton("Check In Now", BASE_URL)}
    `,
    actionUrl: BASE_URL,
    priority: "high", // Time-sensitive, never batch
    channels: ["email"],
  });
}
