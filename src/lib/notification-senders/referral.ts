import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export function sendReferralJoinedNotification(
  referrerId: number,
  referrerLogin: string,
  referredLogin: string,
  referredId: number,
) {
  sendNotificationAsync({
    type: "referral_joined",
    category: "social",
    developerId: referrerId,
    dedupKey: `referral:${referrerId}:${referredId}`,
    title: `Your referral @${referredLogin} just joined Git City!`,
    body: `@${referredLogin} joined Git City through your referral link.`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Referral joined</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">@${referredLogin} is in Git City!</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;">They just claimed their building through your referral link. Keep sharing to unlock referral achievements!</p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("Visit Their Building", `${BASE_URL}/?user=${referredLogin}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${referredLogin}`,
    priority: "normal",
    channels: ["email"],
  });
}
