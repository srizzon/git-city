import { sendEmail, toResendTag } from "@/lib/resend";
import { COMPANY_UNSUBSCRIBE_URL } from "./email-blocks";
import { FROM_JOBS } from "../email/senders";

const FROM = FROM_JOBS;

/**
 * Send an email to a company (advertiser) or the jobs admin. `html` is the full
 * email from renderLayout. Companies have no preference system, so the
 * List-Unsubscribe header asks support by email.
 * Throws on a Resend error so callers don't record the email as sent.
 */
export async function sendCompanyEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Email type for Resend analytics, e.g. "job_approved". */
  type: string;
  replyTo?: string;
}) {
  const { error } = await sendEmail({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo,
    headers: {
      "List-Unsubscribe": `<${COMPANY_UNSUBSCRIBE_URL}>`,
    },
    tags: [{ name: "type", value: toResendTag(opts.type) }],
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
