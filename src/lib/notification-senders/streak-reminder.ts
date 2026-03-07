import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export function sendStreakReminderNotification(
  devId: number,
  login: string,
  currentStreak: number,
  hasFreezeAvailable: boolean,
  date: string,
) {
  const freezeNote = hasFreezeAvailable
    ? `<p style="margin:0 0 28px; font-size:13px; color:#999999;">You have a streak freeze available, but don't waste it!</p>`
    : "";

  sendNotificationAsync({
    type: "streak_reminder",
    category: "streak_reminders",
    developerId: devId,
    dedupKey: `streak_reminder:${devId}:${date}`,
    skipIfActive: true,
    title: `Don't lose your ${currentStreak}-day streak!`,
    body: `You haven't checked in today. Don't break your ${currentStreak}-day streak!`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#cc4444; letter-spacing:1px; text-transform:uppercase;">Streak at risk</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">Your ${currentStreak}-day streak ends tonight.</h1>
      <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">You haven't checked in today. Check in before midnight UTC to keep your streak alive.</p>
      ${freezeNote}
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("Check In Now", BASE_URL)}
    `,
    actionUrl: BASE_URL,
    priority: "high",
    channels: ["email"],
  });
}
