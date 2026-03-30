import { getResend } from "@/lib/resend";
import { wrapInBaseTemplate } from "@/lib/email-template";

const FROM = "Git City Jobs <noreply@thegitcity.com>";

/**
 * Send an email to a company (advertiser). Wraps Resend with:
 * - Base template
 * - Text fallback
 * - List-Unsubscribe header (links to support email)
 */
export async function sendCompanyEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}) {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: wrapInBaseTemplate(opts.html),
    text: opts.text,
    replyTo: opts.replyTo,
    headers: {
      "List-Unsubscribe": "<mailto:support@thegitcity.com?subject=Unsubscribe>",
    },
  });
}
