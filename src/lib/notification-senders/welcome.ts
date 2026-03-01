import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export function sendWelcomeNotification(devId: number, login: string, rank?: number) {
  const rankText = rank ? `You're developer #${rank.toLocaleString()}.` : "";

  sendNotificationAsync({
    type: "welcome",
    category: "transactional",
    developerId: devId,
    dedupKey: `welcome:${devId}`,
    title: `Welcome to Git City, @${login}!`,
    body: `Your building is live in Git City. ${rankText} Check in daily to grow your streak and unlock items.`,
    html: `
      <p style="color: #e0d8cc; font-size: 16px;">Your building is live in Git City! ${rankText}</p>
      <p style="color: #e0d8cc;">Here's how to get started:</p>
      <ul style="color: #e0d8cc; padding-left: 20px;">
        <li style="margin-bottom: 8px;">Check in daily to build your streak</li>
        <li style="margin-bottom: 8px;">Customize your building in the shop</li>
        <li style="margin-bottom: 8px;">Give kudos to other developers</li>
        <li style="margin-bottom: 8px;">Invite friends with your referral link</li>
      </ul>
      ${buildButton("Visit Your Building", `${BASE_URL}/?user=${login}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${login}`,
    priority: "high",
    channels: ["email"],
  });
}
