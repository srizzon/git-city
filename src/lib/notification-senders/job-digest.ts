import { sendNotification } from "../notifications";
import { EMAIL_BASE_URL, button, heading, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { SENIORITY_LABELS, LOCATION_TYPE_LABELS } from "../jobs/constants";
import { formatSalary, jobCards, plural } from "../jobs/email-blocks";

export interface MatchingJob {
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

const SHOWN = 8;

function digestHeader(jobs: MatchingJob[]) {
  const [top] = jobs;
  const rest = jobs.length - 1;
  return {
    subject: jobs.length === 1 ? "1 new job matches your skills" : `${jobs.length} new jobs match your skills`,
    preheader: `${top.title} at ${top.companyName}${rest > 0 ? ` and ${plural(rest, "more", "more")}` : ""}, posted this week.`,
  };
}

export function renderJobDigestEmail(jobs: MatchingJob[], links: EmailLinks) {
  const { subject, preheader } = digestHeader(jobs);
  const jobsUrl = trackedUrl("/jobs", "job_digest");
  const intro = "Posted on the Git City job board this week and picked for your skills.";
  const cards = jobs.slice(0, SHOWN).map((job) => ({
    title: job.title,
    href: trackedUrl(`/jobs/${job.id}`, "job_digest"),
    meta: [
      job.companyName,
      SENIORITY_LABELS[job.seniority] ?? job.seniority,
      LOCATION_TYPE_LABELS[job.locationType] ?? job.locationType,
      formatSalary(job.salaryMin, job.salaryMax, job.currency),
    ]
      .filter(Boolean)
      .join(" · "),
    note: job.matchedSkills.length ? `Matches ${job.matchedSkills.join(", ")}` : undefined,
  }));
  const more = jobs.length > SHOWN ? `And ${plural(jobs.length - SHOWN, "more match", "more matches")} on the job board.` : null;
  const tip = "Add skills to your career profile to sharpen these matches.";
  const reason = "You're getting this weekly because new jobs on Git City match your skills.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading(subject),
      paragraph(intro),
      jobCards(cards),
      `<div style="height:16px; line-height:16px; font-size:0;">&nbsp;</div>`,
      more ? paragraph(more, { muted: true }) : "",
      paragraph(tip, { muted: true }),
      button("Browse all jobs", jobsUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [
      subject,
      "",
      intro,
      "",
      ...cards.flatMap((c) => [c.title, c.meta, ...(c.note ? [c.note] : []), c.href, ""]),
      ...(more ? [more, ""] : []),
      tip,
      "",
      `Browse all jobs: ${jobsUrl}`,
    ],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Weekly email with new jobs that match a developer's skills. */
export async function sendJobDigestNotification(devId: number, login: string, jobs: MatchingJob[]) {
  if (jobs.length === 0) return [];
  const { subject, preheader } = digestHeader(jobs);

  return sendNotification({
    type: "job_digest",
    category: "jobs_digest",
    developerId: devId,
    dedupKey: `job_digest:${devId}:${new Date().toISOString().slice(0, 10)}`,
    title: subject,
    body: preheader,
    render: (links) => renderJobDigestEmail(jobs, links),
    actionUrl: `${EMAIL_BASE_URL}/jobs`,
    priority: "high",
    channels: ["email"],
  });
}
