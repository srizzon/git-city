import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { fetchGitHubDeveloperData, GitHubFetchError } from "@/lib/github-api";
import { calculateGithubXp } from "@/lib/xp";

export const maxDuration = 60;

async function requireAdmin(): Promise<null | NextResponse> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  let body: { username?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username =
    typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const { data: existing } = await sb
    .from("developers")
    .select("*")
    .eq("github_login", username)
    .single();

  if (existing) {
    return NextResponse.json({ ...existing, exists: true, alreadyInCity: true });
  }

  try {
    const data = await fetchGitHubDeveloperData(username, { allowEmpty: true });

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
      .select()
      .single();

    if (createErr || !created) {
      return NextResponse.json(
        { error: createErr?.message ?? "Failed to create developer" },
        { status: 500 },
      );
    }

    await sb.rpc("assign_new_dev_rank", { dev_id: created.id });
    sb.rpc("recalculate_ranks").then(() => {}, () => {});

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

    const { data: withRank } = await sb
      .from("developers")
      .select("*")
      .eq("id", created.id)
      .single();

    revalidatePath(`/dev/${data.github_login}`);
    return NextResponse.json({ ...(withRank ?? created), exists: true });
  } catch (err) {
    if (err instanceof GitHubFetchError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
    return NextResponse.json(
      { error: isTimeout ? "GitHub API timed out. Please try again." : "Failed to fetch GitHub data" },
      { status: isTimeout ? 504 : 500 },
    );
  }
}
