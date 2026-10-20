// ─── Brasil town: projects, server side ─────────────────────
// Reads and writes the projects (migration 182): posting one (screened by
// brasil-projects-check.ts before anyone sees it), editing and taking it down,
// upvotes (brasil_project_vote keeps the counters in step), reports, the
// click-through, the ad slot, the Monday close that crowns the week's top 3
// and pays their points, and the nightly re-check. Server only.

import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";
import { captureServer } from "../posthog-server";
import { awardPoints } from "./brasil-points-server";
import { screenProject, flaggedNow, type CheckRow, type Screening } from "./brasil-projects-check";
import {
  LIMITS,
  POINTS_FOR_RANK,
  BURST,
  canPostAccount,
  countedVoter,
  podium,
  projectSlug,
  projectWeek,
  rankWeek,
  repoOfUrl,
  weekClosesAt,
  type AdCard,
  type Category,
  type ProjectCard,
  type ProjectInput,
  type ProjectStatus,
} from "./brasil-projects";
import { sendProjectEmail } from "../notification-senders/brasil-projects";

interface ProjectRow {
  id: number;
  league_id: string;
  developer_id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  url_host: string;
  repo: string | null;
  category: Category;
  icon_url: string | null;
  cover_url: string | null;
  uf: string | null;
  ibge: number | null;
  status: ProjectStatus;
  status_reason: string | null;
  appealed: boolean;
  launch_week: string | null;
  votes_counted: number;
  votes_total: number;
  visits: number;
  live_at: string | null;
  created_at: string;
  updated_at: string;
  developers: { github_login: string; avatar_url: string | null } | null;
}

const COLUMNS =
  "id, league_id, developer_id, slug, name, tagline, description, url, url_host, repo, category, icon_url, cover_url, uf, ibge, status, status_reason, appealed, launch_week, votes_counted, votes_total, visits, live_at, created_at, updated_at, developers(github_login, avatar_url)";

export interface Viewer {
  id: number;
  github_login: string;
}

function toCard(r: ProjectRow, voted: boolean, rank: number | null): ProjectCard {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    description: r.description,
    url: r.url,
    host: r.url_host,
    repo: r.repo,
    category: r.category,
    icon: r.icon_url,
    cover: r.cover_url,
    uf: r.uf,
    ibge: r.ibge,
    maker: { login: r.developers?.github_login ?? "?", avatar: r.developers?.avatar_url ?? null },
    votes: r.votes_counted,
    visits: r.visits,
    week: r.launch_week,
    liveAt: r.live_at ? Date.parse(r.live_at) : null,
    voted,
    rank,
  };
}

/** Which of these projects the viewer upvoted. */
async function votedSet(viewerId: number | null, ids: number[]): Promise<Set<number>> {
  if (!viewerId || ids.length === 0) return new Set();
  const { data } = await getSupabaseAdmin().from("brasil_project_votes").select("project_id").eq("voter_id", viewerId).in("project_id", ids);
  return new Set((data ?? []).map((r: { project_id: number }) => r.project_id));
}

const sb = () => getSupabaseAdmin();

// ─── Reading ────────────────────────────────────────────────

export type ListTab = "week" | "new" | "all" | "winners";

export interface ProjectList {
  tab: ListTab;
  week: string;
  closesAt: number;
  rows: ProjectCard[];
}

/** A list of live projects (or the winners), the viewer's upvotes marked. */
export async function listProjects(leagueId: string, opts: { tab: ListTab; category?: string | null; uf?: string | null; viewerId?: number | null; limit?: number }): Promise<ProjectList> {
  const week = projectWeek(new Date());
  const limit = Math.min(opts.limit ?? 100, 200);
  if (opts.tab === "winners") {
    const { data, error } = await sb()
      .from("brasil_project_weeks")
      .select(`week, rank, votes, brasil_projects!inner(${COLUMNS})`)
      .eq("league_id", leagueId)
      .order("week", { ascending: false })
      .order("rank", { ascending: true })
      .limit(limit)
      .returns<{ week: string; rank: number; votes: number; brasil_projects: ProjectRow }[]>();
    if (error) throw new Error(`projects winners: ${error.message}`);
    const rows = (data ?? []).filter((w) => !["removed", "hidden"].includes(w.brasil_projects.status));
    const voted = await votedSet(opts.viewerId ?? null, rows.map((w) => w.brasil_projects.id));
    return { tab: "winners", week, closesAt: weekClosesAt(week), rows: rows.map((w) => ({ ...toCard(w.brasil_projects, voted.has(w.brasil_projects.id), w.rank), week: w.week, votes: w.votes })) };
  }
  let q = sb().from("brasil_projects").select(COLUMNS).eq("league_id", leagueId).eq("status", "live");
  if (opts.tab === "week") q = q.eq("launch_week", week);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.uf) q = q.eq("uf", opts.uf);
  q = opts.tab === "new" ? q.order("live_at", { ascending: false }) : q.order("votes_counted", { ascending: false }).order("live_at", { ascending: true });
  const { data, error } = await q.limit(limit).returns<ProjectRow[]>();
  if (error) throw new Error(`projects list: ${error.message}`);
  const rows = data ?? [];
  const voted = await votedSet(opts.viewerId ?? null, rows.map((r) => r.id));
  // The week's rank is the whole week's, so a filter doesn't renumber it.
  const ranks = opts.tab === "week" && !opts.category && !opts.uf ? null : await weekRanks(leagueId, week);
  return {
    tab: opts.tab,
    week,
    closesAt: weekClosesAt(week),
    rows: rows.map((r, i) => toCard(r, voted.has(r.id), opts.tab === "week" && !ranks ? i + 1 : r.launch_week === week ? (ranks?.get(r.id) ?? null) : null)),
  };
}

