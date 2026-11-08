// ─── Instagram: comment a word, get the link by DM ──────────
// A Reel that says "comenta HACK que eu te mando o link": whoever comments the
// word gets a private reply with a button (no link: a link in a first DM gets
// hidden as spam), and their tap, which opens Meta's 24h window, gets the link
// with its UTM. The same shape as the Brasil map's DM (towns/brasil-dm.ts),
// through the same breaker and switch (towns/brasil-breaker.ts). Wordings vary
// by the commenter so they don't read as one template.
//
// Pace: one DM a comment (Meta allows one private reply each) and one an
// account a campaign; at most DM.perHour an hour, the rest wait for the
// Brasil DM cron (every 5 minutes), which drains DM.perRun a run. A private
// reply may go up to 7 days after its comment. Only production speaks.
// Server only.

import { getSupabaseAdmin } from "./supabase";
import { privateReply, sendMessage } from "./instagram";
import { captureServer } from "./posthog-server";
import { guarded, mayTalk } from "./towns/brasil-breaker";

export const DM = { perHour: 60, perRun: 5 } as const;
const PAYLOAD = "kw:";
const WEEK_MS = 7 * 24 * 3_600_000;

interface Campaign {
  /** The campaign's id and the word the Reel asks for. */
  word: string;
  /** Any word of the comment that counts, after folding case and accents ("HACK", "Hack!", "#hack", "hackk", "hak", "hackathon"). */
  matches: RegExp;
  url: string;
  utm: { source: string; medium: string; campaign: string };
  button: string;
  opening: string[];
  link: (url: string) => string;
}

const CAMPAIGNS: Campaign[] = [
  {
    word: "hack",
    matches: /^h+a+c*k+/,
    url: "https://hackbrasil.com/",
    utm: { source: "instagram", medium: "dm", campaign: "hackbrasil-reel" },
    button: "Quero o link 🚀",
    opening: [
      "Fala {at}! Bora pro Hack Brasil? 🇧🇷\n\nClica no botão que eu te mando o link 👇",
      "Opa {at}, que bom que você quer entrar no Hack Brasil 🚀\n\nToca aqui embaixo pra receber o link 👇",
      "Fala {at}! O link do Hack Brasil tá separado pra você 😎\n\nClica no botão aqui embaixo 👇",
    ],
    link: (url) =>
      `Tá aqui 👇\n${url}\n\nÉ de graça, sem seleção, e as inscrições vão até 30/11.\n\nE segunda às 19h tem minha live lá no YouTube do Hack Brasil, contando como um hackathon me levou pra gringa 🙌`,
  },
];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The campaign a comment's text asks for, if any. */
export function campaignOf(text: string): Campaign | null {
  const words = fold(text).split(/[^a-z0-9]+/).filter(Boolean);
  return CAMPAIGNS.find((c) => words.some((w) => c.matches.test(w))) ?? null;
}

function withUtm(c: Campaign, mediaId: string): string {
  const u = new URL(c.url);
  u.searchParams.set("utm_source", c.utm.source);
  u.searchParams.set("utm_medium", c.utm.medium);
  u.searchParams.set("utm_campaign", c.utm.campaign);
  u.searchParams.set("utm_content", mediaId);
  return u.toString();
}

function pick(lines: string[], seed: string): string {
  const hash = [...seed].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return lines[hash % lines.length];
}

async function speaking(): Promise<boolean> {
  // Local and preview runs read the same database: only production speaks on Instagram.
  if (process.env.VERCEL_ENV !== "production") return false;
  return mayTalk();
}

async function sentLastHour(): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from("ig_keyword_dms")
    .select("comment_id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", new Date(Date.now() - 3_600_000).toISOString());
  return count ?? 0;
}

interface Row {
  comment_id: string;
  keyword: string;
  media_id: string;
  ig_user: string | null;
  created_at: string;
}

