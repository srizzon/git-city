// ─── Brasil town: comments from Instagram ───────────────────
// A comment on a watched reel (brasil_reels) puts its dev on the map (a city
// reel: just gives them a building in the city) and gets a reply. Comments
// arrive by webhook as they're written, and a sync reads the watched reels'
// comments as a safety net for any the webhook missed; either way a comment
// is imported once and answered once (importBrasilComment's `fresh`). The
// account's own comments never count.
//
// Points (brasil-points-server.ts): a comment from someone on the map scores
// on any of the account's posts, watched or not, and the friends it tags are
// remembered for when they join.
//
// Reading one: a "sim" to our suggestion needs nothing more; a one-word
// top-level comment (most of them) goes to the rules; anything else goes to
// the model with its thread (comment-ai.ts), the rules again if the model
// fails or the day's budget is spent. A login that isn't on GitHub gets a
// suggestion ("É o slickinho?") when one is a typo away; a city name several
// states share gets "qual Santa Rita?", and the state in the answer places them.
//
// Limits: per Instagram account, LIMITS.perUserHour comments read and
// LIMITS.repliesPerUserHour replies an hour (the rest are logged, unread or
// unanswered); LIMITS.modelPerDay model reads a day for everyone. Server only.

import { getSupabaseAdmin } from "../supabase";
import { instagramComments, instagramMe, instagramThread, instagramUsernameOf, replyToComment } from "../instagram";
import { getLeagueBySlug } from "../leagues/service";
import { BRASIL_SLUG, importBrasilComment, type ReelKind } from "./brasil-server";
import { parseComment, replyFor } from "./brasil-comments";
import type { UF } from "./brasil-map";
import { answeredCity, confirmedLogin, readComment, suggestLogin, type ThreadLine } from "./comment-ai";
import { captureServer } from "../posthog-server";
import { creditComment, creditStory } from "./brasil-points-server";

export const LIMITS = { perUserHour: 5, repliesPerUserHour: 3, modelPerDay: 2_000 } as const;

export interface IncomingComment {
  id: string;
  mediaId: string;
  text: string;
  igUser: string | null;
  /** The top-level comment it answers (Instagram replies only under top-level ones). */
  parentId?: string;
}

/** The connected account's username (stored when it connected, else asked once). */
let ownCache: string | null = null;
async function ownUsername(): Promise<string> {
  if (ownCache) return ownCache;
  const { data } = await getSupabaseAdmin().from("instagram_account").select("username").eq("id", 1).maybeSingle<{ username: string | null }>();
  ownCache = (data?.username ?? (await instagramMe()).username).toLowerCase();
  return ownCache;
}

const hourAgo = () => new Date(Date.now() - 3_600_000).toISOString();

export async function handleBrasilComments(comments: IncomingComment[]): Promise<number> {
  if (!comments.length) return 0;
  const sb = getSupabaseAdmin();
  const league = await getLeagueBySlug(BRASIL_SLUG);
  if (!league || league.map !== "brasil") return 0;
  const { data: reels } = await sb
    .from("brasil_reels")
    .select("media_id, permalink, kind")
    .eq("watching", true)
    .in("media_id", [...new Set(comments.map((c) => c.mediaId))]);
  const watched = new Map((reels ?? []).map((r: { media_id: string; permalink: string | null; kind: ReelKind }) => [r.media_id, { reel: r.permalink ?? r.media_id, kind: r.kind }]));
  const own = await ownUsername();

  let fresh = 0;
  for (const c of comments) {
    if (c.igUser === own) continue;
    const id = `ig:${c.id}`;
    const credit = () => creditComment(league.id, { id, igUser: c.igUser, text: c.text }, own).catch((err) => console.error("[brasil] comment points", c.id, err));
    const w = watched.get(c.mediaId);
    if (!w) {
      await credit();
      continue;
    }
    try {
      // Claim the comment before reading it: a second delivery of it fails here (the id is the key), and
      // webhooks running at once for one account see each other's claims, so the hourly limit holds.
      const { error: taken } = await sb.from("brasil_comments").insert({ id, reel: w.reel, ig_user: c.igUser, outcome: "no_login" });
      if (taken) continue;
      if (c.igUser) {
        const { data: first } = await sb
          .from("brasil_comments")
          .select("id")
          .eq("ig_user", c.igUser)
          .gte("created_at", hourAgo())
          .order("created_at", { ascending: true })
          .limit(LIMITS.perUserHour);
        if (!(first ?? []).some((r: { id: string }) => r.id === id)) {
          await sb.from("brasil_comments").update({ outcome: "capped" }).eq("id", id);
          await credit();
          continue;
        }
      }

      const { reader, ...parsed } = await read(c, own);
      const r = await importBrasilComment(league, { id, reel: w.reel, kind: w.kind, igUser: c.igUser, text: c.text, parsed, claimed: true });
      if (!r.fresh) continue;
      await credit();
      fresh++;
      await captureServer(c.igUser ? `ig:${c.igUser}` : `ig-comment:${c.id}`, "brasil_comment_imported", { outcome: r.outcome, reader, kind: w.kind, reply: !!c.parentId });
      if (r.outcome === "added" && r.login) await captureServer(r.login, w.kind === "brasil" ? "brasil_resident_added" : "city_building_from_comment", { uf: r.uf, source: "instagram" });
      const suggestion = r.outcome === "unknown_user" && r.login ? await suggestLogin(r.login) : null;
      const reply = replyFor(r.outcome, r.login, r.uf, w.kind, suggestion, { city: r.city, founded: r.founded, options: r.options });
      if (!reply) continue;
      if (c.igUser) {
        const { count } = await sb.from("brasil_comments").select("id", { count: "exact", head: true }).eq("ig_user", c.igUser).gte("replied_at", hourAgo());
        if ((count ?? 0) >= LIMITS.repliesPerUserHour) continue;
      }
      // Only production speaks on Instagram: local and preview runs read real comments but just log the reply.
      if (process.env.VERCEL_ENV !== "production") {
        console.info(`[brasil] would reply to ${c.id}: ${reply}`);
        continue;
      }
      await replyToComment(c.parentId ?? c.id, reply);
      await sb.from("brasil_comments").update({ replied_at: new Date().toISOString() }).eq("id", id);
      await captureServer(c.igUser ? `ig:${c.igUser}` : `ig-comment:${c.id}`, "brasil_reply_sent", { outcome: r.outcome, suggested: !!suggestion, kind: w.kind });
    } catch (err) {
      console.error("[brasil] instagram comment", c.id, err);
    }
  }
  return fresh;
}

