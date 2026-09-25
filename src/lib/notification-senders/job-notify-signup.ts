import { sendNotification } from "../notifications";
import { EMAIL_BASE_URL, bulletList, button, heading, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { plural } from "../jobs/email-blocks";

function notifyHeader(jobCount: number) {
  return {
    subject: "Jobs are live on Git City",
    preheader: `${plural(jobCount, "role is", "roles are")} open right now. You asked us to tell you.`,
  };
}

const PROFILE_PERKS = [
  { lead: "Apply in one click.", text: "Companies get your profile and contact details straight away." },
  { lead: "Get weekly matches.", text: "We email you new roles that fit the skills on your profile." },
];

export function renderJobNotifySignupEmail(jobCount: number, links: EmailLinks) {
  const { subject, preheader } = notifyHeader(jobCount);
  const jobsUrl = trackedUrl("/jobs", "job_notify_signup");
  const intro = `The Git City job board is open, with ${plural(jobCount, "role")} from companies hiring developers right now.`;
  const profile = "Set up a career profile to:";
  const reason = "You're getting this because you asked to hear when jobs launched on Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("Jobs are live"), paragraph(intro), paragraph(profile), bulletList(PROFILE_PERKS), button("Browse jobs", jobsUrl)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: ["Jobs are live", "", intro, "", profile, ...PROFILE_PERKS.map((p) => `- ${p.lead} ${p.text}`), "", `Browse jobs: ${jobsUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** One-shot email to developers who signed up to hear when jobs launch (and have no career profile yet). */
export async function sendJobNotifySignupFulfilled(devId: number, jobCount: number) {
  const { subject, preheader } = notifyHeader(jobCount);

  return sendNotification({
    type: "job_notify_fulfilled",
    category: "transactional",
    developerId: devId,
    dedupKey: `job_notify_fulfilled:${devId}`,
    title: subject,
    body: preheader,
    render: (links) => renderJobNotifySignupEmail(jobCount, links),
    actionUrl: `${EMAIL_BASE_URL}/jobs`,
    priority: "high",
    forceSend: true,
    channels: ["email"],
  });
}
