// ─── Brasil town: points, server side ───────────────────────
// Writes the ledger (brasil_points, migration 173) and reads a week back.
// An Instagram account is someone on the map once a comment of theirs put
// a GitHub login there ("added"), or named one already there that no other
// account put there ("already"); everything they do on Instagram after that
// scores for that login. Every row's (kind, ref) is unique, so a webhook
// delivered twice, or the sync reading a comment the webhook already
// brought, never scores twice. Server only.

import { getSupabaseAdmin } from "../supabase";
import { captureServer } from "../posthog-server";
import { loadLeagueStandings } from "../leagues/standings";
import { weekStart } from "../leagues/scoring";
import {
  INVITES_PER_WEEK,
  POINTS,
  POINTS_START,
  brasiliaDay,
  pointsWeek,
  taggedFriends,
  totalOf,
  weekBreakdowns,
  type LedgerKind,
  type PointsBreakdown,
} from "./brasil-points";

/** Scores once per (kind, ref); false when it already had. A failure is logged, never thrown: points never block a join or a reply. */
export async function awardPoints(developerId: number, kind: LedgerKind, ref: string, at = new Date(), points: number = POINTS[kind]): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("brasil_points")
    .insert({ developer_id: developerId, kind, points, ref, week_start: pointsWeek(at), created_at: at.toISOString() });
  if (error) {
    if (error.code !== "23505") console.error("[brasil] points", kind, ref, error.message);
    return false;
  }
  await captureServer(`dev:${developerId}`, "brasil_points_awarded", { kind, points });
  return true;
}

/** The resident an Instagram account plays as, or null (not on the map yet, or never linked). */
export async function residentOfInstagram(leagueId: string, igUser: string): Promise<{ id: number; login: string } | null> {
  const sb = getSupabaseAdmin();
  const { data: link } = await sb
    .from("brasil_comments")
    .select("developer_id, outcome")
    .eq("ig_user", igUser)
    .in("outcome", ["added", "already"])
    .not("developer_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ developer_id: number; outcome: string }>();
  if (!link) return null;
  if (link.outcome === "already") {
    // Naming someone already on the map links only when no other account put them there.
    const { data: other } = await sb
      .from("brasil_comments")
      .select("id")
      .eq("developer_id", link.developer_id)
      .eq("outcome", "added")
      .neq("ig_user", igUser)
      .limit(1)
      .maybeSingle();
    if (other) return null;
  }
  const { data: r } = await sb
    .from("brasil_residents")
    .select("developer_id, developers(github_login)")
    .eq("league_id", leagueId)
    .eq("developer_id", link.developer_id)
    .maybeSingle<{ developer_id: number; developers: { github_login: string } | null }>();
  return r?.developers ? { id: r.developer_id, login: r.developers.github_login } : null;
}

/**
 * A comment from someone on the map, on any of the account's posts: a
 * comment's points (once a Brasília day), and every friend it tags remembered
 * for when they join (the first to tag a friend gets them).
 */
export async function creditComment(leagueId: string, c: { id: string; igUser: string | null; text: string }, own: string): Promise<void> {
  if (!c.igUser) return;
  const dev = await residentOfInstagram(leagueId, c.igUser);
  if (!dev) return;
  const now = new Date();
  await awardPoints(dev.id, "comment", `${dev.id}:${brasiliaDay(now)}`, now);
  const friends = taggedFriends(c.text, [own, c.igUser, dev.login]);
  if (!friends.length) return;
  const sb = getSupabaseAdmin();
  // Someone already playing isn't a friend brought in.
  const { data: known } = await sb.from("brasil_comments").select("ig_user").in("ig_user", friends).in("outcome", ["added", "already"]);
  const playing = new Set((known ?? []).map((k: { ig_user: string }) => k.ig_user));
  const fresh = friends.filter((f) => !playing.has(f));
  if (!fresh.length) return;
  await sb
    .from("brasil_invites")
    .upsert(fresh.map((f) => ({ friend_ig: f, tagger_id: dev.id, comment_id: c.id })), { onConflict: "friend_ig", ignoreDuplicates: true });
}

/** Someone just joined from Instagram: whoever tagged them first gets the friend's points (up to the week's cap). */
export async function creditInvite(friendIg: string, joined: { id: number }): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data: inv } = await sb
    .from("brasil_invites")
    .update({ joined_id: joined.id, joined_at: new Date().toISOString() })
    .eq("friend_ig", friendIg)
    .is("joined_id", null)
    .select("tagger_id")
    .maybeSingle<{ tagger_id: number }>();
  if (!inv || inv.tagger_id === joined.id) return;
  const now = new Date();
  const { count } = await sb
    .from("brasil_points")
    .select("id", { count: "exact", head: true })
    .eq("developer_id", inv.tagger_id)
    .eq("kind", "invite")
    .eq("week_start", pointsWeek(now));
  if ((count ?? 0) >= INVITES_PER_WEEK) return;
  await awardPoints(inv.tagger_id, "invite", friendIg, now);
}

