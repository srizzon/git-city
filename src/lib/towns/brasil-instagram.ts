// ─── Brasil town: comments from Instagram ───────────────────
// A comment on a watched reel (brasil_reels) puts its dev on the map (a city
// reel: just gives them a building in the city), with a reply only when it needs one. Comments
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
//
// Replies (speak): Instagram flagged the account for automated behavior after
// ~3k replies a week (2026-10-21), so the account only answers comments that
// need an answer back (a username GitHub doesn't have, "qual Santa Rita?", a
// vote that can't count yet). Success is silent: the building is on the map.
// At most LIMITS.repliesPerHour replies an hour for everyone, a random 3–8 min
// apart; the rest are logged unanswered. Someone placed gets a DM instead
// (brasil-dm.ts), and a public "te mandei na DM" when the hour has room left.
// BRASIL_IG_REPLIES=off stops them all.

import { getSupabaseAdmin } from "../supabase";
import { instagramCommentText, instagramComments, instagramMe, instagramThread, instagramUsernameOf, replyToComment } from "../instagram";
import { getLeagueBySlug } from "../leagues/service";
import { BRASIL_SLUG, importBrasilComment, type ImportResult, type ReelKind } from "./brasil-server";
import { parseComment, parseVote, pickReading, replyFor, voteIn, voteReply, voteRoute } from "./brasil-comments";
import { candidateByNumber, castVote } from "./brasil-election-server";
import type { UF } from "./brasil-map";
import { answeredCity, confirmedLogin, readComment, suggestLogin, type ThreadLine } from "./comment-ai";
import { captureServer } from "../posthog-server";
import { creditComment, creditStory, residentOfInstagram } from "./brasil-points-server";
import { dmComment } from "./brasil-dm";

export const LIMITS = { perUserHour: 5, repliesPerUserHour: 3, repliesPerHour: 10, modelPerDay: 2_000 } as const;

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
    // A vote for president, on any of the account's posts: a ballot number (voteRoute), or the answer of
    // someone whose vote waits for them to be on the map ("seuuser Recife" under our "not on the map").
    if (c.igUser) {
      try {
        let route = voteRoute(c.text, !!w);
        if (route?.loose && !(await candidateByNumber(route.number))) route = null;
        // Their answer is a reply under our ask; a new comment counts only when it names a username and a
        // place ("GustavoSousa01 Fortaleza"), so a lone "@amigo" never makes them someone else.
        if (!route && (c.parentId || answersAsk(c.text, own))) {
          const waiting = await waitingVote(c.igUser, id);
          if (waiting !== null) route = { number: waiting, join: c.text, loose: false };
        }
        if (route) {
          if (await voteByComment(league, { ...c, igUser: c.igUser, reel: w?.reel ?? c.mediaId }, route.number, route.join, own)) fresh++;
          await credit();
          continue;
        }
      } catch (err) {
        console.error("[brasil] instagram vote", c.id, err);
        await release(id);
        continue;
      }
    }
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

      // Someone already on the map who comments a lone @ is tagging a friend; someone new may be giving their own.
      const onMap = c.igUser ? !!(await residentOfInstagram(league.id, c.igUser)) : false;
      const { reader, ...parsed } = await read(c, own, !onMap);
      const r = await importBrasilComment(league, { id, reel: w.reel, kind: w.kind, igUser: c.igUser, text: c.text, parsed, claimed: true });
      if (!r.fresh) continue;
      await credit();
      fresh++;
      await captureServer(c.igUser ? `ig:${c.igUser}` : `ig-comment:${c.id}`, "brasil_comment_imported", { outcome: r.outcome, reader, kind: w.kind, reply: !!c.parentId });
      if (r.outcome === "added" && r.login) await captureServer(r.login, w.kind === "brasil" ? "brasil_resident_added" : "city_building_from_comment", { uf: r.uf, source: "instagram" });
      const suggestion = r.outcome === "unknown_user" && r.login ? await suggestLogin(r.login) : null;
      const placed = r.outcome === "added" || r.outcome === "already";
      // On the map now: a vote they made from off it counts.
      if (placed && c.igUser && w.kind === "brasil") {
        const waiting = await waitingVote(c.igUser, id);
        const dev = waiting !== null ? await residentOfInstagram(league.id, c.igUser) : null;
        if (waiting !== null && dev && !(await castVote(league.id, { id: dev.id, github_login: dev.login }, waiting))) {
          await captureServer(`ig:${c.igUser}`, "brasil_comment_vote", { linked: true, joined: true, number: waiting, waited: true });
        }
      }
      // Placed gets a DM (brasil-dm.ts), not a public reply; the rest asks them for something.
      if (r.outcome === "added") await dmComment(id, w.kind === "city").catch((err) => console.error("[brasil] dm", c.id, err));
      // The rest asks them for something in public.
      const reply = placed ? null : replyFor(r.outcome, r.login, r.uf, w.kind, suggestion, { city: r.city, founded: r.founded, options: r.options });
      if (!reply) continue;
      if (await speak(id, c, reply)) {
        await captureServer(c.igUser ? `ig:${c.igUser}` : `ig-comment:${c.id}`, "brasil_reply_sent", { outcome: r.outcome, suggested: !!suggestion, kind: w.kind });
      }
    } catch (err) {
      // Free the claim so the next sync tries again: kept, it read "no_login" for good (a username GitHub
      // has, put nowhere, because the map's write or GitHub failed that once).
      console.error("[brasil] instagram comment", c.id, err);
      await release(id);
    }
  }
  return fresh;
}