/** One comment's DM: claimed first, skipped when that account already got this campaign's DM. */
async function dmOne(row: Row): Promise<"sent" | "skipped" | "failed"> {
  const c = CAMPAIGNS.find((x) => x.word === row.keyword);
  const sb = getSupabaseAdmin();
  const { data: claimed } = await sb.from("ig_keyword_dms").update({ status: "sending" }).eq("comment_id", row.comment_id).eq("status", "pending").select("comment_id");
  if (!claimed?.length) return "skipped";
  const done = (status: "sent" | "failed" | "skipped") =>
    sb.from("ig_keyword_dms").update({ status, sent_at: status === "sent" ? new Date().toISOString() : null }).eq("comment_id", row.comment_id);
  if (!c || Date.now() - Date.parse(row.created_at) > WEEK_MS) {
    await done("skipped");
    return "skipped";
  }
  if (row.ig_user) {
    const { count } = await sb.from("ig_keyword_dms").select("comment_id", { count: "exact", head: true }).eq("keyword", row.keyword).eq("ig_user", row.ig_user).eq("status", "sent");
    if (count) {
      await done("skipped");
      return "skipped";
    }
  }
  const at = row.ig_user ? `@${row.ig_user}` : "";
  const text = pick(c.opening, row.ig_user ?? row.comment_id).replace("{at}", at).replace(" !", "!").replace(" ,", ",");
  try {
    await guarded(() => privateReply(row.comment_id, text, { title: c.button, payload: `${PAYLOAD}${row.comment_id}` }));
  } catch (err) {
    console.error("[keyword-dm] dm", row.comment_id, err);
    await done("failed");
    return "failed";
  }
  await done("sent");
  await captureServer(`ig:${row.ig_user ?? row.comment_id}`, "ig_keyword_dm_sent", { keyword: row.keyword, media_id: row.media_id });
  return "sent";
}

/** From the webhook: records every comment that asks for a campaign, and sends its DM now while the hour has room. */
export async function handleKeywordComments(comments: { id: string; mediaId: string; text: string; igUser: string | null }[]): Promise<void> {
  const asks = comments.flatMap((cm) => {
    const c = campaignOf(cm.text);
    return c ? [{ comment_id: cm.id, keyword: c.word, media_id: cm.mediaId, ig_user: cm.igUser }] : [];
  });
  if (!asks.length) return;
  const sb = getSupabaseAdmin();
  const { data: rows } = await sb
    .from("ig_keyword_dms")
    .upsert(asks, { onConflict: "comment_id", ignoreDuplicates: true })
    .select("comment_id, keyword, media_id, ig_user, created_at");
  if (!(await speaking())) return;
  for (const row of (rows ?? []) as Row[]) {
    if ((await sentLastHour()) >= DM.perHour) return;
    await dmOne(row);
  }
}

/** From the Brasil DM cron: the next ones the hour's cap held back. */
export async function sendKeywordDms(): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  if (!(await speaking())) return out;
  const room = Math.min(DM.perRun, DM.perHour - (await sentLastHour()));
  if (room <= 0) return out;
  const { data } = await getSupabaseAdmin()
    .from("ig_keyword_dms")
    .select("comment_id, keyword, media_id, ig_user, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(room);
  for (const row of (data ?? []) as Row[]) out[await dmOne(row)]++;
  return out;
}

/** True when a button's payload is ours (the webhook routes the rest to the Brasil map). */
export const isKeywordTap = (payload: string) => payload.startsWith(PAYLOAD);

/** A tap on the DM's button: the link, once. */
export async function handleKeywordTaps(taps: { sender: string; payload: string }[]): Promise<void> {
  if (!(await speaking())) return;
  const sb = getSupabaseAdmin();
  for (const t of taps) {
    const id = t.payload.slice(PAYLOAD.length);
    try {
      const { data: row } = await sb
        .from("ig_keyword_dms")
        .update({ link_sent_at: new Date().toISOString() })
        .eq("comment_id", id)
        .is("link_sent_at", null)
        .select("keyword, media_id, ig_user")
        .maybeSingle<{ keyword: string; media_id: string; ig_user: string | null }>();
      const c = row && CAMPAIGNS.find((x) => x.word === row.keyword);
      if (!row || !c) continue;
      await guarded(() => sendMessage(t.sender, c.link(withUtm(c, row.media_id))));
      await captureServer(`ig:${row.ig_user ?? id}`, "ig_keyword_dm_tapped", { keyword: row.keyword, media_id: row.media_id });
    } catch (err) {
      console.error("[keyword-dm] tap", id, err);
      // Let a second tap try again.
      await sb.from("ig_keyword_dms").update({ link_sent_at: null }).eq("comment_id", id);
    }
  }
}
