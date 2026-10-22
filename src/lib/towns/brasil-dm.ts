// ─── Brasil town: the DM after a comment ────────────────────
// Someone a comment put on the map gets no public reply (Instagram flagged the
// account for automated behavior after ~3k of them, 2026-10-21): a cron sends
// them a private reply instead, "seu prédio subiu" with a "Ver meu prédio"
// button and no link (a link in a first DM gets hidden as spam). Their tap
// comes back as a message (the webhook), which opens Meta's 24h window, and
// the link goes then.
//
// Pace: one DM an account, ever; at most DM.perHour an hour, DM.perRun a run
// (the cron's every 5 minutes) a random 20–40 s apart. A private reply has to
// go within 7 days of its comment, so the queue keeps whatever the cap holds
// back. BRASIL_IG_REPLIES=off stops these too. Server only.

import { getSupabaseAdmin } from "../supabase";
import { instagramUsernameOf, privateReply, sendMessage } from "../instagram";
import { captureServer } from "../posthog-server";
import { cityOf } from "./br-cities";
import { ptState, type UF } from "./brasil-map";
import { BRASIL_SLUG } from "./brasil-server";

export const DM = { perHour: 60, perRun: 5 } as const;

/** Comments before this got a public reply (or none, capped): they never join the queue. */
const DM_SINCE = "2026-10-22T03:00:00Z";
const SITE = "https://thegitcity.com";
const PAYLOAD = "predio:";

interface Queued {
  id: string;
  reel: string;
  ig_user: string;
  github_login: string;
  uf: string | null;
  ibge: number | null;
  created_at: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function speaking(): boolean {
  if (process.env.BRASIL_IG_REPLIES === "off") return false;
  // Local and preview runs read the same database: only production speaks on Instagram.
  return process.env.VERCEL_ENV === "production";
}

/** The first DM: no link, a button. Wordings picked by the login, so they vary. */
function opening(login: string, where: string | null): string {
  const lines = where
    ? [
        `Pronto, ${login}! Seu prédio subiu ${where} 🏙️ Toca no botão aqui embaixo que eu te mando o link`,
        `${login}, seu prédio já tá no mapa ${where} 🇧🇷 Quer o link pra ver? Toca no botão`,
        `Feito! ${login} agora mora ${where} 🏙️ Toca aqui embaixo pra receber o link do seu prédio`,
      ]
    : [
        `Pronto, ${login}! Seu prédio subiu na Git City 🏙️ Toca no botão aqui embaixo que eu te mando o link`,
        `${login}, seu prédio já tá na cidade 🏙️ Quer o link pra ver? Toca no botão`,
        `Feito! Prédio do ${login} na Git City 🏙️ Toca aqui embaixo pra receber o link`,
      ];
  const hash = [...login].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return lines[hash % lines.length];
}

/** Sends the queue's next DMs within the pace. */
export async function sendBrasilDms(): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  if (!speaking()) return out;
  const sb = getSupabaseAdmin();
  const { count } = await sb
    .from("brasil_comments")
    .select("id", { count: "exact", head: true })
    .eq("dm_status", "sent")
    .gte("dm_sent_at", new Date(Date.now() - 3_600_000).toISOString());
  let budget = Math.min(DM.perRun, DM.perHour - (count ?? 0));
  if (budget <= 0) return out;

  const { data: queue } = await sb
    .from("brasil_comments")
    .select("id, reel, ig_user, github_login, uf, ibge, created_at")
    .eq("outcome", "added")
    .is("dm_status", null)
    .is("replied_at", null)
    .not("ig_user", "is", null)
    .not("github_login", "is", null)
    // A private reply must go within 7 days of the comment; leave an hour's room.
    .gte("created_at", new Date(Math.max(Date.parse(DM_SINCE), Date.now() - 7 * 86_400_000 + 3_600_000)).toISOString())
    .order("created_at", { ascending: true })
    .limit(budget * 3)
    .returns<Queued[]>();
  if (!queue?.length) return out;

  const { data: reels } = await sb.from("brasil_reels").select("media_id, permalink, kind");
  const cityReels = new Set((reels ?? []).filter((r: { kind: string }) => r.kind === "city").flatMap((r: { media_id: string; permalink: string | null }) => [r.media_id, r.permalink]));

  for (const q of queue) {
    if (budget <= 0) break;
    const mark = (dm_status: "sent" | "skipped" | "failed") =>
      sb.from("brasil_comments").update({ dm_status, dm_sent_at: dm_status === "sent" ? new Date().toISOString() : null }).eq("id", q.id);
    // One DM an account, ever.
    const { count: had } = await sb.from("brasil_comments").select("id", { count: "exact", head: true }).eq("ig_user", q.ig_user).eq("dm_status", "sent");
    if (had) {
      await mark("skipped");
      out.skipped++;
      continue;
    }
    const where = cityReels.has(q.reel) ? null : q.ibge !== null && cityOf(q.ibge) ? `em ${cityOf(q.ibge)!.name}` : q.uf ? ptState(q.uf as UF, "in") : "no mapa";
    if (out.sent) await sleep(20_000 + Math.random() * 20_000);
    try {
      await privateReply(q.id.replace(/^ig:/, ""), opening(q.github_login, where), [{ title: "Ver meu prédio 🏙️", payload: `${PAYLOAD}${q.id}` }]);
      await mark("sent");
      out.sent++;
      budget--;
      await captureServer(`ig:${q.ig_user}`, "brasil_dm_sent", { kind: where ? "brasil" : "city" });
    } catch (err) {
      console.error("[brasil] dm", q.id, err);
      await mark("failed");
      out.failed++;
    }
  }
  return out;
}

/** A tap on "Ver meu prédio": the link to their building, once, to the account whose comment it was. */
export async function handleBrasilTaps(taps: { sender: string; payload: string }[]): Promise<void> {
  if (!speaking()) return;
  const sb = getSupabaseAdmin();
  for (const t of taps) {
    if (!t.payload.startsWith(PAYLOAD)) continue;
    const id = t.payload.slice(PAYLOAD.length);
    try {
      const { data: row } = await sb
        .from("brasil_comments")
        .select("reel, ig_user, github_login, link_sent_at")
        .eq("id", id)
        .maybeSingle<{ reel: string; ig_user: string | null; github_login: string | null; link_sent_at: string | null }>();
      if (!row?.github_login || row.link_sent_at) continue;
      if (!row.ig_user || (await instagramUsernameOf(t.sender)) !== row.ig_user) continue;
      const { data: reel } = await sb.from("brasil_reels").select("kind").or(`media_id.eq."${row.reel}",permalink.eq."${row.reel}"`).maybeSingle<{ kind: string }>();
      const login = encodeURIComponent(row.github_login);
      const url = reel?.kind === "city" ? `${SITE}/dev/${login}` : `${SITE}/town/${BRASIL_SLUG}?at=${login}`;
      await sendMessage(t.sender, `Aqui seu prédio 👇\n${url}`);
      await sb.from("brasil_comments").update({ link_sent_at: new Date().toISOString() }).eq("id", id);
      await captureServer(`ig:${row.ig_user}`, "brasil_dm_tapped", { kind: reel?.kind ?? "brasil" });
    } catch (err) {
      console.error("[brasil] dm tap", id, err);
    }
  }
}