/** Every live project of a week, by rank. */
async function weekRanks(leagueId: string, week: string): Promise<Map<number, number>> {
  const { data } = await sb().from("brasil_projects").select("id, votes_counted, live_at").eq("league_id", leagueId).eq("status", "live").eq("launch_week", week);
  const ranked = rankWeek((data ?? []).map((r: { id: number; votes_counted: number; live_at: string | null }) => ({ id: r.id, votes: r.votes_counted, liveAt: r.live_at ? Date.parse(r.live_at) : null })));
  return new Map(ranked.map((r, i) => [r.id, i + 1]));
}

export interface CardData {
  week: string;
  closesAt: number;
  /** This week's top 3 by votes; before any has a vote, the newest. */
  top: ProjectCard[];
  /** How the top was picked. */
  mode: "ranked" | "new";
  count: number;
  ad: AdCard | null;
}

/** What the map's top-right card shows. */
export async function getCardData(leagueId: string, viewerId: number | null): Promise<CardData> {
  const list = await listProjects(leagueId, { tab: "week", viewerId, limit: 200 });
  const ranked = list.rows.filter((r) => r.votes > 0);
  const top = ranked.length >= 3 || list.rows.length <= 3 ? list.rows.slice(0, 3) : [...ranked, ...[...list.rows].filter((r) => r.votes === 0).sort((a, b) => (b.liveAt ?? 0) - (a.liveAt ?? 0))].slice(0, 3);
  return { week: list.week, closesAt: list.closesAt, top, mode: ranked.length ? "ranked" : "new", count: list.rows.length, ad: await currentAd(leagueId) };
}

/** A project by its slug, as the viewer sees it: live to everyone, any status to its maker. */
export async function getProject(leagueId: string, slug: string, viewer: Viewer | null): Promise<(ProjectCard & { status: ProjectStatus; reason: string | null; mine: boolean }) | null> {
  const { data } = await sb().from("brasil_projects").select(COLUMNS).eq("league_id", leagueId).eq("slug", slug).maybeSingle<ProjectRow>();
  if (!data) return null;
  const mine = viewer?.id === data.developer_id;
  if (data.status !== "live" && !mine) return null;
  if (data.status === "removed") return null;
  const voted = await votedSet(viewer?.id ?? null, [data.id]);
  const week = projectWeek(new Date());
  let rank: number | null = null;
  if (data.launch_week === week) rank = (await weekRanks(leagueId, week)).get(data.id) ?? null;
  else if (data.launch_week) {
    const { data: w } = await sb().from("brasil_project_weeks").select("rank").eq("project_id", data.id).maybeSingle<{ rank: number }>();
    rank = w?.rank ?? null;
  }
  return { ...toCard(data, voted.has(data.id), rank), status: data.status, reason: data.status === "rejected" || data.status === "review" || data.status === "hidden" ? data.status_reason : null, mine };
}

export interface MyProject extends ProjectCard {
  status: ProjectStatus;
  reason: string | null;
  appealed: boolean;
  votesTotal: number;
}

/** The viewer's own projects, every status but removed, newest first. */
export async function myProjects(leagueId: string, viewer: Viewer): Promise<MyProject[]> {
  const { data } = await sb().from("brasil_projects").select(COLUMNS).eq("league_id", leagueId).eq("developer_id", viewer.id).neq("status", "removed").order("created_at", { ascending: false }).returns<ProjectRow[]>();
  const rows = data ?? [];
  const week = projectWeek(new Date());
  const ranks = rows.some((r) => r.launch_week === week) ? await weekRanks(leagueId, week) : new Map<number, number>();
  return rows.map((r) => ({ ...toCard(r, false, r.launch_week === week ? (ranks.get(r.id) ?? null) : null), status: r.status, reason: r.status_reason, appealed: r.appealed, votesTotal: r.votes_total }));
}

/** Winners of past weeks by maker login (lowercase), for the building card's line. */
export async function winsByLogin(leagueId: string): Promise<Record<string, { week: string; name: string; slug: string }>> {
  const { data } = await sb()
    .from("brasil_project_weeks")
    .select("week, brasil_projects!inner(name, slug, status, developers(github_login))")
    .eq("league_id", leagueId)
    .eq("rank", 1)
    .order("week", { ascending: false })
    .limit(200)
    .returns<{ week: string; brasil_projects: { name: string; slug: string; status: string; developers: { github_login: string } | null } }[]>();
  const out: Record<string, { week: string; name: string; slug: string }> = {};
  for (const w of data ?? []) {
    const login = w.brasil_projects.developers?.github_login?.toLowerCase();
    if (login && !out[login] && w.brasil_projects.status === "live") out[login] = { week: w.week, name: w.brasil_projects.name, slug: w.brasil_projects.slug };
  }
  return out;
}

// ─── Posting ────────────────────────────────────────────────

interface MakerRow {
  id: number;
  github_login: string;
  account_created_at: string | null;
  contributions: number | null;
}

