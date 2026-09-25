import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthedDeveloper } from "@/lib/auth-identity";
import { FETCH_TIMEOUT_MS, GitHubFetchError, ghHeaders } from "@/lib/github-api";
import { createDeveloperFromGitHub } from "@/lib/create-developer";
import type { ScoringMode } from "./scoring";
import { inviteJoined } from "./joined";
import { autoPlace, ensureCity, removeBuilding } from "@/lib/league-city/service";
import { cleanLeagueName, isReservedSlug, LOGIN_RE } from "./names";
import { LeagueError, dbError } from "./errors";
import { customJoinDecision, newInviteToken, tokenMatches } from "./invite-token";
import { invalidateLeague } from "./cache";

export { LeagueError } from "./errors";

// ─── Types ──────────────────────────────────────────────────

export type LeagueKind = "company" | "custom";
export type MemberStatus = "invited" | "active" | "former";

export interface League {
  id: string;
  slug: string;
  name: string;
  kind: LeagueKind;
  github_org: string | null;
  scoring_mode: ScoringMode;
  admin_id: number | null;
  created_by: number | null;
  created_at: string;
  /** Test leagues: reachable by URL, left out of every listing. */
  hidden?: boolean;
}

export interface Viewer {
  id: number;
  github_login: string;
  claimed: boolean;
}

// ─── Limits ─────────────────────────────────────────────────

export const MAX_CUSTOM_LEAGUES = 5;
/** Every invite counts, found or not, so the GitHub lookups behind them are capped too. */
export const MAX_INVITES_PER_DAY = 20;
export const MAX_LEAGUES_CREATED_PER_DAY = 5;

/** Every league column except invite_token, which only the admin may read. */
export const LEAGUE_COLUMNS = "id, slug, name, kind, github_org, scoring_mode, admin_id, created_by, created_at, hidden";

// ─── Viewer ─────────────────────────────────────────────────

/** The signed-in dev (cookie auth): the building they claimed, or null. */
export async function getViewer(): Promise<Viewer | null> {
  const authed = await getAuthedDeveloper<Viewer>("id, github_login, claimed");
  return authed?.dev ?? null;
}

// ─── Lookups ────────────────────────────────────────────────

export async function getLeagueBySlug(slug: string): Promise<League | null> {
  const { data } = await getSupabaseAdmin()
    .from("leagues")
    .select(LEAGUE_COLUMNS)
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  return (data as League | null) ?? null;
}

export async function getMembership(leagueId: string, devId: number) {
  const { data } = await getSupabaseAdmin()
    .from("league_members")
    .select("status, verification, verified_until, invited_by, joined_at, removed_by")
    .eq("league_id", leagueId)
    .eq("developer_id", devId)
    .maybeSingle();
  return data as
    | {
        status: MemberStatus;
        verification: string | null;
        verified_until: string | null;
        invited_by: number | null;
        joined_at: string | null;
        removed_by: number | null;
      }
    | null;
}

/**
 * Takes one unit of a per-dev limit (league_take_quota, migration 135):
 * false when the dev is at `limit`. 'invite' also records the attempt.
 */
async function takeQuota(devId: number, kind: "invite" | "membership", limit: number): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("league_take_quota", {
    p_dev_id: devId,
    p_kind: kind,
    p_limit: limit,
    p_window: "1 day",
  });
  if (error) throw dbError("quota_failed", error);
  return data === true;
}

// ─── Slugs ──────────────────────────────────────────────────

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "town"
  );
}

/**
 * True when GitHub has an org with this login (its company league owns
 * /league/<org>). Fails closed: only a 404 says it's free, so a GitHub outage
 * can't hand an org's slug to a custom league.
 */
