import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";
import { TIER_EMOJI } from "../achievement-tiers";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

interface EmblemInfo {
  id: string;
  name: string;
  tier: string;
}

/**
 * Notify a developer when they earn a notable (gold/diamond) emblem.
 * Clone of the achievement sender — same batching + email shape, emblem wording.
 */
export function sendEmblemNotification(
  devId: number,
  login: string,
  emblems: EmblemInfo[],
) {
  const notable = emblems.filter((e) => e.tier === "gold" || e.tier === "diamond");
  if (notable.length === 0) return;

  const dedupKey = notable.length === 1
    ? `emblem:${devId}:${notable[0].id}`
    : `emblem_batch:${devId}:${notable.map((e) => e.id).sort().join(",")}`;

  const isSingle = notable.length === 1;
  const first = notable[0];

  const title = isSingle
    ? `Emblem Earned: ${first.name} (${first.tier})`
    : `${notable.length} Emblems Earned!`;

  const body = isSingle
    ? `You earned ${first.name} (${first.tier}).`
    : `You earned ${notable.length} new emblems: ${notable.map((e) => e.name).join(", ")}.`;

  const emblemListHtml = notable
    .map((e) => {
      const emoji = TIER_EMOJI[e.tier] ?? "";
      return `<li style="margin-bottom:8px; font-size:15px; color:#555555;">${emoji} <strong style="color:#111111;">${e.name}</strong> <span style="color:#999;">(${e.tier})</span></li>`;
    })
    .join("");

  sendNotificationAsync({
    type: "emblem_earned",
    category: "social",
    developerId: devId,
    dedupKey,
    title,
    body,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Emblem${isSingle ? "" : "s"} earned</p>
      <h1 style="margin:0 0 20px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${isSingle ? first.name : `${notable.length} new emblems`}</h1>
      <ul style="margin:0 0 28px; padding-left:20px; list-style:none;">
        ${emblemListHtml}
      </ul>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("View Profile", `${BASE_URL}/?user=${login}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${login}`,
    priority: "low",
    channels: ["email"],
    batchKey: `emblems:${devId}`,
    batchWindowMinutes: 30,
    batchEventData: {
      emblems: notable.map((e) => ({ id: e.id, name: e.name, tier: e.tier })),
    },
  });
}
