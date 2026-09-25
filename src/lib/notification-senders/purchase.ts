import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, detailRows, heading, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { ITEM_NAMES } from "../zones";

/** "@alice's", "@james'" */
export const possessive = (login: string) => `@${login}${login.endsWith("s") ? "'" : "'s"}`;

/** What the buyer paid: cents in a real currency (usd, brl) or a pixel amount (currency "PX"). */
export interface PurchasePrice {
  amountCents: number;
  currency: string;
}

/** The price off a `purchases` row, or null when the columns are missing. */
export function paidPrice(row: { amount_cents?: number | null; currency?: string | null }): PurchasePrice | null {
  return typeof row.amount_cents === "number" && row.currency ? { amountCents: row.amount_cents, currency: row.currency } : null;
}

export function formatPrice(p: PurchasePrice): string {
  if (p.currency.toUpperCase() === "PX") return `${p.amountCents.toLocaleString("en-US")} pixels`;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency.toUpperCase() }).format(p.amountCents / 100);
  } catch {
    return `${(p.amountCents / 100).toFixed(2)} ${p.currency.toUpperCase()}`;
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function receiptRows(itemName: string, price: PurchasePrice | null, date: Date, giftTo?: string) {
  return [
    { label: "Item", value: itemName },
    ...(giftTo ? [{ label: "Gift for", value: `@${giftTo}` }] : []),
    ...(price ? [{ label: "Paid", value: formatPrice(price) }] : []),
    { label: "Date", value: formatDate(date) },
  ];
}

// ─── Purchase confirmation ──────────────────────────────────

export interface PurchaseEmailData {
  login: string;
  itemId: string;
  price: PurchasePrice | null;
  date: Date;
}

export type ItemKind = "freeze" | "raid" | "cosmetic";

/** Streak freezes and raid gear don't go on the building, so their copy and CTA differ. */
export function itemKind(itemId: string): ItemKind {
  if (itemId === "streak_freeze") return "freeze";
  if (itemId.startsWith("raid_") || itemId.startsWith("tag_")) return "raid";
  return "cosmetic";
}

const PREHEADERS: Record<ItemKind, string> = {
  freeze: "It's ready to save your streak. Here's your receipt.",
  raid: "It's ready for your next raid. Here's your receipt.",
  cosmetic: "It's in your inventory. Here's your receipt.",
};

function purchaseHeader(d: PurchaseEmailData) {
  const itemName = ITEM_NAMES[d.itemId] ?? d.itemId;
  return {
    itemName,
    subject: `Purchase confirmed: ${itemName}`,
    preheader: PREHEADERS[itemKind(d.itemId)],
  };
}

export function renderPurchaseEmail(d: PurchaseEmailData, links: EmailLinks) {
  const { itemName, subject, preheader } = purchaseHeader(d);
  const kind = itemKind(d.itemId);
  const intro = {
    freeze: "Thanks for your purchase. Your streak freeze is ready: miss a day of check-ins and it's used up, and your streak survives.",
    raid: `Thanks for your purchase. ${itemName} is in your inventory, ready for your next raid.`,
    cosmetic: `Thanks for your purchase. ${itemName} is in your inventory. Equip it from Customize to show it on your building.`,
  }[kind];
  const cta =
    kind === "cosmetic"
      ? { text: "Open Customize", url: trackedUrl(`/shop/${encodeURIComponent(d.login)}/customize`, "purchase") }
      : { text: "Visit your building", url: trackedUrl(`/?user=${encodeURIComponent(d.login)}`, "purchase") };
  const rows = receiptRows(itemName, d.price, d.date);
  const reason = "You're getting this receipt because you bought an item on Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("Purchase confirmed"), paragraph(intro), detailRows(rows), button(cta.text, cta.url)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: ["Purchase confirmed", "", intro, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", `${cta.text}: ${cta.url}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

export function sendPurchaseNotification(
  devId: number,
  login: string,
  purchaseId: string | number,
  itemId: string,
  price: PurchasePrice | null = null,
) {
  const data: PurchaseEmailData = { login, itemId, price, date: new Date() };
  const { subject, preheader } = purchaseHeader(data);

  sendNotificationAsync({
    type: "purchase_confirmation",
    category: "transactional",
    developerId: devId,
    dedupKey: `purchase:${purchaseId}`,
    forceSend: true,
    title: subject,
    body: preheader,
    render: (links) => renderPurchaseEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/shop/${login}/customize`,
    priority: "high",
    channels: ["email"],
  });
}

// ─── Gift sent (receipt to the buyer) ───────────────────────

export interface GiftSentEmailData {
  receiverLogin: string;
  itemId: string;
  price: PurchasePrice | null;
  date: Date;
}

function giftSentHeader(d: GiftSentEmailData) {
  const itemName = ITEM_NAMES[d.itemId] ?? d.itemId;
  return {
    itemName,
    subject: `Gift sent to @${d.receiverLogin}: ${itemName}`,
    preheader: `We let @${d.receiverLogin} know. Here's your receipt.`,
  };
}

export function renderGiftSentEmail(d: GiftSentEmailData, links: EmailLinks) {
  const { itemName, subject, preheader } = giftSentHeader(d);
  const buildingUrl = trackedUrl(`/?user=${encodeURIComponent(d.receiverLogin)}`, "gift_sent");
  const intro = `${itemName} is now in ${possessive(d.receiverLogin)} inventory, and we let them know it came from you.`;
  const rows = receiptRows(itemName, d.price, d.date, d.receiverLogin);
  const reason = `You're getting this receipt because you sent a gift to @${d.receiverLogin} on Git City.`;

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("Gift sent to", `@${d.receiverLogin}`),
      paragraph(intro),
      detailRows(rows),
      button(`Visit @${d.receiverLogin}`, buildingUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [`Gift sent to @${d.receiverLogin}`, "", intro, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", `Visit @${d.receiverLogin}: ${buildingUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

export function sendGiftSentNotification(
  buyerId: number,
  buyerLogin: string,
  receiverLogin: string,
  purchaseId: string | number,
  itemId: string,
  price: PurchasePrice | null = null,
) {
  const data: GiftSentEmailData = { receiverLogin, itemId, price, date: new Date() };
  const { subject, preheader } = giftSentHeader(data);

  sendNotificationAsync({
    type: "gift_sent",
    category: "transactional",
    developerId: buyerId,
    dedupKey: `gift_sent:${purchaseId}`,
    forceSend: true,
    title: subject,
    body: preheader,
    render: (links) => renderGiftSentEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/?user=${receiverLogin}`,
    priority: "high",
    channels: ["email"],
  });
}
