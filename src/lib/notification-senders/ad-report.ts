import { sendEmail } from "@/lib/resend";
import { button, detailRows, heading, label, paragraph, statTiles, trackedUrl } from "@/lib/email/components";
import { renderLayout, renderText } from "@/lib/email/layout";
import { ADVERTISER_DASHBOARD_URL, ADVERTISER_LINKS, compactNumber, formatNumber } from "@/lib/ad-emails";
import { FROM_MAIL } from "../email/senders";

export interface AdReport {
  advertiserEmail: string;
  advertiserName: string | null;
  ads: {
    brand: string;
    impressions: number;
    engagements: number;
    linkClicks: number;
    conversions: number;
    ctr: string;
    convRate: string;
  }[];
  totals: {
    impressions: number;
    engagements: number;
    linkClicks: number;
    conversions: number;
    ctr: string;
    convRate: string;
  };
  prevTotals: {
    impressions: number;
    engagements: number;
    linkClicks: number;
    conversions: number;
  };
}

/** Change against last week, or null when there's nothing to compare to. */
function change(current: number, prev: number): string | null {
  if (prev === 0) return null;
  const pct = Math.round(((current - prev) / prev) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function withChange(name: string, current: number, prev: number): string {
  const c = change(current, prev);
  return c ? `${name} ${c}` : name;
}

const title = (r: AdReport) => (r.ads.length === 1 ? "Your ad this week" : "Your ads this week");

function reportHeader(r: AdReport) {
  const imp = change(r.totals.impressions, r.prevTotals.impressions);
  const trend = imp ? ` Impressions ${imp.startsWith("-") ? "down" : "up"} ${imp.replace(/^[+-]/, "")} on last week.` : "";
  return {
    subject: `${title(r)}: ${formatNumber(r.totals.impressions)} impressions`,
    preheader: `${formatNumber(r.totals.linkClicks)} link ${r.totals.linkClicks === 1 ? "click" : "clicks"} at ${r.totals.ctr} CTR.${trend}`,
  };
}

export function renderWeeklyAdReportEmail(r: AdReport) {
  const { subject, preheader } = reportHeader(r);
  const dashboardUrl = trackedUrl(ADVERTISER_DASHBOARD_URL, "ad_weekly_report");
  const { totals: t, prevTotals: p } = r;

  const reach = [
    { value: compactNumber(t.impressions), label: withChange("Impressions", t.impressions, p.impressions) },
    { value: compactNumber(t.linkClicks), label: withChange("Link clicks", t.linkClicks, p.linkClicks) },
    { value: t.ctr, label: "CTR" },
  ];
  const results = [
    { value: compactNumber(t.engagements), label: withChange("Ad clicks", t.engagements, p.engagements) },
    { value: compactNumber(t.conversions), label: withChange("Conversions", t.conversions, p.conversions) },
    { value: t.convRate, label: "Conv. rate" },
  ];
  const noConversions = t.conversions === 0 && p.conversions === 0;
  const conversionsHint = "Conversions show up once you add conversion tracking in your dashboard, under Integration.";

  const byAd = r.ads.length > 1
    ? [...r.ads]
        .sort((a, b) => b.impressions - a.impressions)
        .map((ad) => ({ label: ad.brand, value: `${formatNumber(ad.impressions)} imp. · ${ad.ctr}` }))
    : [];

  const hasPrev = p.impressions > 0 || p.engagements > 0 || p.linkClicks > 0 || p.conversions > 0;
  const intro = `${r.advertiserName ? `${r.advertiserName}, here's` : "Here's"} how your Git City ${r.ads.length === 1 ? "ad" : "ads"} did over the last 7 days${hasPrev ? ", compared with the week before" : ""}.`;
  const reason = "You're getting this weekly report because you have active ads on Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading(title(r)),
      paragraph(intro),
      label("Reach") + statTiles(reach),
      label("Engagement") + statTiles(results),
      noConversions ? paragraph(conversionsHint, { muted: true }) : "",
      byAd.length ? label("By ad, impressions and CTR") + detailRows(byAd) : "",
      button("Open your dashboard", dashboardUrl),
    ].join("\n"),
    reason,
    links: ADVERTISER_LINKS,
  });

  const text = renderText({
    lines: [
      title(r),
      "",
      intro,
      "",
      ...[...reach, ...results].map((s) => `${s.label}: ${s.value}`),
      ...(noConversions ? ["", conversionsHint] : []),
      ...(byAd.length ? ["", "By ad:", ...byAd.map((a) => `- ${a.label}: ${a.value}`)] : []),
      "",
      `Open your dashboard: ${dashboardUrl}`,
    ],
    reason,
    links: ADVERTISER_LINKS,
  });

  return { subject, preheader, html, text };
}

export async function sendWeeklyAdReport(report: AdReport) {
  const { subject, html, text } = renderWeeklyAdReportEmail(report);
  const { error } = await sendEmail({
    from: FROM_MAIL,
    to: report.advertiserEmail,
    subject,
    html,
    text,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