/**
 * Lets a comment be read again by the next sync: its claim goes while it's still only a claim (nothing
 * placed, voted or answered), so a failure after that (a reply Instagram refused) isn't redone forever.
 */
async function release(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("brasil_comments")
    .delete()
    .eq("id", id)
    .in("outcome", ["no_login", "vote_unlinked"])
    .is("github_login", null)
    .is("developer_id", null)
    .is("replied_at", null);
  if (error) console.error("[brasil] release claim", id, error.message);
}

/** A top-level comment that gives a username beside a place, the way our ask says. */
function answersAsk(text: string, own: string): boolean {
  const mine = new RegExp(`@${own.replace(/[.]/g, "\\.")}\\b`, "gi");
  if (/@/.test(text.replace(mine, ""))) return false;
  const p = parseComment(text, { ignore: [own] });
  return !!p.login && !!(p.uf || p.place);
}

/**
 * Someone who voted in a comment while off the map and was told to give their username: the number they
 * voted for, so the comment that puts them on the map (that answer, or one on a join reel) counts it.
 * Null when nothing waits. Looks at their last few comments of the week on posts that aren't join reels
 * (the vote's), newest first; a vote counted since ends the wait.
 */
async function waitingVote(igUser: string, except: string): Promise<number | null> {
  const { data: rows } = await getSupabaseAdmin()
    .from("brasil_comments")
    .select("id, outcome, reel")
    .eq("ig_user", igUser)
    .neq("id", except)
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<{ id: string; outcome: string; reel: string }[]>();
  const theirs = (rows ?? []).filter((r) => r.outcome.startsWith("vote") || !r.reel.startsWith("http"));
  for (const r of theirs.slice(0, 3)) {
    if (r.outcome === "voted" || r.outcome === "vote_refused") return null;
    const text = await instagramCommentText(r.id.replace(/^ig:/, ""));
    const n = text ? (parseVote(text) ?? voteIn(text)?.number ?? null) : null;
    if (n !== null) return n;
  }
  return null;
}

/**
 * A comment's vote, cast as the Instagram account's dev on the map (the one its comments put there).
 * Someone not on the map yet joins with the same comment when it names a username (`join`: "IanAkiles
 * Manaus 32", or the answer to our "not on the map"); otherwise the reply says how, and their answer
 * counts this vote (waitingVote). One vote a person, as on the site: a later one replaces it. False when
 * the comment was already handled.
 */
