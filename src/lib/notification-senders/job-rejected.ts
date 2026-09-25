import { sendCompanyEmail } from "@/lib/jobs/send-company-email";
import { COMPANY_LINKS, JOBS_SUPPORT_EMAIL } from "@/lib/jobs/email-blocks";
import { button, callout, heading, label, paragraph } from "@/lib/email/components";
import { renderLayout, renderText, type EmailLinks } from "@/lib/email/layout";

export interface JobRejectedData {
  listingTitle: string;
  reason: string;
}

export function renderJobRejectedEmail(d: JobRejectedData, links: EmailLinks = COMPANY_LINKS) {
  const subject = `Listing not approved: ${d.listingTitle}`;
  const preheader = "Here's what our review found and how to get it published.";
  const replyUrl = `mailto:${JOBS_SUPPORT_EMAIL}?subject=${encodeURIComponent(`Listing review: ${d.listingTitle}`)}`;
  const intro = `We reviewed ${d.listingTitle} and couldn't publish it as it is.`;
  const next = "Reply with your changes, or tell us if you think we got it wrong. We'll take another look.";
  const reason = "You're getting this because you submitted a listing to Git City Jobs.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("Your listing wasn't approved"),
      paragraph(intro),
      label("Why"),
      callout(d.reason, "warn"),
      paragraph(next),
      button("Reply to our team", replyUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: ["Your listing wasn't approved", "", intro, "", `Why: ${d.reason}`, "", next, "", `Email us: ${JOBS_SUPPORT_EMAIL}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent to the company when an admin rejects their listing. Replies go to support. */
export async function sendJobRejectedEmail(email: string, listingTitle: string, reason: string) {
  const { subject, html, text } = renderJobRejectedEmail({ listingTitle, reason });
  await sendCompanyEmail({ to: email, subject, html, text, type: "job_rejected", replyTo: JOBS_SUPPORT_EMAIL });
}
