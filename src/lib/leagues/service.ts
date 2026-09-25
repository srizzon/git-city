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
import {
  MAX_PENDING_REQUESTS,
  REQUEST_TTL_DAYS,
  isJoinMode,
  joinAction,
  type JoinAction,
  type JoinMode,
  type JoinRequestRow,
} from "@/lib/towns/joining";
import { accountOldEnough } from "@/lib/towns/invites";
import { sendJoinRequestNotification, sendRequestApprovedNotification } from "@/lib/notification-senders/league-requests";
import { sendLeagueInvitedNotification } from "@/lib/notification-senders/league-invited";

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
  /** Custom towns: how newcomers get in (migration 143). */
  join_mode: JoinMode;
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
export const LEAGUE_COLUMNS = "id, slug, name, kind, github_org, scoring_mode, admin_id, created_by, created_at, hidden, join_mode";

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

/** The current slug of a town that used to live at `slug`, or null. */
export async function currentSlugFor(oldSlug: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("league_slug_history")
    .select("leagues!inner(slug)")
    .eq("slug", oldSlug.toLowerCase())
    .maybeSingle();
  return (data as { leagues: { slug: string } } | null)?.leagues.slug ?? null;
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
  // Old addresses stay taken: they redirect to the town that had them.
  const [{ data }, { data: old }] = await Promise.all([
    sb.from("leagues").select("slug").like("slug", `${base}%`),
    sb.from("league_slug_history").select("slug").like("slug", `${base}%`),
  ]);
  const taken = new Set([...(data ?? []), ...(old ?? [])].map((r) => r.slug as string));
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
  const decision = customJoinDecision(existing, tokenOk, league.join_mode === "open");
  if (decision === "active") return "active";
  if (decision === "removed") {
    throw new LeagueError("removed", "The admin removed you from this town. Ask them for a new invite.", 403);
  }
  if (decision === "needs_invite") {
    throw new LeagueError(
      "needs_invite",
      token
        ? "This invite link is no longer valid."
        : league.join_mode === "request"
          ? "Ask the admin to let you in."
          : "You need an invite link to join this town.",
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
      joined_via: decision === "invited" ? "invite" : decision === "token" ? "link" : "open",
    },
    { onConflict: "league_id,developer_id" },
  );
  if (error) throw dbError("join_failed", error);
  await autoPlace(league.id, viewer.id);
  await closeRequest(league.id, viewer.id, null);

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
  /** They have a Git City account, so the invite went to their email too. */
  emailed: boolean;
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
  let { data: dev } = await sb.from("developers").select("id, github_login, claimed").eq("github_login", login).maybeSingle();
  if (!dev) {
    try {
      dev = { ...(await createDeveloperFromGitHub(login)), claimed: false };
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
  const fresh = !existing || existing.status === "former";
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

  // Only devs who signed in once have an email on file; everyone else gets the link from the inviter.
  const emailed = fresh && !createdBuilding && dev.claimed === true;
  if (emailed) {
    sendLeagueInvitedNotification({
      inviteeId: dev.id,
      inviterLogin: viewer.github_login,
      leagueId: league.id,
      leagueName: league.name,
      link: inviteLink(league.slug, viewer.github_login, dev.github_login),
    });
  }

  return {
    login: dev.github_login,
    status,
    created_building: createdBuilding,
    emailed,
    link: inviteLink(league.slug, viewer.github_login, dev.github_login, origin),
  };
}

// ─── Join requests ──────────────────────────────────────────

const REQUEST_TTL_MS = REQUEST_TTL_DAYS * 86_400_000;

async function getRequest(leagueId: string, devId: number): Promise<JoinRequestRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("league_join_requests")
    .select("status, created_at")
    .eq("league_id", leagueId)
    .eq("developer_id", devId)
    .maybeSingle();
  return (data as JoinRequestRow | null) ?? null;
}

/** A pending request ends as approved (joined some other way too) or cancelled. */
async function closeRequest(leagueId: string, devId: number, decidedBy: number | null, status: "approved" | "cancelled" = "approved") {
  await getSupabaseAdmin()
    .from("league_join_requests")
    .update({ status, decided_at: new Date().toISOString(), decided_by: decidedBy })
    .eq("league_id", leagueId)
    .eq("developer_id", devId)
    .eq("status", "pending");
}

/** What the town page offers this viewer: join, ask, a pending request, verify, or nothing. */
export async function getJoinAction(league: League, viewer: Viewer | null, tokenOk: boolean): Promise<JoinAction> {
  const [membership, request] = viewer
    ? await Promise.all([getMembership(league.id, viewer.id), getRequest(league.id, viewer.id)])
    : [null, null];
  return joinAction({
    kind: league.kind,
    mode: league.join_mode,
    membership: membership ? { status: membership.status, removed_by: membership.removed_by } : null,
    tokenOk,
    request,
  });
}

/**
 * Asks to join a town in request mode. Needs a 30+ day old GitHub account;
 * a dev has at most 5 live requests. The admin gets an email.
 */
export async function requestJoin(viewer: Viewer, league: League): Promise<"pending"> {
  if (league.kind === "company") {
    throw new LeagueError("needs_verification", "Verify your GitHub org membership to join this town.", 403);
  }
  if (league.join_mode !== "request") {
    throw new LeagueError(
      "not_requestable",
      league.join_mode === "open" ? "This town is open: just join." : "This town is invite only.",
      400,
    );
  }
  const sb = getSupabaseAdmin();
  const m = await getMembership(league.id, viewer.id);
  if (m?.status === "active" || m?.status === "invited") {
    throw new LeagueError("already_member", "You're already in this town. Open your invite to join.", 400);
  }
  if (m?.status === "former" && m.removed_by !== null) {
    throw new LeagueError("removed", "The admin removed you from this town. Ask them for a new invite.", 403);
  }

  const { data: dev } = await sb.from("developers").select("account_created_at").eq("id", viewer.id).single();
  if (!accountOldEnough(dev?.account_created_at as string | null | undefined)) {
    throw new LeagueError("account_too_new", "Your GitHub account needs to be at least 30 days old to ask.", 403);
  }

  const { data, error } = await sb.rpc("league_request_join", {
    p_league_id: league.id,
    p_dev_id: viewer.id,
    p_max_pending: MAX_PENDING_REQUESTS,
    p_ttl: `${REQUEST_TTL_DAYS} days`,
  });
  if (error) throw dbError("request_failed", error);
  if (data === "limit") {
    throw new LeagueError(
      "request_limit",
      `You can have ${MAX_PENDING_REQUESTS} requests open at once. Wait for an answer or cancel one.`,
      429,
    );
  }
  if (data === "requested" && league.admin_id) {
    sendJoinRequestNotification({
      adminId: league.admin_id,
      requesterId: viewer.id,
      requesterLogin: viewer.github_login,
      leagueId: league.id,
      leagueSlug: league.slug,
      leagueName: league.name,
    });
  }
  return "pending";
}

export async function cancelJoinRequest(viewer: Viewer, league: League): Promise<void> {
  await closeRequest(league.id, viewer.id, viewer.id, "cancelled");
}

export interface JoinRequest {
  login: string;
  name: string | null;
  avatar_url: string | null;
  contributions: number;
  account_created_at: string | null;
  created_at: string;
}

/** Live pending requests, oldest first. */
export async function listJoinRequests(viewer: Viewer, league: League): Promise<JoinRequest[]> {
  requireAdmin(viewer, league);
  const { data } = await getSupabaseAdmin()
    .from("league_join_requests")
    .select(
      "created_at, developers!league_join_requests_developer_id_fkey(github_login, name, avatar_url, contributions, account_created_at)",
    )
    .eq("league_id", league.id)
    .eq("status", "pending")
    .gt("created_at", new Date(Date.now() - REQUEST_TTL_MS).toISOString())
    .order("created_at")
    .limit(200)
    .returns<
      {
        created_at: string;
        developers: {
          github_login: string;
          name: string | null;
          avatar_url: string | null;
          contributions: number;
          account_created_at: string | null;
        } | null;
      }[]
    >();
  return (data ?? []).flatMap((r) =>
    r.developers
      ? [
          {
            login: r.developers.github_login,
            name: r.developers.name,
            avatar_url: r.developers.avatar_url,
            contributions: r.developers.contributions,
            account_created_at: r.developers.account_created_at,
            created_at: r.created_at,
          },
        ]
      : [],
  );
}

/** Live pending requests for the admin's HUD badge. */
export async function countJoinRequests(leagueId: string): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from("league_join_requests")
    .select("developer_id", { count: "exact", head: true })
    .eq("league_id", leagueId)
    .eq("status", "pending")
    .gt("created_at", new Date(Date.now() - REQUEST_TTL_MS).toISOString());
  return count ?? 0;
}

