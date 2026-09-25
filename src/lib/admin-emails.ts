// Internal emails to the Git City owner (sales, inquiries) and the footer the
// manual product-update broadcast adds to hand-written HTML.
import { COLORS, FONT, callout, detailRows, escapeHtml, gmailSafe, heading, label, paragraph } from "./email/components";
import { renderLayout, renderText, type EmailLinks } from "./email/layout";
import { LEGAL_NAME } from "./legal";

const INTERNAL_LINKS: EmailLinks = { settingsUrl: null };

type Row = { label: string; value: string };

/** The submitter's free-text message, line breaks kept. */
function messageBlock(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
  <tr><td style="padding:14px 16px; background-color:${COLORS.raised}; background-image:linear-gradient(${COLORS.raised},${COLORS.raised});">${gmailSafe(`<div style="font-family:${FONT}; font-size:15px; line-height:1.6; color:${COLORS.warm}; white-space:pre-wrap; word-break:break-word;">${escapeHtml(text)}</div>`)}</td></tr>
</table>`;
}

function renderInternal(opts: {
  subject: string;
  preheader: string;
  title: string;
  intro: string;
  warning?: string;
  rows: Row[];
  message?: string;
  footnote?: string;
  reason: string;
}) {
  const html = renderLayout({
    title: opts.subject,
    preheader: opts.preheader,
    body: [
      heading(opts.title),
      paragraph(opts.intro),
      opts.warning ? callout(opts.warning, "warn") : "",
      detailRows(opts.rows),
      opts.message ? label("Message") + messageBlock(opts.message) : "",
      opts.footnote ? paragraph(opts.footnote, { muted: true }) : "",
    ].join("\n"),
    reason: opts.reason,
    links: INTERNAL_LINKS,
  });

  const text = renderText({
    lines: [
      opts.title,
      "",
      opts.intro,
      ...(opts.warning ? ["", opts.warning] : []),
      "",
      ...opts.rows.map((r) => `${r.label}: ${r.value}`),
      ...(opts.message ? ["", "Message:", opts.message] : []),
      ...(opts.footnote ? ["", opts.footnote] : []),
    ],
    reason: opts.reason,
    links: INTERNAL_LINKS,
  });

  return { subject: opts.subject, preheader: opts.preheader, html, text };
}

const fmtDate = (d: Date) =>
  d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

// ── Ad package sale (Stripe checkout) ──

export interface AdSaleData {
  packageLabel: string;
  isLandmark: boolean;
  /** Formatted total, e.g. "$49.00" or "R$249.00". */
  total: string;
  currency: string;
  customerEmail: string | null;
  vehicles: string[];
  adIds: string[];
  subscriptionId: string | null;
  startsAt: Date;
  endsAt: Date;
}

export function renderAdSaleEmail(d: AdSaleData) {
  const subject = d.isLandmark
    ? `Landmark sale, build needed: ${d.total}/mo`
    : `New ${d.packageLabel} sale: ${d.total}/mo`;
  return renderInternal({
    subject,
    preheader: `${d.customerEmail ?? "Unknown customer"} bought ${d.packageLabel}, ${d.adIds.length} ${d.adIds.length === 1 ? "ad" : "ads"}.`,
    title: d.isLandmark ? "New landmark sale" : `New ${d.packageLabel} sale`,
    intro: `${d.customerEmail ?? "A customer"} paid ${d.total}/mo for the ${d.packageLabel} package.`,
    warning: d.isLandmark ? "Landmark package: build the custom 3D building and post it on Instagram and X." : undefined,
    rows: [
      { label: "Package", value: d.packageLabel },
      { label: "Amount", value: `${d.total}/mo` },
      { label: "Currency", value: d.currency.toUpperCase() },
      { label: "Customer", value: d.customerEmail ?? "unknown" },
      { label: "Vehicles", value: d.vehicles.length ? d.vehicles.join(", ") : "?" },
      { label: "Starts", value: fmtDate(d.startsAt) },
      { label: "Ends", value: fmtDate(d.endsAt) },
    ],
    footnote: `Ad IDs: ${d.adIds.join(", ")}. Subscription: ${d.subscriptionId ?? "none"}.`,
    reason: "Internal: sent to the Git City owner on every ad package sale.",
  });
}

// ── Contact forms ──

export interface LandmarkInquiry {
  name: string;
  email: string;
  company: string;
  website: string;
  message: string;
}

export function renderLandmarkInquiryEmail(d: LandmarkInquiry) {
  return renderInternal({
    subject: `Landmark inquiry: ${d.company} (${d.name})`,
    preheader: `${d.name} from ${d.company} wants a landmark building. Reply to answer them.`,
    title: "New landmark inquiry",
    intro: "Someone wants a landmark building in Git City. Reply to this email to answer them.",
    rows: [
      { label: "Name", value: d.name },
      { label: "Email", value: d.email },
      { label: "Company", value: d.company },
      { label: "Website", value: d.website },
    ],
    message: d.message,
    reason: "Internal: sent from the landmark contact form on /advertise.",
  });
}

export interface SponsorshipInquiry extends LandmarkInquiry {
  role: string;
  formatInterest: string;
  budget: string;
}

export function renderSponsorshipInquiryEmail(d: SponsorshipInquiry) {
  const rows: Row[] = [
    { label: "Name", value: d.name },
    { label: "Email", value: d.email },
    { label: "Company", value: d.company },
    ...(d.role ? [{ label: "Role", value: d.role }] : []),
    { label: "Website", value: d.website },
    { label: "Format", value: d.formatInterest },
    ...(d.budget ? [{ label: "Budget", value: d.budget }] : []),
  ];
  return renderInternal({
    subject: `Sponsorship inquiry: ${d.company} (${d.name}), ${d.formatInterest}`,
    preheader: `${d.name} from ${d.company} is interested in ${d.formatInterest}. Reply to answer them.`,
    title: "New sponsorship inquiry",
    intro: "Someone wants to sponsor Git City. Reply to this email to answer them.",
    rows,
    message: d.message,
    reason: "Internal: sent from the contact form on /sponsorship.",
  });
}

// ── Product-update broadcast footer ──

/**
 * Adds the unsubscribe footer to a hand-written product update. Goes before the
 * last </body> (any case); HTML without one gets it appended at the end.
 */
export function withUnsubscribeFooter(html: string, unsubscribeUrl: string): string {
  const url = escapeHtml(unsubscribeUrl);
  const footer = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg}; background-image:linear-gradient(${COLORS.bg},${COLORS.bg});">
<tr><td align="center" style="padding:24px 20px 40px; font-family:${FONT}; font-size:13px; line-height:1.6; color:${COLORS.muted};">
You're getting this product update because you claimed your building on Git City.<br>
<a href="${url}" style="color:${COLORS.warm}; text-decoration:underline;">Unsubscribe from product updates</a> &nbsp;&middot;&nbsp; ${escapeHtml(LEGAL_NAME)}
</td></tr>
</table>`;

  const closes = [...html.matchAll(/<\/body\s*>/gi)];
  const last = closes[closes.length - 1];
  if (last?.index === undefined) return `${html}\n${footer}`;
  return `${html.slice(0, last.index)}${footer}\n${html.slice(last.index)}`;
}
