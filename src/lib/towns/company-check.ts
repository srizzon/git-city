import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ghHeaders, FETCH_TIMEOUT_MS } from "@/lib/github-api";
import { fetchOrgPublicMembers, isPublicOrgMember, VERIFICATION_DAYS } from "@/lib/leagues/verification";
import { companyLeagueName } from "@/lib/leagues/names";
import { townDisplayName } from "@/lib/towns/names";
import { SEED_CAP, type OrgAccount, type OrgCheck, type TownStanding } from "./company-step";

/** What GitHub says `login` is, with the org's display name and avatar. */
async function lookupAccount(login: string): Promise<{ account: OrgAccount; name: string | null; avatarUrl: string | null }> {
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
      headers: ghHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 404) return { account: "none", name: null, avatarUrl: null };
    if (!res.ok) return { account: "error", name: null, avatarUrl: null };
    const j = (await res.json()) as { type?: string; name?: string | null; avatar_url?: string | null };
    return {
      account: j.type === "Organization" ? "org" : "user",
      name: j.name ?? null,
      avatarUrl: j.avatar_url ?? null,
    };
  } catch {
    return { account: "error", name: null, avatarUrl: null };
  }
}

/**
 * Everything the Company tab needs about one org for the viewer. Read-only:
 * it never creates or joins a town.
 */
export async function checkCompanyOrg(viewer: { id: number; github_login: string }, org: string): Promise<OrgCheck> {
  const base: OrgCheck = {
    org,
    account: "error",
    townLabel: townDisplayName(org),
    avatarUrl: null,
    proof: null,
    town: null,
    standing: "none",
    otherTown: null,
    colleagues: null,
  };

  const info = await lookupAccount(org);
  if (info.account !== "org") return { ...base, account: info.account };

  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - VERIFICATION_DAYS * 86_400_000).toISOString();
  const [{ data: proofRow }, { data: league }, { data: mine }] = await Promise.all([
    sb
      .from("developer_orgs")
      .select("org_login")
      .eq("developer_id", viewer.id)
      .eq("org_login", org)
      .gte("verified_at", since)
      .maybeSingle(),
    sb.from("leagues").select("id, slug, name").eq("kind", "company").eq("github_org", org).maybeSingle(),
    sb
      .from("league_members")
      .select("league_id, leagues!inner(slug, name, kind)")
      .eq("developer_id", viewer.id)
      .eq("status", "active")
      .eq("leagues.kind", "company")
      .limit(1),
  ]);

  // A private proof from the read:org sign-in wins; otherwise ask the org's public list.
  let proof: OrgCheck["proof"] = proofRow ? "private" : null;
  if (!proof) {
    const pub = await isPublicOrgMember(org, viewer.github_login);
    if (pub === null) return { ...base, account: "error", avatarUrl: info.avatarUrl };
    if (pub) proof = "public";
  }

  let town: OrgCheck["town"] = null;
  let standing: TownStanding = "none";
  if (league) {
    const [{ count }, { data: row }] = await Promise.all([
      sb
        .from("league_members")
        .select("developer_id", { count: "exact", head: true })
        .eq("league_id", league.id)
        .in("status", ["active", "invited"]),
      sb
        .from("league_members")
        .select("status, removed_by")
        .eq("league_id", league.id)
        .eq("developer_id", viewer.id)
        .maybeSingle(),
    ]);
    town = { slug: league.slug as string, name: townDisplayName(league.name as string), buildings: count ?? 0 };
    if (row?.status === "active") standing = "member";
    else if (row?.status === "invited") standing = "invited";
    else if (row?.status === "former" && row.removed_by !== null) standing = "removed";
  }

  const other = (mine?.[0]?.leagues ?? null) as unknown as { slug: string; name: string } | null;
  const otherTown = other ? { slug: other.slug, name: townDisplayName(other.name) } : null;

  // Only worth asking GitHub when the viewer is about to build it.
  let colleagues: number | null = null;
  if (!league && proof) {
    const logins = await fetchOrgPublicMembers(org, SEED_CAP + 1);
    if (logins) colleagues = Math.min(SEED_CAP, logins.filter((l) => l !== viewer.github_login.toLowerCase()).length);
  }

  return {
    org,
    account: "org",
    townLabel: town?.name ?? townDisplayName(companyLeagueName(info.name, org)),
    avatarUrl: info.avatarUrl,
    proof,
    town,
    standing,
    otherTown,
    colleagues,
  };
}
