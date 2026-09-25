import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, heading, heroImage, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

/** XP granted alongside the Hired in the City emblem (see /api/jobs/[id]/candidates/status). */
const HIRED_XP = 500;

export interface JobHiredData {
  login: string;
  companyName: string;
  listingTitle: string;
}

function hiredHeader(d: JobHiredData) {
  return {
    subject: `You're hired at ${d.companyName}`,
    preheader: `Congrats on the ${d.listingTitle} role. You earned the Hired in the City emblem.`,
  };
}

export function renderJobHiredEmail(d: JobHiredData, links: EmailLinks) {
  const { subject, preheader } = hiredHeader(d);
  const buildingUrl = trackedUrl(`/?user=${encodeURIComponent(d.login)}`, "job_hired");
  const intro = `${d.companyName} marked you as hired for ${d.listingTitle}. Congratulations, and good luck in the new role.`;
  const reward = `You earned the Hired in the City emblem and ${HIRED_XP} XP for landing a job through Git City.`;
  const reason = "You're getting this because a company marked you as hired on Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({
      src: `${EMAIL_BASE_URL}/dev/${encodeURIComponent(d.login)}/opengraph-image`,
      href: buildingUrl,
      alt: `@${d.login}'s building in Git City`,
    }),
    body: [heading("You're hired,", `@${d.login}`), paragraph(intro), paragraph(reward), button("Visit your building", buildingUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [`You're hired, @${d.login}`, "", intro, "", reward, "", `Visit your building: ${buildingUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent to a developer when a company marks them as hired. */
export function sendJobHiredNotification(devId: number, login: string, companyName: string, listingTitle: string) {
  const data: JobHiredData = { login, companyName, listingTitle };
  const { subject, preheader } = hiredHeader(data);

  sendNotificationAsync({
    type: "job_hired",
    category: "transactional",
    developerId: devId,
    dedupKey: `job_hired:${devId}:${listingTitle}`,
    title: subject,
    body: preheader,
    render: (links) => renderJobHiredEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/?user=${login}`,
    priority: "high",
    forceSend: true,
    channels: ["email"],
  });
}
