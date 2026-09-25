import { sendEmail } from "./resend";
import { EMAIL_BASE_URL, button, heading, label, paragraph, statTiles, trackedUrl } from "./email/components";
import { renderLayout, renderText, type EmailLinks } from "./email/layout";
import { FROM_MAIL, FROM_NOTIFY } from "./email/senders";


/** Advertisers have no email preferences page, so the footer carries no settings link. */
export const ADVERTISER_LINKS: EmailLinks = { settingsUrl: null };

export const ADVERTISER_DASHBOARD_URL = `${EMAIL_BASE_URL}/ads/dashboard`;

/** Common benchmark for display ads, shown next to the advertiser's CTR. */
const CTR_BENCHMARK = "Display ads average 0.1% to 0.5% CTR.";

export interface AdStats {
  impressions: number;
  /** Clicks on the ad itself in the city (opens its card). */
  clicks: number;
  /** Clicks on the ad's link. CTR is link clicks over impressions, as in the dashboard. */
  linkClicks: number;
  countries?: number;
}

export interface RenderedAdEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** Short form for stat tiles so big numbers fit three across on a phone. */
export function compactNumber(n: number): string {
  if (n < 10_000) return formatNumber(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function formatCtr(impressions: number, linkClicks: number): string {
  if (impressions === 0) return "0%";
  return `${((linkClicks / impressions) * 100).toFixed(2)}%`;
}

/** "your "Acme" ad", or "your ad" before the advertiser has set a brand. */
function yourAd(brand: string | null, capital = false): string {
  const ref = brand ? `your "${brand}" ad` : "your ad";
  return capital ? `Y${ref.slice(1)}` : ref;
}

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

function statsTiles(stats: AdStats) {
  return [
    { value: compactNumber(stats.impressions), label: "Impressions" },
    { value: compactNumber(stats.linkClicks), label: "Link clicks" },
    { value: formatCtr(stats.impressions, stats.linkClicks), label: "CTR" },
  ];
}

/** Throws on a Resend error so the cron doesn't mark the ad as notified. */
async function send(to: string, email: RenderedAdEmail, from = FROM_NOTIFY) {
  const { error } = await sendEmail({ from, to, subject: email.subject, html: email.html, text: email.text });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

// ── 1. Ends in 48h: lead with the results so far ──

export function renderAdExpiringEmail(adBrand: string | null, daysLeft: number, stats?: AdStats): RenderedAdEmail {
  const days = daysLeft === 1 ? "1 day" : `${daysLeft} days`;
  const hasStats = !!stats && stats.impressions > 0;
  const renewUrl = trackedUrl("/advertise", "ad_expiring");

  const subject = hasStats ? `Your ad ends in ${days}: ${formatNumber(stats.impressions)} impressions` : `Your ad ends in ${days}`;
  const preheader = hasStats
    ? `${plural(stats.linkClicks, "link click")} at ${formatCtr(stats.impressions, stats.linkClicks)} CTR so far. Renew to keep it up.`
    : `Renew ${yourAd(adBrand)} to keep it in front of developers.`;
  const intro = hasStats
    ? `${yourAd(adBrand, true)} leaves the city in ${days}. Here are its numbers so far.`
    : `${yourAd(adBrand, true)} leaves the city in ${days}. Renew it to keep it in front of the developers visiting Git City.`;
  const reason = "You're getting this because you run an ad on Git City.";
  const tiles = hasStats ? statsTiles(stats) : [];

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("", adBrand ?? "Your ad", ` ends in ${days}`),
      paragraph(intro),
      hasStats ? statTiles(tiles) : "",
      hasStats ? paragraph(CTR_BENCHMARK, { muted: true }) : "",
      button("Renew your ad", renewUrl),
    ].join("\n"),
    reason,
    links: ADVERTISER_LINKS,
  });

  const text = renderText({
    lines: [
      `${adBrand ?? "Your ad"} ends in ${days}`,
      "",
      intro,
      ...(hasStats ? ["", ...tiles.map((t) => `${t.label}: ${t.value}`), "", CTR_BENCHMARK] : []),
      "",
      `Renew your ad: ${renewUrl}`,
    ],
    reason,
    links: ADVERTISER_LINKS,
  });

  return { subject, preheader, html, text };
}

export async function sendAdExpiringEmail(email: string, adBrand: string | null, daysLeft: number, stats?: AdStats) {
  await send(email, renderAdExpiringEmail(adBrand, daysLeft, stats));
}

// ── 2. Ended: the final numbers ──

export function renderAdExpiredEmail(adBrand: string | null, stats: AdStats): RenderedAdEmail {
  const ctr = formatCtr(stats.impressions, stats.linkClicks);
  const againUrl = trackedUrl("/advertise", "ad_expired");

  const subject = `Your ad ended: ${formatNumber(stats.impressions)} impressions, ${ctr} CTR`;
  const preheader = `Final numbers for ${yourAd(adBrand)}. Run it again to keep the reach going.`;
  const intro = `${yourAd(adBrand, true)} has left the city. Here's how it did over the whole run.`;
  const reach =
    stats.countries && stats.countries > 1
      ? `It was seen in ${formatNumber(stats.countries)} countries, and people clicked it ${plural(stats.clicks, "time")} in the city.`
      : `People clicked it ${plural(stats.clicks, "time")} in the city.`;
  const reason = "You're getting this because your ad on Git City just ended.";
  const tiles = statsTiles(stats);

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("Final numbers for", adBrand ?? "your ad"),
      paragraph(intro),
      statTiles(tiles),
      paragraph(reach),
      paragraph(CTR_BENCHMARK, { muted: true }),
      button("Run another ad", againUrl),
    ].join("\n"),
    reason,
    links: ADVERTISER_LINKS,
  });

  const text = renderText({
    lines: [
      `Final numbers for ${adBrand ?? "your ad"}`,
      "",
      intro,
      "",
      ...tiles.map((t) => `${t.label}: ${t.value}`),
      "",
      reach,
      CTR_BENCHMARK,
      "",
      `Run another ad: ${againUrl}`,
    ],
    reason,
    links: ADVERTISER_LINKS,
  });

  return { subject, preheader, html, text };
}

