// ─── Brasil town: the DM after a comment ────────────────────
// Someone on the map after a comment (just placed, or already there) gets no
// public reply about it (Instagram flagged the account for automated behavior
// after ~3k of them, 2026-10-21): they get a private reply instead, sent as
// the comment is read, with a "Ver meu prédio" button in the bubble (a button
// template) and no link (a link in a first DM gets hidden as spam). Their tap
// comes back as a postback (the webhook), which opens Meta's 24h window, and
// the link goes then. A DM from an account they don't follow lands in their
// requests, so the comment also gets a public "@them, te mandei o link no
// direct" while the hour's public replies have room (speak,
// brasil-instagram.ts), the newly placed first. Wordings are Sam's.
//
// Pace: one DM an account, ever; at most DM.perHour an hour. Over that, the
// comment waits in the queue a cron empties every 5 minutes (DM.perRun a run):
// a private reply may go up to 7 days after its comment. BRASIL_IG_REPLIES=off
// stops these too. Server only.

import { getSupabaseAdmin } from "../supabase";
import { instagramUsernameOf, privateReply, sendMessage } from "../instagram";
import { captureServer } from "../posthog-server";
import { BRASIL_SLUG } from "./brasil-server";
import { speak } from "./brasil-instagram";

export const DM = { perHour: 60, perRun: 5 } as const;

/** Comments before this got a public reply (or none, capped): they never join the queue. */
const DM_SINCE = "2026-10-22T03:00:00Z";
const SITE = "https://thegitcity.com";
const PAYLOAD = "predio:";

interface Queued {
  id: string;
  outcome: Placed;
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

type Placed = "added" | "already";

/** The first DM: no link, a button. Wordings picked by the login, so they vary. */
function opening(login: string, outcome: Placed, city: boolean): string {
  const lines =
    outcome === "already"
      ? [
          `Fala ${login}! Você já tem lote na Git City 😎\n\nClica no botão que eu te mando o link 👇`,
          `Opa ${login}, seu prédio já tava lá na Git City 🇧🇷\n\nQuer o link pra ver como ele tá? Clica aqui 👇`,
          `Fala ${login}, você já é de casa na Git City 🏙️\n\nToca aqui embaixo pra receber o link e ir derrubar uns prédios 👇`,
        ]
      : city
        ? [
            `Fala ${login}! Seu prédio subiu na Git City 🏙️\n\nClica no botão aqui embaixo que eu te mando o link 👇`,
            `Opa ${login}, você agora é morador da Git City 🏙️\n\nQuer ver seu prédio? Clica no botão aqui 👇`,
            `Fala ${login}, levantei seu prédio na Git City 🏙️\n\nToca aqui embaixo pra receber o link e ver quem tá do seu lado 👇`,
          ]
        : [
            `Fala ${login}! Agora você tem um lote na Git City.\n\nClica no botão aqui embaixo que eu te mando o link 👇`,
            `Opa ${login}, coloquei seu prédio na Git City 🇧🇷\n\nQuer o link pra ver? Clica no botão aqui 👇`,
            `Fala ${login}, agora você tem um barraco na Git City 🇧🇷\n\nToca aqui embaixo pra receber o link e ir derrubar outros prédios 👇`,
          ];
  const hash = [...login].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return lines[hash % lines.length];
}

/** The public "it's in your DM", by their @ (one-word or emoji-only replies read as spam). */
const NUDGES = [
  (at: string) => `@${at} te mandei o link no direct 📩`,
  (at: string) => `Fala @${at}! Coloquei seu prédio, o link tá na sua DM 👇`,
  (at: string) => `@${at} pronto, seu lote tá garantido. Olha o direct 📩`,
  (at: string) => `Opa @${at}, te chamei no direct com o link 👀`,
  (at: string) => `@${at} feito! Corre na DM que o link tá lá 📩`,
  (at: string) => `Fala @${at}, seu prédio subiu. Te mandei o link no direct 🏙️`,
];
/** Public replies the nudge leaves to others: the ones that ask for something (a wrong username, "qual Santa Rita?"), and the newly placed before who was already there. */
const NUDGE_RESERVE: Record<Placed, number> = { added: 3, already: 6 };

/** DMs sent in the last hour, against DM.perHour. */
async function sentLastHour(): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from("brasil_comments")
    .select("id", { count: "exact", head: true })
    .eq("dm_status", "sent")
    .gte("dm_sent_at", new Date(Date.now() - 3_600_000).toISOString());
  return count ?? 0;
}

