import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, detailRows, heading, heroImage, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

/** Check-in milestones that get an email. The 7-day one stays in-app only. */
const EMAIL_MILESTONES: Record<number, string> = {
  30: "a month",
  100: "100 days",
  365: "a full year",
};

export interface StreakMilestoneData {
  login: string;
  streak: number;
  longestStreak: number;
  /** Item granted by the streak reward pool, if one was granted on this check-in. */
  rewardItemName?: string;
}

function streakMilestoneHeader(d: StreakMilestoneData) {
  return {
    subject: `You hit a ${d.streak}-day streak`,
    preheader: d.rewardItemName
      ? `You unlocked ${d.rewardItemName} for your building.`
      : d.streak >= d.longestStreak
        ? "Your longest run in the city yet."
        : `Your record is ${d.longestStreak} days. Keep going.`,
  };
}

export function renderStreakMilestoneEmail(d: StreakMilestoneData, links: EmailLinks) {
  const { subject, preheader } = streakMilestoneHeader(d);
  const url = trackedUrl(`/?user=${encodeURIComponent(d.login)}`, "streak_milestone");
  const span = EMAIL_MILESTONES[d.streak] ?? `${d.streak} days`;
  const intro = `You've checked in to Git City every day for ${span}.`;
  const rows = [
    d.rewardItemName ? { label: "Reward", value: d.rewardItemName } : null,
    { label: "Longest streak", value: `${Math.max(d.longestStreak, d.streak)} days` },
  ].filter((r): r is { label: string; value: string } => r !== null);
  const reason = "You're getting this because you reached a streak milestone on Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({
      src: `${EMAIL_BASE_URL}/dev/${encodeURIComponent(d.login)}/opengraph-image`,
      href: url,
      alt: `@${d.login}'s building in Git City`,
    }),
    body: [
      heading("", `${d.streak} days`, " in a row"),
      paragraph(intro),
      detailRows(rows),
      button("Keep the streak going", url),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [`${d.streak} days in a row`, "", intro, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", `Keep the streak going: ${url}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

export function sendStreakMilestoneNotification(
  devId: number,
  login: string,
  streak: number,
  longestStreak: number,
  rewardItemName?: string,
) {
  if (!EMAIL_MILESTONES[streak]) return;

  const data: StreakMilestoneData = { login, streak, longestStreak, rewardItemName };
  const { subject, preheader } = streakMilestoneHeader(data);

  sendNotificationAsync({
    type: "streak_milestone",
    category: "social",
    developerId: devId,
    dedupKey: `streak_milestone:${devId}:${streak}`,
    title: subject,
    body: preheader,
    render: (links) => renderStreakMilestoneEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/?user=${login}`,
    priority: "high",
    channels: ["email"],
  });
}
