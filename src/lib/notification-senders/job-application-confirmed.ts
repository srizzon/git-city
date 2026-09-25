import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, callout, detailRows, heading, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

export interface JobApplicationConfirmedData {
  listingTitle: string;
  companyName: string;
  hasProfile: boolean;
}

function confirmedHeader(d: JobApplicationConfirmedData) {
  return {
    subject: `Application sent to ${d.companyName}`,
    preheader: `${d.listingTitle}. They now have your career profile and contact details.`,
  };
}

export function renderJobApplicationConfirmedEmail(d: JobApplicationConfirmedData, links: EmailLinks) {
  const { subject, preheader } = confirmedHeader(d);
  const applicationsUrl = trackedUrl("/jobs/my-applications", "job_application_confirmed");
  const intro = `${d.companyName} now has your career profile, including your contact details. If they want to move forward, they'll reach out to you directly.`;
  const nudge = d.hasProfile ? null : "Companies read your career profile first. Complete it to stand out.";
  const reason = "You're getting this because you applied to a job on Git City.";
  const rows = [
    { label: "Role", value: d.listingTitle },
    { label: "Company", value: d.companyName },
  ];

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("Your application is in"),
      detailRows(rows),
      paragraph(intro),
      nudge ? callout(nudge) : "",
      button("View my applications", applicationsUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [
      "Your application is in",
      "",
      ...rows.map((r) => `${r.label}: ${r.value}`),
      "",
      intro,
      ...(nudge ? ["", nudge] : []),
      "",
      `View my applications: ${applicationsUrl}`,
    ],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Confirmation to the developer after they apply to a job. */
export function sendJobApplicationConfirmedNotification(
  devId: number,
  login: string,
  listingTitle: string,
  companyName: string,
  listingId: string,
  hasProfile: boolean,
) {
  const data: JobApplicationConfirmedData = { listingTitle, companyName, hasProfile };
  const { subject, preheader } = confirmedHeader(data);

  sendNotificationAsync({
    type: "job_application_confirmed",
    category: "transactional",
    developerId: devId,
    dedupKey: `job_applied:${devId}:${listingId}`,
    title: subject,
    body: preheader,
    render: (links) => renderJobApplicationConfirmedEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/jobs/my-applications`,
    priority: "high",
    forceSend: true,
    channels: ["email"],
  });
}
