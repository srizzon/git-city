import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, heading, paragraph, statTiles, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

// Emails about a dev's project on the Brasil map: a person approved or
// rejected it after it waited for a look (the form already told them what the
// model decided), and the Monday close (their rank, votes, visits, points).
// In Portuguese, like every email the Brasil map sends.

export type ProjectEmail =
  | { kind: "approved"; developerId: number; login: string; project: { name: string; slug: string }; reason: string | null }
  | { kind: "rejected"; developerId: number; login: string; project: { name: string; slug: string }; reason: string | null }
  | { kind: "week"; developerId: number; login: string; project: { name: string; slug: string }; week: string; rank: number | null; of: number; votes: number; visits: number; points: number };

const pageUrl = (slug: string, campaign: string) => trackedUrl(`/town/brasil-town?project=${encodeURIComponent(slug)}`, campaign);

function header(d: ProjectEmail): { subject: string; preheader: string } {
  if (d.kind === "approved") return { subject: `${d.project.name} tá no ar no mapa dos devs`, preheader: "Já dá pra votar. Compartilha o link pra juntar votos até domingo." };
  if (d.kind === "rejected") return { subject: `${d.project.name} não entrou no mapa`, preheader: d.reason ?? "Ele não passou na revisão." };
  if (d.rank === 1) return { subject: `${d.project.name} foi o projeto da semana`, preheader: `${d.votes} votos e +${d.points} pontos.` };
  if (d.rank && d.rank <= 3) return { subject: `${d.project.name} ficou em ${d.rank}º na semana`, preheader: `${d.votes} votos e +${d.points} pontos.` };
  return { subject: `A semana do ${d.project.name}`, preheader: `${d.votes} votos e ${d.visits} visitas.` };
}

export function renderProjectEmail(d: ProjectEmail, links: EmailLinks) {
  const { subject, preheader } = header(d);
  const url = pageUrl(d.project.slug, `project_${d.kind}`);
  const reason = `Você recebeu porque postou ${d.project.name} no mapa dos devs do Brasil no Git City.`;
  let body: string[];
  let lines: string[];
  if (d.kind === "approved") {
    const p = "A gente olhou e tá tudo certo. Ele compete nos projetos da semana até domingo às 21h; os três mais votados ganham pontos.";
    body = [heading(d.project.name, undefined, " tá no ar."), paragraph(p), button("Ver e compartilhar", url)];
    lines = [subject, "", p, "", `Ver: ${url}`];
  } else if (d.kind === "rejected") {
    const p = `Ele não passou na revisão${d.reason ? `: ${d.reason}` : "."} Se achar que foi engano, edita o projeto e manda de novo.`;
    body = [heading(d.project.name, undefined, " não entrou."), paragraph(p), button("Ver meu projeto", url)];
    lines = [subject, "", p, "", `Ver: ${url}`];
  } else {
    const place = d.rank ? `${d.rank}º de ${d.of}` : `${d.of} projetos`;
    const p = d.rank === 1 ? "Foi o mais votado da semana. O prédio ganhou o selo e o projeto entra nos vencedores." : d.points ? "Ficou entre os três mais votados da semana." : "A semana fechou. Projetos novos competem a partir de agora; o teu continua na lista de todos.";
    body = [
      heading(d.rank === 1 ? "Projeto da" : "A semana do", d.rank === 1 ? "semana" : d.project.name, "."),
      statTiles([
        { value: place, label: "Posição" },
        { value: String(d.votes), label: "Votos" },
        { value: String(d.visits), label: "Visitas" },
        ...(d.points ? [{ value: `+${d.points}`, label: "Pontos" }] : []),
      ]),
      paragraph(p),
      button("Ver no mapa", url),
    ];
    lines = [subject, "", `${place} · ${d.votes} votos · ${d.visits} visitas${d.points ? ` · +${d.points} pontos` : ""}`, p, "", `Ver: ${url}`];
  }
  const html = renderLayout({ title: subject, preheader, body: body.join("\n"), reason, links });
  const text = renderText({ lines, reason, links });
  return { subject, preheader, html, text };
}

export function sendProjectEmail(d: ProjectEmail) {
  if (!d.login) return;
  const { subject, preheader } = header(d);
  sendNotificationAsync({
    type: `brasil_project_${d.kind}`,
    category: "leagues",
    developerId: d.developerId,
    dedupKey: d.kind === "week" ? `brasil_project_week:${d.developerId}:${d.week}` : `brasil_project_${d.kind}:${d.project.slug}`,
    title: subject,
    body: preheader,
    render: (links) => renderProjectEmail(d, links),
    actionUrl: `${EMAIL_BASE_URL}/town/brasil-town?project=${encodeURIComponent(d.project.slug)}`,
    priority: "normal",
    channels: ["email"],
  });
}
