import { sendNotification } from "../notifications";
import { EMAIL_BASE_URL, button, heading, paragraph, statTiles, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { CODE_DAILY_CONTRIBUTION_CAP, CODE_POINTS_PER_CONTRIBUTION, weekEnd, weekStart, type ScoringMode } from "../leagues/scoring";
import { townDisplayName } from "../towns/names";
import { points } from "./town-email";

export interface LeagueOvertakenEmailData {
  leagueSlug: string;
  leagueName: string;
  overtakerLogin: string;
  gap: number;
  newRank: number;
  scoringMode: ScoringMode;
  /** Hours until the week closes (Monday 00:00 UTC). */
  hoursLeft: number;
}

function timeLeft(hours: number): string {
  if (hours >= 48) return `${Math.floor(hours / 24)} days`;
  if (hours >= 2) return `${Math.floor(hours)} hours`;
  return "Under 2h";
}

function leagueOvertakenHeader(d: LeagueOvertakenEmailData) {
  const town = townDisplayName(d.leagueName);
  return {
    town,
    subject: `@${d.overtakerLogin} passed you in ${town}`,
    preheader: `You're #${d.newRank} now, ${points(d.gap)} behind. The week closes Monday 00:00 UTC.`,
  };
}

export function renderLeagueOvertakenEmail(d: LeagueOvertakenEmailData, links: EmailLinks) {
  const { town, subject, preheader } = leagueOvertakenHeader(d);
  const townUrl = trackedUrl(`/town/${d.leagueSlug}`, "league_overtaken");
  const intro = `They moved ahead of you in this week's ${town} race.`;
  const howTo =
    `Every contribution you push is worth ${CODE_POINTS_PER_CONTRIBUTION} points, up to ${CODE_DAILY_CONTRIBUTION_CAP} contributions a day.` +
    (d.scoringMode === "xp" ? " Check-ins, dailies, raids and kudos add points too." : "");
  const tiles = [
    { value: `#${d.newRank}`, label: "Your rank" },
    { value: d.gap.toLocaleString("en-US"), label: d.gap === 1 ? "Point behind" : "Points behind" },
    { value: timeLeft(d.hoursLeft), label: "Until the close" },
  ];
  const reason = `You're getting this because you're racing in ${town} on Git City.`;

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("", `@${d.overtakerLogin}`, " passed you"),
      paragraph(intro),
      statTiles(tiles),
      paragraph(howTo),
      button("See the race", townUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [
      `@${d.overtakerLogin} passed you in ${town}`,
      "",
      intro,
      "",
      ...tiles.map((t) => `${t.label}: ${t.value}`),
      "",
      howTo,
      "",
      `See the race: ${townUrl}`,
    ],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** "@bruno passed you" email. Max one per dev per UTC day across all towns. */
export async function sendLeagueOvertakenNotification(opts: {
  developerId: number;
  leagueSlug: string;
  leagueName: string;
  overtakerLogin: string;
  gap: number;
  newRank: number;
  scoringMode: ScoringMode;
}) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const data: LeagueOvertakenEmailData = {
    leagueSlug: opts.leagueSlug,
    leagueName: opts.leagueName,
    overtakerLogin: opts.overtakerLogin,
    gap: opts.gap,
    newRank: opts.newRank,
    scoringMode: opts.scoringMode,
    hoursLeft: (weekEnd(weekStart(now)).getTime() - now.getTime()) / 3_600_000,
  };
  const { subject, preheader } = leagueOvertakenHeader(data);

  return sendNotification({
    type: "league_overtaken",
    category: "leagues",
    developerId: opts.developerId,
    dedupKey: `league_overtaken:${opts.developerId}:${day}`,
    title: subject,
    body: preheader,
    render: (links) => renderLeagueOvertakenEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/town/${opts.leagueSlug}`,
    priority: "normal",
    channels: ["email"],
  });
}