async function isGithubOrg(login: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(login)}`, {
      headers: ghHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.status !== 404;
  } catch {
    return true;
  }
}

async function uniqueSlug(base: string): Promise<string> {
  const sb = getSupabaseAdmin();
  const { data } = await sb.from("leagues").select("slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.slug as string));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const s = `${base}-${i}`;
    if (!taken.has(s)) return s;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ─── Create / join ──────────────────────────────────────────

export async function createCustomLeague(viewer: Viewer, rawName: string): Promise<League> {
  const name = cleanLeagueName(rawName);

  // /league/<org> stays reserved for the org's company league, and app paths
  // stay reserved for the app.
  const base = slugify(name);
  const slug = await uniqueSlug(isReservedSlug(base) || (await isGithubOrg(base)) ? `${base}-town` : base);

  // Limits and inserts in one locked call, so parallel creates can't slip past.
  const sb = getSupabaseAdmin();
  const { data: id, error } = await sb.rpc("league_create_custom", {
    p_dev_id: viewer.id,
    p_slug: slug,
    p_name: name,
    p_max_per_day: MAX_LEAGUES_CREATED_PER_DAY,
    p_max_memberships: MAX_CUSTOM_LEAGUES,
  });
  if (error) {
    if (error.message === "limit") throw new LeagueError("limit", `You can be in up to ${MAX_CUSTOM_LEAGUES} custom towns.`, 403);
    if (error.message === "create_limit") {
      throw new LeagueError("create_limit", `You can create ${MAX_LEAGUES_CREATED_PER_DAY} towns a day. Try again tomorrow.`, 429);
    }
    if (error.code === "23505") throw new LeagueError("slug_taken", "That name was just taken. Try again.", 409);
    throw dbError("create_failed", error, "Could not create town.");
  }

  const { data: league } = await sb.from("leagues").select(LEAGUE_COLUMNS).eq("id", id as string).single();
  if (!league) throw new LeagueError("create_failed", "Could not create town.", 500);
  await ensureCity(league.id).catch((err) => console.error("[league-city] starter city failed", err));
  return league as unknown as League;
}

/**
 * Joins a custom league. Allowed when the dev was invited, or with the
 * league's invite token (the admin's link) for newcomers and members who
 * left. Members an admin removed need a new invite. `ref` only credits who
 * shared the link. Company leagues are joined by verifying org membership.
 */
export async function joinLeague(
  viewer: Viewer,
  league: League,
  ref: string | null,
  token: string | null,
): Promise<MemberStatus> {
  if (league.kind === "company") {
    throw new LeagueError("needs_verification", "Verify your GitHub org membership to join this town.", 403);
  }

  const sb = getSupabaseAdmin();
  const existing = await getMembership(league.id, viewer.id);
  const needsToken = existing?.status !== "active" && existing?.status !== "invited";
  const tokenOk = needsToken && tokenMatches(token, await getInviteToken(league.id));
  const decision = customJoinDecision(existing, tokenOk);
  if (decision === "active") return "active";
  if (decision === "removed") {
    throw new LeagueError("removed", "The admin removed you from this town. Ask them for a new invite.", 403);
  }
  if (decision === "needs_invite") {
    throw new LeagueError(
      "needs_invite",
      token ? "This invite link is no longer valid." : "You need an invite link to join this town.",
      403,
    );
  }

  let invitedBy = existing?.invited_by ?? null;
  if (decision === "token") {
    invitedBy = null;
    if (ref && LOGIN_RE.test(ref)) {
      const { data: referrer } = await sb.from("developers").select("id").eq("github_login", ref.toLowerCase()).maybeSingle();
      if (referrer && (await getMembership(league.id, referrer.id))?.status === "active") invitedBy = referrer.id;
    }
  }

  // The count is locked, but the upsert below runs after the lock is gone, so
  // two joins at the same instant could go one league over. Harmless.
  if (!(await takeQuota(viewer.id, "membership", MAX_CUSTOM_LEAGUES))) {
    throw new LeagueError("limit", `You can be in up to ${MAX_CUSTOM_LEAGUES} custom towns.`, 403);
  }

  const { error } = await sb.from("league_members").upsert(
    {
      league_id: league.id,
      developer_id: viewer.id,
      status: "active",
      invited_by: invitedBy,
      joined_at: new Date().toISOString(),
      left_at: null,
      removed_by: null,
    },
    { onConflict: "league_id,developer_id" },
  );
  if (error) throw dbError("join_failed", error);
  await autoPlace(league.id, viewer.id);

  // A personal invite, or the open link shared by a member (ref).
  if (existing?.status === "invited" || decision === "token") {
    await inviteJoined(league.id, viewer.id, viewer.github_login, invitedBy);
  }
  if (!league.admin_id) await reassignAdmin(league.id);
  invalidateLeague(league.id);
  return "active";
}

/** Active member leaves: former (kept in the hall of fame), building out of the city. */
export async function leaveLeague(viewer: Viewer, league: League): Promise<void> {
  const m = await getMembership(league.id, viewer.id);
  if (m?.status !== "active") throw new LeagueError("not_member", "You aren't in this town.", 404);

  const { error } = await getSupabaseAdmin()
    .from("league_members")
    .update({ status: "former", left_at: new Date().toISOString(), removed_by: null })
    .eq("league_id", league.id)
    .eq("developer_id", viewer.id);
  if (error) throw dbError("leave_failed", error);
  await removeBuilding(league.id, viewer.id);
  if (league.admin_id === viewer.id) await reassignAdmin(league.id);
  invalidateLeague(league.id);
}

// ─── Invites ────────────────────────────────────────────────

export interface InviteResult {
  login: string;
  status: MemberStatus;
  created_building: boolean;
  link: string;
}

function appBase(origin?: string): string {
  return (origin || process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com").replace(/\/$/, "");
}

/** A personal link: the invitee has an `invited` row, so it needs no token. */
export function inviteLink(slug: string, inviter: string, invitee: string, origin?: string): string {
  return `${appBase(origin)}/town/${slug}?ref=${encodeURIComponent(inviter)}&invite=${encodeURIComponent(invitee)}`;
}

/** The admin's open link: anyone holding it can join until it's rotated. */
export function openInviteLink(slug: string, inviter: string, token: string, origin?: string): string {
  return `${appBase(origin)}/town/${slug}?ref=${encodeURIComponent(inviter)}&t=${encodeURIComponent(token)}`;
}

/** The league's stored invite token (server only), or null. */
export async function getInviteToken(leagueId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin().from("leagues").select("invite_token").eq("id", leagueId).maybeSingle();
  return (data?.invite_token as string | null | undefined) ?? null;
}

/**
 * The admin's invite token. Leagues from before migration 135 have none: the
 * first read generates and stores it (only if still empty, so two tabs agree).
 */
export async function getOrCreateInviteToken(viewer: Viewer, league: League): Promise<string> {
  requireAdmin(viewer, league);
  if (league.kind !== "custom") throw new LeagueError("company_league", "Company towns are joined by verifying.", 400);
  const current = await getInviteToken(league.id);
  if (current) return current;
  const { error } = await getSupabaseAdmin()
    .from("leagues")
    .update({ invite_token: newInviteToken() })
    .eq("id", league.id)
    .is("invite_token", null);
  if (error) throw dbError("token_failed", error);
  const stored = await getInviteToken(league.id);
  if (!stored) throw new LeagueError("token_failed", "Couldn't make an invite link. Try again.", 500);
  return stored;
}

/** New token: every open link shared so far stops working. */
export async function rotateInviteToken(viewer: Viewer, league: League): Promise<string> {
  requireAdmin(viewer, league);
  if (league.kind !== "custom") throw new LeagueError("company_league", "Company towns are joined by verifying.", 400);
  const token = newInviteToken();
  const { error } = await getSupabaseAdmin().from("leagues").update({ invite_token: token }).eq("id", league.id);
  if (error) throw dbError("token_failed", error);
  return token;
}

export async function inviteMember(
  viewer: Viewer,
  league: League,
  rawLogin: string,
  origin?: string,
): Promise<InviteResult> {
  const login = rawLogin.trim().replace(/^@/, "").toLowerCase();
  if (!LOGIN_RE.test(login)) throw new LeagueError("invalid_login", "That isn't a valid GitHub username.");

  const sb = getSupabaseAdmin();
  const me = await getMembership(league.id, viewer.id);
  if (me?.status !== "active") throw new LeagueError("not_member", "Only town members can invite.", 403);

  // Counted before the GitHub lookup, whatever the outcome.
  if (!(await takeQuota(viewer.id, "invite", MAX_INVITES_PER_DAY))) {
    throw new LeagueError("invite_limit", `You can send ${MAX_INVITES_PER_DAY} invites a day. Try again tomorrow.`, 429);
  }

  let createdBuilding = false;
  let { data: dev } = await sb.from("developers").select("id, github_login").eq("github_login", login).maybeSingle();
  if (!dev) {
    try {
      dev = await createDeveloperFromGitHub(login);
      createdBuilding = true;
    } catch (err) {
      if (err instanceof GitHubFetchError) {
        if (err.code === "not_found") throw new LeagueError("not_found", `@${login} doesn't exist on GitHub.`, 404);
        if (err.code === "organization") throw new LeagueError("organization", `@${login} is an organization, not a person.`);
        if (err.code === "rate_limit") throw new LeagueError("rate_limit", "GitHub is busy. Try again in a minute.", 503);
      }
      throw new LeagueError("create_failed", "Couldn't load that GitHub profile. Try again.", 502);
    }
  }

  const existing = await getMembership(league.id, dev.id);
  let status: MemberStatus = existing?.status ?? "invited";
  if (!existing) {
    const { error } = await sb.from("league_members").insert({
      league_id: league.id,
      developer_id: dev.id,
      status: "invited",
      invited_by: viewer.id,
      created_building: createdBuilding,
    });
    if (error) throw dbError("invite_failed", error);
    await autoPlace(league.id, dev.id);
  } else if (existing.status === "former") {
    // A new invite is how a former member comes back; only the admin can undo a removal.
    if (existing.removed_by !== null && league.admin_id !== viewer.id) {
      throw new LeagueError("removed", `The admin removed @${dev.github_login}. Only the admin can invite them back.`, 403);
    }
    const { error } = await sb
      .from("league_members")
      .update({ status: "invited", invited_by: viewer.id, removed_by: null })
      .eq("league_id", league.id)
      .eq("developer_id", dev.id)
      .eq("status", "former");
    if (error) throw dbError("invite_failed", error);
    await autoPlace(league.id, dev.id);
    status = "invited";
  }

  return {
    login: dev.github_login,
    status,
    created_building: createdBuilding,
    link: inviteLink(league.slug, viewer.github_login, dev.github_login, origin),
  };
}

