import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, bulletList, button, detailRows, heading, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

export interface EmblemInfo {
  id: string;
  name: string;
  tier: string;
  description?: string | null;
  xpReward?: number | null;
}

export interface EmblemEmailData {
  login: string;
  /** Gold and diamond emblems only; bronze and silver never reach email. */
  emblems: EmblemInfo[];
}

/** Only the top two tiers are worth an email. */
const EMAIL_TIERS = new Set(["gold", "diamond"]);

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

const tierName = (tier: string) => tier.charAt(0).toUpperCase() + tier.slice(1);

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function emblemHeader(d: EmblemEmailData) {
  const [first] = d.emblems;
  if (d.emblems.length === 1) {
    const xp = first.xpReward ? `, worth ${first.xpReward} XP` : "";
    return {
      subject: `You earned ${first.name}`,
      preheader: `A ${first.tier} emblem${xp}. It's in your trophy case now.`,
    };
  }
  return {
    subject: `You earned ${d.emblems.length} emblems`,
    preheader: `${listNames(d.emblems.map((e) => e.name))}. They're in your trophy case now.`,
  };
}

export function renderEmblemEmail(d: EmblemEmailData, links: EmailLinks) {
  const { subject, preheader } = emblemHeader(d);
  const url = trackedUrl(`/dev/${encodeURIComponent(d.login)}`, "emblem_earned");
  const single = d.emblems.length === 1 ? d.emblems[0] : null;
  const reason = "You're getting this because you earned a gold or diamond emblem on Git City.";

  const rows = single
    ? [
        { label: "Tier", value: tierName(single.tier) },
        ...(single.xpReward ? [{ label: "XP", value: `+${single.xpReward}` }] : []),
      ]
    : [];
  const items = d.emblems.map((e) => ({
    lead: `${e.name}.`,
    text: [`${tierName(e.tier)}${e.xpReward ? `, +${e.xpReward} XP` : ""}.`, e.description ? sentence(e.description) : ""].join(" ").trim(),
  }));

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      single ? heading("You earned", single.name) : heading("You earned", `${d.emblems.length} emblems`),
      single?.description ? paragraph(sentence(single.description)) : paragraph(single ? "It's in your trophy case now." : "They're in your trophy case now."),
      single ? detailRows(rows) : bulletList(items),
      button("See your trophy case", url),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: single
      ? [`You earned ${single.name}`, ...(single.description ? ["", sentence(single.description)] : []), "", ...rows.map((r) => `${r.label}: ${r.value}`), "", `See your trophy case: ${url}`]
      : [`You earned ${d.emblems.length} emblems`, "", "They're in your trophy case now.", "", ...items.map((i) => `- ${i.lead} ${i.text}`), "", `See your trophy case: ${url}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** Notify a developer when they earn a gold or diamond emblem. Lower tiers skip email. */
export function sendEmblemNotification(devId: number, login: string, emblems: EmblemInfo[]) {
  const notable = emblems.filter((e) => EMAIL_TIERS.has(e.tier));
  if (notable.length === 0) return;

  const dedupKey = notable.length === 1
    ? `emblem:${devId}:${notable[0].id}`
    : `emblem_batch:${devId}:${notable.map((e) => e.id).sort().join(",")}`;

  const data: EmblemEmailData = { login, emblems: notable };
  const { subject, preheader } = emblemHeader(data);

  sendNotificationAsync({
    type: "emblem_earned",
    category: "social",
    developerId: devId,
    dedupKey,
    title: subject,
    body: preheader,
    render: (links) => renderEmblemEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/dev/${login}`,
    priority: "low",
    channels: ["email"],
    batchKey: `emblems:${devId}`,
    batchWindowMinutes: 30,
    batchEventData: {
      emblems: notable.map((e) => ({ id: e.id, name: e.name, tier: e.tier })),
    },
  });
}
