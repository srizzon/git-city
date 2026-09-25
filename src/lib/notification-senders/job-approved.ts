import { sendCompanyEmail } from "@/lib/jobs/send-company-email";
import { COMPANY_LINKS } from "@/lib/jobs/email-blocks";
import { EXPIRY_WARNING_DAYS } from "@/lib/jobs/constants";
import { bulletList, button, detailRows, heading, label, paragraph, trackedUrl } from "@/lib/email/components";
import { renderLayout, renderText, type EmailLinks } from "@/lib/email/layout";

export interface JobApprovedData {
  listingTitle: string;
  listingId: string;
  expiresAt: string;
}

const NEXT_STEPS = [
  { lead: "Developers find it.", text: "It's on the job board and in the weekly matches we send developers whose skills fit." },
  { lead: "Candidates come to you.", text: "When someone applies on Git City, we email you and add them to your dashboard." },
  { lead: "No surprise endings.", text: `We'll remind you ${EXPIRY_WARNING_DAYS} days before the listing expires.` },
];

export function renderJobApprovedEmail(d: JobApprovedData, links: EmailLinks = COMPANY_LINKS) {
  const until = new Date(d.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const subject = `Your listing is live: ${d.listingTitle}`;
  const preheader = `Developers can apply until ${until}. Here's what happens next.`;
  const listingUrl = trackedUrl(`/jobs/${d.listingId}`, "job_approved");
  const intro = "We reviewed your listing and it's now on the Git City job board.";
  const reason = "You're getting this because you posted a listing on Git City Jobs.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("Your listing is live"),
      paragraph(intro),
      detailRows([
        { label: "Listing", value: d.listingTitle },
        { label: "Live until", value: until },
      ]),
      label("What happens next"),
      bulletList(NEXT_STEPS),
      button("View your listing", listingUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [
      "Your listing is live",
      "",
      intro,
      "",
      `Listing: ${d.listingTitle}`,
      `Live until: ${until}`,
      "",
      "What happens next:",
      ...NEXT_STEPS.map((s) => `- ${s.lead} ${s.text}`),
      "",
      `View your listing: ${listingUrl}`,
    ],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent to the company when an admin approves their listing. */
export async function sendJobApprovedEmail(email: string, listingTitle: string, listingId: string, expiresAt: string) {
  const { subject, html, text } = renderJobApprovedEmail({ listingTitle, listingId, expiresAt });
  await sendCompanyEmail({ to: email, subject, html, text, type: "job_approved" });
}
