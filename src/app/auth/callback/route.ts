import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { provisionDeveloperOnLogin } from "@/lib/auth-provision";

// Extend timeout for GitHub API calls during login
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { searchParams } = url;
  // Atrás do proxy dev do portless, request.url é o localhost:PORT interno, então
  // os redirects cairiam em https://localhost:PORT (SSL error). PORTLESS_URL é a
  // URL pública https desta worktree; em produção não existe → usa o origin real.
  const origin = (process.env.PORTLESS_URL ?? url.origin).replace(/\/$/, "");
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=no_code`);
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/?error=auth_failed`);
  }

  const githubLogin = (
    data.user.user_metadata.user_name ??
    data.user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  // Create/claim the building + XP + rank + feed + achievements + referral.
  // Shared with the local dev-login route (src/app/api/dev/login).
  await provisionDeveloperOnLogin(githubLogin, data.user.id, searchParams.get("ref"));

  // Support ?next= param for post-login redirect
  const next = searchParams.get("next");
  if (next && githubLogin) {
    // Special case: /shop redirects to /shop/{username}
    if (next === "/shop") {
      const admin = getSupabaseAdmin();
      const { data: dev } = await admin
        .from("developers")
        .select("github_login")
        .eq("github_login", githubLogin)
        .single();

      if (!dev) {
        return NextResponse.redirect(`${origin}/?user=${githubLogin}`);
      }

      return NextResponse.redirect(`${origin}/shop/${githubLogin}`);
    }

    // General redirect: only allow relative paths.
    // Reject protocol-relative ("//evil.com") and backslash ("/\evil.com")
    // forms, which browsers treat as off-site open redirects.
    if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?user=${githubLogin}`);
}