/** Why the viewer can't post right now, or null when they can. */
export async function cannotPost(leagueId: string, viewer: Viewer): Promise<{ code: "not_on_map" | "banned" | "young" | "week_limit" | "live_limit"; error: string } | null> {
  const [resident, ban, dev, mine] = await Promise.all([
    sb().from("brasil_residents").select("developer_id, lx").eq("league_id", leagueId).eq("developer_id", viewer.id).maybeSingle<{ developer_id: number; lx: number | null }>(),
    sb().from("brasil_project_bans").select("developer_id").eq("developer_id", viewer.id).maybeSingle(),
    sb().from("developers").select("id, github_login, account_created_at, contributions").eq("id", viewer.id).maybeSingle<MakerRow>(),
    sb().from("brasil_projects").select("status, launch_week, created_at").eq("league_id", leagueId).eq("developer_id", viewer.id).neq("status", "removed"),
  ]);
  if (!resident.data || resident.data.lx === null) return { code: "not_on_map", error: "Put your building on the map first." };
  if (ban.data) return { code: "banned", error: "You can't post projects." };
  if (dev.data && !canPostAccount(dev.data)) return { code: "young", error: "Your GitHub account needs to be 30 days old to post." };
  const week = projectWeek(new Date());
  const rows = (mine.data ?? []) as { status: ProjectStatus; launch_week: string | null; created_at: string }[];
  // A project counts toward this week from the moment it's posted (checking, in review or live), not only once it's live.
  const thisWeek = rows.filter((r) => r.launch_week === week || (!r.launch_week && projectWeek(new Date(r.created_at)) === week && r.status !== "rejected")).length;
  if (thisWeek >= LIMITS.launchesPerWeek) return { code: "week_limit", error: "One project a week. Post the next one on Monday." };
  if (rows.filter((r) => r.status === "live" || r.status === "review" || r.status === "checking").length >= LIMITS.livePerDev) return { code: "live_limit", error: `${LIMITS.livePerDev} projects up at once. Take one down to post another.` };
  return null;
}

async function writeChecks(projectId: number, checks: CheckRow[]) {
  if (!checks.length) return;
  const { error } = await sb()
    .from("brasil_project_checks")
    .insert(checks.map((c) => ({ project_id: projectId, kind: c.kind, verdict: c.verdict, category: c.category, reason: c.reason, model: c.model ?? null, cost_usd: c.cost_usd ?? null, raw: c.raw ?? null })));
  if (error) console.error("[projects] checks", error.message);
}

/** A screening's outcome on a project: live (its week set the first time), in review, or rejected. */
async function applyScreening(row: { id: number; launch_week: string | null; live_at: string | null }, s: Screening, extra: Record<string, unknown> = {}, forceReview = false): Promise<ProjectStatus> {
  const status: ProjectStatus = s.verdict === "reject" ? "rejected" : s.verdict === "review" || forceReview ? "review" : "live";
  const now = new Date();
  const patch: Record<string, unknown> = { ...extra, status, status_reason: status === "live" ? null : (s.reason ?? (forceReview ? "New link: waiting for a look" : null)), checked_at: now.toISOString(), updated_at: now.toISOString() };
  if (status === "live" && !row.launch_week) {
    patch.launch_week = projectWeek(now);
    patch.live_at = now.toISOString();
  }
  const { error } = await sb().from("brasil_projects").update(patch).eq("id", row.id);
  if (error) throw new Error(`projects screening: ${error.message}`);
  await writeChecks(row.id, s.checks);
  return status;
}

export interface PostResult {
  project: MyProject;
}

/** Posts a project: stored as "checking", screened, then live, in review or rejected. */
export async function createProject(league: { id: string }, viewer: Viewer, input: ProjectInput): Promise<{ error: string; code?: string } | PostResult> {
  const blocked = await cannotPost(league.id, viewer);
  if (blocked) return blocked;
  const { data: resident } = await sb().from("brasil_residents").select("uf, ibge").eq("league_id", league.id).eq("developer_id", viewer.id).maybeSingle<{ uf: string | null; ibge: number | null }>();
  const host = new URL(input.url).hostname;
  const repo = input.repo ?? repoOfUrl(input.url);
  const { data: row, error } = await sb()
    .from("brasil_projects")
    .insert({
      league_id: league.id,
      developer_id: viewer.id,
      slug: projectSlug(input.name, randomBytes(3).toString("hex")),
      name: input.name,
      tagline: input.tagline,
      description: input.description,
      url: input.url,
      url_host: host,
      repo,
      category: input.category,
      uf: resident?.uf ?? null,
      ibge: resident?.ibge ?? null,
    })
    .select("id, launch_week, live_at")
    .single<{ id: number; launch_week: string | null; live_at: string | null }>();
  if (error) {
    if (error.code === "23505") return { error: "That link is already posted." };
    throw new Error(`projects insert: ${error.message}`);
  }
  const s = await screenProject({ ...input, repo }, { login: viewer.github_login });
  const status = await applyScreening(row, s, { icon_url: s.page?.icon ?? null, cover_url: s.page?.image ?? null });
  await captureServer(viewer.github_login, "project_checked", { project_id: row.id, outcome: status, flags: s.checks.filter((c) => c.verdict !== "approve").map((c) => c.kind), cost: s.checks.reduce((n, c) => n + (c.cost_usd ?? 0), 0), on: "create" });
  const mine = (await myProjects(league.id, viewer)).find((p) => p.id === row.id)!;
  return { project: mine };
}

