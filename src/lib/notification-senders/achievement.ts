import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";
import { TIER_EMOJI } from "../achievements";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

interface AchievementInfo {
  id: string;
  name: string;
  tier: string;
}

export function sendAchievementNotification(
  devId: number,
  login: string,
  achievements: AchievementInfo[],
) {
  const notable = achievements.filter((a) => a.tier === "gold" || a.tier === "diamond");
  if (notable.length === 0) return;

  const dedupKey = notable.length === 1
    ? `achievement:${devId}:${notable[0].id}`
    : `achievement_batch:${devId}:${notable.map((a) => a.id).sort().join(",")}`;

  const isSingle = notable.length === 1;
  const first = notable[0];

  const title = isSingle
    ? `Achievement Unlocked: ${first.name} (${first.tier})`
    : `${notable.length} Achievements Unlocked!`;

  const body = isSingle
    ? `You unlocked ${first.name} (${first.tier}).`
    : `You unlocked ${notable.length} new achievements: ${notable.map((a) => a.name).join(", ")}.`;

  const achievementListHtml = notable
    .map((a) => {
      const emoji = TIER_EMOJI[a.tier] ?? "";
      return `<li style="margin-bottom:8px; font-size:15px; color:#555555;">${emoji} <strong style="color:#111111;">${a.name}</strong> <span style="color:#999;">(${a.tier})</span></li>`;
    })
    .join("");

  sendNotificationAsync({
    type: "achievement_unlocked",
    category: "social",
    developerId: devId,
    dedupKey,
    title,
    body,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Achievement${isSingle ? "" : "s"} unlocked</p>
      <h1 style="margin:0 0 20px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${isSingle ? first.name : `${notable.length} new achievements`}</h1>
      <ul style="margin:0 0 28px; padding-left:20px; list-style:none;">
        ${achievementListHtml}
      </ul>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("View Achievements", `${BASE_URL}/?user=${login}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${login}`,
    priority: "low",
    channels: ["email"],
    batchKey: `achievements:${devId}`,
    batchWindowMinutes: 30,
    batchEventData: {
      achievements: notable.map((a) => ({ id: a.id, name: a.name, tier: a.tier })),
    },
  });
}
