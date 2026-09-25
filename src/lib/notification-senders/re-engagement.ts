import { EMAIL_BASE_URL, button, heading, heroImage, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

export type ReEngagementTier = "7d" | "14d" | "30d";

export interface ReEngagementData {
  login: string;
  tier: ReEngagementTier;
  /** Kudos received since they went quiet. */
  kudos: number;
  /** Developers who claimed a building since they went quiet. */
  newDevelopers: number;
}

const n = (v: number) => v.toLocaleString("en-US");

export function reEngagementHeader(d: ReEngagementData) {
  if (d.tier === "7d") {
    return d.kudos > 0
      ? { subject: `You got ${n(d.kudos)} kudos while you were away`, preheader: "It's been a week. Come see who stopped by your building." }
      : { subject: "Your building misses you", preheader: "It's been a week. Today's daily missions are waiting." };
  }
  if (d.tier === "14d") {
    return d.newDevelopers > 0
      ? { subject: `${n(d.newDevelopers)} developers moved in since you left`, preheader: "Two weeks away. Come see how the skyline changed." }
      : { subject: "The city grew while you were away", preheader: "Two weeks away. Come see how the skyline changed." };
  }
  return { subject: `Your building is still here, @${d.login}`, preheader: "It's been a month. This is the last reminder we'll send." };
}

export function renderReEngagementEmail(d: ReEngagementData, links: EmailLinks) {
  const { subject, preheader } = reEngagementHeader(d);
  const url = trackedUrl(`/?user=${encodeURIComponent(d.login)}`, `re_engagement_${d.tier}`);

  const title: [string, string, string] =
    d.tier === "7d" ? ["Your building misses you,", `@${d.login}`, ""]
    : d.tier === "14d" ? ["The city grew while you were away", "", ""]
    : ["It's been a while,", `@${d.login}`, ""];
  const lines: string[] = [];
  if (d.tier === "7d") {
    lines.push("It's been a week since your last visit. Your building is still standing and still grows with every contribution you push to GitHub.");
  } else if (d.tier === "14d") {
    lines.push(
      d.newDevelopers > 0
        ? `It's been two weeks since your last visit, and ${n(d.newDevelopers)} developers have claimed their buildings since then.`
        : "It's been two weeks since your last visit, and new developers have claimed their buildings since then.",
    );
  } else {
    lines.push("It's been over a month since your last visit. Your building is still in the city, and it keeps growing with every contribution you push.");
  }
  if (d.kudos > 0) lines.push(`While you were gone, other developers gave you ${n(d.kudos)} kudos.`);
  const lastNote = d.tier === "30d" ? "This is our last reminder. We won't email you about this again unless you come back." : null;
  const cta = d.tier === "7d" ? "Visit your building" : d.tier === "14d" ? "See what's new" : "Come back to the city";
  const reason = "You're getting this because you opted in to updates from Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({
      src: `${EMAIL_BASE_URL}/dev/${encodeURIComponent(d.login)}/opengraph-image`,
      href: url,
      alt: `@${d.login}'s building in Git City`,
    }),
    body: [
      heading(title[0], title[1] || undefined, title[2]),
      ...lines.map((l) => paragraph(l)),
      lastNote ? paragraph(lastNote, { muted: true }) : "",
      button(cta, url),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [
      title.join(" ").replace(/\s+/g, " ").trim(),
      ...lines.flatMap((l) => ["", l]),
      ...(lastNote ? ["", lastNote] : []),
      "",
      `${cta}: ${url}`,
    ],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}