/**
 * Edits a project. The words alone: screened again (live stays live when it
 * passes). A new link: screened in full and always waits for the admin, so a
 * project can't be approved and then pointed somewhere else. Votes stay.
 */
export async function editProject(league: { id: string }, viewer: Viewer, id: number, input: ProjectInput): Promise<{ error: string } | PostResult> {
  const { data: row } = await sb().from("brasil_projects").select("id, developer_id, url, status, launch_week, live_at, repo").eq("id", id).eq("league_id", league.id).maybeSingle<{ id: number; developer_id: number; url: string; status: ProjectStatus; launch_week: string | null; live_at: string | null; repo: string | null }>();
  if (!row || row.developer_id !== viewer.id || row.status === "removed") return { error: "Project not found." };
  if (row.status === "hidden") return { error: "This project is hidden while we take a look." };
  const linkChanged = row.url !== input.url || (input.repo ?? null) !== (row.repo ?? null);
  const repo = input.repo ?? repoOfUrl(input.url);
  const words = { name: input.name, tagline: input.tagline, description: input.description, category: input.category };
  const s = await screenProject({ ...input, repo }, { login: viewer.github_login }, { textOnly: !linkChanged });
  const extra: Record<string, unknown> = { ...words };
  if (linkChanged) Object.assign(extra, { url: input.url, url_host: new URL(input.url).hostname, repo, icon_url: s.page?.icon ?? null, cover_url: s.page?.image ?? null });
  try {
    // A rejected project's edit is a fresh try: it can go straight live again.
    const status = await applyScreening(row, s, extra, linkChanged && row.status !== "rejected" && !!row.launch_week);
    await captureServer(viewer.github_login, "project_checked", { project_id: row.id, outcome: status, on: linkChanged ? "edit_link" : "edit_words" });
  } catch (err) {
    if (String(err).includes("duplicate key")) return { error: "That link is already posted." };
    throw err;
  }
  return { project: (await myProjects(league.id, viewer)).find((p) => p.id === row.id)! };
}

/** Takes a project down for good (the row stays for the moderation history). */
export async function removeProject(league: { id: string }, viewer: Viewer, id: number): Promise<string | null> {
  const { data, error } = await sb().from("brasil_projects").update({ status: "removed", updated_at: new Date().toISOString() }).eq("id", id).eq("league_id", league.id).eq("developer_id", viewer.id).neq("status", "removed").select("id");
  if (error) throw new Error(`projects remove: ${error.message}`);
  return data?.length ? null : "Project not found.";
}

/** A rejected project asks for a person to look, once. */
export async function appealProject(league: { id: string }, viewer: Viewer, id: number, note: string): Promise<string | null> {
  const { data } = await sb().from("brasil_projects").select("id, status, appealed").eq("id", id).eq("league_id", league.id).eq("developer_id", viewer.id).maybeSingle<{ id: number; status: ProjectStatus; appealed: boolean }>();
  if (!data || data.status !== "rejected") return "Only a rejected project can be appealed.";
  if (data.appealed) return "You already asked for a look at this one.";
  await sb().from("brasil_projects").update({ status: "review", appealed: true, status_reason: `Appeal: ${note.slice(0, 300) || "the maker asks for a look"}`, updated_at: new Date().toISOString() }).eq("id", id);
  return null;
}

// ─── Votes, reports, visits ─────────────────────────────────

/** Upvotes a project (on) or takes the upvote back. */
export async function voteProject(league: { id: string }, viewer: Viewer, id: number, on: boolean): Promise<{ error: string } | { votes: number; voted: boolean; counted: boolean }> {
  const { data: p } = await sb().from("brasil_projects").select("id, developer_id, status").eq("id", id).eq("league_id", league.id).maybeSingle<{ id: number; developer_id: number; status: ProjectStatus }>();
  if (!p || p.status !== "live") return { error: "Project not found." };
  if (p.developer_id === viewer.id) return { error: "You can't upvote your own project." };
  const { data: dev } = await sb().from("developers").select("account_created_at, contributions").eq("id", viewer.id).maybeSingle<{ account_created_at: string | null; contributions: number | null }>();
  const counted = dev ? countedVoter(dev) : false;
  if (on) {
    const { count } = await sb().from("brasil_project_votes").select("project_id", { count: "exact", head: true }).eq("voter_id", viewer.id).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= LIMITS.votesPerHour) return { error: "That's a lot of upvotes. Try again in a bit." };
  }
  const { data, error } = await sb().rpc("brasil_project_vote", { p_project: id, p_voter: viewer.id, p_counted: counted, p_on: on }).single<{ votes_counted: number; votes_total: number; voted: boolean }>();
  if (error) throw new Error(`projects vote: ${error.message}`);
  return { votes: data.votes_counted, voted: data.voted, counted };
}