/**
 * Approve: the requester becomes an active member (their building moves in)
 * and gets an email. Decline: nothing tells the requester; the request just
 * never turns into a membership.
 */
export async function decideJoinRequest(viewer: Viewer, league: League, rawLogin: string, approve: boolean): Promise<void> {
  requireAdmin(viewer, league);
  const sb = getSupabaseAdmin();
  const login = rawLogin.trim().replace(/^@/, "").toLowerCase();
  const { data: dev } = await sb.from("developers").select("id, github_login").eq("github_login", login).maybeSingle();
  const request = dev ? await getRequest(league.id, dev.id) : null;
  if (!dev || request?.status !== "pending" || Date.now() - new Date(request.created_at).getTime() >= REQUEST_TTL_MS) {
    throw new LeagueError("request_gone", "That request is no longer open.", 404);
  }

  if (!approve) {
    const { error } = await sb
      .from("league_join_requests")
      .update({ status: "declined", decided_at: new Date().toISOString(), decided_by: viewer.id })
      .eq("league_id", league.id)
      .eq("developer_id", dev.id)
      .eq("status", "pending");
    if (error) throw dbError("decide_failed", error);
    return;
  }

  const existing = await getMembership(league.id, dev.id);
  if (existing?.status !== "active") {
    if (!(await takeQuota(dev.id, "membership", MAX_CUSTOM_LEAGUES))) {
      throw new LeagueError("limit", `@${dev.github_login} is already in ${MAX_CUSTOM_LEAGUES} custom towns.`, 403);
    }
    const { error } = await sb.from("league_members").upsert(
      {
        league_id: league.id,
        developer_id: dev.id,
        status: "active",
        invited_by: existing?.invited_by ?? null,
        joined_at: new Date().toISOString(),
        left_at: null,
        removed_by: null,
        joined_via: "request",
      },
      { onConflict: "league_id,developer_id" },
    );
    if (error) throw dbError("join_failed", error);
    await autoPlace(league.id, dev.id);
  }
  await closeRequest(league.id, dev.id, viewer.id);
  sendRequestApprovedNotification({
    developerId: dev.id,
    adminLogin: viewer.github_login,
    leagueSlug: league.slug,
    leagueName: league.name,
  });
  invalidateLeague(league.id);
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

export async function setJoinMode(viewer: Viewer, league: League, mode: unknown): Promise<void> {
  requireAdmin(viewer, league);
  if (league.kind !== "custom") throw new LeagueError("company_league", "Company towns are joined by verifying.", 400);
  if (!isJoinMode(mode)) throw new LeagueError("invalid_mode", "Unknown join setting.");
  const { error } = await getSupabaseAdmin().from("leagues").update({ join_mode: mode }).eq("id", league.id);
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
