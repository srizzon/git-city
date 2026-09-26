import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { isLocalSupabase } from "@/lib/sign-in";
import { getViewer } from "@/lib/leagues/service";
import { mockOrgs, syncOrgVerifications } from "@/lib/leagues/verification";
import { assertSameOrigin } from "@/lib/leagues/http";
import { normalizeOrgInput } from "@/lib/towns/company-step";

export const dynamic = "force-dynamic";

/** Back to the Company tab of the new town screen, on the org the dev was checking. */
function backTo(request: Request): string {
  const org = normalizeOrgInput(new URL(request.url).searchParams.get("org") ?? "");
  return org ? `/towns/new?kind=company&org=${encodeURIComponent(org)}` : "/towns/new?kind=company";
}

function originOf(request: Request): string {
  return (process.env.PORTLESS_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

// Starts a second GitHub OAuth that asks for read:org. The normal login never
// asks for it. The callback reads the orgs from provider_token (verify=org).
async function start(request: Request) {
  const origin = originOf(request);
  const BACK = backTo(request);
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(`${origin}/api/auth/github?redirect=${encodeURIComponent(BACK)}`);

  // Local Supabase can't produce a provider token: use DEV_MOCK_ORGS.
  if (isLocalSupabase()) {
    await syncOrgVerifications(viewer.id, mockOrgs());
    return NextResponse.redirect(`${origin}${BACK}`);
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      scopes: "read:org",
      redirectTo: `${origin}/auth/callback?verify=org&next=${encodeURIComponent(BACK)}`,
    },
  });
  if (error || !data.url) return NextResponse.redirect(`${origin}${BACK}&error=oauth_failed`);
  return NextResponse.redirect(data.url);
}

export const GET = start;
export async function POST(request: Request) {
  return assertSameOrigin(request) ?? start(request);
}
