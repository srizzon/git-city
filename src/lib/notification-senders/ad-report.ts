import { getResend } from "@/lib/resend";
import { wrapInBaseTemplate, buildButton, escapeHtml } from "@/lib/email-template";

interface AdReport {
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

function pctLabel(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "+100%" : "-";
  const pct = ((current - prev) / prev) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function changeColor(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "#22c55e" : "#999999";
  return current >= prev ? "#22c55e" : "#ef4444";
}

export async function sendWeeklyAdReport(report: AdReport) {
  const resend = getResend();

  const impChange = pctLabel(report.totals.impressions, report.prevTotals.impressions);
  const engChange = pctLabel(report.totals.engagements, report.prevTotals.engagements);
  const linkChange = pctLabel(report.totals.linkClicks, report.prevTotals.linkClicks);
  const convChange = pctLabel(report.totals.conversions, report.prevTotals.conversions);

  const impColor = changeColor(report.totals.impressions, report.prevTotals.impressions);
  const engColor = changeColor(report.totals.engagements, report.prevTotals.engagements);
  const linkColor = changeColor(report.totals.linkClicks, report.prevTotals.linkClicks);
  const convColor = changeColor(report.totals.conversions, report.prevTotals.conversions);

  // CTR comparison
  const prevTotalClicks = report.prevTotals.engagements + report.prevTotals.linkClicks;
  const prevCtr = report.prevTotals.impressions > 0
    ? (prevTotalClicks / report.prevTotals.impressions) * 100
    : 0;
  const currCtr = report.totals.impressions > 0
    ? ((report.totals.engagements + report.totals.linkClicks) / report.totals.impressions) * 100
    : 0;
  const ctrChange = pctLabel(Math.round(currCtr * 100), Math.round(prevCtr * 100));
  const ctrColor = changeColor(Math.round(currCtr * 100), Math.round(prevCtr * 100));

  // Conv rate comparison
  const prevConvRate = report.prevTotals.linkClicks > 0
    ? (report.prevTotals.conversions / report.prevTotals.linkClicks) * 100
    : 0;
  const currConvRate = report.totals.linkClicks > 0
    ? (report.totals.conversions / report.totals.linkClicks) * 100
    : 0;
  const convRateChange = pctLabel(Math.round(currConvRate * 100), Math.round(prevConvRate * 100));
  const convRateColor = changeColor(Math.round(currConvRate * 100), Math.round(prevConvRate * 100));

  // Summary cards row
  const summaryCard = (label: string, value: string, change: string, color: string) => `
    <td style="padding: 16px; border: 1px solid #eeeeee; text-align: center; width: 25%;">
      <p style="margin: 0 0 4px; font-size: 10px; color: #999999; font-family: Helvetica, Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">${label}</p>
      <p style="margin: 0; font-size: 22px; font-weight: bold; color: #111111; font-family: Helvetica, Arial, sans-serif;">${value}</p>
      <p style="margin: 4px 0 0; font-size: 11px; color: ${color}; font-family: Helvetica, Arial, sans-serif;">${change}</p>
    </td>`;

  const summaryHtml = `
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        ${summaryCard("Views", fmtNum(report.totals.impressions), impChange, impColor)}
        ${summaryCard("Engaged", fmtNum(report.totals.engagements), engChange, engColor)}
        ${summaryCard("Links", fmtNum(report.totals.linkClicks), linkChange, linkColor)}
        ${summaryCard("CTR", report.totals.ctr, ctrChange, ctrColor)}
        ${summaryCard("Conversions", fmtNum(report.totals.conversions), convChange, convColor)}
        ${summaryCard("Conv. Rate", report.totals.convRate, convRateChange, convRateColor)}
      </tr>
    </table>`;

  // Per-ad breakdown table
  const adRows = report.ads
    .sort((a, b) => b.impressions - a.impressions)
    .map((ad) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eeeeee; color: #111111; font-family: Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600;">${escapeHtml(ad.brand)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eeeeee; color: #333333; font-family: Helvetica, Arial, sans-serif; font-size: 13px; text-align: right;">${fmtNum(ad.impressions)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eeeeee; color: #333333; font-family: Helvetica, Arial, sans-serif; font-size: 13px; text-align: right;">${fmtNum(ad.linkClicks)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eeeeee; color: #333333; font-family: Helvetica, Arial, sans-serif; font-size: 13px; text-align: right;">${ad.ctr}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eeeeee; color: #333333; font-family: Helvetica, Arial, sans-serif; font-size: 13px; text-align: right;">${fmtNum(ad.conversions)}</td>
      </tr>`)
    .join("");

  const adTableHtml = report.ads.length > 0 ? `
    <table style="width: 100%; border-collapse: collapse; margin: 8px 0 20px;">
      <tr>
        <td style="padding: 8px 12px; border-bottom: 2px solid #eeeeee; color: #999999; font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Ad</td>
        <td style="padding: 8px 12px; border-bottom: 2px solid #eeeeee; color: #999999; font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: right;">Views</td>
        <td style="padding: 8px 12px; border-bottom: 2px solid #eeeeee; color: #999999; font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: right;">Links</td>
        <td style="padding: 8px 12px; border-bottom: 2px solid #eeeeee; color: #999999; font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: right;">CTR</td>
        <td style="padding: 8px 12px; border-bottom: 2px solid #eeeeee; color: #999999; font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; text-align: right;">Conv.</td>
      </tr>
      ${adRows}
    </table>` : "";

  const bodyHtml = `
    <h2 style="margin-top: 0; font-family: 'Silkscreen', monospace; color: #111111;">
      Weekly Ad Report
    </h2>
    <p style="color: #555555; font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6;">
      Here's how your Git City ads performed this week${report.advertiserName ? `, ${escapeHtml(report.advertiserName)}` : ""}.
    </p>
    ${summaryHtml}
    ${adTableHtml}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px auto 0;">
      <tr>
        <td align="center" bgcolor="#c8e64a" style="border-radius: 4px;">
          <a href="https://thegitcity.com/ads/dashboard" style="display: inline-block; padding: 14px 32px; background-color: #c8e64a; border-radius: 4px; color: #111111; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: bold; text-decoration: none; letter-spacing: 0.5px;">
            View Full Dashboard
          </a>
        </td>
      </tr>
    </table>
    <p style="margin-top: 24px; color: #999999; font-family: Helvetica, Arial, sans-serif; font-size: 12px;">
      You're receiving this because you have active ads on Git City.
    </p>
  `;

  await resend.emails.send({
    from: "Git City <noreply@thegitcity.com>",
    to: report.advertiserEmail,
    subject: `Your Git City ads: ${fmtNum(report.totals.impressions)} views this week`,
    html: wrapInBaseTemplate(bodyHtml),
  });
}
