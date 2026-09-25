import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, heading, heroImage, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

/** PX credited to the referrer per referred developer (earn rule "referral", migration 105). */
const REFERRAL_PX = 25;

export interface ReferralJoinedData {
  referrerLogin: string;
  referredLogin: string;
}

function referralHeader(d: ReferralJoinedData) {
  return {
    subject: `@${d.referredLogin} joined through your link`,
    preheader: `You earned ${REFERRAL_PX} PX. Go see their new building.`,
  };
}

export function renderReferralJoinedEmail(d: ReferralJoinedData, links: EmailLinks) {
  const { subject, preheader } = referralHeader(d);
  const url = trackedUrl(`/?user=${encodeURIComponent(d.referredLogin)}`, "referral_joined");
  const intro = `They claimed their building through your invite link, and you earned ${REFERRAL_PX} PX for it. Each developer you invite earns you more.`;
  const cta = `Visit @${d.referredLogin}`;
  const reason = "You're getting this because someone joined Git City through your invite link.";

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({
      src: `${EMAIL_BASE_URL}/dev/${encodeURIComponent(d.referredLogin)}/opengraph-image`,
      href: url,
      alt: `@${d.referredLogin}'s building in Git City`,
    }),
    body: [heading("", `@${d.referredLogin}`, " moved in"), paragraph(intro), button(cta, url)].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [`@${d.referredLogin} moved in`, "", intro, "", `${cta}: ${url}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

export function sendReferralJoinedNotification(
  referrerId: number,
  referrerLogin: string,
  referredLogin: string,
  referredId: number,
) {
  const data: ReferralJoinedData = { referrerLogin, referredLogin };
  const { subject, preheader } = referralHeader(data);

  sendNotificationAsync({
    type: "referral_joined",
    category: "social",
    developerId: referrerId,
    dedupKey: `referral:${referrerId}:${referredId}`,
    title: subject,
    body: preheader,
    render: (links) => renderReferralJoinedEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/?user=${referredLogin}`,
    priority: "normal",
    channels: ["email"],
  });
}