/** Reports a project; three from counted accounts hide it until the admin looks. */
export async function reportProject(league: { id: string }, viewer: Viewer, id: number, reason: string, note: string): Promise<string | null> {
  if (!["scam", "gambling", "broken", "not_theirs", "other"].includes(reason)) return "Pick a reason.";
  const { data: p } = await sb().from("brasil_projects").select("id, developer_id, status").eq("id", id).eq("league_id", league.id).maybeSingle<{ id: number; developer_id: number; status: ProjectStatus }>();
  if (!p || p.status !== "live") return "Project not found.";
  if (p.developer_id === viewer.id) return "That's your own project.";
  const { data: dev } = await sb().from("developers").select("account_created_at, contributions").eq("id", viewer.id).maybeSingle<{ account_created_at: string | null; contributions: number | null }>();
  const { error } = await sb().from("brasil_project_reports").insert({ project_id: id, reporter_id: viewer.id, reason, note: note.slice(0, 300) || null, counted: dev ? countedVoter(dev) : false });
  if (error) return error.code === "23505" ? "You already reported this project." : "Something went wrong. Try again.";
  const { count } = await sb().from("brasil_project_reports").select("project_id", { count: "exact", head: true }).eq("project_id", id).eq("counted", true).is("resolved_at", null);
  if ((count ?? 0) >= LIMITS.reportsToHide) {
    await sb().from("brasil_projects").update({ status: "hidden", status_reason: `Reported by ${count} devs`, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "live");
    await writeChecks(id, [{ kind: "rules", verdict: "review", category: null, reason: `Hidden after ${count} reports` }]);
  }
  return null;
}

/**
 * The click-through: where a project's link goes, its visit counted. Null
 * when it isn't live, or Safe Browsing flags the link now (then it's hidden).
 */
export async function visitProject(id: number): Promise<string | null> {
  const { data } = await sb().from("brasil_projects").select("id, url, status").eq("id", id).maybeSingle<{ id: number; url: string; status: ProjectStatus }>();
  if (!data || data.status !== "live") return null;
  if ((await flaggedNow(data.url)) === true) {
    await sb().from("brasil_projects").update({ status: "hidden", status_reason: "Safe Browsing flagged the link on a click", updated_at: new Date().toISOString() }).eq("id", id);
    await writeChecks(id, [{ kind: "reputation", verdict: "reject", category: "malware", reason: "Safe Browsing flagged the link on a click" }]);
    return null;
  }
  await sb().rpc("brasil_project_visit", { p_project: id });
  return data.url;
}

// ─── The ad ─────────────────────────────────────────────────

/** The ad showing now: a live slot whose dates hold now. */
export async function currentAd(leagueId: string, now = new Date()): Promise<AdCard | null> {
  const { data } = await sb()
    .from("brasil_ad_slots")
    .select("id, name, tagline, url, icon_url")
    .eq("league_id", leagueId)
    .eq("status", "live")
    .lte("starts_at", now.toISOString())
    .gt("ends_at", now.toISOString())
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: number; name: string; tagline: string; url: string; icon_url: string | null }>();
  return data ? { id: data.id, name: data.name, tagline: data.tagline, url: data.url, icon: data.icon_url } : null;
}

/** The ad's click-through: its link, the click counted; null when it isn't showing. */
export async function clickAd(id: number): Promise<string | null> {
  const now = new Date().toISOString();
  const { data } = await sb().from("brasil_ad_slots").select("url").eq("id", id).eq("status", "live").lte("starts_at", now).gt("ends_at", now).maybeSingle<{ url: string }>();
  if (!data) return null;
  await sb().rpc("brasil_ad_click", { p_slot: id });
  return data.url;
}

// ─── The week ───────────────────────────────────────────────

export interface WeekClose {
  week: string;
  winners: { rank: number; projectId: number; login: string; votes: number; points: number; paid: boolean }[];
  makers: number;
}

/**
 * Closes a week: its top 3 written once, their points paid into the new week
 * (the unique ref means a re-run never pays twice), and every maker of the
 * week told how it went.
 */
export async function closeProjectWeek(leagueId: string, week: string): Promise<WeekClose> {
  const { data, error } = await sb().from("brasil_projects").select(COLUMNS).eq("league_id", leagueId).eq("status", "live").eq("launch_week", week).returns<ProjectRow[]>();
  if (error) throw new Error(`projects close: ${error.message}`);
  const rows = data ?? [];
  const top = podium(rows.map((r) => ({ row: r, votes: r.votes_counted, liveAt: r.live_at ? Date.parse(r.live_at) : null })));
  const closesAt = new Date(weekClosesAt(week));
  const winners: WeekClose["winners"] = [];
  for (const [i, t] of top.entries()) {
    const rank = (i + 1) as 1 | 2 | 3;
    const points = POINTS_FOR_RANK[rank];
    await sb().from("brasil_project_weeks").upsert({ league_id: leagueId, week, rank, project_id: t.row.id, votes: t.votes, points }, { onConflict: "league_id,week,rank", ignoreDuplicates: true });
    const paid = await awardPoints(t.row.developer_id, "project", `project:${week}:${rank}`, closesAt, points);
    winners.push({ rank, projectId: t.row.id, login: t.row.developers?.github_login ?? "?", votes: t.votes, points, paid });
  }
  // Emails: each maker of the week once (their best project), only on the run that paid (a re-run sends nothing).
  if (winners.some((w) => w.paid) || winners.length === 0) {
    const byMaker = new Map<number, ProjectRow>();
    for (const r of rankWeek(rows.map((r) => ({ ...r, votes: r.votes_counted, liveAt: r.live_at ? Date.parse(r.live_at) : null })))) if (!byMaker.has(r.developer_id)) byMaker.set(r.developer_id, r);
    const ranks = new Map(rankWeek(rows.map((r) => ({ id: r.id, votes: r.votes_counted, liveAt: r.live_at ? Date.parse(r.live_at) : null }))).map((r, i) => [r.id, i + 1]));
    for (const [devId, r] of byMaker) {
      const w = winners.find((x) => x.projectId === r.id);
      sendProjectEmail({ kind: "week", developerId: devId, login: r.developers?.github_login ?? "", project: { name: r.name, slug: r.slug }, week, rank: ranks.get(r.id) ?? null, of: rows.length, votes: r.votes_counted, visits: r.visits, points: w?.points ?? 0 });
    }
  }
  await captureServer("system", "project_week_closed", { week, projects: rows.length, winners: winners.map((w) => w.login) });
  return { week, winners, makers: new Set(rows.map((r) => r.developer_id)).size };
}

