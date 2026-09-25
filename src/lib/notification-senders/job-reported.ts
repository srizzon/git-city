import { sendCompanyEmail } from "@/lib/jobs/send-company-email";
import { getAdminNotificationEmail } from "@/lib/jobs/admin-email";
import { ADMIN_LINKS, COMPANY_DASHBOARD_URL, COMPANY_LINKS, JOBS_SUPPORT_EMAIL } from "@/lib/jobs/email-blocks";
import { EMAIL_BASE_URL, button, detailRows, heading, paragraph, trackedUrl } from "@/lib/email/components";
import { renderLayout, renderText, type EmailLinks } from "@/lib/email/layout";

export function renderJobReportedEmail(d: { listingTitle: string }, links: EmailLinks = COMPANY_LINKS) {
  const subject = `Listing paused: ${d.listingTitle}`;
  const preheader = "Several developers reported it. Our team is looking at it now.";
  const dashboardUrl = trackedUrl(COMPANY_DASHBOARD_URL, "job_reported");
  const intro = `${d.listingTitle} was reported by several developers, so we've taken it off the job board while our team reviews it.`;
  const next = "If it checks out, we'll put it back up. If something needs to change, we'll email you with the details. Think it's a mistake? Reply to this email.";
  const reason = "You're getting this because you have a listing on Git City Jobs.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("Your listing is paused"), paragraph(intro), paragraph(next), button("Open your dashboard", dashboardUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: ["Your listing is paused", "", intro, "", next, "", `Open your dashboard: ${dashboardUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent to the company when their listing is auto-paused after too many reports. */
export async function sendJobReportedEmail(companyEmail: string, listingTitle: string) {
  const { subject, html, text } = renderJobReportedEmail({ listingTitle });
  await sendCompanyEmail({ to: companyEmail, subject, html, text, type: "job_reported", replyTo: JOBS_SUPPORT_EMAIL });
}

export interface JobReportedAdminData {
  listingTitle: string;
  companyName: string;
  reportCount: number;
  listingId: string;
}

export function renderJobReportedAdminEmail(d: JobReportedAdminData, links: EmailLinks = ADMIN_LINKS) {
  const subject = `Auto-paused: ${d.listingTitle} (${d.reportCount} reports)`;
  const preheader = `${d.companyName}'s listing hit ${d.reportCount} reports and is off the board until you review it.`;
  const adminUrl = `${EMAIL_BASE_URL}/admin/jobs`;
  const intro = `${d.companyName}'s listing reached ${d.reportCount} reports and was paused automatically. It stays off the job board until it's resumed.`;
  const reason = "You're getting this because you moderate Git City Jobs.";
  const rows = [
    { label: "Listing", value: d.listingTitle },
    { label: "Company", value: d.companyName },
    { label: "Reports", value: String(d.reportCount) },
  ];

  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("Listing auto-paused"), paragraph(intro), detailRows(rows), button("Review in admin", adminUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: ["Listing auto-paused", "", intro, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", `Review in admin: ${adminUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent to the admin when a listing is auto-paused after too many reports. */
export async function sendJobReportedAdminEmail(listingTitle: string, companyName: string, reportCount: number, listingId: string) {
  const adminEmail = await getAdminNotificationEmail();
  if (!adminEmail) return;
  const { subject, html, text } = renderJobReportedAdminEmail({ listingTitle, companyName, reportCount, listingId });
  await sendCompanyEmail({ to: adminEmail, subject, html, text, type: "job_reported_admin" });
}
