import { sendNotificationAsync } from "../notifications";
import { buildButton, escapeHtml } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/** "Pedro lit up his building" email to the colleague who invited them. */
export function sendLeagueLitUpNotification(opts: {
  inviterId: number;
  inviteeId: number;
  inviteeLogin: string;
  leagueSlug: string;
  leagueName: string;
}) {
  const url = `${BASE_URL}/league/${opts.leagueSlug}`;
  const title = `@${opts.inviteeLogin} lit up their building`;
  const body = `@${opts.inviteeLogin} joined ${opts.leagueName} from your invite. Their building is on and scoring this week.`;

  sendNotificationAsync({
    type: "league_litup",
    category: "leagues",
    developerId: opts.inviterId,
    dedupKey: `league_litup:${opts.inviterId}:${opts.inviteeId}`,
    title,
    body,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">${escapeHtml(opts.leagueName)}</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;">${escapeHtml(body)}</p>
      ${buildButton("See your league", url)}
    `,
    actionUrl: url,
    priority: "normal",
    channels: ["email"],
  });
}