// ─── Admin ──────────────────────────────────────────────────

function requireAdmin(viewer: Viewer, league: League) {
  if (league.admin_id !== viewer.id) throw new LeagueError("not_admin", "Only the town admin can do that.", 403);
}

export async function setScoringMode(viewer: Viewer, league: League, mode: ScoringMode): Promise<void> {
  requireAdmin(viewer, league);
  if (mode !== "xp" && mode !== "contributions") throw new LeagueError("invalid_mode", "Unknown scoring mode.");
  const { error } = await getSupabaseAdmin().from("leagues").update({ scoring_mode: mode }).eq("id", league.id);
  if (error) throw dbError("update_failed", error);
  invalidateLeague(league.id);
}

export async function renameLeague(viewer: Viewer, league: League, rawName: string): Promise<void> {
  requireAdmin(viewer, league);
  // A company league carries its GitHub org's name.
  if (league.kind === "company") throw new LeagueError("company_league", "Company towns keep their org's name.", 403);
  const name = cleanLeagueName(rawName);
  const { error } = await getSupabaseAdmin().from("leagues").update({ name }).eq("id", league.id);
  if (error) throw dbError("update_failed", error);
}

/** Deletes a custom league and everything in it. `confirm` must be the league name. */
export async function deleteLeague(viewer: Viewer, league: League, confirm: string): Promise<void> {
  requireAdmin(viewer, league);
  if (league.kind !== "custom") throw new LeagueError("company_league", "Company towns can't be deleted.", 403);
  if (confirm.trim().toLowerCase() !== league.name.trim().toLowerCase()) {
    throw new LeagueError("confirm_mismatch", "Type the town name to confirm.");
  }
  const { error } = await getSupabaseAdmin().from("leagues").delete().eq("id", league.id);
  if (error) throw dbError("delete_failed", error);
}

