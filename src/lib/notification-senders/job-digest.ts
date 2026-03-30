import { sendNotificationAsync } from "../notifications";
import { buildButton, escapeHtml } from "../email-template";
import { SENIORITY_LABELS, LOCATION_TYPE_LABELS } from "../jobs/constants";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

interface MatchingJob {
  id: string;
  title: string;
  companyName: string;
  seniority: string;
  locationType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  matchedSkills: string[];
}

/**
 * Weekly job digest notification for developers.
 * Sends matching jobs based on career profile preferences.
 */
export function sendJobDigestNotification(
  devId: number,
  login: string,
  jobs: MatchingJob[],
) {
  if (jobs.length === 0) return;

  const jobListHtml = jobs
    .slice(0, 8)
    .map((job) => {
      const seniorityLabel = SENIORITY_LABELS[job.seniority] || job.seniority;
      const locationLabel = LOCATION_TYPE_LABELS[job.locationType] || job.locationType;

      let salaryLine = "";
      if (job.salaryMin && job.salaryMax && job.currency) {
        salaryLine = `<span style="color:#059669; font-weight:600;">${job.currency} ${job.salaryMin.toLocaleString()}-${job.salaryMax.toLocaleString()}</span> &middot; `;
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

  const moreText = jobs.length > 8
    ? `<p style="color:#999999; font-size:13px; margin:12px 0;">...and ${jobs.length - 8} more matching jobs</p>`
    : "";

  const title = jobs.length === 1
    ? `1 new job matches your profile`
    : `${jobs.length} new jobs match your profile`;

  sendNotificationAsync({
    type: "job_digest",
    category: "jobs_digest",
    developerId: devId,
    dedupKey: `job_digest:${devId}:${new Date().toISOString().slice(0, 10)}`,
    title,
    body: `${jobs.length} new job${jobs.length > 1 ? "s" : ""} matching your skills on Git City.`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Weekly jobs</p>
      <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${title}</h1>
      <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
        Based on your career profile, here are this week's top matches:
      </p>
      <table style="width:100%; border-collapse:collapse; margin:0 0 16px;">
        ${jobListHtml}
      </table>
      ${moreText}
      ${buildButton("Browse All Jobs", `${BASE_URL}/jobs`)}
      <p style="margin:20px 0 0; font-size:12px; color:#999999;">
        Update your <a href="${BASE_URL}/hire/edit" style="color:#5a8a00; text-decoration:underline;">career profile</a> to improve matches.
      </p>
    `,
    actionUrl: `${BASE_URL}/jobs`,
    priority: "high",
    channels: ["email"],
  });
}
