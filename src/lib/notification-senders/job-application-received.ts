import { sendCompanyEmail } from "@/lib/jobs/send-company-email";
import { buildButton, escapeHtml } from "@/lib/email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

interface ApplicationInfo {
  developerLogin: string;
  hasProfile: boolean;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  skills?: string[];
  seniority?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  bio?: string | null;
  resumeUrl?: string | null;
  linkedinUrl?: string | null;
  qualityScore?: number;
  badges?: string[];
}

/**
 * Email sent to the company when a developer applies natively.
 * Includes full profile contact data.
 */
export async function sendJobApplicationReceivedEmail(
  email: string,
  listingTitle: string,
  listingId: string,
  application: ApplicationInfo,
) {
  const fullName = [application.firstName, application.lastName].filter(Boolean).join(" ");
  const displayName = fullName || `@${application.developerLogin}`;

  const profileBadge = application.hasProfile
    ? `<span style="display:inline-block; background:#ecfdf5; color:#059669; font-size:11px; padding:2px 8px; border-radius:3px; font-weight:600;">Has profile</span>`
    : `<span style="display:inline-block; background:#fef3c7; color:#92400e; font-size:11px; padding:2px 8px; border-radius:3px; font-weight:600;">No profile</span>`;

  const scoreLine = application.qualityScore != null
    ? `<p style="margin:0 0 4px; font-size:14px; color:#555555;">Quality score: <strong style="color:#111111;">${application.qualityScore}/100</strong></p>`
    : "";

  const badgesLine = application.badges && application.badges.length > 0
    ? `<p style="margin:0 0 12px; font-size:13px; color:#999999;">${application.badges.map(escapeHtml).join(" &middot; ")}</p>`
    : "";

  // Contact info block (only for native applications with contact data)
  const contactLines: string[] = [];
  if (application.email) contactLines.push(`Email: <a href="mailto:${escapeHtml(application.email)}" style="color:#5a8a00;">${escapeHtml(application.email)}</a>`);
  if (application.phone) contactLines.push(`Phone: ${escapeHtml(application.phone)}`);
  if (application.linkedinUrl) contactLines.push(`LinkedIn: <a href="${escapeHtml(application.linkedinUrl)}" style="color:#5a8a00;">${escapeHtml(application.linkedinUrl)}</a>`);
  if (application.resumeUrl) contactLines.push(`<a href="${escapeHtml(application.resumeUrl)}" style="color:#5a8a00;">Download Resume</a>`);

  const contactBlock = contactLines.length > 0
    ? `<div style="background-color:#f0fdf4; padding:12px 16px; border-radius:6px; margin:0 0 16px;">
        <p style="margin:0 0 8px; font-size:12px; font-weight:bold; color:#059669; text-transform:uppercase; letter-spacing:1px;">Contact</p>
        ${contactLines.map((l) => `<p style="margin:0 0 4px; font-size:14px; color:#333333;">${l}</p>`).join("")}
      </div>`
    : "";

  // Skills & seniority
  const skillsLine = application.skills && application.skills.length > 0
    ? `<p style="margin:0 0 4px; font-size:13px; color:#555555;">Skills: ${escapeHtml(application.skills.slice(0, 10).join(", "))}</p>`
    : "";
  const seniorityLine = application.seniority
    ? `<p style="margin:0 0 4px; font-size:13px; color:#555555;">Seniority: ${escapeHtml(application.seniority)}</p>`
    : "";
  const salaryLine = application.salaryMin && application.salaryMax
    ? `<p style="margin:0 0 4px; font-size:13px; color:#555555;">Salary: ${escapeHtml(application.salaryCurrency ?? "USD")} ${application.salaryMin.toLocaleString()}-${application.salaryMax.toLocaleString()}</p>`
    : "";
  const bioLine = application.bio
    ? `<p style="margin:0 0 0; font-size:13px; color:#777777; font-style:italic;">"${escapeHtml(application.bio.slice(0, 200))}"</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">New candidate</p>
    <h1 style="margin:0 0 4px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(displayName)}</h1>
    <p style="margin:0 0 16px; font-size:14px; color:#999999;">@${escapeHtml(application.developerLogin)}</p>
    <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">
      applied to <strong>${escapeHtml(listingTitle)}</strong>
    </p>
    ${contactBlock}
    <div style="background-color:#f9fafb; padding:16px; border-radius:6px; margin:0 0 24px;">
      ${scoreLine}
      ${badgesLine}
      ${seniorityLine}
      ${skillsLine}
      ${salaryLine}
      ${bioLine}
      <p style="margin:8px 0 0;">${profileBadge}</p>
    </div>
    ${buildButton("View Candidates", `${BASE_URL}/jobs/dashboard`)}
    <p style="margin:20px 0 0; font-size:12px; color:#999999;">
      View their full profile and GitHub stats in your <a href="${BASE_URL}/jobs/dashboard" style="color:#5a8a00; text-decoration:underline;">dashboard</a>.
    </p>
  `;

  const scoreText = application.qualityScore != null ? `Quality score: ${application.qualityScore}/100\n` : "";
  const badgesText = application.badges && application.badges.length > 0 ? `${application.badges.join(", ")}\n` : "";
  const contactText = [
    application.email ? `Email: ${application.email}` : "",
    application.phone ? `Phone: ${application.phone}` : "",
  ].filter(Boolean).join("\n");

  await sendCompanyEmail({
    to: email,
    subject: `New candidate for ${listingTitle}: ${displayName}`,
    html: bodyHtml,
    text: `New candidate for ${listingTitle}: ${displayName} (@${application.developerLogin})\n\n${contactText}\n\n${scoreText}${badgesText}\n\nView Candidates: ${BASE_URL}/jobs/dashboard`,
  });
}

