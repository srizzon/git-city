import { sendNotificationAsync } from "../notifications";
import { buildButton, escapeHtml } from "../email-template";
import { townDisplayName } from "../towns/names";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/** "Bruno overtook you" email. Max one per dev per UTC day across all towns. */
export function sendLeagueOvertakenNotification(opts: {
  developerId: number;
  leagueSlug: string;
  leagueName: string;
  overtakerLogin: string;
  gap: number;
  newRank: number;
}) {
  const day = new Date().toISOString().slice(0, 10);
  const url = `${BASE_URL}/town/${opts.leagueSlug}`;
  const town = townDisplayName(opts.leagueName);
  const title = `@${opts.overtakerLogin} overtook you in ${town}`;
  const body = `They're ${opts.gap} point${opts.gap === 1 ? "" : "s"} ahead. You're ${opts.newRank === 1 ? "1st" : `#${opts.newRank}`} now. The week closes Monday 00:00 UTC.`;

  sendNotificationAsync({
    type: "league_overtaken",
    category: "leagues",
    developerId: opts.developerId,
    dedupKey: `league_overtaken:${opts.developerId}:${day}`,
    title,
    body,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">${escapeHtml(town)}</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;">${escapeHtml(body)}</p>
      ${buildButton("See the race", url)}
    `,
    actionUrl: url,
    priority: "normal",
    channels: ["email"],
  });
}
