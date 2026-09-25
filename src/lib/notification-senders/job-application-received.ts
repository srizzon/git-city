import { sendCompanyEmail } from "@/lib/jobs/send-company-email";
import { COMPANY_LINKS, formatSalary, linkRows, plural } from "@/lib/jobs/email-blocks";
import { SENIORITY_LABELS } from "@/lib/jobs/constants";
import { EMAIL_BASE_URL, bulletList, button, callout, heading, label, paragraph, trackedUrl } from "@/lib/email/components";
import { renderLayout, renderText, type EmailLinks } from "@/lib/email/layout";

export interface ApplicationInfo {
  developerLogin: string;
  hasProfile: boolean;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  skills?: string[] | null;
  seniority?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  bio?: string | null;
  resumeUrl?: string | null;
  linkedinUrl?: string | null;
}

export interface JobApplicationReceivedData {
  listingTitle: string;
  listingId: string;
  application: ApplicationInfo;
}

const REASON = "You're getting this because someone applied to your listing on Git City Jobs.";

const candidatesUrl = (listingId: string, campaign: string) => trackedUrl(`/jobs/dashboard/${listingId}/candidates`, campaign);

function fullName(a: { firstName?: string | null; lastName?: string | null }): string {
  return [a.firstName, a.lastName].filter(Boolean).join(" ");
}

export function renderJobApplicationReceivedEmail(d: JobApplicationReceivedData, links: EmailLinks = COMPANY_LINKS) {
  const a = d.application;
  const name = fullName(a) || `@${a.developerLogin}`;
  const subject = `New candidate: ${name}`;
  const preheader = `Applied to ${d.listingTitle}. Their contact details are inside.`;
  const reviewUrl = candidatesUrl(d.listingId, "job_application");
  const intro = `${fullName(a) ? `@${a.developerLogin}` : "They"} applied to ${d.listingTitle}.`;

  const salary = formatSalary(a.salaryMin, a.salaryMax, a.salaryCurrency);
  const rows = [
    a.email ? { label: "Email", value: a.email, href: `mailto:${a.email}` } : null,
    a.phone ? { label: "Phone", value: a.phone, href: `tel:${a.phone.replace(/[^\d+]/g, "")}` } : null,
    a.linkedinUrl ? { label: "LinkedIn", value: a.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), href: a.linkedinUrl } : null,
    a.resumeUrl ? { label: "Resume", value: "Open resume", href: a.resumeUrl } : null,
    { label: "Profile", value: `thegitcity.com/hire/${a.developerLogin}`, href: `${EMAIL_BASE_URL}/hire/${encodeURIComponent(a.developerLogin)}` },
    a.seniority ? { label: "Seniority", value: SENIORITY_LABELS[a.seniority] ?? a.seniority } : null,
    salary ? { label: "Salary", value: salary } : null,
    a.skills?.length ? { label: "Skills", value: a.skills.slice(0, 10).join(", ") } : null,
  ].filter((r): r is { label: string; value: string; href?: string } => r !== null);

  const bio = a.bio ? (a.bio.length > 280 ? `${a.bio.slice(0, 277).trimEnd()}...` : a.bio) : null;

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading(name),
      paragraph(intro),
      linkRows(rows),
      bio ? label("In their words") + callout(bio) : "",
      button("Review candidate", reviewUrl),
    ].join("\n"),
    reason: REASON,
    links,
  });

  const text = renderText({
    lines: [
      name,
      "",
      intro,
      "",
      ...rows.map((r) => `${r.label}: ${r.href && !r.href.startsWith("mailto:") && !r.href.startsWith("tel:") ? r.href : r.value}`),
      ...(bio ? ["", `In their words: ${bio}`] : []),
      "",
      `Review candidate: ${reviewUrl}`,
    ],
    reason: REASON,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent to the company when one developer applied since the last flush. */
export async function sendJobApplicationReceivedEmail(email: string, listingTitle: string, listingId: string, application: ApplicationInfo) {
  const { subject, html, text } = renderJobApplicationReceivedEmail({ listingTitle, listingId, application });
  await sendCompanyEmail({ to: email, subject, html, text, type: "job_application_received" });
}

export interface BatchApplicant {
  login: string;
  hasProfile: boolean;
  firstName?: string | null;
  lastName?: string | null;
}

export interface JobApplicationsBatchData {
  listingTitle: string;
  listingId: string;
  applications: BatchApplicant[];
}

const SHOWN = 10;

export function renderJobApplicationsBatchEmail(d: JobApplicationsBatchData, links: EmailLinks = COMPANY_LINKS) {
  const total = d.applications.length;
  const subject = `${plural(total, "new candidate")} for ${d.listingTitle}`;
  const names = d.applications.map((a) => fullName(a) || `@${a.login}`);
  const lead = total > 2 ? `${names.slice(0, 2).join(", ")} and ${total - 2} more` : names.join(" and ");
  const preheader = `${lead} applied. Their contact details are in your dashboard.`;
  const reviewUrl = candidatesUrl(d.listingId, "job_application");
  const intro = `${plural(total, "developer")} applied to ${d.listingTitle}.`;
  const items = d.applications.slice(0, SHOWN).map((a) => {
    const name = fullName(a);
    return name ? { lead: name, text: `@${a.login}` } : { lead: `@${a.login}`, text: "" };
  });
  const more = total > SHOWN ? `And ${plural(total - SHOWN, "more candidate")} in your dashboard.` : null;

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading(`${plural(total, "new candidate")}`),
      paragraph(intro),
      bulletList(items),
      more ? paragraph(more, { muted: true }) : "",
      button("Review candidates", reviewUrl),
    ].join("\n"),
    reason: REASON,
    links,
  });

  const text = renderText({
    lines: [
      `${plural(total, "new candidate")}`,
      "",
      intro,
      "",
      ...items.map((i) => `- ${i.lead}${i.text ? ` (${i.text})` : ""}`),
      ...(more ? [more] : []),
      "",
      `Review candidates: ${reviewUrl}`,
    ],
    reason: REASON,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent to the company when several developers applied since the last flush. */
export async function sendJobApplicationsBatchEmail(email: string, listingTitle: string, listingId: string, applications: BatchApplicant[]) {
  const { subject, html, text } = renderJobApplicationsBatchEmail({ listingTitle, listingId, applications });
  await sendCompanyEmail({ to: email, subject, html, text, type: "job_applications_batch" });
}
