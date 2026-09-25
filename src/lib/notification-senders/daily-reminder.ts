import { sendNotification } from "../notifications";
import type { Mission } from "../dailies";
import { EMAIL_BASE_URL, bulletList, button, heading, label, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

/** XP granted when all three daily missions are claimed (api/dailies/claim). */
const DAILIES_XP = 25;

/**
 * The one reminder a developer gets per day from the 20:00 UTC cron. A live
 * streak without today's check-in wins; otherwise half-done dailies.
 */
export type DailyReminderData =
  | {
      kind: "streak";
      login: string;
      streak: number;
      freezes: number;
      /** Last check-in was two days ago: a freeze is covering yesterday, today is the last chance. */
      missedYesterday: boolean;
      missionsLeft: Mission[];
    }
  | {
      kind: "missions";
      login: string;
      missionsDone: number;
      missionsLeft: Mission[];
    };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function dailyReminderHeader(d: DailyReminderData) {
  if (d.kind === "missions") {
    const left = d.missionsLeft.length;
    return {
      subject: `${plural(left, "daily mission")} left`,
      preheader: `Finish ${left === 1 ? "it" : "them"} before midnight UTC and claim ${DAILIES_XP} XP.`,
    };
  }
  if (d.missedYesterday) {
    return {
      subject: `Last chance for your ${d.streak}-day streak`,
      preheader: "A freeze covered yesterday. Check in before midnight UTC to keep it.",
    };
  }
  if (d.freezes === 0) {
    return {
      subject: `Your ${d.streak}-day streak ends tonight`,
      preheader: "You haven't checked in today. Open the city before midnight UTC.",
    };
  }
  return {
    subject: `Keep your ${d.streak}-day streak going`,
    preheader: "You haven't checked in today. One visit before midnight UTC does it.",
  };
}

function streakIntro(d: Extract<DailyReminderData, { kind: "streak" }>): string {
  const how = "Open Git City before midnight UTC and the check-in happens on its own.";
  if (d.missedYesterday) {
    return `You missed yesterday, so a streak freeze is holding your streak. ${how} Miss today too and it starts over.`;
  }
  if (d.freezes === 0) return `You haven't checked in today and you have no streak freezes left. ${how}`;
  return `You haven't checked in today. ${how} Miss it and ${d.freezes === 1 ? "your streak freeze" : `one of your ${d.freezes} streak freezes`} covers the day.`;
}

export function renderDailyReminderEmail(d: DailyReminderData, links: EmailLinks) {
  const { subject, preheader } = dailyReminderHeader(d);
  const campaign = d.kind === "streak" ? "streak_reminder" : "dailies_reminder";
  const url = trackedUrl("/", campaign);

  const title: [string, string, string] =
    d.kind === "streak"
      ? d.missedYesterday
        ? ["Last chance for your", `${d.streak}-day streak`, ""]
        : ["Your", `${d.streak}-day streak`, " is waiting"]
      : ["", `${d.missionsDone} of 3`, " missions done"];
  const intro =
    d.kind === "streak"
      ? streakIntro(d)
      : `Finish the rest before midnight UTC, then claim the reward in the daily missions panel for ${DAILIES_XP} XP.`;
  const missions = d.missionsLeft.map((m) => ({ lead: `${m.description}.`, text: "" }));
  const missionsNote = d.kind === "streak" && missions.length ? `Finish all three and claim ${DAILIES_XP} XP.` : null;
  const cta = d.kind === "streak" ? "Check in now" : "Finish your missions";
  const reason =
    d.kind === "streak"
      ? "You're getting this daily reminder because your streak is still alive and you haven't checked in today."
      : "You're getting this daily reminder because you started today's missions on Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading(title[0], title[1], title[2]),
      paragraph(intro),
      missions.length ? label("Today's missions left") + bulletList(missions) : "",
      missionsNote ? paragraph(missionsNote, { muted: true }) : "",
      button(cta, url),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [
      title.join("").trim(),
      "",
      intro,
      ...(missions.length ? ["", "Today's missions left:", ...missions.map((m) => `- ${m.lead}`)] : []),
      ...(missionsNote ? ["", missionsNote] : []),
      "",
      `${cta}: ${url}`,
    ],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

export async function sendDailyReminderNotification(devId: number, data: DailyReminderData, date: string) {
  const { subject, preheader } = dailyReminderHeader(data);
  const isStreak = data.kind === "streak";

  return sendNotification({
    type: isStreak ? "streak_reminder" : "dailies_reminder",
    category: "streak_reminders",
    developerId: devId,
    dedupKey: `${isStreak ? "streak_reminder" : "dailies_reminder"}:${devId}:${date}`,
    skipIfActive: true,
    title: subject,
    body: preheader,
    render: (links) => renderDailyReminderEmail(data, links),
    actionUrl: EMAIL_BASE_URL,
    priority: isStreak ? "high" : "low",
    channels: ["email"],
  });
}
