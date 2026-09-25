import { sendNotificationAsync } from "../notifications";
import { buildButton, escapeHtml } from "../email-template";
import { townDisplayName } from "../towns/names";
import { REQUEST_TTL_DAYS } from "../towns/joining";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

function card(kicker: string, title: string, body: string, button: string, url: string): string {
  return `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">${escapeHtml(kicker)}</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;">${escapeHtml(body)}</p>
      ${buildButton(button, url)}
    `;
}

/** "@pedro wants to join Acme Town" to the town's admin. One per requester per town. */
export function sendJoinRequestNotification(opts: {
  adminId: number;
  requesterId: number;
  requesterLogin: string;
  leagueId: string;
  leagueSlug: string;
  leagueName: string;
}) {
  const town = townDisplayName(opts.leagueName);
  const url = `${BASE_URL}/town/${opts.leagueSlug}/settings#requests`;
  const title = `@${opts.requesterLogin} wants to join ${town}`;
  const body = `Let them in or decline from the town settings. Requests expire after ${REQUEST_TTL_DAYS} days.`;
  sendNotificationAsync({
    type: "league_join_request",
    category: "leagues",
    developerId: opts.adminId,
    dedupKey: `league_join_request:${opts.leagueId}:${opts.requesterId}`,
    title,
    body,
    html: card(town, title, body, "Review requests", url),
    actionUrl: url,
    priority: "normal",
    channels: ["email"],
  });
}

/** "You're in Acme Town" to the dev whose request the admin approved. */
export function sendRequestApprovedNotification(opts: {
  developerId: number;
  adminLogin: string;
  leagueSlug: string;
  leagueName: string;
}) {
  const town = townDisplayName(opts.leagueName);
  const url = `${BASE_URL}/town/${opts.leagueSlug}`;
  const title = `You're in ${town}`;
  const body = `@${opts.adminLogin} let you in. Your building is on the skyline and races with the town this week.`;
  sendNotificationAsync({
    type: "league_request_approved",
    category: "leagues",
    developerId: opts.developerId,
    dedupKey: `league_request_approved:${opts.leagueSlug}:${opts.developerId}`,
    title,
    body,
    html: card(town, title, body, "See your town", url),
    actionUrl: url,
    priority: "normal",
    channels: ["email"],
  });
}
