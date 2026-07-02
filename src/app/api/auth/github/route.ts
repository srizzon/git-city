import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { isLocalSupabase } from "@/lib/sign-in";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { searchParams } = url;
  // Atrás do proxy dev do portless, request.url é o localhost:PORT interno.
  // PORTLESS_URL é a URL pública https da worktree; em produção não existe.
  const origin = (process.env.PORTLESS_URL ?? url.origin).replace(/\/$/, "");
  const redirectPath = searchParams.get("redirect") ?? "/";

  // Local dev has no GitHub OAuth provider configured — use the dev-login.
  if (isLocalSupabase()) {
    const next = redirectPath !== "/" ? `?next=${encodeURIComponent(redirectPath)}` : "";
    return NextResponse.redirect(`${origin}/api/dev/login${next}`);
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/?error=oauth_failed`);
  }

  return NextResponse.redirect(data.url);
}
