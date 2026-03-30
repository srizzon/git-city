import { getResend } from "@/lib/resend";
import { wrapInBaseTemplate, buildButton, escapeHtml } from "@/lib/email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";
const FROM = "Git City Jobs <noreply@thegitcity.com>";

interface ApplicationInfo {
  developerLogin: string;
  hasProfile: boolean;
  qualityScore?: number;
  badges?: string[];
}

/**
 * Email sent to the company when a developer applies to their listing.
 * Designed to work with batching: single application = detailed email,
 * batch digest built by the cron from multiple items.
 */
export async function sendJobApplicationReceivedEmail(
  email: string,
  listingTitle: string,
  listingId: string,
  application: ApplicationInfo,
) {
  const profileBadge = application.hasProfile
    ? `<span style="display:inline-block; background:#ecfdf5; color:#059669; font-size:11px; padding:2px 8px; border-radius:3px; font-weight:600;">Has profile</span>`
    : `<span style="display:inline-block; background:#fef3c7; color:#92400e; font-size:11px; padding:2px 8px; border-radius:3px; font-weight:600;">No profile</span>`;

  const scoreLine = application.qualityScore != null
    ? `<p style="margin:0 0 4px; font-size:14px; color:#555555;">Quality score: <strong style="color:#111111;">${application.qualityScore}/100</strong></p>`
    : "";

  const badgesLine = application.badges && application.badges.length > 0
    ? `<p style="margin:0 0 12px; font-size:13px; color:#999999;">${application.badges.join(" &middot; ")}</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">New candidate</p>
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">@${escapeHtml(application.developerLogin)}</h1>
    <p style="margin:0 0 16px; font-size:15px; color:#555555; line-height:1.6;">
      applied to <strong>${escapeHtml(listingTitle)}</strong>
    </p>
    <div style="background-color:#f9fafb; padding:16px; border-radius:6px; margin:0 0 24px;">
      ${scoreLine}
      ${badgesLine}
      <p style="margin:0;">${profileBadge}</p>
    </div>
    ${buildButton("View Candidates", `${BASE_URL}/jobs/dashboard`)}
    <p style="margin:20px 0 0; font-size:12px; color:#999999;">
      View their full profile and GitHub stats in your <a href="${BASE_URL}/jobs/dashboard" style="color:#5a8a00; text-decoration:underline;">dashboard</a>.
    </p>
  `;

  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `New candidate for ${listingTitle}: @${application.developerLogin}`,
    html: wrapInBaseTemplate(bodyHtml),
  });
}

/**
 * Batch digest email: multiple applications received.
 */
export async function sendJobApplicationsBatchEmail(
  email: string,
  listingTitle: string,
  applications: { login: string; hasProfile: boolean }[],
) {
  const withProfile = applications.filter((a) => a.hasProfile).length;
  const total = applications.length;

  const listHtml = applications
    .slice(0, 10)
    .map((a) => {
      const badge = a.hasProfile ? "&#x2705;" : "";
      return `<li style="margin-bottom:4px; font-size:14px; color:#555555;">@${escapeHtml(a.login)} ${badge}</li>`;
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

  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${total} new candidate${total > 1 ? "s" : ""} for ${listingTitle}`,
    html: wrapInBaseTemplate(bodyHtml),
  });
}
