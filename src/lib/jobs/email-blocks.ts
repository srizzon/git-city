// Email blocks only the jobs emails need, built on the shared design system.
import { COLORS, EMAIL_BASE_URL, FONT, escapeHtml, gmailSafe } from "@/lib/email/components";
import type { EmailLinks } from "@/lib/email/layout";

export const COMPANY_DASHBOARD_URL = `${EMAIL_BASE_URL}/jobs/dashboard`;
export const JOBS_SUPPORT_EMAIL = "support@thegitcity.com";
export const COMPANY_UNSUBSCRIBE_URL = `mailto:${JOBS_SUPPORT_EMAIL}?subject=Unsubscribe`;

/** Companies have no email preferences: the footer points at their dashboard and unsubscribes by email. */
export const COMPANY_LINKS: EmailLinks = { settingsUrl: COMPANY_DASHBOARD_URL, unsubscribeUrl: COMPANY_UNSUBSCRIBE_URL };

/** Moderation mail to the admin: no settings or unsubscribe link. */
export const ADMIN_LINKS: EmailLinks = { settingsUrl: null };

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function formatSalary(min: number | null | undefined, max: number | null | undefined, currency: string | null | undefined): string | null {
  if (!min || !max) return null;
  // Compact ("USD 140k–180k") so it doesn't break across lines on phones.
  const short = (n: number) => (n >= 1000 ? `${Math.round(n / 1000).toLocaleString("en-US")}k` : String(n));
  return `${currency ?? "USD"} ${short(min)}–${short(max)}`;
}

/** Label / value rows like detailRows, where a value can be a link (email, LinkedIn, resume). */
export function linkRows(rows: { label: string; value: string; href?: string }[]): string {
  const trs = rows
    .map((r, i) => {
      const top = i ? `border-top:1px solid ${COLORS.border};` : "";
      const value = r.href
        ? `<a href="${escapeHtml(r.href)}" style="color:${COLORS.cream}; text-decoration:underline; word-break:break-word;">${escapeHtml(r.value)}</a>`
        : escapeHtml(r.value);
      return `<tr>
    <td valign="top" width="96" style="padding:10px 12px 10px 0; ${top}">${gmailSafe(`<div style="font-family:${FONT}; font-size:14px; line-height:1.4; color:${COLORS.muted};">${escapeHtml(r.label)}</div>`)}</td>
    <td valign="top" style="padding:10px 0; ${top}">${gmailSafe(`<div style="font-family:${FONT}; font-size:14px; line-height:1.4; font-weight:600; color:${COLORS.cream}; word-break:break-word;">${value}</div>`)}</td>
  </tr>`;
    })
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px; padding:4px 16px; background-color:${COLORS.raised}; background-image:linear-gradient(${COLORS.raised},${COLORS.raised});">
  ${trs}
</table>`;
}

export interface JobCard {
  title: string;
  href: string;
  meta: string;
  note?: string;
}

/** Stacked job listings: linked title, a meta line and an optional note (e.g. matched skills). */
export function jobCards(jobs: JobCard[]): string {
  return jobs
    .map(
      (job) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
  <tr><td style="padding:14px 16px; background-color:${COLORS.raised}; background-image:linear-gradient(${COLORS.raised},${COLORS.raised});">
    ${gmailSafe(`<a href="${escapeHtml(job.href)}" style="display:block; font-family:${FONT}; font-size:16px; line-height:1.4; font-weight:700; color:${COLORS.cream}; text-decoration:none;">${escapeHtml(job.title)}</a>
    <div style="margin-top:4px; font-family:${FONT}; font-size:14px; line-height:1.5; color:${COLORS.warm};">${escapeHtml(job.meta)}</div>
    ${job.note ? `<div style="margin-top:4px; font-family:${FONT}; font-size:13px; line-height:1.5; color:${COLORS.muted};">${escapeHtml(job.note)}</div>` : ""}`)}
  </td></tr>
</table>`,
    )
    .join("\n");
}