export async function sendAdExpiredEmail(email: string, adBrand: string | null, stats: AdStats) {
  await send(email, renderAdExpiredEmail(adBrand, stats));
}

// ── 3. 7 days after: the city kept growing ──

export function renderAdFollowup7dEmail(adBrand: string | null, stats: AdStats, cityDevs: number): RenderedAdEmail {
  const ctr = formatCtr(stats.impressions, stats.linkClicks);
  const optionsUrl = trackedUrl("/advertise", "ad_followup_7d");

  const subject = `Git City is at ${formatNumber(cityDevs)} developers`;
  const preheader = `${yourAd(adBrand, true)} got ${plural(stats.linkClicks, "link click")} at ${ctr} CTR. The city keeps growing.`;
  const recap = `${yourAd(adBrand, true)} ended a week ago with ${plural(stats.impressions, "impression")} and ${plural(stats.linkClicks, "link click")}, a ${ctr} CTR.`;
  const pitch = "New developers move in every day, so your next ad goes up in a bigger city.";
  const reason = "You're getting this because you ran an ad on Git City. It's one of two follow-ups we send after an ad ends.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("", formatNumber(cityDevs), " developers in the city"),
      paragraph(recap),
      paragraph(pitch),
      button("See ad options", optionsUrl),
    ].join("\n"),
    reason,
    links: ADVERTISER_LINKS,
  });

  const text = renderText({
    lines: [`${formatNumber(cityDevs)} developers in the city`, "", recap, "", pitch, "", `See ad options: ${optionsUrl}`],
    reason,
    links: ADVERTISER_LINKS,
  });

  return { subject, preheader, html, text };
}

export async function sendAdFollowup7dEmail(email: string, adBrand: string | null, stats: AdStats, cityDevs: number) {
  await send(email, renderAdFollowup7dEmail(adBrand, stats, cityDevs), FROM_MAIL);
}

// ── 4. 30 days after: growth since the ad ended ──

export function renderAdFollowup30dEmail(
  adBrand: string | null,
  stats: AdStats,
  cityDevs: number,
  cityDevsWhenEnded: number,
): RenderedAdEmail {
  const newDevs = Math.max(0, cityDevs - cityDevsWhenEnded);
  const ctr = formatCtr(stats.impressions, stats.linkClicks);
  const optionsUrl = trackedUrl("/advertise", "ad_followup_30d");

  const subject = `${formatNumber(newDevs)} new developers since your ad`;
  const preheader = `Git City is at ${formatNumber(cityDevs)} developers. ${yourAd(adBrand, true)} hit ${ctr} CTR.`;
  const intro = `Git City has grown to ${formatNumber(cityDevs)} developers since ${yourAd(adBrand)} ended a month ago.`;
  const pitch = "Same audience of developers, in a bigger city.";
  const tiles = statsTiles(stats);
  const reason = "You're getting this because you ran an ad on Git City. It's the last follow-up we send about it.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("", `+${formatNumber(newDevs)}`, " developers since your ad"),
      paragraph(intro),
      label("Your last ad"),
      statTiles(tiles),
      paragraph(pitch),
      button("See ad options", optionsUrl),
    ].join("\n"),
    reason,
    links: ADVERTISER_LINKS,
  });

  const text = renderText({
    lines: [
      `+${formatNumber(newDevs)} developers since your ad`,
      "",
      intro,
      "",
      "Your last ad:",
      ...tiles.map((t) => `${t.label}: ${t.value}`),
      "",
      pitch,
      "",
      `See ad options: ${optionsUrl}`,
    ],
    reason,
    links: ADVERTISER_LINKS,
  });

  return { subject, preheader, html, text };
}

export async function sendAdFollowup30dEmail(
  email: string,
  adBrand: string | null,
  stats: AdStats,
  cityDevs: number,
  cityDevsWhenEnded: number,
) {
  await send(email, renderAdFollowup30dEmail(adBrand, stats, cityDevs, cityDevsWhenEnded), FROM_MAIL);
}

// ── Sign-in link for the business dashboard (ads and jobs) ──

export function renderAdvertiserSignInEmail(verifyUrl: string): RenderedAdEmail {
  const subject = "Your Git City sign-in link";
  const preheader = "It expires in 15 minutes and works once.";
  const intro = "Use this link to sign in to your Git City business dashboard, where you manage your ads and job listings.";
  const expiry = "It expires in 15 minutes and works once. If you didn't ask for it, you can ignore this email.";
  const reason = "You're getting this because someone asked to sign in to Git City with this email address.";
  const links: EmailLinks = { settingsUrl: null };

  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("Sign in to Git City"), paragraph(intro), paragraph(expiry, { muted: true }), button("Sign in", verifyUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: ["Sign in to Git City", "", intro, "", `Sign in: ${verifyUrl}`, "", expiry],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}