/**
 * Batch digest email: multiple applications received.
 */
export async function sendJobApplicationsBatchEmail(
  email: string,
  listingTitle: string,
  applications: { login: string; hasProfile: boolean; firstName?: string | null; lastName?: string | null }[],
) {
  const withProfile = applications.filter((a) => a.hasProfile).length;
  const total = applications.length;

  const listHtml = applications
    .slice(0, 10)
    .map((a) => {
      const badge = a.hasProfile ? "&#x2705;" : "";
      const name = [a.firstName, a.lastName].filter(Boolean).join(" ");
      const display = name ? `${escapeHtml(name)} (@${escapeHtml(a.login)})` : `@${escapeHtml(a.login)}`;
      return `<li style="margin-bottom:4px; font-size:14px; color:#555555;">${display} ${badge}</li>`;
    })
    .join("");

  const moreText = total > 10
    ? `<p style="color:#999999; font-size:13px;">...and ${total - 10} more</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">New candidates</p>
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${total} new application${total > 1 ? "s" : ""}</h1>
    <p style="margin:0 0 16px; font-size:15px; color:#555555; line-height:1.6;">
      for <strong>${escapeHtml(listingTitle)}</strong>
    </p>
    <p style="margin:0 0 12px; font-size:14px; color:#555555;">
      ${withProfile} of ${total} have a complete career profile.
    </p>
    <ul style="margin:0 0 24px; padding-left:20px; list-style:disc;">
      ${listHtml}
    </ul>
    ${moreText}
    ${buildButton("Review Candidates", `${BASE_URL}/jobs/dashboard`)}
  `;

  const listText = applications
    .slice(0, 10)
    .map((a) => {
      const name = [a.firstName, a.lastName].filter(Boolean).join(" ");
      const display = name ? `${name} (@${a.login})` : `@${a.login}`;
      return `- ${display}${a.hasProfile ? " (has profile)" : ""}`;
    })
    .join("\n");
  const moreLineText = total > 10 ? `\n...and ${total - 10} more` : "";

  await sendCompanyEmail({
    to: email,
    subject: `${total} new candidate${total > 1 ? "s" : ""} for ${listingTitle}`,
    html: bodyHtml,
    text: `${total} new application${total > 1 ? "s" : ""} for ${listingTitle}\n\n${withProfile} of ${total} have a complete career profile.\n\n${listText}${moreLineText}\n\nReview Candidates: ${BASE_URL}/jobs/dashboard`,
  });
}
