import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { provisionDeveloperOnLogin } from "@/lib/auth-provision";
import { githubLoginFromIdentity } from "@/lib/auth-identity";
import { fetchUserOrgs, syncOrgVerifications } from "@/lib/leagues/verification";

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

  // From the GitHub identity GoTrue wrote, never user_metadata (user-editable).
  const githubLogin = githubLoginFromIdentity(data.user);

  // Create/claim the building + XP + rank + feed + achievements + referral.
  // Shared with the local dev-login route (src/app/api/dev/login).
  // ?ref= from the login URL, else the gc_ref cookie set by the proxy on any page.
  const cookieStore = await cookies();
  const ref = searchParams.get("ref") ?? cookieStore.get("gc_ref")?.value ?? null;
  await provisionDeveloperOnLogin(githubLogin, data.user.id, ref);
  cookieStore.delete("gc_ref");

  // Company leagues: provider_token only exists right now. When it carries
  // read:org (the "Verify company" flow, and every later login since GitHub
  // keeps granted scopes), list the orgs and renew. Joining happens only in
  // the verify flow. Never stored, and a failure here never breaks login.
  const providerToken = data.session?.provider_token;
  if (providerToken && githubLogin) {
    try {
      const orgs = await fetchUserOrgs(providerToken);
      if (orgs) {
        const { data: dev } = await getSupabaseAdmin()
          .from("developers")
          .select("id")
          .eq("github_login", githubLogin)
          .eq("claimed_by", data.user.id)
          .maybeSingle();
        if (dev) {
          const { seed } = await syncOrgVerifications(dev.id, orgs, { verify: searchParams.get("verify") === "org" });
          if (seed) after(() => seed().then(() => {}));
        }
      }
    } catch (err) {
      console.error("[auth:callback] org verification failed:", err);
    }
  }

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
        return NextResponse.redirect(`${origin}/?user=${encodeURIComponent(githubLogin)}`);
      }

      return NextResponse.redirect(`${origin}/shop/${encodeURIComponent(githubLogin)}`);
    }

    // General redirect: only allow relative paths.
    // Reject protocol-relative ("//evil.com") and backslash ("/\evil.com")
    // forms, which browsers treat as off-site open redirects.
    if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?user=${encodeURIComponent(githubLogin)}`);
}
