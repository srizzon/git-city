import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";
import { ITEM_NAMES } from "../zones";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export function sendGiftReceivedNotification(
  receiverId: number,
  giverLogin: string,
  receiverLogin: string,
  purchaseId: string | number,
  itemId: string,
) {
  const itemName = ITEM_NAMES[itemId] ?? itemId;

  sendNotificationAsync({
    type: "gift_received",
    category: "social",
    developerId: receiverId,
    dedupKey: `gift_received:${purchaseId}`,
    title: `@${giverLogin} gifted you ${itemName}!`,
    body: `@${giverLogin} sent you ${itemName}. It's now on your building!`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">You received a gift</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${itemName}</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;"><strong>@${giverLogin}</strong> gifted this to you. It's now equipped on your building!</p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("Check Your Building", `${BASE_URL}/?user=${receiverLogin}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${receiverLogin}`,
    priority: "high",
    channels: ["email"],
  });
}
