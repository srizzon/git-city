// Building blocks for the dark email design. Every block returns an HTML
// string built from tables and inline styles, the only markup email clients
// render consistently. Pixel art lives in images; all text uses the system font.

export const EMAIL_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export const COLORS = {
  bg: "#0d0d0f",
  raised: "#161618",
  red: "#ef4444",
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

/**
 * Gmail on iOS inverts every color in dark mode, even on dark emails. Text
 * wrapped here gets two black blend layers that undo the inversion; the
 * `u + .body` rules in the layout only match Gmail, and everywhere else the
 * wrapper is a no-op. Only near-white text comes back exact, so accents that
 * must stay lime live in images or solid blocks outside this wrapper.
 */
export function gmailSafe(html: string): string {
  return `<div class="gb-screen"><div class="gb-diff">${html}</div></div>`;
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
  // The frame is a padded gradient background, not a border: Gmail iOS dark mode
  // repaints border colors but leaves gradients alone.
  return `<a href="${escapeHtml(opts.href)}" style="display:block; padding:2px; background-color:${COLORS.border}; background-image:linear-gradient(${COLORS.border},${COLORS.border});">
  <img src="${escapeHtml(opts.src)}" width="556" alt="${escapeHtml(opts.alt)}" style="display:block; width:100%; height:auto; border:0; color:${COLORS.muted}; font-family:${FONT}; font-size:14px;">
</a>`;
}

/** Page title. `highlight` is shown in lime between `text` and `after`, e.g. a handle. */
export function heading(text: string, highlight?: string, after = ""): string {
  const gap = text && highlight ? " " : "";
  const hl = highlight ? `${gap}<span style="color:${COLORS.lime};">${escapeHtml(highlight)}</span>` : "";
  return gmailSafe(`<h1 class="h1" style="margin:0 0 12px; font-family:${FONT}; font-size:28px; line-height:1.2; font-weight:700; color:${COLORS.cream};">${escapeHtml(text)}${hl}${escapeHtml(after)}</h1>`);
}

export function paragraph(text: string, opts: { muted?: boolean } = {}): string {
  const size = opts.muted ? 14 : 16;
  const color = opts.muted ? COLORS.muted : COLORS.warm;
  return gmailSafe(`<p style="margin:0 0 20px; font-family:${FONT}; font-size:${size}px; line-height:1.6; color:${color};">${escapeHtml(text)}</p>`);
}

/** Label / value rows, e.g. a receipt or a job listing's details. */
export function detailRows(rows: { label: string; value: string }[]): string {
  const trs = rows
    .map(
      (r, i) => `<tr>
    <td valign="top" style="padding:10px 12px 10px 0; ${i ? `border-top:1px solid ${COLORS.border};` : ""}">${gmailSafe(`<div style="font-family:${FONT}; font-size:14px; line-height:1.4; color:${COLORS.muted};">${escapeHtml(r.label)}</div>`)}</td>
    <td valign="top" align="right" style="padding:10px 0; ${i ? `border-top:1px solid ${COLORS.border};` : ""}">${gmailSafe(`<div style="font-family:${FONT}; font-size:14px; line-height:1.4; font-weight:600; color:${COLORS.cream}; font-variant-numeric:tabular-nums;">${escapeHtml(r.value)}</div>`)}</td>
  </tr>`,
    )
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px; padding:4px 16px; background-color:${COLORS.raised}; background-image:linear-gradient(${COLORS.raised},${COLORS.raised});">
  ${trs}
</table>`;
}

/** A boxed note with a colored left edge, e.g. a rejection reason or a warning. */
export function callout(text: string, tone: "info" | "warn" = "info"): string {
  const edge = tone === "warn" ? COLORS.red : COLORS.lime;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
  <tr>
    <td width="4" style="background-color:${edge}; font-size:0; line-height:0;">&nbsp;</td>
    <td style="padding:14px 16px; background-color:${COLORS.raised}; background-image:linear-gradient(${COLORS.raised},${COLORS.raised});">${gmailSafe(`<div style="font-family:${FONT}; font-size:15px; line-height:1.6; color:${COLORS.warm};">${escapeHtml(text)}</div>`)}</td>
  </tr>
</table>`;
}

/** Small uppercase label above a group, e.g. "Three ways to climb". */
export function label(text: string): string {
  return gmailSafe(`<p style="margin:0 0 14px; font-family:${FONT}; font-size:13px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:${COLORS.muted};">${escapeHtml(text)}</p>`);
}

/** List with lime pixel bullets. Each item has a bold lead and a plain rest. */
export function bulletList(items: { lead: string; text: string }[]): string {
  const rows = items
    .map((item, i) => {
      const bottom = i === items.length - 1 ? 20 : 14;
      return `<tr>
    <td width="22" valign="top" style="padding:7px 0 0;"><img src="${EMAIL_BASE_URL}/email/bullet.png" width="8" height="8" alt="" style="display:block; border:0;"></td>
    <td style="padding:0 0 ${bottom}px;">${gmailSafe(`<div style="font-family:${FONT}; font-size:16px; line-height:1.5; color:${COLORS.warm};"><strong style="color:${COLORS.cream};">${escapeHtml(item.lead)}</strong> ${escapeHtml(item.text)}</div>`)}</td>
  </tr>`;
    })
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${rows}
</table>`;
}

/** A row of up to three number tiles, e.g. XP this week, streak, visitors. */
export function statTiles(items: { value: string; label: string }[]): string {
  const cells = items
    .map((item, i) => {
      const gap = i === items.length - 1 ? "" : `<td width="8" style="font-size:0; line-height:0;">&nbsp;</td>`;
      return `<td valign="top" width="${Math.floor(100 / items.length)}%" style="padding:14px 12px; background-color:${COLORS.raised}; background-image:linear-gradient(${COLORS.raised},${COLORS.raised});">
      ${gmailSafe(`<div style="font-family:${FONT}; font-size:24px; line-height:1.2; font-weight:700; color:${COLORS.cream}; font-variant-numeric:tabular-nums;">${escapeHtml(item.value)}</div>
      <div style="margin-top:4px; font-family:${FONT}; font-size:12px; line-height:1.4; color:${COLORS.muted};">${escapeHtml(item.label)}</div>`)}
    </td>${gap}`;
    })
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 28px;">
  <tr>${cells}</tr>
</table>`;
}

/**
 * The one call to action: lime block with a darker bottom edge. Kept as a solid
 * color on purpose: Gmail iOS dark mode turns it dark green with white text,
 * which stays readable (a gradient keeps the lime but makes the text unreadable).
 */
export function button(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;">
  <tr><td bgcolor="${COLORS.lime}" style="background-color:${COLORS.lime}; border-bottom:4px solid ${COLORS.limeDark};">
    <a href="${escapeHtml(url)}" style="display:inline-block; padding:14px 28px; font-family:${FONT}; font-size:16px; font-weight:700; color:${COLORS.bg}; text-decoration:none;">${escapeHtml(text)}</a>
  </td></tr>
</table>`;
}