/** A story tagging the account: its points, once a Brasília day. */
export async function creditStory(leagueId: string, igUser: string): Promise<boolean> {
  const dev = await residentOfInstagram(leagueId, igUser);
  if (!dev) return false;
  const now = new Date();
  return awardPoints(dev.id, "story", `${dev.id}:${brasiliaDay(now)}`, now);
}

// ─── Reading a week ─────────────────────────────────────────

interface LedgerRow {
  kind: LedgerKind;
  points: number;
  developers: { github_login: string } | null;
}

async function ledgerOf(week: string): Promise<{ login: string; kind: LedgerKind; points: number }[]> {
  const out: { login: string; kind: LedgerKind; points: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabaseAdmin()
      .from("brasil_points")
      .select("kind, points, developers(github_login)")
      .eq("week_start", week)
      .order("id", { ascending: true })
      .range(from, from + 999)
      .returns<LedgerRow[]>();
    if (error) throw new Error(`brasil ledger: ${error.message}`);
    for (const r of data ?? []) if (r.developers) out.push({ login: r.developers.github_login, kind: r.kind, points: r.points });
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Contributions per day (Mon..Sun) for each member that week: frozen when the week closed, else computed. */
async function daysOf(leagueId: string, week: string): Promise<Map<string, number[]>> {
  const { data } = await getSupabaseAdmin()
    .from("league_weeks")
    .select("standings")
    .eq("league_id", leagueId)
    .eq("week_start", week)
    .maybeSingle<{ standings: { standings?: { login: string; days?: number[] }[] } | null }>();
  const frozen = data?.standings?.standings;
  const rows = frozen?.length ? frozen : (await loadLeagueStandings({ id: leagueId }, new Date(`${week}T00:00:00Z`))).standings;
  return new Map(rows.map((s) => [s.login.toLowerCase(), s.days ?? []]));
}

export interface PointsWeek {
  /** Its Monday (UTC). */
  weekStart: string;
  /** Each dev's points (login lowercase). */
  totals: Record<string, number>;
  breakdown: Record<string, PointsBreakdown>;
}

export async function getPointsWeek(leagueId: string, week: string): Promise<PointsWeek> {
  const [ledger, days] = await Promise.all([ledgerOf(week), daysOf(leagueId, week)]);
  const b = weekBreakdowns(ledger, days);
  return {
    weekStart: week,
    totals: Object.fromEntries([...b].map(([l, x]) => [l, totalOf(x)])),
    breakdown: Object.fromEntries(b),
  };
}

/** The week that elects the offices (the last closed one, from the first points week on) and this week so far. */
export async function getOfficeAndLiveWeeks(leagueId: string, now = new Date()): Promise<{ office: PointsWeek; live: PointsWeek; provisional: boolean }> {
  const thisWeek = weekStart(now).toISOString().slice(0, 10);
  const last = new Date(Date.parse(`${thisWeek}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const live = await getPointsWeek(leagueId, thisWeek);
  if (last < POINTS_START) return { office: live, live, provisional: true };
  return { office: await getPointsWeek(leagueId, last), live, provisional: false };
}
