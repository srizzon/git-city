import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import { getGithubLoginFromUser } from "@/lib/admin";
import { FETCH_TIMEOUT_MS, GitHubFetchError, ghHeaders } from "@/lib/github-api";
import { createDeveloperFromGitHub } from "@/lib/create-developer";
import type { ScoringMode } from "./scoring";
import { notifyJoined } from "./joined";
import { autoPlace, ensureCity, removeBuilding } from "@/lib/league-city/service";
import { cleanLeagueName } from "./names";

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
}

export interface Viewer {
  id: number;
  github_login: string;
  claimed: boolean;
}

export class LeagueError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ─── Limits ─────────────────────────────────────────────────

export const MAX_CUSTOM_LEAGUES = 5;
export const MAX_INVITES_PER_DAY = 10;
export const MAX_LEAGUES_CREATED_PER_DAY = 5;
const LOGIN_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/;

// ─── Viewer ─────────────────────────────────────────────────

/** The signed-in dev (cookie auth), or null. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const login = getGithubLoginFromUser(user);
  if (!user || !login) return null;
  const { data } = await getSupabaseAdmin()
    .from("developers")
    .select("id, github_login, claimed")
    .eq("github_login", login)
    .maybeSingle();
  return (data as Viewer | null) ?? null;
}

// ─── Lookups ────────────────────────────────────────────────

export async function getLeagueBySlug(slug: string): Promise<League | null> {
  const { data } = await getSupabaseAdmin()
    .from("leagues")
    .select("*")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  return (data as League | null) ?? null;
}

async function getMembership(leagueId: string, devId: number) {
  const { data } = await getSupabaseAdmin()
    .from("league_members")
    .select("status, verification, verified_until, invited_by, joined_at")
    .eq("league_id", leagueId)
    .eq("developer_id", devId)
    .maybeSingle();
  return data as
    | { status: MemberStatus; verification: string | null; verified_until: string | null; invited_by: number | null; joined_at: string | null }
    | null;
}

async function countActiveCustomLeagues(devId: number): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from("league_members")
    .select("league_id, leagues!inner(kind)", { count: "exact", head: true })
    .eq("developer_id", devId)
    .eq("status", "active")
    .eq("leagues.kind", "custom");
  return count ?? 0;
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
      .slice(0, 40) || "league"
  );
}

/** True when GitHub has an org with this login (its company league owns /league/<org>). */
async function isGithubOrg(login: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(login)}`, {
      headers: ghHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.status === 200;
  } catch {
    return false;
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
  if ((await countActiveCustomLeagues(viewer.id)) >= MAX_CUSTOM_LEAGUES) {
    throw new LeagueError("limit", `You can be in up to ${MAX_CUSTOM_LEAGUES} custom leagues.`, 403);
  }

  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count: createdToday } = await sb
    .from("leagues")
    .select("id", { count: "exact", head: true })
    .eq("created_by", viewer.id)
    .gte("created_at", since);
  if ((createdToday ?? 0) >= MAX_LEAGUES_CREATED_PER_DAY) {
    throw new LeagueError("create_limit", `You can create ${MAX_LEAGUES_CREATED_PER_DAY} leagues a day. Try again tomorrow.`, 429);
  }

  // /league/<org> stays reserved for the org's company league.
  const base = slugify(name);
  const slug = await uniqueSlug((await isGithubOrg(base)) ? `${base}-league` : base);
  const { data: league, error } = await sb
    .from("leagues")
    .insert({ slug, name, kind: "custom", admin_id: viewer.id, created_by: viewer.id })
    .select("*")
    .single();
  if (error || !league) throw new LeagueError("create_failed", error?.message ?? "Could not create league.", 500);

  await sb.from("league_members").insert({
    league_id: league.id,
    developer_id: viewer.id,
    status: "active",
    joined_at: new Date().toISOString(),
  });
  await ensureCity(league.id).catch((err) => console.error("[league-city] starter city failed", err));
  return league as League;
}

/**
 * Invite-link join for custom leagues. Allowed when the dev was invited, or
 * arrived through a link shared by an active member (`ref`). Company leagues
 * are joined by verifying org membership instead.
 */
export async function joinLeague(viewer: Viewer, league: League, ref: string | null): Promise<MemberStatus> {
  if (league.kind === "company") {
    throw new LeagueError("needs_verification", "Verify your GitHub org membership to join this league.", 403);
  }

  const sb = getSupabaseAdmin();
  const existing = await getMembership(league.id, viewer.id);
  if (existing?.status === "active") return "active";

  let invitedBy = existing?.invited_by ?? null;
  // Former members (left or removed) need a fresh invite, like newcomers.
  if (!existing || existing.status === "former") {
    if (!ref) throw new LeagueError("needs_invite", "You need an invite link to join this league.", 403);
    const { data: referrer } = await sb
      .from("developers")
      .select("id")
      .eq("github_login", ref.toLowerCase())
      .maybeSingle();
    const refMembership = referrer ? await getMembership(league.id, referrer.id) : null;
    if (!referrer || refMembership?.status !== "active") {
      throw new LeagueError("needs_invite", "This invite link is no longer valid.", 403);
    }
    invitedBy = referrer.id;
  }

  if ((await countActiveCustomLeagues(viewer.id)) >= MAX_CUSTOM_LEAGUES) {
    throw new LeagueError("limit", `You can be in up to ${MAX_CUSTOM_LEAGUES} custom leagues.`, 403);
  }

  const { error } = await sb.from("league_members").upsert(
    {
      league_id: league.id,
      developer_id: viewer.id,
      status: "active",
      invited_by: invitedBy,
      joined_at: new Date().toISOString(),
      left_at: null,
    },
    { onConflict: "league_id,developer_id" },
  );
  if (error) throw new LeagueError("join_failed", error.message, 500);
  await autoPlace(league.id, viewer.id);

  if (existing?.status === "invited") await notifyJoined(league.id, viewer.id, viewer.github_login, invitedBy);
  if (!league.admin_id) await reassignAdmin(league.id);
  return "active";
}

// ─── Invites ────────────────────────────────────────────────

export interface InviteResult {
  login: string;
  status: MemberStatus;
  created_building: boolean;
  link: string;
}

export function inviteLink(slug: string, inviter: string, invitee: string, origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com").replace(/\/$/, "");
  return `${base}/league/${slug}?ref=${encodeURIComponent(inviter)}&invite=${encodeURIComponent(invitee)}`;
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
  if (me?.status !== "active") throw new LeagueError("not_member", "Only league members can invite.", 403);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await sb
    .from("league_members")
    .select("developer_id", { count: "exact", head: true })
    .eq("invited_by", viewer.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_INVITES_PER_DAY) {
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
  if (!existing) {
    const { error } = await sb.from("league_members").insert({
      league_id: league.id,
      developer_id: dev.id,
      status: "invited",
      invited_by: viewer.id,
    });
    if (error) throw new LeagueError("invite_failed", error.message, 500);
    await autoPlace(league.id, dev.id);
  }

  return {
    login: dev.github_login,
    status: existing?.status ?? "invited",
    created_building: createdBuilding,
    link: inviteLink(league.slug, viewer.github_login, dev.github_login, origin),
  };
}

// ─── Admin ──────────────────────────────────────────────────

function requireAdmin(viewer: Viewer, league: League) {
  if (league.admin_id !== viewer.id) throw new LeagueError("not_admin", "Only the league admin can do that.", 403);
}

export async function setScoringMode(viewer: Viewer, league: League, mode: ScoringMode): Promise<void> {
  requireAdmin(viewer, league);
  if (mode !== "xp" && mode !== "contributions") throw new LeagueError("invalid_mode", "Unknown scoring mode.");
  const { error } = await getSupabaseAdmin().from("leagues").update({ scoring_mode: mode }).eq("id", league.id);
  if (error) throw new LeagueError("update_failed", error.message, 500);
}

export async function renameLeague(viewer: Viewer, league: League, rawName: string): Promise<void> {
  requireAdmin(viewer, league);
  const name = cleanLeagueName(rawName);
  const { error } = await getSupabaseAdmin().from("leagues").update({ name }).eq("id", league.id);
  if (error) throw new LeagueError("update_failed", error.message, 500);
}

/** Deletes a custom league and everything in it. `confirm` must be the league name. */
export async function deleteLeague(viewer: Viewer, league: League, confirm: string): Promise<void> {
  requireAdmin(viewer, league);
  if (league.kind !== "custom") throw new LeagueError("company_league", "Company leagues can't be deleted.", 403);
  if (confirm.trim().toLowerCase() !== league.name.trim().toLowerCase()) {
    throw new LeagueError("confirm_mismatch", "Type the league name to confirm.");
  }
  const { error } = await getSupabaseAdmin().from("leagues").delete().eq("id", league.id);
  if (error) throw new LeagueError("delete_failed", error.message, 500);
}

/**
 * Admin removes a member: they become former (kept in the hall of fame) and
 * their building leaves the city. In a company league they can come back by
 * verifying again; in a custom league they need a new invite.
 */
export async function removeMember(viewer: Viewer, league: League, rawLogin: string): Promise<void> {
  requireAdmin(viewer, league);
  const sb = getSupabaseAdmin();
  const { data: target } = await sb
    .from("developers")
    .select("id")
    .eq("github_login", rawLogin.trim().replace(/^@/, "").toLowerCase())
    .maybeSingle();
  if (target?.id === viewer.id) throw new LeagueError("self_remove", "Transfer admin before leaving the league.");
  const m = target ? await getMembership(league.id, target.id) : null;
  if (!target || !m || m.status === "former") throw new LeagueError("not_member", "That developer isn't in this league.", 404);

  const { error } = await sb
    .from("league_members")
    .update({ status: "former", left_at: new Date().toISOString() })
    .eq("league_id", league.id)
    .eq("developer_id", target.id);
  if (error) throw new LeagueError("update_failed", error.message, 500);
  await removeBuilding(league.id, target.id);
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
  if (error) throw new LeagueError("update_failed", error.message, 500);
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
