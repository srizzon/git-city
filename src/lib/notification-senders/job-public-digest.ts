import { getResend } from "@/lib/resend";
import { wrapInBaseTemplate, buildButton, escapeHtml } from "@/lib/email-template";
import { SENIORITY_LABELS, LOCATION_TYPE_LABELS, SALARY_PERIOD_LABELS } from "../jobs/constants";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";
const FROM = "Git City Jobs <noreply@thegitcity.com>";

interface MatchingJob {
  id: string;
  title: string;
  companyName: string;
  seniority: string;
  locationType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod?: string;
  currency: string | null;
  matchedSkills: string[];
}

/**
 * Public weekly job digest for email subscribers (no account needed).
 */
export async function sendJobPublicDigestNotification(
  email: string,
  jobs: MatchingJob[],
  unsubscribeToken: string,
) {
  if (jobs.length === 0) return;

  const jobListHtml = jobs
    .slice(0, 8)
    .map((job) => {
      const seniorityLabel = SENIORITY_LABELS[job.seniority] || job.seniority;
      const locationLabel = LOCATION_TYPE_LABELS[job.locationType] || job.locationType;

      let salaryLine = "";
      if (job.salaryMin && job.salaryMax && job.currency) {
        const periodLabel = SALARY_PERIOD_LABELS[job.salaryPeriod ?? "monthly"] ?? "/mo";
        salaryLine = `<span style="color:#059669; font-weight:600;">${job.currency} ${job.salaryMin.toLocaleString()}-${job.salaryMax.toLocaleString()}${periodLabel}</span> &middot; `;
      }

      const skillsLine = job.matchedSkills.length > 0
        ? `<p style="margin:4px 0 0; font-size:12px; color:#5a8a00;">Matches: ${job.matchedSkills.map((s) => escapeHtml(s)).join(", ")}</p>`
        : "";

      return `
        <tr>
          <td style="padding:16px; border-bottom:1px solid #eeeeee;">
            <a href="${BASE_URL}/jobs/${job.id}" style="color:#111111; text-decoration:none; font-size:15px; font-weight:600; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(job.title)}</a>
            <p style="margin:4px 0 0; font-size:13px; color:#555555; font-family:Helvetica,Arial,sans-serif;">
              ${escapeHtml(job.companyName)} &middot; ${salaryLine}${seniorityLabel} &middot; ${locationLabel}
            </p>
            ${skillsLine}
          </td>
        </tr>`;
    })
    .join("");

  const title = jobs.length === 1
    ? `1 new job on Git City`
    : `${jobs.length} new jobs on Git City`;

  const unsubscribeUrl = `${BASE_URL}/api/jobs/alerts/unsubscribe?token=${unsubscribeToken}`;

  const html = wrapInBaseTemplate(`
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Weekly jobs</p>
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${title}</h1>
    <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
      Here are this week's top developer jobs:
    </p>
    <table style="width:100%; border-collapse:collapse; margin:0 0 16px;">
      ${jobListHtml}
    </table>
    ${buildButton("Browse All Jobs", `${BASE_URL}/jobs`)}
    <p style="margin:20px 0 0; font-size:12px; color:#999999;">
      <a href="${BASE_URL}/api/auth/github?redirect=/jobs" style="color:#5a8a00; text-decoration:underline;">Sign in with GitHub</a> to apply and track your applications.
    </p>
    <p style="margin:12px 0 0; font-size:11px; color:#cccccc;">
      <a href="${unsubscribeUrl}" style="color:#cccccc; text-decoration:underline;">Unsubscribe</a>
    </p>
  `);

  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: title,
    html,
    text: `${title}\n\n${jobs.map((j) => `${j.title} at ${j.companyName} — ${BASE_URL}/jobs/${j.id}`).join("\n")}\n\nBrowse all: ${BASE_URL}/jobs\n\nUnsubscribe: ${unsubscribeUrl}`,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
