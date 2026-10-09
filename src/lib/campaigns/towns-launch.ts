import { EMAIL_BASE_URL, button, heading, heroImage, paragraph, spacer, trackedUrl } from "../email/components";
import { renderLayout, renderText } from "../email/layout";
import type { CampaignDefinition, CampaignRenderContext } from "./types";
import { PRIZE_CREDITS, PRIZE_SPONSOR, PRIZE_WINNERS } from "../towns/play-rules";
import { SPONSOR } from "../towns/sponsor";
import { BATTLE_START, BATTLE_START_LABEL } from "../towns/rivalry";

const CAMPAIGN = "towns_launch";

// One question, what's at stake, one button (Splatfest's "pick a side"
// announcement: the choice as the headline, the commitment stated plainly).
// Waves run past the start, so the date reads as a start or as a fact.
function startLine(now: number): string {
  return now < BATTLE_START ? `Starts ${BATTLE_START_LABEL}.` : `Started ${BATTLE_START_LABEL.replace(/^\w+, /, "")}.`;
}

function announce(ctx: CampaignRenderContext, now = Date.now()) {
  const townsUrl = trackedUrl("/towns", CAMPAIGN);
  const subject = "Claude or Codex?";
  const preheader = `Pick a side. ${PRIZE_SPONSOR ? `The top ${PRIZE_WINNERS} players each week win ${PRIZE_SPONSOR} credits.` : "Every week, one side wins."}`;
  const lines = [
    `Git City is now a war: Claude Code devs against Codex devs. ${startLine(now)}`,
    "Everything you do counts for your side: coding, raids, visits, knocking buildings down. The side with the most points per player wins the week.",
    ...(PRIZE_SPONSOR
      ? [`The top ${PRIZE_WINNERS} players each week win ${PRIZE_CREDITS.toLocaleString("en-US")} ${PRIZE_SPONSOR} credits. The smaller side gets bonus prize points.`]
      : []),
    "You can only pick one, and it's yours for the week.",
  ];
  const reason = "You're getting this because you have a building in Git City. We only email product news for big launches.";

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({ src: `${EMAIL_BASE_URL}/towns/opengraph-image`, href: townsUrl, alt: "Claude vs Codex: how many devs picked each side." }),
    body: [heading(subject), ...lines.map((l) => paragraph(l)), button("Pick my side", townsUrl)].join("\n"),
    reason,
    links: ctx.links,
    sponsor: SPONSOR,
  });
  const text = renderText({ lines: [subject, "", ...lines.flatMap((l) => [l, ""]), `Pick my side: ${townsUrl}`], reason, links: ctx.links });
  return { subject, preheader, html, text };
}

// Players idle 180+ days: ask before sending them product news again. No
// click and product news turns off for them (campaign "sunset" action).
function repermission(ctx: CampaignRenderContext, now = Date.now()) {
  const subject = "Still want Git City news?";
  const preheader = "Git City is now a war: Claude devs against Codex devs. Want updates like this?";
  const lines = [
    `It's been a while. Git City is now a weekly war: Claude Code devs against Codex devs. ${startLine(now)}`,
    "We'll only keep emailing you about launches like this if you say so.",
  ];
  const skip = "Not interested? Do nothing and we'll stop sending product news.";
  const reason = "You're getting this because you have a building in Git City and haven't visited in a while.";

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({ src: `${EMAIL_BASE_URL}/towns/opengraph-image`, href: ctx.confirmUrl, alt: "Claude vs Codex: how many devs picked each side." }),
    body: [heading(subject), ...lines.map((l) => paragraph(l)), button("Yes, keep me posted", ctx.confirmUrl), spacer(20), paragraph(skip, { muted: true })].join("\n"),
    reason,
    links: ctx.links,
  });
  const text = renderText({ lines: [subject, "", ...lines.flatMap((l) => [l, ""]), `Yes, keep me posted: ${ctx.confirmUrl}`, "", skip], reason, links: ctx.links });
  return { subject, preheader, html, text };
}

export const TOWNS_LAUNCH: CampaignDefinition = {
  slug: "towns-launch",
  topic: "product_news",
  // Engaged first, then outward; each cohort spread over days so a young
  // sending domain never jumps in volume (Resend/Postmark warm-up guides).
  schedule: [
    { cohort: "active30", offsetHours: 0, perDay: 5000 },
    { cohort: "active90", offsetHours: 3, perDay: 5000 },
    { cohort: "active180", offsetHours: 48, perDay: 5000 },
    { cohort: "dormant", offsetHours: 168, perDay: 5000 },
  ],
  variantFor: (cohort) => (cohort === "dormant" ? "repermission" : "announce"),
  render: (variant, ctx) => (variant === "repermission" ? repermission(ctx) : announce(ctx)),
};
