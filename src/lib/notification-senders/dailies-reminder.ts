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
      <div style="text-align: center;">
        <p style="color: #c8e64a; font-size: 18px; font-weight: bold;">
          ${completedCount}/3 Daily Missions Done
        </p>
        <p style="color: #e0d8cc;">
          Just ${remaining} more to go! Complete all 3 before midnight UTC to keep your dailies streak.
        </p>
      </div>
      ${buildButton("Complete Missions", BASE_URL)}
    `,
    actionUrl: BASE_URL,
    priority: "low",
    channels: ["email"],
  });
}
