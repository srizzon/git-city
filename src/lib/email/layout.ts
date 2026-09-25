import { LEGAL_CNPJ, LEGAL_NAME } from "../legal";
import { COLORS, EMAIL_BASE_URL, FONT, escapeHtml, gmailSafe } from "./components";

export const CONTACT_EMAIL = "samuel@thegitcity.com";

export interface EmailLinks {
  /** One-click unsubscribe for this email's category. Omit for mail that has none (e.g. sign-in links). */
  unsubscribeUrl?: string;
  /** Where the reader manages email. Defaults to the player settings page; null hides it. */
  settingsUrl?: string | null;
}

function footerLinks(links: EmailLinks): { label: string; url: string }[] {
  const settings = links.settingsUrl === undefined ? `${EMAIL_BASE_URL}/settings` : links.settingsUrl;
  return [
    settings ? { label: "Email settings", url: settings } : null,
    links.unsubscribeUrl ? { label: "Unsubscribe", url: links.unsubscribeUrl } : null,
  ].filter((l): l is { label: string; url: string } => l !== null);
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
  const footer = footerLinks(opts.links)
    .map((l) => `<a href="${escapeHtml(l.url)}" style="color:${COLORS.muted}; text-decoration:underline;">${l.label}</a>`)
    .join(" &nbsp;&middot;&nbsp; ");

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
  u + .body .gb-screen { background:#000; mix-blend-mode:screen; }
  u + .body .gb-diff { background:#000; mix-blend-mode:difference; }
  @media only screen and (max-width: 620px) {
    .h1 { font-size: 24px !important; }
  }
</style>
</head>
<body class="body" style="margin:0; padding:0; background-color:${COLORS.bg}; -webkit-text-size-adjust:100%;">
<u></u>
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${escapeHtml(opts.preheader)}${PREHEADER_PAD}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg}; background-image:linear-gradient(${COLORS.bg},${COLORS.bg});">
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
      <div style="height:1px; line-height:1px; font-size:0; background-color:${COLORS.border}; background-image:linear-gradient(${COLORS.border},${COLORS.border});">&nbsp;</div>
      <div style="padding-top:20px;">${gmailSafe(`<div style="font-family:${FONT}; font-size:13px; line-height:1.6; color:${COLORS.muted};">
        ${escapeHtml(opts.reason)}<br>
        ${footer ? `${footer}<br>` : ""}
        ${LEGAL_NAME} &middot; CNPJ ${LEGAL_CNPJ} &middot; ${CONTACT_EMAIL}
      </div>`)}</div>
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
    ...footerLinks(opts.links).map((l) => `${l.label}: ${l.url}`),
    `${LEGAL_NAME} · CNPJ ${LEGAL_CNPJ} · ${CONTACT_EMAIL}`,
  ].join("\n");
}
