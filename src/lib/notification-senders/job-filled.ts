import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, heading, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

export interface JobFilledData {
  listingTitle: string;
  companyName: string;
}

function filledHeader(d: JobFilledData) {
  return {
    subject: `Position filled: ${d.listingTitle}`,
    preheader: `${d.companyName} filled the role. There are more open on the job board.`,
  };
}

export function renderJobFilledEmail(d: JobFilledData, links: EmailLinks) {
  const { subject, preheader } = filledHeader(d);
  const jobsUrl = trackedUrl("/jobs", "job_filled");
  const intro = `${d.companyName} has filled the ${d.listingTitle} role you applied to, so it's no longer taking applications. Thanks for putting yourself forward.`;
  const next = "New roles land on the job board every week, and your weekly job matches pick out the ones that fit your skills.";
  const reason = "You're getting this because you applied to this role on Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("This role has been filled"), paragraph(intro), paragraph(next), button("Browse open jobs", jobsUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: ["This role has been filled", "", intro, "", next, "", `Browse open jobs: ${jobsUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/**
 * Sent to developers who applied when a company marks the listing filled.
 * Low priority, batches into a digest. Skips the hired developer.
 */
export function sendJobFilledNotification(devId: number, listingTitle: string, companyName: string) {
  const data: JobFilledData = { listingTitle, companyName };
  const { subject, preheader } = filledHeader(data);

  sendNotificationAsync({
    type: "job_filled",
    category: "jobs_updates",
    developerId: devId,
    dedupKey: `job_filled:${devId}:${listingTitle}`,
    title: subject,
    body: preheader,
    render: (links) => renderJobFilledEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/jobs`,
    priority: "low",
    channels: ["email"],
    batchKey: `job_updates:${devId}`,
    batchWindowMinutes: 60,
    batchEventData: { listing: listingTitle, company: companyName, type: "filled" },
  });
}