/** Stories that tag the account (from the message webhook): each scores for whoever posted it, once a day, when they're on the map. */
export async function handleStoryMentions(stories: { sender: string; mid: string | null }[]): Promise<void> {
  const league = await getLeagueBySlug(BRASIL_SLUG);
  if (!league || league.map !== "brasil") return;
  for (const s of stories) {
    try {
      const igUser = await instagramUsernameOf(s.sender);
      const scored = igUser ? await creditStory(league.id, igUser) : false;
      await captureServer(igUser ? `ig:${igUser}` : `igsid:${s.sender}`, "brasil_story_mention", { scored, known: !!igUser });
    } catch (err) {
      console.error("[brasil] story mention", s.sender, err);
    }
  }
}

/** What a comment says: a yes to our suggestion, the rules for a plain one-word comment, else the model (the rules if it can't). */
async function read(c: IncomingComment, own: string): Promise<{ login: string | null; uf: UF | null; place: string | null; reader: "rules" | "model" | "confirm" }> {
  const rules = { ...parseComment(c.text, { ignore: [own], reply: !!c.parentId }), reader: "rules" as const };
  const plain = c.text.trim().split(/\s+/).length === 1 && !c.text.includes("@");
  if (!c.parentId && plain) return rules;

  let thread: ThreadLine[] = [];
  if (c.parentId) {
    try {
      thread = (await instagramThread(c.parentId)).filter((t) => t.id !== c.id).map((t) => ({ who: t.username === own ? "us" : "them", text: t.text }));
    } catch {
      // no thread: read the comment alone
    }
    const yes = confirmedLogin(c.text, own, thread);
    if (yes) return { login: yes, uf: null, place: null, reader: "confirm" };
    const which = answeredCity(c.text, own, thread);
    if (which) return { ...which, reader: "confirm" };
  }

  const { count } = await getSupabaseAdmin()
    .from("brasil_comments")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= LIMITS.modelPerDay) return rules;
  const reading = await readComment({ text: c.text, commenter: c.igUser, own, thread });
  // The bot's health: how often the model fails and the rules take over.
  if (!reading) await captureServer("brasil-comment-bot", "brasil_comment_model_failed", { reply: !!c.parentId });
  return reading ? { login: reading.login, uf: reading.uf, place: reading.place, reader: "model" } : rules;
}

/** Which of these comment ids brasil_comments already holds. */
async function importedIds(ids: string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await getSupabaseAdmin().from("brasil_comments").select("id").in("id", ids.slice(i, i + 200));
    // A failed read skips nothing: the claim still keeps a comment from being imported twice.
    if (error) return new Set();
    for (const r of (data ?? []) as { id: string }[]) seen.add(r.id);
  }
  return seen;
}

/** Reads every watched reel's comments and imports the ones not seen yet. */
export async function syncBrasilReels(ownUserId: string | null): Promise<{ reels: number; fresh: number }> {
  const { data: reels } = await getSupabaseAdmin().from("brasil_reels").select("media_id").eq("watching", true);
  if (!reels?.length) return { reels: 0, fresh: 0 };
  // The account's own comments (its replies) must never count: without the stored account, ask Instagram who it is.
  const me = ownUserId ? null : await instagramMe();
  const own = { id: ownUserId ?? me?.user_id ?? null, username: me?.username?.toLowerCase() ?? null };
  let fresh = 0;
  for (const { media_id } of (reels ?? []) as { media_id: string }[]) {
    const all = await instagramComments(media_id);
    const flat: IncomingComment[] = all.flatMap((c) => [
      { id: c.id, mediaId: media_id, text: c.text, igUser: c.from?.username?.toLowerCase() ?? null, from: c.from?.id },
      ...(c.replies?.data ?? []).map((r) => ({ id: r.id, mediaId: media_id, text: r.text, igUser: r.from?.username?.toLowerCase() ?? null, from: r.from?.id, parentId: c.id })),
    ]).filter((c) => c.from && c.from !== own.id && (!own.username || c.igUser !== own.username));
    // Skip the ones already imported up front: the claim insert would refuse them anyway, but one failed insert per old comment every sync filled the db log with errors.
    const seen = await importedIds(flat.map((c) => `ig:${c.id}`));
    // Oldest first, so the first to comment is the first on the map.
    fresh += await handleBrasilComments(flat.filter((c) => !seen.has(`ig:${c.id}`)).reverse());
  }
  return { reels: reels?.length ?? 0, fresh };
}
