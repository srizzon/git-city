import "server-only";
import { sendEmail } from "@/lib/resend";
import { wrapInBaseTemplate, buildButton, escapeHtml } from "@/lib/email-template";
import type { Landmark } from "./types";

const BASE_URL = "https://thegitcity.com";
const MONTHLY_VISITORS =
  process.env.NEXT_PUBLIC_MONTHLY_VISITOR_COUNT ?? "22,642";

export function renderWelcomeEmail(landmark: Landmark): { subject: string; html: string } {
  const subject = `Your building is live in Git City`;
  const deepLink = `${BASE_URL}/?landmark=${encodeURIComponent(landmark.slug)}`;
  const dashboard = `${BASE_URL}/ads/dashboard?sponsor=${encodeURIComponent(landmark.slug)}`;

  const body = `
    <h1 style="margin: 0 0 16px; font-family: Helvetica, Arial, sans-serif; font-size: 22px; color: #111;">
      ${escapeHtml(landmark.name)}, your HQ is now standing in Git City.
    </h1>

    <p style="margin: 0 0 14px; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">
      ${escapeHtml(MONTHLY_VISITORS)} developers visit Git City each month.
      Your building is visible in the rotation starting today.
    </p>

    <p style="margin: 0 0 8px; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">
      The button below opens the city and flies the camera straight to your HQ.
      Share it, bookmark it, forward it to your team.
    </p>

    ${buildButton("View your building", deepLink)}

    <p style="margin: 22px 0 0; text-align: center; font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #666;">
      <a href="${escapeHtml(dashboard)}" style="color: #666; text-decoration: underline;">Analytics dashboard</a>
    </p>
  `;

  const html = wrapInBaseTemplate(body);
  return { subject, html };
}

export async function sendWelcomeEmail(
  landmark: Landmark,
  recipients: string[],
): Promise<void> {
  if (recipients.length === 0) {
    throw new Error("No recipients");
  }
  const { subject, html } = renderWelcomeEmail(landmark);
  const { error } = await sendEmail({
    from: "Git City <noreply@thegitcity.com>",
    to: recipients,
    subject,
    html,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
