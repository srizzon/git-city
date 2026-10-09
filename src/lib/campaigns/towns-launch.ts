import { EMAIL_BASE_URL, bulletList, button, buttonSecondary, buttonWide, heading, heroImage, label, paragraph, richParagraph, richText, spacer, trackedUrl } from "../email/components";
import { renderLayout, renderText } from "../email/layout";
import type { CampaignDefinition, CampaignRenderContext } from "./types";
import { PRIZE_CREDITS, PRIZE_SPONSOR, PRIZE_WINNERS } from "../towns/play-rules";
import { SPONSOR } from "../towns/sponsor";
import { BATTLE_START, BATTLE_START_LABEL } from "../towns/rivalry";

const CAMPAIGN = "towns_launch";

// A letter from Samuel launching Git City Towns: what a town is, then the
// opening battle (Claude Code vs Codex), smash, the prize and the live count,
// one button to pick a side and a link to make your own town. Waves run past the
// start, so the date reads as a start or as a fact.
function startLine(now: number): string {
  return now < BATTLE_START ? `Starts ${BATTLE_START_LABEL}.` : `Started ${BATTLE_START_LABEL.replace(/^\w+, /, "")}.`;
}

function fromDate(now: number): string {
  return now < BATTLE_START ? `From ${BATTLE_START_LABEL}` : `Since ${BATTLE_START_LABEL.replace(/^\w+, /, "")}`;
}

/** A real fall: srizzon (Claude, id 1) knocking gxdevs' Codex building down (id 105). The card only renders a logged fall. */
const SMASH_IMAGE = `${EMAIL_BASE_URL}/town/codex-town/demolished-image?a=1&d=105`;

function announce(ctx: CampaignRenderContext, now = Date.now()) {
  const townsUrl = trackedUrl("/towns", CAMPAIGN);
  const newTownUrl = trackedUrl("/towns/new", CAMPAIGN);
  const buildings = ctx.stats.buildings.toLocaleString("en-US");
  const subject = "Git City Towns is live";
  const preheader = "Every crew gets its own city. We start with Claude Code vs Codex.";
  const intro = [
    `Hey @${ctx.login},`,
    `Git City started as one post on X. Today ${buildings} developers have a building in it, you included.`,
  ];
  const launch = ["Now I'm launching ", { hl: "Git City Towns" }, ": a city of its own for every community, group of friends and company."] as const;
  const what = [
    { lead: "Everyone becomes a building.", text: "Join a town with GitHub and your building moves in." },
    { lead: "Build it together.", text: "Streets, plazas, ramps and your logo on every corner, in the editor." },
    { lead: "Drive it.", text: "Every town is a map you can drive through, alone or with your crew." },
    { lead: "Towns compete.", text: "Every week, the town that codes the most takes the monument in the center of Git City." },
  ];
  const war = [
    "We open with a war: ",
    { b: "Claude Code devs against Codex devs" },
    `. ${fromDate(now)}, everything you do in Git City scores for your side, and `,
    { b: "the side with the most points per player wins the week" },
    ".",
  ] as const;
  const smash = [
    "Drive into the other side's town and ",
    { b: "knock their buildings down" },
    ", floor by floor. Every floor scores, and the owner gets an email to hit back.",
  ] as const;
  const prize = PRIZE_SPONSOR
    ? ([
        `${PRIZE_SPONSOR} gives `,
        { hl: `${PRIZE_CREDITS.toLocaleString("en-US")} credits` },
        ` to each of the `,
        { b: `top ${PRIZE_WINNERS} players every week` },
        ". The smaller side gets bonus prize points, so the underdog has a real shot.",
      ] as const)
    : null;
  const sign = ["See you in the city,", "Samuel"];
  const reason = "You're getting this because you have a building in Git City. We only email product news for big launches.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      ...intro.map((l) => paragraph(l)),
      richParagraph([...launch]),
      label("What's a town"),
      bulletList(what),
      label("The first battle"),
      richParagraph([...war]),
      richParagraph([...smash]),
      heroImage({ src: SMASH_IMAGE, href: townsUrl, alt: "srizzon from the Claude side knocked gxdevs' Codex building down." }),
      spacer(20),
      ...(prize ? [label("The prize"), richParagraph([...prize])] : []),
      label("Right now"),
      heroImage({ src: `${EMAIL_BASE_URL}/towns/opengraph-image`, href: townsUrl, alt: "Claude vs Codex: how many devs picked each side." }),
      spacer(24),
      buttonWide("Pick my side", townsUrl),
      buttonSecondary("Create a town for your crew", newTownUrl),
      spacer(28),
      ...sign.map((l) => paragraph(l)),
    ].join("\n"),
    reason,
    links: ctx.links,
    sponsor: SPONSOR,
  });
  const text = renderText({
    lines: [
      ...intro.flatMap((l) => [l, ""]),
      richText([...launch]),
      "",
      "What's a town",
      ...what.map((h) => `- ${h.lead} ${h.text}`),
      "",
      "The first battle",
      richText([...war]),
      "",
      richText([...smash]),
      "",
      ...(prize ? ["The prize", richText([...prize]), ""] : []),
      `Pick my side: ${townsUrl}`,
      `Create a town for your crew: ${newTownUrl}`,
      "",
      ...sign,
    ],
    reason,
    links: ctx.links,
  });
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
