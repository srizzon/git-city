import "server-only";
import { sendEmail } from "@/lib/resend";
import { COLORS, FONT, button, escapeHtml, gmailSafe, heading, paragraph, trackedUrl } from "@/lib/email/components";
import { renderLayout, renderText, type EmailLinks } from "@/lib/email/layout";
import { ADVERTISER_DASHBOARD_URL } from "@/lib/ad-emails";
import type { Landmark } from "./types";

// Set by hand in the environment; the fallback is the figure hardcoded when
// landmarks shipped (April 2026), not a live number.
const MONTHLY_VISITORS =
  process.env.NEXT_PUBLIC_MONTHLY_VISITOR_COUNT ?? "22,642";

const LINKS: EmailLinks = { settingsUrl: null };

export function renderLandmarkWelcomeEmail(landmark: Landmark) {
  const subject = "Your HQ is live in Git City";
  const preheader = `${landmark.name} is on the map. Here's the link that always shows it.`;
  const deepLink = trackedUrl(`/?landmark=${encodeURIComponent(landmark.slug)}`, "landmark_welcome");
  const dashboardUrl = trackedUrl(ADVERTISER_DASHBOARD_URL, "landmark_welcome");

  const audience = `${MONTHLY_VISITORS} developers visit Git City each month. Starting today, your building is part of the landmark rotation: three landmark spots in the city, reshuffled every 30 minutes.`;
  const share = "The button below opens the city with your HQ always in the lineup. Share it, bookmark it, send it to your team.";
  const analytics = "Views and clicks are in your analytics dashboard.";
  const reason = `You're getting this because you own ${landmark.name}, a sponsored landmark in Git City.`;

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("", landmark.name, " is standing in Git City"),
      paragraph(audience),
      paragraph(share),
      gmailSafe(
        `<p style="margin:0 0 20px; font-family:${FONT}; font-size:14px; line-height:1.6; color:${COLORS.muted};">Views and clicks are in your <a href="${escapeHtml(dashboardUrl)}" style="color:${COLORS.cream}; text-decoration:underline;">analytics dashboard</a>.</p>`,
      ),
      button("View your building", deepLink),
    ].join("\n"),
    reason,
    links: LINKS,
  });

  const text = renderText({
    lines: [
      `${landmark.name} is standing in Git City`,
      "",
      audience,
      "",
      share,
      "",
      `View your building: ${deepLink}`,
      "",
      `${analytics} ${dashboardUrl}`,
    ],
    reason,
    links: LINKS,
  });

  return { subject, preheader, html, text };
}

/**
 * Sends one email per recipient so owners never see each other's addresses.
 * Returns the addresses that failed; throws only when every send failed.
 */
export async function sendWelcomeEmail(landmark: Landmark, recipients: string[]): Promise<string[]> {
  if (recipients.length === 0) {
    throw new Error("No recipients");
  }
  const { subject, html, text } = renderLandmarkWelcomeEmail(landmark);
  const failed: string[] = [];
  let lastError = "";
  for (const to of recipients) {
    const { error } = await sendEmail({ from: "Git City <noreply@thegitcity.com>", to, subject, html, text });
    if (error) {
      failed.push(to);
      lastError = error.message;
    }
  }
  if (failed.length === recipients.length) throw new Error(`Resend error: ${lastError}`);
  return failed;
}
