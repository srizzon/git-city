import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

const MILESTONE_MESSAGES: Record<number, { emoji: string; tagline: string }> = {
  7:   { emoji: "🔥", tagline: "You're on fire!" },
  30:  { emoji: "🏆", tagline: "A whole month. Legendary." },
  100: { emoji: "💎", tagline: "Triple digits. Unstoppable." },
  365: { emoji: "👑", tagline: "One full year. You're a legend." },
};

export function sendStreakMilestoneNotification(
  devId: number,
  login: string,
  streak: number,
  longestStreak: number,
  rewardItemName?: string,
) {
  const milestoneInfo = MILESTONE_MESSAGES[streak];
  if (!milestoneInfo) return;

  const rewardHtml = rewardItemName
    ? `<p style="margin:0 0 28px; font-size:14px; color:#5a8a00;">🎁 Reward unlocked: <strong>${rewardItemName}</strong></p>`
    : "";

  sendNotificationAsync({
    type: "streak_milestone",
    category: "social",
    developerId: devId,
    dedupKey: `streak_milestone:${devId}:${streak}`,
    title: `${streak}-day streak! ${milestoneInfo.tagline}`,
    body: `${streak}-day streak! ${milestoneInfo.tagline}${rewardItemName ? ` Reward: ${rewardItemName}` : ""}`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Streak milestone</p>
      <h1 style="margin:0 0 4px; font-size:40px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${milestoneInfo.emoji} ${streak} days</h1>
      <p style="margin:0 0 20px; font-size:18px; color:#555555; line-height:1.6;">${milestoneInfo.tagline}</p>
      ${rewardHtml}
      <p style="margin:0 0 28px; font-size:13px; color:#999999;">Longest streak: ${longestStreak} days</p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("Keep It Going", `${BASE_URL}/?user=${login}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${login}`,
    priority: "high",
    channels: ["email"],
  });
}
