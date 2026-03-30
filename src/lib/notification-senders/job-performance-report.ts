import { getResend } from "@/lib/resend";
import { wrapInBaseTemplate, buildButton, escapeHtml } from "@/lib/email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";
const FROM = "Git City Jobs <noreply@thegitcity.com>";

interface ListingStats {
  title: string;
  views: number;
  applies: number;
  profileViews: number;
  status: string;
}

interface WeeklyReport {
  companyName: string;
  companyEmail: string;
  listings: ListingStats[];
  totals: { views: number; applies: number; profileViews: number };
  prevTotals: { views: number; applies: number; profileViews: number };
}

function pctLabel(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "+100%" : "-";
  const pct = ((current - prev) / prev) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

function changeColor(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "#22c55e" : "#999999";
  return current >= prev ? "#22c55e" : "#ef4444";
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

export async function sendJobWeeklyPerformanceReport(report: WeeklyReport) {
  const viewsChange = pctLabel(report.totals.views, report.prevTotals.views);
  const appliesChange = pctLabel(report.totals.applies, report.prevTotals.applies);
  const profileChange = pctLabel(report.totals.profileViews, report.prevTotals.profileViews);

  const summaryCard = (label: string, value: string, change: string, color: string) => `
    <td style="padding:16px; border:1px solid #eeeeee; text-align:center; width:33%;">
      <p style="margin:0 0 4px; font-size:10px; color:#999999; font-family:Helvetica,Arial,sans-serif; text-transform:uppercase; letter-spacing:0.5px;">${label}</p>
      <p style="margin:0; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${value}</p>
      <p style="margin:4px 0 0; font-size:11px; color:${color}; font-family:Helvetica,Arial,sans-serif;">${change}</p>
    </td>`;

  const summaryHtml = `
    <table style="width:100%; border-collapse:collapse; margin:20px 0;">
      <tr>
        ${summaryCard("Views", fmtNum(report.totals.views), viewsChange, changeColor(report.totals.views, report.prevTotals.views))}
        ${summaryCard("Applications", fmtNum(report.totals.applies), appliesChange, changeColor(report.totals.applies, report.prevTotals.applies))}
        ${summaryCard("Profile Views", fmtNum(report.totals.profileViews), profileChange, changeColor(report.totals.profileViews, report.prevTotals.profileViews))}
      </tr>
    </table>`;

  const listingRows = report.listings
    .sort((a, b) => b.views - a.views)
    .map((l) => `
      <tr>
        <td style="padding:10px 12px; border-bottom:1px solid #eeeeee; color:#111111; font-family:Helvetica,Arial,sans-serif; font-size:13px; font-weight:600;">${escapeHtml(l.title)}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #eeeeee; color:#333333; font-family:Helvetica,Arial,sans-serif; font-size:13px; text-align:right;">${fmtNum(l.views)}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #eeeeee; color:#333333; font-family:Helvetica,Arial,sans-serif; font-size:13px; text-align:right;">${fmtNum(l.applies)}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #eeeeee; color:#333333; font-family:Helvetica,Arial,sans-serif; font-size:13px; text-align:right;">${fmtNum(l.profileViews)}</td>
      </tr>`)
    .join("");

  const listingTableHtml = report.listings.length > 0 ? `
    <table style="width:100%; border-collapse:collapse; margin:8px 0 20px;">
      <tr>
        <td style="padding:8px 12px; border-bottom:2px solid #eeeeee; color:#999999; font-family:Helvetica,Arial,sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Listing</td>
        <td style="padding:8px 12px; border-bottom:2px solid #eeeeee; color:#999999; font-family:Helvetica,Arial,sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; text-align:right;">Views</td>
        <td style="padding:8px 12px; border-bottom:2px solid #eeeeee; color:#999999; font-family:Helvetica,Arial,sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; text-align:right;">Applies</td>
        <td style="padding:8px 12px; border-bottom:2px solid #eeeeee; color:#999999; font-family:Helvetica,Arial,sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; text-align:right;">Profiles</td>
      </tr>
      ${listingRows}
    </table>` : "";

  const bodyHtml = `
    <h2 style="margin-top:0; font-family:'Silkscreen', monospace; color:#111111;">
      Weekly Jobs Report
    </h2>
    <p style="color:#555555; font-family:Helvetica,Arial,sans-serif; font-size:14px; line-height:1.6;">
      Here's how your listings performed this week, ${escapeHtml(report.companyName)}.
    </p>
    ${summaryHtml}
    ${listingTableHtml}
    ${buildButton("View Full Dashboard", `${BASE_URL}/jobs/dashboard`)}
    <p style="margin-top:24px; color:#999999; font-family:Helvetica,Arial,sans-serif; font-size:12px;">
      You're receiving this because you have active job listings on Git City.
    </p>
  `;

  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: report.companyEmail,
    subject: `Your Git City jobs: ${fmtNum(report.totals.views)} views this week`,
    html: wrapInBaseTemplate(bodyHtml),
  });
}
