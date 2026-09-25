import { sendNotificationAsync } from "../notifications";
import { buildButton, escapeHtml } from "../email-template";
import { townDisplayName } from "../towns/names";

/**
 * "@samuel invited you to Acme Town" to an invitee who already has a Git City
 * account (only they have an email on file). One per invitee per town.
 */
export function sendLeagueInvitedNotification(opts: {
  inviteeId: number;
  inviterLogin: string;
  leagueId: string;
  leagueName: string;
  link: string;
}) {
  const town = townDisplayName(opts.leagueName);
  const title = `@${opts.inviterLogin} invited you to ${town}`;
  const body = `Your building is already on its skyline, waiting. Join to race with the town every week.`;
  sendNotificationAsync({
    type: "league_invited",
    category: "leagues",
    developerId: opts.inviteeId,
    dedupKey: `league_invited:${opts.leagueId}:${opts.inviteeId}`,
    title,
    body,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">${escapeHtml(town)}</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;">${escapeHtml(body)}</p>
      ${buildButton("Join the town", opts.link)}
    `,
    actionUrl: opts.link,
    priority: "normal",
    channels: ["email"],
  });
}
