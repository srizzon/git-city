import { sendCompanyEmail } from "@/lib/jobs/send-company-email";
import { COMPANY_LINKS } from "@/lib/jobs/email-blocks";
import { bulletList, button, heading, label, paragraph, trackedUrl } from "@/lib/email/components";
import { renderLayout, renderText, type EmailLinks } from "@/lib/email/layout";

export interface JobCompanyWelcomeData {
  email: string;
  companyName: string;
}

const STEPS = [
  { lead: "Post a listing.", text: "We review every listing, usually within 24 hours." },
  { lead: "Meet candidates.", text: "Applicants come with their contact details, skills and GitHub activity." },
  { lead: "Track results.", text: "Views and applications live in your dashboard, plus a weekly report by email." },
];

export function renderJobCompanyWelcomeEmail(d: JobCompanyWelcomeData, links: EmailLinks = COMPANY_LINKS) {
  const subject = "Welcome to Git City Jobs";
  const preheader = `${d.companyName}'s account is ready. Post your first listing.`;
  const postUrl = trackedUrl("/jobs/dashboard/new", "job_company_welcome");
  const intro = `${d.companyName} now has a company account on Git City Jobs. Your listings reach developers who build in public, and every applicant brings their real GitHub history.`;
  const signIn = `Sign in with ${d.email} to reach your dashboard.`;
  const reason = `You're getting this because a Git City admin set up ${d.companyName}'s company account with this email.`;

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("Welcome to Git City Jobs"),
      paragraph(intro),
      label("How it works"),
      bulletList(STEPS),
      paragraph(signIn, { muted: true }),
      button("Post your first job", postUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: ["Welcome to Git City Jobs", "", intro, "", "How it works:", ...STEPS.map((s) => `- ${s.lead} ${s.text}`), "", signIn, "", `Post your first job: ${postUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Sent to a company when an admin links their advertiser account. */
export async function sendJobCompanyWelcomeEmail(email: string, companyName: string) {
  const { subject, html, text } = renderJobCompanyWelcomeEmail({ email, companyName });
  await sendCompanyEmail({ to: email, subject, html, text, type: "job_company_welcome" });
}
