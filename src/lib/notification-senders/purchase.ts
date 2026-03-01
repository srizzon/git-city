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
    forceSend: true, // Receipts always send
    title: `Purchase confirmed: ${itemName}`,
    body: `Your purchase of ${itemName} is confirmed and equipped on your building.`,
    html: `
      <p style="color: #e0d8cc; font-size: 16px;">Purchase confirmed!</p>
      <p style="color: #e0d8cc;">
        <strong style="color: #c8e64a;">${itemName}</strong> is now available on your building.
      </p>
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
      <p style="color: #e0d8cc; font-size: 16px;">Gift sent!</p>
      <p style="color: #e0d8cc;">
        You gifted <strong style="color: #c8e64a;">${itemName}</strong> to
        <strong>@${receiverLogin}</strong>.
      </p>
      ${buildButton("View Their Building", `${BASE_URL}/?user=${receiverLogin}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${receiverLogin}`,
    priority: "high",
    channels: ["email"],
  });
}
