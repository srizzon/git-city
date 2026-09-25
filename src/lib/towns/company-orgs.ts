import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { VERIFICATION_DAYS } from "@/lib/leagues/verification";

/** A GitHub org the dev proved membership of, and its company town if there is one. */
export interface OrgState {
  login: string;
  avatar_url: string | null;
  league: { slug: string; name: string } | null;
  joined: boolean;
}

/** The dev's orgs verified in the last VERIFICATION_DAYS, with each one's town. */
export async function loadOrgStates(devId: number): Promise<OrgState[]> {
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - VERIFICATION_DAYS * 86_400_000).toISOString();
  const { data: rows } = await sb
    .from("developer_orgs")
    .select("org_login, avatar_url")
    .eq("developer_id", devId)
    .gte("verified_at", since)
    .order("org_login");

  const logins = (rows ?? []).map((r) => r.org_login as string);
  const { data: leagues } = logins.length
    ? await sb.from("leagues").select("id, slug, name, github_org").eq("kind", "company").in("github_org", logins)
    : { data: [] as { id: string; slug: string; name: string; github_org: string }[] };
  const { data: mine } = await sb.from("league_members").select("league_id").eq("developer_id", devId).eq("status", "active");
  const activeIds = new Set((mine ?? []).map((m) => m.league_id as string));

  return (rows ?? []).map((r) => {
    const league = (leagues ?? []).find((l) => l.github_org === r.org_login);
    return {
      login: r.org_login as string,
      avatar_url: (r.avatar_url as string | null) ?? null,
      league: league ? { slug: league.slug, name: league.name } : null,
      joined: !!league && activeIds.has(league.id),
    };
  });
}
