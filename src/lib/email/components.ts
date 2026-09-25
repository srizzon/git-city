// Building blocks for the dark email design. Every block returns an HTML
// string built from tables and inline styles, the only markup email clients
// render consistently. Pixel art lives in images; all text uses the system font.

export const EMAIL_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export const COLORS = {
  bg: "#0d0d0f",
  border: "#2a2a30",
  cream: "#e8dcc8",
  warm: "#d4cfc4",
  muted: "#8c8c9c",
  lime: "#c8e64a",
  limeDark: "#8aaa1a",
} as const;

export const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Adds UTM params so visits from each email show up in analytics. */
export function trackedUrl(url: string, campaign: string): string {
  const u = new URL(url, EMAIL_BASE_URL);
  u.searchParams.set("utm_source", "email");
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

/** A full-width linked image, e.g. the player's card. */
export function heroImage(opts: { src: string; href: string; alt: string }): string {
  return `<a href="${escapeHtml(opts.href)}" style="display:block; border:2px solid ${COLORS.border};">
  <img src="${escapeHtml(opts.src)}" width="556" alt="${escapeHtml(opts.alt)}" style="display:block; width:100%; height:auto; border:0; color:${COLORS.muted}; font-family:${FONT}; font-size:14px;">
</a>`;
}

/** Page title. `highlight` is appended in lime, e.g. the player's handle. */
export function heading(text: string, highlight?: string): string {
  const hl = highlight ? ` <span style="color:${COLORS.lime};">${escapeHtml(highlight)}</span>` : "";
  return `<h1 class="h1" style="margin:0 0 12px; font-family:${FONT}; font-size:28px; line-height:1.2; font-weight:700; color:${COLORS.cream};">${escapeHtml(text)}${hl}</h1>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 28px; font-family:${FONT}; font-size:16px; line-height:1.6; color:${COLORS.warm};">${escapeHtml(text)}</p>`;
}

/** Small uppercase label above a group, e.g. "Three ways to climb". */
export function label(text: string): string {
  return `<p style="margin:0 0 14px; font-family:${FONT}; font-size:13px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:${COLORS.muted};">${escapeHtml(text)}</p>`;
}

/** List with lime pixel bullets. Each item has a bold lead and a plain rest. */
export function bulletList(items: { lead: string; text: string }[]): string {
  const rows = items
    .map((item, i) => {
      const bottom = i === items.length - 1 ? 0 : 14;
      return `<tr>
    <td width="22" valign="top" style="padding:7px 0 0;"><div style="width:8px; height:8px; background-color:${COLORS.lime}; font-size:0; line-height:0;">&nbsp;</div></td>
    <td style="padding:0 0 ${bottom}px; font-family:${FONT}; font-size:16px; line-height:1.5; color:${COLORS.warm};"><strong style="color:${COLORS.cream};">${escapeHtml(item.lead)}</strong> ${escapeHtml(item.text)}</td>
  </tr>`;
    })
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${rows}
</table>`;
}

/** The one call to action: lime block with a darker bottom edge. */
export function button(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 0;">
  <tr><td bgcolor="${COLORS.lime}" style="background-color:${COLORS.lime}; border-bottom:4px solid ${COLORS.limeDark};">
    <a href="${escapeHtml(url)}" style="display:inline-block; padding:14px 28px; font-family:${FONT}; font-size:16px; font-weight:700; color:${COLORS.bg}; text-decoration:none;">${escapeHtml(text)}</a>
  </td></tr>
</table>`;
}