async function voteByComment(
  league: { id: string },
  c: IncomingComment & { igUser: string; reel: string },
  number: number,
  join: string | null,
  own: string,
): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const id = `ig:${c.id}`;
  const { error: taken } = await sb.from("brasil_comments").insert({ id, reel: c.reel, ig_user: c.igUser, outcome: "vote_unlinked" });
  if (taken) return false;
  let dev = await residentOfInstagram(league.id, c.igUser);
  let joined: ImportResult | null = null;
  let suggestion: string | null = null;
  if (!dev && join) {
    // A lone @handle is their username only as the answer to our ask (a reply); elsewhere it tags a friend.
    const { reader, ...parsed } = await read({ ...c, text: join }, own, !!c.parentId);
    if (parsed.login) {
      joined = await importBrasilComment(league, { id, reel: c.reel, kind: "brasil", igUser: c.igUser, text: join, parsed, claimed: true });
      await captureServer(`ig:${c.igUser}`, "brasil_comment_imported", { outcome: joined.outcome, reader, kind: "vote", reply: !!c.parentId });
      if (joined.outcome === "added" && joined.login) await captureServer(joined.login, "brasil_resident_added", { uf: joined.uf, source: "instagram" });
      if (joined.outcome === "added" || joined.outcome === "already") dev = await residentOfInstagram(league.id, c.igUser);
      if (joined.outcome === "unknown_user" && joined.login) suggestion = await suggestLogin(joined.login);
    }
  }
  // The log keeps what joining did (residentOfInstagram reads "added" and "already"); a plain vote logs the vote.
  const logVote = (outcome: "voted" | "vote_refused") => (joined ? null : sb.from("brasil_comments").update({ outcome, developer_id: dev?.id ?? null }).eq("id", id));
  let reply: string | null;
  if (dev) {
    const why = await castVote(league.id, { id: dev.id, github_login: dev.login }, number);
    if (why) {
      await logVote("vote_refused");
      reply = voteReply(why.startsWith("Nobody") ? "number" : why.includes("days old") ? "young" : why.startsWith("Put your building") ? "unlinked" : "closed", number);
    } else {
      await logVote("voted");
      // A counted vote is silent (see speak).
      reply = null;
    }
  } else if (joined && joined.outcome !== "added" && joined.outcome !== "already") {
    // Couldn't join with it (a username GitHub doesn't have, "which Santa Rita?"): that reply; the vote keeps waiting.
    reply = replyFor(joined.outcome, joined.login, joined.uf, "brasil", suggestion, { city: joined.city, founded: joined.founded, options: joined.options });
  } else reply = voteReply("unlinked", number);
  await captureServer(`ig:${c.igUser}`, "brasil_comment_vote", { linked: !!dev, joined: !!joined, number });
  if (reply) await speak(id, c, reply);
  return true;
}

/**
 * Answers a comment on Instagram within the limits (see the header): off by BRASIL_IG_REPLIES=off, at most
 * LIMITS.repliesPerUserHour to one person and LIMITS.repliesPerHour to everyone, a random 3–8 min after the
 * last one. `reserve` leaves that many of the hour's replies to others (the DM nudge leaves room for the
 * replies that ask for something). True when it was sent.
 */
