import { sendEmail } from "./resend";
import {
  wrapInBaseTemplate,
  escapeHtml,
  buildButton,
  buildStatsTable,
} from "./email-template";

const FROM = "Git City <noreply@thegitcity.com>";
const ADVERTISE_URL = "https://thegitcity.com/advertise";

export interface AdStats {
  impressions: number;
  clicks: number;
  countries?: number;
}

/** Throws on a Resend error so the cron doesn't mark the ad as notified. */
async function send(payload: { to: string; subject: string; html: string }) {
  const { error } = await sendEmail({ from: FROM, ...payload });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

function formatCtr(impressions: number, clicks: number): string {
  if (impressions === 0) return "0%";
  return ((clicks / impressions) * 100).toFixed(2) + "%";
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function p(text: string): string {
  return `<p style="font-size: 15px; color: #333; line-height: 1.6;">${text}</p>`;
}

function muted(text: string): string {
  return `<p style="font-size: 12px; color: #999; margin: 4px 0 0;">${text}</p>`;
}

// ── 1. Expiring in 48h ──────────────────────────────────────────
// Angle: "Your results so far" — lead with data, not an announcement

export async function sendAdExpiringEmail(
  email: string,
  adBrand: string,
  daysLeft: number,
  trackingUrl: string,
  stats?: AdStats,
) {
  const brand = escapeHtml(adBrand);
  const plural = daysLeft === 1 ? "" : "s";
  const hasStats = stats && stats.impressions > 0;
  const ctr = hasStats ? formatCtr(stats.impressions, stats.clicks) : "";

  let body: string;

  if (hasStats) {
    body = `
      <h2 style="margin: 0 0 16px; font-size: 22px; color: #111;">${formatNumber(stats.impressions)} developers saw your ad</h2>
      ${p(`Your <strong>"${brand}"</strong> campaign ends in <strong>${daysLeft} day${plural}</strong>. Here's where it stands:`)}
      ${buildStatsTable([
        { label: "impressions", value: formatNumber(stats.impressions) },
        { label: "clicks", value: formatNumber(stats.clicks) },
        { label: "CTR", value: ctr },
      ])}
      ${muted("For context, the average display ad CTR is 0.1-0.5%.")}
      ${p("Renew to keep these numbers climbing.")}
      ${buildButton("Renew my ad", ADVERTISE_URL)}
      <p style="margin-top: 20px; font-size: 13px;">
        <a href="${escapeHtml(trackingUrl)}" style="color: #555;">View full dashboard</a>
      </p>
    `;
  } else {
    body = `
      <h2 style="margin: 0 0 16px; font-size: 22px; color: #111;">Your ad ends in ${daysLeft} day${plural}</h2>
      ${p(`Your <strong>"${brand}"</strong> campaign is about to wrap up.`)}
      ${p("Want to keep it running?")}
      ${buildButton("Renew my ad", ADVERTISE_URL)}
      <p style="margin-top: 20px; font-size: 13px;">
        <a href="${escapeHtml(trackingUrl)}" style="color: #555;">View full dashboard</a>
      </p>
    `;
  }

  await send({
    to: email,
    subject: hasStats
      ? `${formatNumber(stats.impressions)} impressions and counting — your ad ends in ${daysLeft} day${plural}`
      : `Your Git City ad ends in ${daysLeft} day${plural}`,
    html: wrapInBaseTemplate(body),
  });
}

// ── 2. Campaign complete ────────────────────────────────────────
// Angle: "You beat the industry average" — benchmark is the star

export async function sendAdExpiredEmail(
  email: string,
  adBrand: string,
  stats: AdStats,
  advertiseUrl: string,
) {
  const brand = escapeHtml(adBrand);
  const ctr = formatCtr(stats.impressions, stats.clicks);

  const rows: { label: string; value: string | number }[] = [
    { label: "impressions", value: formatNumber(stats.impressions) },
    { label: "clicks", value: formatNumber(stats.clicks) },
    { label: "CTR", value: ctr },
  ];

  if (stats.countries && stats.countries > 1) {
    rows.push({ label: "countries reached", value: stats.countries });
  }

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #111;">Your "${brand}" results are in</h2>
    ${buildStatsTable(rows)}
    ${muted(`Average display ad CTR is 0.1-0.5%. Your campaign landed at ${ctr}.`)}
    ${p("Every impression was a real GitHub developer, not a bot.")}
    ${buildButton("Run another ad", advertiseUrl)}
  `;

  await send({
    to: email,
    subject: `Your ad results: ${formatNumber(stats.clicks)} clicks, ${ctr} CTR`,
    html: wrapInBaseTemplate(body),
  });
}

// ── 3. 7-day follow-up ──────────────────────────────────────────
// Angle: loss aversion — new devs are joining and you're not there

export async function sendAdFollowup7dEmail(
  email: string,
  adBrand: string,
  stats: AdStats,
  cityDevs: number,
) {
  const brand = escapeHtml(adBrand);
  const ctr = formatCtr(stats.impressions, stats.clicks);

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #111;">${formatNumber(cityDevs)} developers in the city now</h2>
    ${p(`Since your <strong>"${brand}"</strong> campaign ended a week ago, new developers keep joining Git City every day.`)}
    ${p(`Your campaign hit <strong>${ctr} CTR</strong> with <strong>${formatNumber(stats.clicks)} clicks</strong>. Those numbers don't disappear — the audience just keeps getting bigger.`)}
    ${buildButton("Get back in front of them", ADVERTISE_URL)}
  `;

  await send({
    to: email,
    subject: `${formatNumber(cityDevs)} developers in Git City — and growing`,
    html: wrapInBaseTemplate(body),
  });
}

// ── 4. 30-day win-back ──────────────────────────────────────────
// Angle: pure growth FOMO — X,000 new devs since you left

export async function sendAdFollowup30dEmail(
  email: string,
  adBrand: string,
  stats: AdStats,
  cityDevs: number,
  cityDevsWhenEnded: number,
) {
  const newDevs = cityDevs - cityDevsWhenEnded;
  const ctr = formatCtr(stats.impressions, stats.clicks);

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #111;">${formatNumber(newDevs)} new developers since your last ad</h2>
    ${p(`Git City has grown to <strong>${formatNumber(cityDevs)} developers</strong> since your <strong>"${escapeHtml(adBrand)}"</strong> campaign.`)}
    ${buildStatsTable([
      { label: "new developers since your ad", value: "+" + formatNumber(newDevs) },
      { label: "total developers now", value: formatNumber(cityDevs) },
      { label: "your last CTR", value: ctr },
    ])}
    ${p("Same verified audience. Bigger reach.")}
    ${buildButton("See ad options", ADVERTISE_URL)}
  `;

  await send({
    to: email,
    subject: `${formatNumber(newDevs)} new developers joined since your last ad`,
    html: wrapInBaseTemplate(body),
  });
}
