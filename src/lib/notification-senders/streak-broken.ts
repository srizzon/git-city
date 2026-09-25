import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, heading, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

export interface StreakBrokenData {
  login: string;
  previousStreak: number;
}

// Sent from the check-in that reset the streak, so today already counts as day 1.
function streakBrokenHeader(d: StreakBrokenData) {
  return {
    subject: `Your ${d.previousStreak}-day streak ended`,
    preheader: "Today already counts as day 1. Here's how to protect the next one.",
  };
}

export function renderStreakBrokenEmail(d: StreakBrokenData, links: EmailLinks) {
  const { subject, preheader } = streakBrokenHeader(d);
  const url = trackedUrl("/", "streak_broken");
  const intro = "You missed a day with no streak freeze to cover it, so your streak reset when you checked in today. That check-in already counts as day 1.";
  const freezes = "A streak freeze covers one missed day. You earn one every 7 times you complete and claim your daily missions, and you can hold two at a time.";
  const reason = "You're getting this because your streak on Git City reset.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("Your", `${d.previousStreak}-day streak`, " ended"),
      paragraph(intro),
      paragraph(freezes),
      button("See today's missions", url),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [`Your ${d.previousStreak}-day streak ended`, "", intro, "", freezes, "", `See today's missions: ${url}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

export function sendStreakBrokenNotification(
  devId: number,
  login: string,
  previousStreak: number,
  date: string,
) {
  const data: StreakBrokenData = { login, previousStreak };
  const { subject, preheader } = streakBrokenHeader(data);

  sendNotificationAsync({
    type: "streak_broken",
    category: "streak_reminders",
    developerId: devId,
    dedupKey: `streak_broken:${devId}:${date}`,
    title: subject,
    body: preheader,
    render: (links) => renderStreakBrokenEmail(data, links),
    actionUrl: EMAIL_BASE_URL,
    priority: "high",
    channels: ["email"],
  });
}
