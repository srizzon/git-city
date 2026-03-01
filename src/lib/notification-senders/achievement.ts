import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";
import { TIER_EMOJI } from "../achievements";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

interface AchievementInfo {
  id: string;
  name: string;
  tier: string;
}

/**
 * Send achievement unlocked notification.
 * Only sends for gold and diamond tier (bronze/silver too frequent).
 * Multiple achievements at once = ONE notification listing all.
 */
export function sendAchievementNotification(
  devId: number,
  login: string,
  achievements: AchievementInfo[],
) {
  // Filter to gold/diamond only
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
      return `<li style="margin-bottom: 6px; color: #e0d8cc;">
        ${emoji} <strong style="color: #c8e64a;">${a.name}</strong>
        <span style="color: #666;">(${a.tier})</span>
      </li>`;
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
      <p style="color: #c8e64a; font-size: 16px;">
        ${isSingle ? "Achievement Unlocked!" : `${notable.length} Achievements Unlocked!`}
      </p>
      <ul style="padding-left: 20px; margin: 16px 0; list-style: none;">
        ${achievementListHtml}
      </ul>
      ${buildButton("View Achievements", `${BASE_URL}/?user=${login}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${login}`,
    priority: "low",
    channels: ["email"],
    // Batch eligible in case user unlocks multiple across separate calls
    batchKey: `achievements:${devId}`,
    batchWindowMinutes: 30,
    batchEventData: {
      achievements: notable.map((a) => ({ id: a.id, name: a.name, tier: a.tier })),
    },
  });
}
