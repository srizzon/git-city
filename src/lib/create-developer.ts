import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchGitHubDeveloperData } from "@/lib/github-api";
import { calculateGithubXp } from "@/lib/xp";

/**
 * Creates an unclaimed building from GitHub data: fetch, upsert, GitHub XP and
 * a provisional rank. Does NOT run recalculate_ranks (pg_cron does every 4h;
 * callers that need it right away trigger it themselves).
 *
 * Throws GitHubFetchError (not_found, organization, rate_limit, …) and fetch
 * timeouts; callers map those to responses.
 */
export async function createDeveloperFromGitHub(login: string): Promise<{ id: number; github_login: string }> {
  const sb = getSupabaseAdmin();
  const data = await fetchGitHubDeveloperData(login, { allowEmpty: true });

  const { data: created, error: createErr } = await sb
    .from("developers")
    .upsert(
      {
        ...data,
        fetched_at: new Date().toISOString(),
        claimed: false,
      },
      { onConflict: "github_login" },
    )
    .select("id, github_login")
    .single();

  if (createErr || !created) {
    throw new Error(createErr?.message ?? "Failed to create developer");
  }

  await sb.rpc("assign_new_dev_rank", { dev_id: created.id });

  const xp = calculateGithubXp({
    contributions: data.contributions_total ?? data.contributions,
    total_stars: data.total_stars,
    public_repos: data.public_repos,
    total_prs: data.total_prs ?? 0,
  });
  if (xp > 0) {
    await sb.rpc("grant_xp", { p_developer_id: created.id, p_source: "github", p_amount: xp });
    await sb.from("developers").update({ xp_github: xp }).eq("id", created.id);
  }

  return created;
}