/**
 * Admin removes a member: they become former (kept in the hall of fame) and
 * their building leaves the city. removed_by keeps them from rejoining on
 * their own (token link, org verification); a new invite brings them back.
 */
export async function removeMember(viewer: Viewer, league: League, rawLogin: string): Promise<void> {
  requireAdmin(viewer, league);
  const sb = getSupabaseAdmin();
  const { data: target } = await sb
    .from("developers")
    .select("id")
    .eq("github_login", rawLogin.trim().replace(/^@/, "").toLowerCase())
    .maybeSingle();
  if (target?.id === viewer.id) throw new LeagueError("self_remove", "Transfer admin before leaving the town.");
  const m = target ? await getMembership(league.id, target.id) : null;
  if (!target || !m || m.status === "former") throw new LeagueError("not_member", "That developer isn't in this town.", 404);

  const { error } = await sb
    .from("league_members")
    .update({ status: "former", left_at: new Date().toISOString(), removed_by: viewer.id })
    .eq("league_id", league.id)
    .eq("developer_id", target.id);
  if (error) throw dbError("update_failed", error);
  await removeBuilding(league.id, target.id);
  invalidateLeague(league.id);
}

export async function transferAdmin(viewer: Viewer, league: League, toLogin: string): Promise<void> {
  requireAdmin(viewer, league);
  const sb = getSupabaseAdmin();
  const { data: target } = await sb
    .from("developers")
    .select("id")
    .eq("github_login", toLogin.trim().toLowerCase())
    .maybeSingle();
  const m = target ? await getMembership(league.id, target.id) : null;
  if (!target || m?.status !== "active" || (league.kind === "company" && !m.verification)) {
    throw new LeagueError("invalid_target", "The new admin must be an active member.");
  }
  const { error } = await sb.from("leagues").update({ admin_id: target.id }).eq("id", league.id);
  if (error) throw dbError("update_failed", error);
}

/**
 * Hand admin to the most recently active member (verified members only for
 * company leagues). With nobody eligible, the league has no admin until the
 * next member verifies or joins.
 */
export async function reassignAdmin(leagueId: string): Promise<number | null> {
  const sb = getSupabaseAdmin();
  const { data: league } = await sb.from("leagues").select("kind").eq("id", leagueId).single();
  let q = sb
    .from("league_members")
    .select("developer_id, developers!league_members_developer_id_fkey(last_active_at)")
    .eq("league_id", leagueId)
    .eq("status", "active");
  if (league?.kind === "company") q = q.not("verification", "is", null);
  const { data } = await q.returns<{ developer_id: number; developers: { last_active_at: string | null } | null }[]>();

  const best = (data ?? [])
    .map((r) => ({ id: r.developer_id, t: r.developers?.last_active_at ? Date.parse(r.developers.last_active_at) : 0 }))
    .sort((a, b) => b.t - a.t || a.id - b.id)[0];
  const adminId = best?.id ?? null;
  await sb.from("leagues").update({ admin_id: adminId }).eq("id", leagueId);
  return adminId;
}
