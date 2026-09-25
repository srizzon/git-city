import { sendCompanyEmail } from "@/lib/jobs/send-company-email";
import { COMPANY_DASHBOARD_URL, COMPANY_LINKS, plural } from "@/lib/jobs/email-blocks";
import { button, heading, paragraph, statTiles, trackedUrl } from "@/lib/email/components";
import { renderLayout, renderText, type EmailLinks } from "@/lib/email/layout";

const fmt = (n: number) => n.toLocaleString("en-US");

export interface JobExpiringData {
  listingTitle: string;
  daysLeft: number;
  views: number;
  applies: number;
}

export function renderJobExpiringEmail(d: JobExpiringData, links: EmailLinks = COMPANY_LINKS) {
  const days = plural(d.daysLeft, "day");
  const subject = `Your listing ends in ${days}`;
  const preheader = `${d.listingTitle} has ${plural(d.views, "view")} and ${plural(d.applies, "application")} so far.`;
  const dashboardUrl = trackedUrl(COMPANY_DASHBOARD_URL, "job_expiring");
  const intro = `${d.listingTitle} comes off the job board in ${days}. Here's how it's done so far.`;
  const next = "Once it ends, developers can no longer find it or apply. Still hiring after that? Repost it from your dashboard.";
  const reason = "You're getting this because you have a listing on Git City Jobs.";
  const tiles = [
    { value: fmt(d.views), label: "Views" },
    { value: fmt(d.applies), label: "Applications" },
    { value: `${d.daysLeft}d`, label: "Left" },
  ];

  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading(`Your listing ends in ${days}`), paragraph(intro), statTiles(tiles), paragraph(next), button("Open your dashboard", dashboardUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [`Your listing ends in ${days}`, "", intro, "", ...tiles.map((t) => `${t.label}: ${t.value}`), "", next, "", `Open your dashboard: ${dashboardUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent when a listing is about to expire (EXPIRY_WARNING_DAYS before). */
export async function sendJobExpiringEmail(email: string, listingTitle: string, daysLeft: number, stats: { views: number; applies: number }) {
  const { subject, html, text } = renderJobExpiringEmail({ listingTitle, daysLeft, ...stats });
  await sendCompanyEmail({ to: email, subject, html, text, type: "job_expiring" });
}

export interface JobExpiredData {
  listingTitle: string;
  views: number;
  applies: number;
  hires: number;
}

export function renderJobExpiredEmail(d: JobExpiredData, links: EmailLinks = COMPANY_LINKS) {
  const subject = `Listing ended: ${d.listingTitle}`;
  const preheader = `Final numbers: ${plural(d.views, "view")}, ${plural(d.applies, "application")}, ${plural(d.hires, "hire")}.`;
  const dashboardUrl = trackedUrl(COMPANY_DASHBOARD_URL, "job_expired");
  const intro = `${d.listingTitle} has expired and is off the job board. Here are the final numbers.`;
  const next = d.hires > 0
    ? "Hiring for another role? Repost this listing or post a new one from your dashboard."
    : "Still hiring? Repost it from your dashboard to put it back in front of developers.";
  const reason = "You're getting this because you had a listing on Git City Jobs.";
  const tiles = [
    { value: fmt(d.views), label: "Views" },
    { value: fmt(d.applies), label: "Applications" },
    { value: fmt(d.hires), label: d.hires === 1 ? "Hire" : "Hires" },
  ];

  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("Your listing has ended"), paragraph(intro), statTiles(tiles), paragraph(next), button("Repost listing", dashboardUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: ["Your listing has ended", "", intro, "", ...tiles.map((t) => `${t.label}: ${t.value}`), "", next, "", `Repost listing: ${dashboardUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent when a listing has expired, with its final numbers. */
export async function sendJobExpiredEmail(email: string, listingTitle: string, stats: { views: number; applies: number; hires: number }) {
  const { subject, html, text } = renderJobExpiredEmail({ listingTitle, ...stats });
  await sendCompanyEmail({ to: email, subject, html, text, type: "job_expired" });
}
