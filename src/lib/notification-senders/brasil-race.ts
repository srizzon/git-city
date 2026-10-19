import { sendNotification } from "../notifications";
import { EMAIL_BASE_URL, button, heading, paragraph, statTiles, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { formatLap } from "../league-city/race/laps";

// A Brasil race route's record fell: the old holder hears who took it, with
// a link that opens the race on that route, the new record's ghost on it.

export interface RouteRecordEmailData {
  leagueSlug: string;
  /** "São Paulo → Campinas". */
  routeName: string;
  routeKey: string;
  takerLogin: string;
  theirMs: number;
  yourMs: number;
}

const raceUrl = (slug: string, key: string, campaign: string) => trackedUrl(`/town/${slug}?race=${encodeURIComponent(key)}`, campaign);

function header(d: RouteRecordEmailData) {
  return {
    subject: `@${d.takerLogin} took your record on ${d.routeName}`,
    preheader: `${formatLap(d.theirMs)}, ${((d.yourMs - d.theirMs) / 1000).toFixed(3)}s faster than yours.`,
  };
}

export function renderRouteRecordEmail(d: RouteRecordEmailData, links: EmailLinks) {
  const { subject, preheader } = header(d);
  const url = raceUrl(d.leagueSlug, d.routeKey, "brasil_record_beaten");
  const intro = `They beat your time from ${d.routeName.replace(" → ", " to ")} on the Brasil map. Their ghost is on the route now.`;
  const tiles = [
    { value: formatLap(d.theirMs), label: `@${d.takerLogin}` },
    { value: formatLap(d.yourMs), label: "Yours" },
  ];
  const reason = "You're getting this because you held a race record on the Brasil map in Git City.";
  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("", `@${d.takerLogin}`, " took your record"), paragraph(intro), statTiles(tiles), button("Take it back", url)].join("\n"),
    reason,
    links,
  });
  const text = renderText({
    lines: [subject, "", intro, "", ...tiles.map((t) => `${t.label}: ${t.value}`), "", `Take it back: ${url}`],
    reason,
    links,
  });
  return { subject, preheader, html, text };
}

/** "@x took your record" (email + in-app). One per dev per route per UTC day. */
export async function sendRouteRecordNotification(opts: RouteRecordEmailData & { developerId: number }) {
  const { developerId, ...data } = opts;
  const { subject, preheader } = header(data);
  const day = new Date().toISOString().slice(0, 10);
  return sendNotification({
    type: "brasil_record_beaten",
    category: "leagues",
    developerId,
    dedupKey: `brasil_record_beaten:${developerId}:${data.routeKey}:${day}`,
    title: subject,
    body: preheader,
    render: (links) => renderRouteRecordEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/town/${data.leagueSlug}?race=${encodeURIComponent(data.routeKey)}`,
    priority: "normal",
    channels: ["email", "in_app"],
  });
}