/**
 * The nightly re-check: every live project screened again. A link that turned
 * bad (rejected, or flagged as gambling, scam, adult or malware) is hidden and
 * queued; a page that's just down stays up.
 */
export async function recheckLive(leagueId: string, limit = 300): Promise<{ checked: number; hidden: number }> {
  const { data } = await sb().from("brasil_projects").select(COLUMNS).eq("league_id", leagueId).eq("status", "live").order("checked_at", { ascending: true, nullsFirst: true }).limit(limit).returns<ProjectRow[]>();
  let hidden = 0;
  const one = async (r: ProjectRow) => {
    const s = await screenProject({ name: r.name, tagline: r.tagline, description: r.description, url: r.url, repo: r.repo }, { login: r.developers?.github_login ?? "" });
    const bad = s.verdict === "reject" || s.checks.some((c) => c.verdict !== "approve" && ["gambling", "scam", "adult", "malware", "hate"].includes(c.category ?? ""));
    const now = new Date().toISOString();
    if (bad) {
      hidden++;
      await sb().from("brasil_projects").update({ status: "hidden", status_reason: `Re-check: ${s.reason ?? "flagged"}`, checked_at: now, updated_at: now }).eq("id", r.id).eq("status", "live");
    } else await sb().from("brasil_projects").update({ checked_at: now }).eq("id", r.id);
    await writeChecks(r.id, s.checks.filter((c) => c.verdict !== "approve" || c.kind === "model"));
  };
  // Five at a time: each is a page fetch and a model call, a few seconds.
  const rows = data ?? [];
  for (let i = 0; i < rows.length; i += 5) await Promise.allSettled(rows.slice(i, i + 5).map(one));
  return { checked: data?.length ?? 0, hidden };
}

// ─── Admin ──────────────────────────────────────────────────

export interface AdminProject extends MyProject {
  maker_id: number;
  createdAt: number;
  checks: { kind: string; verdict: string; category: string | null; reason: string | null; model: string | null; cost_usd: number | null; raw: Record<string, unknown> | null; at: number }[];
  reports: { reason: string; note: string | null; counted: boolean; at: number }[];
  banned: boolean;
}

/** The admin's view of projects: the queue (review, hidden, open reports) or everything, with their checks. */
export async function adminProjects(leagueId: string, view: "queue" | "all", search = ""): Promise<AdminProject[]> {
  let q = sb().from("brasil_projects").select(COLUMNS).eq("league_id", leagueId);
  if (view === "queue") {
    const { data: rep } = await sb().from("brasil_project_reports").select("project_id").is("resolved_at", null);
    const reported = [...new Set((rep ?? []).map((r: { project_id: number }) => r.project_id))];
    q = reported.length ? q.or(`status.in.(review,hidden),id.in.(${reported.join(",")})`) : q.in("status", ["review", "hidden"]);
    q = q.order("updated_at", { ascending: true });
  } else {
    if (search) q = q.or(`name.ilike.%${search.replace(/[%,()]/g, "")}%,url.ilike.%${search.replace(/[%,()]/g, "")}%`);
    q = q.order("created_at", { ascending: false });
  }
  const { data, error } = await q.limit(200).returns<ProjectRow[]>();
  if (error) throw new Error(`projects admin: ${error.message}`);
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const [checks, reports, bans] = await Promise.all([
    ids.length ? sb().from("brasil_project_checks").select("project_id, kind, verdict, category, reason, model, cost_usd, raw, created_at").in("project_id", ids).order("created_at", { ascending: false }).limit(2000) : Promise.resolve({ data: [] }),
    ids.length ? sb().from("brasil_project_reports").select("project_id, reason, note, counted, created_at").in("project_id", ids).is("resolved_at", null) : Promise.resolve({ data: [] }),
    sb().from("brasil_project_bans").select("developer_id"),
  ]);
  const banned = new Set((bans.data ?? []).map((b: { developer_id: number }) => b.developer_id));
  type C = { project_id: number; kind: string; verdict: string; category: string | null; reason: string | null; model: string | null; cost_usd: number | null; raw: Record<string, unknown> | null; created_at: string };
  type R = { project_id: number; reason: string; note: string | null; counted: boolean; created_at: string };
  return rows.map((r) => ({
    ...toCard(r, false, null),
    status: r.status,
    reason: r.status_reason,
    appealed: r.appealed,
    votesTotal: r.votes_total,
    maker_id: r.developer_id,
    createdAt: Date.parse(r.created_at),
    checks: ((checks.data ?? []) as C[]).filter((c) => c.project_id === r.id).slice(0, 12).map((c) => ({ kind: c.kind, verdict: c.verdict, category: c.category, reason: c.reason, model: c.model, cost_usd: c.cost_usd === null ? null : Number(c.cost_usd), raw: c.raw, at: Date.parse(c.created_at) })),
    reports: ((reports.data ?? []) as R[]).filter((x) => x.project_id === r.id).map((x) => ({ reason: x.reason, note: x.note, counted: x.counted, at: Date.parse(x.created_at) })),
    banned: banned.has(r.developer_id),
  }));
}

