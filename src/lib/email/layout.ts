import { LEGAL_CNPJ, LEGAL_NAME } from "../legal";
import { COLORS, EMAIL_BASE_URL, FONT, escapeHtml } from "./components";

export const CONTACT_EMAIL = "samuel@thegitcity.com";

export interface EmailLinks {
  unsubscribeUrl: string;
}

export interface LayoutOptions {
  /** Browser tab / accessibility title, usually the subject. */
  title: string;
  /** Inbox preview text shown after the subject. Keep it under ~90 chars. */
  preheader: string;
  /** Optional block above the copy, e.g. heroImage(). */
  hero?: string;
  /** Main copy: heading, paragraphs, lists, button. */
  body: string;
  /** Why this person got the email, shown in the footer. */
  reason: string;
  links: EmailLinks;
}

// Invisible filler after the preheader so clients don't pull body text into the preview.
const PREHEADER_PAD = "&#8199;&#847;".repeat(40);

export function renderLayout(opts: LayoutOptions): string {
  const hero = opts.hero
    ? `<tr><td class="px" style="padding:0 20px;">${opts.hero}</td></tr>`
    : "";
  const bodyTop = opts.hero ? 32 : 8;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(opts.title)}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  @media only screen and (max-width: 620px) {
    .h1 { font-size: 24px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:${COLORS.bg}; -webkit-text-size-adjust:100%;">
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${escapeHtml(opts.preheader)}${PREHEADER_PAD}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg};">
<tr><td align="center" style="padding:32px 0 40px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;">
    <tr><td class="px" style="padding:0 20px 20px;">
      <a href="${EMAIL_BASE_URL}"><img src="${EMAIL_BASE_URL}/email/wordmark.png" width="116" height="24" alt="Git City" style="display:block; border:0; color:${COLORS.cream}; font-family:${FONT}; font-size:16px; font-weight:700;"></a>
    </td></tr>
    ${hero}
    <tr><td class="px" style="padding:${bodyTop}px 20px 0;">
      ${opts.body}
    </td></tr>
    <tr><td class="px" style="padding:48px 20px 0;">
      <div style="border-top:1px solid ${COLORS.border}; padding-top:20px; font-family:${FONT}; font-size:13px; line-height:1.6; color:${COLORS.muted};">
        ${escapeHtml(opts.reason)}<br>
        <a href="${EMAIL_BASE_URL}/settings" style="color:${COLORS.muted}; text-decoration:underline;">Email settings</a> &nbsp;&middot;&nbsp; <a href="${escapeHtml(opts.links.unsubscribeUrl)}" style="color:${COLORS.muted}; text-decoration:underline;">Unsubscribe</a><br>
        ${LEGAL_NAME} &middot; CNPJ ${LEGAL_CNPJ} &middot; ${CONTACT_EMAIL}
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** Plain-text part: the same message, the CTA link and the footer. */
export function renderText(opts: { lines: string[]; reason: string; links: EmailLinks }): string {
  return [
    ...opts.lines,
    "",
    "--",
    opts.reason,
    `Email settings: ${EMAIL_BASE_URL}/settings`,
    `Unsubscribe: ${opts.links.unsubscribeUrl}`,
    `${LEGAL_NAME} · CNPJ ${LEGAL_CNPJ} · ${CONTACT_EMAIL}`,
  ].join("\n");
}
