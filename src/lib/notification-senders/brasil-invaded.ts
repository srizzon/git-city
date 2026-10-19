import { getSupabaseAdmin } from "../supabase";
import { sendNotification } from "../notifications";
import { EMAIL_BASE_URL, button, heading, heroImage, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { stateOf, type BrasilLayout, type CityLayout, type UF } from "../towns/brasil-map";
import { CELL_M2 } from "../towns/brasil-paint";
import { pointsWeek } from "../towns/brasil-points";

// "RJ invadiu Curitiba": another state's loop took land in your city in the
// State War. Only to painters (who painted this week or last: someone who
// never played doesn't care whose color their streets are), at most one every
// 3 days each, however many loops. In Portuguese, like everything the Brasil
// campaign says to people. The button puts you in the car at your building.

const EVERY_MS = 3 * 86_400_000;
/** How far from a city's middle (lots, past its radius) a loop still counts as in it. */
const NEAR_LOTS = 12;

export interface BrasilInvadedEmailData {
  attacker: string;
  by: UF;
  victim: UF;
  city: string;
  citySlug: string | null;
  /** Cells taken. */
  cells: number;
}

function header(d: BrasilInvadedEmailData) {
  return {
    subject: `${d.by} invadiu ${d.city}`,
    preheader: `@${d.attacker} pintou um pedaço da tua cidade pro ${stateOf(d.by).name}. Retoma.`,
  };
}

export function renderBrasilInvadedEmail(d: BrasilInvadedEmailData, links: EmailLinks) {
  const { subject, preheader } = header(d);
  const url = trackedUrl("/town/brasil-town?paint=1", "brasil_invaded");
  const m2 = Math.round(d.cells * CELL_M2).toLocaleString("pt-BR");
  const intro = `@${d.attacker} pintou ${m2} m² de ${d.city} pro ${stateOf(d.by).name}. Fecha uma volta em cima e a terra volta pro ${stateOf(d.victim).name}.`;
  const rule = "A guerra fecha domingo às 21h. Ganha o estado com mais terra na média da semana.";
  const reason = "Você recebeu porque pinta o mapa dos devs do Brasil no Git City.";
  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({ src: `${EMAIL_BASE_URL}/town/brasil-town/brasil-og${d.citySlug ? `?cidade=${encodeURIComponent(d.citySlug)}` : ""}`, href: url, alt: subject }),
    body: [heading(`${d.by} invadiu`, d.city, ""), paragraph(intro), button("Retomar", url), `<div style="height:16px; line-height:16px; font-size:0;">&nbsp;</div>`, paragraph(rule, { muted: true })].join("\n"),
    reason,
    links,
  });
  const text = renderText({ lines: [subject, "", intro, "", `Retomar: ${url}`, "", rule], reason, links });
  return { subject, preheader, html, text };
}

/** The city of `uf` a loop around lot (x, z) took land in, or null. */
export function invadedCity(layout: BrasilLayout, uf: UF, x: number, z: number): CityLayout | null {
  let best: CityLayout | null = null;
  let bestD = Infinity;
  for (const c of layout.cities) {
    if (c.uf !== uf || c.devs.length === 0) continue;
    const d = Math.hypot(c.center[0] - x, c.center[1] - z);
    if (d <= c.radius + NEAR_LOTS && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Emails the painters living in the invaded city (each at most once in 3 days). */
export async function notifyInvaded(layout: BrasilLayout, v: { devId: number; by: UF; victim: UF; lots: number; x: number; z: number; at: number }): Promise<void> {
  const city = invadedCity(layout, v.victim, v.x, v.z);
  if (!city) return;
  const sb = getSupabaseAdmin();
  const ids = city.devs.map((d) => d.dev.id).filter((id) => id !== v.devId);
  if (ids.length === 0) return;
  const weeks = [pointsWeek(new Date(v.at)), pointsWeek(new Date(v.at - 7 * 86_400_000))];
  const [{ data: painters }, { data: attacker }] = await Promise.all([
    sb.from("brasil_paint_players").select("developer_id").in("week_start", weeks).in("developer_id", ids).returns<{ developer_id: number }[]>(),
    sb.from("developers").select("github_login").eq("id", v.devId).maybeSingle<{ github_login: string }>(),
  ]);
  if (!attacker) return;
  const to = [...new Set((painters ?? []).map((p) => p.developer_id))];
  const data: BrasilInvadedEmailData = { attacker: attacker.github_login, by: v.by, victim: v.victim, city: city.name, citySlug: city.slug, cells: v.lots };
  const { subject, preheader } = header(data);
  for (const developerId of to) {
    const { data: recent } = await sb
      .from("notification_log")
      .select("id")
      .eq("developer_id", developerId)
      .eq("notification_type", "brasil_invaded")
      .neq("status", "failed")
      .gte("created_at", new Date(Date.now() - EVERY_MS).toISOString())
      .limit(1)
      .maybeSingle();
    if (recent) continue;
    await sendNotification({
      type: "brasil_invaded",
      category: "leagues",
      developerId,
      dedupKey: `brasil_invaded:${developerId}:${Math.floor(Date.now() / EVERY_MS)}`,
      title: subject,
      body: preheader,
      render: (links) => renderBrasilInvadedEmail(data, links),
      actionUrl: `${EMAIL_BASE_URL}/town/brasil-town?paint=1`,
      priority: "high",
      skipCap: true,
      channels: ["email"],
    });
  }
}
