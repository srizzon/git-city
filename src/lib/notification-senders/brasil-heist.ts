import { sendNotification } from "../notifications";
import { EMAIL_BASE_URL, button, heading, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { BRASIL_SLUG } from "../towns/brasil-server";

// The Brasil map's city of the day: your building fought back. Sent by the
// midnight settle to each owner whose building's shots ended robbers' runs
// that day. One per dev per day.

export interface HeistTurretEmailData {
  busts: number;
  cityName: string;
  day: string;
}

function header(d: HeistTurretEmailData) {
  const n = d.busts === 1 ? "a robber" : `${d.busts} robbers`;
  return {
    subject: `Your building stopped ${n} in ${d.cityName}`,
    preheader: `${d.cityName} was the city of the day. Robbers came for it, your building shot back.`,
  };
}

export function renderHeistTurretEmail(d: HeistTurretEmailData, links: EmailLinks) {
  const { subject, preheader } = header(d);
  const url = trackedUrl(`/town/${BRASIL_SLUG}`, "brasil_heist_turret");
  const intro = `${d.cityName} was the city of the day on the Brasil map. Robbers knocked buildings down there for double points; yours was one of the tallest, so it shot at them.`;
  const reason = "You're getting this because your building is on the Brasil map in Git City.";
  const html = renderLayout({
    title: subject,
    preheader,
    body: [heading("", "Your building", ` stopped ${d.busts === 1 ? "a robber" : `${d.busts} robbers`}`), paragraph(intro), button("See today's city", url)].join("\n"),
    reason,
    links,
  });
  const text = renderText({ lines: [subject, "", intro, "", `See today's city: ${url}`], reason, links });
  return { subject, preheader, html, text };
}

/** "Your building stopped N robbers" (email). One per dev per day. */
export async function sendHeistTurretEmail(opts: HeistTurretEmailData & { developerId: number }) {
  const { developerId, ...data } = opts;
  const { subject, preheader } = header(data);
  return sendNotification({
    type: "brasil_heist_turret",
    category: "leagues",
    developerId,
    dedupKey: `brasil_heist_turret:${developerId}:${data.day}`,
    title: subject,
    body: preheader,
    render: (links) => renderHeistTurretEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/town/${BRASIL_SLUG}`,
    priority: "normal",
    channels: ["email"],
  });
}
