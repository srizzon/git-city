import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, bulletList, button, heading, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

function nudgeHeader(appliedCount: number) {
  return {
    subject: `Make your ${appliedCount} applications count`,
    preheader: "Every company you apply to reads your career profile. Here's what to add.",
  };
}

const PROFILE_PARTS = [
  { lead: "Skills and seniority.", text: "They also decide which roles show up in your weekly job matches." },
  { lead: "Experience and projects.", text: "Show what you've shipped beyond your contribution graph." },
  { lead: "Resume and LinkedIn.", text: "They go straight to the company with every application." },
];

export function renderJobProfileNudgeEmail(appliedCount: number, links: EmailLinks) {
  const { subject, preheader } = nudgeHeader(appliedCount);
  const editUrl = trackedUrl("/hire/edit", "job_profile_nudge");
  const intro = `You've applied to ${appliedCount} jobs on Git City. Each of those companies sees your career profile, so the more it says about you, the easier it is for them to say yes.`;
  const reason = "You're getting this because you applied to jobs on Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("Companies read your profile first"), paragraph(intro), bulletList(PROFILE_PARTS), button("Update your profile", editUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: ["Companies read your profile first", "", intro, "", ...PROFILE_PARTS.map((p) => `- ${p.lead} ${p.text}`), "", `Update your profile: ${editUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent once, after a developer's third application, to fill out their career profile. */
export function sendJobProfileNudgeNotification(devId: number, login: string, appliedCount: number) {
  const { subject, preheader } = nudgeHeader(appliedCount);

  sendNotificationAsync({
    type: "job_profile_nudge",
    category: "jobs_updates",
    developerId: devId,
    dedupKey: `job_profile_nudge:${devId}`,
    title: subject,
    body: preheader,
    render: (links) => renderJobProfileNudgeEmail(appliedCount, links),
    actionUrl: `${EMAIL_BASE_URL}/hire/edit`,
    priority: "normal",
    channels: ["email"],
  });
}
