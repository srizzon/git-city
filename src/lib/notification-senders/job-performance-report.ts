import { sendCompanyEmail } from "@/lib/jobs/send-company-email";
import { COMPANY_DASHBOARD_URL, COMPANY_LINKS, plural } from "@/lib/jobs/email-blocks";
import { bulletList, button, heading, label, paragraph, statTiles, trackedUrl } from "@/lib/email/components";
import { renderLayout, renderText, type EmailLinks } from "@/lib/email/layout";

interface ListingStats {
  title: string;
  views: number;
  applies: number;
  profileViews: number;
  status: string;
}

type Totals = { views: number; applies: number; profileViews: number };

export interface WeeklyReport {
  companyName: string;
  companyEmail: string;
  listings: ListingStats[];
  totals: Totals;
  prevTotals: Totals;
}

const STATUS_NOTE: Record<string, string> = { paused: "paused", filled: "filled", expired: "ended" };

const fmt = (n: number) => n.toLocaleString("en-US");

/** Short week-over-week change for a tile label: "+12%", "-5%", "flat", or null with nothing to compare. */
function change(current: number, prev: number): string | null {
  if (prev === 0) return null;
  const pct = Math.round(((current - prev) / prev) * 100);
  return pct === 0 ? "flat" : `${pct > 0 ? "+" : ""}${pct}%`;
}

function tile(value: number, name: string, prev: number) {
  const c = change(value, prev);
  return { value: fmt(value), label: c ? `${name} · ${c}` : name, text: `${name}: ${fmt(value)}${c ? ` (${c} vs last week)` : ""}` };
}

export function renderJobPerformanceReportEmail(r: WeeklyReport, links: EmailLinks = COMPANY_LINKS) {
  const { totals, prevTotals } = r;
  const subject = `${plural(totals.views, "view")} on your listings this week`;
  const viewPct = prevTotals.views > 0 ? Math.round(((totals.views - prevTotals.views) / prevTotals.views) * 100) : null;
  const trend = viewPct === null ? "Here's how the week went." : viewPct === 0 ? "Views held steady." : `Views ${viewPct > 0 ? "up" : "down"} ${Math.abs(viewPct)}% on last week.`;
  const preheader = `${plural(totals.applies, "application")} too. ${trend}`;
  const dashboardUrl = trackedUrl(COMPANY_DASHBOARD_URL, "job_weekly_report");

  const tiles = [tile(totals.views, "Views", prevTotals.views), tile(totals.applies, "Applications", prevTotals.applies)];
  // Only shown once the metric is being recorded, so it never reads as a dead zero.
  if (totals.profileViews > 0 || prevTotals.profileViews > 0) {
    tiles.push(tile(totals.profileViews, "Profile views", prevTotals.profileViews));
  }

  const rows = [...r.listings]
    .sort((a, b) => b.views - a.views)
    .map((l) => ({
      lead: STATUS_NOTE[l.status] ? `${l.title} (${STATUS_NOTE[l.status]}):` : `${l.title}:`,
      text: `${plural(l.views, "view")}, ${fmt(l.applies)} applied`,
    }));

  const subjectOfIntro = r.listings.length === 1 ? `your ${r.listings[0].title} listing` : `${r.companyName}'s listings`;
  const intro = `Here's how ${subjectOfIntro} did over the last 7 days${prevTotals.views > 0 ? ", compared with the week before" : ""}.`;
  const reason = "You're getting this weekly report because you have listings on Git City Jobs.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("Your week on Git City Jobs"),
      paragraph(intro),
      statTiles(tiles),
      rows.length > 1 ? label("By listing") + bulletList(rows) : "",
      button("Open your dashboard", dashboardUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [
      "Your week on Git City Jobs",
      "",
      intro,
      "",
      ...tiles.map((t) => t.text),
      ...(rows.length > 1 ? ["", "By listing:", ...rows.map((row) => `- ${row.lead} ${row.text}`)] : []),
      "",
      `Open your dashboard: ${dashboardUrl}`,
    ],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Weekly report to each company with listing activity in the last 7 days. */
export async function sendJobWeeklyPerformanceReport(report: WeeklyReport) {
  const { subject, html, text } = renderJobPerformanceReportEmail(report);
  await sendCompanyEmail({ to: report.companyEmail, subject, html, text, type: "job_weekly_report" });
}
