import { sendNotificationAsync } from "../notifications";
import { getSupabaseAdmin } from "../supabase";
import { EMAIL_BASE_URL, bulletList, button, heading, heroImage, label, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

const STEPS = [
  { lead: "Check in every day.", text: "Your streak keeps the windows lit and unlocks items." },
  { lead: "Raid a rival.", text: "Pick a building, win the fight, take their XP." },
  { lead: "Start a town.", text: "Bring friends and race them every week." },
];

function welcomeHeader(login: string, rank: number | null) {
  const rankText = rank ? `#${rank.toLocaleString("en-US")}` : null;
  return {
    rankText,
    subject: `Your building is live, @${login}`,
    preheader: rankText ? `You're ${rankText} in the city. Here's how to climb.` : "Here's how to climb the city.",
  };
}

export function renderWelcomeEmail(login: string, rank: number | null, links: EmailLinks) {
  const buildingUrl = trackedUrl(`/?user=${encodeURIComponent(login)}`, "welcome");
  const { rankText, subject, preheader } = welcomeHeader(login, rank);
  const intro = `Your building is live${rankText ? ` at rank ${rankText}` : ""}. It grows with every contribution you push to GitHub, and it's already on the map for everyone to see.`;
  const reason = `You're getting this because you claimed @${login} on Git City.`;

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({
      src: `${EMAIL_BASE_URL}/dev/${encodeURIComponent(login)}/opengraph-image`,
      href: buildingUrl,
      alt: `@${login}'s building in Git City${rankText ? `, rank ${rankText}` : ""}`,
    }),
    body: [
      heading("Welcome to the city,", `@${login}`),
      paragraph(intro),
      label("Three ways to climb"),
      bulletList(STEPS),
      button("Visit your building", buildingUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [
      `Welcome to the city, @${login}`,
      "",
      intro,
      "",
      "Three ways to climb:",
      ...STEPS.map((s) => `- ${s.lead} ${s.text}`),
      "",
      `Visit your building: ${buildingUrl}`,
    ],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

export function sendWelcomeNotification(devId: number, login: string) {
  void (async () => {
    const { data } = await getSupabaseAdmin().from("developers").select("rank").eq("id", devId).maybeSingle();
    const rank = typeof data?.rank === "number" && data.rank > 0 ? data.rank : null;
    const { subject, preheader } = welcomeHeader(login, rank);

    sendNotificationAsync({
      type: "welcome",
      category: "transactional",
      developerId: devId,
      dedupKey: `welcome:${devId}`,
      title: subject,
      body: preheader,
      render: (links) => renderWelcomeEmail(login, rank, links),
      actionUrl: `${EMAIL_BASE_URL}/?user=${login}`,
      priority: "high",
      channels: ["email"],
    });
  })().catch((err) => console.error("[welcome] send failed:", err));
}
