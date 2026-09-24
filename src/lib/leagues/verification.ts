import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ghHeaders, FETCH_TIMEOUT_MS } from "@/lib/github-api";
import { createDeveloperFromGitHub } from "@/lib/create-developer";
import { reassignAdmin, slugify } from "./service";
import { notifyJoined } from "./joined";

// ─── Company league verification ────────────────────────────
// Membership is proven from the OAuth provider_token (read:org) in the auth
// callback, the only moment it exists. The token is never stored; only the
// resulting org list is (developer_orgs). Private verifications last 90 days
// and renew silently on every later login.

export const VERIFICATION_DAYS = 90;
const SEED_LIMIT = 100;
const LOGIN_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/;

export interface VerifiedOrg {
  login: string; // lowercase
  avatar_url: string | null;
}

function verifiedUntil(): string {
  return new Date(Date.now() + VERIFICATION_DAYS * 86_400_000).toISOString();
}

/** Active org memberships (public and private) for the token's user. Null on any failure. */
export async function fetchUserOrgs(providerToken: string): Promise<VerifiedOrg[] | null> {
  try {
    const res = await fetch("https://api.github.com/user/memberships/orgs?state=active&per_page=100", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${providerToken}`,
        "User-Agent": "git-city-app",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { organization?: { login?: string; avatar_url?: string } }[];
    return rows
      .map((r) => r.organization)
      .filter((o): o is { login: string; avatar_url?: string } => !!o?.login)
      .map((o) => ({ login: o.login.toLowerCase(), avatar_url: o.avatar_url ?? null }));
  } catch {
    return null;
  }
}

/** DEV_MOCK_ORGS="acme,globex" stands in for GitHub on a local Supabase. */
export function mockOrgs(): VerifiedOrg[] {
  return (process.env.DEV_MOCK_ORGS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((login) => ({ login, avatar_url: null }));
}

async function activeCompanyLeagueId(devId: number): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("league_members")
    .select("league_id, leagues!inner(kind)")
    .eq("developer_id", devId)
    .eq("status", "active")
    .eq("leagues.kind", "company")
    .limit(1);
  return (data?.[0]?.league_id as string | undefined) ?? null;
}

/**
 * Called from the auth callback with the orgs the token proved.
 *
 * - Stores the org list (for /leagues/verify and later renewals).
 * - Renews the dev's active company membership when its org is still listed.
 * - Otherwise, when the dev has no company league yet, joins the first existing
 *   company league of one of their orgs.
 * - With `verify` (the explicit "Verify company" flow) and a single org that
 *   has no league yet, creates it with this dev as admin.
 */
export async function syncOrgVerifications(
  devId: number,
  orgs: VerifiedOrg[],
  opts: { verify?: boolean } = {},
): Promise<{ joined: string | null; created: string | null; seed: (() => Promise<number>) | null }> {
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();

  await sb.from("developer_orgs").delete().eq("developer_id", devId);
  if (orgs.length > 0) {
    await sb
      .from("developer_orgs")
      .insert(orgs.map((o) => ({ developer_id: devId, org_login: o.login, avatar_url: o.avatar_url, verified_at: now })));
  }
  if (orgs.length === 0) return { joined: null, created: null, seed: null };

  const { data: leagues } = await sb
    .from("leagues")
    .select("id, slug, github_org, admin_id")
    .eq("kind", "company")
    .in("github_org", orgs.map((o) => o.login));

  const currentId = await activeCompanyLeagueId(devId);
  const current = (leagues ?? []).find((l) => l.id === currentId);
  if (current) {
    // Silent renewal. Don't downgrade a public verification.
    await sb
      .from("league_members")
      .update({ verified_until: verifiedUntil() })
      .eq("league_id", current.id)
      .eq("developer_id", devId);
    return { joined: null, created: null, seed: null };
  }
  if (currentId) return { joined: null, created: null, seed: null }; // in a company league whose org isn't listed; the cron decides

  const existing = leagues?.[0];
  if (existing) {
    await joinCompanyLeague(devId, existing.github_org as string, "private");
    return { joined: existing.slug as string, created: null, seed: null };
  }

  if (opts.verify && orgs.length === 1) {
    const { slug, created, seed } = await joinCompanyLeague(devId, orgs[0].login, "private");
    return { joined: slug, created: created ? slug : null, seed };
  }
  return { joined: null, created: null, seed: null };
}

/**
 * Makes the dev an active, verified member of the org's company league,
 * creating the league (and seeding public members) if it doesn't exist.
 * Moving to a new company marks the previous company membership former.
 * Callers must have verified membership first.
 */
export async function joinCompanyLeague(
  devId: number,
  rawOrg: string,
  verification: "public" | "private",
): Promise<{ slug: string; created: boolean; seed: (() => Promise<number>) | null }> {
  const sb = getSupabaseAdmin();
  const org = rawOrg.toLowerCase();
  const now = new Date().toISOString();

  let { data: league } = await sb.from("leagues").select("id, slug, admin_id").eq("github_org", org).maybeSingle();
  let created = false;
  if (!league) {
    const info = await fetchOrgInfo(org);
    const base = slugify(org);
    const { data: clash } = await sb.from("leagues").select("id").eq("slug", base).maybeSingle();
    const slug = clash ? `${base}-${Date.now().toString(36).slice(-4)}` : base;
    const { data: inserted, error } = await sb
      .from("leagues")
      .insert({ slug, name: info?.name || info?.login || org, kind: "company", github_org: org, admin_id: devId, created_by: devId })
      .select("id, slug, admin_id")
      .single();
    if (error || !inserted) {
      // Lost a creation race: use the winner's row.
      const { data: raced } = await sb.from("leagues").select("id, slug, admin_id").eq("github_org", org).single();
      league = raced;
    } else {
      league = inserted;
      created = true;
    }
  }
  if (!league) throw new Error(`Could not create company league for ${org}`);

  const previous = await activeCompanyLeagueId(devId);
  if (previous && previous !== league.id) {
    await sb
      .from("league_members")
      .update({ status: "former", left_at: now })
      .eq("league_id", previous)
      .eq("developer_id", devId);
    const { data: prev } = await sb.from("leagues").select("admin_id").eq("id", previous).single();
    if (prev?.admin_id === devId) await reassignAdmin(previous);
  }

  const { data: row } = await sb
    .from("league_members")
    .select("status, joined_at, invited_by")
    .eq("league_id", league.id)
    .eq("developer_id", devId)
    .maybeSingle();
  await sb.from("league_members").upsert(
    {
      league_id: league.id,
      developer_id: devId,
      status: "active",
      verification,
      verified_until: verifiedUntil(),
      joined_at: row?.status === "active" && row.joined_at ? row.joined_at : now,
      left_at: null,
    },
    { onConflict: "league_id,developer_id" },
  );
  if (!league.admin_id) await sb.from("leagues").update({ admin_id: devId }).eq("id", league.id);
  if (row?.status === "invited") {
    const { data: dev } = await sb.from("developers").select("github_login").eq("id", devId).single();
    if (dev) await notifyJoined(league.id, devId, dev.github_login, row.invited_by);
  }

  const leagueId = league.id as string;
  return {
    slug: league.slug as string,
    created,
    seed: created ? () => seedCompanyLeague(leagueId, org) : null,
  };
}

async function fetchOrgInfo(org: string): Promise<{ login: string; name: string | null } | null> {
  try {
    const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}`, {
      headers: ghHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { login: string; name: string | null };
    return { login: j.login, name: j.name };
  } catch {
    return null;
  }
}

/** Public members of an org (lowercase logins), or null on any GitHub error. */
export async function fetchOrgPublicMembers(org: string, max = 1000): Promise<string[] | null> {
  const out: string[] = [];
  for (let page = 1; out.length < max; page++) {
    try {
      const res = await fetch(
        `https://api.github.com/orgs/${encodeURIComponent(org)}/public_members?per_page=100&page=${page}`,
        { headers: ghHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      );
      if (!res.ok) return null;
      const rows = (await res.json()) as { login: string; type?: string }[];
      for (const r of rows) if (r.type !== "Bot") out.push(r.login.toLowerCase());
      if (rows.length < 100) break;
    } catch {
      return null;
    }
  }
  return out.slice(0, max);
}

/** True when `login` is a public member of `org` (204), false on 404, null on error. */
export async function isPublicOrgMember(org: string, login: string): Promise<boolean | null> {
  if (!LOGIN_RE.test(org) || !LOGIN_RE.test(login)) return false;
  try {
    const res = await fetch(
      `https://api.github.com/orgs/${encodeURIComponent(org)}/public_members/${encodeURIComponent(login)}`,
      { headers: ghHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "manual" },
    );
    if (res.status === 204) return true;
    if (res.status === 404 || res.status === 302) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Seeds a new company league with up to 100 public org members as invited
 * buildings. Missing buildings are created from GitHub data.
 * Runs in after() so the login redirect doesn't wait.
 */
export async function seedCompanyLeague(leagueId: string, org: string): Promise<number> {
  const sb = getSupabaseAdmin();
  const logins = await fetchOrgPublicMembers(org, SEED_LIMIT);
  if (!logins || logins.length === 0) return 0;

  const { data: existing } = await sb.from("developers").select("id, github_login").in("github_login", logins);
  const idByLogin = new Map((existing ?? []).map((d) => [d.github_login as string, d.id as number]));

  const missing = logins.filter((l) => !idByLogin.has(l));
  const deadline = Date.now() + 45_000;
  for (let i = 0; i < missing.length && Date.now() < deadline; i += 4) {
    const results = await Promise.allSettled(missing.slice(i, i + 4).map((l) => createDeveloperFromGitHub(l)));
    for (const r of results) if (r.status === "fulfilled") idByLogin.set(r.value.github_login, r.value.id);
  }

  const rows = [...idByLogin.values()].map((id) => ({ league_id: leagueId, developer_id: id, status: "invited" }));
  if (rows.length === 0) return 0;
  await sb.from("league_members").upsert(rows, { onConflict: "league_id,developer_id", ignoreDuplicates: true });
  return rows.length;
}
