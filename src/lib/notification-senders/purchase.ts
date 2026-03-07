import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";
import { ITEM_NAMES } from "../zones";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export function sendPurchaseNotification(
  devId: number,
  login: string,
  purchaseId: string | number,
  itemId: string,
) {
  const itemName = ITEM_NAMES[itemId] ?? itemId;

  sendNotificationAsync({
    type: "purchase_confirmation",
    category: "transactional",
    developerId: devId,
    dedupKey: `purchase:${purchaseId}`,
    forceSend: true,
    title: `Purchase confirmed: ${itemName}`,
    body: `Your purchase of ${itemName} is confirmed and equipped on your building.`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Purchase confirmed</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${itemName}</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;">Your item is now available and equipped on your building in Git City.</p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("View Your Building", `${BASE_URL}/?user=${login}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${login}`,
    priority: "high",
    channels: ["email"],
  });
}

export function sendGiftSentNotification(
  buyerId: number,
  buyerLogin: string,
  receiverLogin: string,
  purchaseId: string | number,
  itemId: string,
) {
  const itemName = ITEM_NAMES[itemId] ?? itemId;

  sendNotificationAsync({
    type: "gift_sent",
    category: "transactional",
    developerId: buyerId,
    dedupKey: `gift_sent:${purchaseId}`,
    forceSend: true,
    title: `Gift sent to @${receiverLogin}`,
    body: `You gifted ${itemName} to @${receiverLogin}.`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Gift sent</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">@${receiverLogin} received ${itemName}</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;">Your gift is now equipped on their building.</p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("View Their Building", `${BASE_URL}/?user=${receiverLogin}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${receiverLogin}`,
    priority: "high",
    channels: ["email"],
  });
}
