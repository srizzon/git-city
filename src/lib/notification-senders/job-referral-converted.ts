import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, heading, heroImage, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

/** XP granted with the City Recruiter emblem (see /api/jobs/[id]/approve). */
const REFERRAL_XP = 1000;

export interface JobReferralConvertedData {
  login: string;
  companyName: string;
}

function referralHeader(d: JobReferralConvertedData) {
  return {
    subject: `${d.companyName} posted a job through you`,
    preheader: `You earned ${REFERRAL_XP.toLocaleString("en-US")} XP and the City Recruiter emblem.`,
  };
}

export function renderJobReferralConvertedEmail(d: JobReferralConvertedData, links: EmailLinks) {
  const { subject, preheader } = referralHeader(d);
  const buildingUrl = trackedUrl(`/?user=${encodeURIComponent(d.login)}`, "job_referral_converted");
  const intro = `${d.companyName} signed up with your referral link, and their first listing just went live on the Git City job board.`;
  const reward = `That earned you ${REFERRAL_XP.toLocaleString("en-US")} XP and the City Recruiter emblem.`;
  const reason = "You're getting this because a company you referred posted a job on Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({
      src: `${EMAIL_BASE_URL}/dev/${encodeURIComponent(d.login)}/opengraph-image`,
      href: buildingUrl,
      alt: `@${d.login}'s building in Git City`,
    }),
    body: [heading("Your referral paid off,", `@${d.login}`), paragraph(intro), paragraph(reward), button("Visit your building", buildingUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [`Your referral paid off, @${d.login}`, "", intro, "", reward, "", `Visit your building: ${buildingUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent to a developer when a company they referred gets its first listing approved. */
export function sendJobReferralConvertedNotification(devId: number, login: string, companyName: string) {
  const data: JobReferralConvertedData = { login, companyName };
  const { subject, preheader } = referralHeader(data);

  sendNotificationAsync({
    type: "job_referral_converted",
    category: "jobs_updates",
    developerId: devId,
    dedupKey: `job_referral:${devId}:${companyName}`,
    title: subject,
    body: preheader,
    render: (links) => renderJobReferralConvertedEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/?user=${login}`,
    priority: "high",
    channels: ["email"],
  });
}
