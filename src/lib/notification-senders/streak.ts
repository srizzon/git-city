import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

const MILESTONE_MESSAGES: Record<number, { emoji: string; tagline: string }> = {
  7:   { emoji: "&#x1F525;", tagline: "You're on fire!" },
  30:  { emoji: "&#x1F3C6;", tagline: "A whole month. Legendary." },
  100: { emoji: "&#x1F48E;", tagline: "Triple digits. Unstoppable." },
  365: { emoji: "&#x1F451;", tagline: "One full year. You're a legend." },
};

export function sendStreakMilestoneNotification(
  devId: number,
  login: string,
  streak: number,
  longestStreak: number,
  rewardItemName?: string,
) {
  const milestoneInfo = MILESTONE_MESSAGES[streak];
  if (!milestoneInfo) return; // Only send at defined milestones

  const rewardHtml = rewardItemName
    ? `<p style="color: #c8e64a; font-size: 14px;">Reward unlocked: <strong>${rewardItemName}</strong></p>`
    : "";

  sendNotificationAsync({
    type: "streak_milestone",
    category: "social",
    developerId: devId,
    dedupKey: `streak_milestone:${devId}:${streak}`,
    title: `${streak}-day streak! ${milestoneInfo.tagline}`,
    body: `${streak}-day streak! ${milestoneInfo.tagline}${rewardItemName ? ` Reward: ${rewardItemName}` : ""}`,
    html: `
      <div style="text-align: center;">
        <p style="font-size: 40px; margin: 0;">${milestoneInfo.emoji}</p>
        <p style="color: #c8e64a; font-size: 24px; font-weight: bold; margin: 8px 0;">${streak}-day streak!</p>
        <p style="color: #e0d8cc; font-size: 16px; margin-top: 0;">${milestoneInfo.tagline}</p>
      </div>
      ${rewardHtml}
      <p style="color: #666; font-size: 13px; text-align: center;">
        Longest streak: ${longestStreak} days
      </p>
      ${buildButton("Keep It Going", `${BASE_URL}/?user=${login}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${login}`,
    priority: "high", // Streak milestones are celebratory, send immediately
    channels: ["email"],
  });
}
