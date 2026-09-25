import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, heading, heroImage, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { townDisplayName } from "../towns/names";
import { REQUEST_TTL_DAYS } from "../towns/joining";
import { townHero } from "./town-email";

export interface JoinRequestEmailData {
  requesterLogin: string;
  leagueSlug: string;
  leagueName: string;
}

function joinRequestHeader(d: JoinRequestEmailData) {
  const town = townDisplayName(d.leagueName);
  return {
    town,
    subject: `@${d.requesterLogin} wants to join ${town}`,
    preheader: `Let them in or decline. The request expires in ${REQUEST_TTL_DAYS} days.`,
  };
}

export function renderJoinRequestEmail(d: JoinRequestEmailData, links: EmailLinks) {
  const { town, subject, preheader } = joinRequestHeader(d);
  const reviewUrl = trackedUrl(`/town/${d.leagueSlug}/settings#requests`, "league_join_request");
  const intro = `Let them in and their building joins ${town}'s skyline and races with the town this week. Or decline from the same page.`;
  const expiry = `The request expires in ${REQUEST_TTL_DAYS} days if nobody answers.`;
  const reason = `You're getting this because you're the admin of ${town} on Git City.`;

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({
      src: `${EMAIL_BASE_URL}/dev/${encodeURIComponent(d.requesterLogin)}/opengraph-image`,
      href: trackedUrl(`/?user=${encodeURIComponent(d.requesterLogin)}`, "league_join_request"),
      alt: `@${d.requesterLogin}'s building in Git City`,
    }),
    body: [
      heading("", `@${d.requesterLogin}`, ` wants to join ${town}`),
      paragraph(intro),
      paragraph(expiry, { muted: true }),
      button("Review requests", reviewUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [subject, "", intro, "", expiry, "", `Review requests: ${reviewUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
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
  const data: JoinRequestEmailData = { requesterLogin: opts.requesterLogin, leagueSlug: opts.leagueSlug, leagueName: opts.leagueName };
  const { subject, preheader } = joinRequestHeader(data);
  sendNotificationAsync({
    type: "league_join_request",
    category: "leagues",
    developerId: opts.adminId,
    dedupKey: `league_join_request:${opts.leagueId}:${opts.requesterId}`,
    title: subject,
    body: preheader,
    render: (links) => renderJoinRequestEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/town/${opts.leagueSlug}/settings#requests`,
    priority: "normal",
    channels: ["email"],
  });
}

export interface RequestApprovedEmailData {
  adminLogin: string;
  leagueSlug: string;
  leagueName: string;
}

function requestApprovedHeader(d: RequestApprovedEmailData) {
  const town = townDisplayName(d.leagueName);
  return {
    town,
    subject: `You're in ${town}`,
    preheader: `@${d.adminLogin} let you in. Your building races with the town this week.`,
  };
}

export function renderRequestApprovedEmail(d: RequestApprovedEmailData, links: EmailLinks) {
  const { town, subject, preheader } = requestApprovedHeader(d);
  const townUrl = trackedUrl(`/town/${d.leagueSlug}`, "league_request_approved");
  const intro = `@${d.adminLogin} accepted your request. Your building is on the town's skyline, and every contribution you push this week scores in the race.`;
  const reason = `You're getting this because you asked to join ${town} on Git City.`;

  const html = renderLayout({
    title: subject,
    preheader,
    hero: townHero(d.leagueSlug, town, townUrl),
    body: [heading("You're in", town), paragraph(intro), button("See your town", townUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [subject, "", intro, "", `See your town: ${townUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** "You're in Acme Town" to the dev whose request the admin approved. */
export function sendRequestApprovedNotification(opts: {
  developerId: number;
  adminLogin: string;
  leagueSlug: string;
  leagueName: string;
}) {
  const data: RequestApprovedEmailData = { adminLogin: opts.adminLogin, leagueSlug: opts.leagueSlug, leagueName: opts.leagueName };
  const { subject, preheader } = requestApprovedHeader(data);
  sendNotificationAsync({
    type: "league_request_approved",
    category: "leagues",
    developerId: opts.developerId,
    dedupKey: `league_request_approved:${opts.leagueSlug}:${opts.developerId}`,
    title: subject,
    body: preheader,
    render: (links) => renderRequestApprovedEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/town/${opts.leagueSlug}`,
    priority: "normal",
    channels: ["email"],
  });
}
