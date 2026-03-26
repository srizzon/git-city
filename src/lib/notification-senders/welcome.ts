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
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Welcome</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">Your building is live${rankText ? ` &mdash; #${rank!.toLocaleString()}` : ""}!</h1>
      <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">Git City is a living city built from GitHub contributions. Here's how to get started:</p>
      <ul style="margin:0 0 28px; padding-left:20px; font-size:15px; color:#555555; line-height:1.8;">
        <li>Check in daily to build your streak</li>
        <li>Customize your building in the shop</li>
        <li>Give kudos to other developers</li>
        <li>Invite friends with your referral link</li>
      </ul>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("Visit Your Building", `${BASE_URL}/?user=${login}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${login}`,
    priority: "high",
    channels: ["email"],
  });
}
