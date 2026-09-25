import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, heading, heroImage, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { ITEM_NAMES } from "../zones";
import { itemKind, possessive } from "./purchase";

export interface GiftReceivedEmailData {
  giverLogin: string;
  receiverLogin: string;
  itemId: string;
}

function giftReceivedHeader(d: GiftReceivedEmailData) {
  const itemName = ITEM_NAMES[d.itemId] ?? d.itemId;
  return {
    itemName,
    subject: `@${d.giverLogin} sent you a gift: ${itemName}`,
    preheader: "It's in your inventory. Say thanks with kudos.",
  };
}

export function renderGiftReceivedEmail(d: GiftReceivedEmailData, links: EmailLinks) {
  const { itemName, subject, preheader } = giftReceivedHeader(d);
  const kind = itemKind(d.itemId);
  const customizeUrl = trackedUrl(`/shop/${encodeURIComponent(d.receiverLogin)}/customize`, "gift_received");
  const giverUrl = trackedUrl(`/?user=${encodeURIComponent(d.giverLogin)}`, "gift_received");
  const intro = {
    freeze: `They bought you a Streak Freeze. Miss a day of check-ins and it's used up, and your streak survives.`,
    raid: `They bought you ${itemName}. It's in your inventory, ready for your next raid.`,
    cosmetic: `They bought you ${itemName}. It's in your inventory: equip it from Customize to show it on your building.`,
  }[kind];
  const thanks = `Want to say thanks? Stop by ${possessive(d.giverLogin)} building and leave them kudos.`;
  const cta = kind === "cosmetic" ? { text: "Open Customize", url: customizeUrl } : { text: `Visit @${d.giverLogin}`, url: giverUrl };
  const reason = `You're getting this because @${d.giverLogin} sent you a gift on Git City.`;

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({
      src: `${EMAIL_BASE_URL}/dev/${encodeURIComponent(d.giverLogin)}/opengraph-image`,
      href: giverUrl,
      alt: `@${d.giverLogin}'s building in Git City`,
    }),
    body: [
      heading("", `@${d.giverLogin}`, " sent you a gift"),
      paragraph(intro),
      paragraph(thanks),
      button(cta.text, cta.url),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [`@${d.giverLogin} sent you a gift`, "", intro, "", thanks, "", `${cta.text}: ${cta.url}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

export function sendGiftReceivedNotification(
  receiverId: number,
  giverLogin: string,
  receiverLogin: string,
  purchaseId: string | number,
  itemId: string,
) {
  const data: GiftReceivedEmailData = { giverLogin, receiverLogin, itemId };
  const { subject, preheader } = giftReceivedHeader(data);

  sendNotificationAsync({
    type: "gift_received",
    category: "social",
    developerId: receiverId,
    dedupKey: `gift_received:${purchaseId}`,
    title: subject,
    body: preheader,
    render: (links) => renderGiftReceivedEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/shop/${receiverLogin}/customize`,
    priority: "high",
    channels: ["email"],
  });
}