export async function speak(id: string, c: IncomingComment, reply: string, reserve = 0): Promise<boolean> {
  if (process.env.BRASIL_IG_REPLIES === "off") return false;
  const sb = getSupabaseAdmin();
  if (c.igUser) {
    const { count } = await sb.from("brasil_comments").select("id", { count: "exact", head: true }).eq("ig_user", c.igUser).gte("replied_at", hourAgo());
    if ((count ?? 0) >= LIMITS.repliesPerUserHour) return false;
  }
  const { data: recent } = await sb
    .from("brasil_comments")
    .select("replied_at")
    .gte("replied_at", hourAgo())
    .order("replied_at", { ascending: false })
    .limit(LIMITS.repliesPerHour)
    .returns<{ replied_at: string }[]>();
  if ((recent ?? []).length >= LIMITS.repliesPerHour - reserve) return false;
  const gap = (3 + Math.random() * 5) * 60_000;
  if (recent?.[0] && Date.now() - new Date(recent[0].replied_at).getTime() < gap) return false;
  // Only production speaks on Instagram: local and preview runs read real comments but just log the reply.
  if (process.env.VERCEL_ENV !== "production") {
    console.info(`[brasil] would reply to ${c.parentId ?? c.id}: ${reply}`);
    return false;
  }
  await replyToComment(c.parentId ?? c.id, reply);
  await sb.from("brasil_comments").update({ replied_at: new Date().toISOString() }).eq("id", id);
  return true;
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
async function read(c: IncomingComment, own: string, loneHandle: boolean): Promise<{ login: string | null; uf: UF | null; place: string | null; reader: "rules" | "model" | "confirm" }> {
  const rules = { ...parseComment(c.text, { ignore: [own], reply: !!c.parentId, loneHandle }), reader: "rules" as const };
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
  if (!reading) return rules;
  // The model's login is checked against the rules (friends' tags, Instagram handles): see pickReading.
  const picked = pickReading(c.text, { login: reading.login, uf: reading.uf, place: reading.place }, rules);
  return picked === rules ? rules : { login: picked.login, uf: picked.uf, place: picked.place, reader: "model" };
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

/** Reads every watched reel's comments, and the week's vote posts', and imports the ones not seen yet. */
export async function syncBrasilReels(ownUserId: string | null): Promise<{ reels: number; fresh: number }> {
  const sb = getSupabaseAdmin();
  const { data: watchedReels } = await sb.from("brasil_reels").select("media_id").eq("watching", true);
  // The posts people voted on this week (logged by their media id, not a reel's link): their comments too.
  const { data: votedOn } = await sb
    .from("brasil_comments")
    .select("reel")
    .in("outcome", ["voted", "vote_unlinked", "vote_refused"])
    .not("reel", "like", "http%")
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .limit(1000);
  const reels = [...new Set([...(watchedReels ?? []).map((r: { media_id: string }) => r.media_id), ...(votedOn ?? []).map((r: { reel: string }) => r.reel)])].map((media_id) => ({ media_id }));
  if (!reels.length) return { reels: 0, fresh: 0 };
  // The account's own comments (its replies) must never count: without the stored account, ask Instagram who it is.
  const me = ownUserId ? null : await instagramMe();
  const own = { id: ownUserId ?? me?.user_id ?? null, username: me?.username?.toLowerCase() ?? null };
  let fresh = 0;
  for (const { media_id } of reels) {
    const all = await instagramComments(media_id);
    // Replies come twice: under their comment (often without who wrote them) and in the list on their own
    // (with who, but not what they answer). One of each, with both.
    const parentOf = new Map(all.flatMap((c) => (c.replies?.data ?? []).map((r) => [r.id, c.id] as const)));
    const byId = new Map<string, IncomingComment & { from?: string; at?: string }>();
    for (const c of all) {
      const parentId = parentOf.get(c.id);
      byId.set(c.id, { id: c.id, mediaId: media_id, text: c.text, igUser: c.from?.username?.toLowerCase() ?? null, from: c.from?.id, at: c.timestamp, ...(parentId ? { parentId } : {}) });
      for (const r of c.replies?.data ?? []) {
        if (!byId.has(r.id) || !byId.get(r.id)!.from) byId.set(r.id, { id: r.id, mediaId: media_id, text: r.text, igUser: r.from?.username?.toLowerCase() ?? null, from: r.from?.id, at: r.timestamp, parentId: c.id });
      }
    }
    const flat = [...byId.values()].filter((c) => c.from && c.from !== own.id && (!own.username || c.igUser !== own.username));
    // Skip the ones already imported up front: the claim insert would refuse them anyway, but one failed insert per old comment every sync filled the db log with errors.
    const seen = await importedIds(flat.map((c) => `ig:${c.id}`));
    // Oldest first, so the first to comment is the first on the map.
    fresh += await handleBrasilComments(flat.filter((c) => !seen.has(`ig:${c.id}`)).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")));
  }
  return { reels: reels.length, fresh };
}
