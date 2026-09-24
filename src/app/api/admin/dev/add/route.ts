import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { GitHubFetchError } from "@/lib/github-api";
import { createDeveloperFromGitHub } from "@/lib/create-developer";

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
    const created = await createDeveloperFromGitHub(username);
    sb.rpc("recalculate_ranks").then(() => {}, () => {});

    const { data: withRank } = await sb
      .from("developers")
      .select("*")
      .eq("id", created.id)
      .single();

    revalidatePath(`/dev/${created.github_login}`);
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