/** The admin's call on a project: approve (live), reject (with the reason the maker reads), hide, or re-check. */
export async function adminDecide(leagueId: string, id: number, action: "approve" | "reject" | "hide" | "recheck" | "dismiss_reports", reason?: string): Promise<string | null> {
  const { data: row } = await sb().from("brasil_projects").select(COLUMNS).eq("id", id).eq("league_id", leagueId).maybeSingle<ProjectRow>();
  if (!row) return "Project not found.";
  const now = new Date();
  if (action === "recheck") {
    const s = await screenProject({ name: row.name, tagline: row.tagline, description: row.description, url: row.url, repo: row.repo }, { login: row.developers?.github_login ?? "" });
    await writeChecks(id, s.checks);
    await sb().from("brasil_projects").update({ checked_at: now.toISOString() }).eq("id", id);
    return null;
  }
  if (action === "dismiss_reports") {
    await sb().from("brasil_project_reports").update({ resolved_at: now.toISOString() }).eq("project_id", id).is("resolved_at", null);
    return null;
  }
  const status: ProjectStatus = action === "approve" ? "live" : action === "reject" ? "rejected" : "hidden";
  const patch: Record<string, unknown> = { status, status_reason: status === "live" ? null : (reason?.slice(0, 200) ?? (status === "rejected" ? "It doesn't fit Git City." : "Hidden by the admin")), updated_at: now.toISOString() };
  if (status === "live" && !row.launch_week) {
    patch.launch_week = projectWeek(now);
    patch.live_at = now.toISOString();
  }
  const { error } = await sb().from("brasil_projects").update(patch).eq("id", id);
  if (error) return error.message;
  await writeChecks(id, [{ kind: "rules", verdict: action === "approve" ? "approve" : action === "reject" ? "reject" : "review", category: null, reason: `Admin: ${action}${reason ? ` (${reason})` : ""}` }]);
  if (action === "approve") await sb().from("brasil_project_reports").update({ resolved_at: now.toISOString() }).eq("project_id", id).is("resolved_at", null);
  // The maker hears about a person's decision (the form already told them the model's).
  if ((row.status === "review" || row.status === "hidden") && (action === "approve" || action === "reject")) {
    sendProjectEmail({ kind: action === "approve" ? ("approved" as const) : ("rejected" as const), developerId: row.developer_id, login: row.developers?.github_login ?? "", project: { name: row.name, slug: row.slug }, reason: patch.status_reason as string | null });
  }
  await captureServer("admin", "project_admin_decision", { project_id: id, action, from: row.status });
  return null;
}

export async function adminBan(developerId: number, on: boolean, reason?: string): Promise<void> {
  if (on) {
    await sb().from("brasil_project_bans").upsert({ developer_id: developerId, reason: reason ?? null });
    await sb().from("brasil_projects").update({ status: "hidden", status_reason: "Maker banned", updated_at: new Date().toISOString() }).eq("developer_id", developerId).in("status", ["live", "review", "checking"]);
  } else await sb().from("brasil_project_bans").delete().eq("developer_id", developerId);
}

export interface AdSlotRow {
  id: number;
  name: string;
  tagline: string;
  url: string;
  icon_url: string | null;
  starts_at: string;
  ends_at: string;
  status: "draft" | "live" | "ended";
  contact_email: string | null;
  price_note: string | null;
  notes: string | null;
  clicks: number;
}

export async function adminAdSlots(leagueId: string): Promise<AdSlotRow[]> {
  const { data } = await sb().from("brasil_ad_slots").select("id, name, tagline, url, icon_url, starts_at, ends_at, status, contact_email, price_note, notes, clicks").eq("league_id", leagueId).order("starts_at", { ascending: false }).limit(100);
  return (data ?? []) as AdSlotRow[];
}

/** Saves an ad slot; a slot going live runs through the link's screening first, and the admin sees what it found. */
export async function adminSaveAd(leagueId: string, slot: Partial<AdSlotRow> & { name: string; tagline: string; url: string; starts_at: string; ends_at: string; status: AdSlotRow["status"] }): Promise<{ error: string } | { id: number; screening: Screening | null }> {
  let screening: Screening | null = null;
  if (slot.status === "live") {
    screening = await screenProject({ name: slot.name, tagline: slot.tagline, description: "", url: slot.url, repo: null }, { login: "admin" });
    if (screening.verdict === "reject") return { error: `The link didn't pass: ${screening.reason}` };
  }
  const row = { league_id: leagueId, name: slot.name, tagline: slot.tagline, url: slot.url, icon_url: slot.icon_url ?? screening?.page?.icon ?? null, starts_at: slot.starts_at, ends_at: slot.ends_at, status: slot.status, contact_email: slot.contact_email ?? null, price_note: slot.price_note ?? null, notes: slot.notes ?? null };
  const res = slot.id ? await sb().from("brasil_ad_slots").update(row).eq("id", slot.id).select("id").single<{ id: number }>() : await sb().from("brasil_ad_slots").insert(row).select("id").single<{ id: number }>();
  if (res.error) return { error: res.error.message };
  return { id: res.data.id, screening };
}

