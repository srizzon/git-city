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
      <p style="color: #c8e64a; font-size: 16px;">Your referral joined!</p>
      <p style="color: #e0d8cc;">
        <strong>@${referredLogin}</strong> just claimed their building in Git City
        through your referral link.
      </p>
      <p style="color: #666; font-size: 13px;">
        Keep sharing your link to unlock referral achievements!
      </p>
      ${buildButton("Visit Their Building", `${BASE_URL}/?user=${referredLogin}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${referredLogin}`,
    priority: "normal",
    channels: ["email"],
  });
}
