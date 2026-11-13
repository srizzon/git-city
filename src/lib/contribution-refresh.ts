import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchCurrentYearBatch, fetchFullContributions } from "@/lib/github-api";
import { evaluateEmblems } from "@/lib/emblems";

// One building's on-demand commit re-sync (the "Refresh" button in the commits
// info). Same math as the refresh-buildings cron: past years are settled, so
// a building with a current-year split only asks GitHub for this year.

// A building synced this recently is returned as is: the button can't be used
// to hammer GitHub, and a second click right after the first changes nothing.
export const REFRESH_COOLDOWN_MS = 60_000;

export interface ContributionStatus {
  login: string;
  contributions: number;
  fetched_at: string | null;
}

export type RefreshResult =
  | { ok: true; status: ContributionStatus; previous: number; refreshed: boolean }
  | { ok: false; error: "not_found" | "github_failed" };

const COLUMNS =
  "id, github_login, contributions, contributions_total, contributions_cy, contributions_cy_year, fetched_at";

interface Row {
  id: number;
  github_login: string;
  contributions: number | null;
  contributions_total: number | null;
  contributions_cy: number | null;
  contributions_cy_year: number | null;
  fetched_at: string | null;
}

const total = (r: Row) => r.contributions_total ?? r.contributions ?? 0;

async function loadRow(login: string): Promise<Row | null> {
  const { data } = await getSupabaseAdmin()
    .from("developers")
    .select(COLUMNS)
    .eq("github_login", login.toLowerCase())
    .maybeSingle();
  return (data as Row | null) ?? null;
}

export async function getContributionStatus(login: string): Promise<ContributionStatus | null> {
  const row = await loadRow(login);
  if (!row) return null;
  return { login: row.github_login, contributions: total(row), fetched_at: row.fetched_at };
}

export async function refreshBuildingContributions(login: string): Promise<RefreshResult> {
  const row = await loadRow(login);
  if (!row) return { ok: false, error: "not_found" };

  const previous = total(row);
  const age = row.fetched_at ? Date.now() - new Date(row.fetched_at).getTime() : Infinity;
  if (age < REFRESH_COOLDOWN_MS) {
    return {
      ok: true,
      status: { login: row.github_login, contributions: previous, fetched_at: row.fetched_at },
      previous,
      refreshed: false,
    };
  }

  const currentYear = new Date().getFullYear();
  const nowIso = new Date().toISOString();
  let fields: Record<string, unknown>;

  if (row.contributions_cy_year === currentYear && row.contributions_total != null) {
    const { results, failed } = await fetchCurrentYearBatch([row.github_login]);
    const fresh = results.get(row.github_login.toLowerCase());
    if (failed || fresh == null) return { ok: false, error: "github_failed" };
    const next = Math.max(0, row.contributions_total - (row.contributions_cy ?? 0) + fresh);
    fields = { contributions: next, contributions_total: next, contributions_cy: fresh, fetched_at: nowIso };
  } else {
    const full = await fetchFullContributions(row.github_login);
    if (!full) return { ok: false, error: "github_failed" };
    fields = {
      contributions: full.contributions_total,
      contributions_total: full.contributions_total,
      contribution_years: full.contribution_years,
      contributions_cy: full.current_year_value,
      contributions_cy_year: full.current_year,
      fetched_at: nowIso,
    };
  }

  const { error } = await getSupabaseAdmin().from("developers").update(fields).eq("id", row.id);
  if (error) return { ok: false, error: "github_failed" };

  const next = fields.contributions_total as number;
  if (next > previous) {
    await evaluateEmblems(
      row.id,
      {
        contributions: next,
        public_repos: 0,
        total_stars: 0,
        referral_count: 0,
        kudos_count: 0,
        gifts_sent: 0,
        gifts_received: 0,
      },
      row.github_login,
    );
  }

  return {
    ok: true,
    status: { login: row.github_login, contributions: next, fetched_at: nowIso },
    previous,
    refreshed: true,
  };
}