export interface ProjectHealth {
  submissions: { day: string; count: number }[];
  byStatus: Record<string, number>;
  autoLivePct: number | null;
  queueOldestHours: number | null;
  rejectReasons: { category: string; count: number }[];
  modelCostMonth: number;
  overturned: { approvedAfterReject: number; rejectedAfterApprove: number };
  votes: { counted: number; uncounted: number };
  bursts: { projectId: number; name: string; votes: number }[];
}

/** The numbers behind the moderation and the votes, last 30 days. */
export async function projectHealth(leagueId: string): Promise<ProjectHealth> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: projects }, { data: checks }, { data: votes }] = await Promise.all([
    sb().from("brasil_projects").select("id, name, status, created_at, updated_at").eq("league_id", leagueId).gte("created_at", since),
    sb().from("brasil_project_checks").select("project_id, kind, verdict, category, reason, cost_usd, created_at").gte("created_at", since).limit(10_000),
    sb().from("brasil_project_votes").select("project_id, counted, created_at, developers!inner(account_created_at)").gte("created_at", since).limit(20_000),
  ]);
  type P = { id: number; name: string; status: string; created_at: string; updated_at: string };
  type C = { project_id: number; kind: string; verdict: string; category: string | null; reason: string | null; cost_usd: number | null; created_at: string };
  type V = { project_id: number; counted: boolean; created_at: string; developers: { account_created_at: string | null } | null };
  const ps = (projects ?? []) as P[];
  const cs = (checks ?? []) as C[];
  const vs = (votes ?? []) as unknown as V[];
  const days = new Map<string, number>();
  for (const p of ps) days.set(p.created_at.slice(0, 10), (days.get(p.created_at.slice(0, 10)) ?? 0) + 1);
  const byStatus: Record<string, number> = {};
  for (const p of ps) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
  // Auto-live: the first screening of a project (its checks within a minute of the first) passed with nothing flagged.
  const firstVerdict = new Map<number, string>();
  for (const p of ps) {
    const rows = cs.filter((c) => c.project_id === p.id);
    const firstAt = rows.reduce<string | null>((m, c) => (m === null || c.created_at < m ? c.created_at : m), null);
    if (!firstAt) continue;
    const batch = rows.filter((c) => Math.abs(Date.parse(c.created_at) - Date.parse(firstAt)) < 60_000);
    firstVerdict.set(p.id, batch.some((c) => c.verdict === "reject") ? "reject" : batch.some((c) => c.verdict === "review") ? "review" : "approve");
  }
  const screened = [...firstVerdict.values()];
  const queue = ps.filter((p) => p.status === "review" || p.status === "hidden");
  const reasons = new Map<string, number>();
  for (const c of cs) if (c.verdict === "reject" && c.category) reasons.set(c.category, (reasons.get(c.category) ?? 0) + 1);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  const adminCalls = cs.filter((c) => c.reason?.startsWith("Admin: "));
  const overturned = {
    approvedAfterReject: adminCalls.filter((c) => c.reason!.startsWith("Admin: approve") && firstVerdict.get(c.project_id) === "reject").length,
    rejectedAfterApprove: adminCalls.filter((c) => c.reason!.startsWith("Admin: reject") && firstVerdict.get(c.project_id) === "approve").length,
  };
  // Bursts: BURST.votes from young accounts on one project inside BURST.minutes.
  const bursts: ProjectHealth["bursts"] = [];
  const young = (v: V) => !v.developers?.account_created_at || Date.now() - Date.parse(v.developers.account_created_at) < BURST.youngDays * 86_400_000;
  const byProject = new Map<number, number[]>();
  for (const v of vs) if (young(v)) byProject.set(v.project_id, [...(byProject.get(v.project_id) ?? []), Date.parse(v.created_at)]);
  for (const [pid, times] of byProject) {
    times.sort((a, b) => a - b);
    let best = 0;
    for (let i = 0, j = 0; j < times.length; j++) {
      while (times[j] - times[i] > BURST.minutes * 60_000) i++;
      best = Math.max(best, j - i + 1);
    }
    if (best >= BURST.votes) bursts.push({ projectId: pid, name: ps.find((p) => p.id === pid)?.name ?? `#${pid}`, votes: best });
  }
  return {
    submissions: [...days.entries()].sort().map(([day, count]) => ({ day, count })),
    byStatus,
    autoLivePct: screened.length ? Math.round((screened.filter((v) => v === "approve").length / screened.length) * 100) : null,
    queueOldestHours: queue.length ? Math.round((Date.now() - Math.min(...queue.map((p) => Date.parse(p.updated_at)))) / 3_600_000) : null,
    rejectReasons: [...reasons.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    modelCostMonth: Math.round(cs.filter((c) => c.created_at >= monthStart.toISOString().slice(0, 10)).reduce((n, c) => n + Number(c.cost_usd ?? 0), 0) * 10_000) / 10_000,
    overturned,
    votes: { counted: vs.filter((v) => v.counted).length, uncounted: vs.filter((v) => !v.counted).length },
    bursts,
  };
}
