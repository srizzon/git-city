import { getSupabaseAdmin } from "../supabase";
import { sendNotification } from "../notifications";
import { EMAIL_BASE_URL, button, heading, paragraph, statTiles, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { DAILY_CONTRIBUTION_CAP, weekEnd, weekStart } from "../leagues/scoring";
import { townDisplayName } from "../towns/names";
import { contributions } from "./town-email";

// At most one every 3 days per dev, across all towns: sent daily it filled the
// shared weekly cap and pushed out the emails about your own building.
export const OVERTAKEN_EVERY_MS = 3 * 86_400_000;

export interface LeagueOvertakenEmailData {
  leagueSlug: string;
  leagueName: string;
  overtakerLogin: string;
  /** How many more passed you at the same time. */
  others?: number;
  gap: number;
  newRank: number;
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
    who: `@${d.overtakerLogin}${d.others ? ` and ${d.others} other${d.others === 1 ? "" : "s"}` : ""}`,
    subject: `@${d.overtakerLogin}${d.others ? ` and ${d.others} other${d.others === 1 ? "" : "s"}` : ""} passed you in ${town}`,
    preheader: `You're #${d.newRank} now, ${contributions(d.gap)} behind. The week closes Monday 00:00 UTC.`,
  };
}

export function renderLeagueOvertakenEmail(d: LeagueOvertakenEmailData, links: EmailLinks) {
  const { town, who, subject, preheader } = leagueOvertakenHeader(d);
  const townUrl = trackedUrl(`/town/${d.leagueSlug}`, "league_overtaken");
  const intro = `They moved ahead of you in this week's ${town} race.`;
  const howTo = `Every GitHub contribution counts, up to ${DAILY_CONTRIBUTION_CAP} a day.`;
  const tiles = [
    { value: `#${d.newRank}`, label: "Your rank" },
    { value: d.gap.toLocaleString("en-US"), label: "Behind" },
    { value: timeLeft(d.hoursLeft), label: "Until the close" },
  ];
  const reason = `You're getting this because you're racing in ${town} on Git City.`;

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("", who, " passed you"),
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
      subject,
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

/** "@bruno passed you" email. Max one per dev every 3 days across all towns. */
export async function sendLeagueOvertakenNotification(opts: {
  developerId: number;
  leagueSlug: string;
  leagueName: string;
  overtakerLogin: string;
  others?: number;
  gap: number;
  newRank: number;
}) {
  const now = new Date();
  const { data: recent } = await getSupabaseAdmin()
    .from("notification_log")
    .select("id")
    .eq("developer_id", opts.developerId)
    .eq("notification_type", "league_overtaken")
    .neq("status", "failed")
    .gte("created_at", new Date(now.getTime() - OVERTAKEN_EVERY_MS).toISOString())
    .limit(1)
    .maybeSingle();
  if (recent) return [];
  const data: LeagueOvertakenEmailData = {
    leagueSlug: opts.leagueSlug,
    leagueName: opts.leagueName,
    overtakerLogin: opts.overtakerLogin,
    others: opts.others,
    gap: opts.gap,
    newRank: opts.newRank,
    hoursLeft: (weekEnd(weekStart(now)).getTime() - now.getTime()) / 3_600_000,
  };
  const { subject, preheader } = leagueOvertakenHeader(data);

  return sendNotification({
    type: "league_overtaken",
    category: "leagues",
    developerId: opts.developerId,
    dedupKey: `league_overtaken:${opts.developerId}:${Math.floor(now.getTime() / OVERTAKEN_EVERY_MS)}`,
    title: subject,
    body: preheader,
    render: (links) => renderLeagueOvertakenEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/town/${opts.leagueSlug}`,
    priority: "normal",
    channels: ["email"],
  });
}