/** One comment's DM (and its public nudge): skipped when that account already got one. */
async function dmOne(q: Queued, city: boolean): Promise<"sent" | "skipped" | "failed"> {
  const sb = getSupabaseAdmin();
  // Claim it first: the webhook and the cron may reach the same comment at once.
  const { data: claimed } = await sb.from("brasil_comments").update({ dm_status: "skipped" }).eq("id", q.id).is("dm_status", null).select("id");
  if (!claimed?.length) return "skipped";
  const mark = (dm_status: "sent" | "failed") => sb.from("brasil_comments").update({ dm_status, dm_sent_at: dm_status === "sent" ? new Date().toISOString() : null }).eq("id", q.id);
  // One DM an account, ever.
  const { count: had } = await sb.from("brasil_comments").select("id", { count: "exact", head: true }).eq("ig_user", q.ig_user).eq("dm_status", "sent");
  if (had) return "skipped";
  try {
    await privateReply(q.id.replace(/^ig:/, ""), opening(q.github_login, q.outcome, city), { title: "Ver meu prédio 🏙️", payload: `${PAYLOAD}${q.id}` });
  } catch (err) {
    console.error("[brasil] dm", q.id, err);
    await mark("failed");
    return "failed";
  }
  await mark("sent");
  await captureServer(`ig:${q.ig_user}`, "brasil_dm_sent", { kind: city ? "city" : "brasil", outcome: q.outcome });
  const nudge = NUDGES[Math.floor(Math.random() * NUDGES.length)](q.ig_user);
  if (await speak(q.id, { id: q.id.replace(/^ig:/, ""), mediaId: "", text: "", igUser: q.ig_user }, nudge, NUDGE_RESERVE[q.outcome]).catch(() => false)) {
    await captureServer(`ig:${q.ig_user}`, "brasil_dm_nudged", {});
  }
  return "sent";
}

/** The DM right after a comment put someone on the map (brasil-instagram.ts); over the hour's cap, the cron's queue keeps it. */
export async function dmComment(id: string, city: boolean): Promise<void> {
  if (!speaking() || (await sentLastHour()) >= DM.perHour) return;
  const { data: q } = await getSupabaseAdmin()
    .from("brasil_comments")
    .select("id, outcome, reel, ig_user, github_login, uf, ibge, created_at")
    .eq("id", id)
    .in("outcome", ["added", "already"])
    .is("dm_status", null)
    .maybeSingle<Queued>();
  if (q?.ig_user && q.github_login) await dmOne(q, city);
}

/** The queue's next DMs (the ones the hour's cap held back), within the pace. */
export async function sendBrasilDms(): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  if (!speaking()) return out;
  const sb = getSupabaseAdmin();
  let budget = Math.min(DM.perRun, DM.perHour - (await sentLastHour()));
  if (budget <= 0) return out;

  const { data: queue } = await sb
    .from("brasil_comments")
    .select("id, outcome, reel, ig_user, github_login, uf, ibge, created_at")
    .in("outcome", ["added", "already"])
    .is("dm_status", null)
    .is("replied_at", null)
    .not("ig_user", "is", null)
    .not("github_login", "is", null)
    // A private reply must go within 7 days of the comment; leave an hour's room.
    .gte("created_at", new Date(Math.max(Date.parse(DM_SINCE), Date.now() - 7 * 86_400_000 + 3_600_000)).toISOString())
    // Younger than a minute: the webhook is still on it.
    .lte("created_at", new Date(Date.now() - 60_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(budget * 3)
    .returns<Queued[]>();
  if (!queue?.length) return out;

  const { data: reels } = await sb.from("brasil_reels").select("media_id, permalink, kind");
  const cityReels = new Set((reels ?? []).filter((r: { kind: string }) => r.kind === "city").flatMap((r: { media_id: string; permalink: string | null }) => [r.media_id, r.permalink]));

  for (const q of queue) {
    if (budget <= 0) break;
    if (out.sent) await sleep(5_000 + Math.random() * 10_000);
    const r = await dmOne(q, cityReels.has(q.reel));
    out[r]++;
    if (r === "sent") budget--;
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
      await sendMessage(t.sender, `Tá aqui 👇\n${url}\n\nManda esse reel pros devs da sua cidade, quanto mais gente, maior fica o seu bairro 🏙️`);
      await sb.from("brasil_comments").update({ link_sent_at: new Date().toISOString() }).eq("id", id);
      await captureServer(`ig:${row.ig_user}`, "brasil_dm_tapped", { kind: reel?.kind ?? "brasil" });
    } catch (err) {
      console.error("[brasil] dm tap", id, err);
    }
  }
}
